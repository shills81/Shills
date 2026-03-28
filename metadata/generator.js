'use strict';

/**
 * generator.js
 * Token metadata JSON generator for the Lubies Factory Pass.
 *
 * Produces deterministic, marketplace-compatible metadata for each token.
 * Bridges the contract layer (onchain PassData) and the render layer (SVG/PNG).
 *
 * Usage:
 *   const { generateTokenMetadata } = require('./metadata/generator');
 *   const metadata = generateTokenMetadata(420, passData, config);
 *   // => { name, description, image, animation_url, attributes, ... }
 */

const { generateTokenTraits, traitsToAttributes, COLLECTION_NAME } = require('./traits');

// ---------------------------------------------------------------------------
// Default config (override per-deploy via environment or explicit config arg)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  // Base URIs — replace with IPFS/Arweave CIDs after upload
  imageBaseURI:     process.env.METADATA_IMAGE_BASE_URI     || 'ipfs://PENDING_IMAGE_CID/',
  animationBaseURI: process.env.METADATA_ANIMATION_BASE_URI || 'ipfs://PENDING_SVG_CID/',
  externalUrl:      process.env.METADATA_EXTERNAL_URL       || 'https://lubies.xyz',
  collectionName:   COLLECTION_NAME,

  // Whether to include animation_url (SVG) in metadata
  includeAnimation: true,

  // Salt for deterministic generation — do not change after mint
  salt: 'lubies-factory-pass-v1',
};

// ---------------------------------------------------------------------------
// generateTokenMetadata
// ---------------------------------------------------------------------------

/**
 * Generate the full metadata JSON object for a single token.
 *
 * @param {number|bigint} tokenId   The ERC721 token ID (1-indexed).
 * @param {object} passData         Onchain PassData struct fields:
 *   @param {number}  passData.accessTier
 *   @param {number}  passData.status
 *   @param {boolean} passData.premium
 *   @param {boolean} passData.lanyard
 *   @param {boolean} passData.genesis
 *   @param {boolean} passData.frozen
 * @param {object} [config]         Optional config overrides (see DEFAULT_CONFIG).
 * @returns {TokenMetadata}
 */
function generateTokenMetadata(tokenId, passData, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const id  = Number(tokenId);

  // Derive traits — the single deterministic call for this token
  const traits     = generateTokenTraits(tokenId, passData, { salt: cfg.salt });
  const attributes = traitsToAttributes(traits);

  const paddedId = String(id).padStart(4, '0');

  const name = `${cfg.collectionName} Pass #${paddedId}`;

  const description = _buildDescription(traits);

  const image        = `${cfg.imageBaseURI}${id}.png`;
  const animationUrl = cfg.includeAnimation
    ? `${cfg.animationBaseURI}${id}.svg`
    : undefined;

  const metadata = {
    name,
    description,
    image,
    external_url: cfg.externalUrl,
    attributes,
  };

  if (animationUrl) {
    metadata.animation_url = animationUrl;
  }

  // Non-standard fields — widely supported by major indexers
  metadata.token_id        = id;
  metadata.collection      = cfg.collectionName;
  metadata.edition         = traits.edition;
  metadata.render_mode     = traits.paletteMode;
  metadata.pattern_mode    = traits.patternMode;
  metadata.silhouette_mode = traits.silhouetteMode;

  return metadata;
}

// ---------------------------------------------------------------------------
// generateTokenTraitsOnly (for contract sync scripts)
// ---------------------------------------------------------------------------

/**
 * Return just the trait set for a token — useful for scripts that need to
 * inspect traits without generating a full metadata object.
 *
 * @param {number|bigint} tokenId
 * @param {object} passData
 * @param {object} [config]
 * @returns {TraitSet}
 */
function generateTokenTraitsOnly(tokenId, passData, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return generateTokenTraits(tokenId, passData, { salt: cfg.salt });
}

// ---------------------------------------------------------------------------
// generateBatchMetadata (convenience for scripts)
// ---------------------------------------------------------------------------

/**
 * Generate metadata for a range of tokens.
 *
 * @param {Array<{ tokenId: number|bigint, passData: object }>} tokens
 * @param {object} [config]
 * @returns {Array<TokenMetadata>}
 */
function generateBatchMetadata(tokens, config = {}) {
  return tokens.map(({ tokenId, passData }) =>
    generateTokenMetadata(tokenId, passData, config)
  );
}

// ---------------------------------------------------------------------------
// contractMetadata (for contractURI endpoint)
// ---------------------------------------------------------------------------

/**
 * Generate contract-level metadata (OpenSea storefront standard).
 *
 * @param {object} [config]
 * @returns {ContractMetadata}
 */
function generateContractMetadata(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return {
    name:             `${cfg.collectionName} Pass`,
    description:      'Lubies Factory Passes are brand-locked ERC721A identity and utility NFTs. Each pass carries a unique visual identity fingerprint, deterministic trait set, and access tier. Not a random PFP drop.',
    image:            cfg.collectionImageURI || `${cfg.imageBaseURI}collection.png`,
    external_link:    cfg.externalUrl,
    seller_fee_basis_points: cfg.royaltyBps || 500,
    fee_recipient:    cfg.royaltyReceiver || '',
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _buildDescription(traits) {
  const tierLine   = `Access Tier: ${traits.accessTier}.`;
  const statusLine = `Status: ${traits.status}.`;
  const genesisNote = traits.genesis === 'True'
    ? ' Part of the Genesis edition.'
    : '';
  const premiumNote = traits.premium === 'True'
    ? ' Carries a premium finish.'
    : '';

  return (
    `A brand-locked ${traits.passType} from the Lubies Factory collection. ` +
    `${tierLine} ${statusLine}${genesisNote}${premiumNote} ` +
    `Identity fingerprint pattern: ${traits.patternMode}. ` +
    `Palette source: ${traits.paletteMode}.`
  );
}

module.exports = {
  generateTokenMetadata,
  generateTokenTraitsOnly,
  generateBatchMetadata,
  generateContractMetadata,
  DEFAULT_CONFIG,
};
