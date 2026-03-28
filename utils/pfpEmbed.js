'use strict';

/**
 * pfpEmbed.js
 * Load a PFP image from disk and prepare it for SVG embedding.
 *
 * If REMOVE_BG_API_KEY is set in the environment, also calls remove.bg to
 * produce a background-removed subject PNG (transparent background).
 * The result is cached in .cache/rmbg/ so each image is only processed once.
 *
 * Returned pfpData shape:
 *   dataURI    — original image as data URI (always present)
 *   subject    — { dataURI, width, height } background-removed PNG, or null
 *   swatches   — 3-6 dominant hex colours extracted from the image
 *   width/height/mimeType/name
 */

const fs   = require('fs');
const path = require('path');
const { extractPalette }   = require('./colorExtract');
const { removeBackground } = require('./removeBackground');

const MIME_TYPES = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
};

// Cache directory for background-removed PNGs
const CACHE_DIR = path.resolve(__dirname, '..', '.cache', 'rmbg');

/**
 * Return the cached background-removed PNG buffer for a source file, or null.
 */
function _readCache(sourcePath) {
  try {
    const key  = Buffer.from(sourcePath).toString('base64').replace(/[/+=]/g, '_');
    const file = path.join(CACHE_DIR, `${key}.png`);
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch { /* ignore */ }
  return null;
}

/**
 * Write a background-removed PNG to cache.
 */
function _writeCache(sourcePath, pngBuffer) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const key  = Buffer.from(sourcePath).toString('base64').replace(/[/+=]/g, '_');
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.png`), pngBuffer);
  } catch { /* non-critical */ }
}

/**
 * Load a PFP image and return an embed-ready descriptor.
 *
 * @param {string} imagePath
 * @returns {Promise<object>}
 */
// Max embedded image size — the card banner is only 534×399px so embedding
// anything larger wastes bytes without any visual benefit.
const MAX_EMBED_PX = 800;

async function loadPFP(imagePath) {
  const resolved = path.resolve(imagePath);
  const rawBuffer = fs.readFileSync(resolved);
  const ext       = path.extname(resolved).toLowerCase();
  const mimeType  = MIME_TYPES[ext] || 'image/png';
  const name      = path.basename(resolved, ext);

  // Resize to MAX_EMBED_PX before embedding — keeps SVG file sizes sane
  let buffer = rawBuffer;
  let width  = 512, height = 512;
  try {
    const sharp = require('sharp');
    const meta  = await sharp(rawBuffer).metadata();
    const origW = meta.width  || 512;
    const origH = meta.height || 512;
    const maxDim = Math.max(origW, origH);
    if (maxDim > MAX_EMBED_PX) {
      buffer = await sharp(rawBuffer)
        .resize(MAX_EMBED_PX, MAX_EMBED_PX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      const resized = await sharp(buffer).metadata();
      width  = resized.width  || origW;
      height = resized.height || origH;
    } else {
      width  = origW;
      height = origH;
    }
  } catch { /* sharp unavailable — use raw */ }

  const base64 = buffer.toString('base64');

  // Dominant colour swatches (best-effort)
  let swatches = [];
  try { swatches = await extractPalette(buffer, { count: 5 }); }
  catch { /* non-critical */ }

  // Background removal via remove.bg API (requires REMOVE_BG_API_KEY in .env).
  // Cached to .cache/rmbg/ so each image is only billed once.
  // When available, the renderer switches to a pixel-perfect alpha-based
  // silhouette filter instead of the luminance fallback.
  let subject = null;
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (apiKey) {
    try {
      let subjectBuf = _readCache(resolved);
      if (!subjectBuf) {
        subjectBuf = await removeBackground(buffer, apiKey);
        _writeCache(resolved, subjectBuf);
      }

      let sw = width, sh = height;
      try {
        const sharp = require('sharp');
        const meta  = await sharp(subjectBuf).metadata();
        sw = meta.width  || width;
        sh = meta.height || height;
      } catch { /* ignore */ }

      subject = {
        dataURI: `data:image/png;base64,${subjectBuf.toString('base64')}`,
        width:   sw,
        height:  sh,
      };
    } catch (err) {
      console.warn(`[pfpEmbed] remove.bg failed for ${name}: ${err.message}`);
    }
  }

  return {
    dataURI: `data:${mimeType};base64,${base64}`,
    mimeType,
    width,
    height,
    name,
    swatches,
    subject,   // null if no API key or removal failed
  };
}

/**
 * Synchronous version — no background removal, no sharp dimensions.
 */
function loadPFPSync(imagePath) {
  const resolved = path.resolve(imagePath);
  const buffer   = fs.readFileSync(resolved);
  const base64   = buffer.toString('base64');
  const ext      = path.extname(resolved).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'image/png';
  const name     = path.basename(resolved, ext);

  return {
    dataURI:  `data:${mimeType};base64,${base64}`,
    mimeType,
    width:    512,
    height:   512,
    name,
    swatches: [],
    subject:  null,
  };
}

module.exports = { loadPFP, loadPFPSync };
