#!/usr/bin/env node
// Assert that a PDF embeds a font, by the name in its font descriptor.
//
// Chromium embeds an OpenType font with CFF outlines — the math font monodocs carries for formulas,
// and the CJK fonts — as a Type 3 font, which `pdffonts` lists as `[none]`; the font descriptor still
// carries the name, as `/ABCDEF+Name` for a subset. The descriptors sit in compressed object streams,
// so the PDF is parsed rather than searched.
//
// Usage:
//   node scripts/assert-pdf-fonts.mjs <file.pdf> --embeds NewCMMath-Book
//
// `pdf-lib` is not a dependency of this repository's root. It is taken from the workspace when the
// script runs in app/ (packages/core reads PDFs with it), and otherwise must be installed by the
// caller (`npm install --no-save --no-package-lock pdf-lib`).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [file, flag, expected] = process.argv.slice(2);
if (!file || flag !== "--embeds" || !expected) {
  console.error("usage: node scripts/assert-pdf-fonts.mjs <file.pdf> --embeds <FontName>");
  process.exit(2);
}

const core = resolve(process.cwd(), "packages/core/package.json");
const { PDFDocument, PDFDict, PDFName } = existsSync(core)
  ? createRequire(core)("pdf-lib")
  : await import("pdf-lib");

const doc = await PDFDocument.load(await readFile(file));
const names = new Set();
for (const [, object] of doc.context.enumerateIndirectObjects()) {
  if (!(object instanceof PDFDict)) continue;
  if (object.get(PDFName.of("Type"))?.toString() !== "/FontDescriptor") continue;
  const name = object.get(PDFName.of("FontName"))?.toString() ?? "";
  names.add(name.replace(/^\/([A-Z]{6}\+)?/, ""));
}

if (!names.has(expected)) {
  console.error(`${file} does not embed ${expected}; it embeds: ${[...names].sort().join(", ")}`);
  process.exit(1);
}
console.log(`${file} embeds ${expected}`);
