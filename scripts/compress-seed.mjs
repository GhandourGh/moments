/**
 * Compress Pexels source photos into web-ready seed gallery + hero assets.
 * Run from guest-ui: npm run compress-seed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const seedDir = path.join(publicDir, "seed");
const sourcesDir = path.join(root, "..");

const SEED_MAX_EDGE = 1400;
const SEED_QUALITY = 78;
const HERO_MAX_WIDTH = 1920;
const HERO_QUALITY = 80;

function findPexelsSources() {
  return fs
    .readdirSync(sourcesDir)
    .filter((f) => /^pexels.+\.(jpe?g)$/i.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(sourcesDir, f));
}

async function compressSeed(input, output) {
  const before = fs.statSync(input).size;
  await sharp(input)
    .rotate()
    .resize({ width: SEED_MAX_EDGE, height: SEED_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: SEED_QUALITY, mozjpeg: true })
    .toFile(output);
  const after = fs.statSync(output).size;
  const meta = await sharp(output).metadata();
  return { before, after, w: meta.width, h: meta.height };
}

async function compressHero(input, output) {
  const before = fs.statSync(input).size;
  await sharp(input)
    .rotate()
    .resize({ width: HERO_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: HERO_QUALITY, mozjpeg: true })
    .toFile(output);
  const after = fs.statSync(output).size;
  const meta = await sharp(output).metadata();
  return { before, after, w: meta.width, h: meta.height };
}

async function pickHeroSource(sources) {
  let best = sources[0];
  let bestScore = -1;
  for (const src of sources) {
    const meta = await sharp(src).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const score = w >= h ? w : 0;
    if (score > bestScore) {
      bestScore = score;
      best = src;
    }
  }
  return best;
}

const sources = findPexelsSources();
if (!sources.length) {
  console.error("No pexels*.jpg files found in", sourcesDir);
  process.exit(1);
}

fs.mkdirSync(seedDir, { recursive: true });

// Remove previous seed + hero assets before writing new ones.
for (const f of fs.readdirSync(seedDir)) {
  if (/^seed-\d+\.jpg$/i.test(f)) fs.unlinkSync(path.join(seedDir, f));
}

console.log(`Processing ${sources.length} Pexels photos…\n`);

let totalBefore = 0;
let totalAfter = 0;

for (let i = 0; i < sources.length; i++) {
  const out = path.join(seedDir, `seed-${String(i + 1).padStart(2, "0")}.jpg`);
  const { before, after, w, h } = await compressSeed(sources[i], out);
  totalBefore += before;
  totalAfter += after;
  console.log(
    `  seed-${String(i + 1).padStart(2, "0")}.jpg  ${w}×${h}  ` +
      `${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`,
  );
}

const heroSource = await pickHeroSource(sources);
const heroPath = path.join(publicDir, "hero.jpg");
const hero = await compressHero(heroSource, heroPath);
console.log(
  `\n  hero.jpg (from ${path.basename(heroSource)})  ${hero.w}×${hero.h}  ` +
    `${(hero.before / 1024).toFixed(0)} KB → ${(hero.after / 1024).toFixed(0)} KB`,
);

console.log(
  `\nTotal seed: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`,
);
