import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  PDFRef,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";
import type { DocumentCoverParts } from "../documentMeta.js";
import { escapeAttr, escapeHtml } from "../util/html.js";
import { watermarkRules } from "./watermark.js";

/**
 * The PDF cover (roadmap.md 24.8): what {@link file://./renderPdf.ts} needs to put one in front
 * of the body.
 *
 * The cover is generated from `title` and `document` (13.5), never written by the author, so it
 * cannot disagree with the PDF's own properties. The layout is fixed and has no options.
 */
export type PdfCover = {
  /** A standalone HTML document, rendered on its own without the header and footer bands. */
  html: string;
  /** The printed part of {@link html}: what the cover says, without the page around it. */
  fragment: string;
  /** The page label the viewer shows for the cover sheets, where the body shows 1, 2, 3. */
  pageLabel: string;
};

/** What the cover is made of. */
export type PdfCoverInput = {
  title: string;
  parts: DocumentCoverParts;
  /** The document's language, so the cover's text is shaped the way the body's is. */
  lang: string;
  /** The `cover` label: what the viewer's page number box shows on the cover. */
  pageLabel: string;
  /** `pdf.watermark`, which the cover carries like every other sheet (24.10). */
  watermark?: string;
};

/**
 * The default theme's body stack. The cover is core's own sheet rather than a themed page, but it
 * should not look set in a different typeface from the body that follows it, and for CJK text the
 * stack is also what keeps the title from falling back to a font without the glyphs.
 */
const COVER_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Hiragino Sans", ' +
  "Meiryo, sans-serif";

/**
 * The title sits a third of the way down and the authors at the foot of the sheet. `100vh` is the
 * page box less the margins when Chromium prints, so the sheet fills exactly one page; text that
 * does not fit flows onto a second sheet rather than being clipped, and both are labelled as cover.
 */
const COVER_STYLE =
  "html,body{margin:0;padding:0}" +
  `body{font-family:${COVER_FONT_FAMILY};color:#111;line-height:1.5}` +
  ".monodocs-cover{box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;" +
  "padding-top:30vh;overflow-wrap:anywhere}" +
  ".monodocs-cover-title{margin:0;padding-bottom:0.6em;border-bottom:1.5pt solid #333;" +
  "font-size:26pt;font-weight:700;line-height:1.3}" +
  ".monodocs-cover-meta{margin-top:1.2em;font-size:13pt;color:#333}" +
  ".monodocs-cover-authors{margin-top:auto;font-size:12pt;color:#333}" +
  ".monodocs-cover p{margin:0.2em 0}";

function lines(className: string, values: (string | undefined)[]): string {
  const present = values.filter((value): value is string => value !== undefined);
  if (present.length === 0) return "";
  return (
    `<div class="${className}">` +
    present.map((value) => `<p>${escapeHtml(value)}</p>`).join("") +
    "</div>"
  );
}

/** Builds the cover from the document's title and metadata. Every value is escaped. */
export function buildPdfCover(input: PdfCoverInput): PdfCover {
  const fragment =
    '<main class="monodocs-cover">' +
    `<h1 class="monodocs-cover-title">${escapeHtml(input.title)}</h1>` +
    lines("monodocs-cover-meta", [input.parts.version, input.parts.date]) +
    lines("monodocs-cover-authors", input.parts.authors) +
    "</main>";
  const html =
    `<!doctype html><html lang="${escapeAttr(input.lang)}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(input.title)}</title>` +
    `<style>${COVER_STYLE}${input.watermark ? watermarkRules(input.watermark) : ""}</style></head>` +
    `<body>${fragment}</body></html>`;
  return { html, fragment, pageLabel: input.pageLabel };
}

/**
 * Puts the cover sheets in front of the body and labels the pages so that the viewer's page
 * numbers match the printed ones: the cover carries {@link PdfCover.pageLabel}, and the body is
 * numbered from 1, as its footer already is because it was rendered on its own.
 *
 * The body's pages are not copied, only the cover's are inserted, so the named destinations the
 * outline and the internal links point at keep pointing at the same page objects. Chromium writes
 * tagged PDFs, so the cover's structure tree is carried over too ({@link mergeCoverStructure}).
 */
