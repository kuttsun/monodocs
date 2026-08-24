import { type Diagnostic, MonodocsError, warn } from "../diagnostics.js";
import { t } from "../messages.js";
import type { PageLike } from "./browser.js";

/**
 * Whether the machine running the build has a font for everything the document says.
 *
 * An artifact is composed once, with the fonts that machine happens to carry, and a character with
 * no font becomes tofu (□ / ☒) permanently — in every copy that is then handed out. HTML escapes
 * this because it is drawn with the reader's fonts; PDF output and `mermaid.mode: pre-render` do
 * not, which is why the setting is top-level `fontCheck` rather than `pdf.fontCheck`.
 *
 * The check runs in the browser that is already open for the build, so it costs no extra startup.
 */

/** What `fontCheck` accepts. The same vocabulary `assets.onLargeImage` already established. */
export const FONT_CHECK_MODES = ["warn", "error", "off"] as const;
export type FontCheckMode = (typeof FONT_CHECK_MODES)[number];

/**
 * Which rendering context was measured. The finding is the same either way, but what the reader
 * does about it is not: a PDF is fixed at build time, and a pre-rendered diagram bakes the same
 * failure into the SVG that the HTML then carries.
 */
export type FontCheckContext = "pdf" | "prerender";

/** Thrown for `fontCheck: error`, which stops the build and exits non-zero. */
export class FontCheckError extends MonodocsError {
  constructor(message: string) {
    super("font/missing", message);
    this.name = "FontCheckError";
  }
}

/** Size the samples are measured at. The advance widths below were recorded at this size. */
const MEASURE_SIZE = 32;
/**
 * Distinct (cluster, font) pairs measured before the walk gives up and says it was cut short.
 *
 * Set far above any real document — the whole of common CJK is some 20,000 characters — because a
 * cap that is reached is a document only partly checked, and the check then says so rather than
 * returning a clean bill. Measuring one pair is a `measureText` call, so the ceiling costs
 * milliseconds to raise and buys the silence being trustworthy.
 */
const MAX_PAIRS = 50_000;
/** Findings collected before the walk stops. Past this, the answer is not going to change. */
const MAX_FINDINGS = 40;
/** Clusters named in the message. The rest are counted rather than listed. */
const MAX_SAMPLES = 8;

/**
 * The browser-side check.
 *
 * **Detection.** Three ways of asking whether a glyph exists were measured in the development
 * image, and two of them do not work: comparing the advance width against a family name that
 * cannot exist reports one width for everything (a nonexistent family falls through the same
 * fallback chain as anything else), and CDP `CSS.getPlatformFontsForNode` names a font with a
 * glyph count even for characters it cannot draw. What works is comparing against a **reference
 * codepoint no installed font is expected to draw**: at 32px every undrawable sample measured the
 * same advance as `U+10FFFD` while every drawable one differed. The width is the cheap filter and a
 * rasterisation confirms the hit, because a real glyph could coincidentally share the notdef
 * advance but not its bitmap.
 *
 * **The reference is conventional, not guaranteed** — `U+10FFFD` is private use, so a font *may*
 * map it. Each font stack therefore validates the reference against two controls, and a
 * disagreement makes the whole run report itself unusable rather than produce findings it cannot
 * stand behind. All or nothing on purpose: a machine that draws private-use characters is one where
 * the comparison is unsound, not one where some fonts are still worth measuring.
 *
 * The controls are a second private-use codepoint from a different plane **and a noncharacter**.
 * The second matters: two private-use codepoints agreeing only proves they render the same, which a
 * font mapping both to one glyph also achieves — and then the reference is a real glyph, every
 * missing character differs from it, and the check reports a clean document while quietly seeing
 * nothing. A noncharacter is never assigned a glyph, so it pins the comparison to the notdef box
 * itself. Measured in the development image: `U+10FFFD`, `U+FFFFD` and `U+FDD0` all come out at
 * 11.69px with the same bitmap, as do the characters it cannot draw.
 *
 * **The unit is the grapheme cluster paired with the computed font of the element it appears in.**
 * Not a representative character per script — a script's common characters resolving says nothing
 * about the extension blocks beside them — and not a bare codepoint, because a variation sequence
 * or an emoji ZWJ sequence can fail as a unit. Where a cluster does not come out as a single notdef
 * box, its codepoints are measured too, which is what catches a sequence that falls apart into
 * several tofu rather than one.
 *
 * **Only what will be drawn is measured.** Subtrees whose computed `display` is `none` or whose
 * `content-visibility` is `hidden` are pruned, and an element whose `visibility` is `hidden` has its
 * own text skipped — but not its subtree, since `visibility` inherits and a descendant can turn it
 * back on. Under print emulation that is what keeps the sidebar, the table of contents and the
 * search results, none of which reach the paper, from producing a finding.
 */
