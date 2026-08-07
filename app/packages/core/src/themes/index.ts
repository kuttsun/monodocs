import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "../messages.js";

export type Theme = {
  template: string;
  style: string;
  appJs: string;
};

// 本ファイルと同じ階層にテーマアセットを配置する。
// ソース実行時（vitest）は src/themes、ビルド後は dist/themes を参照する
// （アセットは build 時に copy-theme.mjs で dist へコピーされる）。
const here = dirname(fileURLToPath(import.meta.url));

/** 同梱テーマ。カスタムテーマはディレクトリの絶対パスで指定する。 */
export const BUILT_IN_THEMES = ["default"] as const;

const THEME_FILES = {
  template: "template.html",
  style: "style.css",
  appJs: "app.js",
} as const;

/**
 * テンプレートに必須のトークン。欠けると文書が壊れる（本文が入らない、
 * クライアント JS が無い、Mermaid ランタイムを注入できない）ものだけを必須とする。
 * `{{title}}` / `{{htmlAttrs}}` / `{{bodyAttrs}}` などは欠けても文書は読めるので必須にしない。
 */
const REQUIRED_TEMPLATE_TOKENS = [
  "{{style}}",
  "{{sidebar}}",
  "{{pages}}",
  "{{siteDataJson}}",
  "{{appJs}}",
  "{{bodyScripts}}",
] as const;

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

/** 組み込みテーマを読む（単一実行ファイルでは埋め込み済みアセットを優先）。 */
async function loadBuiltInTheme(name: string): Promise<Theme> {
  const embedded = embeddedAssets()?.themes?.[name];
  if (embedded) return embedded;

  if (!(BUILT_IN_THEMES as readonly string[]).includes(name)) {
    throw new Error(t("theme.unknown", { name, builtIn: BUILT_IN_THEMES.join(", ") }));
  }

  const dir = join(here, name);
  const [template, style, appJs] = await Promise.all([
    readFile(join(dir, THEME_FILES.template), "utf8"),
    readFile(join(dir, THEME_FILES.style), "utf8"),
    readFile(join(dir, THEME_FILES.appJs), "utf8"),
  ]);
  return { template, style, appJs };
}

/** カスタムテーマの 1 ファイルを読む。存在しなければ undefined（既定テーマで補う）。 */
async function readOptional(dir: string, file: string): Promise<string | undefined> {
  try {
    return await readFile(join(dir, file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** テンプレートに必須トークンが揃っているか検証する。 */
function assertTemplateTokens(template: string, source: string): void {
  const missing = REQUIRED_TEMPLATE_TOKENS.filter((token) => !template.includes(token));
  if (missing.length > 0) {
    throw new Error(t("theme.missingTokens", { tokens: missing.join(", "), source }));
  }
}

/**
 * カスタムテーマ（ディレクトリ）を読む。
 *
 * `template.html` / `style.css` / `app.js` のうち置いたものだけが使われ、
 * 残りは既定テーマで補う。配色だけ変えたいテーマが `app.js`（ルーティング・検索・目次を
 * 含む）を丸ごと抱え込まずに済むようにするため。1 つも見つからない場合は、
 * ディレクトリの指定間違いとして扱う。
 */
async function loadCustomTheme(dir: string): Promise<Theme> {
  // パスの打ち間違いと「ディレクトリはあるがテーマファイルが無い」を区別して伝える。
  const stats = await stat(dir).catch(() => undefined);
  if (!stats) throw new Error(t("theme.dirNotFound", { dir }));
  if (!stats.isDirectory()) throw new Error(t("theme.notADirectory", { dir }));

  const [template, style, appJs] = await Promise.all([
    readOptional(dir, THEME_FILES.template),
    readOptional(dir, THEME_FILES.style),
    readOptional(dir, THEME_FILES.appJs),
  ]);

  if (template === undefined && style === undefined && appJs === undefined) {
    throw new Error(t("theme.empty", { files: Object.values(THEME_FILES).join(" / "), dir }));
  }

  const fallback = await loadBuiltInTheme("default");
  return {
    template: template ?? fallback.template,
    style: style ?? fallback.style,
    appJs: appJs ?? fallback.appJs,
  };
}

/**
 * テーマの template / style / client JS を読み込む。
 * `nameOrDir` は組み込みテーマ名（`"default"`）か、カスタムテーマディレクトリの絶対パス
 * （設定の `html.theme` を config.ts が解決したもの）。
 */
export async function loadTheme(nameOrDir = "default"): Promise<Theme> {
  const theme = isAbsolute(nameOrDir)
    ? await loadCustomTheme(nameOrDir)
    : await loadBuiltInTheme(nameOrDir);
  assertTemplateTokens(theme.template, nameOrDir);
  return theme;
}
