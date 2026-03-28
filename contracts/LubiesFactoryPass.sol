// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title LubiesFactoryPass
 * @author Lubies
 * @notice Custom ERC721A extension for the Lubies Factory Pass collection.
 *
 *   Architecture:
 *     Contract (this file)     — ownership, mint, access tiers, freeze
 *     Metadata layer (offchain) — deterministic JSON per tokenId
 *     Render layer   (offchain) — deterministic SVG/PNG per tokenId
 *
 *   Key design choices:
 *     • ERC721A for efficient batch minting
 *     • AccessControl for multi-role team operations
 *     • Lean onchain state — visual inputs stay offchain
 *     • Reveal + freeze flow for collector trust
 *     • Controlled dynamics: status/tier updates with full event trail
 */
contract LubiesFactoryPass is ERC721A, AccessControl, ReentrancyGuard, Pausable, ERC2981 {
    using Strings for uint256;

    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant MINTER_ROLE        = keccak256("MINTER_ROLE");
    bytes32 public constant METADATA_ROLE      = keccak256("METADATA_ROLE");
    bytes32 public constant STATUS_MANAGER_ROLE = keccak256("STATUS_MANAGER_ROLE");
    bytes32 public constant FREEZE_MANAGER_ROLE = keccak256("FREEZE_MANAGER_ROLE");

    // =========================================================================
    // Access Tier constants
    // =========================================================================

    uint8 public constant TIER_STANDARD = 0;
    uint8 public constant TIER_BUILDER  = 1;
    uint8 public constant TIER_PARTNER  = 2;
    uint8 public constant TIER_GENESIS  = 3;
    uint8 public constant TIER_SPECIAL  = 4;

    // =========================================================================
    // Pass Status constants
    // =========================================================================

    uint8 public constant STATUS_PENDING  = 0;
    uint8 public constant STATUS_ENABLED  = 1;
    uint8 public constant STATUS_DISABLED = 2;
    uint8 public constant STATUS_UPGRADED = 3;
    uint8 public constant STATUS_REVOKED  = 4;

    // =========================================================================
    // Data Types
    // =========================================================================

    /**
     * @notice Per-token pass state. Deliberately minimal.
     *         Visual rendering inputs (palette, pattern mode, silhouette) live offchain
     *         and are derived deterministically from tokenId + this state.
     */
    struct PassData {
        uint8 accessTier;
        uint8 status;
        bool premium;
        bool lanyard;
        bool genesis;
        bool frozen;
    }

    // =========================================================================
    // Immutable supply config
    // =========================================================================

    uint256 public immutable maxSupply;
    uint256 public immutable genesisSupply;

    // =========================================================================
    // Mint config (mutable until frozen)
    // =========================================================================

    uint256 public mintPrice;
    uint256 public allowlistPrice;
    uint256 public maxPerWallet;
    uint256 public maxPerAllowlist;

    bool public publicMintEnabled;
    bool public allowlistMintEnabled;

    bytes32 public merkleRoot;

    // =========================================================================
    // Metadata state
    // =========================================================================

    bool private _revealed;
    bool private _metadataFrozen;

    string private _baseTokenURI;
    string private _unrevealedURI;
    string private _contractURI;

    mapping(uint256 => string)   private _tokenURIOverrides;
    mapping(uint256 => PassData) private _passData;
    mapping(address => uint256)  public  allowlistClaimed;

    // =========================================================================
    // Events
    // =========================================================================

    event BaseURIUpdated(string newBaseURI);
    event UnrevealedURIUpdated(string newURI);
    event ContractURIUpdated(string newURI);
    event CollectionRevealed();
    event MetadataFrozen();
    event TokenFrozen(uint256 indexed tokenId);
    event TokenURIOverrideSet(uint256 indexed tokenId, string uri);

    event PassStatusUpdated(uint256 indexed tokenId, uint8 oldStatus, uint8 newStatus);
    event AccessTierUpdated(uint256 indexed tokenId, uint8 oldTier,   uint8 newTier);
    event PassFlagsUpdated(uint256 indexed tokenId, bool premium, bool lanyard, bool genesis);

    event MintPriceUpdated(uint256 newPrice);
    event AllowlistPriceUpdated(uint256 newPrice);
    event MerkleRootUpdated(bytes32 newRoot);
    event MaxPerWalletUpdated(uint256 newMax);
    event MaxPerAllowlistUpdated(uint256 newMax);
    event PublicMintStateUpdated(bool enabled);
    event AllowlistMintStateUpdated(bool enabled);
    event RoyaltyUpdated(address receiver, uint96 basisPoints);

    // =========================================================================
    // Errors
    // =========================================================================

    error ExceedsMaxSupply();
    error ExceedsWalletLimit();
    error ExceedsAllowlistLimit();
    error InsufficientPayment();
    error PublicMintNotActive();
    error AllowlistMintNotActive();
    error InvalidMerkleProof();
    error MetadataIsFrozen();
    error TokenIsFrozen();
    error TokenDoesNotExist();
    error InvalidQuantity();
    error InvalidTier();
    error InvalidStatus();
    error WithdrawFailed();
    error ZeroAddress();

    // =========================================================================
    // Constructor
    // =========================================================================

    /**
     * @param name_              Collection name.
     * @param symbol_            Collection symbol.
     * @param maxSupply_         Hard cap on total tokens.
     * @param genesisSupply_     First N tokens auto-flagged as genesis tier.
     * @param unrevealedURI_     URI returned for all tokens before reveal.
     * @param royaltyReceiver_   ERC2981 royalty receiver.
     * @param royaltyBasisPoints ERC2981 royalty in basis points (e.g. 500 = 5%).
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        uint256 genesisSupply_,
        string memory unrevealedURI_,
        address royaltyReceiver_,
        uint96 royaltyBasisPoints
    ) ERC721A(name_, symbol_) {
        if (genesisSupply_ > maxSupply_) revert ExceedsMaxSupply();

        maxSupply     = maxSupply_;
        genesisSupply = genesisSupply_;
        _unrevealedURI = unrevealedURI_;

        maxPerWallet    = 5;
        maxPerAllowlist = 2;

        _grantRole(DEFAULT_ADMIN_ROLE,  msg.sender);
        _grantRole(MINTER_ROLE,         msg.sender);
        _grantRole(METADATA_ROLE,       msg.sender);
        _grantRole(STATUS_MANAGER_ROLE, msg.sender);
        _grantRole(FREEZE_MANAGER_ROLE, msg.sender);

        if (royaltyReceiver_ != address(0)) {
            _setDefaultRoyalty(royaltyReceiver_, royaltyBasisPoints);
        }
    }

    // =========================================================================
    // Token ID starts at 1
    // =========================================================================

    function _startTokenId() internal pure override returns (uint256) {
        return 1;
    }

    // =========================================================================
    // Mint — Public
    // =========================================================================

    /**
     * @notice Mint during public sale.
     * @param quantity Number of passes to mint (min 1).
     */
    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        if (!publicMintEnabled)                     revert PublicMintNotActive();
        if (quantity == 0)                           revert InvalidQuantity();
        if (_totalMinted() + quantity > maxSupply)  revert ExceedsMaxSupply();
        if (_numberMinted(msg.sender) + quantity > maxPerWallet) revert ExceedsWalletLimit();
        if (msg.value < mintPrice * quantity)        revert InsufficientPayment();

        uint256 startId = _nextTokenId();
        _safeMint(msg.sender, quantity);
        _initializePassData(startId, quantity);
    }

    // =========================================================================
    // Mint — Allowlist
    // =========================================================================

    /**
     * @notice Mint during allowlist phase (Merkle proof gated).
     * @param quantity Number of passes to mint.
     * @param proof    Merkle proof for msg.sender.
     */
    function allowlistMint(uint256 quantity, bytes32[] calldata proof)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        if (!allowlistMintEnabled)                  revert AllowlistMintNotActive();
        if (quantity == 0)                           revert InvalidQuantity();
        if (_totalMinted() + quantity > maxSupply)  revert ExceedsMaxSupply();
        if (!_verifyProof(msg.sender, proof))        revert InvalidMerkleProof();
        if (allowlistClaimed[msg.sender] + quantity > maxPerAllowlist) revert ExceedsAllowlistLimit();
        if (msg.value < allowlistPrice * quantity)   revert InsufficientPayment();

        allowlistClaimed[msg.sender] += quantity;

        uint256 startId = _nextTokenId();
        _safeMint(msg.sender, quantity);
        _initializePassData(startId, quantity);
    }

    // =========================================================================
    // Mint — Admin
    // =========================================================================

    /**
     * @notice Admin mint — no price, no wallet cap.
     * @param to       Recipient address.
     * @param quantity Number of passes to mint.
     */
    function adminMint(address to, uint256 quantity)
        external
        nonReentrant
        onlyRole(MINTER_ROLE)
    {
        if (to == address(0))                       revert ZeroAddress();
        if (quantity == 0)                           revert InvalidQuantity();
        if (_totalMinted() + quantity > maxSupply)  revert ExceedsMaxSupply();

        uint256 startId = _nextTokenId();
        _safeMint(to, quantity);
        _initializePassData(startId, quantity);
    }

    // =========================================================================
    // Pass Data Initialization
    // =========================================================================

    /**
     * @dev Called after every mint to set initial PassData for each new token.
     *      Tokens within the genesis tranche get TIER_GENESIS and genesis=true.
     */
    function _initializePassData(uint256 startId, uint256 quantity) internal {
        for (uint256 i = 0; i < quantity; ) {
            uint256 tokenId = startId + i;
            PassData storage pd = _passData[tokenId];
            pd.status = STATUS_PENDING;

            if (tokenId <= genesisSupply) {
                pd.accessTier = TIER_GENESIS;
                pd.genesis    = true;
            } else {
                pd.accessTier = TIER_STANDARD;
            }

            unchecked { ++i; }
        }
    }

    // =========================================================================
    // Token URI
    // =========================================================================

    /**
     * @notice Returns the metadata URI for a token.
     *   1. Reverts if token does not exist.
     *   2. Returns unrevealedURI if collection is not yet revealed.
     *   3. Returns per-token override URI if one is set.
     *   4. Returns baseURI + tokenId + ".json".
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();

        if (!_revealed) {
            return _unrevealedURI;
        }

        bytes memory override_ = bytes(_tokenURIOverrides[tokenId]);
        if (override_.length > 0) {
            return _tokenURIOverrides[tokenId];
        }

        return string(abi.encodePacked(_baseTokenURI, tokenId.toString(), ".json"));
    }

    /**
     * @notice Returns the contract-level metadata URI (OpenSea storefront standard).
     */
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    // =========================================================================
    // Metadata Admin
    // =========================================================================

    function setBaseURI(string calldata newBaseURI) external onlyRole(METADATA_ROLE) {
        if (_metadataFrozen) revert MetadataIsFrozen();
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function setUnrevealedURI(string calldata newURI) external onlyRole(METADATA_ROLE) {
        if (_metadataFrozen) revert MetadataIsFrozen();
        _unrevealedURI = newURI;
        emit UnrevealedURIUpdated(newURI);
    }

    function setTokenURIOverride(uint256 tokenId, string calldata uri)
        external
        onlyRole(METADATA_ROLE)
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        if (_passData[tokenId].frozen) revert TokenIsFrozen();
        if (_metadataFrozen) revert MetadataIsFrozen();
        _tokenURIOverrides[tokenId] = uri;
        emit TokenURIOverrideSet(tokenId, uri);
    }

    function setContractURI(string calldata newURI) external onlyRole(METADATA_ROLE) {
        _contractURI = newURI;
        emit ContractURIUpdated(newURI);
    }

    function revealCollection() external onlyRole(METADATA_ROLE) {
        if (_metadataFrozen) revert MetadataIsFrozen();
        _revealed = true;
        emit CollectionRevealed();
    }

    // =========================================================================
    // Freeze
    // =========================================================================

    /**
     * @notice Permanently freeze all collection metadata.
     *         Cannot be undone. Prevents any future URI changes.
     */
    function freezeMetadata() external onlyRole(FREEZE_MANAGER_ROLE) {
        _metadataFrozen = true;
        emit MetadataFrozen();
    }

    /**
     * @notice Permanently freeze a single token's PassData and URI override.
     *         After freeze, pass state and URI override cannot change.
     */
    function freezeToken(uint256 tokenId) external onlyRole(FREEZE_MANAGER_ROLE) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        _passData[tokenId].frozen = true;
        emit TokenFrozen(tokenId);
    }

    // =========================================================================
    // Pass State — Status Manager
    // =========================================================================

    /**
     * @notice Update a token's pass status.
     *         Token must not be frozen. Emits PassStatusUpdated.
     */
    function setPassStatus(uint256 tokenId, uint8 newStatus)
        external
        onlyRole(STATUS_MANAGER_ROLE)
    {
        if (!_exists(tokenId))           revert TokenDoesNotExist();
        if (_passData[tokenId].frozen)   revert TokenIsFrozen();
        if (newStatus > STATUS_REVOKED)  revert InvalidStatus();

        uint8 old = _passData[tokenId].status;
        _passData[tokenId].status = newStatus;
        emit PassStatusUpdated(tokenId, old, newStatus);
    }

    /**
     * @notice Update a token's access tier.
     *         Token must not be frozen. Emits AccessTierUpdated.
     */
    function setAccessTier(uint256 tokenId, uint8 newTier)
        external
        onlyRole(STATUS_MANAGER_ROLE)
    {
        if (!_exists(tokenId))          revert TokenDoesNotExist();
        if (_passData[tokenId].frozen)  revert TokenIsFrozen();
        if (newTier > TIER_SPECIAL)     revert InvalidTier();

        uint8 old = _passData[tokenId].accessTier;
        _passData[tokenId].accessTier = newTier;
        emit AccessTierUpdated(tokenId, old, newTier);
    }

    /**
     * @notice Update a token's boolean pass flags.
     *         Token must not be frozen. Emits PassFlagsUpdated.
     */
    function setPassFlags(uint256 tokenId, bool premium, bool lanyard, bool genesis)
        external
        onlyRole(STATUS_MANAGER_ROLE)
    {
        if (!_exists(tokenId))          revert TokenDoesNotExist();
        if (_passData[tokenId].frozen)  revert TokenIsFrozen();

        PassData storage pd = _passData[tokenId];
        pd.premium = premium;
        pd.lanyard = lanyard;
        pd.genesis  = genesis;
        emit PassFlagsUpdated(tokenId, premium, lanyard, genesis);
    }

    // =========================================================================
    // Mint Config — Admin
    // =========================================================================

    function setMintPrice(uint256 newPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        mintPrice = newPrice;
        emit MintPriceUpdated(newPrice);
    }

    function setAllowlistPrice(uint256 newPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowlistPrice = newPrice;
        emit AllowlistPriceUpdated(newPrice);
    }

    function setMerkleRoot(bytes32 newRoot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        merkleRoot = newRoot;
        emit MerkleRootUpdated(newRoot);
    }

    function setMaxPerWallet(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPerWallet = newMax;
        emit MaxPerWalletUpdated(newMax);
    }

    function setMaxPerAllowlist(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPerAllowlist = newMax;
        emit MaxPerAllowlistUpdated(newMax);
    }

    function setPublicMintEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        publicMintEnabled = enabled;
        emit PublicMintStateUpdated(enabled);
    }

    function setAllowlistMintEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowlistMintEnabled = enabled;
        emit AllowlistMintStateUpdated(enabled);
    }

    // =========================================================================
    // Royalty — Admin
    // =========================================================================

    function setRoyalty(address receiver, uint96 basisPoints)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (receiver == address(0)) revert ZeroAddress();
        _setDefaultRoyalty(receiver, basisPoints);
        emit RoyaltyUpdated(receiver, basisPoints);
    }

    // =========================================================================
    // Pause — Admin
    // =========================================================================

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // =========================================================================
    // Withdraw — Admin
    // =========================================================================

    function withdraw() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        (bool ok, ) = msg.sender.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getPassData(uint256 tokenId) external view returns (PassData memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return _passData[tokenId];
    }

    function isRevealed() external view returns (bool) {
        return _revealed;
    }

    function isMetadataFrozen() external view returns (bool) {
        return _metadataFrozen;
    }

    function totalMinted() external view returns (uint256) {
        return _totalMinted();
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    function _verifyProof(address account, bytes32[] calldata proof)
        internal
        view
        returns (bool)
    {
        bytes32 leaf = keccak256(abi.encodePacked(account));
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }

    // =========================================================================
    // Pausable hook — blocks transfers while paused
    // =========================================================================

    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId_,
        uint256 quantity
    ) internal override whenNotPaused {
        super._beforeTokenTransfers(from, to, startTokenId_, quantity);
    }

    // =========================================================================
    // supportsInterface
    // =========================================================================

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721A, AccessControl, ERC2981)
        returns (bool)
    {
        return ERC721A.supportsInterface(interfaceId)
            || AccessControl.supportsInterface(interfaceId)
            || ERC2981.supportsInterface(interfaceId);
    }
}