function fontCheckScript(probes: string[]): string {
  return `(async function(){
var SIZE = ${MEASURE_SIZE};
var MAX_PAIRS = ${MAX_PAIRS};
var MAX_FINDINGS = ${MAX_FINDINGS};
var PROBES = ${JSON.stringify(probes)};

// A data-URI webfont a theme ships is part of the answer, so wait for it to be loaded.
try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch (e) {}

var canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 64;
var ctx = canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;
if (!ctx) return JSON.stringify({ status: 'unmeasurable' });

var REFERENCE = String.fromCodePoint(0x10FFFD);
// A private-use codepoint from another plane, and a noncharacter — which no font assigns a glyph
// to, and which is therefore what stops a font mapping both private-use codepoints to one glyph
// from passing this validation.
var CONTROLS = [String.fromCodePoint(0xFFFFD), String.fromCodePoint(0xFDD0)];

// Assigning an unparsable font shorthand leaves ctx.font at its previous value, which would make
// every following measurement answer for the wrong font. Read it back instead of assuming.
function useFont(font) {
  ctx.font = font;
  return ctx.font.indexOf(SIZE + 'px') >= 0;
}
function widthOf(text) {
  return ctx.measureText(text).width;
}
function signatureOf(text) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
  ctx.fillText(text, 2, 2);
  var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  var hash = 2166136261;
  for (var i = 3; i < data.length; i += 4) { hash = ((hash ^ data[i]) * 16777619) >>> 0; }
  return hash;
}

var fonts = Object.create(null);
var sound = true;

function fontFor(style) {
  var family = style.fontFamily || 'sans-serif';
  // 1..1000 is the whole CSS range, and a variable font can be asked for the top of it. Anything
  // else (a keyword that did not compute to a number) falls back rather than being passed through.
  var weight = /^[1-9][0-9]{0,3}$/.test(style.fontWeight) && Number(style.fontWeight) <= 1000
    ? style.fontWeight
    : 'normal';
  // 'oblique 40deg' is mapped rather than forwarded: measured, the canvas shorthand parses the
  // angled form by dropping the slant altogether, so forwarding it would measure an upright face.
  // font-stretch is left out for the same reason — the canvas shorthand drops it either way.
  var slant = style.fontStyle && style.fontStyle.indexOf('normal') !== 0 ? 'italic' : 'normal';
  var key = slant + '|' + weight + '|' + family;
  if (key in fonts) return fonts[key];
  var font = slant + ' ' + weight + ' ' + SIZE + 'px ' + family;
  var info = null;
  if (useFont(font)) {
    var referenceWidth = widthOf(REFERENCE);
    var referenceSignature = signatureOf(REFERENCE);
    // Validate the reference itself: if this machine draws private-use characters, the comparison
    // below is measuring one drawn glyph against another and cannot be trusted.
    for (var c = 0; c < CONTROLS.length; c++) {
      if (widthOf(CONTROLS[c]) !== referenceWidth || signatureOf(CONTROLS[c]) !== referenceSignature) {
        sound = false;
      }
    }
    info = { font: font, width: referenceWidth, signature: referenceSignature };
  }
  fonts[key] = info;
  return info;
}

function undrawable(text, info) {
  if (!useFont(info.font)) return false;
  if (widthOf(text) !== info.width) return false;
  return signatureOf(text) === info.signature;
}

var segmenter = null;
try { segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) {}
function clustersOf(text) {
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), function (part) { return part.segment; });
}

var seen = Object.create(null);
var recorded = Object.create(null);
var found = [];
var pairs = 0;
var truncated = false;

function record(cluster) {
  if (recorded[cluster]) return;
  recorded[cluster] = 1;
  if (found.length >= MAX_FINDINGS) { truncated = true; return; }
  found.push(cluster);
}

function scan(text, info) {
  var clusters = clustersOf(text);
  for (var i = 0; i < clusters.length; i++) {
    var cluster = clusters[i];
    if (!/\\S/.test(cluster)) continue;
    var id = info.font + '\\u0000' + cluster;
    if (seen[id]) continue;
    seen[id] = 1;
    if (++pairs > MAX_PAIRS) { truncated = true; return false; }
    if (undrawable(cluster, info)) { record(cluster); continue; }
    // A cluster that is not one notdef box can still be several of them.
    var points = Array.from(cluster);
    if (points.length > 1) {
      for (var p = 0; p < points.length; p++) {
        if (undrawable(points[p], info)) { record(cluster); break; }
      }
    }
    if (found.length >= MAX_FINDINGS) { truncated = true; return false; }
  }
  return true;
}

function walk(root) {
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: function (element) {
      // What is not drawn cannot come out as tofu. Under print emulation this is what keeps the
      // sidebar, the table of contents and the search results out of the findings. Both of these
      // take their subtree with them; visibility does not, and is handled per element below.
      var style = getComputedStyle(element);
      return style.display === 'none' || style.contentVisibility === 'hidden'
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });
  // A TreeWalker never runs its filter on the root, and 'display' does not inherit — a child of a
  // display:none element still computes 'block' — so without this the whole document would be
  // measured through a root that draws nothing. Measured: 'display:none' on <html> leaves the body
  // with a zero height, while 'content-visibility:hidden' there has no effect at all, because
  // containment does not apply to the root element. Only the first is checked here for that reason.
  if (root.nodeType === 1 && getComputedStyle(root).display === 'none') return true;
  var element = root.nodeType === 1 ? root : walker.nextNode();
  while (element) {
    var style = getComputedStyle(element);
    // visibility inherits and a descendant can turn it back on, so skip this element's own text
    // rather than its subtree.
    var info = style.visibility === 'hidden' ? null : fontFor(style);
    if (info) {
      var children = element.childNodes;
      for (var n = 0; n < children.length; n++) {
        var node = children[n];
        if (node.nodeType !== 3) continue;
        if (!scan(node.data, info)) return false;
      }
    }
    element = walker.nextNode();
  }
  return true;
}

var host = null;
try {
  walk(document.documentElement);
  if (PROBES.length > 0 && document.body) {
    host = document.createElement('div');
    [['position','absolute'],['left','-99999px'],['top','0'],['display','block'],
     ['visibility','visible'],['width','800px']]
      .forEach(function (d) { host.style.setProperty(d[0], d[1], 'important'); });
    document.body.appendChild(host);
    if (host.attachShadow) {
      // The fragments are drawn by Chromium in a document of their own, inheriting nothing from
      // this one. A shadow root reproduces that: the document's stylesheet does not match inside
      // it, and 'all: initial' cuts the inheritance that would otherwise cross the boundary.
      var shadow = host.attachShadow({ mode: 'open' });
      var wrap = document.createElement('div');
      wrap.style.cssText = 'all:initial;display:block;width:800px';
      shadow.appendChild(wrap);
      for (var i = 0; i < PROBES.length; i++) {
        var box = document.createElement('div');
        box.innerHTML = PROBES[i];
        wrap.appendChild(box);
      }
      walk(wrap);
    }
  }
} finally {
  if (host) host.remove();
}

return JSON.stringify({
  status: !sound ? 'unusable' : (found.length > 0 ? 'missing' : 'ok'),
  clusters: found,
  truncated: truncated
});
})()`;
}

