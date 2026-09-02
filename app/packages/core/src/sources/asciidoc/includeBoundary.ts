import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { MonodocsError } from "../../diagnostics.js";
import { t } from "../../messages.js";
import type { SourceFile } from "../../types.js";

/**
 * `include::` の読み取り先が入力ルートの外へ解決されないことを、変換の前に確かめる（17.5）。
 *
 * Asciidoctor's SAFE mode confines `include::` to the base directory, and monodocs relies on that
 * (17.3). Measured, it confines it **lexically**: `include::../outside/x.adoc[]` and an absolute
 * path are both refused, and a symbolic link inside the base directory pointing outside it is
 * followed — both a linked file and a linked directory pulled content from outside the jail into the
 * output. Asciidoctor documents that it does not resolve symbolic links, so this is its behaviour
 * rather than a defect, and closing it is monodocs' job.
 *
 * The check is a static one, run over the source text before Asciidoctor reads it, rather than an
 * `IncludeProcessor` that takes the directive over. Measured: an include processor cannot validate
 * and then decline — `handles` receives the document and the target but has no route to the reader,
 * and the cursor a `process` call is given reports `.` for a document converted from a string, so
 * taking the directive over means reimplementing Asciidoctor's own path resolution as well as
 * `lines`, `tag`, and `tags`. That is a larger surface than the hole, and 17.3 promises the
 * directive is left to Asciidoctor.
 *
 * **What this therefore does not cover** is a target monodocs cannot resolve without running
 * Asciidoctor: one built from an attribute reference (`include::{partialsdir}/x.adoc[]`). Such a
 * target is skipped rather than guessed at, and the limitation is written down rather than implied.
 */
export async function assertIncludesInsideRoot(
  sources: readonly SourceFile[],
  rootDir: string,
): Promise<void> {
  const asciidoc = sources.filter((source) => source.format === "asciidoc");
  if (asciidoc.length === 0) return;

  const realRoot = await realpath(rootDir).catch(() => resolve(rootDir));
  // realpath 済みのパスで訪問済みを持つ。循環 include で止まらなくならないため。
  const visited = new Set<string>();

  for (const source of asciidoc) {
    await walk(source.absolutePath, source.raw, source.relativePath, realRoot, visited);
  }
}

/** Asciidoctor の既定と同じ上限。ここに達したら以降は Asciidoctor の報告に任せる。 */
const MAX_INCLUDE_DEPTH = 64;

async function walk(
  filePath: string,
  contents: string,
  reportedPath: string,
  realRoot: string,
  visited: Set<string>,
  depth = 0,
): Promise<void> {
  if (depth >= MAX_INCLUDE_DEPTH) return;
  const baseDir = dirname(filePath);

  for (const target of includeTargets(contents)) {
    // 属性で組み立てた target は、Asciidoctor を走らせずには解決できない。推測せずに見送る。
    if (target.includes("{")) continue;
    // URI は safe mode が止める。それを開ける allow-uri-read はそもそも設定できない（17.5）。
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) continue;

    const candidate = resolve(baseDir, target);
    // 存在しないものは Asciidoctor が「見つからない」と報告する。ここで先回りしない。
    const real = await realpath(candidate).catch(() => undefined);
    if (real === undefined) continue;

    if (!isInside(realRoot, real)) {
      throw new MonodocsError(
        "include/outside-input",
        t("asciidoc.includeOutside", {
          target,
          path: reportedPath,
          resolved: real,
          root: realRoot,
        }),
      );
    }

    if (visited.has(real)) continue;
    visited.add(real);
    const included = await readFile(real, "utf8").catch(() => undefined);
    if (included !== undefined) {
      await walk(real, included, reportedPath, realRoot, visited, depth + 1);
    }
  }
}

/** real が realRoot 配下（または同一）か。postprocess の画像検査と同じ判定。 */
function isInside(realRoot: string, real: string): boolean {
  return real === realRoot || real.startsWith(realRoot + sep);
}

/**
 * ソーステキストから `include::` の target を取り出す。
 *
 * The directive has to start the line, a leading backslash escapes it, and a `////` block is a
 * comment Asciidoctor does not read includes out of. Includes inside a listing block **are**
 * processed, which is why delimited blocks other than the comment one are not skipped.
 */
function includeTargets(contents: string): string[] {
  const targets: string[] = [];
  let inComment = false;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/^\/{4,}$/.test(line)) {
      inComment = !inComment;
      continue;
    }
    if (inComment) continue;

    const match = /^include::([^[\]]+)\[.*\]$/.exec(line);
    if (match?.[1]) targets.push(match[1].trim());
  }

  return targets;
}
