// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ILubiesFactoryPass
 * @notice Interface for the Lubies Factory Pass ERC721A NFT contract.
 *         Defines all public/external functions and data types for the
 *         brand-locked identity and utility pass collection.
 */
interface ILubiesFactoryPass {
    // =========================================================================
    // Data Types
    // =========================================================================

    /**
     * @notice Per-token pass state stored onchain.
     *         Kept minimal — visual rendering inputs live offchain.
     */
    struct PassData {
        uint8 accessTier;  // See AccessTier constants
        uint8 status;      // See PassStatus constants
        bool premium;      // Premium finish flag
        bool lanyard;      // Lanyard presence flag
        bool genesis;      // Genesis edition flag
        bool frozen;       // Token-level metadata freeze
    }

    // =========================================================================
    // Constants — Access Tier
    // =========================================================================

    function TIER_STANDARD() external view returns (uint8);
    function TIER_BUILDER()  external view returns (uint8);
    function TIER_PARTNER()  external view returns (uint8);
    function TIER_GENESIS()  external view returns (uint8);
    function TIER_SPECIAL()  external view returns (uint8);

    // =========================================================================
    // Constants — Pass Status
    // =========================================================================

    function STATUS_PENDING()  external view returns (uint8);
    function STATUS_ENABLED()  external view returns (uint8);
    function STATUS_DISABLED() external view returns (uint8);
    function STATUS_UPGRADED() external view returns (uint8);
    function STATUS_REVOKED()  external view returns (uint8);

    // =========================================================================
    // Events
    // =========================================================================

    event BaseURIUpdated(string newBaseURI);
    event UnrevealedURIUpdated(string newURI);
    event CollectionRevealed();
    event MetadataFrozen();
    event TokenFrozen(uint256 indexed tokenId);
    event TokenURIOverrideSet(uint256 indexed tokenId, string uri);

    event PassStatusUpdated(uint256 indexed tokenId, uint8 oldStatus, uint8 newStatus);
    event AccessTierUpdated(uint256 indexed tokenId, uint8 oldTier, uint8 newTier);
    event PassFlagsUpdated(uint256 indexed tokenId, bool premium, bool lanyard, bool genesis);

    event MintPriceUpdated(uint256 newPrice);
    event AllowlistPriceUpdated(uint256 newPrice);
    event MerkleRootUpdated(bytes32 newRoot);
    event MaxPerWalletUpdated(uint256 newMax);
    event PublicMintStateUpdated(bool enabled);
    event AllowlistMintStateUpdated(bool enabled);
    event RoyaltyUpdated(address receiver, uint96 basisPoints);

    // =========================================================================
    // Mint Functions
    // =========================================================================

    /**
     * @notice Mint passes via public sale.
     * @param quantity Number of passes to mint.
     */
    function mint(uint256 quantity) external payable;

    /**
     * @notice Mint passes for allowlist members (Merkle proof gated).
     * @param quantity Number of passes to mint.
     * @param proof   Merkle proof for the caller's address.
     */
    function allowlistMint(uint256 quantity, bytes32[] calldata proof) external payable;

    /**
     * @notice Admin-only mint. No price, no wallet cap.
     * @param to       Recipient address.
     * @param quantity Number of passes to mint.
     */
    function adminMint(address to, uint256 quantity) external;

    // =========================================================================
    // Metadata Functions
    // =========================================================================

    /**
     * @notice Returns the token URI for `tokenId`.
     *         Returns unrevealedURI before reveal.
     *         Returns per-token override URI if set.
     *         Otherwise returns baseURI + tokenId + ".json".
     */
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /**
     * @notice Returns the contract-level metadata URI.
     */
    function contractURI() external view returns (string memory);

    /**
     * @notice Set the base URI for revealed metadata.
     * @param newBaseURI New base URI (should end in /).
     */
    function setBaseURI(string calldata newBaseURI) external;

    /**
     * @notice Set the URI returned for all tokens before reveal.
     * @param newURI New unrevealed URI.
     */
    function setUnrevealedURI(string calldata newURI) external;

    /**
     * @notice Set a per-token URI override (for special tokens).
     * @param tokenId Token to override.
     * @param uri     Full URI to return for this token.
     */
    function setTokenURIOverride(uint256 tokenId, string calldata uri) external;

    /**
     * @notice Set the contract-level metadata URI.
     * @param newURI New contract URI.
     */
    function setContractURI(string calldata newURI) external;

    /**
     * @notice Reveal the collection — after this, tokenURI returns baseURI + tokenId.
     */
    function revealCollection() external;

    /**
     * @notice Permanently freeze all collection metadata.
     *         After this, base URI and unrevealed URI cannot change.
     */
    function freezeMetadata() external;

    /**
     * @notice Permanently freeze a specific token's metadata state.
     * @param tokenId Token to freeze.
     */
    function freezeToken(uint256 tokenId) external;

    // =========================================================================
    // Pass State Functions
    // =========================================================================

    /**
     * @notice Update a token's pass status.
     * @param tokenId   Token to update.
     * @param newStatus New status value.
     */
    function setPassStatus(uint256 tokenId, uint8 newStatus) external;

    /**
     * @notice Update a token's access tier.
     * @param tokenId Token to update.
     * @param newTier New tier value.
     */
    function setAccessTier(uint256 tokenId, uint8 newTier) external;

    /**
     * @notice Update a token's boolean flags.
     * @param tokenId Token to update.
     * @param premium  Premium finish flag.
     * @param lanyard  Lanyard presence flag.
     * @param genesis  Genesis edition flag.
     */
    function setPassFlags(uint256 tokenId, bool premium, bool lanyard, bool genesis) external;

    // =========================================================================
    // Mint Config Functions
    // =========================================================================

    function setMintPrice(uint256 newPrice) external;
    function setAllowlistPrice(uint256 newPrice) external;
    function setMerkleRoot(bytes32 newRoot) external;
    function setMaxPerWallet(uint256 newMax) external;
    function setMaxPerAllowlist(uint256 newMax) external;
    function setPublicMintEnabled(bool enabled) external;
    function setAllowlistMintEnabled(bool enabled) external;

    // =========================================================================
    // Admin Functions
    // =========================================================================

    function pause() external;
    function unpause() external;
    function setRoyalty(address receiver, uint96 basisPoints) external;
    function withdraw() external;

    // =========================================================================
    // View Functions
    // =========================================================================

    function getPassData(uint256 tokenId) external view returns (PassData memory);
    function isRevealed() external view returns (bool);
    function isMetadataFrozen() external view returns (bool);
    function totalMinted() external view returns (uint256);
    function maxSupply() external view returns (uint256);
    function genesisSupply() external view returns (uint256);
}