/** What the browser-side check answered. */
export type FontCheckOutcome =
  /**
   * Nothing was found. `truncated` says the walk stopped at its ceiling before reaching the end of
   * the document, which makes this "nothing so far" rather than "nothing" — reported, because a cap
   * that reads as a clean bill is the silent failure this whole check exists to remove.
   */
  | { status: "ok"; truncated?: boolean }
  /** The check could not run at all (no canvas, evaluation failed). Nothing to tell the reader. */
  | { status: "unmeasurable" }
  /** This machine draws private-use characters, so the reference the check compares against is unsound. */
  | { status: "unusable" }
  | { status: "missing"; clusters: string[]; truncated: boolean };

/**
 * Run the check in an open page and return what it found.
 *
 * A failure to measure is silent. The reader can do nothing with "the font check did not run", and
 * `fontCheck` exists to report missing fonts, not to report on itself — the one exception being an
 * unsound reference, which is a specific condition with a specific explanation.
 */
export async function inspectFonts(
  page: PageLike,
  probes: string[] = [],
): Promise<FontCheckOutcome> {
  let parsed: { status?: unknown; clusters?: unknown; truncated?: unknown };
  try {
    parsed = JSON.parse(String(await page.evaluate(fontCheckScript(probes)))) as typeof parsed;
  } catch {
    return { status: "unmeasurable" };
  }
  if (parsed.status === "unusable") return { status: "unusable" };
  if (parsed.status === "ok") return { status: "ok", truncated: parsed.truncated === true };
  if (parsed.status === "missing" && Array.isArray(parsed.clusters)) {
    const clusters = parsed.clusters.filter((c): c is string => typeof c === "string" && c !== "");
    if (clusters.length > 0) {
      return { status: "missing", clusters, truncated: parsed.truncated === true };
    }
  }
  return { status: "unmeasurable" };
}

