const sharp = require("sharp");

const TEXT = "TELEG";

/**
 * Draws TEXT at the center of the given image.
 * @param {Buffer} input original image bytes
 * @returns {Promise<Buffer>} PNG bytes with the placeholder on top
 */
async function addCenterPlaceholder(input) {
  const image = sharp(input, { failOn: "none" }).rotate(); // rotate() applies EXIF orientation
  const { width, height } = await image.metadata();

  if (!width || !height) {
    throw new Error("Unsupported image: could not read dimensions");
  }

  // Scale the text so it spans ~60% of the width, capped so it can't outgrow the height.
  // 0.62em is a rough per-glyph advance for bold sans-serif.
  const byWidth = (width * 0.6) / (TEXT.length * 0.62);
  const fontSize = Math.max(12, Math.round(Math.min(byWidth, height * 0.7)));
  const strokeWidth = Math.max(1, Math.round(fontSize * 0.06));

  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="50%" y="50%"
        text-anchor="middle" dominant-baseline="central"
        font-family="sans-serif" font-size="${fontSize}" font-weight="bold"
        fill="#ffffff" fill-opacity="0.85"
        stroke="#000000" stroke-opacity="0.6" stroke-width="${strokeWidth}"
        paint-order="stroke"
      >${TEXT}</text>
    </svg>`,
  );

  return image
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { addCenterPlaceholder, TEXT };
