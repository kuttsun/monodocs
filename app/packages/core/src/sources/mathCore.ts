import type { Element, ElementContent } from "hast";
import { EXIT, SKIP, visit } from "unist-util-visit";

/**
 * KaTeX's MathML as MathML Core reads it (roadmap 6.4).
 *
 * KaTeX writes MathML for MathML 3 renderers, and Chromium implements MathML Core, which leaves out or
 * reads differently a number of the elements and attributes KaTeX uses. Each one that changes what a
 * formula says is rewritten here into what Core draws the same way, mostly with inline CSS; one that
 * cannot be is returned, to be reported.
 */

/**
 * The largest size, in em, a formula may ask for (`\rule`, `\kern`, `\hspace`, `\raisebox`, and the
 * like). KaTeX's own `maxSize` does not reach every size it writes into MathML — `\raisebox` keeps the
 * unit it was given — so the MathML's sizes are limited in {@link normalizeLengths}.
 */
const MAX_SIZE_EM = 100;

/** A TeX length as written: its sign, size, and unit, and whether it was written relative (`+6pt`). */
interface Length {
  size: number;
  unit: string;
  relative: boolean;
}

function parseLength(value: unknown): Length | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^([-+]?)(Infinity|(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z]{2})$/i.exec(value.trim());
  const unit = m?.[3]!.toLowerCase();
  if (!m || unit === undefined || UNITS_PER_EM[unit] === undefined) return undefined;
  const size = Number(m[2]);
  return { size: m[1] === "-" ? -size : size, unit, relative: m[1] !== "" };
}

/** The units CSS reads as TeX means them (TeX's point is within 0.4% of CSS's); the others are converted. */
const CSS_UNITS = new Set(["em", "ex", "pt", "mm", "cm", "in", "pc"]);

/**
 * A TeX length as MathML Core reads it, within {@link MAX_SIZE_EM}: a unit CSS has stays, so that an
 * absolute length stays absolute and a relative one relative; `mu` becomes em, as it is a fraction of
 * one; TeX's other absolute units (`bp`, `dd`, `cc`, `nd`, `nc`, `sp`, and KaTeX's `px`) become points.
 */
function cssLength(length: Length): string {
  const inEm = length.size / UNITS_PER_EM[length.unit]!;
  if (!(Math.abs(inEm) <= MAX_SIZE_EM)) return `${inEm < 0 ? "-" : ""}${MAX_SIZE_EM}em`;
  const round = (n: number) => Number(n.toFixed(4));
  if (CSS_UNITS.has(length.unit)) return `${round(length.size)}${length.unit}`;
  if (length.unit === "mu") return `${round(inEm)}em`;
  return `${round(inEm * 10)}pt`;
}

/** A length in em, for arithmetic between lengths. */
const inEm = (length: Length | undefined) =>
  length ? length.size / UNITS_PER_EM[length.unit]! : 0;

/**
 * Write every length as MathML Core reads it (see {@link cssLength}), and the `mpadded` forms it reads
 * differently from KaTeX:
 *
 * - a signed amount that grows the content (`width="+6pt" lspace="3pt"`, for `\colorbox` and
 *   `\fcolorbox`) is read as an absolute size, so that the box would not fit what it holds: it becomes
 *   padding around the content;
 * - a `voffset` alone (`\raisebox`) moves the content without making room for it, so that a display
 *   formula's box cuts it off: room is made on the side it moves to, as TeX does;
 * - a size in the content's own width (`lspace="-1width"`, for `\mathllap` and `\mathclap`) is not a
 *   length at all: the content is moved by that fraction of its width with a transform.
 */
function normalizeLengths(math: Element): void {
  visit(math, "element", (node: Element) => {
    if (node.tagName === "mpadded") {
      growByPadding(node);
      makeRoomForOffset(node);
      shiftByOwnWidth(node);
    }
    for (const [key, value] of Object.entries(node.properties)) {
      const length = parseLength(value);
      if (length) node.properties[key] = cssLength(length);
    }
  });
}

export function addStyle(node: Element, style: string): void {
  node.properties.style =
    typeof node.properties.style === "string" ? `${style}; ${node.properties.style}` : style;
}

