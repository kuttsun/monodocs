import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
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
 * **It therefore over-approximates on purpose.** A static check that models another parser diverges
 * from it, and every divergence in the permissive direction is a hole. A first attempt tracked
 * `////` comment blocks and matched the directive only at the start of a line, and four documents
 * got outside content into the output through the gaps: a `////` inside a listing block put the
 * checker into a comment state Asciidoctor was not in; `ifndef::x[include::y[]]` put the directive
 * somewhere the checker did not look; a `]` in a target failed a pattern Asciidoctor accepts; and
 * following a symbolic link changed the directory the checker resolved the next level against, while
 * Asciidoctor kept the lexical one. So no block structure is modelled and no condition is evaluated:
 * every `include::` in the text is checked, wherever it sits. What that costs is a false refusal —
 * an include inside a comment block, inside a false `ifdef`, or quoted in a code sample, whose target
 * happens to resolve to a real file outside the root. What it buys is that a divergence stops the
 * build instead of leaking.
 *
 * **What it still does not cover** is a target monodocs cannot resolve without running Asciidoctor:
 * one built from an attribute reference (`include::{partialsdir}/x.adoc[]`). Such a target is
 * skipped rather than guessed at, and the limitation is written down rather than implied.
 */
export async function assertIncludesInsideRoot(
  sources: readonly SourceFile[],
  rootDir: string,
): Promise<void> {
  const asciidoc = sources.filter((source) => source.format === "asciidoc");
  if (asciidoc.length === 0) return;

  const realRoot = await realpath(rootDir).catch(() => resolve(rootDir));
  // 字句パスで訪問済みを持つ。realpath で持つと、同じ実体へ別の字句経路から届いたときに
  // 二度目を飛ばしてしまい、その経路の解決基準が検査されないまま残る。
  const visited = new Set<string>();

  for (const source of asciidoc) {
    await walk(source.absolutePath, source.raw, realRoot, rootDir, visited);
  }
}

/** Asciidoctor の既定と同じ上限。ここに達したら以降は Asciidoctor の報告に任せる。 */
const MAX_INCLUDE_DEPTH = 64;

/**
 * Asciidoctor が include 先を AsciiDoc として読み直す拡張子（`constants.js` の ASCIIDOC_EXTENSIONS）。
 * それ以外の中身は listing の本文としてそのまま出るだけで、`include::` に見える行があっても読まれない。
 * 再帰をここへ限らないと、AsciiDoc の書き方を見せているコードサンプルを拒否してしまう。
 */
const RECURSIVE_EXTENSIONS = new Set([".adoc", ".asciidoc", ".asc", ".ad", ".txt"]);

async function walk(
  filePath: string,
  contents: string,
  realRoot: string,
  rootDir: string,
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

    // 解決は**字句的**に行い、次の階層の基準にもその字句パスを使う。Asciidoctor は symlink を
    // 解決しないので、実体パスを基準にすると、リンクを経た先で基準がずれて検査が空振りする。
    const candidate = resolve(baseDir, target);
    // 存在しないものは Asciidoctor が「見つからない」と報告する。ここで先回りしない。
    const real = await realpath(candidate).catch(() => undefined);
    if (real === undefined) continue;

    if (!isInside(realRoot, real)) {
      throw new MonodocsError(
        "include/outside-input",
        t("asciidoc.includeOutside", {
          target,
          path: displayPath(rootDir, filePath),
          resolved: real,
          root: realRoot,
        }),
      );
    }

    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (!RECURSIVE_EXTENSIONS.has(extname(candidate).toLowerCase())) continue;
    const included = await readFile(candidate, "utf8").catch(() => undefined);
    if (included !== undefined) {
      await walk(candidate, included, realRoot, rootDir, visited, depth + 1);
    }
  }
}

/** real が realRoot 配下（または同一）か。postprocess の画像検査と同じ判定。 */
function isInside(realRoot: string, real: string): boolean {
  return real === realRoot || real.startsWith(realRoot + sep);
}

/** 報告に使う、ルートからの相対パス。ルート外なら絶対パスのまま示す。 */
function displayPath(rootDir: string, filePath: string): string {
  const rel = relative(rootDir, filePath);
  return rel === "" || rel.startsWith("..") ? filePath : rel.split(sep).join("/");
}

/**
 * `include::` の target を、行のどこにあっても取り出す。
 *
 * The target grammar is Asciidoctor's own: after `include::` it starts with a character that is
 * neither whitespace nor `[`, runs up to the `[` that opens the attribute list, and does not end in
 * whitespace — so a `]` inside it is allowed, which the first attempt got wrong. A leading backslash
 * escapes the directive, and that is honoured. Nothing else about where the directive sits is
 * modelled, so an inline `ifndef::x[include::y[]]` is found as well as one starting a line.
 *
 * The text is normalised the way Asciidoctor normalises its input — BOM removed, `\r\n` and a lone
 * `\r` folded to `\n` — so that neither can hide a directive from the check.
 */
function includeTargets(contents: string): string[] {
  const normalised = contents.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const targets: string[] = [];

  for (const match of normalised.matchAll(/(\\)?include::([^\s[][^[]*?)\[/g)) {
    if (match[1]) continue; // `\include::` は本文であって directive ではない。
    const target = match[2];
    // 末尾が空白の target は Asciidoctor が directive として認めない。
    if (target === undefined || /\s$/.test(target)) continue;
    targets.push(target);
  }

  return targets;
}
