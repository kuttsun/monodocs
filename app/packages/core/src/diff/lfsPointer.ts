import { MonodocsError } from "../diagnostics.js";
import { t } from "../messages.js";

/**
 * A Git LFS pointer, as the LFS specification defines it: the `version` line, then only the
 * `ext-` lines the specification allows, then `oid` and `size`, each on a line of its own. Matched
 * whole, so a page that quotes a pointer's first line as an example is not one (roadmap 7.3.1).
 * A line ending converted on the way out (`eol=crlf`) is still a pointer.
 */
const POINTER =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n(?:ext-\d+-[^\s]+ sha256:[0-9a-f]{64}\r?\n)*oid sha256:[0-9a-f]{64}\r?\nsize \d+\r?\n?$/;

/** The specification keeps a pointer under 1024 bytes; anything larger is content. */
const MAX_POINTER_SIZE = 1024;

/** Whether `content` is an LFS pointer rather than the file it stands for. */
export function isLfsPointer(content: Buffer | string): boolean {
  const size = typeof content === "string" ? Buffer.byteLength(content) : content.length;
  if (size >= MAX_POINTER_SIZE) return false;
  const text = typeof content === "string" ? content : content.toString("latin1");
  return POINTER.test(text);
}

/**
 * What the earlier build checks each file it reads with: a page, an included file, an image. One
 * that is still a pointer is `diff/lfs-pointer`, naming it — built from a pointer, an image would
 * appear deleted and replaced by a broken one. A pointer the build never reads is never checked.
 */
export function refuseLfsPointer(
  path: string,
  content: Buffer | string,
  /** `embedded` when `path` is the page an image was written into, not the image itself. */
  where: "file" | "embedded" = "file",
): void {
  if (isLfsPointer(content)) {
    throw new MonodocsError(
      "diff/lfs-pointer",
      t(where === "file" ? "diff.lfsPointer" : "diff.lfsPointerEmbedded", { path }),
    );
  }
}