function growByPadding(node: Element): void {
  const width = parseLength(node.properties.width);
  const height = parseLength(node.properties.height);
  const depth = parseLength(node.properties.depth);
  if (!width?.relative && !height?.relative && !depth?.relative) return;
  const lspace = parseLength(node.properties.lspace);
  const voffset = parseLength(node.properties.voffset);
  const padding = [
    (height?.relative ? inEm(height) : 0) - inEm(voffset),
    (width?.relative ? inEm(width) : 0) - inEm(lspace),
    (depth?.relative ? inEm(depth) : 0) + inEm(voffset),
    inEm(lspace),
  ];
  // Shrinking has no padding to become; such an mpadded is left as KaTeX wrote it.
  if (padding.some((p) => p < 0)) return;
  for (const key of ["width", "height", "depth", "lspace", "voffset"]) delete node.properties[key];
  // In the unit KaTeX grew the box by, when it used one (points for \\colorbox, em for an arrow's
  // label, which then follows the label's size); in points when it mixed them.
  const units = new Set(
    [width, height, depth, lspace, voffset].filter((l) => l !== undefined).map((l) => l.unit),
  );
  const unit = units.size === 1 && CSS_UNITS.has([...units][0]!) ? [...units][0]! : "pt";
  const inUnit = (n: number) => cssLength({ size: n * UNITS_PER_EM[unit]!, unit, relative: false });
  addStyle(node, `padding: ${padding.map(inUnit).join(" ")}`);
}

function makeRoomForOffset(node: Element): void {
  const voffset = parseLength(node.properties.voffset);
  if (!voffset || voffset.size === 0) return;
  if (node.properties.height !== undefined || node.properties.depth !== undefined) return;
  const room = cssLength({ ...voffset, size: Math.abs(voffset.size), relative: false });
  addStyle(node, voffset.size > 0 ? `padding-top: ${room}` : `padding-bottom: ${room}`);
}

function shiftByOwnWidth(node: Element): void {
  const m =
    typeof node.properties.lspace === "string"
      ? /^([-+]?(?:\d+\.?\d*|\.\d+))width$/.exec(node.properties.lspace.trim())
      : null;
  if (!m) return;
  delete node.properties.lspace;
  node.children = [
    {
      type: "element",
      tagName: "mrow",
      properties: { style: `transform: translateX(${Number(m[1]) * 100}%)` },
      children: node.children,
    },
  ];
}

/**
 * How many of each TeX unit make an em, taking an em as 10pt as KaTeX does; `ex` and `mu` are KaTeX's
 * own proportions. A unit not listed is left alone.
 */
const UNITS_PER_EM: Record<string, number> = {
  em: 1,
  ex: 1 / 0.431,
  mu: 18,
  pt: 10,
  mm: 10 / (72.27 / 25.4),
  cm: 10 / (72.27 / 2.54),
  in: 10 / 72.27,
  bp: 10 / (72.27 / 72),
  pc: 10 / 12,
  dd: 10 / (1238 / 1157),
  cc: 10 / (14856 / 1157),
  nd: 10 / (685 / 642),
  nc: 10 / (1370 / 107),
  sp: 10 * 65536,
  // KaTeX's px is 803/800 of a point, not CSS's 1/96 inch.
  px: 10 / (803 / 800),
};

/** A line as thick as KaTeX draws its rules. */
const LINE = "0.06em";
const strike = (direction: string) =>
  `linear-gradient(${direction}, transparent calc(50% - ${LINE} / 2), currentColor calc(50% - ${LINE} / 2), ` +
  `currentColor calc(50% + ${LINE} / 2), transparent calc(50% + ${LINE} / 2))`;

/** The CSS each `menclose` notation becomes: borders for the sides, gradients for the strikes. */
const ENCLOSURES: Record<string, { border?: string[]; radius?: boolean; strike?: string }> = {
  box: { border: ["top", "right", "bottom", "left"] },
  roundedbox: { border: ["top", "right", "bottom", "left"], radius: true },
  top: { border: ["top"] },
  bottom: { border: ["bottom"] },
  left: { border: ["left"] },
  right: { border: ["right"] },
  actuarial: { border: ["top", "right"] },
  // A gradient's stripe runs across its direction: "to bottom right" draws the stripe from the bottom
  // left corner to the top right one.
  updiagonalstrike: { strike: strike("to bottom right") },
  downdiagonalstrike: { strike: strike("to top right") },
  horizontalstrike: { strike: strike("to bottom") },
  verticalstrike: { strike: strike("to right") },
};

