import type { Page, SidebarNode } from "../types.js";
import {
  parseContentWidth,
  PDF_DENSITY_SCREEN,
  validatePdfDensity,
  type ColorScheme,
  type ContentWidthDefault,
  type PdfDensity,
} from "../config.js";
import { DEFAULT_LANG, LABEL_KEYS, resolveLabels, type Labels } from "../labels.js";
import { loadTheme } from "../themes/index.js";
import { escapeAttr, escapeHtml, escapeLabel, renderTemplate } from "../util/html.js";

export type RenderHtmlInput = {
  title: string;
  pages: Page[];
  sidebar: SidebarNode[];
  theme?: string;
  /** 文書の言語（BCP 47）。`{{lang}}` を持つテンプレートの `<html lang>` に入る。未指定は "en"。 */
  lang?: string;
  /**
   * 解決済みの UI ラベル。解決（表の選択と `html.labels` の適用）は呼び出し側で 1 度だけ
   * 行い、ここへは結果を渡す。未指定のときは `lang` から解決する（この境界を直接呼ぶ
   * 利用者が、ラベルを組み立てずに済むようにするため）。
   */
  labels?: Labels;
  /** ドキュメントを開いたときの初期配色（未指定は "light"）。読者の選択があればそちらが優先。 */
  colorScheme?: ColorScheme;
  /** 本文領域の最大幅。`full` / `none` の場合は利用可能な横幅いっぱいに広げる。 */
  contentWidth?: string;
  /**
   * 印刷時の版面の密度（`pdf.density` の解決結果）。画面の値（`PDF_DENSITY_SCREEN`）と
   * 一致する項目は出力しない。画面表示には影響しない。
   */
  pdfDensity?: PdfDensity;
  /**
   * `pdf.pageBreakLevel`。数値なら、印の付いた見出しの前で改ページする規則を印刷用に出す。
   * 印そのものは postprocess が付ける（{@link file://./pageBreakHeadings.ts}）。
   */
  pdfPageBreakLevel?: false | number;
  /** 読者向けの本文幅切替ボタンを表示するか。未指定は true。 */
  contentWidthToggle?: boolean;
  /** Initial state when the content-width toggle is shown. Defaults to standard. */
  contentWidthDefault?: ContentWidthDefault;
  /** Whether the image lightbox is enabled. Defaults to true. */
  imageLightbox?: boolean;
  /** Whether the monodocs branding footer is shown. Defaults to true. */
  branding?: boolean;
  /** monodocs version shown in the branding footer. Omitted when unavailable. */
  generatorVersion?: string;
  /**
   * この階層より深いディレクトリを既定で折りたたむ（隠さず畳むだけなので到達性は失わない）。
   * undefined は折りたたみなし。トップレベルのディレクトリを深さ 1 とする。
   */
  sidebarCollapseDepth?: number;
  /** ページ内目次に出す見出しの最深レベル（2〜6）。未指定は h3 まで。 */
  tocMaxLevel?: number;
  /** </body> 直前に挿入する追加スクリプト（例: Mermaid ランタイム）。 */
  bodyScripts?: string;
};

/**
 * サイドバーのツリーを ul/li の HTML に変換する。
 * `collapseDepth` 指定時は、その階層より深いディレクトリに `collapsed` を付けて
 * 既定で畳む（クライアントの開閉トグルでいつでも開ける）。`depth` はトップレベルを 1 とする。
 */
function renderSidebar(nodes: SidebarNode[], collapseDepth?: number, depth = 1): string {
  if (nodes.length === 0) return "";
  const items = nodes
    .map((node) => {
      if (node.type === "dir") {
        const collapsed = collapseDepth !== undefined && depth > collapseDepth ? " collapsed" : "";
        return (
          `<li class="sidebar-dir${collapsed}">` +
          `<span class="sidebar-dir-title">${escapeHtml(node.title)}</span>` +
          renderSidebar(node.children, collapseDepth, depth + 1) +
          `</li>`
        );
      }
      return (
        `<li class="sidebar-page">` +
        // href は encodeURI（route の "/" は保持）。data-route はクライアントで
        // decode 後に比較するため生の route を保持する。
        `<a href="#${escapeAttr(encodeURI(node.route))}" data-route="${escapeAttr(node.route)}">` +
        `${escapeHtml(node.title)}</a></li>`
      );
    })
    .join("");
  return `<ul class="sidebar-list">${items}</ul>`;
}

