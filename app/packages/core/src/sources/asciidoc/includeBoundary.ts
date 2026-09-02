import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { Extensions } from "@asciidoctor/core";
import { MonodocsError } from "../../diagnostics.js";
import { t } from "../../messages.js";

/** ルートの外へ解決された include の記録。 */
export type IncludeViolation = { target: string; resolved: string; root: string };

/**
 * `include::` の読み取り先が入力ルートの外へ解決されないことを、Asciidoctor に読ませながら確かめる
 * （17.5）。
 *
 * Asciidoctor's SAFE mode confines `include::` to the base directory, and monodocs relies on that
 * (17.3). Measured, it confines it **lexically**: `include::../outside/x.adoc[]` and an absolute path
 * are both refused, and a symbolic link inside the base directory pointing outside it is followed —
 * both a linked file and a linked directory pulled content from outside the jail into the output.
 * Asciidoctor documents that it does not resolve symbolic links, so this is its behaviour rather
 * than a defect, and closing it is monodocs' job.
 *
 * The check runs inside an include processor's `handles`, which is called with the document and the
 * **expanded** target for every include Asciidoctor is about to read. Returning `false` declines the
 * include and leaves Asciidoctor to do it, so `lines`, `tag`, `tags`, and everything else 17.3
 * promises are untouched; only a target that resolves outside the root is stopped, by throwing.
 *
 * This replaces a static scan of the source text, and the reason is worth recording because the
 * scan's rationale was wrong. It said an include processor had no route from the document to the
 * reader — measured, `doc.getReader()` returns the `PreprocessorReader` and
 * `reader.getCursor().getDirectory()` is the directory the include resolves against, correct at each
 * level of nesting. What went unmeasured was one step: `getDirectory` sits on the cursor rather than
 * on the reader, and a missing method was read as a missing route.
 *
 * The scan cost what a parser model always costs. It had to decide what a `////` line meant, whether
 * a directive could sit anywhere but the start of a line, and whether `]` could appear in a target,
 * and it was wrong about all three in the permissive direction — outside content reached the output
 * through each. Over-approximating closed those, at the price of refusing an include inside a
 * comment block or a false `ifdef`, and it still could not resolve a target built from an attribute
 * reference. Asking Asciidoctor has none of those problems: it is called exactly when an include is
 * about to happen, with the target already expanded.
 */
export function createIncludeBoundary(
  rootDir: string,
  relativePath: string,
): {
  registry: unknown;
  takeViolation(): IncludeViolation | undefined;
} {
  const realRoot = safeReal(rootDir);
  let violation: IncludeViolation | undefined;

  const registry = Extensions.create();
  registry.includeProcessor(function (this: {
    handles(fn: (doc: unknown, target: string) => boolean): void;
    process(fn: () => void): void;
    prefer(): void;
  }) {
    this.handles((doc, target) => {
      const base = readerDirectory(doc);
      // 基準が取れないときは判断材料が無い。Asciidoctor の safe mode に任せる。
      if (base === undefined) return false;

      const candidate = resolvedPath(doc, target, base);
      const real = safeReal(candidate);
      // 存在しないものは Asciidoctor が「見つからない」と報告する。ここで先回りしない。
      if (real === undefined) return false;
      if (isInside(realRoot, real)) return false;

      violation = { target, resolved: real, root: realRoot ?? rootDir };
      // Asciidoctor はこれを自分のエラーに包んでしまうので、呼び出し側は記録した violation から
      // 同じエラーを組み直す。ここで投げるものも、コードと catalogue の文言を持つ本物にしておく。
      throw includeOutsideError(violation, relativePath);
    });
    // handles が true を返すことは無いので、ここへは来ない。契約上必要なので置いてある。
    this.process(() => {});
    // Asciidoctor は `handles` が true を返した最初の processor だけを使う。この境界は必ず false を
    // 返すので順番に意味は無い……が、`prefer()` された別の processor が前に並ぶと、そちらが include を
    // 引き取って境界には尋ねられない。先頭に置いて、少なくとも後から普通に登録されたものには先んじる。
    this.prefer();
  });

  return {
    registry,
    takeViolation() {
      const found = violation;
      violation = undefined;
      return found;
    },
  };
}

/** 記録された violation があれば同じエラーを組み直して投げる。 */
export function rethrowIncludeViolation(
  violation: IncludeViolation | undefined,
  relativePath: string,
): never | void {
  if (violation === undefined) return;
  throw includeOutsideError(violation, relativePath);
}

function includeOutsideError(violation: IncludeViolation, relativePath: string): MonodocsError {
  return new MonodocsError(
    "include/outside-input",
    t("asciidoc.includeOutside", {
      target: violation.target,
      path: relativePath,
      resolved: violation.resolved,
      root: violation.root,
    }),
  );
}

/**
 * Asciidoctor が実際に読むパス。
 *
 * Not `resolve(base, target)`, which was the first attempt and diverged: safe mode does not refuse a
 * target that climbs out of the jail, it **recovers** it by dropping the `..` — "include file has
 * illegal reference to ancestor of jail; recovering automatically". Measured, `include::../x.adoc[]`
 * from a jail of `root/docs` resolves to `root/docs/x.adoc` and not to `root/x.adoc`, so a check
 * that resolved it the plain way looked at a path that does not exist, skipped it, and let
 * Asciidoctor read a symbolic link out of the tree. `normalizeSystemPath` is the same call
 * Asciidoctor makes, so there is nothing left to diverge.
 */
function resolvedPath(doc: unknown, target: string, base: string): string {
  const normalize = (doc as { normalizeSystemPath?: (t: string, b: string) => unknown } | undefined)
    ?.normalizeSystemPath;
  if (typeof normalize === "function") {
    const resolved = normalize.call(doc, target, base);
    if (typeof resolved === "string" && resolved !== "") return resolved;
  }
  /* c8 ignore next 2 -- Asciidoctor always provides it; the fallback keeps a check rather than none. */
  return resolve(base, target);
}

/**
 * include の解決基準になるディレクトリ。
 *
 * `getDirectory` is on the cursor, not on the reader — the step whose absence was once read as the
 * whole route being missing. It is correct per level: the root for a top-level include, and the
 * including file's own directory for a nested one.
 */
function readerDirectory(doc: unknown): string | undefined {
  const reader = (doc as { getReader?: () => unknown } | undefined)?.getReader?.();
  const cursor = (reader as { getCursor?: () => unknown } | undefined)?.getCursor?.();
  const dir = (cursor as { getDirectory?: () => unknown } | undefined)?.getDirectory?.();
  return typeof dir === "string" && dir !== "" ? dir : undefined;
}

function safeReal(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/** real が realRoot 配下（または同一）か。postprocess の画像検査と同じ判定。 */
function isInside(realRoot: string | undefined, real: string): boolean {
  if (realRoot === undefined) return true;
  return real === realRoot || real.startsWith(realRoot + sep);
}
