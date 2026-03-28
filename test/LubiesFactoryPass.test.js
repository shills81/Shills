'use strict';

const { expect }        = require('chai');
const { ethers }        = require('hardhat');
const { MerkleTree }    = require('merkletreejs');
const keccak256         = require('keccak256');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMerkleTree(addresses) {
  const leaves = addresses.map(addr =>
    keccak256(ethers.getBytes(ethers.getAddress(addr)))
  );
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

function getProof(tree, address) {
  const leaf = keccak256(ethers.getBytes(ethers.getAddress(address)));
  return tree.getHexProof(leaf);
}

async function deployContract(overrides = {}) {
  const [deployer] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory('LubiesFactoryPass');
  const contract = await Factory.deploy(
    overrides.name          ?? 'Lubies Factory Pass',
    overrides.symbol        ?? 'LFP',
    overrides.maxSupply     ?? 5000,
    overrides.genesisSupply ?? 100,
    overrides.unrevealedURI ?? 'ipfs://unrevealed/',
    overrides.royaltyReceiver ?? deployer.address,
    overrides.royaltyBps    ?? 500,
  );
  await contract.waitForDeployment();
  return contract;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('LubiesFactoryPass', function () {
  let contract;
  let owner, minter, user1, user2, user3, user4;

  const MINTER_ROLE         = ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE'));
  const METADATA_ROLE       = ethers.keccak256(ethers.toUtf8Bytes('METADATA_ROLE'));
  const STATUS_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('STATUS_MANAGER_ROLE'));
  const FREEZE_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('FREEZE_MANAGER_ROLE'));

  beforeEach(async () => {
    [owner, minter, user1, user2, user3, user4] = await ethers.getSigners();
    contract = await deployContract();
  });

  // =========================================================================
  // Deployment
  // =========================================================================

  describe('Deployment', () => {
    it('sets correct name and symbol', async () => {
      expect(await contract.name()).to.equal('Lubies Factory Pass');
      expect(await contract.symbol()).to.equal('LFP');
    });

    it('sets correct max supply', async () => {
      expect(await contract.maxSupply()).to.equal(5000n);
    });

    it('sets correct genesis supply', async () => {
      expect(await contract.genesisSupply()).to.equal(100n);
    });

    it('starts with zero minted', async () => {
      expect(await contract.totalMinted()).to.equal(0n);
    });

    it('starts unrevealed', async () => {
      expect(await contract.isRevealed()).to.equal(false);
    });

    it('starts with metadata not frozen', async () => {
      expect(await contract.isMetadataFrozen()).to.equal(false);
    });

    it('grants all roles to deployer', async () => {
      const adminRole = await contract.DEFAULT_ADMIN_ROLE();
      expect(await contract.hasRole(adminRole,         owner.address)).to.be.true;
      expect(await contract.hasRole(MINTER_ROLE,       owner.address)).to.be.true;
      expect(await contract.hasRole(METADATA_ROLE,     owner.address)).to.be.true;
      expect(await contract.hasRole(STATUS_MANAGER_ROLE, owner.address)).to.be.true;
      expect(await contract.hasRole(FREEZE_MANAGER_ROLE, owner.address)).to.be.true;
    });

    it('reverts if genesisSupply exceeds maxSupply', async () => {
      await expect(
        deployContract({ maxSupply: 100, genesisSupply: 200 })
      ).to.be.revertedWithCustomError(contract, 'ExceedsMaxSupply');
    });
  });

  // =========================================================================
  // Admin Mint
  // =========================================================================

  describe('adminMint()', () => {
    it('mints tokens to a specified address', async () => {
      await contract.adminMint(user1.address, 5);
      expect(await contract.totalMinted()).to.equal(5n);
      expect(await contract.balanceOf(user1.address)).to.equal(5n);
    });

    it('token IDs start at 1', async () => {
      await contract.adminMint(user1.address, 3);
      expect(await contract.ownerOf(1)).to.equal(user1.address);
      expect(await contract.ownerOf(2)).to.equal(user1.address);
      expect(await contract.ownerOf(3)).to.equal(user1.address);
    });

    it('auto-sets genesis tier for tokens within genesisSupply', async () => {
      await contract.adminMint(user1.address, 5);
      const pd = await contract.getPassData(1);
      expect(pd.accessTier).to.equal(3); // TIER_GENESIS
      expect(pd.genesis).to.be.true;
    });

    it('auto-sets standard tier for tokens beyond genesisSupply', async () => {
      await contract.adminMint(user1.address, 101);
      const pd = await contract.getPassData(101);
      expect(pd.accessTier).to.equal(0); // TIER_STANDARD
      expect(pd.genesis).to.be.false;
    });

    it('initializes all tokens with PENDING status', async () => {
      await contract.adminMint(user1.address, 3);
      for (let id = 1; id <= 3; id++) {
        const pd = await contract.getPassData(id);
        expect(pd.status).to.equal(0); // STATUS_PENDING
      }
    });

    it('reverts for non-minter', async () => {
      await expect(
        contract.connect(user1).adminMint(user1.address, 1)
      ).to.be.reverted;
    });

    it('reverts on zero address', async () => {
      await expect(
        contract.adminMint(ethers.ZeroAddress, 1)
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress');
    });

    it('reverts if exceeds max supply', async () => {
      await expect(
        contract.adminMint(user1.address, 5001)
      ).to.be.revertedWithCustomError(contract, 'ExceedsMaxSupply');
    });

    it('reverts if quantity is 0', async () => {
      await expect(
        contract.adminMint(user1.address, 0)
      ).to.be.revertedWithCustomError(contract, 'InvalidQuantity');
    });
  });

  // =========================================================================
  // Public Mint
  // =========================================================================

  describe('mint() — public', () => {
    const PRICE = ethers.parseEther('0.05');

    beforeEach(async () => {
      await contract.setMintPrice(PRICE);
      await contract.setPublicMintEnabled(true);
    });

    it('mints tokens when public sale is active', async () => {
      await contract.connect(user1).mint(2, { value: PRICE * 2n });
      expect(await contract.balanceOf(user1.address)).to.equal(2n);
    });

    it('reverts when public sale is not active', async () => {
      await contract.setPublicMintEnabled(false);
      await expect(
        contract.connect(user1).mint(1, { value: PRICE })
      ).to.be.revertedWithCustomError(contract, 'PublicMintNotActive');
    });

    it('reverts with insufficient payment', async () => {
      await expect(
        contract.connect(user1).mint(2, { value: PRICE })
      ).to.be.revertedWithCustomError(contract, 'InsufficientPayment');
    });

    it('reverts when exceeding wallet limit', async () => {
      const maxPerWallet = Number(await contract.maxPerWallet());
      await expect(
        contract.connect(user1).mint(maxPerWallet + 1, { value: PRICE * BigInt(maxPerWallet + 1) })
      ).to.be.revertedWithCustomError(contract, 'ExceedsWalletLimit');
    });

    it('respects wallet cap across multiple txs', async () => {
      await contract.connect(user1).mint(3, { value: PRICE * 3n });
      await expect(
        contract.connect(user1).mint(3, { value: PRICE * 3n })
      ).to.be.revertedWithCustomError(contract, 'ExceedsWalletLimit');
    });

    it('reverts if quantity is 0', async () => {
      await expect(
        contract.connect(user1).mint(0, { value: 0n })
      ).to.be.revertedWithCustomError(contract, 'InvalidQuantity');
    });
  });

  // =========================================================================
  // Allowlist Mint
  // =========================================================================

  describe('allowlistMint()', () => {
    const PRICE = ethers.parseEther('0.03');
    let tree, root;

    beforeEach(async () => {
      tree = buildMerkleTree([user1.address, user2.address]);
      root = '0x' + tree.getRoot().toString('hex');

      await contract.setAllowlistPrice(PRICE);
      await contract.setMerkleRoot(root);
      await contract.setAllowlistMintEnabled(true);
    });

    it('mints for a valid proof', async () => {
      const proof = getProof(tree, user1.address);
      await contract.connect(user1).allowlistMint(1, proof, { value: PRICE });
      expect(await contract.balanceOf(user1.address)).to.equal(1n);
    });

    it('reverts with invalid proof', async () => {
      const badProof = getProof(tree, user1.address);
      await expect(
        contract.connect(user3).allowlistMint(1, badProof, { value: PRICE })
      ).to.be.revertedWithCustomError(contract, 'InvalidMerkleProof');
    });

    it('reverts when allowlist mint is not active', async () => {
      await contract.setAllowlistMintEnabled(false);
      const proof = getProof(tree, user1.address);
      await expect(
        contract.connect(user1).allowlistMint(1, proof, { value: PRICE })
      ).to.be.revertedWithCustomError(contract, 'AllowlistMintNotActive');
    });

    it('reverts when exceeding allowlist limit', async () => {
      const max  = Number(await contract.maxPerAllowlist());
      const proof = getProof(tree, user1.address);
      await expect(
        contract.connect(user1).allowlistMint(max + 1, proof, { value: PRICE * BigInt(max + 1) })
      ).to.be.revertedWithCustomError(contract, 'ExceedsAllowlistLimit');
    });

    it('tracks claims across multiple transactions', async () => {
      const proof = getProof(tree, user1.address);
      await contract.connect(user1).allowlistMint(1, proof, { value: PRICE });
      await contract.connect(user1).allowlistMint(1, proof, { value: PRICE });
      expect(await contract.allowlistClaimed(user1.address)).to.equal(2n);

      await expect(
        contract.connect(user1).allowlistMint(1, proof, { value: PRICE })
      ).to.be.revertedWithCustomError(contract, 'ExceedsAllowlistLimit');
    });
  });

  // =========================================================================
  // Token URI
  // =========================================================================

  describe('tokenURI()', () => {
    beforeEach(async () => {
      await contract.adminMint(user1.address, 5);
    });

    it('returns unrevealed URI before reveal', async () => {
      expect(await contract.tokenURI(1)).to.equal('ipfs://unrevealed/');
    });

    it('returns base URI + tokenId + .json after reveal', async () => {
      await contract.setBaseURI('ipfs://collection/');
      await contract.revealCollection();
      expect(await contract.tokenURI(1)).to.equal('ipfs://collection/1.json');
      expect(await contract.tokenURI(5)).to.equal('ipfs://collection/5.json');
    });

    it('returns per-token override URI when set', async () => {
      await contract.setBaseURI('ipfs://collection/');
      await contract.revealCollection();
      await contract.setTokenURIOverride(2, 'ipfs://special/2.json');
      expect(await contract.tokenURI(2)).to.equal('ipfs://special/2.json');
      expect(await contract.tokenURI(1)).to.equal('ipfs://collection/1.json');
    });

    it('reverts for non-existent token', async () => {
      await expect(
        contract.tokenURI(999)
      ).to.be.revertedWithCustomError(contract, 'TokenDoesNotExist');
    });
  });

  // =========================================================================
  // Reveal
  // =========================================================================

  describe('revealCollection()', () => {
    it('flips revealed state', async () => {
      expect(await contract.isRevealed()).to.be.false;
      await contract.revealCollection();
      expect(await contract.isRevealed()).to.be.true;
    });

    it('emits CollectionRevealed', async () => {
      await expect(contract.revealCollection())
        .to.emit(contract, 'CollectionRevealed');
    });

    it('reverts for non-metadata-role', async () => {
      await expect(
        contract.connect(user1).revealCollection()
      ).to.be.reverted;
    });
  });

  // =========================================================================
  // Pass State Management
  // =========================================================================

  describe('Pass state management', () => {
    beforeEach(async () => {
      await contract.adminMint(user1.address, 5);
    });

    describe('setPassStatus()', () => {
      it('updates status and emits event', async () => {
        await expect(contract.setPassStatus(1, 1)) // STATUS_ENABLED
          .to.emit(contract, 'PassStatusUpdated')
          .withArgs(1n, 0n, 1n);

        const pd = await contract.getPassData(1);
        expect(pd.status).to.equal(1);
      });

      it('reverts for invalid status', async () => {
        await expect(
          contract.setPassStatus(1, 10)
        ).to.be.revertedWithCustomError(contract, 'InvalidStatus');
      });

      it('reverts for non-existent token', async () => {
        await expect(
          contract.setPassStatus(999, 1)
        ).to.be.revertedWithCustomError(contract, 'TokenDoesNotExist');
      });

      it('reverts if caller lacks STATUS_MANAGER_ROLE', async () => {
        await expect(
          contract.connect(user1).setPassStatus(1, 1)
        ).to.be.reverted;
      });
    });

    describe('setAccessTier()', () => {
      it('updates tier and emits event', async () => {
        await expect(contract.setAccessTier(105, 2)) // token 105 = standard, tier PARTNER
          .to.emit(contract, 'AccessTierUpdated');

        const pd = await contract.getPassData(105);
        expect(pd.accessTier).to.equal(2);
      });

      it('reverts for invalid tier', async () => {
        await expect(
          contract.setAccessTier(1, 10)
        ).to.be.revertedWithCustomError(contract, 'InvalidTier');
      });
    });

    describe('setPassFlags()', () => {
      it('sets premium, lanyard, genesis flags', async () => {
        await expect(contract.setPassFlags(1, true, true, false))
          .to.emit(contract, 'PassFlagsUpdated')
          .withArgs(1n, true, true, false);

        const pd = await contract.getPassData(1);
        expect(pd.premium).to.be.true;
        expect(pd.lanyard).to.be.true;
        expect(pd.genesis).to.be.false;
      });
    });
  });

  // =========================================================================
  // Freeze Mechanics
  // =========================================================================

  describe('Freeze mechanics', () => {
    beforeEach(async () => {
      await contract.adminMint(user1.address, 5);
      await contract.setBaseURI('ipfs://collection/');
    });

    describe('freezeMetadata() — global', () => {
      it('freezes metadata globally', async () => {
        await contract.freezeMetadata();
        expect(await contract.isMetadataFrozen()).to.be.true;
      });

      it('emits MetadataFrozen', async () => {
        await expect(contract.freezeMetadata())
          .to.emit(contract, 'MetadataFrozen');
      });

      it('prevents base URI changes after freeze', async () => {
        await contract.freezeMetadata();
        await expect(
          contract.setBaseURI('ipfs://new/')
        ).to.be.revertedWithCustomError(contract, 'MetadataIsFrozen');
      });

      it('prevents unrevealed URI changes after freeze', async () => {
        await contract.freezeMetadata();
        await expect(
          contract.setUnrevealedURI('ipfs://new-unrevealed/')
        ).to.be.revertedWithCustomError(contract, 'MetadataIsFrozen');
      });

      it('prevents reveal after freeze', async () => {
        await contract.freezeMetadata();
        await expect(
          contract.revealCollection()
        ).to.be.revertedWithCustomError(contract, 'MetadataIsFrozen');
      });
    });

    describe('freezeToken() — per-token', () => {
      it('freezes a single token', async () => {
        await contract.freezeToken(2);
        const pd = await contract.getPassData(2);
        expect(pd.frozen).to.be.true;
      });

      it('emits TokenFrozen', async () => {
        await expect(contract.freezeToken(2))
          .to.emit(contract, 'TokenFrozen')
          .withArgs(2n);
      });

      it('prevents status updates on a frozen token', async () => {
        await contract.freezeToken(2);
        await expect(
          contract.setPassStatus(2, 1)
        ).to.be.revertedWithCustomError(contract, 'TokenIsFrozen');
      });

      it('prevents URI override on a frozen token', async () => {
        await contract.revealCollection();
        await contract.freezeToken(3);
        await expect(
          contract.setTokenURIOverride(3, 'ipfs://override/3.json')
        ).to.be.revertedWithCustomError(contract, 'TokenIsFrozen');
      });

      it('does not affect other tokens', async () => {
        await contract.freezeToken(1);
        await expect(contract.setPassStatus(2, 1)).to.not.be.reverted;
      });
    });
  });

  // =========================================================================
  // Pausable
  // =========================================================================

  describe('Pausable', () => {
    it('blocks transfers when paused', async () => {
      await contract.adminMint(user1.address, 1);
      await contract.pause();

      await expect(
        contract.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.reverted;
    });

    it('allows transfers when unpaused', async () => {
      await contract.adminMint(user1.address, 1);
      await contract.pause();
      await contract.unpause();

      await expect(
        contract.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.not.be.reverted;
    });

    it('reverts pause from non-admin', async () => {
      await expect(contract.connect(user1).pause()).to.be.reverted;
    });
  });

  // =========================================================================
  // Royalties (ERC2981)
  // =========================================================================

  describe('ERC2981 royalties', () => {
    it('returns correct royalty info', async () => {
      await contract.adminMint(user1.address, 1);
      const salePrice = ethers.parseEther('1');
      const [receiver, amount] = await contract.royaltyInfo(1, salePrice);

      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(salePrice * 500n / 10000n); // 5%
    });

    it('allows admin to update royalty', async () => {
      await contract.setRoyalty(user2.address, 750); // 7.5%
      const salePrice = ethers.parseEther('1');
      const [receiver, amount] = await contract.royaltyInfo(1, salePrice);
      expect(receiver).to.equal(user2.address);
      expect(amount).to.equal(salePrice * 750n / 10000n);
    });

    it('reverts royalty update with zero address', async () => {
      await expect(
        contract.setRoyalty(ethers.ZeroAddress, 500)
      ).to.be.revertedWithCustomError(contract, 'ZeroAddress');
    });
  });

  // =========================================================================
  // supportsInterface
  // =========================================================================

  describe('supportsInterface()', () => {
    it('supports ERC721', async () => {
      expect(await contract.supportsInterface('0x80ac58cd')).to.be.true;
    });

    it('supports ERC721Metadata', async () => {
      expect(await contract.supportsInterface('0x5b5e139f')).to.be.true;
    });

    it('supports ERC2981', async () => {
      expect(await contract.supportsInterface('0x2a55205a')).to.be.true;
    });

    it('supports AccessControl', async () => {
      expect(await contract.supportsInterface('0x7965db0b')).to.be.true;
    });
  });

  // =========================================================================
  // Withdraw
  // =========================================================================

  describe('withdraw()', () => {
    it('withdraws ETH balance to admin', async () => {
      await contract.setMintPrice(ethers.parseEther('0.1'));
      await contract.setPublicMintEnabled(true);
      await contract.connect(user1).mint(1, { value: ethers.parseEther('0.1') });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter + gasUsed).to.be.gt(balanceBefore);
    });

    it('reverts for non-admin', async () => {
      await expect(contract.connect(user1).withdraw()).to.be.reverted;
    });
  });

  // =========================================================================
  // contractURI
  // =========================================================================

  describe('contractURI()', () => {
    it('returns contract URI after setting', async () => {
      await contract.setContractURI('ipfs://contract-metadata.json');
      expect(await contract.contractURI()).to.equal('ipfs://contract-metadata.json');
    });
  });
});