/** 1 ページ分の <article> を生成する。先頭ページのみ表示、他は hidden。 */
function renderArticle(page: Page, index: number): string {
  const hidden = index === 0 ? "" : " hidden";
  return (
    `<article class="page" data-route="${escapeAttr(page.route)}"` +
    ` id="page-${escapeAttr(page.id)}"${hidden}>\n${page.html}\n</article>`
  );
}

/** </script> での早期終了を防ぐため、JSON 中の `<` をエスケープする。 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** 設定由来のテーマ CSS 変数を追加する。公開レンダリング境界でも値を検証する。 */
function styleWithOverrides(style: string, input: RenderHtmlInput): string {
  let out = style;
  const overrides: string[] = [];
  if (input.contentWidth !== undefined) {
    overrides.push(`  --content-max-width: ${parseContentWidth(input.contentWidth)};`);
  }
  if (overrides.length > 0) {
    out = `${out}\n:root {\n${overrides.join("\n")}\n}\n`;
  }
  out = `${out}\n${PRINT_PAGE_BREAK_RULES}`;
  if (input.pdfPageBreakLevel !== undefined && input.pdfPageBreakLevel !== false) {
    out = `${out}\n${PRINT_HEADING_BREAK_RULES}`;
  }
  const density = printDensityRules(input.pdfDensity);
  return density === "" ? out : `${out}\n${density}`;
}

/**
 * The manual page-break marker, in print only.
 *
 * Emitted here rather than added to the default theme: a theme replaces `style.css` wholesale, and
 * a theme should not be able to delete a syntax feature. `#content` and `.page` are both named for
 * the reason the density rules name both — the first loses to nothing in the default theme, the
 * second reaches a theme that lays the pages out somewhere else.
 *
 * `break-after`, not `break-before`, from measurement rather than by analogy with the page boundary
 * above it. The marker is an empty box, so a forced break in front of it moves the box itself onto
 * the new sheet: a two-page document whose first page ends with a marker comes out as three sheets
 * under `break-before` and two under `break-after`. Every other case measured the same under both —
 * mid-page, straight after the page title, and a marker with nothing behind it, which leaves one
 * blank sheet either way because that is what it asks for. Two markers in a row leave one blank
 * sheet between them, which is how a blank sheet is asked for.
 */
/**
 * The headings `pdf.pageBreakLevel` puts on a sheet of their own, matched by the attribute
 * post-processing marked them with rather than by a selector for their level — which of them break
 * depends on what precedes them, and on a nesting that differs between the two renderers.
 *
 * The space above the heading goes with it. Measured: the margin `pdf.density` sets survives a
 * forced break — the same document at `relaxed` puts the heading 15.8pt lower on the new sheet than
 * at `normal` — and at the top of a fresh sheet that space is separating the heading from nothing.
 * `margin-top` rather than `margin-block-start`, so it is the same property the density rule writes
 * and the cascade needs no reasoning about logical and physical longhands.
 *
 * Written only when the setting is on, so the default document carries no rule at all.
 */
const PRINT_HEADING_BREAK_RULES = `@media print {
  #content [data-monodocs-pdf-break-before],
  .page [data-monodocs-pdf-break-before] {
    break-before: page;
    page-break-before: always;
    margin-top: 0;
  }
}
`;

const PRINT_PAGE_BREAK_RULES = `@media print {
  #content .page-break,
  .page .page-break {
    break-after: page;
    page-break-after: always;
  }
}
`;

/**
 * Print-only rules for a density, carrying **only what differs from the screen**.
 *
 * The baseline is `PDF_DENSITY_SCREEN`, not the default density: a value the theme already produces
 * is not worth restating, and one of them is worth actively leaving alone. The theme sets no root
 * `font-size`, so a density that keeps the screen's type size writes no rule for it and the HTML
 * still prints at whatever base size the reader's browser uses — which is true of the default
 * density, since it buys its sheets from leading and heading spacing instead.
 *
 * Each rule names both the default theme's container and the `.page` article core itself emits, so
 * a theme that lays the pages out somewhere other than `#content` is still reached. The two are
 * listed rather than one: `.page h1` alone loses to the theme's `#content h1` on specificity, and
 * `#content h1` alone matches nothing in a theme that has no `#content`.
 */
