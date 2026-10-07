// Add a 1px grey border to a PPM (P6) written by pdftoppm and save it as a PNG.
//
// A white sheet cannot be told apart from GitHub's light background, so the README sample images
// mark the edge of the paper with a border. The dev image has no image tools, so this uses only the
// Node standard library.
//
//   node frame-ppm.mjs <input.ppm> <output.png>
import { readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const [input, output] = process.argv.slice(2);
const ppm = readFileSync(input);

// The header is "P6 <width> <height> <maxval>" separated by whitespace, and one whitespace byte
// precedes the pixels.
const header = [];
let offset = 0;
while (header.length < 4) {
  while (/\s/.test(String.fromCharCode(ppm[offset]))) offset++;
  const start = offset;
  while (!/\s/.test(String.fromCharCode(ppm[offset]))) offset++;
  header.push(ppm.toString("latin1", start, offset));
}
offset++;
const [magic, w, h, max] = header;
if (magic !== "P6" || max !== "255") throw new Error(`Unsupported PPM: ${magic} ${max}`);
const width = Number(w);
const height = Number(h);

const border = [0xd0, 0xd7, 0xde]; // GitHub's border colour
const outWidth = width + 2;
const outHeight = height + 2;
const rowBytes = 1 + outWidth * 3; // each row starts with its filter type (0 = none)
const raw = Buffer.alloc(rowBytes * outHeight);
for (let y = 0; y < outHeight; y++) {
  for (let x = 0; x < outWidth; x++) {
    const at = y * rowBytes + 1 + x * 3;
    if (x === 0 || y === 0 || x === outWidth - 1 || y === outHeight - 1) {
      raw.set(border, at);
    } else {
      const from = offset + ((y - 1) * width + (x - 1)) * 3;
      ppm.copy(raw, at, from, from + 3);
    }
  }
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(outWidth, 0);
ihdr.writeUInt32BE(outHeight, 4);
ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB; default compression, filter, and interlace
writeFileSync(
  output,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
