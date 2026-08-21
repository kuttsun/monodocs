#!/usr/bin/env node
// Assert whether a PDF actually carries page numbers, by reading the glyphs it draws.
//
// `verify-published.yml` used to stop at the `%PDF-` header, which a PDF with no page numbers
// passes just as well. Counting text-showing operators is not enough either: the default footer
// contains a literal `/` separator, so a page whose number substitution broke entirely still draws
// something. So the digits themselves are read back — through the `ToUnicode` map of whichever font
// the content stream selected, since the fonts are subsets and a glyph code means nothing on its
// own. Two subset fonts can use the same code for different characters, which is why the map is
// resolved per font rather than merged.
//
// The document it is pointed at must contain no digits of its own; then every digit on a page came
// from the band, and the assertion needs no page coordinates and no knowledge of the transform
// Chromium applies to the printed area. That includes monodocs' own branding footer, which carries
// the CLI version — build the fixture with `html.branding: false`.
//
// Usage:
//   node scripts/assert-pdf-page-numbers.mjs <file.pdf> --expect numbered
//   node scripts/assert-pdf-page-numbers.mjs <file.pdf> --expect none
//
// `pdf-lib` is required and is not a dependency of this repository — the caller installs it
// (`npm install --no-save --no-package-lock pdf-lib`). It is a verification tool, not something
// monodocs ships.

const [file, expectFlag, expected] = process.argv.slice(2);

if (!file || expectFlag !== "--expect" || (expected !== "numbered" && expected !== "none")) {
  console.error(
    "usage: node scripts/assert-pdf-page-numbers.mjs <file.pdf> --expect numbered|none",
  );
  process.exit(2);
}

let pdfLib;
try {
  pdfLib = await import("pdf-lib");
} catch {
  console.error("pdf-lib is not installed. Run: npm install --no-save --no-package-lock pdf-lib");
  process.exit(2);
}

const { PDFDocument, PDFRawStream, PDFArray, PDFDict, PDFName, decodePDFRawStream } = pdfLib;
const { readFileSync } = await import("node:fs");

const doc = await PDFDocument.load(readFileSync(file));

/** Decode one stream, or an array of them, into text the operators can be read out of. */
function streamText(object) {
  const list =
    object instanceof PDFArray ? object.asArray().map((ref) => doc.context.lookup(ref)) : [object];
  let out = "";
  for (const stream of list) {
    if (stream instanceof PDFRawStream) {
      out += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    }
  }
  return out;
}

/** Glyph code -> character, from a font's `ToUnicode` CMap. */
function codeMap(font) {
  const map = new Map();
  const ref = font.get(PDFName.of("ToUnicode"));
  if (!ref) return map;
  const cmap = streamText(doc.context.lookup(ref));
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(entry[1], 16), String.fromCodePoint(parseInt(entry[2].slice(0, 4), 16)));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const low = parseInt(entry[1], 16);
      const high = parseInt(entry[2], 16);
      const destination = parseInt(entry[3].slice(0, 4), 16);
      for (let code = low; code <= high; code++) {
        map.set(code, String.fromCodePoint(destination + (code - low)));
      }
    }
  }
  return map;
}

/** The digit runs a page draws, in the order they are drawn. */
function pageDigits(page) {
  const fonts = new Map();
  const resources = page.node.Resources()?.get(PDFName.of("Font"));
  if (resources instanceof PDFDict) {
    for (const key of resources.keys()) {
      const font = doc.context.lookup(resources.get(key));
      if (font instanceof PDFDict) fonts.set(key.asString().replace(/^\//, ""), codeMap(font));
    }
  }

  const content = streamText(page.node.Contents());
  let current;
  let text = "";
  // `/F1 8 Tf` selects a font; `<hex> Tj` and `[<hex> … ] TJ` draw with the selected one.
  for (const match of content.matchAll(
    /\/([A-Za-z0-9+.-]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ/g,
  )) {
    if (match[1] !== undefined) {
      current = fonts.get(match[1]);
      continue;
    }
    const hexes =
      match[2] !== undefined
        ? [match[2]]
        : [...match[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) => m[1]);
    for (const hex of hexes) {
      for (let i = 0; i + 1 < hex.length; i += 2) {
        const character = current?.get(parseInt(hex.slice(i, i + 2), 16));
        if (character !== undefined) text += character;
      }
    }
    // Deliberately no separator between drawing operations: Chromium emits a multi-digit number as
    // one glyph run per digit, kerned apart, so anything inserted here would split `12` into `1`
    // and `2`. What keeps two different numbers apart is the text between them — the band's own
    // `/` — which is why the fixture has to be free of the document's own digits.
  }
  return text.match(/\d+/g) ?? [];
}

const pages = doc.getPages();
const total = pages.length;
const failures = [];

if (expected === "none") {
  pages.forEach((page, index) => {
    const digits = pageDigits(page);
    if (digits.length > 0) {
      failures.push(`page ${index + 1} draws digits ${JSON.stringify(digits)}, expected none`);
    }
  });
} else {
  // Fewer than three pages would not tell a page number from a total that happens to match it.
  if (total < 3) failures.push(`expected a document of at least 3 pages, got ${total}`);
  pages.forEach((page, index) => {
    const digits = pageDigits(page);
    const want = [String(index + 1), String(total)];
    if (digits.join(" ") !== want.join(" ")) {
      failures.push(
        `page ${index + 1} draws ${JSON.stringify(digits)}, expected ${JSON.stringify(want)}`,
      );
    }
  });
}

if (failures.length > 0) {
  console.error(`${file}: page-number check failed (${total} page(s))`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  expected === "none"
    ? `${file}: no page numbers drawn, as expected (${total} page(s))`
    : `${file}: page numbers drawn on all ${total} page(s)`,
);
