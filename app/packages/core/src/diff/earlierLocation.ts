import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Page, DiffOptions } from "../types.js";

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

/**
 * The earlier pages with the earlier version's location written as the new one's, where it is
 * text. Asciidoctor makes `{docdir}` the absolute directory of the file it reads, which for the
 * earlier build is under the temporary directory. Rewritten after the build, so an include or an
 * image whose target is written with `{docdir}` has already been read from the earlier version's
 * own files, which are what that version included.
 */
export function relocateEarlierPages(pages: Page[], diff: DiffOptions, cwd: string): Page[] {
  const dir = resolve(cwd, diff.dir);
  const tree = resolve(cwd, diff.tree ?? diff.dir);
  // The tree stands where the current directory stands, shifted as `diff.dir` is inside it.
  const newTree = resolve(cwd, relative(dir, tree));
  // Asciidoctor writes a Windows path with `/`; the place is found, and written, either way.
  const slashed = (path: string) => path.replace(/\\/g, "/");
  const pairs = [tree, safeReal(tree)]
    .flatMap((base) => [
      [base, newTree],
      [slashed(base), slashed(newTree)],
    ])
    .sort((a, b) => b[0]!.length - a[0]!.length);
  const relocate = (text: string) => {
    let out = text;
    for (const [base, place] of pairs) out = out.split(base!).join(place!);
    return out;
  };
  return pages.map((page) =>
    page.format !== "asciidoc"
      ? page
      : {
          ...page,
          title: relocate(page.title),
          html: relocate(page.html),
          text: relocate(page.text),
          headings: page.headings.map((heading) => ({ ...heading, text: relocate(heading.text) })),
        },
  );
}

function safeReal(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}
