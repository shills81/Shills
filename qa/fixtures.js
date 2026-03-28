'use strict';

/**
 * qa/fixtures.js
 * Test token configurations used by the QA suite.
 *
 * Real PFPs are loaded automatically from qa/pfps/ (alphabetical order).
 * The first file (00-dr-lubie.jpg) is always the featured test at the top.
 */

const { AccessTier, PassStatus } = require('../metadata/traits');

const TOKEN_CONFIGS = [
  {
    id:       'genesis-premium',
    label:    'Genesis · Premium · Lanyard',
    tokenId:  1,
    passData: { accessTier: AccessTier.GENESIS,  status: PassStatus.ENABLED,  premium: true,  lanyard: true,  genesis: true,  frozen: false },
  },
  {
    id:       'builder-standard',
    label:    'Builder · Standard',
    tokenId:  42,
    passData: { accessTier: AccessTier.BUILDER,  status: PassStatus.ENABLED,  premium: false, lanyard: false, genesis: false, frozen: false },
  },
  {
    id:       'standard-lanyard',
    label:    'Standard · Lanyard',
    tokenId:  420,
    passData: { accessTier: AccessTier.STANDARD, status: PassStatus.ENABLED,  premium: false, lanyard: true,  genesis: false, frozen: false },
  },
  {
    id:       'partner-upgraded',
    label:    'Partner · Upgraded',
    tokenId:  999,
    passData: { accessTier: AccessTier.PARTNER,  status: PassStatus.UPGRADED, premium: true,  lanyard: false, genesis: false, frozen: false },
  },
  {
    id:       'special-locked',
    label:    'Special · Locked',
    tokenId:  100,
    passData: { accessTier: AccessTier.SPECIAL,  status: PassStatus.ENABLED,  premium: true,  lanyard: true,  genesis: false, frozen: false },
  },
];

module.exports = { TOKEN_CONFIGS };
