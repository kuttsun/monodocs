import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { DiffOptions, Page } from "../types.js";

/**
 * Neither version's output depends on where or when the earlier one was built (roadmap 7.3.2).
 *
 * The earlier files sit in a temporary directory that changes on every run, and the two builds run
 * a moment apart. What the build derives from the clock is read once, and what it derives from a
 * file's location comes out as it would at the new version's location.
 */

/** An instant as Asciidoctor writes it: `2026-10-20`, `11:59:01 +0900`, or `UTC` with no offset. */
function asciidoctorDate(at: Date): { date: string; time: string; year: string } {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const offset = -at.getTimezoneOffset();
  const zone =
    offset === 0
      ? "UTC"
      : `${offset > 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}${pad(Math.abs(offset) % 60)}`;
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())} ${zone}`,
    year: String(at.getFullYear()),
  };
}

/**
 * The AsciiDoc attributes that give both builds one instant: the time the build started, as
 * Asciidoctor would have written it then. Nothing with `SOURCE_DATE_EPOCH` set, which Asciidoctor
 * already reads in both builds alike. Soft-set (`@`) like every attribute monodocs passes, so a
 * document's own `:docdate:` is left as it wrote it (17.5); measured with `@asciidoctor/core` 4.
 */
export function sharedClockAttributes(
  startedAt: Date,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  if (env.SOURCE_DATE_EPOCH !== undefined && env.SOURCE_DATE_EPOCH !== "") return {};
  const { date, time, year } = asciidoctorDate(startedAt);
  const attributes: Record<string, string> = {};
  for (const prefix of ["doc", "local"]) {
    attributes[`${prefix}date`] = `${date}@`;
    attributes[`${prefix}time`] = `${time}@`;
    attributes[`${prefix}datetime`] = `${date} ${time}@`;
    attributes[`${prefix}year`] = `${year}@`;
  }
  return attributes;
}

/** What writes the earlier version's location as the new one's: in plain text, and in HTML. */
export function earlierRelocator(
  diff: DiffOptions,
  cwd: string,
): { text: (text: string) => string; html: (html: string) => string } {
  const dir = resolve(cwd, diff.dir);
  const tree = resolve(cwd, diff.tree ?? diff.dir);
  // The tree stands where the current directory stands, shifted as `diff.dir` is inside it.
  const newTree = resolve(cwd, relative(dir, tree));
  // Asciidoctor writes a Windows path with `/`, and the HTML escapes what it must; the place is
  // found, and written, in each form.
  const slashed = (path: string) => path.replace(/\\/g, "/");
  // In the HTML, both spellings of an escape are found: Asciidoctor writes `&amp;`, and the
  // serialiser monodocs writes pages with (`hast-util-to-html`) writes `&#x26;`. The new location
  // goes in escaped there, and as it is in the plain-text fields.
  const amp = (path: string) =>
    path.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hex = (path: string) =>
    path
      .replace(/&/g, "&#x26;")
      .replace(/</g, "&#x3C;")
      .replace(/>/g, "&#x3E;")
      .replace(/"/g, "&#x22;");
  const forms = [tree, safeReal(tree)].flatMap((base) => [
    [base, newTree],
    [slashed(base), slashed(newTree)],
  ]);
  // One pass over the text with every form at once, the longest first: replacing form by form
  // would find a form again inside a location already written, when the new version sits inside
  // the earlier one's tree.
  const replacerFor = (pairs: string[][]) => {
    const places = new Map<string, string>();
    for (const [base, place] of pairs) if (!places.has(base!)) places.set(base!, place!);
    const bases = [...places.keys()].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
      `(?:${bases.map(escapeRegExp).join("|")})(?![A-Za-z0-9_~+-]|\\.[A-Za-z0-9])`,
      "g",
    );
    return (text: string) => text.replace(pattern, (found) => places.get(found)!);
  };
  const inText = replacerFor(forms.map(([base, place]) => [base!, place!]));
  const inHtml = replacerFor(
    forms.flatMap(([base, place]) => [
      [amp(base!), amp(place!)],
      [hex(base!), amp(place!)],
    ]),
  );
  return { text: inText, html: inHtml };
}

/**
 * The earlier pages with the earlier version's location written as the new one's, where it is
 * text. Asciidoctor makes `{docdir}` the absolute directory of the file it reads, which for the
 * earlier build is under the temporary directory. Rewritten after the build, so an include or an
 * image whose target is written with `{docdir}` has already been read from the earlier version's
 * own files, which are what that version included. It runs on the pages as Asciidoctor wrote them,
 * before the sidebar takes their titles and before highlighting cuts a path into tokens.
 */
export function relocateEarlierPages(pages: Page[], diff: DiffOptions, cwd: string): Page[] {
  const { text: relocate, html: relocateHtml } = earlierRelocator(diff, cwd);
  return pages.map((page) =>
    page.format !== "asciidoc"
      ? page
      : {
          ...page,
          // The title was rewritten before `sidebar.titleTransform` ran (`relocateTitle`); a second
          // pass would find the earlier tree inside a new location written into it.
          ...(page.description === undefined ? {} : { description: relocate(page.description) }),
          html: relocateHtml(page.html),
          text: relocate(page.text),
          headings: page.headings.map((heading) => ({ ...heading, text: relocate(heading.text) })),
        },
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeReal(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}