export async function prependCover(
  bodyBytes: Uint8Array,
  coverBytes: Uint8Array,
  pageLabel: string,
): Promise<Uint8Array> {
  const body = await PDFDocument.load(bodyBytes, { updateMetadata: false });
  const cover = await PDFDocument.load(coverBytes, { updateMetadata: false });
  const coverPageRefs = cover.getPages().map((page) => page.ref);
  // Detach the cover's structure from its pages before the pages are copied, so that copying the
  // structure afterwards cannot pull a second copy of a page in through `/Pg`.
  const structure = detachCoverStructure(cover, coverPageRefs);
  const pages = await body.copyPages(cover, cover.getPageIndices());
  pages.forEach((page, index) => body.insertPage(index, page));
  if (!structure || !mergeCoverStructure(body, cover, structure, pages)) untag(pages);

  const ctx = body.context;
  const coverLabel = PDFDict.fromMapWithContext(
    new Map<PDFName, PDFObject>([[PDFName.of("P"), PDFHexString.fromText(pageLabel)]]),
    ctx,
  );
  const bodyLabel = PDFDict.fromMapWithContext(
    new Map<PDFName, PDFObject>([
      [PDFName.of("S"), PDFName.of("D")],
      [PDFName.of("St"), PDFNumber.of(1)],
    ]),
    ctx,
  );
  const labels = PDFDict.fromMapWithContext(
    new Map<PDFName, PDFObject>([
      [
        PDFName.of("Nums"),
        ctx.obj([PDFNumber.of(0), coverLabel, PDFNumber.of(pages.length), bodyLabel]),
      ],
    ]),
    ctx,
  );
  body.catalog.set(PDFName.of("PageLabels"), labels);
  return body.save();
}

const STRUCT_TREE_ROOT = PDFName.of("StructTreeRoot");
const PARENT_TREE = PDFName.of("ParentTree");
const PARENT_TREE_NEXT_KEY = PDFName.of("ParentTreeNextKey");
const STRUCT_PARENTS = PDFName.of("StructParents");
const NUMS = PDFName.of("Nums");
const K = PDFName.of("K");
const P = PDFName.of("P");
const PG = PDFName.of("Pg");
const TYPE = PDFName.of("Type");

/** The cover's structure, with each `/Pg` replaced by the index of the cover sheet it named. */
type DetachedStructure = {
  /** The structure elements directly under the cover's root, their `/P` removed. */
  tops: PDFRef[];
  /** The cover's parent tree as `[key, value]` pairs. */
  entries: [number, PDFObject][];
  nextKey: number;
};

/** Every dictionary reachable through `/K` from `start`, each once. */
function structureDicts(doc: PDFDocument, start: PDFObject | undefined): PDFDict[] {
  const out: PDFDict[] = [];
  const seen = new Set<PDFObject>();
  const visit = (obj: PDFObject | undefined): void => {
    if (obj === undefined || seen.has(obj)) return;
    seen.add(obj);
    const value = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
    if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i++) visit(value.get(i));
    } else if (value instanceof PDFDict) {
      out.push(value);
      visit(value.get(K));
    }
  };
  visit(start);
  return out;
}

/** A parent tree written as a flat `/Nums` array, as Chromium writes it. Otherwise undefined. */
function parentTreeEntries(root: PDFDict): [number, PDFObject][] | undefined {
  const tree = root.lookup(PARENT_TREE);
  if (!(tree instanceof PDFDict)) return undefined;
  const nums = tree.lookup(NUMS);
  if (!(nums instanceof PDFArray) || nums.size() % 2 !== 0) return undefined;
  const entries: [number, PDFObject][] = [];
  for (let i = 0; i < nums.size(); i += 2) {
    const key = nums.lookup(i);
    if (!(key instanceof PDFNumber)) return undefined;
    entries.push([key.asNumber(), nums.get(i + 1)]);
  }
  return entries;
}

/**
 * Prepares the cover's structure for copying: `/Pg` becomes the index of the sheet, and the top
 * elements lose the `/P` that points at the cover's root. Undefined when the cover is untagged or
 * its structure has a shape this does not move — an object reference (`/OBJR`) would drag an
 * annotation, and through it a page, across; a parent tree with `/Kids` is not read.
 */
