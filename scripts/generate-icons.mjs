import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "icons");
const logoPath = path.join(root, "public", "logo.svg");

fs.mkdirSync(outDir, { recursive: true });

const sizes = [180, 192, 512];
const bg = { r: 251, g: 246, b: 238, alpha: 1 };

for (const size of sizes) {
  const logoSize = Math.round(size * 0.52);
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: "contain", background: bg })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));

  console.log(`wrote icon-${size}.png`);
}

await sharp(path.join(outDir, "icon-180.png"))
  .toFile(path.join(root, "public", "apple-touch-icon.png"));
console.log("wrote apple-touch-icon.png");
