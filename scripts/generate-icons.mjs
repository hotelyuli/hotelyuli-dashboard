// Generates the app / home-screen icons from the "Y" logo (public/favicon.svg).
// Run: npm run icons   (uses sharp, which is installed with next)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
const inner = source.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const WINE = "#4D333E";

/**
 * Full-bleed square (no transparent corners) with the logo scaled around the centre:
 * iOS rounds the corners itself (transparent corners would turn black), and Android
 * crops maskable icons to a circle - the logo must sit inside the central safe zone.
 */
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${WINE}"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g>
</svg>`;

const outputs = [
  // Same as the favicon (rounded tile): browser tabs and Android "any" icons.
  { file: "public/icons/icon-32.png", size: 32, svg: source },
  { file: "public/icons/icon-192.png", size: 192, svg: source },
  { file: "public/icons/icon-512.png", size: 512, svg: source },
  // Android maskable: the logo's ring (radius 28/64) fits the 40% safe-zone radius.
  { file: "public/icons/icon-maskable-512.png", size: 512, svg: fullBleed(0.82) },
  // iOS home screen.
  { file: "public/apple-touch-icon.png", size: 180, svg: fullBleed(0.88) }
];

await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const { file, size, svg } of outputs) {
  const png = await sharp(Buffer.from(svg), { density: Math.ceil((size / 64) * 72 * 2) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(new URL(`../${file}`, import.meta.url), png);
  console.log(`${file} ${size}x${size} ${png.length} bytes`);
}
