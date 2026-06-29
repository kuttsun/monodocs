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

/**
 * 単一実行ファイル（SEA / esbuild バンドル）向けに埋め込まれたアセット。
 * `scripts/bundle.mjs` がビルド時に banner で `globalThis.__MONODOCS_ASSETS__` を
 * 注入する。通常（tsc ビルド / vitest）は undefined のままで、ファイル読み込みに委譲する。
 */
type EmbeddedAssets = {
  themes?: Record<string, Theme | undefined>;
  mermaidInline?: string;
};
export function embeddedAssets(): EmbeddedAssets | undefined {
  return (globalThis as { __MONODOCS_ASSETS__?: EmbeddedAssets }).__MONODOCS_ASSETS__;
}

/** 指定テーマの template / style / client JS を読み込む。 */
export async function loadTheme(name = "default"): Promise<Theme> {
  // 単一実行ファイルではファイルシステムに themes が存在しないため、埋め込み済みを優先する。
  const embedded = embeddedAssets()?.themes?.[name];
  if (embedded) return embedded;

  const dir = join(here, name);
  const [template, style, appJs] = await Promise.all([
    readFile(join(dir, "template.html"), "utf8"),
    readFile(join(dir, "style.css"), "utf8"),
    readFile(join(dir, "app.js"), "utf8"),
  ]);
  return { template, style, appJs };
}
