'use strict';

/**
 * traits.js
 * Trait definitions and deterministic trait assignment for Lubies Factory Pass.
 *
 * Design principle: traits reflect system logic, not gimmick rarity.
 * Rarity that exists emerges from intentional tier/flag distributions —
 * not from a random PFP generator.
 */

const { rngForToken, randInt, weightedChoice, randChoice } = require('../utils/hashSeed');

// ---------------------------------------------------------------------------
// Enums (mirror the Solidity constants)
// ---------------------------------------------------------------------------

const AccessTier = {
  STANDARD: 0,
  BUILDER:  1,
  PARTNER:  2,
  GENESIS:  3,
  SPECIAL:  4,
};

const PassStatus = {
  PENDING:  0,
  ENABLED:  1,
  DISABLED: 2,
  UPGRADED: 3,
  REVOKED:  4,
};

const TierLabel = {
  [AccessTier.STANDARD]: 'Standard',
  [AccessTier.BUILDER]:  'Builder',
  [AccessTier.PARTNER]:  'Partner',
  [AccessTier.GENESIS]:  'Genesis',
  [AccessTier.SPECIAL]:  'Special',
};

const StatusLabel = {
  [PassStatus.PENDING]:  'Pending',
  [PassStatus.ENABLED]:  'Enabled',
  [PassStatus.DISABLED]: 'Disabled',
  [PassStatus.UPGRADED]: 'Upgraded',
  [PassStatus.REVOKED]:  'Revoked',
};

// ---------------------------------------------------------------------------
// Pass type (fixed for this collection)
// ---------------------------------------------------------------------------

const PASS_TYPE = 'Factory Pass';
const COLLECTION_NAME = 'Lubies Factory';

// ---------------------------------------------------------------------------
// Pattern Mode
// ---------------------------------------------------------------------------

const PatternMode = {
  PROCEDURAL:   'Procedural',
  STRUCTURED:   'Structured',
  RADIAL:       'Radial',
  LOOP:         'Loop',
  ARCH:         'Arch',
};

const PatternModeList = Object.values(PatternMode);

// ---------------------------------------------------------------------------
// Palette Source Type
// ---------------------------------------------------------------------------

const PaletteMode = {
  REFERENCE_DERIVED: 'Reference Derived',
  TIER_LOCKED:       'Tier Locked',
  MIDNIGHT:          'Midnight',
  OBSIDIAN:          'Obsidian',
  GENESIS_DEEP:      'Genesis Deep',
  BUILDER_FIELD:     'Builder Field',
  PARTNER_EMBER:     'Partner Ember',
};

// ---------------------------------------------------------------------------
// Silhouette Mode
// ---------------------------------------------------------------------------

const SilhouetteMode = {
  DEFAULT:   'Default',
  ELEVATED:  'Elevated',
  INVERTED:  'Inverted',
  GHOST:     'Ghost',
};

// ---------------------------------------------------------------------------
// Edition Type
// ---------------------------------------------------------------------------

const EditionType = {
  STANDARD: 'Standard Edition',
  GENESIS:  'Genesis Edition',
  SPECIAL:  'Special Edition',
};

// ---------------------------------------------------------------------------
// Deterministic trait derivation
// ---------------------------------------------------------------------------

/**
 * Derive a complete visual trait set for a token from its onchain PassData
 * and a token-seeded RNG. The result is deterministic: the same inputs
 * always produce the same outputs.
 *
 * Visual traits (pattern mode, palette mode, silhouette, edition) are derived
 * here from the seed — they are NOT stored onchain to keep the contract lean.
 * The renderer reads these and applies them consistently.
 *
 * @param {number|bigint} tokenId
 * @param {object} passData  Mirrors the Solidity PassData struct.
 * @param {number} passData.accessTier
 * @param {number} passData.status
 * @param {boolean} passData.premium
 * @param {boolean} passData.lanyard
 * @param {boolean} passData.genesis
 * @param {boolean} passData.frozen
 * @param {object} [config]
 * @param {string} [config.salt]  Override the default salt (use for testing).
 * @returns {TraitSet}
 */
