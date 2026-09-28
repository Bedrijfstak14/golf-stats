// Genereert het logo en alle PWA-/favicon-varianten in public/.
// Gebruik: npm i --no-save sharp && node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = new URL("../public/", import.meta.url);

/** Vlag op de green met bal; `bold` geeft dikkere lijnen voor 16–48px. */
function art({ bold = false } = {}) {
  const stick = bold ? 34 : 20;
  const fx = 226 + stick / 2 - 2;
  return `
    <ellipse cx="256" cy="392" rx="178" ry="58" fill="#5cbf88"/>
    <ellipse cx="256" cy="384" rx="150" ry="40" fill="#72cf98"/>
    <ellipse cx="226" cy="392" rx="${bold ? 34 : 28}" ry="${bold ? 12 : 10}" fill="#0d3524"/>
    <line x1="226" y1="390" x2="226" y2="104" stroke="#ffffff" stroke-width="${stick}" stroke-linecap="round"/>
    <path d="M${fx} 100 C290 86 322 132 388 116 L356 164 L388 212 C322 228 290 182 ${fx} 196 Z" fill="#f2c94c"/>
    <path d="M${fx} 148 C290 134 322 180 372 168 L388 212 C322 228 290 182 ${fx} 196 Z" fill="#e0ad2b"/>
    <ellipse cx="322" cy="394" rx="${bold ? 30 : 24}" ry="7" fill="#0d3524" opacity=".25"/>
    <circle cx="322" cy="372" r="${bold ? 30 : 24}" fill="#ffffff"/>${
      bold
        ? ""
        : `
    <g fill="#d9ded9">
      <circle cx="314" cy="366" r="3"/><circle cx="326" cy="364" r="3"/><circle cx="332" cy="375" r="3"/>
      <circle cx="320" cy="378" r="3"/><circle cx="310" cy="377" r="3"/>
    </g>`
    }`;
}

const DEFS = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2d9163"/>
      <stop offset="1" stop-color="#13503a"/>
    </linearGradient>
  </defs>`;

/** rounded: afgeronde tegel (favicon/any). Anders volvlak, met de inhoud binnen de maskable safe zone. */
function svg({ rounded = true, bold = false, scale = 1 } = {}) {
  const t = (1 - scale) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
  <rect width="512" height="512"${rounded ? ` rx="112"` : ""} fill="url(#bg)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">${art({ bold })}</g>
</svg>
`;
}

const png = (svgStr, size) => sharp(Buffer.from(svgStr), { density: 384 }).resize(size, size).png().toBuffer();

/** ICO-bestand met PNG-entries (ondersteund door alle gangbare browsers). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size, e);
    header.writeUInt8(size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const any = svg();
const small = svg({ bold: true });
const maskable = svg({ rounded: false, scale: 0.78 });
const apple = svg({ rounded: false, scale: 0.9 });

await mkdir(new URL("icons/", OUT), { recursive: true });
await writeFile(new URL("icon.svg", OUT), any);
const icoImages = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(small, size) })));
await writeFile(new URL("favicon.ico", OUT), ico(icoImages));

const files = {
  "icons/icon-192.png": [any, 192],
  "icons/icon-512.png": [any, 512],
  "icons/maskable-192.png": [maskable, 192],
  "icons/maskable-512.png": [maskable, 512],
  "icons/apple-touch-icon.png": [apple, 180],
};
for (const [name, [s, size]] of Object.entries(files)) await writeFile(new URL(name, OUT), await png(s, size));
console.log("Iconen gegenereerd in public/");