function printDensityRules(density: PdfDensity | undefined): string {
  if (density === undefined) return "";
  const { fontSize, lineHeight, headingSpacing, tableCellPadding } = validatePdfDensity(density);
  const base = PDF_DENSITY_SCREEN;
  const rules: string[] = [];
  if (fontSize !== base.fontSize) {
    // Every rem and em in the stylesheet is measured from here, so this one declaration moves the
    // whole page: type, the space between blocks, and the padding that is not overridden below.
    rules.push(`  :root {\n    font-size: ${fontSize};\n  }`);
  }
  if (lineHeight !== base.lineHeight) {
    rules.push(`  body {\n    line-height: ${lineHeight};\n  }`);
  }
  if (headingSpacing !== base.headingSpacing) {
    // The theme sets this on h1-h3 only, and resets the first heading of a page to 0 through a
    // more specific selector; both of those stay true here.
    rules.push(
      `  #content h1,\n  #content h2,\n  #content h3,\n` +
        `  .page h1,\n  .page h2,\n  .page h3 {\n    margin-top: ${headingSpacing};\n  }`,
    );
  }
  if (tableCellPadding !== base.tableCellPadding) {
    rules.push(
      `  #content th,\n  #content td,\n  .page th,\n  .page td {\n` +
        `    padding: ${tableCellPadding};\n  }`,
    );
  }
  if (rules.length === 0) return "";
  return `@media print {\n${rules.join("\n")}\n}\n`;
}

/** クライアント（目次・検索・前後ナビ）へ渡す 1 ページ分のデータ。 */
function pageData(page: Page): {
  route: string;
  title: string;
  hidden: boolean;
  headings: { id: string; text: string; level: number }[];
  text: string;
} {
  return {
    route: page.route,
    title: page.title,
    hidden: page.hidden === true,
    // h2 以降の見出しをすべて渡す（h1 はページタイトル相当のため除外）。検索は
    // 一致した見出しへ直接飛ばすため深い見出しも必要で、目次側は tocMaxLevel で
    // クライアントが絞り込む。
    headings: page.headings
      .filter((h) => h.level >= 2)
      .map((h) => ({ id: h.id, text: h.text, level: h.level })),
    text: page.text,
  };
}

/**
 * 設定由来の初期配色を `<html>` の属性として返す。
 * `light` / `dark` は `data-theme` を出力して CSS 評価前に配色を確定させ、
 * FOUC（ダーク OS で一瞬ダーク表示→ライトへ反転）と JS 無効時の未適用を防ぐ。
 * `auto`（および未指定）は属性を出さず OS の `prefers-color-scheme` に追従する。
 * 読者がトグルで切り替えた選択（localStorage）は app.js が読み込み後に上書きする。
 */
function rootThemeAttr(colorScheme: ColorScheme | undefined): string {
  if (colorScheme === "light" || colorScheme === "dark") {
    return ` data-theme="${colorScheme}"`;
  }
  return "";
}

/** Return the `<body>` attribute that applies the configured width before client JS runs. */
function bodyContentWidthAttr(
  contentWidthToggle: boolean | undefined,
  contentWidthDefault: ContentWidthDefault | undefined,
): string {
  return contentWidthToggle !== false && contentWidthDefault === "wide"
    ? ' class="content-wide"'
    : "";
}

/**
 * Return the initial accessible state for the content-width toggle button.
 * ボタンの `title` は押すと何が起きるかを示すので、`wide` で開く文書には「標準へ戻す」が入る。
 * 文言はラベル表から取る（app.js がトグル後に書き換える文言と同じ出所にするため。
 * 両方が自前の文字列を持つと、上書きしたときに初期表示だけ元のままになる）。
 */
function contentWidthToggleState(
  contentWidthDefault: ContentWidthDefault,
  labels: Labels,
): { pressed: string; title: string } {
  return contentWidthDefault === "wide"
    ? { pressed: "true", title: labels.useStandardContent }
    : { pressed: "false", title: labels.useWideContent };
}

/**
 * ラベルを `{{labelOpenSidebar}}` 形式のトークンに展開する。
 * エスケープは行き先ごとに要るが、属性用のエスケープはテキストノードでも正しく描画される
 * ので、テンプレート側はこれ 1 つで両方の置き場所を満たす（JSON 側は safeJson が別に扱う）。
 */
function labelTokens(labels: Labels): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const key of LABEL_KEYS) {
    tokens[`label${key.charAt(0).toUpperCase()}${key.slice(1)}`] = escapeLabel(labels[key]);
  }
  return tokens;
}

