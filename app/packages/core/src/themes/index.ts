import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Theme = {
  template: string;
  style: string;
  appJs: string;
};

// 本ファイルと同じ階層にテーマアセットを配置する。
// ソース実行時（vitest）は src/themes、ビルド後は dist/themes を参照する
// （アセットは build 時に copy-theme.mjs で dist へコピーされる）。
const here = dirname(fileURLToPath(import.meta.url));

/** 指定テーマの template / style / client JS を読み込む。 */
export async function loadTheme(name = "default"): Promise<Theme> {
  const dir = join(here, name);
  const [template, style, appJs] = await Promise.all([
    readFile(join(dir, "template.html"), "utf8"),
    readFile(join(dir, "style.css"), "utf8"),
    readFile(join(dir, "app.js"), "utf8"),
  ]);
  return { template, style, appJs };
}
