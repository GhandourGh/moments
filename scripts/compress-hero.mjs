import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const heroPath = path.join(__dirname, "..", "public", "hero.jpg");
const tmpPath = heroPath + ".tmp";
const MAX_WIDTH = 1920;
const QUALITY = 80;

const meta = await sharp(heroPath).metadata();
const before = fs.statSync(heroPath).size;

await sharp(heroPath)
  .resize({ width: MAX_WIDTH, withoutEnlargement: true })
  .jpeg({ quality: QUALITY, mozjpeg: true })
  .toFile(tmpPath);

fs.renameSync(tmpPath, heroPath);

const after = fs.statSync(heroPath).size;
console.log(
  `compressed hero.jpg: ${meta.width}x${meta.height} → max ${MAX_WIDTH}px, ` +
    `${(before / 1024 / 1024).toFixed(2)} MB → ${(after / 1024 / 1024).toFixed(2)} MB`,
);