function generateTokenTraits(tokenId, passData, config = {}) {
  const rng = rngForToken(tokenId, 'traits', config.salt);

  const tier   = passData.accessTier ?? AccessTier.STANDARD;
  const status = passData.status     ?? PassStatus.PENDING;

  // ---------------------------------------------------------------------------
  // Pattern mode — weighted per tier
  // ---------------------------------------------------------------------------
  const patternMode = _derivePatternMode(rng, tier);

  // ---------------------------------------------------------------------------
  // Palette mode — tier-locked for genesis/special, seed-derived otherwise
  // ---------------------------------------------------------------------------
  const paletteMode = _derivePaletteMode(rng, tier);

  // ---------------------------------------------------------------------------
  // Silhouette mode — mostly default, elevated for premium
  // ---------------------------------------------------------------------------
  let silhouetteMode = SilhouetteMode.DEFAULT;
  if (passData.premium) {
    silhouetteMode = weightedChoice(rng, [
      { value: SilhouetteMode.ELEVATED, weight: 60 },
      { value: SilhouetteMode.DEFAULT,  weight: 30 },
      { value: SilhouetteMode.GHOST,    weight: 10 },
    ]);
  } else {
    silhouetteMode = weightedChoice(rng, [
      { value: SilhouetteMode.DEFAULT,  weight: 70 },
      { value: SilhouetteMode.ELEVATED, weight: 20 },
      { value: SilhouetteMode.INVERTED, weight: 7  },
      { value: SilhouetteMode.GHOST,    weight: 3  },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Edition type
  // ---------------------------------------------------------------------------
  let editionType = EditionType.STANDARD;
  if (passData.genesis) editionType = EditionType.GENESIS;
  if (tier === AccessTier.SPECIAL) editionType = EditionType.SPECIAL;

  // ---------------------------------------------------------------------------
  // Edition number — zero-padded sequential within its class.
  //   Genesis tokens:  their token ID is the edition number (they are minted first).
  //   Standard tokens: edition = tokenId - genesisSupply (offset out after pass).
  //   For now we store tokenId as edition — the generator can offset externally.
  // ---------------------------------------------------------------------------
  const editionNumber = String(Number(tokenId)).padStart(4, '0');

  return {
    // System / identity traits (from onchain state)
    passType:      PASS_TYPE,
    accessTier:    TierLabel[tier]   ?? 'Unknown',
    status:        StatusLabel[status] ?? 'Unknown',
    editionType,
    edition:       editionNumber,
    lanyard:       passData.lanyard  ? 'True' : 'False',
    premium:       passData.premium  ? 'True' : 'False',
    genesis:       passData.genesis  ? 'True' : 'False',

    // Visual / render traits (derived from seed)
    patternMode,
    paletteMode,
    silhouetteMode,

    // Raw values for renderer
    _tier:   tier,
    _status: status,
    _rngSeed: rngForToken(tokenId, 'render', config.salt),
  };
}

// ---------------------------------------------------------------------------
// Private derivation helpers
// ---------------------------------------------------------------------------

function _derivePatternMode(rng, tier) {
  // Genesis and Special tokens have a curated subset of patterns
  if (tier === AccessTier.GENESIS || tier === AccessTier.SPECIAL) {
    return weightedChoice(rng, [
      { value: PatternMode.RADIAL,       weight: 35 },
      { value: PatternMode.LOOP,         weight: 30 },
      { value: PatternMode.STRUCTURED,   weight: 25 },
      { value: PatternMode.PROCEDURAL,   weight: 10 },
    ]);
  }
  if (tier === AccessTier.PARTNER) {
    return weightedChoice(rng, [
      { value: PatternMode.STRUCTURED,   weight: 40 },
      { value: PatternMode.RADIAL,       weight: 30 },
      { value: PatternMode.PROCEDURAL,   weight: 20 },
      { value: PatternMode.ARCH,         weight: 10 },
    ]);
  }
  if (tier === AccessTier.BUILDER) {
    return weightedChoice(rng, [
      { value: PatternMode.PROCEDURAL,   weight: 35 },
      { value: PatternMode.STRUCTURED,   weight: 30 },
      { value: PatternMode.ARCH,         weight: 20 },
      { value: PatternMode.LOOP,         weight: 15 },
    ]);
  }
  // Standard
  return weightedChoice(rng, [
    { value: PatternMode.PROCEDURAL,   weight: 50 },
    { value: PatternMode.ARCH,         weight: 25 },
    { value: PatternMode.STRUCTURED,   weight: 15 },
    { value: PatternMode.LOOP,         weight: 7  },
    { value: PatternMode.RADIAL,       weight: 3  },
  ]);
}

function _derivePaletteMode(rng, tier) {
  switch (tier) {
    case AccessTier.GENESIS:
      return PaletteMode.GENESIS_DEEP;
    case AccessTier.SPECIAL:
      return PaletteMode.TIER_LOCKED;
    case AccessTier.PARTNER:
      return weightedChoice(rng, [
        { value: PaletteMode.PARTNER_EMBER,     weight: 60 },
        { value: PaletteMode.MIDNIGHT,          weight: 25 },
        { value: PaletteMode.REFERENCE_DERIVED, weight: 15 },
      ]);
    case AccessTier.BUILDER:
      return weightedChoice(rng, [
        { value: PaletteMode.BUILDER_FIELD,     weight: 55 },
        { value: PaletteMode.OBSIDIAN,          weight: 25 },
        { value: PaletteMode.REFERENCE_DERIVED, weight: 20 },
      ]);
    default: // STANDARD
      return weightedChoice(rng, [
        { value: PaletteMode.MIDNIGHT,          weight: 35 },
        { value: PaletteMode.OBSIDIAN,          weight: 30 },
        { value: PaletteMode.REFERENCE_DERIVED, weight: 25 },
        { value: PaletteMode.BUILDER_FIELD,     weight: 5  },
        { value: PaletteMode.PARTNER_EMBER,     weight: 5  },
      ]);
  }
}

// ---------------------------------------------------------------------------
// Trait set → OpenSea-compatible attributes array
// ---------------------------------------------------------------------------

/**
 * Convert a TraitSet into the standard NFT attributes array.
 *
 * @param {object} traits  Result of generateTokenTraits().
 * @returns {Array<{ trait_type: string, value: string }>}
 */
function traitsToAttributes(traits) {
  return [
    { trait_type: 'Pass Type',      value: traits.passType      },
    { trait_type: 'Access Tier',    value: traits.accessTier    },
    { trait_type: 'Status',         value: traits.status        },
    { trait_type: 'Edition Type',   value: traits.editionType   },
    { trait_type: 'Edition',        value: traits.edition       },
    { trait_type: 'Lanyard',        value: traits.lanyard       },
    { trait_type: 'Premium',        value: traits.premium       },
    { trait_type: 'Genesis',        value: traits.genesis       },
    { trait_type: 'Pattern Mode',   value: traits.patternMode   },
    { trait_type: 'Palette Mode',   value: traits.paletteMode   },
    { trait_type: 'Silhouette Mode',value: traits.silhouetteMode},
  ];
}

module.exports = {
  AccessTier,
  PassStatus,
  TierLabel,
  StatusLabel,
  PatternMode,
  PaletteMode,
  SilhouetteMode,
  EditionType,
  PASS_TYPE,
  COLLECTION_NAME,
  generateTokenTraits,
  traitsToAttributes,
};