/**
 * `menclose` is not in MathML Core, so Chromium draws its content and nothing around it: `\cancel`
 * would show the term it cancels, and `\boxed` no box. Each one becomes an `mrow` drawing its
 * notations with an inline style, as KaTeX itself does for `\fcolorbox`: borders around the term,
 * strikes on an element laid over it. A notation CSS cannot draw
 * this way (`phasorangle`, `circle`, `longdiv`, and the rest) is returned to be reported.
 */
function drawEnclosures(math: Element): string[] {
  const unsupported = new Set<string>();
  visit(math, "element", (node: Element) => {
    if (node.tagName !== "menclose") return;
    const notations = String(node.properties.notation ?? "longdiv")
      .split(/\s+/)
      .filter(Boolean);
    const borders = new Set<string>();
    const strikes: string[] = [];
    let radius = false;
    for (const notation of notations) {
      const drawn = ENCLOSURES[notation];
      if (!drawn) {
        unsupported.add(notation);
        continue;
      }
      drawn.border?.forEach((side) => borders.add(side));
      if (drawn.strike) strikes.push(drawn.strike);
      radius ||= drawn.radius === true;
    }
    const style = [
      ...[...borders].map((side) => `border-${side}: ${LINE} solid`),
      borders.size > 0 ? "padding: 0.15em" : "",
      radius ? "border-radius: 0.3em" : "",
      strikes.length > 0 ? "position: relative" : "",
      typeof node.properties.style === "string" ? node.properties.style : "",
    ].filter(Boolean);
    node.tagName = "mrow";
    delete node.properties.notation;
    if (style.length > 0) node.properties.style = style.join("; ");
    if (strikes.length > 0) {
      // The strikes are drawn over the term, by an empty element laid over it, so that a background
      // in the term (`\colorbox`) cannot hide them; and they are printed even with
      // `pdf.printBackground` off, since a cancelled term that prints uncancelled changes the formula.
      node.children.push({
        type: "element",
        tagName: "mrow",
        properties: {
          style:
            `position: absolute; inset: 0; background-image: ${strikes.join(", ")}; ` +
            "print-color-adjust: exact; -webkit-print-color-adjust: exact",
        },
        children: [],
      });
    }
  });
  return [...unsupported];
}

// --- Entry point --------------------------------------------------------------------------------

/** What a formula uses that MathML Core cannot draw as KaTeX means it, after the rewrites. */
export interface CoreGaps {
  /** `menclose` notations CSS cannot draw. */
  notations: string[];
  /** Other constructs, named as an author writes them. */
  constructs: string[];
}

/** Rewrite KaTeX's MathML in place into what MathML Core draws as KaTeX means it. */
export function rewriteForCore(math: Element): CoreGaps {
  const constructs = new Set<string>();
  visit(math, "element", (node: Element) => {
    const className = node.properties.className;
    if (Array.isArray(className) && className.includes("vcenter")) constructs.add("\\vcenter");
    if (node.tagName === "mo" && textOf(node) === "undefined") {
      // \overlinesegment and \underlinesegment have no MathML character in KaTeX, which writes
      // "undefined"; an overline is the nearest, without the segment's end ticks.
      node.children = [{ type: "text", value: "\u203E" }];
      constructs.add("\\overlinesegment, \\underlinesegment");
    }
  });
  fixFrameSides(math);
  visit(math, "element", (node: Element) => {
    if (node.tagName === "mtable") rewriteTable(node, constructs);
  });
  // A table as wide as the formula (`\\tag`, which KaTeX sets in a full-width table to put the tag
  // at the right margin) needs every box from the formula down to it as wide as the line: a display
  // formula, `semantics`, and an `mrow` fit their content otherwise.
  visit(math, "element", (node: Element) => {
    if (
      node.tagName !== "mtable" ||
      !/(?:^|;\s*)width: 100%/.test(String(node.properties.style ?? ""))
    ) {
      return;
    }
    for (let box = parentOf(math, node); box; box = parentOf(math, box))
      addStyle(box, "width: 100%");
  });
  breakLines(math, constructs);
  negativeSpaces(math);
  braceAccents(math);
  spacingAccents(math);
  drawLines(math);
  normalizeLengths(math);
  const notations = drawEnclosures(math);
  return { notations, constructs: [...constructs] };
}

function parentOf(root: Element, node: Element): Element | undefined {
  let found: Element | undefined;
  visit(root, "element", (candidate: Element) => {
    if (candidate.children.includes(node)) {
      found = candidate;
      return EXIT;
    }
  });
  return found;
}

