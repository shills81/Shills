'use strict';

/**
 * removeBackground.js
 * Remove the background from an image using the remove.bg API.
 *
 * Returns a PNG Buffer with the subject isolated on a transparent background.
 * Works for photos, pixel art, cartoons, illustrations — any subject type.
 *
 * Usage:
 *   Set REMOVE_BG_API_KEY in your .env file.
 *   Get an API key at https://www.remove.bg/api
 *
 * Free tier: 50 preview-quality calls/month.
 * Paid plans start at ~$0.02/image for full resolution.
 */

const https = require('https');

/**
 * Remove the background from an image buffer.
 *
 * @param {Buffer} imageBuffer   Raw image bytes (JPEG, PNG, WebP, etc.)
 * @param {string} apiKey        remove.bg API key
 * @param {object} [opts]
 * @param {string} [opts.size]   'preview' (free) | 'regular' | 'hd' (paid)
 * @returns {Promise<Buffer>}    PNG buffer, background removed (transparent)
 */
async function removeBackground(imageBuffer, apiKey, { size = 'regular' } = {}) {
  if (!apiKey) throw new Error('REMOVE_BG_API_KEY not set');

  // Resize to max 1500px on longest side before sending — reduces cost + latency
  let inputBuffer = imageBuffer;
  try {
    const sharp = require('sharp');
    const meta  = await sharp(imageBuffer).metadata();
    const max   = Math.max(meta.width || 0, meta.height || 0);
    if (max > 1500) {
      inputBuffer = await sharp(imageBuffer)
        .resize(1500, 1500, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();
    }
  } catch { /* sharp unavailable — send as-is */ }

  const b64  = inputBuffer.toString('base64');
  const body = JSON.stringify({
    image_file_b64: b64,
    size,
    type:           'auto',   // auto-detect person / product / car / animal etc.
    format:         'png',
    add_shadow:     false,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.remove.bg',
        path:     '/v1.0/removebg',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'X-Api-Key':      apiKey,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data',  c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode === 200) {
            resolve(buf);
          } else {
            const msg = buf.toString('utf8').slice(0, 300);
            reject(new Error(`remove.bg ${res.statusCode}: ${msg}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { removeBackground };
