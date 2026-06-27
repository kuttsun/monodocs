import { posix } from "node:path";
import type { SourceFormat } from "../types.js";

/** 各ソース形式が対応する拡張子。 */
export const FORMAT_EXTENSIONS: Record<SourceFormat, string[]> = {
  markdown: [".md", ".markdown"],
  asciidoc: [".adoc", ".asciidoc", ".asc"],
};

/** ファイルパスの拡張子からソース形式を判定する。未対応なら undefined。 */
export function detectFormat(filePath: string): SourceFormat | undefined {
  const ext = posix.extname(filePath.split("\\").join("/")).toLowerCase();
  for (const format of Object.keys(FORMAT_EXTENSIONS) as SourceFormat[]) {
    if (FORMAT_EXTENSIONS[format].includes(ext)) return format;
  }
  return undefined;
}
