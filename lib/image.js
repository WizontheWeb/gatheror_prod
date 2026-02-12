const sharp = require("sharp");
const fetch = require("node-fetch").default;

async function downloadAndCompress(botToken, fileId, maxMB) {
  try {
    const file = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.description || "getFile failed");
        return data.result;
      });

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Image download failed");

    const buffer = await response.buffer();

    const processed = await sharp(buffer).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true }).toBuffer();

    return processed;
  } catch (err) {
    throw new Error(`Image processing failed: ${err.message}`);
  }
}

module.exports = { downloadAndCompress };