/**
 * An example of a font that covers a script, script by script.
 *
 * It names a **face, not a package**: what supplies a face differs across Debian, Windows, and
 * every other platform, and naming the wrong package is worse than naming none. The table is
 * deliberately small — it exists to turn "this character has no font" into a search term, not to
 * enumerate the Noto project. A cluster it does not cover is still reported, with its codepoints.
 */
const SCRIPT_EXAMPLES: ReadonlyArray<{ match: RegExp; font: string }> = [
  // Emoji first: an emoji is Common script, so a script test would never reach it.
  { match: /\p{Extended_Pictographic}/u, font: "Noto Color Emoji" },
  {
    match: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u,
    font: "Noto Sans CJK",
  },
  { match: /\p{Script=Hangul}/u, font: "Noto Sans CJK KR" },
  { match: /\p{Script=Arabic}/u, font: "Noto Sans Arabic" },
  { match: /\p{Script=Hebrew}/u, font: "Noto Sans Hebrew" },
  { match: /\p{Script=Devanagari}/u, font: "Noto Sans Devanagari" },
  { match: /\p{Script=Bengali}/u, font: "Noto Sans Bengali" },
  { match: /\p{Script=Thai}/u, font: "Noto Sans Thai" },
  { match: /\p{Script=Ethiopic}/u, font: "Noto Sans Ethiopic" },
  { match: /\p{Script=Armenian}/u, font: "Noto Sans Armenian" },
  { match: /\p{Script=Georgian}/u, font: "Noto Sans Georgian" },
  { match: /\p{Script=Tibetan}/u, font: "Noto Serif Tibetan" },
  { match: /\p{Script=Adlam}/u, font: "Noto Sans Adlam" },
  { match: /\p{Script=Old_Persian}/u, font: "Noto Sans Old Persian" },
  { match: /\p{Script=Yi}/u, font: "Noto Sans Yi" },
  { match: /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u, font: "Noto Sans" },
];