/** テーマ内の単純な条件ブロックを残すか、内容ごと除去する。 */
function renderConditionalBlock(template: string, name: string, enabled: boolean): string {
  const start = `{{#${name}}}`;
  const end = `{{/${name}}}`;
  const startIndex = template.indexOf(start);
  const endIndex = template.indexOf(end, startIndex + start.length);
  // この機能に対応していないカスタムテーマはそのまま扱う。
  if (startIndex === -1 || endIndex === -1) return template;
  if (enabled) {
    return (
      template.slice(0, startIndex) +
      template.slice(startIndex + start.length, endIndex) +
      template.slice(endIndex + end.length)
    );
  }
  return template.slice(0, startIndex) + template.slice(endIndex + end.length);
}

/** Page[] とサイドバーから自己完結した単一 HTML を生成する。 */
export async function renderSingleHtml(input: RenderHtmlInput): Promise<string> {
  const theme = await loadTheme(input.theme ?? "default");
  const tocMaxLevel = input.tocMaxLevel ?? 3;
  // 既定はライト。サーバ出力の data-theme と __MONODOCS_DATA__ の値を必ず一致させる。
  const colorScheme: ColorScheme = input.colorScheme ?? "light";
  const contentWidthDefault: ContentWidthDefault = input.contentWidthDefault ?? "standard";
  const lang = input.lang ?? DEFAULT_LANG;
  const labels = input.labels ?? resolveLabels(lang).labels;
  const contentWidthState = contentWidthToggleState(contentWidthDefault, labels);
  const generatorVersion = input.generatorVersion?.trim();

  const sidebarHtml = renderSidebar(input.sidebar, input.sidebarCollapseDepth);
  const pagesHtml = input.pages.map(renderArticle).join("\n");
  const siteData = safeJson({
    title: input.title,
    initialRoute: input.pages[0]?.route ?? "/",
    // 読者がまだ配色を選んでいないときに使う初期配色（"light" / "dark" / "auto"）。
    colorScheme,
    // Initial state used until the reader stores a choice ("standard" / "wide").
    contentWidthDefault,
    // ページ内目次に出す見出しの最深レベル（クライアントが headings を絞り込む）。
    tocMaxLevel,
    // 解決済みの UI ラベル。app.js が動的に書く文言（検索結果の見出し、コピーの結果、
    // 前後ナビ）はここから読む。テーマがどれであれデータとしては必ず届く。
    labels,
    // 目次・検索・前後ナビ用のページメタ（本文 HTML は含めない）。
    pages: input.pages.map(pageData),
  });

  let html = renderConditionalBlock(
    theme.template,
    "contentWidthToggle",
    input.contentWidthToggle !== false,
  );
  html = renderConditionalBlock(html, "imageLightbox", input.imageLightbox !== false);
  html = renderConditionalBlock(html, "branding", input.branding !== false);
  html = renderConditionalBlock(
    html,
    "generatorVersion",
    generatorVersion !== undefined && generatorVersion !== "",
  );
  // 1 回の走査でまとめて置換する。順番に置換すると、先に入れた本文 HTML やテーマの
  // CSS / JS に含まれる `{{...}}` が後続の置換で書き換えられてしまう。
  return renderTemplate(html, {
    ...labelTokens(labels),
    // 任意のトークン。必須にすると、この機能を望まないかもしれない既存テーマをすべて壊す。
    // `<html lang="…">` を直接書いたカスタムテンプレートは書いたものをそのまま保つ。
    lang: escapeAttr(lang),
    htmlAttrs: rootThemeAttr(colorScheme),
    bodyAttrs: bodyContentWidthAttr(input.contentWidthToggle, contentWidthDefault),
    contentWidthTogglePressed: contentWidthState.pressed,
    // これもラベル由来なので labelTokens と同じ扱いにする。ここだけ生のまま渡すと、
    // `"` を含む html.labels の値が title 属性から抜け出して属性を足せてしまう。
    contentWidthToggleTitle: escapeLabel(contentWidthState.title),
    generatorVersion: escapeHtml(generatorVersion ?? ""),
    title: escapeHtml(input.title),
    style: styleWithOverrides(theme.style, input),
    sidebar: sidebarHtml,
    pages: pagesHtml,
    siteDataJson: siteData,
    appJs: theme.appJs,
    bodyScripts: input.bodyScripts ?? "",
  });
}