function textOf(node: Element): string {
  return node.children.map((c) => (c.type === "text" ? c.value : "")).join("");
}

// --- Tables -------------------------------------------------------------------------------------

/**
 * KaTeX frames an array with a `menclose` whose notation names the wrong sides: a leading `|` as
 * `top`, a trailing one as `bottom`, and the first and last `\\hline` as `left` and `right`. A
 * `menclose` holding a table gets its sides put right.
 */
function fixFrameSides(math: Element): void {
  const swap: Record<string, string> = {
    top: "left",
    bottom: "right",
    left: "top",
    right: "bottom",
  };
  visit(math, "element", (node: Element) => {
    if (node.tagName !== "menclose" || !holdsTable(node)) return;
    const notation = String(node.properties.notation ?? "");
    // Only the sides KaTeX's array frame uses; `\\cancel` around a table is not a frame.
    if (!notation.split(/\s+/).every((n) => n in swap)) return;
    node.properties.notation = notation
      .split(/\s+/)
      .map((n) => swap[n] ?? n)
      .join(" ");
    visit(node, "element", (inner: Element) => {
      if (inner.tagName === "mtable") {
        framedTables.add(inner);
        return SKIP;
      }
    });
  });
}

function holdsTable(node: Element): boolean {
  const children = node.children.filter((c): c is Element => c.type === "element");
  if (children.length !== 1) return false;
  const only = children[0]!;
  return only.tagName === "mtable" || (only.tagName === "mstyle" && holdsTable(only));
}

/**
 * MathML Core lays out a table with its own cell padding and ignores `columnalign`,
 * `columnspacing`, `rowspacing`, `columnlines`, `rowlines`, and a `width` on a table or cell: the
 * columns of `aligned` and `cases` would be centred, and the lines of an augmented matrix gone. Each
 * becomes CSS on the cells: `text-align` (in the `-webkit-` values Chromium aligns a cell's content
 * by), padding (half the spacing on either side of a boundary, none at an unframed table's edges),
 * borders for the lines, and `width`.
 */
function rewriteTable(table: Element, constructs: Set<string>): void {
  const p = table.properties;
  const list = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim().split(/\s+/) : [];
  const align = list(p.columnalign);
  const columnSpacing = list(p.columnspacing);
  const rowSpacing = list(p.rowspacing);
  const columnLines = list(p.columnlines);
  const rowLines = list(p.rowlines);
  // `columnalign` stays for the browsers that read it (Firefox); the rest would draw twice there.
  for (const key of ["columnspacing", "rowspacing", "columnlines", "rowlines"]) {
    delete p[key];
  }
  if (typeof p.width === "string") {
    addStyle(table, `width: ${p.width}`);
    delete p.width;
  }
  const at = (values: string[], i: number) =>
    values.length > 0 ? values[Math.min(i, values.length - 1)] : undefined;
  const half = (value: string | undefined) => {
    const length = parseLength(value);
    if (!length) return "0";
    // A negative gap (`\\arraystretch` below 1) would draw the rows closer than their content,
    // which padding cannot give; it is reported, and the rows get no extra room.
    if (length.size < 0) {
      constructs.add("\\arraystretch below 1");
      return "0";
    }
    return cssLength({ ...length, size: length.size / 2, relative: false });
  };
  const framed = isFramed(table);
  padRows(table, align.length);
  const rows = table.children.filter(
    (c): c is Element =>
      c.type === "element" && (c.tagName === "mtr" || c.tagName === "mlabeledtr"),
  );
  rows.forEach((row, r) => {
    const cells = row.children.filter(
      (c): c is Element => c.type === "element" && c.tagName === "mtd",
    );
    cells.forEach((cell, c) => {
      const style: string[] = [];
      const alignment = at(align, c);
      // Chromium aligns a cell's content by the legacy values only; `right` and `left` are ignored.
      if (alignment === "left" || alignment === "right")
        style.push(`text-align: -webkit-${alignment}`);
      const edge = (spacing: string | undefined) => (framed ? half(spacing) : "0");
      if (columnSpacing.length > 0) {
        style.push(
          `padding-left: ${c > 0 ? half(at(columnSpacing, c - 1)) : edge(at(columnSpacing, 0))}`,
        );
        style.push(
          `padding-right: ${c < cells.length - 1 ? half(at(columnSpacing, c)) : edge(at(columnSpacing, 0))}`,
        );
      }
      if (rowSpacing.length > 0) {
        style.push(`padding-top: ${r > 0 ? half(at(rowSpacing, r - 1)) : "0"}`);
        style.push(`padding-bottom: ${r < rows.length - 1 ? half(at(rowSpacing, r)) : "0"}`);
      }
      const columnLine = c < cells.length - 1 ? at(columnLines, c) : undefined;
      if (columnLine === "solid" || columnLine === "dashed") {
        style.push(`border-right: ${LINE} ${columnLine}`);
      }
      const rowLine = r < rows.length - 1 ? at(rowLines, r) : undefined;
      if (rowLine === "solid" || rowLine === "dashed")
        style.push(`border-bottom: ${LINE} ${rowLine}`);
      if (typeof cell.properties.width === "string") {
        style.push(`width: ${cell.properties.width}`);
        delete cell.properties.width;
      }
      if (style.length > 0) addStyle(cell, style.join("; "));
    });
  });
}

