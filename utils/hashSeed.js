'use strict';

/**
 * hashSeed.js
 * Deterministic seeding utilities for the Lubies Factory Pass engine.
 *
 * Given the same tokenId (and optional salt), these functions always produce
 * the same seed and the same sequence of pseudo-random values — ensuring
 * reproducible pass renders without any external entropy.
 */

// ---------------------------------------------------------------------------
// djb2-variant hash: string → 32-bit unsigned integer seed
// ---------------------------------------------------------------------------

/**
 * Hash a string into a 32-bit unsigned integer.
 * Uses a djb2-style algorithm. Fast, sufficient for deterministic generation.
 *
 * @param {string} str
 * @returns {number} Unsigned 32-bit integer
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 XOR charCode
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Token → seed
// ---------------------------------------------------------------------------

const DEFAULT_SALT = 'lubies-factory-pass-v1';

/**
 * Derive a deterministic 32-bit seed from a token ID (and optional salt).
 *
 * This is the single source of truth for all token-specific randomness.
 * Changing the salt produces a completely different visual identity set.
 *
 * @param {number|bigint} tokenId
 * @param {string} [salt]
 * @returns {number} Unsigned 32-bit seed
 */
function tokenSeed(tokenId, salt = DEFAULT_SALT) {
  return hashString(`${salt}::${tokenId}`);
}

/**
 * Derive a secondary seed for a specific named channel (e.g. 'fingerprint',
 * 'palette'). Keeps each visual domain independent while all stemming from
 * the same tokenId.
 *
 * @param {number|bigint} tokenId
 * @param {string} channel
 * @param {string} [salt]
 * @returns {number}
 */
function channelSeed(tokenId, channel, salt = DEFAULT_SALT) {
  return hashString(`${salt}::${tokenId}::${channel}`);
}

// ---------------------------------------------------------------------------
// Mulberry32 PRNG
// ---------------------------------------------------------------------------

/**
 * Create a seeded pseudo-random number generator using the Mulberry32 algorithm.
 * Returns a function that, on each call, produces a float in [0, 1).
 *
 * Mulberry32 is fast, has good statistical properties for visual generation,
 * and passes the SmallCrush test suite.
 *
 * @param {number} seed  Unsigned 32-bit integer seed.
 * @returns {() => number}
 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Create an RNG seeded directly from a tokenId + optional channel.
 *
 * @param {number|bigint} tokenId
 * @param {string} [channel]
 * @param {string} [salt]
 * @returns {() => number}
 */
function rngForToken(tokenId, channel = '', salt = DEFAULT_SALT) {
  const seed = channel
    ? channelSeed(tokenId, channel, salt)
    : tokenSeed(tokenId, salt);
  return mulberry32(seed);
}

/**
 * Pick a random integer in [min, max] (inclusive) using the provided rng.
 *
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Pick a random float in [min, max) using the provided rng.
 *
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(rng, min, max) {
  return min + rng() * (max - min);
}

/**
 * Pick a random element from an array using the provided rng.
 *
 * @template T
 * @param {() => number} rng
 * @param {T[]} arr
 * @returns {T}
 */
function randChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Weighted random choice.
 * `items` is an array of { value, weight } objects.
 * Returns the selected value.
 *
 * @template T
 * @param {() => number} rng
 * @param {Array<{ value: T, weight: number }>} items
 * @returns {T}
 */
function weightedChoice(rng, items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = rng() * totalWeight;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

/**
 * Shuffle an array in-place using the provided rng (Fisher-Yates).
 *
 * @template T
 * @param {() => number} rng
 * @param {T[]} arr
 * @returns {T[]} The same array, shuffled.
 */
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  hashString,
  tokenSeed,
  channelSeed,
  mulberry32,
  rngForToken,
  randInt,
  randFloat,
  randChoice,
  weightedChoice,
  shuffle,
  DEFAULT_SALT,
};