function detachCoverStructure(
  cover: PDFDocument,
  pageRefs: PDFRef[],
): DetachedStructure | undefined {
  const root = cover.catalog.lookup(STRUCT_TREE_ROOT);
  if (!(root instanceof PDFDict)) return undefined;
  const entries = parentTreeEntries(root);
  if (entries === undefined) return undefined;
  const kids = root.get(K);
  const list = kids instanceof PDFArray ? kids.asArray() : kids ? [kids] : [];
  // An element written inline rather than by reference cannot be given a new `/P` after copying.
  if (!list.every((kid) => kid instanceof PDFRef)) return undefined;
  const tops = list as PDFRef[];
  const dicts = structureDicts(cover, kids);
  if (dicts.some((dict) => dict.lookup(TYPE) === PDFName.of("OBJR"))) return undefined;
  for (const dict of dicts) {
    const page = dict.get(PG);
    if (page === undefined) continue;
    const index = pageRefs.findIndex((ref) => ref === page);
    if (index < 0) return undefined;
    dict.set(PG, PDFNumber.of(index));
  }
  for (const top of tops) (cover.context.lookup(top) as PDFDict).delete(P);
  const next = root.lookup(PARENT_TREE_NEXT_KEY);
  const nextKey =
    next instanceof PDFNumber ? next.asNumber() : Math.max(-1, ...entries.map(([k]) => k)) + 1;
  return { tops, entries, nextKey };
}

/**
 * Moves the cover's structure into the body's, in front of the body's own elements.
 *
 * Without this the copied cover sheets keep `/StructParents` keys from the cover's parent tree,
 * which the body's parent tree resolves to the body's elements: measured, the cover's key 0 named
 * the elements of the body's first sheet. The cover's keys are therefore moved past the body's.
 * Returns false when either tree has a shape this does not merge, and the caller untags the cover.
 */
function mergeCoverStructure(
  body: PDFDocument,
  cover: PDFDocument,
  structure: DetachedStructure,
  pages: PDFPage[],
): boolean {
  const root = body.catalog.lookup(STRUCT_TREE_ROOT);
  if (!(root instanceof PDFDict)) return false;
  const rootRef = body.catalog.get(STRUCT_TREE_ROOT);
  if (!(rootRef instanceof PDFRef)) return false;
  const bodyEntries = parentTreeEntries(root);
  if (bodyEntries === undefined) return false;
  const next = root.lookup(PARENT_TREE_NEXT_KEY);
  const offset = Math.max(
    next instanceof PDFNumber ? next.asNumber() : 0,
    ...bodyEntries.map(([key]) => key + 1),
  );

  const copier = PDFObjectCopier.for(cover.context, body.context);
  const tops = structure.tops.map((top) => copier.copy(top));
  const entries = structure.entries.map(([key, value]) => [key + offset, copier.copy(value)]);

  for (const dict of structureDicts(body, body.context.obj(tops))) {
    const index = dict.get(PG);
    if (index instanceof PDFNumber) dict.set(PG, pages[index.asNumber()]!.ref);
  }
  for (const top of tops) (body.context.lookup(top) as PDFDict).set(P, rootRef);

  const kids = root.get(K);
  const bodyKids = kids instanceof PDFArray ? kids.asArray() : kids ? [kids] : [];
  root.set(K, body.context.obj([...tops, ...bodyKids]));
  const nums = (root.lookup(PARENT_TREE) as PDFDict).lookup(NUMS) as PDFArray;
  for (const [key, value] of entries) {
    nums.push(PDFNumber.of(key as number));
    nums.push(value as PDFObject);
  }
  root.set(PARENT_TREE_NEXT_KEY, PDFNumber.of(offset + structure.nextKey));
  for (const page of pages) {
    const key = page.node.lookup(STRUCT_PARENTS);
    if (key instanceof PDFNumber)
      page.node.set(STRUCT_PARENTS, PDFNumber.of(key.asNumber() + offset));
  }
  return true;
}

/**
 * The fallback: the cover's sheets drop their `/StructParents`, so their content is untagged rather
 * than attributed to elements of the body.
 */
function untag(pages: PDFPage[]): void {
  for (const page of pages) page.node.delete(STRUCT_PARENTS);
}