function exampleFontFor(cluster: string): string | undefined {
  return SCRIPT_EXAMPLES.find((entry) => entry.match.test(cluster))?.font;
}

/** `U+65E5`, and every codepoint of a multi-codepoint cluster, so a sequence can be identified. */
function codepointsOf(cluster: string): string {
  return Array.from(cluster)
    .map((char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

/** Turn an outcome into the line the reader sees, or undefined when there is nothing to say. */
export function describeFontCheck(
  outcome: FontCheckOutcome,
  context: FontCheckContext,
): string | undefined {
  if (outcome.status === "unusable") return t("fontCheck.unusable");
  // A walk that hit its ceiling found nothing *so far*. Saying nothing here would turn a partial
  // check into an assurance, which is the failure mode this feature exists to remove.
  if (outcome.status === "ok") {
    return outcome.truncated === true ? t("fontCheck.incomplete", { count: MAX_PAIRS }) : undefined;
  }
  if (outcome.status !== "missing") return undefined;

  const shown = outcome.clusters.slice(0, MAX_SAMPLES);
  const samples = shown.map((cluster) => {
    const font = exampleFontFor(cluster);
    const params = { cluster, codepoints: codepointsOf(cluster) };
    return font === undefined
      ? t("fontCheck.sample", params)
      : t("fontCheck.sampleWithExample", { ...params, font });
  });
  // A walk that stopped early counts as "n+" rather than "n". Where there is nothing left to
  // list, the count alone carries that, and "and 0+ more" would be a line saying nothing.
  const rest = outcome.clusters.length - shown.length;
  if (rest > 0) {
    samples.push(t("fontCheck.more", { count: outcome.truncated ? `${rest}+` : rest }));
  }
  return t(context === "prerender" ? "fontCheck.missingPrerender" : "fontCheck.missingPdf", {
    count: outcome.truncated ? `${outcome.clusters.length}+` : outcome.clusters.length,
    samples: samples.join("; "),
  });
}

/**
 * Check the fonts of an open page and report the result according to `mode`.
 *
 * `warn` is the default because the check is a heuristic over Chromium's fallback chain: a false
 * positive must not be able to break a build that would otherwise have been fine. `error` exists
 * for someone who would rather CI stopped, and choosing it means accepting that a false positive
 * stops it too. An unsound reference is reported as a warning in either mode — it is the check
 * declining to answer, not a finding, and it cannot be what fails a build.
 */
export async function runFontCheck(
  page: PageLike,
  options: {
    mode: FontCheckMode;
    context: FontCheckContext;
    onWarning: (diagnostic: Diagnostic) => void;
    /** HTML fragments to measure besides the document, each in a context of its own. */
    probes?: string[];
  },
): Promise<void> {
  if (options.mode === "off") return;
  // Measure what will be printed. The theme hides the sidebar, the table of contents and the
  // navigation in print and expands every page, so screen media would answer for a different
  // document than the one the PDF is made of.
  if (options.context === "pdf" && page.emulateMediaType) {
    try {
      await page.emulateMediaType("print");
    } catch {
      // An older browser without the override still gets checked, against screen media.
    }
  }
  const outcome = await inspectFonts(page, options.probes);
  const message = describeFontCheck(outcome, options.context);
  if (message === undefined) return;
  if (outcome.status === "missing" && options.mode === "error") throw new FontCheckError(message);
  // Two messages, one code: an unusable reference and a walk that hit its ceiling are both the
  // check declining to answer, and a job that ignores one has no reason to hear the other.
  options.onWarning(
    warn(outcome.status === "missing" ? "font/missing" : "font/unchecked", message),
  );
}
