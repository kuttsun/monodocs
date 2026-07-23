/**
 * monodocs core の共通型定義。
 *
 * ROADMAP「11. Source Renderer Architecture」に基づく。
 * Markdown / AsciiDoc など各ソース形式は専用 renderer で処理し、
 * 最終的に共通の {@link Page} モデルへ正規化する。
 */

/** 対応するソース形式。将来 "html" / "rst" などを追加できる。 */
export type SourceFormat = "markdown" | "asciidoc";

/**
 * サイドバー等で使うページタイトルの取得元。
 * `"heading"`（既定）= frontmatter → 見出し（H1 / 文書タイトル）→ ファイル名。
 * `"filename"` = frontmatter → ファイル名（見出しはタイトルに使わない）。
 */
export type TitleFrom = "heading" | "filename";

/**
 * frontmatter などの明示タイトルではなく、導出した表示タイトルへ適用する変換。
 */
export type TitleTransform =
  | { type: "none" }
  | { type: "stripNumberPrefix" }
  | { type: "regex"; pattern: string; replacement: string; flags?: string };

/** サイドバーに表示するページタイトル・ディレクトリ名それぞれの変換。 */
export type SidebarTitleTransforms = {
  /** 見出し・ファイル名から導出したページ表示タイトルへ適用する変換。 */
  page: TitleTransform;
  /** フォルダ名から導出したディレクトリ表示名へ適用する変換。 */
  directory: TitleTransform;
};

/** 走査・読み込み済みのソースファイル。 */
export type SourceFile = {
  absolutePath: string;
  /** 入力ディレクトリからの相対パス。 */
  relativePath: string;
  /** ファイルの生テキスト。 */
  raw: string;
  format: SourceFormat;
};

/** 見出し。単一 HTML 内で ID が衝突しないよう page-id を prefix する。 */
export type Heading = {
  level: number;
  id: string;
  text: string;
};

/** リンク参照。最終 HTML では hash route に変換する。 */
export type LinkRef = {
  /** 元のリンク先（相対パス / xref など）。 */
  href: string;
  text?: string;
  /** ソース上の開始行（1-based）。取得できない形式では undefined。 */
  line?: number;
  /** ソース上の開始桁（1-based）。取得できない形式では undefined。 */
  column?: number;
  /** 解決後の route（例: "/setup/install"）。未解決なら undefined。 */
  resolved?: string;
};

/** 画像などのアセット参照。 */
export type AssetRef = {
  /** 元の参照（相対パスなど）。 */
  src: string;
  /** MIME タイプ（判明している場合）。 */
  mime?: string;
};

/** ソースから抽出したメタデータ（frontmatter / AsciiDoc attributes 由来）。 */
export type PageMeta = {
  /** 明示タイトル（Markdown frontmatter `title` / AsciiDoc `:sd-title:`）。 */
  title?: string;
  /** 見出し由来タイトル（Markdown の H1 / AsciiDoc の文書タイトル `= Title`）。 */
  headingTitle?: string;
  order?: number;
  hidden?: boolean;
  description?: string;
};

/** 共通ページモデル。すべての形式はここへ正規化される。 */
export type Page = {
  id: string;
  route: string;
  sourcePath: string;
  relativePath: string;
  format: SourceFormat;

  title: string;
  order?: number;
  hidden?: boolean;
  description?: string;

  rawSource: string;
  html: string;
  text: string;

  headings: Heading[];
  links: LinkRef[];
  assets: AssetRef[];
};

/** サイドバーのノード（ディレクトリ or ページ）。 */
export type SidebarNode =
  | {
      type: "dir";
      title: string;
      path: string;
      children: SidebarNode[];
    }
  | {
      type: "page";
      title: string;
      route: string;
      pageId: string;
    };

/** renderer に渡すレンダリングコンテキスト。 */
export type RenderContext = {
  /** レンダリング対象ページの識別情報。 */
  page: Pick<Page, "id" | "route" | "relativePath" | "format">;
};

/** renderer の出力。 */
export type RenderedContent = {
  html: string;
  text: string;
  headings: Heading[];
  links: LinkRef[];
  assets: AssetRef[];
};

/**
 * ソース形式ごとの renderer インターフェース。
 * v0.1 では Markdown 用のみ実装し、v0.2 で AsciiDoc 用を追加する。
 */
export interface SourceRenderer {
  format: SourceFormat;
  extensions: string[];

  extractMeta(source: SourceFile): Promise<PageMeta>;
  render(source: SourceFile, context: RenderContext): Promise<RenderedContent>;
  extractLinks?(source: SourceFile): Promise<LinkRef[]>;
}

/** 出力形式。 */
export type OutputFormat = "html" | "pdf" | "both";

/** {@link buildSite} のオプション。 */
export type BuildOptions = {
  inputDir?: string;
  outputFile?: string;
  configFile?: string;
  format?: OutputFormat;
  /** 生成物のブランディング表示に埋め込む monodocs のバージョン。 */
  generatorVersion?: string;
};

/** {@link buildSite} の結果。 */
export type BuildResult = {
  /** 生成した出力ファイルのパス。 */
  outputs: string[];
  /** 生成したページ数。 */
  pages: number;
  /** ビルド中に発生した警告。 */
  warnings: string[];
};
