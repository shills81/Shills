'use strict';

/**
 * pfpEmbed.js
 * Utility to load a PFP image from disk and prepare it for SVG embedding.
 *
 * Returns a pfpData object used by passRenderer.js to embed the image
 * in the banner zone with a palette-matched silhouette filter applied.
 */

const fs   = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
};

/**
 * Load a PFP image and return an embed-ready descriptor.
 *
 * @param {string} imagePath  Absolute or relative path to the image file.
 * @returns {Promise<{dataURI: string, mimeType: string, width: number, height: number, name: string}>}
 */
async function loadPFP(imagePath) {
  const resolved = path.resolve(imagePath);
  const buffer   = fs.readFileSync(resolved);
  const base64   = buffer.toString('base64');
  const ext      = path.extname(resolved).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'image/png';
  const name     = path.basename(resolved, ext);

  let width  = 512;
  let height = 512;

  try {
    const sharp = require('sharp');
    const meta  = await sharp(buffer).metadata();
    width  = meta.width  || 512;
    height = meta.height || 512;
  } catch {
    // sharp not installed or failed — use default dimensions
  }

  return {
    dataURI:  `data:${mimeType};base64,${base64}`,
    mimeType,
    width,
    height,
    name,
  };
}

/**
 * Synchronous version — dimensions default to 512×512 (no sharp).
 *
 * @param {string} imagePath
 * @returns {{dataURI: string, mimeType: string, width: number, height: number, name: string}}
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
  };
}

module.exports = { loadPFP, loadPFPSync };