/**
 * KaTeX writes a row with fewer cells than the table has columns (`a\\\\b&c` in a two-column array)
 * as it is; the missing cells are added, empty, so that a column's line and spacing reach every row.
 */
function padRows(table: Element, declared: number): void {
  const rows = table.children.filter(
    (c): c is Element =>
      c.type === "element" && (c.tagName === "mtr" || c.tagName === "mlabeledtr"),
  );
  const cellsOf = (row: Element) =>
    row.children.filter((c): c is Element => c.type === "element" && c.tagName === "mtd").length;
  const columns = Math.max(declared, ...rows.map(cellsOf));
  for (const row of rows) {
    for (let n = cellsOf(row); n < columns; n++) {
      row.children.push({ type: "element", tagName: "mtd", properties: {}, children: [] });
    }
  }
}

/** Whether a table sits in a frame (`\\begin{array}{|c|}`), whose lines need room from the cells. */
function isFramed(table: Element): boolean {
  return framedTables.has(table);
}

const framedTables = new WeakSet<Element>();

// --- Line breaks --------------------------------------------------------------------------------

/**
 * `\\\\` and `\\newline` outside an array are `mspace linebreak="newline"`, which MathML Core does
 * not break at, so the lines would run together. At the top of a formula the lines become the rows of
 * a one-column table; deeper in (inside a fraction, say) that is not possible, and it is reported.
 */
function breakLines(math: Element, constructs: Set<string>): void {
  const isBreak = (n: ElementContent) =>
    n.type === "element" && n.tagName === "mspace" && n.properties.linebreak === "newline";
  const semantics = math.children.find((c): c is Element => c.type === "element");
  const top =
    semantics?.tagName === "semantics"
      ? semantics.children.find((c): c is Element => c.type === "element")
      : undefined;
  if (top?.tagName === "mrow" && top.children.some(isBreak)) {
    const lines: ElementContent[][] = [[]];
    // `\\\\[2em]` asks for room below its line, which becomes the line's cell padding.
    const extra: (string | undefined)[] = [];
    for (const child of top.children) {
      if (isBreak(child)) {
        // Room asked for below a line; a negative amount (drawing the lines closer) is not something
        // padding can give, and is reported.
        const height = parseLength((child as Element).properties.height);
        if (height && height.size < 0) constructs.add("\\\\[...] with a negative height");
        extra[lines.length - 1] =
          height && height.size > 0 ? cssLength({ ...height, relative: false }) : undefined;
        lines.push([]);
      } else lines[lines.length - 1]!.push(child);
    }
    top.children = [
      {
        type: "element",
        tagName: "mtable",
        properties: {},
        children: lines.map((line, i) => ({
          type: "element",
          tagName: "mtr",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "mtd",
              properties: {
                style: extra[i] ? `padding: 0 0 ${extra[i]} 0` : "padding: 0",
              },
              children: [{ type: "element", tagName: "mrow", properties: {}, children: line }],
            },
          ],
        })),
      },
    ];
  }
  visit(math, "element", (node: Element) => {
    if (isBreak(node)) {
      constructs.add("\\\\ (a line break inside a part of a formula)");
      delete node.properties.linebreak;
    }
  });
}

// --- Spaces -------------------------------------------------------------------------------------

/** The characters KaTeX writes for a negative space, and the space each stands for, in em. */
const NEGATIVE_SPACES: Record<string, number> = {
  "\u200a\u2063": -0.0556,
  "\u2009\u2063": -0.1667,
  "\u205f\u2063": -0.2222,
  "\u2005\u2063": -0.2778,
};

/**
 * A negative space (`\\!`, `\\negmedspace`, a negative `\\kern`) draws the terms around it closer,
 * and MathML Core has no negative width: KaTeX's characters for one are drawn as a positive space, and
 * a negative `mspace` width is ignored. Both become a zero-width `mspace` with a negative margin.
 */
function negativeSpaces(math: Element): void {
  visit(math, "element", (node: Element, index, parent) => {
    if (node.tagName === "mtext" && parent && index !== undefined) {
      const width = NEGATIVE_SPACES[textOf(node)];
      if (width !== undefined) {
        parent.children[index] = {
          type: "element",
          tagName: "mspace",
          properties: { width: "0em", style: `margin-left: ${width}em` },
          children: [],
        };
      }
      return;
    }
    if (node.tagName !== "mspace") return;
    const width = parseLength(node.properties.width);
    if (!width || width.size >= 0) return;
    node.properties.width = "0em";
    addStyle(node, `margin-left: ${cssLength({ ...width, relative: false })}`);
  });
}

// --- Accents ------------------------------------------------------------------------------------

/**
 * KaTeX writes `\\bar`, `\\acute` and `\\grave` as spacing modifier letters (U+02C9, U+02CA,
 * U+02CB), which a math font need not have: Latin Modern Math has none of them, so the browser takes
 * them from another font, and on a Japanese page that is a CJK font's full-width glyph, wider than
 * the letter and set off from it. Each becomes the Latin-1 character MathML's operator dictionary
 * lists as the same accent (U+00AF, U+00B4, U+0060), which every Latin font has. Measured in
 * Chromium with Latin Modern Math under `lang="ja"`: the bar over x 28px wide and 9px left of it
 * before, 14px and centred after.
 */
const SPACING_ACCENTS: Record<string, string> = {
  "\u02C9": "\u00AF",
  "\u02CA": "\u00B4",
  "\u02CB": "\u0060",
};

function spacingAccents(math: Element): void {
  visit(math, "element", (node: Element) => {
    if (node.tagName !== "mover") return;
    const script = node.children.filter((c): c is Element => c.type === "element")[1];
    if (script?.tagName !== "mo") return;
    const replacement = SPACING_ACCENTS[textOf(script)];
    if (replacement !== undefined) script.children = [{ type: "text", value: replacement }];
  });
}

/**
 * `\\overline` and `\\underline` are a rule as wide as the term, which KaTeX writes as a stretchy
 * `‾` (U+203E) over or under it. Whether that stretches is the font's: Latin Modern Math has no
 * `‾`, and the browser drew a fallback font's, one letter wide over a longer term. The line becomes
 * a border on an `mrow` around the term, as an enclosure's does, which is as wide as the term
 * whatever the font.
 */
function drawLines(math: Element): void {
  visit(math, "element", (node: Element) => {
    const over = node.tagName === "mover";
    if (!over && node.tagName !== "munder") return;
    const [base, script, ...rest] = node.children.filter((c): c is Element => c.type === "element");
    if (!base || script?.tagName !== "mo" || rest.length > 0 || textOf(script) !== "\u203E") return;
    node.tagName = "mrow";
    node.properties = {};
    node.children = [base];
    addStyle(
      node,
      over
        ? `border-top: ${LINE} solid; padding-top: 0.1em`
        : `border-bottom: ${LINE} solid; padding-bottom: 0.1em`,
    );
  });
}

// --- Braces -------------------------------------------------------------------------------------

/**
 * `\\overbrace` and `\\underbrace` set the brace as an accent in TeX, full size and close to the term;
 * KaTeX leaves `accent` unset, which MathML Core reads as false, so the brace would be a small script
 * set apart. The brace's own `mover` or `munder` is marked as an accent.
 */
function braceAccents(math: Element): void {
  const over = new Set(["\u23DE", "\u23B4"]);
  const under = new Set(["\u23DF", "\u23B5"]);
  visit(math, "element", (node: Element) => {
    if (node.tagName !== "mover" && node.tagName !== "munder") return;
    const script = node.children.filter((c): c is Element => c.type === "element")[1];
    if (script?.tagName !== "mo") return;
    const brace = textOf(script);
    if (node.tagName === "mover" && over.has(brace)) node.properties.accent = "true";
    if (node.tagName === "munder" && under.has(brace)) node.properties.accentunder = "true";
  });
}
