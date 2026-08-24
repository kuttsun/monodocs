# monodocs ROADMAP

[English](../roadmap.md)

## 1. 概要

`monodocs` は、複数の Markdown / AsciiDoc ファイルから、単一の HTML または PDF ドキュメントを生成するツールである。

目的は、ドキュメントを複数ファイルに分割して管理しながら、配布時には 1 ファイルにまとめられるようにすること。

主な特徴は以下。

- 複数 Markdown ファイルを単一 HTML にまとめる
- 複数 AsciiDoc ファイルを単一 HTML にまとめる
- Markdown / AsciiDoc の混在に対応する
- フォルダ構造に従ったサイドバー目次を自動生成する
- サイドバー目次は設定ファイルでカスタマイズできる
- Markdown / AsciiDoc のタイトルをサイドバーに利用する
- 画像を HTML 内に埋め込める
- Mermaid などの図表記法に対応する
- GitHub Flavored Markdown に対応する
- 単一 HTML を元に PDF 出力できる
- CLI / npm / GitHub Actions / VS Code 拡張など複数の提供形態を想定する

`monodocs` は Pandoc の代替を直接目指すものではない。
主目的は、**単一ファイル配布に特化した軽量ドキュメントジェネレータ**を作ることである。

---

## 2. 背景

Pandoc の `chunkedhtml` は、文書を複数 HTML に分割できるが、以下のような用途には弱い。

- ドキュメントサイト風のサイドバーが欲しい
- フォルダ構造に従った目次を自動生成したい
- 複数 Markdown / AsciiDoc をまとめて 1 つの HTML にしたい
- 画像や Mermaid も含めて自己完結した HTML にしたい
- HTML だけでなく PDF にも出力したい
- VS Code や CI から簡単に使いたい

`monodocs` では、入力ファイルの管理は分割されたままにし、出力だけを単一ファイル化する。

---

## 3. 目標

### 3.1 初期目標

最初の目標は、以下を満たす CLI ツールを作ること。

```bash
monodocs build ./docs -o ./dist/docs.html
```

入力例：

```text
docs/
  index.md
  setup/
    install.md
    config.adoc
  guide/
    usage.md
    faq.adoc
```

出力例：

```text
dist/
  docs.html
```

### 3.2 中期目標

- Markdown / AsciiDoc 混在ドキュメントを安定して処理する
- 画像を HTML 内に埋め込む
- Mermaid を表示する
- Markdown / AsciiDoc の相互リンクを単一 HTML 内リンクに変換する
- HTML から PDF を生成する
- CI/CD で自動生成できる

### 3.3 長期目標

- VS Code 拡張として提供する
- GitHub Actions として利用できるようにする
- 単体バイナリを提供する
- テーマやレイアウトを拡張可能にする

---

## 4. プロダクト名

リポジトリ名：

```text
monodocs
```

CLI 名：

```bash
monodocs
```

npm パッケージ名：

```text
monodocs
```

> 旧称は `single-docs`。CLI コマンドは `monodocs` に統一した（`single-docs` / `sdocs` は既存ツールと名前が衝突するため不採用）。

---

## 5. 基本コンセプト

`monodocs` は、複数のソースファイルを一度共通の `Page` モデルに正規化し、その後に HTML / PDF へ出力する。

```text
Markdown files
AsciiDoc files
      ↓
Source Renderer
      ↓
Page[]
      ↓
sidebar / links / assets / search
      ↓
single HTML
      ↓
optional PDF
```

重要なのは、Markdown と AsciiDoc を直接同じ処理で扱おうとしないこと。
それぞれ専用の renderer で処理し、最終的に共通の `Page` モデルへ変換する。

---

## 6. 対応フォーマット

### 6.1 Markdown

対応拡張子：

```text
.md
.markdown
```

対応予定：

- CommonMark
- GitHub Flavored Markdown
- tables
- task lists
- strikethrough
- autolinks
- fenced code blocks
- YAML frontmatter

### 6.2 AsciiDoc

対応拡張子：

```text
.adoc
.asciidoc
.asc
```

対応予定：

- document title
- section headings
- attributes
- xref
- image macro
- source block
- include directive
- Mermaid source block

初期実装では Asciidoctor.js を利用する。

### 6.3 混在対応

同一ディレクトリ内で Markdown と AsciiDoc を混在できるようにする。

例：

```text
docs/
  index.md
  setup/
    install.adoc
    config.md
  guide/
    usage.adoc
    faq.md
```

### 6.4 数式（v0.14 で判断する）

数式は未対応であり、その理由は syntax.md にある——HTML を自己完結に保つため、MathJax や KaTeX への
依存を持ち込まない。この理由は誤りというより古い。KaTeX はビルド時に **MathML だけ**を出力でき、
その場合、出力には JavaScript もスタイルシートも入らない。数式を描くのはブラウザであり、Chromium は
バージョン 109 から MathML Core を実装しているので、PDF にも届く。

消えないのはフォントである。MathML は OpenType MATH フォントで描かれるので、それを持たないマシンは
違うグリフを出す。そのための検査は既にあり（24.3.3）、数式を対象に加える必要がある。そして難しい
半分は元々描画ではない。書き手が何と書くかを決めることである。`$...$` は通貨の話をする散文と衝突し、
`$$...$$` は標準ではなく慣習であり、`\(...\)` は曖昧ではないが馴染みが無い。何を選ぶにせよ AsciiDoc
側の対応物（`stem`、`latexmath`）が要り、検索が何を索引するかと整合し、読者がコピーしたときに
意味のあるものが取れなければならない。

v0.14 はこれに意見ではなく実測で答える。実際の数式を並べた見本文書を HTML と PDF に組み、対応する
両プラットフォームで、目で見る。結果が良ければ数式は 1.x の機能とし、記法は公開の場で決める。
良くなければ制限は残し、syntax.md には、真でなくなった依存の議論ではなく、この実測の結果を理由と
して記録する。
---

## 7. 出力フォーマット

### 7.1 HTML

最初に対応する出力形式。

```bash
monodocs build ./docs -o ./dist/docs.html
```

または：

```bash
monodocs build ./docs --format html -o ./dist/docs.html
```

HTML は、可能な限り自己完結したファイルにする。

含めるもの：

- HTML
- CSS
- JavaScript
- サイドバー構造
- ページ本文
- 検索インデックス
- 画像 data URI
- Mermaid client-side runtime

### 7.2 PDF

HTML 生成後、Playwright または Puppeteer を用いて PDF 化する。

```bash
monodocs build ./docs --format pdf -o ./dist/docs.pdf
```

または：

```bash
monodocs build ./docs --format both -o ./dist/
```

内部処理：

```text
Markdown / AsciiDoc
  ↓
single HTML
  ↓
headless browser
  ↓
PDF
```

PDF 出力は、HTML 出力が安定してから対応する。

---

## 8. 提供形態

### 8.1 CLI

最初に実装する。

```bash
monodocs build ./docs -o ./dist/docs.html
```

### 8.2 npm パッケージ

グローバルインストール：

```bash
npm install -g monodocs
```

一時実行：

```bash
npx monodocs build ./docs -o ./dist/docs.html
```

プロジェクトローカル導入：

```bash
npm install -D monodocs
```

`package.json` 例：

```json
{
  "scripts": {
    "docs:build": "monodocs build"
  }
}
```

### 8.3 Docker

CI や社内環境向けの配布形態として公式イメージをここに挙げていたが、**提供しない**。Homebrew /
Scoop / winget を決着させた論法（8.5）がそのまま当てはまる。イメージはリリースのたびに同期させる
Dockerfile であり、レジストリのアカウントとその資格情報であり、自分の都合とは無関係に脆弱性情報が
飛んでくるベースイメージであり、このリポジトリの外で問題が報告されるサポート窓口でもある。この
コストはリリースごと・ベースイメージの advisory ごとに繰り返し発生し、支払うのは一人のメンテナで
ある。

イメージが提供したはずのものには既に手が届く。CI ランナーは `npx` 経由で monodocs を使え（8.4）、
イメージが省いてくれたはずの唯一の手順——PDF 出力に必要な Chromium とフォントの導入——は、
ドキュメントサイトの CI ガイドに載っている 2 行のブロックでしかない。コンテナの中で monodocs を
動かしたい人は、自分が管理していて自分でビルドし直しているイメージにその 2 行を足せばよい。npm と
リリースバイナリでは本当に足りないという報告が出てきたときに限り、再検討する。

これは `Dockerfile.dev`（本リポジトリの開発用イメージ）については何も言っていない。開発用イメージ
は残る。

### 8.4 GitHub Actions

専用の Action は公開せず、ワークフローから npm CLI を直接呼び出す。

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes monodocs build ./docs -o ./dist/docs.html
```

### 8.5 単体バイナリ

対応済み（v0.8）。公開した GitHub Release には、対応プラットフォームごとの単一実行ファイル
（Node 22 の Single Executable Application を使う `pnpm build:bin` の出力）と、検証用の `.sha256`
ファイル、そして `-NOTICES.txt` を添付する。バイナリは npm 依存と Node.js ランタイムを内包しており、
それらのライセンスは再配布物に通知を伴わせることを求めるが、バイナリ単体では通知を持ち歩けない。
そこで `pnpm build:bin` が monodocs のライセンス・複製した Node.js ランタイムのライセンス・生成済みの
第三者ライセンス表記を 1 ファイルにまとめ、リリースで各バイナリの隣に公開する。

```text
monodocs-linux-x64
monodocs-windows-x64.exe
```

公開するのは monodocs が対応する 2 プラットフォームだけとする。当初の計画には macOS 版もあったが
提供しない。macOS は対応プラットフォームに含めておらず（ブラウザの自動検出も未対応）、CI ランナー
でしか動かせないビルドを配ると、利用者の不具合を誰も再現できないまま公開することになるため。
macOS を対応プラットフォームに加えるときに再検討する。

バイナリでは PDF 出力と Mermaid の `pre-render` は使えない。`puppeteer-core` をバンドルに含めない
ため（21.2 章）。黙って劣化させずエラーメッセージで失敗させ、その失敗を PR CI が両プラットフォーム
で検証するので、この制約が形骸化しない。

バイナリは署名しない。コード署名には証明書と鍵の取り扱い体制が要り、単独メンテナンス体制では
安全に運用できないため、ドキュメントで Windows SmartScreen の警告について注意喚起する方針とする。

Homebrew / Scoop / winget へのパッケージ登録は**行わない**。いずれもリリースごとに同期が必要な
マニフェストと、それぞれの審査・申請プロセス、そしてこのリポジトリの外に問題が報告されるサポート
窓口を増やし、単独メンテナンスではリリースのたびに恒常的なコストになる。一方、既存の 2 つの入手
経路で対象利用者はカバーできている。Node.js がある人向けの `npm install -g monodocs` と、何も
インストールせずに動くリリースバイナリである。現状の 2 経路では足りないという声が出たときに
再検討する。

### 8.6 VS Code 拡張

凍結中。ロードマップ節の v0.7 を参照。

想定機能：

- Build Single HTML
- Build PDF
- Preview
- Validate Links
- Create Config
- Watch Preview

---

## 9. 推奨技術スタック

### 9.1 言語

```text
TypeScript
Node.js
```

### 9.2 Markdown

```text
unified
remark-parse
remark-gfm
remark-frontmatter
remark-rehype
rehype-stringify
rehype-slug
rehype-autolink-headings
```

### 9.3 AsciiDoc

```text
asciidoctor.js
```

### 9.4 HTML 後処理

```text
rehype
hast
parse5
```

### 9.5 コードハイライト

```text
shiki
```

### 9.6 Mermaid

初期：

```text
mermaid
```

将来：

```text
@mermaid-js/mermaid-cli
```

### 9.7 PDF

```text
playwright
```

または：

```text
puppeteer
```

### 9.8 CLI

```text
commander
chokidar
```

### 9.9 設定ファイル

```text
yaml
zod
```

### 9.10 テスト

```text
vitest
```

### 9.11 パッケージ管理

```text
pnpm workspace
```

---

## 10. アーキテクチャ

### 10.1 モノレポ構成

```text
monodocs/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
  ROADMAP.md

  packages/
    core/
      src/
        build.ts
        config.ts
        scan.ts
        types.ts

        sources/
          detectFormat.ts

          markdown/
            renderer.ts
            extractMeta.ts
            render.ts
            links.ts

          asciidoc/
            renderer.ts
            extractMeta.ts
            render.ts
            links.ts

        pipeline/
          buildPages.ts
          buildSidebar.ts
          rewriteLinks.ts
          embedAssets.ts
          processMermaid.ts
          buildSearchIndex.ts
          renderSingleHtml.ts
          renderPdf.ts

    cli/
      src/
        index.ts

    vscode-extension/
      src/
        extension.ts
        previewPanel.ts

    themes/
      default/
        template.html
        style.css
        app.ts

  examples/
    basic-markdown/
    basic-asciidoc/
    mixed/

  tests/
    fixtures/
```

### 10.2 core

変換処理の中核。

責務：

- 設定読み込み
- ファイル走査
- 入力フォーマット判定
- Markdown の処理
- AsciiDoc の処理
- 共通 Page モデル生成
- サイドバー生成
- リンク変換
- 画像埋め込み
- Mermaid 処理
- 検索インデックス生成
- HTML 出力
- PDF 出力

### 10.3 cli

CLI インターフェース。

責務：

- コマンドライン引数の解釈
- core の呼び出し
- エラー表示
- watch / serve の起動

### 10.4 vscode-extension

VS Code 拡張。

責務：

- VS Code コマンド登録
- workspace 設定取得
- core の呼び出し
- Webview プレビュー
- 自動リビルド

### 10.5 themes

HTML テンプレート、CSS、クライアントサイド JS を管理する。

---

## 11. Source Renderer Architecture

Markdown / AsciiDoc / 将来の他形式を扱うため、Source Renderer 方式を採用する。

### 11.1 SourceRenderer

```ts
export interface SourceRenderer {
  format: SourceFormat;
  extensions: string[];

  extractMeta(source: SourceFile): Promise<PageMeta>;
  render(source: SourceFile, context: RenderContext): Promise<RenderedContent>;
  extractLinks?(source: SourceFile): Promise<LinkRef[]>;
}
```

### 11.2 SourceFormat

```ts
export type SourceFormat = "markdown" | "asciidoc";
```

将来的には以下も追加できる。

```ts
export type SourceFormat = "markdown" | "asciidoc" | "html" | "rst";
```

### 11.3 SourceFile

```ts
export type SourceFile = {
  absolutePath: string;
  relativePath: string;
  raw: string;
  format: SourceFormat;
};
```

### 11.4 Page

```ts
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
```

### 11.5 Heading

```ts
export type Heading = {
  level: number;
  id: string;
  text: string;
};
```

### 11.6 SidebarNode

```ts
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
```

---

## 12. 設定ファイル

設定ファイル名：

```text
monodocs.config.yml
```

`monodocs.config.yml` を標準とする。

### 12.1 設定例

この例は**現在のリリースが実際に受理する**設定であり、すべてのキーを既定値で並べたものである。
この文書が仕様として書いていても未実装のキーはここには載せない。そのキーは、それを規定する節に、
導入するバージョンとともに書く。

```yaml
title: "社内ドキュメント"

# 生成物の言語。<html lang> を埋め、UI ラベル表を選ぶ（v0.10）。
# BCP 47 のタグを何でも受理する。ラベル表を同梱するのは "en"（既定）と "ja" で、
# それ以外は "en" のラベルへフォールバックして警告する。CLI 自身のメッセージの言語ではない（25.6）。
lang: "en"

# ビルドを実行するマシンに、文書が必要とするフォントが無いときの扱い（v0.10）: warn / error / off。
# PDF 出力と mermaid pre-render の両方に効くのでトップレベルに置く（24.3.3）。
fontCheck: "warn"

input: "./docs"

output:
  format: "html"
  path: "./dist/docs.html"

sources:
  # GitHub Flavored Markdown と frontmatter は常に有効で、切るキーは無い。
  markdown:
    extensions:
      - ".md"
      - ".markdown"
  # Asciidoctor は safe mode で、base_dir は入力ファイルのディレクトリ。どちらも設定不可（17.5）。
  asciidoc:
    extensions:
      - ".adoc"
      - ".asciidoc"
      - ".asc"
  # ページ化しないパターン。既定リストを置き換えず、そこへ追加される（12.3）。
  # exclude:
  #   - "drafts/**"
  # 既定リスト（"_partials/**" / "partials/**" / "includes/**" / "**/_*"）を適用するか。
  excludeDefaults: true

sidebar:
  mode: "folder"
  # タイトルの取得元。"heading"（既定）= frontmatter → 見出し(H1 / = Title) → ファイル名。
  # "filename" = 見出しがあってもファイル名をタイトルに使う（明示タイトルは常に最優先）。
  titleFrom: "heading"
  # この階層より深いディレクトリを既定で折りたたむ（隠さず畳むだけなので到達性は失わない）。
  # 0 = 全ディレクトリを畳む / 未指定 = 折りたたみなし（全展開）。トップレベルを深さ 1 とする。
  # collapseDepth: 2
  # ページ 1 つだけでサブフォルダを持たないディレクトリを、親へ引き上げる。
  flattenSingleChild: false
  # 明示タイトル（frontmatter title / :sd-title:）以外の表示タイトル変換。
  # page は見出し・ファイル名由来のページ表示タイトル、directory はフォルダ表示名に適用する。
  # type: none（既定）/ stripNumberPrefix / regex。route/page id は不変。
  titleTransform:
    page:
      type: "none"
      # type: "regex"
      # pattern: "^REQ-\\d+:\\s*"
      # replacement: ""
      # flags: "gi"
    directory:
      type: "none"
      # type: "stripNumberPrefix"

toc:
  # ページ内目次に出す見出しの最深レベル（2〜6）。既定は 3（h2〜h3）。
  # h1 はページタイトル相当のため常に除外。見出し自体は本文に必ず表示される。
  maxLevel: 3

assets:
  embedImages: true
  maxInlineSize: "5MB"
  onLargeImage: "warn"

mermaid:
  enabled: true
  mode: "client"
  # client モードのみ: inline（既定・自己完結）/ cdn（ファイルは小さいがネットワークが要る）。
  runtime: "inline"

highlight:
  enabled: true

html:
  theme: "default"
  # 検索とダークモード切替は常に存在し、どちらも消すキーは無い。
  # 文書を開いたときの配色: light（既定）/ dark / auto。読者自身の選択が優先される。
  colorScheme: "light"
  # 本文領域の最大幅。例: "860px" / "1100px" / "72rem" / full
  contentWidth: "860px"
  # 読者向けの標準幅／ワイド幅切替ボタンを表示する
  contentWidthToggle: true
  # 読者が選択するまでの初期状態: standard / wide
  contentWidthDefault: "standard"
  # リンクのない装飾目的以外の本文画像をダイアログで拡大表示する
  imageLightbox: true
  # HTML と PDF の末尾に生成ツール名とバージョンを表示する
  branding: true
  # lang で選んだ表の上から、個別の UI ラベルを差し替える（v0.10）。
  # 未知のキーは拒否する。キー集合は凍結される設定表面の一部である。
  labels:
    tocTitle: "このページの内容"

pdf:
  pageSize: "A4"
  margin:
    top: "20mm"
    right: "15mm"
    bottom: "20mm"
    left: "15mm"
  printBackground: true
  # 印刷時の版面の密度（v0.10）: relaxed / normal（既定）/ compact / tight。または base と
  # fontSize / lineHeight / headingSpacing / tableCellPadding を取るオブジェクト（24.6）。
  density: "normal"
  # 指定したレベルまでの見出しの前で改ページする（v0.11）: false（既定）または 2〜6（24.7）。
  pageBreakLevel: false
  # HTML サイドバーと同じ フォルダ→ページ 構造のしおりを付ける。
  bookmarks: true
  # ページ番号。既定で出す（v0.10）。false で消し、HTML 断片で差し替える。
  # Chromium 自身の pageNumber / totalPages / title / date / url クラスを使う（24.5）。
  # {{token}} 構文は無い。断片は書いたまま Chromium へ渡される。
  footer: '<span class="pageNumber"></span> / <span class="totalPages"></span>'
  header: false
```

**この例はテストの fixture である（v0.11）。** それまでは散文だったので、実際にずれた。
`sources.markdown.enabled` / `gfm` / `frontmatter`、`sources.asciidoc.enabled` / `safeMode` / `attributes`、
`sidebar.collapsible`、`html.selfContained` / `routeMode` / `darkMode`、`pdf.enabled`、
`search.enabled` の 12 個——スキーマに存在しないキー——を載せていた。12.2 ですべてのオブジェクトを
strict にした以上、この文書自身の設定例は monodocs が読み込めない設定になっていた。写して使えば
`Unrecognized key` で止まる。効く対策は注意深く読み直すことではなく、このブロックを取り出して
`loadConfig` に通すテストである。存在しないツールを説明した例は、そこで落ちる。

### 12.2 未知のキー（v0.10）

スキーマ上のすべてのオブジェクトが、知らないキーを拒否する。トップレベルも含む。v0.10 までは
一部（`sidebar` / `pdf` / `html.labels`）だけがそうしていたため、綴りの誤りが捕まるかどうかは
そのキーがどの深さにあるかで決まっていた。`pdf.footr` はビルドを止め、トップレベルの `langauge`
は受理されて黙って捨てられる。

悪いのは後者である。拒否されたキーは、止まって問題を名指ししてくれるビルドだが、無視された
キーは「正しく見える設定ファイル」であり、出力を読むまで分からない。実際、`lang:` の行が正しい
顔をしてファイルに座ったまま、誤った言語を宣言した文書が公開された。キーは読まれ、検証され、
そして捨てられていた。「どこに書いたかによる」を、ファイル全体で 1 つの規則に置き換える。

エラーはキーと、それを含むオブジェクトを名指しする（`pdf: Unrecognized key: "footr"`）。Zod の
issue 配列を JSON のまま出したりはしない。トップレベルの strict 化は、まだ存在しないキーを
先取りで書いている設定を壊す破壊的変更である。1.0 の後ではなく前に行う。

### 12.3 ページにならないもの（v0.10）

`sources.exclude` は、入力ディレクトリからの相対パスに対して評価する glob のリストで、一致した
ファイルはページにならない。これは既定リスト（`_partials/**` / `partials/**` / `includes/**` /
`**/_*`）を置き換えるのではなく、そこへ **追加** される。

置き換えが以前の挙動であり、静かに、しかも離れたところで失敗していた。既定リストがあるのは、
それらの場所がページではなく include 用の断片を置く場所だからである。下書きを 1 つ外すために
無関係なパターンを 1 行書くと、その保護ごと切れる。書いた人が目にするのは、何コミットか後に
サイドバーへ並んだ断片であり、両者を結ぶ手がかりは何も無い。追加するリストにはそれができない。
本当に `_` 始まりのファイルまで束ねたいツリーのための逃げ道が `sources.excludeDefaults: false`
で、これなら設定ファイルを読む人の目に見える形で残る。

キーの場所も移した。以前は `sidebar.exclude` だったが、これはサイドバーの設定ではない。一致した
ファイルはそもそもページにならないのだから、外れるのはナビゲーションではなく束そのものである。
`sidebar.exclude` は同じ規則（追加）で引き続き有効にし、移動先を警告で伝える。コマンドラインで
直接名指ししたファイルは、パターンに関わらず束に入る（25.2）。名指しは明示的な選択であり、
パターンが決めるのはディレクトリ走査が何を拾うかだけだからである。

### 12.4 1.0 が凍結するもの（v0.11）

「1.0 がユーザー可視の表面を凍結する」は、いくつもの項目を 1.0 より前に置く理由として繰り返し
使われてきた。しかしどこにも書かれていない。そして字義どおりに読めば「以後は何も追加できない」と
なり、1.0 は成長できる最後のリリースということになって、この文書のあらゆる案を 1.0 前の
マイルストーンへ押し込むことになる。それは意図ではない。そして意図は、番号を名乗る前に書いておく
ものであって、後から誰かの解釈として発見されるものではない。

1.0 が約束すること：

- 1.0 が受理する設定キー・CLI のコマンドとオプション・記法を、1.x のいずれのリリースでも
  **削除・改名・意味の変更をしない**
- **既定値**をマイナーリリースで変えない。既定値の変更はメジャーである。書き手が何も触らないのに
  既存の文書が変わるからである
- 新しい任意キー、新しいコマンド、新しいオプション、既存の文書には現れ得ない記法は
  **マイナーリリースで追加してよい**。追加は 1.x が続いていく手段であり、それを使っていない設定を
  壊しようがない
- 機械可読な形式——とりわけ診断の JSON（27.3）——は**自身のスキーマバージョン**を持ち、利用側が
  固定するのは monodocs のバージョンではなくそちらである

1.0 がしないこと：

- 実装するリリースより先に、**受理して無視するキー**を用意しない。12.2 はファイル全体について
  逆の規則を選び、その理由も書いた。読まれ、検証され、捨てられるキーは、正しく見える設定と、
  そうではないと言う出力を生む
- **警告の文言**を凍結しない。メッセージは翻訳され（25.6）、書き直される。stderr を grep する
  スクリプトは、このプロジェクトが固定すると約束したことのないものを読んでいる。CI が固定できる
  ものとして診断の JSON がある
- バージョン間での**バイト単位の同一出力**は約束しない。生成物には生成器のバージョンが載り、
  Shiki の更新はクラスを変え、テンプレートは要素を増やす。約束するのは、**同じ入力・同じ設定・
  同じ monodocs のバージョンなら同じバイト列になる**ことであり、これがコミットした成果物を差分で
  レビューできるということである。ビルドが自前の時刻を埋め込まない理由でもある（13.5）

**非推奨化には形がある。** `sidebar.exclude` は `sources.exclude` へ移ったが、今も動き、移動先を
告げる（12.3）。これが型である。古い綴りは動き続け、警告し、置き換え先を名指し、削除は早くても
次のメジャーリリースである。マイナーリリースでは何も削除しない。そして、その前のリリースで警告を
出していないものは削除しない。

### 12.5 入力のルートと、そこから選ぶもの（v0.12）

`input` はディレクトリを 1 つ、v0.10 からはファイルを 1 つ指す（25.2）。`README.md` がルートに
あり、ページが `docs/` にあるリポジトリは、1 つの文書として組めない。そしてその構成は珍しくも
何ともない——ほとんどのリポジトリがその形をしている。

素直な解決は `input` にリストを取らせることだが、これは誤りである。理由は書いておく価値がある。
1 つのツールの単一ルートが複数になるとき、いつでも同じことが起きるからである。ルートは 4 つの
問いに同時に答えている。`monodocs.config.yml` をどこから探すか、route が何からの相対か、画像を
どのディレクトリから読んでよいか（20.2）、AsciiDoc の `include::` がどこまで届いてよいか（17.3）。
`["./README.md", "./docs"]` ではその全部が曖昧になる。`README.md` と `docs/index.md` はどちらも
`/` になりたがり、`./assets/logo.png` は一方のルートの内側で他方の外側にあり、同じベース名の
2 ファイルは別ルートから同じ page ID を作る。

そこでルートは 1 つのままにし、**選択**のほうを設定可能にする。

```yaml
root: "."
sources:
  include:
    - "README.md"
    - "docs/**"
```

`root` はすべての相対の基準となるディレクトリで、既定値は `input` の値である。したがって既存の
設定は意味を変えない。`input: ./docs` は「`root: ./docs` で配下すべてを含める」である。
`sources.include` は `root` からの相対 glob のリストで、書かなければ `root` 配下すべてが候補に
なる——これが現在の挙動である。`sources.exclude`（12.3）は今までどおり差し引き、しかも**最後に**
差し引く。下書きを除くパターンが、たまたまそれを含む include に打ち消されないためである。

route は今までどおり `root` からの相対パスで作る。つまり `docs/` のツリーに `README.md` を足すと
その中の全ページの route が変わり、`docs/index.md` は `/` ではなく `/docs/` になる。これは実際の
コストであり、正直なコストである。文書は 2 つのツリーを含むようになったのであって、そうでないふり
をするには include ごとの route の基準を発明することになる——それは名前を変えた多重ルートの曖昧さ
そのものである。そうした文書の並び順は `sidebar.mode: custom`（14.2）が既に扱えるし、古いリンクは
route の別名（15.5）が生かし続ける。

`input` は改名も非推奨化もしない。単一ディレクトリの文書が使う綴りであり、既存のすべての設定・
CLI の引数・このリポジトリのすべての例にある綴りである。`root` は複数のディレクトリにまたがる
文書が設定するものであり、両者は同じキーを違う距離から見たものである。両方書いてあって `input` が
`root` の外を指す場合は、マージではなく設定エラーとする。
---

## 13. メタデータ

### 13.1 Markdown

Markdown では YAML frontmatter を利用する。

```md
---
title: インストール
order: 10
hidden: false
description: インストール手順
---

# インストール
```

### 13.2 AsciiDoc

AsciiDoc では document attributes を利用する。

```adoc
= インストール
:sd-title: インストール
:sd-order: 10
:sd-hidden: false
:sd-description: インストール手順
```

`sd-` は `monodocs` 用の属性名前空間とする。

### 13.3 タイトル優先順位

共通の優先順位：

```text
1. 明示メタデータ
   - Markdown: frontmatter.title
   - AsciiDoc: :sd-title:
2. 文書タイトル
   - Markdown: H1
   - AsciiDoc: = Title
3. ファイル名
```

`sidebar.titleFrom: "filename"` を指定すると 2（文書タイトル）を飛ばし、明示メタデータが無ければ
ファイル名をタイトルにする（見出しが本文に出ても、ナビ名にはファイル名を使いたい運用向け）。
明示メタデータ（1）は `titleFrom` に関わらず常に最優先。

### 13.4 order 優先順位

```text
1. custom sidebar の明示順序
2. Markdown frontmatter.order / AsciiDoc :sd-order:
3. ファイル名プレフィックス
4. ファイル名順
```

### 13.5 文書のメタデータ（v0.11）

13.1 から 13.4 まではページのメタデータである。文書にも文書自身のものがあり、monodocs が持って
いるのは 1 つだけ——`title` である。誰かに手渡す仕様書には版と日付があり、多くの場合は責任を持つ
人の名前もある。半年後に `docs.html` を開いた読者には、それが何の版なのか、いつ時点で正しかった
のかを知る手立てが無い。

```yaml
title: "社内ドキュメント"
document:
  version: "1.2"
  date: "2026-08-22"
  authors:
    - "ドキュメント班"
```

どの項目も任意で、どれも monodocs が解釈しない文字列である。`date` は暦として解析しないし、
`version` は何とも比較しない。これらがすることは 3 か所へ届くことである。PDF の文書情報
（24.3.2）——既に書いている `setTitle` の隣で `setAuthor` / `setSubject` / `setKeywords` が使われ
ないまま空いている。HTML と PDF の末尾の branding フッタ（23.2）——今は monodocs のバージョンしか
言わない。そして表紙があるとき（24.8）はそこである。

**ビルドは自前の時刻を刻まない。** この機能の安直な形はフッタにビルド時刻を入れることで、それは
まさにやってはいけないことである。同じ入力が実行ごとに違うバイト列になり、コミットした
`docs.html` は誰かがビルドし直すたびに差分を出し、再現可能なビルドが、誰も頼んでいない 1 行の
ために再現可能でなくなる（12.4）。出力に載る日付は、書き手が書いた日付である。ビルド日を入れたい
CI は `document.date` に値を渡せばよく——他のキーと同じくワークフローから設定できる——そのとき
日付は事故ではなく決定になる。

`title` は `document` へは移さない。既存のすべての設定とすべての例にあるキーであり、移動が買う
のは一貫性、払うのは 12.4 が「しない」と約束したことそのものである。
---

## 14. サイドバー

### 14.1 デフォルト

フォルダ構造から自動生成する。

入力：

```text
docs/
  index.md
  setup/
    install.adoc
    config.md
  guide/
    usage.adoc
```

出力イメージ：

```text
トップ
setup
  インストール
  設定
guide
  使い方
```

### 14.2 カスタマイズ

対応済み（v0.8）。構造・順序・タイトルを設定ファイルに書いたとおりに使う。

```yaml
sidebar:
  mode: "custom"
  items:
    - title: "トップ"
      path: "index.md"
    - title: "セットアップ"
      children:
        - path: "setup/install.adoc"
        - path: "setup/config.md"
```

各項目は `path`（ページ。`input` からの相対パスを拡張子まで書く）か `children`（グループ）の
どちらか一方だけを持つ。`title` はページでは省略可能（省略時はページ自身のタイトル）、導出元の無い
グループでは必須。`mode: custom` と `items` は必ずセットで指定する。片方だけを許すと「書いたのに
効かない」設定になり、エラーで弾くより分かりにくいため。

カスタムサイドバーは閲覧順も決める。前後ナビ、PDF のページ順、初期表示ページはこの並びに従う。
`items` に載らないページは route を保ったまま掲載ページの後ろへ置き、エラーではなく警告として
報告する（下書きをナビから外すのは正当な選択で、ページ自体には到達できるため）。`hidden` な
ページを書いた場合は警告つきでスキップし（ナビゲーションの判断は `hidden` に一本化する）、
ページがすべて消えたグループは見出しだけ残さず出力しない。存在しないパスはエラー（27.1 章）。

このモードでは構造もタイトルも明示されるため、フォルダ由来の `sidebar.titleTransform.directory` と
`sidebar.flattenSingleChild` は適用しない。`collapseDepth` / `exclude` / `titleFrom` /
`titleTransform.page` は従来どおり。

### 14.3 除外

デフォルトで以下をサイドバー生成対象から除外する。

```text
_partials/**
partials/**
includes/**
**/_*.md
**/_*.adoc
```

これにより、AsciiDoc の include 用ファイルや Markdown の partial をページ化しない。

---

## 15. ルーティング

### 15.1 route 生成

ソースファイルの相対パスから route を生成する。

```text
docs/index.md              -> /
docs/setup/install.adoc    -> /setup/install
docs/setup/config.md       -> /setup/config
docs/guide/usage.adoc      -> /guide/usage
```

拡張子は route に含めない。

### 15.2 hash route

単一 HTML では hash route を使う。

```text
docs.html#/
docs.html#/setup/install
docs.html#/setup/config
```

### 15.3 HTML 構造

```html
<main id="content">
  <article data-route="/" id="page-index">...</article>

  <article data-route="/setup/install" id="page-setup-install" hidden>
    ...
  </article>
</main>
```

### 15.4 疑似ページ切り替え

```js
function showPage(route) {
  document.querySelectorAll("[data-route]").forEach((el) => {
    el.hidden = el.dataset.route !== route;
  });
}
```

### 15.5 route の別名（v0.12）

hash route は、読者がコピーできるリンクである。それがこの仕組みの意味である。
`docs.html#/setup/install` は、ある人が別の人に「ここを見ろ」と伝える手段であり、単一ファイルと
して渡り歩く文書ではそれが唯一の手段でもある。リダイレクトするサーバーも、断り書きを置いておける
ページも無いからである。したがってそれは、ファイルより長生きするリンクでもある——チャットのログ、
チケット、別の文書の中に残る。`setup/install.md` を改名すれば、そのすべてが、黙って壊れる。
たどった読者が着くのは、正常に見えて中身の違うページである。

```md
---
title: インストール
aliases:
  - /setup/install
  - /getting-started/install
---
```

```adoc
= インストール
:sd-aliases: /setup/install, /getting-started/install
```

別名とは、今はこのページに解決される古い route のことである。表は `siteDataJson` に載り、
クライアントはどのページにも一致しない hash が来たときにそれを引く。ページを描画したうえで hash を
現在の route に置き換えるので、アドレスバーには次回も生きているリンクが残る。アンカー付きの route
（`#/setup/install#configuration`）はアンカーを保ったまま置換する。アンカーはパスではなく見出しに
属するからである。

規則は、リダイレクト表というものが必ず必要とするもので、読者に発見させずビルド時に検査する。

- 別名は実在するすべての route の後で照合する。したがって別名がページを覆い隠すことはない。
  ある別名と同じ route を持つページが後から現れたらページが勝ち、別名は「覆われた」と警告する。
  黙って優先することはしない
- 2 つのページが同じ別名を主張するのはエラーである。route の重複（27.1）と同じ扱いで、走査順で
  どちらかが勝つ状態は書き手が理屈で追えない
- 別名は route と同じ正規化を通す。先頭のスラッシュ、拡張子の除去、`index` はディレクトリを指す。
  したがって `setup/install.md` と `/setup/install` と `setup/install` は 3 つではなく 1 つである
- 別名はサイドバーにも検索索引にも前後ナビゲーションにも現れない。ページではなく、ページが応じる
  名前だからである

**別名は自動生成しない。** リポジトリの履歴を読めば、あるファイルが持っていたすべての route を
記録できる。しかしそうすると文書のリンク表がどのクローンでビルドしたかに依存し、CI の浅い
チェックアウトは別のファイルを作ることになる。別名は、書き手が書いた 1 行である。
---

## 16. Markdown 処理

### 16.1 Markdown renderer

Markdown は unified / remark / rehype を使う。

主な処理：

- frontmatter 抽出
- H1 抽出
- GFM 変換
- HTML 変換
- code block 変換
- image 抽出
- link 抽出
- heading ID 付与

### 16.2 Mermaid

Markdown では fenced code block を使う。

````md
```mermaid
graph TD
  A --> B
```
````

これを以下に変換する。

```html
<pre class="mermaid">
graph TD
  A --> B
</pre>
```

---

## 17. AsciiDoc 処理

### 17.1 AsciiDoc renderer

AsciiDoc は Asciidoctor.js を使う。

主な処理：

- document title 抽出
- attributes 抽出
- HTML 変換
- section headings 抽出
- xref 抽出
- image macro 抽出
- source block 抽出

### 17.2 AsciiDoc Mermaid

AsciiDoc では以下の記法を Mermaid として扱う。

```adoc
[source,mermaid]
----
graph TD
  A --> B
----
```

初期実装では、Asciidoctor.js の出力 HTML を後処理して Mermaid ブロックに変換する。

将来的には Asciidoctor.js extension として実装してもよい。

### 17.3 include

AsciiDoc の `include::[]` は Asciidoctor.js に任せる。

ただし、include 用ファイルが単独ページとしてサイドバーに出ないようにするため、以下のルールを設ける。

```text
_partials/**
partials/**
includes/**
**/_*.adoc
```

### 17.4 xref

AsciiDoc の xref は、単一 HTML 内 route に変換する。

入力：

```adoc
xref:../guide/usage.adoc[使い方]
```

出力：

```html
<a href="#/guide/usage">使い方</a>
```

### 17.5 属性と読み込みの境界（v0.12）

Asciidoctor は属性で設定するものであり、monodocs が設定しているのは 3 つ——`safe: "safe"`、
入力ファイル自身のディレクトリを指す `base_dir`、そして `showtitle` である。書き手は monodocs を
通して他の属性を設定できない。文書内の `:sectnums:` は効くが、番号を振りたい文書一式はそれを全
ファイルに書くことになり、ファイル間で共有したい値に至っては置き場所が無い。この文書は 1.0 より
前から `sources.asciidoc.attributes` を約束していながら、一度も持っていない（12.1）。

素朴な形は、受け取ったマップをそのまま Asciidoctor へ渡すことである。そうはできない。理由は外
からは見えにくい。API で設定した属性は**ロックされる**——文書側の指定を上書きし、既定値としては
振る舞わない——うえに、いくつかは monodocs が依存している境界そのものを動かす。`allow-uri-read` は
`include::` に URL を取りに行かせ、ビルドを HTTP クライアントに変える。`data-uri` / `imagesdir` /
`backend` はどこから読みどう変換するかを動かす。safe mode は最初のものを止めない。それは safe mode
が参照する当の属性であり、API から設定することがまさに有効化の手段だからである。

そこでキーは用意するが、中身は素通しせず分類する。

- **許可**し、ビルドごとに設定できるもの: 体裁と構造の属性。`sectnums`、`sectnumlevels`、
  `experimental`、`idprefix`、`idseparator`、`tabsize`、`toclevels` など
- **書き手が定義するもの**: 文書一式で共有する値——製品名、リリース番号、顧客名。多くの書き手が
  このキーを欲しがる理由はこれである。列挙ではなく形で認識する。組み込みの語彙に無い属性名は
  書き手のものである
- **拒否**し、属性名と理由を告げるもの: `allow-uri-read`、`docinfo`、`backend`、`data-uri`、
  `imagesdir`、`source-highlighter`、そして monodocs に属する `sd-*` 名前空間（13.2）。無視では
  なく拒否する。12.2 の規則である
- **そもそも設定させないもの**: `safe` と `base_dir`。これらはサンドボックスであり、設定ファイル
  から広げられるサンドボックスは名ばかりである

ここで設定した属性は**既定値**であってロックではない。したがって自分で指定した文書が勝つ。これは
Asciidoctor の API の既定とは逆で、設定ファイルに対して書き手が期待する挙動である——設定ファイル
とは「文書が別のことを言わない限り全文書がこうなる」を述べる場所である。

**safe mode がすること、しないこと。** Asciidoctor の SAFE モードは `include::` を base
ディレクトリに閉じ込め、monodocs はそれに依存している（17.3）。ただしシンボリックリンクの実体は
解決しない。これは Asciidoctor 自身が明記している。ツリーの内側から外側を指すリンクは、たどられる。
したがって、アーキテクチャ文書の「外部アクセスを防ぐ」という記述は強すぎる。v0.12 は表現を弱める
のではなく、記述が真になるようにする——include したファイルの実体パスを入力ルートと突き合わせ、
外へ解決されるものは、解決先のパスを示して拒否する。同じ検査を画像（20.2）にも掛ける。まったく
同じ穴がそこにもあるからである。

**Markdown には対応物を用意しない。** Markdown の本文に `vars:` を差し込むのはテンプレート言語
である。リテラルとして書く方法、未定義の名前の扱い、コードブロックと `<pre>` の扱い、再帰の可否
——そのどれもが仕様であり、テストである。AsciiDoc に属性があるのは AsciiDoc に属性があるからで
あって、monodocs はそれを発明する場所ではない。共有したい値がある文書一式は、共有するページを
AsciiDoc で書ける文書一式である。形式を混在できる（6.3）とはそういうことである。
---

## 18. リンク変換

### 18.1 基本方針

Markdown / AsciiDoc にかかわらず、最終 HTML 内のリンクを route に変換する。

対象：

- Markdown の `.md` リンク
- Markdown の `.adoc` リンク
- AsciiDoc の `xref:`
- AsciiDoc 変換後 HTML の `.html` 相当リンク
- 画像リンク

### 18.2 Markdown 例

入力：

```md
[設定](./config.md)
[インストール](./install.adoc)
```

出力：

```html
<a href="#/setup/config">設定</a> <a href="#/setup/install">インストール</a>
```

### 18.3 AsciiDoc 例

入力：

```adoc
xref:config.md[設定]
xref:install.adoc[インストール]
```

出力：

```html
<a href="#/setup/config">設定</a> <a href="#/setup/install">インストール</a>
```

### 18.4 見出しリンク

対応済み。当初はファイル単位までの解決だったが、アンカーまで解決する。

例：

```md
[認証設定](./config.md#認証設定)
```

出力：

```html
<a href="#setup-config-認証設定">認証設定</a>
```

当初の 2 候補のうち、`#/route?heading=…` ではなく要素 ID を採用した。要素 ID は
`{page-id}-{元のID}`（19章）で既に一意化されており、テーマの router は「`/` で始まらない hash は
その要素を含むページを表示する」経路を既に持ち、全ページを展開する PDF でも Chromium が同じ href を
そのまま内部リンクにできる。`?heading=` 形式は route 記法と router の拡張が必要になるだけで、
できることは変わらない。

アンカーはリンク先ファイルが生成する ID と照合するため、Markdown から AsciiDoc の見出しを指す場合は
Asciidoctor が生成する ID（例: `_details`）を書く必要がある。リンク先に存在しないアンカーはページ先頭へ
フォールバックし、警告として報告する（`validate` で検出できる）。

---

## 19. 見出し ID

複数ファイルを単一 HTML に入れるため、見出し ID の衝突回避が必須。

悪い例：

```html
<h2 id="overview">概要</h2>
<h2 id="overview">概要</h2>
```

良い例：

```html
<h2 id="setup-install-overview">概要</h2>
<h2 id="guide-usage-overview">概要</h2>
```

ID 生成ルール：

```text
{page-id}-{slugified-heading}
```

例：

```text
setup/install.md + ## 概要
-> setup-install-overview
```

AsciiDoc 由来の heading ID も同様に prefix を付けて衝突を避ける。

### 19.1 見出し番号（v0.14）

仕様書は自分自身を参照する。「3.2 を参照」は、ある条項が別の条項を指す書き方であり、レビュー
コメントに書かれる形であり、外部の規程が引用する形である。monodocs はその番号を作れない。
AsciiDoc の `:sectnums:` は 1 ファイルの節に番号を振り、次のファイルで振り直す。ファイルを束ねた
文書ではそれは 1 つの番号体系ではなく複数である。Markdown には何も無いので、混在文書は仮に両方に
番号があったとしても自分自身と一致しない。

したがって番号付けは、2 つの形式が既に 1 つにされた場所——レンダリング後の `Page[]` モデル——に
属する。どちらのレンダラーでもない。

```yaml
numbering:
  sections: 3 # false（既定）、または番号を振る最深の見出しレベル（2〜6）
```

番号を決めるのは文書の構造である。第 1 階層の番号はサイドバー順（14.1）でのページの位置から来る。
読者が文書を通る順序であり、つまりページが章で、その `h2` が `1.1` / `1.2` になる。ページを持つ
ディレクトリは自分の階層を 1 つ提供するので、番号付きの `guide/` の下の `guide/usage.md` は振り
直さずに `2.3` になる。`h1` には見出しとしての番号を振らない——それはページタイトルであり、その前に
立つのはページ自身の番号である。

どこに番号を出すかは、1 つのスイッチではなく面ごとの決定である。

- **見出しの中**。専用の `<span>` に入れる。スタイルシートで抑制でき、見出しをコピーすれば番号も
  ついてくる
- **サイドバーとページ内目次**。本文と食い違う番号の目次は、番号の無い目次より悪い
- **検索索引の中**。ただし独立したトークンとしてではない。`3.2` で検索する読者は節を探しており、
  `usage` で検索する読者が数字に負けてはいけない
- **route・page ID・見出し ID には入れない**。これらはアドレスであり（15.1、19）、ページを並べ替え
  たら変わるアドレスは、これまでにコピーされたすべてのリンクを壊す。15.5 が防ごうとしている当の
  失敗である。番号はラベルである

**番号付けが有効なとき、文書内の `:sectnums:` は拒否する。**設定キーを名指して拒否する。1 つの
文書に 2 つの番号体系があると、同じ見出しに 2 つの番号が付き、相互参照がどちらを指していたのかを
判定する手段が無くなる。

これは紙の文書向け機能のうち最も小さく、他が寄りかかる 1 つでもある。24.9 の目次は番号付きの節を
並べるものであり、「3.2 を参照」が役に立つのは 3.2 が紙に書いてある文書だけである。
---

## 20. 画像埋め込み

### 20.1 対応形式

```text
png
jpg
jpeg
gif
svg
webp
```

### 20.2 Markdown

入力：

```md
![構成図](./images/architecture.png)
```

出力：

```html
<img src="data:image/png;base64,..." alt="構成図" />
```

### 20.3 AsciiDoc

入力：

```adoc
image::images/architecture.png[構成図]
```

出力：

```html
<img src="data:image/png;base64,..." alt="構成図" />
```

### 20.4 サイズ制限

設定例：

```yaml
assets:
  embedImages: true
  maxInlineSize: "5MB"
  onLargeImage: "warn"
```

`onLargeImage` の候補：

```text
warn
error
external
```

### 20.5 出力サイズ（v0.13）

33.3 は単一 HTML が巨大になるリスクを記録しており、monodocs が持つ制御は 1 つ——`maxInlineSize` と
`onLargeImage`——で、これは画像を 1 枚ずつ裁く。ファイルを測るものは無い。ビルドが出すのはページ数
と出力先だけなので、スクリーンショットを 14 枚埋め込んだ書き手は、その結果をメールの不達通知で
知る。

```text
docs.html  8.4 MB
  画像          7.9 MB  (12 ファイル、最大: guide/setup.png 2.1 MB)
  mermaid       0.9 MB  (inline ランタイム)
  ページデータ  0.4 MB  (siteDataJson: 本文・見出し・検索)
  文書          0.2 MB
```

内訳は、完全な会計ではなく、正直に測れるものである。埋め込んだ画像、`mermaid.runtime: inline`
（21.1）が入れたときの Mermaid ランタイム、検索対象の本文を運ぶ `siteDataJson`、そしてそれ以外を
1 行。Shiki は現れない。出力にランタイムを持たないからである——ハイライトはビルド時に行われ、
本文に span が残る。それは文書の一部である。

```yaml
assets:
  budget: "10MB" # 既定では未設定。超えたら警告する
  onBudget: "warn" # warn / error
```

予算は、測定を行動に変えるものである。既定は `warn` である。キーを足しただけで、既に超えている
ビルドが落ちてはならない。`error` は、メール添付や wiki のアップロード上限に収まらなければ
ならない文書の CI のためにある。これは実在する制約であり、破るまで見えない制約である。

**画像は再エンコードしない。これは省略ではなく決定である。** 4 MB のスクリーンショットを 200 KB
にするのはここで得られる最大の節約であり、monodocs はそれをしない。

- それを上手くやるライブラリはネイティブである（`sharp` / libvips）。公開している CLI は単一の
  CJS バンドルと SEA バイナリ（8.5）で、どちらもネイティブアドオンを載せられない。機能が一方の
  配布形態にだけ存在することになり、それは PDF 出力が既に抱えている分断であって、2 つ目は要らない
- 代わりにブラウザでやると、HTML だけのビルドにも Chromium が要る。それは今、バイナリにできること
  とできないことの境界である
- エンコーダの出力は版とプラットフォームに依存するので、同じ入力が別のマシンで同じバイト列に
  ならなくなる。12.4 が約束する再現性を、利便性のために売ることになる
- 品質、色空間、EXIF の向き、アニメーション、SVG のそれぞれに規則が要り、規則を誤れば書き手の絵が
  黙って劣化する

画像が本当に大きすぎる文書に対する答えは `onLargeImage: external` のままである。画像は HTML の
隣のファイルとして残り、それは単一ファイルでなくなった文書であり、そう明言する文書である。画像を
小さくしたい書き手には、まさにそれを専門にする道具があり、それを走らせることは、このツールの約束
ではなく、その人のビルドの 1 工程である。
---

## 21. Mermaid

### 21.1 client mode

初期実装では client mode を採用する。

```yaml
mermaid:
  enabled: true
  mode: "client"
```

HTML に Mermaid.js を含め、ブラウザ側で描画する。

メリット：

- 実装が簡単
- Mermaid CLI / Chromium に依存しない
- VS Code プレビューでも扱いやすい

デメリット：

- JavaScript が必要
- PDF 化時には描画完了待ちが必要
- HTML サイズが増える

### 21.2 pre-render mode

対応済み。

```yaml
mermaid:
  enabled: true
  mode: "pre-render"
```

ビルド時に Puppeteer（`puppeteer-core` + システム Chromium）で各図を SVG 化し、HTML に埋め込む
（当初案の Mermaid CLI ではなく既存依存の mermaid@11 を 1 ページ内で `mermaid.render` 実行し、id 衝突を
自前制御する方針に変更）。実装は `pipeline/mermaidPrerender.ts` と `postprocess.ts` の
`processMermaidPrerender`。SVG は raw ノードで挿入し、id は全 HTML で一意な `mermaid-{n}` を採番する。

メリット：

- PDF 化に強い
- JavaScript なしでも表示できる
- 印刷結果が安定する
- 図が少数なら inline ランタイム（約 975KB gzip 固定）より小さい

デメリット：

- 依存が重い（Chromium）。バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では利用不可
- CI 環境で失敗要因が増える
- SVG のテーマはビルド時固定（ダーク/ライトのトグルに追従しない）

---

## 22. 検索

### 22.1 初期実装

単純な部分一致検索。

検索関連のクライアントデータ例：

```js
window.__MONODOCS_DATA__ = {
  title: "マニュアル",
  initialRoute: "/setup/install",
  colorScheme: "light",
  // ページ内目次に出す最深レベル。pages[].headings には検索がどの見出しへも
  // 飛べるよう h2 以降をすべて持たせる。
  tocMaxLevel: 3,
  pages: [
    {
      route: "/setup/install",
      title: "インストール",
      hidden: false,
      headings: [
        {
          id: "setup-install-prerequisites",
          text: "前提条件",
          level: 2,
        },
      ],
      text: "インストール方法...",
    },
  ],
};
```

検索対象：

- title
- headings
- plain text

### 22.2 スコアリングと複数キーワード

対応済み（v0.8）。依存を増やさず、テーマの `app.js` 内で完結させている。当初候補だった
`minisearch` は、部分一致で足りる範囲の改善のためにインデックスとランタイムを生成物すべてへ
同梱することになり、単一ファイルへ自己完結させる方針と釣り合わないため採用しない。

クエリは空白（全角空白を含む）で語に分割し、**すべての語**がいずれかのフィールドに含まれる
ページだけを結果に残す（AND 検索）。語ごとにフィールド別のスコアを与えるため、タイトル一致が
見出し一致より、見出し一致が本文一致より上位に出る。本文での繰り返し出現には上限付きで加点し、
語がその並びのまま現れる場合はさらに加点する（間の空白は種類も個数も問わない）。同点は文書順を保つ。

```text
語ごと: タイトル 100   見出し 30   本文 10（追加出現ごとに +1、上限 +5）
語順一致（該当する最上位のみ）: タイトル +40 / 見出し +20 / 本文 +10
```

照合は、小文字化と全角英数字（`ＰＤＦ`）の半角化で畳んでから行う。畳み込みは文字列長を保つため
ハイライト位置がずれない（長さが変わりうる NFKC は使わない）。部分一致で照合するため日本語に
分かち書きは不要で、空白区切りのクエリも英語と同じように扱える。

見出しに一致した結果は、ページ先頭ではなくその見出しの要素 ID へリンクし（ファイル間の見出し
アンカーと同じ仕組み。18.4 章）、ページタイトルの下に見出しを表示する。検索がどの見出しにも
到達できるよう、クライアントへは `h2` 以降の見出しをすべて渡し、ページ内目次側で
`toc.maxLevel` まで絞り込む。

一致した語はタイトル・見出し・抜粋のいずれでも `<mark>` で強調する。抜粋は、異なる語を最も多く
含む本文の窓を選んで表示する。結果から開いたページの本文でも同じ語を強調する（22.5 章）。

### 22.3 仮名・記号の畳み込み

対応済み（v0.9）。`fold` はさらに、カタカナをひらがなへ写し、日本語が同じ位置で書き分ける文字を
1 文字へ寄せる。読者がどちらの表記で入力しても、もう一方の表記が引ける。

- カタカナ → ひらがな。U+30A1–U+30F6 は U+3041–U+3096 と 1 対 1 に対応するため、濁点付き
  （`ガ` → `が`）も `ヴ` / `ヵ` / `ヶ` も含まれる。対応するひらがなを持たない `ヷ`–`ヺ` は変換しない。
- 長音記号 `ー`、ダッシュ類（U+2010–U+2015、U+2212）、全角ハイフンは `-` へ、波ダッシュ `〜` と
  全角チルダ `～` は `~` へ畳む。これらは同じ位置で書き分けられ、特に波ダッシュと全角チルダは
  執筆環境によって入れ替わる。

いずれも 1 文字 → 1 文字の写像なので、ハイライトと抜粋の位置が依存する「長さを保つ」という不変条件
（22.2 章）を壊さない。

関連する 3 つの表記ゆれは、いずれもこの不変条件を壊すため対象外とする。

- **半角カタカナ**（`ｶﾞ` → `ガ`）は 2 文字を 1 文字へ合成するため、畳んだ文字列が原文と位置を
  共有しなくなる。
- **送り仮名の揺れ**（`引き渡し` / `引渡し`）は文字からは導けない。数 MB の辞書を持つ形態素解析が
  必要で、単一の自己完結ファイルを作るという monodocs の目的と正面から衝突する。
- **英語の stemming**（`installing` → `install`）は実装自体は小さいが、トークンの長さが変わるため
  半角カタカナと同じ位置対応表が必要になる。

いずれかに対応するということは、その場で畳む方式を、トークンと原文の位置対応表を持つ方式へ
置き換えるということである。その書き換えに見合う理由ができたときに 3 つまとめて再検討する。
単独でこの書き換えを正当化できるものは無い。

### 22.4 結果リストのキーボード操作

対応済み（v0.9）。検索欄と結果リストを ARIA の combobox として関連付ける。`↓` / `↑` で選択を
移動し（端では反対側へ回り込む）、`Enter` で開く。`Escape` はこれまでどおりクエリを消す。

その間フォーカスは検索欄に残したままで、選択位置は `aria-activedescendant` で伝える。こうすることで
読者は Tab で戻らずにそのまま入力を続けて絞り込める。同時に、選択中の結果には専用の枠線が要る。
ブラウザのフォーカスリングは入力欄側にあり、読み上げられている行には出ないためである。

未選択のまま `Enter` を押したときは先頭の結果を開く。クエリを打ち終えた読者の意図はそれである。
`Home` / `End` は文字入力のキャレット移動に残す。

IME の変換中は、ハンドラの先頭で何もせずに戻る（`isComposing`。これを立てない環境向けに
`keyCode === 229` も見る）。変換中の同じキーは IME のものだからである。上下キーは変換候補の移動、
`Enter` は確定にあたるため、横取りすると検索欄での日本語入力が壊れ、未確定のクエリのまま結果を
開いてしまう。

option の ID は、接頭辞が予約済みだと決めてかからず、文書が既に持つ ID と突き合わせて決める。
ページ ID と見出しの組み合わせで同じ文字列は実際に作れてしまい（`monodocs-search.md` の見出し
`Option 0` は `monodocs-search-option-0` になる）、ID が重複すると、文書順でサイドバーが先にあるため
`getElementById` が見出しではなく結果の行を返す。そのアンカーをたどってもページが切り替わらなくなる。

結果リストは listbox なので、`li` は `role="presentation"` とし、中のリンク自身を `role="option"`
とする。リンクは Tab 順から外し（`tabindex="-1"`）、`Tab` の 1 回で検索欄を抜けられるようにする。
キーボードでの実行とクリックは同じ経路を通し、ポインタを合わせた行へ選択も移すため、2 つの操作の
現在地が食い違うことはない。

role と ARIA 属性は `template.html` ではなく `app.js` から付ける。マークアップだけ差し替えて既定の
スクリプトを使うカスタムテーマでも同じ操作ができる。

### 22.5 本文のハイライト

対応済み（v0.9）。結果を開くと、その語を開いた先のページの本文でも強調する。結果一覧が示した
一致が、読者が着いた場所でそのまま見えるようにするためで、ブラウザの検索でもう一度探す必要がない。

ハイライトはそのページを開いた検索に属する。`app.js` は結果を開いた時点の語を覚えて表示中の
article に付け、表示ページが変わるたびに付け直す。前後ナビや本文中のリンクで移っても一致は見えた
ままになる。クエリを打ち替えれば強調は外す。打ち込んでいる語は、開いてあるページを選んだときの
語ではないからである。`Escape` はクエリごと消すので、強調も一緒に消える。

開く位置は変えない。見出しに一致した結果はその見出しへ、タイトル・本文だけの一致はページ先頭へ
開く。ハイライトは示すだけで、表示位置は動かさない。強調は `<mark class="search-hit">` で、
変えるのは背景色だけなので、折り返し位置もスクロール位置もずれない。class は配色のためだけで、
外す対象かどうかはスクリプトが生成した要素に付ける DOM プロパティで判断する。本文自身が
`<mark>` を持つことがあり（AsciiDoc の `#強調#`）、生の HTML なら任意の class も書ける。22.4 章の
option ID と同じく、名前が予約済みだとは決めてかからない。プロパティは文書側からは書けないので、
同じ class を持つ本文には触れず、本文の `<mark>` の中に語があればその中で入れ子に強調する
（元の要素は置き換えない）。外すときは元のテキストへ戻したうえで親を `normalize()` するので、
構造とノード数は元どおりに戻り（元のテキストノードそのものが戻るわけではない）、付け外しを
繰り返しても本文がどんどん細かいテキストノードに割れていくことはない。

照合は結果一覧の畳み込みと一致範囲をそのまま使う（22.2、22.3 章）。ひらがなのクエリが本文の
カタカナ表記を強調する挙動は抜粋と同じである。照合はテキストノード単位で行うため、インライン
マークアップで割れた語（`**イン**ストール`）はページの順位付けには効くが（インデックスはページ
全体のテキストから作る）、本文では強調されない。要素をまたいで強調するには、22.3 章で見送った
表記ゆれと同じ位置対応表が要るため、同じ理由で見送る。

3 種類の部分木には触れない。Mermaid のコードブロックはランタイムが読み、図に置き換えるソース
なので、強調を差し込むと図が壊れる。`svg` はそのランタイムが残した結果である。コードブロックの
ツールバーとコピー結果のトーストは、本文ではなくテーマが差し込んだ UI の文言である。1 ページ
あたりの強調数には上限（500）を置く。どこにでも出る語で、1 回の遷移が何千もの要素の生成に
ならないようにするためである。上限は照合そのものにも効かせる。1 つのテキストノードが段落や
コードブロック 1 つぶんになりうるため、全出現を集めてから余りを捨てるのではなく、上限の数だけ
集めて打ち切る。

CSS Custom Highlight API を使えば DOM に触れずに済むが、採用しない。自己完結した HTML が開かれる
ブラウザを考えるとフォールバックが要り、そのフォールバックは結局 `<mark>` の実装だからである。

---

## 23. HTML テンプレート

### 23.1 基本構造

```html
<!doctype html>
<html lang="{{lang}}">
  <head>
    <meta charset="utf-8" />
    <title>{{title}}</title>
    <style>
{{style}}
    </style>
  </head>
  <body>
    <div id="app">
      <aside id="sidebar">{{sidebar}}</aside>

      <main id="content">{{pages}}</main>
    </div>

    <script>
      window.__MONODOCS_DATA__ = {{siteDataJson}};
    </script>

    <script>
{{appJs}}
    </script>
  </body>
</html>
```

### 23.2 UI 要素

初期：

- 左サイドバー
- 本文領域
- 現在ページハイライト
- hash route によるページ切り替え

将来：

- 検索ボックス
- ページ内目次
- 前後ページナビゲーション
- ダークモード
- サイドバー折りたたみ
- 印刷用レイアウト

---

### 23.3 カスタムテーマ

対応済み（v0.8）。`html.theme` には組み込みテーマ名か、ディレクトリのパス（設定ファイル基準で解決）
を書ける。`.` 始まり・区切り文字を含む・絶対パスのいずれかをパスとみなし、それ以外は組み込みテーマ名
として扱う。未知の名前は、ファイルが無いというエラーではなく組み込みテーマ一覧を添えて拒否する。

テーマディレクトリには `template.html` / `style.css` / `app.js` を置け、**置かなかったものは既定
テーマで補う**。ここが中心的な判断で、実際に多いのは配色の変更であり、`app.js`（ルーティング・検索・
目次・前後ナビ・ダークモード・コードブロック操作・画像 lightbox を含む）の丸ごとコピーを強いると、
色を変えたいだけの利用者にとってリリースのたびにマージ作業が発生してしまう。3 つとも無い
ディレクトリは、パスの指定間違いとして拒否する。

カスタムの `template.html` には `{{style}}` / `{{sidebar}}` / `{{pages}}` / `{{siteDataJson}}` /
`{{appJs}}` / `{{bodyScripts}}` が必須で、欠けているものを名指ししてビルドを失敗させる。これらが
無い文書は本文を表示できず、クライアントも動かず、Mermaid ランタイムも注入できないため。残りの
トークンと条件ブロックは任意で、省けばその機能が出力から消えるだけになる。

テーマはファイルシステムから読むため、組み込みテーマしか同梱しないスタンドアロンバイナリを含め、
どの配布形態でも使える。`node_modules` からの解決は意図的に実装しない。バイナリでは動かせず、
npm で公開されたテーマもパス指定で参照できるため。`watch` / `serve` はテーマディレクトリも監視し、
編集をプレビューへ反映する。

出力は単一の自己完結ファイルなので、テーマから外部アセットは参照できない。フォントや画像は
`style.css` に data URI で埋め込む。テーマは文書に埋め込まれる実行可能なコードであり、ドキュメントの
ソースと同じ信頼度で扱う（33 章および development.md のセキュリティ方針）。

### 23.4 文書の言語と UI ラベル（v0.10）

生成物には、一致する理由のない 2 つの言語が同居する。ページ本文が書かれている言語と、monodocs が
その周りに被せる UI——サイドバーの検索欄・`On this page`・`No results`・`Copy`・lightbox の操作・
前後ナビ——の言語である。

v0.10 まではどちらも決まっていなかった。`template.html` は `<html lang="ja">` を直書きしている
一方でラベルは全て英語であり、出力は両方の読者に対して同時に間違っていた。日本語の読者は
`On this page` を見せられ、スクリーンリーダーは英語のラベルを日本語の音声で読むよう指示されていた。
そのどちらも設定では直せなかった。

**これは記録済みの決定を覆すものである。** architecture.md は「テーマ UI ラベルは本文言語から独立
した英語に統一する」と明記していた。ラベルがテーマの固定部分であるうちは筋が通っていたが、あれは
読者のために選んだ方針というより実装の説明だった。結果として、日本語の文書が `lang="ja"` を宣言
しながら英語を表示するという、誰の役にも立たない唯一の組み合わせを残していた。覆したことは
architecture.md 側にも記録し、2 つの文書が矛盾したまま残らないようにする。

トップレベルの `lang` キーが `<html lang>` を埋め、ラベル表を選ぶ。既定は `en` で、このリポジトリ
が英語を第一言語として公開している README・ドキュメントサイト・CLI メッセージ（25.6）に揃える。
日本語の文書は `lang: ja` を書けば、宣言している言語とラベルの言語が初めて両方とも日本語である
文書を得る。直書きの `ja` に依存していた利用者にとっては属性が変わる破壊的変更であり、
`manual.html` の改名と同じ理由で 1.0 より前に行う。

`lang` は構文的に妥当な BCP 47 タグを何でも受理する。文書の言語であり、`<html lang>` はそれを
言えなければならないからである。妥当でない文字列は属性に書かず拒否する。ラベル表を同梱するのは
`en` と `ja` だけで、タグは主要言語サブタグで大文字小文字を無視して照合するので、`en-GB` も
`ja-JP` も `JA` も当たる。照合すべき主要言語サブタグを持たないタグ——タグ全体が私用の `x-…` や
grandfathered tag——は、表を持たない他のタグと同じく `en` のラベルへフォールバックし、その
フォールバックはタグを名指ししてビルドごとに一度警告する。未知のタグを拒否する案は採らない。
フランス語の文書がビルドを通すためだけに自身を英語と偽って宣言することになり、それは上書き可能な
英語ラベルより読者にとって悪い。

`html.labels` が、選んだ表の上から個別の項目を差し替える。`html` の下に置くのはテーマの UI に作用
するからで、`html.theme` や `html.imageLightbox` と同じ層にあたる。一方 `lang` は文書そのものを
記述するので `title` と並ぶ。未知のキーは拒否し、打ち間違いが既定値のまま黙って残ることを防ぐ。
これは同時に、**キー集合が 1.0 で凍結される公開 API になる**ことを意味するので、テーマがたまたま
読むものに委ねず、設定リファレンスに列挙する。

表を 2 つしか同梱せず残りを上書き可能にするのは、約束として小さいからである。中途半端に訳された
言語を core に同梱することは、その言語の読者にとって項目が無いことより悪く、しかもそれを追従させ
続けるのは話者ではなくメンテナである。

`lang` に対する表の解決と `html.labels` の適用は core で行う。したがってラベルが何を言うかの正本は
core である。結果は、どのカスタムテンプレートも保持が必須である `{{siteDataJson}}` に公開し、
`app.js` は文字列の写しを自前で持たずそれを消費する。表と上書きが両者の間でずれることが無いように
するためである。

**カスタムテーマが受け取れる範囲はテーマ契約（23.3）に縛られる。そしてここでは、気前のよい保証を
書くことより、境界を正確に書くことの方が重要である。**保証される度合いは 4 段階に分かれる。

- **どのテーマも**、解決済みのラベルをデータとして `{{siteDataJson}}` から受け取る。無条件の保証は
  これだけであり、monodocs が実際に守れるのもこれだけである
- **既定の `app.js`** は、既定テンプレートが備える DOM hook に対してラベルを適用する。`style.css`
  だけを差し替えたテーマは組み込みと全く同じに振る舞う。`template.html` を差し替えたテーマは、
  その hook を残した箇所にだけ届き、それ以外には届かない。スクリプトは見つけられる構造にしか
  働きかけられないので、hook を残さず書き直したテンプレートは対象外である
- **`app.js` を差し替えたテーマ**は、データを受け取って自分で適用する。ルーティング・検索・目次を
  既に引き受けているのと同じことである。monodocs が保証するのは配達であって適用ではない
- **独自の `template.html` が自前で書いた静的な文字列**は、書いたまま残る。他人のマークアップの中の
  どの文字列がラベルのつもりだったかを monodocs は知り得ない。既定テンプレートは静的ラベルを
  トークンから取るので、それをコピーして始めたテーマはこの挙動を引き継ぐ

`{{lang}}` は必須トークンではなく任意トークンとして追加する。必須にすると、この機能を欲しがって
いないかもしれない既存の全テーマを壊すことになる。`<html lang="…">` を直書きしたカスタム
テンプレートは、書いたものが残る。

ラベルは設定ファイル由来の値であり、HTML のテキスト・`title` や `aria-label` のような属性値・
`siteDataJson` の JSON という 3 つの行き先へ入る。必要なエスケープはそれぞれ異なり、一つでも
間違えれば設定キーが注入点に変わるので、エスケープは元で一度ではなく行き先ごとに行う。

`lang` は文書を記述するものであり、CLI 自身のメッセージの言語とは意図的に別の設定にしている。
文書はしばしば、別の言語を報告する端末で作業している人によって書かれるし、文書の言語が変わった
からといってビルドログの言語が変わるべきではない。

---

## 24. PDF 出力

### 24.1 基本方針

PDF は HTML から生成する。

```text
monodocs build
  ↓
single HTML
  ↓
Playwright
  ↓
PDF
```

### 24.2 コマンド例

```bash
monodocs build ./docs --format pdf -o ./dist/docs.pdf
```

HTML と PDF の両方を出力する場合：

```bash
monodocs build ./docs --format both -o ./dist/
```

### 24.3 注意点

PDF 出力では以下に注意する。

- Mermaid client mode の描画完了待ち
- 画像読み込み完了待ち
- 印刷用 CSS
- 改ページ制御
- サイドバーを含めるかどうか
- URL hash に依存しない全ページ出力

### 24.3.1 紙にはスクロールが無い（v0.8）

画面では、本文幅を超える内容もスクロールできるので読める（コードブロックと表は自前の横スクロールを
持ち、ページ自体も動かせる）。紙にはどちらも無いため、Chromium ははみ出しをそのまま切り捨て、
PDF からは内容が欠けたことすら分からない状態で消える。既定余白の A4（本文幅 680px）で実測すると、
`bash` のコマンド行は 728px、長い URL を含む段落は 862px に達し、いずれも末尾を失っていた。

そこで印刷用スタイルではスクロールではなく折り返す。`pre` は `pre-wrap` +
`overflow-wrap: anywhere`、表は `display: table` に戻す（画面側でスクロールさせるための
`display: block` は `thead` の繰り返しも無効にするため、ページをまたぐ表は見出し行を失っていた）。
セルは長語を折り返し、図は紙幅で頭打ちにする。本文の `overflow-wrap: break-word` は本文中の長い
URL に効き、画面側にも同じ効果がある。狭い画面で横スクロールが出ていた原因も、同じ分割できない
文字列だった。

この組み直しは当初 `table-layout: fixed` を使っていたが、それは修正の片割れとして誤っていた
（v0.10）。`<col>` の幅指定が無ければ、fixed は中身に関わらず幅を等分する。短い日付と 1 文ずつの
説明という 2 列の表は 50/50 に割れ、日付の列は半分空き、説明は必要より狭い列で折り返される。表の
多い書類では、これが枚数のかなりの部分を決めてしまう。`auto` は別の道で同じ保証に届く。セルには
すでに `overflow-wrap: anywhere` があり、これがどの列にも 1 文字ぶんの最小幅を与えるので、auto の
アルゴリズムは常に表を紙幅へ収められる。切り捨てはなく、しかも各列は中身なりの幅になる。

### 24.3.2 文書情報（v0.8）

配布する PDF は、何で作られたのかを自身に持つべきである。Chromium は Creator に自分の UA 文字列を
残し、しおり付与に使う pdf-lib は Producer に自身を書き込む。どちらも monodocs を示さず、タイトルも
空のままなのでビューアにはファイル名しか出ない。`setPdfMetadata` が設定のタイトルと
`monodocs v<version>` を Creator / Producer の両方へ設定する。しおり付与の後に実行し、pdf-lib の
`updateMetadata` を無効にして、保存時に再び上書きされないようにしている。あわせてビューア設定の
`DisplayDocTitle` も立てる。これが無いと、タイトルがあっても標準に従うビューアはファイル名を
表示し続ける。

### 24.3.3 フォント欠落（v0.10）

成果物は、ビルドを実行したマシンがたまたま持っているフォントで一度だけ組まれる。そしてフォントの
無い文字は豆腐（□ / ☒）になり、配った全ての複製の中で永久にそのままである。日本語には CJK
フォントが、絵文字には絵文字フォントが要るが、CI ランナーがそのどちらかを持っている前提は置けない。

HTML は通常これを免れる。読者のフォントで描かれるからである。例外は `mermaid.mode: pre-render`
（21.2）で、これは図のテキストをビルドマシンのフォントで計測・配置して SVG に焼き込む。フォントの
欠落もそこに焼き込まれ、PDF と同じく HTML でも残る。したがってこの検査は PDF 出力だけのものでは
なくビルドのものであり、設定を `pdf.fontCheck` ではなくトップレベルの `fontCheck` に置く理由も
そこにある。

ドキュメントには既に両方について書いてある。サイトの CI ガイドは GitHub Actions と GitLab CI の
手順で `fonts-noto-cjk` と `fonts-noto-color-emoji` を導入しており、設定ページは `pre-render` に
ついて同じ留保を載せている。欠けていたのはコード側の検査だった。その手順を飛ばしてもビルドは成功
を報告し、成果物は誰かが開くまでは完成品に見える。他所に書いてある黙った失敗は、やはり黙った
失敗である。

v0.10 が検査するのは環境ではなく文書である。問題になるのは文書が実際に含んでいるものだけで——
CJK フォントの無いランナーでラテン文字だけの文書を出すぶんには何の問題も無い——単位は用字系ごとの
代表文字でも、裸のコードポイントでもなく、**書記素クラスタと、それが現れる要素の計算後フォントの
組**である。ある用字系のよくある文字が解決できることは、その隣にある拡張ブロックについて何も保証
しない。そして読者が「これが化けている」と見るのはクラスタ——異体字シーケンス、結合文字の付いた
文字、絵文字 ZWJ シーケンス——なので、報告が名指しすべきものもクラスタである。まずクラスタを測り、
クラスタ自体が 1 つの notdef になっていないときにだけ、その構成コードポイントを測る。これにより、
1 つの豆腐になる場合と、複数の豆腐へばらける場合の両方が捕まる。計算後フォントと組にするのは、
本文・コードブロック・カスタムテーマが同じ family に解決するとは限らないからである。検査は
`document.fonts.ready` の後に走らせ、テーマが data URI で持つ webfont は「ある」として数える。

一方、**届かない**のは、構成コードポイントがすべて描けるうえでフォントが合成だけを行わない場合
である（絵文字 ZWJ シーケンスが 1 つではなく 3 つの絵文字として描かれる、など）。それはグリフの
欠落ではなく合成の失敗であり、notdef の送り幅との比較では原理的に見えない。正しく合成された場合と
区別するにはクラスタと構成要素の幅の合計を比べることになり、誤検出はまさにそこで生まれる。
既定を `warn` にしたのと同じ理由で、これは対象外にする。

尋ね方を 3 通り、開発イメージ（`fonts-liberation` / `fonts-noto-cjk` / `fonts-noto-color-emoji` 入りの
Chromium）で実測した。描ける文字として `A` / `日` / `✅`、描けない文字として古ペルシア文字
`U+103A0`・アドラム文字 `U+1E900`・チベット文字 `U+0F40`・イ文字 `U+A000` を使った。

このうち 2 つは機能し**ない**。

- 存在し得ない family 名に対する送り幅の比較は、描ける文字も描けない文字も全て同じ幅を返した。
  存在しない family も他と同じフォールバック連鎖に落ちるので、比較しているのはフォールバック
  同士である
- CDP の `CSS.getPlatformFontsForNode` は、描けない文字に対してもグリフ数付きでフォントを報告した。
  古ペルシア文字もアドラム文字も等しく `Liberation Sans:2` である。あれが答えるのは Chromium が
  どのフォントに手を伸ばしたかであって、そのフォントが渡せるものを持っていたかどうかではない
- `document.fonts.check()` は、存在しない family に対しても、どのフォントも収録しない文字を渡した
  スタックに対しても true を返す。報告するのは追加の読み込みが要るかどうかであって、グリフが
  見つかったかどうかではない

機能するのは、無い family ではなく**どの導入済みフォントも描かないと期待できる基準コードポイント**
と比較する方法である。私用領域の末尾 `U+10FFFD` は 32 px で 11.69 px を示し、描けない標本は全て
正確に 11.69 px、描ける標本は全て異なった（`A` 21.34、`日` 32.02、`✅` 39.94）。そのクラスタと基準
文字を canvas にラスタライズして画素を比較する方法も、同じ 2 群を分けた。したがって検査は、送り幅
の比較を安価なふるいとして使い、当たったものをラスタライズで確認する。実グリフが偶然 notdef と
同じ送り幅を持つことはあり得ても、同じビットマップにはならないからである。ビルドのために既に開いて
いるブラウザの中で走るので、起動コストは増えない。

`U+10FFFD` は私用領域であり、フォントがこれを収録すること自体は「あり得る」。基準は慣習であって
保証ではない。そこで検査は、フォントスタックごとに 2 つの対照を使って自分の基準をまず検証する。
別の面の私用領域コードポイントと、**非文字**（`U+FDD0`）である。3 つのどれかが食い違えば、
グリフを持たないはずの文字をこのマシンが描いているということで比較が成り立たないので、根拠を
持てない指摘を出す代わりに、この環境では検査を実行できないと報告する。

この検証を意味あるものにしているのは非文字のほうである。私用領域どうしが一致することが示すのは
「同じに描かれる」ことだけで、それは両方を 1 つのグリフに割り当てたフォントでも成り立つ。そのとき
基準のほうが実在のグリフになっているので、本当に欠けている文字はすべて基準と異なり、検査は何も
見えていないまま「問題なし」と報告してしまう。非文字にはグリフが割り当てられることがないため、
比較を notdef の箱そのものに固定できる。開発イメージでの実測では、`U+10FFFD` / `U+FFFFD` /
`U+FDD0` はいずれも 11.69 px で同じビットマップになり、描けない文字と一致した。

結果は、危ういクラスタと、それを収録するフォントの例を、組み込みの小さな用字系→例フォント表から
挙げる。パッケージ名は挙げない。書体を供給するものは Debian でも Windows でもその他のプラット
フォームでも異なり、間違ったものを名指しすることは何も名指ししないことより悪いからである。

トップレベルの `fontCheck: warn | error | off` は `assets.onLargeImage` が既に定着させた語彙に倣う。
**既定は `warn`** であり、そこが要点である。この検査は Chromium のフォールバック連鎖に対する
ヒューリスティックなので、既定では誤検出が本来通るはずのビルドを壊せてはならない。`error` は CI に
停止してほしい人のためにあり、それを選ぶことは誤検出でも止まることを受け入れることを意味する。
その取引は設定する人が承知の上で行うものであって、既定がその人に代わって行うものではない。

`pre-render` は完成後の HTML ではなく自身の描画コンテキストで測る。埋め込まれた SVG を測り直しても、
それを生んだフォント解決を再現できないからである。PDF のヘッダー / フッター断片は 3 つ目の
コンテキストであり、v0.10 では monodocs が内容を管理している既定の断片についてのみ検査する。

### 24.3.4 末尾の空白の紙（v0.11）

1 枚に収まる短い文書が 2 枚になり、2 枚目はページ番号だけの空白だった。改ページの計測中に、
どの枚数も文書が要求するより 1 枚多いことから見つかった。

原因は、画面を埋めるための 2 つの規則——`html, body { height: 100% }` と
`#app { min-height: 100vh }`——が、`pdf.bookmarks` が各ページ先頭に差し込む宛先アンカーと
紙の上で出会うことである。どちらか一方では足りない。実測では、そのアンカーを持つ 1 枚分の文書は
片方だけを印刷時に解除しても 2 枚のままで、両方を解除して初めて 1 枚になった。紙にビューポートは
無いので、印刷では両方とも解除する。49 枚の文書は枚数が変わらない。これが「空白の紙が 1 枚
減った」のであって「内容が 1 枚分消えた」のではないことを示している。

### 24.4 PDF 用表示モード

HTML の疑似ページ表示とは別に、PDF 用には全ページを縦に並べる print mode を用意する。

```text
interactive mode:
  hash route で 1 ページずつ表示

print mode:
  全ページを縦に展開
```

### 24.5 ページ番号（v0.10）

`page.pdf()` に渡していたのは `format` / `margin` / `printBackground` だけで、`displayHeaderFooter`
は Chromium の既定の off のままだった。つまり生成される PDF にはページ番号が全く無かった。印刷して
配ることを想定した文書にはページ番号が要る。番号が無ければどこを見ればよいか言えず、PDF が画面を
離れた後に果たす役割はほとんどそれだからである。

v0.10 は既定でフッターを出す。中央に、現在ページ数と総ページ数を置く。内容は意図的に言語に依存
しない形——数字と区切りだけ——にしている。monodocs が全ページに足すこの一つの文字列自体が翻訳を
必要としないようにするためである（23.4）。

ヘッダーとフッターは Chromium に渡す HTML 断片であって、monodocs のテンプレート言語ではない。
Chromium は自身のクラスを持つ要素に値を差し込むので、既定のフッターは文字どおり

```html
<span class="pageNumber"></span> / <span class="totalPages"></span>
```

であり、差し替えに使えるクラスは `pageNumber` / `totalPages` / `title` / `date` / `url` である。
`{{pageNumber}}` は存在しない。Chromium のクラスの上に monodocs 独自のトークンを被せると、仕様化
して保守する置換規則とエスケープ規則が増えるだけで、断片は既に HTML なのだから得るものが無い。

断片は文書のスタイルを一切継承しないので、既定は Chromium の無指定の既定に任せず自分でフォントと
サイズを指定する。`pdf.header` / `pdf.footer` は、`false` で片方を消すか、断片で差し替える。
そして**`false` はオプションを省略するのではなく、明示的に空の断片を渡す**。`displayHeaderFooter`
が on の状態で何も渡さないと、Chromium は自前の組み込みヘッダー——日付と文書タイトル——へ
フォールバックし、頼んだことと正反対の結果になるためである。

Chromium はヘッダーとフッターの帯の高さを、本文から場所を奪う形ではなく上下のマージンに合わせる。
既定の 20 mm は組み込みの一行テンプレート——紙端から 15 pt 内側に置かれた 8 pt のテキスト——を
収めるのに足りており、ページの組み直しは起きない。これはページへの追加であって、レイアウトの変更
ではない。

内容に対して帯が小さすぎる場合に何が起きるかは、誰のテンプレートかによって違う。ここも仮定せず
実測した。Chromium の組み込みテンプレートは自分を隠す。テンプレートを渡さない場合、生成された PDF
のテキスト描画オペレータは下マージン 20 mm と 10 mm では 31 個、5 mm・2 mm・0 mm では 17 個になった。
つまりヘッダーとフッターは、途中で切られるのではなく 10 mm と 5 mm の間のどこかで描かれなくなる。
渡した断片はそうならない。同じ数は 20 mm から 0 mm までどのマージンでも 6 個のままだった。

monodocs は断片を渡すので、そのフッターは常に描かれる。小さすぎるマージンが生むのは、消えた
フッターではなく紙端に貼り付いたフッターである。それでも警告する価値はある。閾値は選んだ数値では
なく、既定の断片をビルド時に描いた高さそのものにする。その断片がいずれ変わっても正しいままである
ようにするためである。差し替えた断片は警告の対象にしない。任意の HTML と CSS をマージン値だけから
判定することはできず、できるふりをすれば、誤警告を出すか、実測でしか守れない約束をすることに
なる。

しおりと文書情報の付与は完成後のバイト列に対して走る（24.3.2）ため影響を受けない。

### 24.6 版面の密度（v0.10）

既定のテーマは画面で読むために組んである。それは既定として正しく、そして「決められた枚数に
収めなければならない書類」に対しては誤っている。0.9.0 で A4 の事業書類を変換すると 9 枚になり、
同じ本文を手で 9.5pt・余白 14mm に組むと 4 枚だった。しかも設定でこの差を詰める手段が無かった。
触れるのは `pdf.margin` だけで、枚数を決めているのは余白ではない。実測では、25/30mm から 10/8mm
まで動かしても、いちばん広い設定を除いて 9 枚のままだった。決めているのは文字の大きさ・行送り・
セルの余白であり、そのどれにも手が届かなかった。

`pdf.density` がそこへ届く。プリセット名か、オブジェクトを取る。

```yaml
pdf:
  density: compact
```

```yaml
pdf:
  density:
    base: compact
    fontSize: 12px
    lineHeight: 1.5
```

同梱するプリセットは 4 つ。枚数を決める値をまとめて動かす。1 つだけ動かしても組版として整わない
ためである（行送りを据え置いたまま文字だけ小さくすると、行の中で文字が迷子になる）。

| | fontSize | lineHeight | headingSpacing | tableCellPadding |
| --- | --- | --- | --- | --- |
| `relaxed` | 16px | 1.7 | 1.8em | 0.5rem 0.8rem |
| `normal`（既定） | 16px | 1.45 | 0.9em | 0.35rem 0.6rem |
| `compact` | 14px | 1.35 | 0.8em | 0.3rem 0.5rem |
| `tight` | 12px | 1.3 | 0.6em | 0.2rem 0.35rem |

`examples/ja` のドキュメント一式で、4 つはそれぞれ 56 枚・49 枚・44 枚・40 枚になる。

**既定は紙向けに組み、梯子は両方向へ伸びる。** 最初にこれを出したときはプリセットが 3 つで、その
最上段が画面の設定そのものだった。そのため梯子は一方向にしか無く、既定は印刷されるページとして
緩すぎるままだった。枚数の買い方も間違っていた。画面の値と既定は、いまはどちらも本文 16px である。
両者の差は行送り・見出し上の空き・セル余白だけで、それだけで 56 枚が 49 枚になる。以前の `compact`
が文字を 13.5px まで落として買っていたのと同じ枚数である。文字の大きさが動き始めるのは既定より
下からで、それはこの値だけが副作用を持つからである。段の幅は `pdf.margin` が残した幅なので、文字
を小さくすることは行を長くすることでもある。A4 の既定余白で 16px なら 1 行およそ 42 字、12px では
56 字になる。行を長くせずに文字を詰めたい人は同じ変更で余白を広げればよく、それは本人が決める
ことであってプリセットが決めることではない。

**`relaxed` は画面の設定に名前を付けたもの**であり、画面で読み、たまに印刷する文書のためにある。
名前を与えたことが、既定を動かせるようにした。以前は「画面と同じ」と「既定」が同じ 1 行で、
どちらか一方だけを変えることができなかった。

**画面と異なる値だけを出力する。** その基準は既定のプリセットではなく、別に置いた定数
（`PDF_DENSITY_SCREEN`）である。したがって `relaxed` を指定しても印刷用の規則は 1 つも書かれず、
既定も文字サイズは書かない。テーマはルートに font-size を設定していないので、HTML は読者自身の
基準文字サイズのまま印刷される。オブジェクト形式の中でも同じ規則が働く。

**`pdf.scale` ではなくプリセットにした理由。** Puppeteer の `page.pdf()` は既に `scale` を取り、
既存の呼び出しに 1 フィールド通すだけで済んだ。しかし scale が縮めるのは**組み上がったページ**で
ある。行分割も列幅も罫線の太さも元の大きさで決まっていて、それを小さく写し取るだけになる。密度は
組む大きさそのものを変えるので、本文は組み直され、表の列は読まれる大きさで測り直される。今回の
発端がそうであるように、表の多い書類では、これは「小さく設計されたページ」と「縮小されたページ」
の違いになる。

**オブジェクト形式に `base` を持たせた理由。** 「compact のまま 12px にしたい」人に、残る 3 つを
書き写させるべきではない。写しは、後でプリセット側を調整したときに取り残されるものだからである。
`base` が土台の表を指し、オブジェクトは名指しした値だけを差し替える。`lang` が選んだ表に
`html.labels` が重なるのと同じ解決順である（23.4）。

**意図して入れなかったもの。** measure（本文段の最大幅）は無い。段の幅を決めるのは `pdf.margin`
であり、もう 1 つ上限を置けば両者が争う。余白を詰めて多く載せようとした人が、自分で決めた余白の
手前で本文が止まるのを見ることになる。適正値がラテン文字と CJK で違うことも、プリセットに凍結
するには向かない理由である。任意 CSS を差す口も無い。それはこの件も含めてあらゆる件に効く代わり、
形の無い公開面を 1 つ抱えることになる。密度はキー集合が閉じており、1.0 で凍結できる。

値は生成される CSS に届くので、「数値と単位」であることを検証する。`calc(...)` や `;` を含む値は
拒否する。設定の境界と、それ自体が公開の入口である `renderSingleHtml` の両方で検証する。

規則は `@media print` に置く。これが 1 つの成果物で 2 通りの読まれ方に応える鍵になる。同じ HTML が
画面ではこれまでどおりで、紙の上ではより詰まって組まれる。`--format pdf` は印刷用スタイルシートを
通るので同じ扱いになり、ブラウザから HTML を印刷した場合も同じである。

**公式サイトは 4 つを説明せずに見せる。** 主張しているのは枚数であり、数値の表はそれを示す手段と
して弱い。`site/samples/density/` に言語ごとの短い原稿を 1 本ずつ置き、`site-build.sh` が密度だけを
変えて 4 回組み、`site/public/density/` へ出す。各 PDF の 1 ページ目は `pdftoppm` でそのまま
サムネイルにするので、サイトが見せるのは成果物そのものであって、印刷プレビューを撮った画像では
ない。設定リファレンスがその 4 枚を並べてリンクする。どこを見ればよいかは原稿自身が書いており、
それがこの見せ方を正直に保つ。原稿は、自分が説明している密度で組まれているからである。

### 24.7 改ページ（v0.11）

ソースファイルの単位ではすでに紙が改まる。印刷用スタイルシートが最初以外のすべての `.page` の前で
改ページするからである。ファイルの内側には何も無く、「ここで改ページする」と書く手段も無い。入力の
分け方で代用することはできない。分け方はサイドバーと route も決めてしまい、それは書き手の改ページの
判断ではないからである。

追加するものは 2 つある。書き手が任意の位置に置くマーカーと、指定したレベルまでの見出しの前で
改ページする設定である。

**マーカーの綴りは世の中の綴りに合わせる。** AsciiDoc にはすでにある。`<<<` は Asciidoctor の
改ページで、単一 HTML には `<div class="page-break"></div>` として届いている。ただしそのクラスに
一致する規則がこれまで存在しなかったので、何も起きていない。効かせるには規則 1 本で足りる。

Markdown の改ページは CommonMark に無く、他のツールが落ち着いた綴りは 3 系統に分かれる。空の
`<div>`——`<div style="page-break-after: always"></div>`、スタイルシートを伴う場合は
`<div class="page-break"></div>`——は、Typora、各種 Markdown→PDF 変換器、MkDocs の PDF プラグイン、
そしてブラウザの印刷が理解する。LaTeX のコマンド、raw TeX ブロック内の `\newpage` / `\pagebreak` は
Pandoc のもので、R Markdown もそれを通して使う。ショートコードやディレクティブは Quarto の
`{{< pagebreak >}}`、iA Writer の `+++`、generic directives 提案の `::pagebreak` である。

monodocs は 1 つ目を採り、`<div class="page-break"></div>` と書く。
`<div style="page-break-after: always"></div>` も同じものとして受け、class 形へ正規化する。3 系統の
うち、特定のツールの構文でないのはこれだけである。同じファイルが他の変換器でもブラウザの印刷でも
改ページする。リポジトリの Markdown プレビューでも不可視であり、`\newpage` や `{{< pagebreak >}}` は
そこで文字として見えてしまう。そしてクラス名は monodocs が決めたものではない。Asciidoctor がすでに
出力しているので、規則 1 本で両形式に効く。

**Markdown が raw HTML を得るわけではない。** Markdown の raw HTML は破棄する（16.1）。その境界は
動かさない。認識するのは、たまたま HTML と同じ綴りを持つマーカーである。mdast の `html` ノードを
`remark-rehype` に渡す前に 2 つの綴りと突き合わせ、一致したものを monodocs が組み立てた要素
——`div` ひとつ、クラスひとつ、子は無し——に置き換える。書き手が書いた文字列を出力し直すのではない。
入力から出力へ届くものが何も無いので、属性やスクリプトの入口にはならない。受理する字句は目で監査
できる大きさに保つ。

- 小文字の `div`。開始タグと終了タグが 1 つのノード内に収まっていること
- 属性はちょうど 1 つ。`class="page-break"` または `style="page-break-after: always"`。引用符は
  どちらでもよい
- `style` 綴りでは、コロンの後は空白かタブ、あるいは何も無し。末尾の `;` は任意。宣言は 1 つだけ
- ASCII 空白類は `=` の前後・`>` の前・マーカーの前後で許し、`<div` の直後には 1 つ以上必要
- タグの間は空白を含めて完全に空であること
- 文書の root 直下のブロックノードであること。引用・リスト項目・表のセル・見出しの中にあるものは
  マーカーではない

`<DIV>`、`class="page-break foo"`、2 つ目の属性、`<div class="page-break"/>`、コロンと `always` の
間の改行、2 つ目の宣言を含む `style` は、修復せずに拒否する。それらは Markdown の raw HTML が
これまでそうだったもの——破棄——のままである。上の一覧は、1.0 が凍結するものとして設定リファレンス
が読み手に列挙しているものと同じである。

**`pdf.pageBreakLevel` は見出しの前で改ページする。**

```yaml
pdf:
  pageBreakLevel: 2
```

既定の `false` はどの見出しの前でも改ページせず、既存の文書を 1 枚も変えない。数値は新しい紙を
始める最も深い見出しレベルである。`2` は h2 だけ、`3` は h2 と h3、`6` は h2 から h6 まで。ここで
h1 はレベルではない。h1 はページタイトルであり、それが属するファイルはすでに改ページ済みだからで
ある。

**どの見出しを除外するかは、一言ではなく定義が要る。** 前にページタイトルしか無い見出しで改ページ
すると、どのページも 1 行だけの紙で始まってしまう。しかし「そのページで最初の見出し」は誤った規則
である。タイトル、導入文、そして最初の `## セクション` と続くページでは、そのセクションの前で紙を
改めるべきである。導入文はタイトルの紙に載るものだからである。したがって規則は「どの見出しか」では
なく「その前に何があるか」で決める。**その見出しより前に描画されるものが何も無いか、あるのが
ページの h1 だけであるときに限り除外する。**

**分割してはならないブロックの中の見出しは対象にしない。** 表・図・コードブロック・admonition・引用
には `break-inside: avoid` を指定している（24.3.1）。その中の見出しの前で強制的に改ページすることは、
Chromium に「まとめて置け」と「必ず割れ」を同時に求めることになる。対象はページ自身の階層にある
見出しだけとする。AsciiDoc では `.sect1`〜`.sect5` のラッパーを辿ることを意味する。これらは内容では
なく構造だからである。

**判定はセレクタではなくパイプラインで行う。** Markdown は平坦な本文を、Asciidoctor は入れ子の本文を
出す。「前にあるのがページタイトルだけの場合を除く」を CSS で書こうとすると両方の形を列挙すること
になり、それでも h1 が無いページや最初の見出しが h3 のページは見えない。post-process で、実際に
改ページする見出しに `data-monodocs-pdf-break-before` を付け、規則はその属性 1 つに一致させる。名前
空間を付けるのは、カスタムテーマも AsciiDoc の passthrough も見出しに属性を付けられるからである。

**紙の先頭に来た見出しの上の空きは捨てる。** 実測: `pdf.density` が置く余白は強制改ページを越えて
残る（同じ文書で `relaxed` は `normal` より見出しが 15.8pt 下がる）。しかし紙の先頭では、その空きは
見出しを何からも隔てていない。規則は `margin-top: 0` を書く。密度の規則が書くのと同じプロパティな
ので、論理プロパティと物理プロパティのカスケードを考える必要が無い。

**規則は両方とも core が出す。** default テーマに足すのではなく、密度の規則と同じ場所で印刷用
スタイルシートに書き出す。テーマは `style.css` をまるごと差し替えられるが、テーマが構文機能を消せて
よいはずがない。24.6 と同じ理由で `#content` と `.page` の両方を名指す。

ファイル境界が使う `break-before` ではなく `break-after: page` を使う。実測による。マーカーは空の
ボックスなので、その手前で改ページするとボックス自身が新しい紙へ移る。1 ページ目の末尾にマーカーが
ある 2 ページの文書は、`break-before` では 3 枚、`break-after` では 2 枚になる。それ以外の場合は
どちらでも同じ枚数だった。後ろに何も無いマーカーはどちらでも空白の紙を 1 枚残すが、それは「後ろに
何も無いまま改ページを求める」ことの意味そのものである。連続する 2 つのマーカーも同様で、それが
空白の紙 1 枚の求め方である。

**ここに意図的に無いもの。** 「分割させない」マーカーは持たない。印刷用スタイルシートは重要な
ブロックについてはすでに分割を避けており、汎用のものは第 2 のレイアウト言語になる。`pageBreakLevel`
のファイル単位の上書きも持たない。紙の組み方を変える frontmatter は、文書の枚数を「どのファイルを
含めたか」に依存させてしまう。任意 CSS の口も持たない。理由は 24.6 と同じで、1.0 が凍結できるのは
閉じたキー集合だからである。

### 24.8 表紙（v0.14）

誰かに手渡す PDF は表紙から始まる。題名、何の版か、いつ時点で正しいか、誰が責任を持つか。
monodocs は本文の 1 ページ目から始まる。書き手が表紙のように見えるページを書くことはできるが、
それはページである——HTML のサイドバーに現れ、検索に掛かり、番号を振られ、他と同じように次の
本文が続く。

```yaml
pdf:
  cover:
    enabled: false # true で document（13.5）から表紙を生成する
```

表紙は**`document` から生成する**。書かせない。載るもの——題名・版・日付・作成者——はすべて別の
理由で既に設定されており（13.5）、生成にすれば PDF が PDF 自身の文書情報と食い違うことがなくなる。
レイアウトは固定で、選択肢は無い。ロゴと顧客のハウススタイルが要る文書に必要なのはデザイナーで
あって設定キー 11 個ではない。閉じたキー集合こそ 1.0 が凍結できるものだ、とは 24.6 が既に記録して
いる。

`pdf.cover: true | "./cover.md"` ではなく `pdf.cover.enabled` というオブジェクトにするのは、
書き手が用意する表紙が明らかに次に来る要望であり、多相なキーは 2 つ目のフィールドを生やせない
からである。オブジェクトなら生やせる。`cover.md` を足す理由ができたときには `source` がその場所に
なる。

**番号は表紙の後から始まる。難しいのはこちらの半分である。** Chromium のフッタは自分が描かれて
いる物理ページを知っているだけで、オフセットを持たない。したがって表紙があるとすべての番号が 1 つ
大きく、総数も 1 つ多い。解決する場所は、完成したバイト列に対する処理である。表紙は monodocs 自身
が作った 1 枚なので、その 1 枚でフッタを抑制すれば、残りの枚数に載る番号は文書が示すべき番号に
なる。PDF のページラベル（ビューアのページ番号欄に出る番号）も同じところで設定し、ビューアと紙を
一致させる。

1 回の描画で 1 枚だけフッタを抑制できるかどうかは v0.14 が実測する。できなければ、表紙をヘッダも
フッタも無い単独 1 ページの PDF として描画し、連結する。しおりと文書情報の処理は既に完成した
バイト列に対して走っている（24.3.2）ので、そのための機構は既にある機構である。

HTML に表紙は付けない。表紙は紙の 1 枚である。画面では同じ情報は、読者がスクロールして通り過ぎず
に見える場所——13.5 が既に埋める branding フッタ——に属する。

### 24.9 紙の上の目次（v0.14）

`pdf.bookmarks` はビューアが横の枠に出すアウトラインを作る。紙に横の枠は無い。印刷された仕様書は、
各節とそれが始まるページ番号を並べた目次から始まる。monodocs はそれを作れない。Chromium が PDF を
作り終えるまで、パイプラインの誰も、何が何ページ目にあるかを知らないからである。

```yaml
pdf:
  toc:
    enabled: false
    depth: 2 # 目次に載せる最深の見出しレベル（2〜6）
```

**この文書で最も高価な機能であり、壊れ方まで含めて規定する。** 形は 2 回の描画である。

1. 目次に載り得るすべての見出しに名前付き destination を付ける。ページには既に付いている
   （24.3.2 が `page-{id}` を注入している）ので、これは `h-{id}` を足す
2. 目次を文書に描き込む。ページ番号の欄は固定幅のプレースホルダにしたまま、Chromium が 1 回目の
   PDF を作る
3. 各 destination の `pageRef` を、文書のページツリーと突き合わせてページ番号に解決する。
   `pdf-lib` はしおりのために既に `/Dests` を読んでいる（24.3.2）
4. 目次に実際の番号を入れ、Chromium が 2 回目の PDF を作る
5. destination を**もう一度**、2 回目の PDF から読み、印字した番号と突き合わせる。食い違いは、
   差し替えが何かをページ境界の向こうへ動かしたということである

5 がこの機能の本体である。これが無ければ「だいたい合っている目次」であり、だいたい合っている
ページ番号は、無いより悪い。1 つ違っているのを見つけた読者は残りを信用できず、どれを確かめれば
よいかも分からない。だから番号は、実際に渡される文書に対して検証する。落ち着かない文書のために
追加の描画を有限回だけ許し、**収束しなければビルドを失敗させる**。もっともらしい一覧を出荷しない。

収束は祈るのではなく助ける。プレースホルダはその文書が取り得る最大のページ番号の幅を予約し、欄は
等幅数字で組んで 9 と 10 が同じ幅を占めるようにし、目次自身の長さが変わるのは行が折り返したときだけ
になるように組む。`depth` があるのと、その既定が 2 である理由がこれである。

コストは Chromium の描画 2 回分である。PDF 段階がおよそ倍になり、client モードの Mermaid も 2 回
走り、メモリも増え、中間 PDF が要る。既定で off なのはそのためであり、密度の作業が定めた基準——
100 枚規模の実文書で、対応する両プラットフォームで測ってから「できた」と言う——がここにも掛かる。

**走りヘッダはこれに含まれない。**「各紙の上端に現在の章名」は次に必ず要望されるものだが、同じ機構
ではない。目次は本文に番号を書き込むものであり、2 回目の描画がそれを行える。走りヘッダは物理ページ
ごとに違う文字列を余白に描くものである。CSS にはまさにこのための `string-set` と `string()` があり、
Chromium はそれを実装していない。Chromium 自身のヘッダテンプレートが差し込むのは固定のクラスだけ
である（24.5）。残る手は文書を章の単位で描いて連結することだが、それはコストの違う別の機能であり、
予定には入れない。

### 24.10 透かし（v0.13）

下書きである文書、あるいは建物の外へ出してはいけない文書は、そのことを全ページに書く。今それを
必要とする書き手はテーマを編集することになり、それはスタイルシートの差し替え（23.3）であって、
以後は他のすべての印刷規則も自分で抱えることになる。

```yaml
pdf:
  watermark: false # false（既定）、または印字する文字列
```

文字列 1 行、斜め、本文の背後、表紙を含む全ページ、コピーしても消えず、覆ったものを隠さない濃さで。
画像は無し、ページごとの制御も無し、フォントも角度も不透明度も無し。それらは 1 つの機能をレイアウト
言語に変えるキーであり、文字列こそがこの機能の目的である。

規則は core が印刷用スタイルシートへ書き出す。密度と改ページの規則の隣であり、理由は 24.7 と同じ
——`style.css` を差し替えたテーマが、文書が要求した「社外秘」を消せてはならない。文字列は挿入では
なくエスケープする。設定値がマークアップとして出力へ届く経路は、マークアップの侵入口だからである。
PDF 出力と、ブラウザから HTML を印刷したときに現れる。画面には出さない。透かしの目的は、印刷されて
手渡された後も残ることだからである。
---

## 25. CLI 仕様

### 25.1 init

```bash
monodocs init
```

生成物：

```text
monodocs.config.yml
docs/
  index.md
```

当初からここに仕様として書かれていて、実装は v0.10 で行った。それまで CLI が持っていたのは
`build` / `watch` / `serve` / `validate` の 4 つだけで、この章は存在しないコマンドを説明していた。

書き出すのは上の 2 ファイルだけで、既にあるものは**上書きしない**。見つけたものを名指しし、何も
書かずに終える。既にファイルの入っているディレクトリで実行しても作業を壊せないようにするため
である。判定は書き始める前に両方について行う。途中で止まると、どちらが自分の書いたものかを
後から解きほぐす羽目になるからである。見つかったものは最初の 1 つではなく全部を挙げるので、
2 回目の実行が 2 つ目のファイルを報告することはない。既にある `docs/` ディレクトリは上書きの
対象ではなく、ページはそこにあるものの隣に置く。

生成する設定は全キーのダンプではなく、コメント付きの短い出発点にする。ダンプはオプションが
増えるたびに生成し直す必要があり、しかも理解していないキーを抱え込むことを読者に教えてしまう。
残りはドキュメントサイトの設定ページを指す。

**雛形は、書き出す `lang` の値も含めて、メッセージ言語（25.6）に従う。** コメントが従うのは
当然として、理由は最初のページのほうにある。あれは文章であり、文章には言語がある。`--lang ja`
なら日本語のページを書き出すことになるが、それが既定の `lang: "en"` の下に置かれれば、宣言した
言語と表示する言語が食い違った文書になる。23.4 が終わらせるために存在する状態そのものである。
2 つの設定が独立であることは他のどこでも変わらず、書き出す設定ファイルもコメントでそう述べる。
ここで結びつくのは、init が設定するだけでなく文書そのものを書くからであり、書ける言語は 1 つ
だからである。第 3 の言語で書く人は 1 行を書き換えればよく、その 1 行の上には説明のコメントが
ある。

### 25.2 build

```bash
monodocs build
```

入力・出力指定：

```bash
monodocs build ./docs -o ./dist/docs.html
```

形式指定：

```bash
monodocs build ./docs --format html -o ./dist/docs.html
monodocs build ./docs --format pdf -o ./dist/docs.pdf
monodocs build ./docs --format both -o ./dist/
```

入力にはディレクトリだけでなく単一ファイルも渡せる（v0.10）：

```bash
monodocs build ./docs/plan.md --format pdf -o ./dist/plan.pdf
```

v0.10 までは入力の検査が `existsSync` だけだったため、ファイルはこの関門を通過し、もっと奥の
`readdir` で Node 自身の `ENOTDIR: not a directory, scandir` として失敗していた。この文言は制約も
対処も言っておらず、しかも「単一ファイルを作る道具に単一ファイルを渡す」のは新しい利用者が最初に
試すことである。そもそもこれは誤りではなく妥当な依頼でもある（monodocs はページの集合を 1 つの
成果物に束ねる道具であり、要素が 1 つの集合も集合である）。そこで診断ではなく受理する。リンク・
画像・`monodocs.config.yml` の基準はそのファイルを含むディレクトリになる。入力ディレクトリが
その中身に対して持つ関係と同じである。除外パターン（12.3）は適用しない。名指しは明示的な選択で
あり、名前で呼ばれた `_draft.md` はページだからである。どのレンダラも扱えない拡張子のファイルは、
扱える拡張子を挙げて拒否する。


**ディレクトリが複数あるとき（v0.12）。** 入力引数が指すのは今後もパス 1 つで、複数にまたがる
文書は設定側で `root` と `sources.include` を書く（12.5）。CLI に可変長の入力リストは持たせない。
コマンドラインに 2 つのパスを並べれば、設定ファイルをどこから探すのか、route が何からの相対か、
画像をどのディレクトリから読んでよいのかに答えなければならず、設定ファイルが既に答えている問いを
片付ける場所としてコマンドラインは適さない。
### 25.3 watch

```bash
monodocs watch
```

Markdown / AsciiDoc / 設定ファイルの変更を監視して再ビルドする。

### 25.4 serve

```bash
monodocs serve
```

ローカルサーバーを起動してプレビューする。

### 25.5 validate

```bash
monodocs validate
```

検証対象：

- Markdown リンク切れ
- AsciiDoc xref 切れ
- 画像ファイル存在
- H1 / document title 不足
- route 重複
- 設定ファイル不正
- Mermaid ブロックの基本検証


**`validate` とは何か（v0.11）。** 何も書き出さないビルドである。`build` と同じ `preparePages` を
走らせるので、報告するものはビルドが報告するものであり、同じ検査を 2 か所に持たない
（architecture.md）。Mermaid の `pre-render` は `client` に強制してブラウザを起動しない。つまり
図の構文エラーは対象外であり、走らせていない検査をほのめかす代わりに、そう明言する。

何か見つかれば警告だけでも非ゼロで終了するので、足すべき `--strict` は無い。足りなかったのは機械が
読める形である。プルリクエストに注釈を付けたい CI は、翻訳された散文を解析するしかなく、それは
言語によって変わり、文言を直せば変わった（12.4）。

```bash
monodocs validate --format json
```

JSON は診断モデル（27.3）を直列化したもので、自身のスキーマバージョンを持ち、標準出力にはそれ
だけが出る。サマリの 1 行すら添えない。ときどき JSON で、ときどき JSON のあとに文が付く出力は
形式ではないからである。利用側が固定するのは `schemaVersion` であり、これは形が変わったときに
動く。検査やコードが増えても形は変わらない。同時に検査を 3 つ足した。いずれもパイプラインが既に
持っている情報から判定できるものを選んだ。

- **見出しレベルの飛び**——`h2` の次が `h4`。ページ内目次（22）を壊し、見出しレベルで移動する
  支援技術のすべてを壊す
- **`alt` 属性が無い画像**。明示的な空の `alt=""` は指摘しない。書き手が装飾画像だと示す書き方で
  あり、ライトボックスも既にその区別を尊重している（23.2）
- **別ファイルへのリンクのアンカーが存在しない**——以前からビルド時に警告しており、つまり既に
  分かっていた。散文の 1 行ではなく、コード付きの診断として報告に載る

前の 2 つは、ほかのすべての所見と同じ post-process で走る。したがってビルドも報告する。`validate`
が報告するものはビルドが報告するものであり、`validate` にしか無い検査はその関係を壊す。どちらも
行は持たない。歩くのはレンダリング後の HTML であり、そこでの位置は書き手が編集するファイルでは
なく生成された文書を指すからである。どちらもページの最初の見出しは、そのレベルが何であっても
指摘しない。タイトルを frontmatter に書いたページが `h2` から始まるのは正しいからである。

**外部リンクは検査しない。** ネットワークへ出る検査は、結果がいつ走らせたかと、実行環境とサイトの
間のネットワークが何をしていたかに依存する。レート制限、`HEAD` を受け付けないサイト、ログイン
必須のページ、リダイレクトの連鎖——どれもリンク切れに見え、その理由で落ちる CI は、全員がその CI を
無視することを教える。加えて、文書を書いた人が書いた URL を CI ランナーの中から取りに行く処理に
ビルドを変えることでもある。このツールが獲得してよい能力ではない。リンク検査を専門とする道具は
存在し、同じワークフローの中で monodocs の隣に置ける。そして、その問題の壊れ方はその道具が引き受ける。

**「孤立ページ」も検査しない。** すべてのページはサイドバーから到達できる——それは出力の不変条件で
あって（architecture.md）テストする性質ではない——ので、この検査が意味を持ち得るのは「他のどの
ページからもリンクされていない」だけになる。それはたいていの文書のたいていのページについて真で
あり、そのすべてを指摘することになる。
### 25.6 メッセージの言語（v0.10）

CLI が出力する文字列——`--help`・各エラー・各警告——は全て日本語のみだった。一方で README・
ドキュメントサイト・`CONTRIBUTING.md`・`SECURITY.md` は英語が正で日本語がミラーである。英語の
README を見て `npm install -g monodocs` した人は日本語の `--help` に出会い、最も理解される必要の
ある失敗——PDF 出力がブラウザを見つけられない理由を説明するもの——が、npm の届く相手の大半に
とって読めなかった。

v0.10 は英語を既定にし、日本語を明示的な選択にする。どのコマンドにも付けられる `--lang ja` か、
フラグを繰り返したくないシェルや CI ジョブのための `MONODOCS_LANG=ja` である。フラグが環境変数に
優先し、環境変数が既定に優先する。既存の日本語利用者は、どちらかを設定しない限りメッセージの言語
が変わる。破壊的変更であり、1.0 より前に行う。

`LANG` / `LC_ALL` は意図的に**見ない**。自動判定は便利であると同時に、ビルドログをどのマシンが
出力したかに依存させてしまい、issue に貼られたログをコマンドだけからは再現できなくする。明示的な
設定は、一度設定する手間に見合う。

`--help` とは、その全体を指す。`Usage:` / `Options:` / `Commands:` の見出しと `--help` 自身の説明を
生成しているのは Commander であり、その周りの説明文だけを訳して見出しを英語のまま残せば、
どちらの言語でもないヘルプ画面ができあがる。Commander はこれらを `configureHelp` と `addHelpText`
で公開しているので、他と同じカタログを通す。対象外にするのは、monodocs が印字前に一度も見ない
メッセージ——包まれないまま利用者に届く Zod のパースエラーや Puppeteer のスタック——である。
monodocs が既に包んでいるものについては、その包み側を訳す。

これは文書の `lang`（23.4）とは別である。あちらはビルドされるページを記述するものであって、
ビルドしている端末を記述するものではない。

---

## 26. VS Code 拡張

> この章は凍結中のマイルストーンを記述している。着手しない理由はロードマップ節の v0.7 を参照。

VS Code 拡張は core / CLI が安定した後に実装する。

### 26.1 コマンド

```text
Monodocs: Init
Monodocs: Build HTML
Monodocs: Build PDF
Monodocs: Preview
Monodocs: Watch Preview
Monodocs: Validate Links
```

### 26.2 設定

```json
{
  "monodocs.configFile": "monodocs.config.yml",
  "monodocs.outputFile": "dist/docs.html",
  "monodocs.preview.autoRefresh": true
}
```

### 26.3 実装方針

VS Code 拡張内に変換ロジックを書かない。

```text
vscode-extension
  ↓
monodocs-core
  ↓
buildSite()
```

---

## 27. エラー・警告

### 27.1 エラー

以下はエラーにする。

- input ディレクトリが存在しない
- Markdown / AsciiDoc ファイルが 1 つもない
- output の親ディレクトリに書き込めない
- 設定ファイルが不正
- custom sidebar で指定されたファイルが存在しない
- route が重複して解決できない

### 27.2 警告

以下は警告にする。

- タイトルが存在しない
- Markdown H1 が複数ある
- AsciiDoc document title が存在しない
- 画像サイズが maxInlineSize を超えている
- リンクが解決できない
- xref が解決できない
- Mermaid ブロックの変換に失敗した
- include 用と思われるファイルがページ化対象になっている

### 27.3 診断（v0.11）

エラーと警告は文字列だった。`validateSite` は `errors: string[]` と `warnings: string[]` を返し、
CLI は接頭辞を付けて出していた。モデルはそれだけだった。唯一の利用者が端末を読む人間だったから、
それで足りていた。

機械可読な報告（25.5）はその上には作れない。翻訳された文を直列化すれば、言語が変わればフィールド
の中身が変わり、文言を直すたびに変わる形式になる。CI が固定する対象について 12.4 が約束したのは
その逆である。文言が担っているものを、まず別のものに担わせる。

```ts
type Diagnostic = {
  code: string; // 安定した識別子。例: "link/unresolved"
  severity: "error" | "warning";
  path?: string; // 入力ルートからの相対パス
  line?: number;
  column?: number;
  message: string; // 人間のための、翻訳された文
};
```

約束するのは `code` であり、`message` は親切である。コードは検査を足すときに足し、以後は改名
しない。したがって `image/large` を無視しているジョブは、まさにそれを無視し続ける。翻訳された文を
報告に残すのは、報告を人も読むからである。コードを引かせる報告は、置き換える前の文字列より悪い。

パイプラインは口に出しているより多くを知っていた。いくつかの警告では `formatSourceRef` がファイルと
位置を散文に組み立てており、つまり位置は存在していて、出口で潰されていた。今は 1 度取ってから両方に
使う。解決できないリンクは、文の中だけでなく数値としても行を報告する。

**エラーもコードを持つ。** monodocs が投げるものはすべてコードを持つ `MonodocsError` である。
ビルドを止めたエラーも、識別子の無い文ではなく所見として報告される（`BrowserSetupError` と
`FontCheckError` は、自分のコードを固定したその派生である）。同じ境界へ届く他所からのエラーは
`internal/unexpected` として報告する。コードで絞る利用者が、コードが無いという理由で所見を
取りこぼせてはならない。`validateSite` は診断と、そこから分けた 2 つの severity を返すので、
どちらの半分を読む呼び出し側も情報を失わない。

**メッセージカタログと診断コードは別物である。** 25.6 はすべての文字列を翻訳可能にした。ここで
足すのはその隣に立つ second identity である——メッセージキーは文言を選び、診断コードは所見を識別
する。2 つのメッセージが 1 つのコードを共有してよい（同じ所見を 2 つの文脈向けに言い換えたもの）し、
コードを持たないメッセージがあってよい。出力されるもののすべてが診断ではない。
---

## 28. テスト方針

### 28.1 単体テスト

対象：

- config 読み込み
- format 判定
- Markdown title 抽出
- AsciiDoc title 抽出
- route 生成
- sidebar 生成
- link 変換
- xref 変換
- image embed
- heading ID 生成

### 28.2 fixture テスト

例：

```text
tests/fixtures/
  markdown-basic/
  asciidoc-basic/
  mixed-basic/
  images/
  mermaid/
  links/
```

各 fixture について CLI を実行し、出力 HTML を検証する。

### 28.3 E2E テスト

```bash
monodocs build tests/fixtures/mixed-basic/docs -o tmp/docs.html
```

確認項目：

- HTML ファイルが生成される
- Markdown ページが含まれる
- AsciiDoc ページが含まれる
- サイドバーが生成される
- 画像が data URI 化される
- Mermaid が表示可能な構造に変換される
- 内部リンクが hash route に変換される

### 28.4 PDF テスト

PDF 出力対応後に追加する。

確認項目：

- PDF が生成される
- ページ数が 0 でない
- Mermaid が描画されている
- 画像が欠落していない
- 印刷用 CSS が適用されている

---

## 29. ロードマップ

## v0.1: Markdown 単一 HTML MVP

目的：

Markdown ファイル群から単一 HTML を生成できる最小構成を作る。

実装範囲：

- monorepo 初期化
- core パッケージ作成
- cli パッケージ作成
- 設定ファイル読み込み
- input ディレクトリ走査
- Markdown ファイル収集
- Markdown title 抽出
- GFM 対応
- Page モデル作成
- フォルダ構造サイドバー生成
- Markdown -> HTML 変換
- 単一 HTML 出力
- hash route による疑似ページ切り替え
- 現在ページのサイドバーハイライト

完了条件：

- `monodocs build ./docs -o ./dist/docs.html` が動作する
- 複数 Markdown ファイルが 1 つの HTML に含まれる
- サイドバーからページ切り替えできる
- H1 がタイトルとして使われる

---

## v0.2: AsciiDoc 基本対応・混在対応

目的：

Markdown / AsciiDoc の混在ドキュメントを単一 HTML に出力できるようにする。

実装範囲：

- Source Renderer Architecture 導入
- format 判定
- AsciiDoc renderer 追加
- `.adoc` / `.asciidoc` / `.asc` 読み込み
- Asciidoctor.js による HTML 変換
- AsciiDoc document title 抽出
- AsciiDoc attributes からメタデータ抽出
- Markdown / AsciiDoc 混在サイドバー生成
- AsciiDoc include 用ファイル除外
- mixed fixture 追加

完了条件：

- `.md` と `.adoc` が混在していてもビルドできる
- AsciiDoc の `= Title` がページタイトルになる
- Markdown / AsciiDoc が同じサイドバーに表示される
- include 用ファイルをページ化対象から除外できる

---

## v0.3: 実用機能

目的：

実際の技術文書・社内文書で使える水準にする。

実装範囲：

- Markdown frontmatter 対応
- AsciiDoc `:sd-*:` attributes 対応
- order / hidden / description 対応
- Markdown リンク変換
- AsciiDoc xref 変換
- 画像埋め込み
- Markdown 画像対応
- AsciiDoc image macro 対応
- コードハイライト
- Mermaid client mode 対応
- AsciiDoc `[source,mermaid]` 対応
- validate コマンド

完了条件：

- Markdown / AsciiDoc 間のリンクを hash route に変換できる
- 画像を data URI として HTML に埋め込める
- Markdown / AsciiDoc の Mermaid を表示できる
- frontmatter / `:sd-*:` によりサイドバー表示を制御できる
- validate でリンク切れを検出できる

---

## v0.4: HTML ドキュメントサイト機能強化

目的：

単一 HTML でありながら、ドキュメントサイトとして使いやすくする。

実装範囲：

- 検索機能
- ページ内目次
- 前後ページナビゲーション
- サイドバー折りたたみ
- ダークモード
- テーマ分離
- print mode
- 印刷用 CSS
- watch コマンド
- serve コマンド

完了条件：

- HTML 内検索ができる
- ページ内目次が表示される
- ローカルプレビューできる
- 変更監視して再ビルドできる
- 印刷時に全ページを縦に展開できる

---

## v0.5: PDF 出力

対応済み。

目的：

単一 HTML を元に PDF を出力できるようにする。

実装：Puppeteer（`puppeteer-core` + システム Chromium。Mermaid pre-render と起動処理を
`pipeline/browser.ts` に共通化）で単一 HTML を開き、テーマの `@media print`（全ページ縦展開）を
使って `page.pdf()` で PDF 化する（`pipeline/renderPdf.ts`）。`--format both` は `-o` をディレクトリ
扱いし `docs.html` / `docs.pdf` を出力する。client mode の Mermaid は全ページ展開後に描画完了を
待つ。当初案の Playwright ではなく、既存の puppeteer-core 基盤を再利用する方針に変更。

実装範囲：

- Puppeteer 導入（既存の Mermaid pre-render 基盤を共通化して再利用）
- `--format pdf` 対応
- `--format both` 対応（`-o` はディレクトリ）
- PDF 用 print mode（テーマの `@media print` を利用）
- Mermaid 描画完了待ち（client mode。全ページ展開後に `data-processed` を待つ）
- しおり（アウトライン）を HTML サイドバーと同じ フォルダ→ページ 構造で付与（`pdf-lib`。
  Chromium の内部リンク由来 `/Dests` を参照して `/Outlines` を構築。既定 on）
- PDF 設定対応

  - pageSize
  - margin
  - printBackground
  - bookmarks（しおり）

完了条件：

- `monodocs build ./docs --format pdf -o ./dist/docs.pdf` が動作する
- Markdown / AsciiDoc 混在文書を PDF 化できる
- Mermaid と画像が PDF に含まれる
- A4 PDF として出力できる

制限：ヘッドレス Chromium が必要なため、バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では
利用不可（`puppeteer-core` を `external` 化。パッケージインストール版が必要）。`serve` はプレビュー
用途のため、設定が pdf/both でも HTML を配信する（PDF を毎回生成しない）。

---

## v0.6: 配布・CI 対応

目的：

チームや CI で利用しやすくする。

実装範囲：

- npm パッケージ公開準備
- そのまま使える GitHub Actions / GitLab CI ワークフローの文書化
- README 整備
- examples 整備
- バージョニング方針決定

完了条件：

- npm からインストールできる
- GitHub Actions で HTML / PDF を生成できる
- サンプルプロジェクトを見て導入できる

利用者向け Docker イメージは提供しない。開発・テスト環境で使用する既存の専用 Docker イメージは
引き続き維持する。

専用の再利用可能な GitHub Action（`monodocs-action`）は公開しない。monodocs は普通の npm CLI であり、
ワークフローに必要なのは `actions/setup-node` と `npx monodocs` だけなので、独立した Action を作ると
リリースとサポートの対象が増えるだけになる。GitHub Actions と GitLab CI のワークフローは、公式サイトの
CI ページに掲載する。定型処理を実際に減らせると分かった時点で再検討する。

---

## v0.7: VS Code 拡張（凍結）

**このマイルストーンは凍結しており、着手予定はない。** 再開したときに以下の計画をそのまま読めるよう、
バージョン番号は確保したままにする。次に着手するマイルストーンは v0.8 とする。

凍結の理由は 3 つある。

- 需要が分からない。エディタ統合の要望はまだ届いておらず、同じ作業は npm 版 CLI をターミナルや
  `package.json` の script から実行すれば済む。
- 単独メンテナンス体制に対して保守コストが見合わない。Marketplace への公開、署名、npm とは別系統の
  リリースパイプラインを構築し、動く状態で維持し続ける必要がある。
- core の境界が未決定である。26.3 は拡張が `@monodocs/core` を直接呼ぶ前提だが、core は公開 API を
  持たない private の `0.0.0` パッケージのままであり、拡張から core を呼ぶのか CLI を起動するのかを
  先に決めない限り、この前提のまま進められない。

解凍する場合は 3 点目から答える。ここが他のすべての形を決めるためである。

目的：

VS Code からプレビュー・出力できるようにする。

実装範囲：

- VS Code 拡張作成
- Build HTML コマンド
- Build PDF コマンド
- Preview コマンド
- Watch Preview
- Validate Links
- Webview プレビュー
- 設定ファイル補助

完了条件：

- VS Code から HTML を生成できる
- VS Code から PDF を生成できる
- VS Code 内でプレビューできる
- 編集時にプレビューを更新できる

---

## v0.8: 高度機能

目的：

より高度なドキュメント生成に対応する。

実装範囲：

- 検索改善
- 日本語検索改善
- カスタムテーマ
- カスタムサイドバー完全対応
- 単体バイナリ配布
- Homebrew / Scoop / winget 対応（見送りを決定。8.5 章を参照）
- HTML / PDF 出力品質改善（印刷時の切り捨て、狭い画面、PDF の文書情報）

完了条件：

- 大規模ドキュメントでも検索が実用的
- Node.js なしで実行できる配布物がある
- テーマを切り替えられる

---

## v0.9: 検索の仕上げ

目的：

検索を仕上げる。ドキュメントとクエリで同じ語の表記が違っても読者の意図どおりに当たるようにし
（生成物に辞書や検索ランタイムを足さずに実現する）、結果をマウス無しでも扱えるようにする。

実装範囲：

- 照合時にカタカナをひらがなへ畳む
- 長音記号・ダッシュ類・波ダッシュ / 全角チルダを畳む
- 半角カタカナ・送り仮名・英語の stemming を対象外として確定し、理由を 22.3 章に記録する
- ARIA の combobox として、`↓` / `↑` で結果を辿り `Enter` で開けるようにする
- 結果から開いたページの本文でも、一致語を強調する
- 既定出力名を `manual.html` / `manual.pdf` から `docs.html` / `docs.pdf` へ改名する。monodocs は
  渡されたページ群を何であれまとめるので、それはマニュアルとは限らない。既定に依存している利用者
  にとっては破壊的変更であり、1.0 より後ではなく前に行う

完了条件：

- ひらがなのクエリでカタカナの本文が引け、その逆も引ける
- ダッシュ・チルダの書き分けで結果が分かれない
- ハイライトは元の表記のまま強調される
- 未対応のまま残る表記ゆれが、未着手の宿題ではなく決定として記録されている
- 検索欄から離れずにキーボードだけで結果を辿って開け、選択位置がスクリーンリーダーに伝わる
- 結果を開けば本文のどこに語があるか分かり、クエリを消せば本文は元どおりに戻る
- `-o` を省略すると `./dist/docs.html`、`--format pdf` は `./dist/docs.pdf`、`--format both` は
  渡したディレクトリの中へ `docs.html` / `docs.pdf` を出力する

---

## v0.10: 言語と 1.0 前の積み残し

目的：

monodocs が実際に読んでいる相手に向かって話すようにする。自身のメッセージでも、生成物を囲む UI
でも、配る PDF でも。あわせて、この仕様書が約束したまま実装が果たさなかった 2 箇所を塞ぐ。ここに
挙げた項目はどれも利用者から見える表面を変えるので、1.0 がその表面を凍結した後ではなく前に行う。

実装範囲：

- CLI とランタイムのメッセージを翻訳する。既定は英語、日本語は明示的に選ぶ（25.6）
- 生成物に `<html lang>` と UI ラベルの両方を決める `lang` を持たせ、`html.labels` で個別の項目を
  上書きできるようにする（23.4）。あわせて architecture.md に記録されている「ラベルは英語に統一」
  の決定を覆す
- 当初から 25.1 に仕様があり作られなかった `monodocs init` を実装する
- ビルドを実行するマシンに文書が必要とするフォントが無いとき、PDF 出力と mermaid `pre-render` の
  両方について、成果物に豆腐を焼き込む代わりに警告する（24.3.3）
- PDF にページ番号を入れる（24.5）
- 提供しない配布形態として Docker を記録する（8.3）
- 公開済みの版が初めて外部で使われて分かった積み残しを片付ける。未知のキーの規則を 1 つにし
  （12.2）、除外リストを置換ではなく追加にし（12.3）、単一ファイルを入力として受け取り（25.2）、
  印刷時の表の列幅を中身に従わせる（24.3.1）
- 印刷する版面を詰めるか緩めるかを書き手が選べるようにする。`pdf.margin` では届かなかった
  ところであり、既定は画面向けではなく紙向けに組む（24.6）
- ドキュメントサイト（コマンド・設定・CI ガイド）とその日本語ミラーを更新する。上記の項目はどれも
  サイトが記述している内容を変えるため

完了条件（この章がマイルストーンを定義し、[status.md](status.md) がチェックリストとして追跡する。
両者は同期させる）：

- `--help`（Commander が生成する見出しを含む）と全てのエラー・警告が既定で英語になり、`--lang ja`
  または `MONODOCS_LANG=ja` で日本語になる。フラグが環境変数に優先し、対応していない値は黙って
  フォールバックせず対応する値を挙げて拒否する
- カタログが monodocs 自身の出す全ての文字列を覆う。`configureHelp` / `addHelpText` 経由で届く
  Commander のヘルプ文言も含み、その外に新しい文字列を足すとテストが落ちる。包まれないまま利用者に
  届く依存パッケージ由来のメッセージ（Zod のパースエラー、Puppeteer のスタック）は対象外とし、その
  境界を後から探り直さずに済むよう文書に書く
- `lang: ja` で `<html lang="ja">` と日本語のラベルが出て、既定では両方とも英語になる。文書が
  ある言語を宣言しながら別の言語を表示することが無くなる。表を持たないタグも `<html lang>` には
  届き、英語のラベルへフォールバックして警告する
- 任意の 1 項目を `html.labels` から差し替えられ、未知のキーは無視されずに拒否され、1.0 が凍結する
  ためキー集合の全体が設定リファレンスに列挙されている
- `template.html` や `style.css` だけを差し替えたテーマにはラベルが届き、`app.js` を差し替えた
  テーマは `siteDataJson` から読む。この 2 つが別の保証であることが、ひとまとめにされずに書かれて
  いる
- `monodocs init` が編集無しでビルドできる設定と最初のページを書き出し、どちらかが既にある場合は
  どちらも書かずに、見つけたものを名指しする
- 必要なフォントが無い環境でのビルドが、危ういコードポイントとそれを収録するフォントの例を示す。
  そのマシンに無いものを必要としない文書では黙っている。`fontCheck: warn | error | off` が 3 つの
  挙動を選び、`error` は非ゼロで終了する
- `mermaid.mode: pre-render` も同じ検査の対象になる。ビルドマシンのフォントを SVG に焼き込む
  ため（21.2）
- 生成した PDF が既定でページ番号を持ち、その形式は翻訳を必要としない。`pdf.header: false` が
  Chromium 組み込みの日付とタイトルのヘッダーではなく帯そのものを出さず、差し替えた断片は
  Chromium 自身のクラスで描かれる
- 既定のフッターに足りないマージンは警告し、独自の断片は検査対象外であることが明記されている
- `verify-published.yml` が、PDF が生成されたことだけを確認するのではなく、新しい表面——メッセージ
  の言語・`init`・ページ番号が実際に入った PDF——を実行して確かめる
- Docker イメージを公開しないという決定が、Homebrew / Scoop / winget と同じく理由付きで記録されて
  いる
- 未知のキーは、どの深さにあってもビルドを止め、そのキーと、それを含むオブジェクトを名指しする。
  深い場所にあるという理由で扱いが変わるキーは無く、報告は検証ライブラリの issue 配列の JSON
  ダンプではない
- `sources.exclude` が既定の除外リストを置き換えず追加し、`sources.excludeDefaults: false` が
  その既定リストを外す。`sidebar.exclude` も引き続きビルドでき、移動先と、追加へ変わったことを
  伝える
- `monodocs build ./docs/plan.md` がそのファイルを 1 ページの文書としてビルドし、設定・リンク・
  画像の基準はそれを含むディレクトリになる。monodocs が読めないファイルは、`ENOTDIR` を素通し
  するのではなく、扱える拡張子を挙げて拒否する
- 印刷した表が、各列に中身なりの幅を与えたうえで、紙幅に収まる
- `pdf.density` の `relaxed` / `normal` / `compact` / `tight` が、同じ文書を段階的に少ない枚数へ
  収める。オブジェクト形式はプリセットを土台にするので、1 つ値を変えるために残りを書き写す必要が
  無い。既定は画面向けではなく紙向けに組み、文字の大きさを変えずに枚数を減らす。`relaxed` は画面の
  設定に名前を付けたもので、規則を 1 つも出力しない。公式サイトは、1 つの原稿から組んだ 4 つを
  PDF で置き、その 1 ページ目自身をサムネイルにして見せる

## v0.11: 改ページと 1.0 の契約

目的：

印刷したときにページがどこで終わるかを、書き手が決められるようにする。ソースファイルの単位では
すでに紙が改まるが、ファイルの内側には何も無い。そのため、節ごとに紙を改める文書——仕様書、規程、
紙で手渡すもの——はそもそも作れず、より古くて単純な「ここで改ページする」も書けない。どちらも文書を
書く人に属する版面の判断であり、どちらも 1.0 が凍結する表面を変える。

後半は前半と関係が無い。それでも同じリリースに載るのは、0.11.0 が公開されていないからである。
改ページの作業が main へ入り、その次のマイルストーンが定義されるまでの間、何も npm へ出なかった。
番号はまだ空いている。main に既にあるものだけで 1 回、続くマイルストーンでもう 1 回リリースを切れば、
1 回で足りる検証を 2 回払うことになり（[maintenance.md](maintenance.md)）、このリポジトリの
`(v0.11)` という注記は誰もインストールできないバージョンを指したままになる。ここではマイルストーンの
番号とリリースの番号は同じ番号であり、それが注記を「その機能が入ったリリース」として読める理由で
ある。以降のマイルストーンを 1 つずつ繰り下げるのも、同じ番号であり続けるためである。

この文書をもう一度真にし、番号を名乗る前に 1.0 が実際に何を約束するのかを書く。改ページの半分は
仕様を先に書き、実装がそれに一致した。その同じファイルの別の場所で、設定例はスキーマに無いキーを
説明し続け、architecture.md はコードが持たなくなったリンクの挙動を説明し続けていた。誰も確かめない
場所で誤っている仕様は、短い仕様より悪い。以後のあらゆる決定がそれを引用する。

1.0 の契約のもう一方は、このマイルストーン以降のすべてが必要とするモデルである。診断は今は
文字列であり、だから `validate` は CI に渡せるものを持たず、だから「JSON 出力を足す」は小さな
変更ではなく、先に存在していなければならないデータモデルである。

実装範囲：

- 改ページのマーカーを両形式で機能させる。AsciiDoc の `<<<` は
  `<div class="page-break"></div>` として既に出力へ届いていながら何も起こしていない。Markdown でも
  同じ要素を、raw HTML を再び有効にするのではなく厳密な綴りとして認識する（24.7）
- `pdf.pageBreakLevel` を追加し、指定したレベルまでの見出しの前で改ページする。前にページタイトル
  しか無い見出しはそのままにする（24.7）
- 規則は default テーマではなく core から出し、`style.css` の差し替えで消えないようにする
- 記法の仕様書・アーキテクチャ文書・公式サイトの設定リファレンスを、日本語ミラーとともに更新する。
  raw HTML の境界と設定の表面がどちらも変わるため
- 仕様をコードへ同期させる。設定例（12.1）、architecture.md の別ファイルアンカーの段落、そして
  status.md の一覧表——改ページのチェックが全部埋まったあとも planned と言い続けていた
- 設定例をテストの fixture にして、二度とずれないようにする（12.1）
- 1.0 が凍結するものとしないものを書く。`sidebar.exclude` が既に従っている非推奨化の形も含める
  （12.4）
- `Diagnostic` モデルと安定した診断コードを導入する（27.3）
- `validate --format json` を追加する。自身のスキーマバージョンを持たせ、パイプラインが既に持って
  いる情報から判定できる検査を 3 つ足す（25.5）
- `document.version` / `date` / `authors` を追加し、PDF の文書情報と branding フッタへ届かせる。
  ビルド時刻はどこにも入れない（13.5）

完了条件（このマイルストーンはこの章が定義し、[status.md](status.md) がチェックリストとして追跡
する。両者は常に一致させる）：

- AsciiDoc の `<<<` と Markdown の `<div class="page-break"></div>` が、それぞれ PDF で新しい紙を
  始める。`<div style="page-break-after: always"></div>` も同じマーカーとして受け、class 形へ正規化
  する
- Markdown のマーカーは `remark-rehype` の前に mdast の `html` ノードで認識し、出力へ届く要素は
  monodocs が組み立てたものであって入力を出力し直したものではない。`<DIV>`、余分なクラス、2 つ目の
  属性、自己終了タグ、タグの間の空白、そして引用・リスト項目・表のセル・見出しの中のマーカーは
  すべて拒否し、他の raw HTML と同じく破棄したままにする
- `pdf.pageBreakLevel` は `false`（既定）または 2〜6 を取る。数値は新しい紙を始める最も深い見出し
  レベルであり、h1 は含まない。h1 が題するファイルはすでに改ページ済みだからである
- その見出しより前に描画されるものが何も無いか、あるのがページの h1 だけであるときだけ除外する。
  したがってタイトルと導入文で始まるページでも、最初のセクションの前では改ページする。
  `break-inside: avoid` の付いたブロックの中の見出しは対象にしない
- 改ページする見出しは post-process で `data-monodocs-pdf-break-before` を付けて示し、CSS では選ば
  ない。Markdown の平坦な本文と Asciidoctor の `.sect1`〜`.sect5` の入れ子を規則 1 本で扱い、h1 の
  無いページや最初の見出しが h3 のページでも同じ挙動になる
- 規則は両方とも core が印刷用スタイルシートに書き出し、`#content` と `.page` の両方を名指す。
  `style.css` を差し替えたテーマでも残る。既定の `false` では見出しの規則を 1 つも出力せず、どちらの
  規則も画面用スタイルシートへは漏れない
- マーカーの直後に改ページ対象の見出しが来ても、その間に空白の紙は生じない。隣接する 2 つの強制
  改ページを Chromium が畳むかどうかは実測し、畳まないなら post-process で 2 つ目を抑制する
- 紙の先頭に来た見出しの上の空きは `pdf.density` と突き合わせて実測し、Chromium がそれを残す場合に
  限り規則で 0 にする。紙に届く値は推測で決めないという 24.6 と同じ基準である
- PDF の検証は、生成した PDF から読み取った枚数で行う。密度のテストが既に採っている形である。
  `h1 → h2 → 本文 → h2` を `pageBreakLevel: 2` で組むとちょうど 2 枚になる——機能が死んでいれば
  1 枚、先頭見出しの規則が誤っていれば 3 枚になる——そして同じ文書を既定で組むと 1 枚になる。
  両形式について確認する
- 12.1 の YAML を取り出して `loadConfig` に通すテストがある。同梱される例は、monodocs が警告なしに
  読み込む例である。存在しない 12 個のキーは消え、そもそも設定できなかった 2 つの挙動——GFM と
  frontmatter は常時有効、safe mode は固定——がキーのあった場所でそう述べる
- architecture.md は、別ファイルのアンカーについてコードが持つ挙動を述べる。対象ページの接頭辞付き
  要素 ID へ解決し、アンカーが存在しなければ警告してページ先頭へ落とす。syntax.md は既にそう書いて
  おり、両者が一致する
- 12.4 が、1.0 が受理したキー・コマンド・オプション・記法を 1.x で削除も改名も再定義もしないこと、
  既定値の変更はメジャーであること、追加はマイナーで許されること、実装より先に受理して無視する
  キーは作らないことを、この文書の中で述べている
- monodocs が出すすべてのエラーと警告が `code` を持ち、パイプラインが知っている場合は `path` と
  位置を持つ。コード無しで診断を足したらテストが落ちる
- `monodocs validate --format json` が、スキーマバージョンと診断の配列を持つオブジェクトを出す。
  固定すべき対象としてスキーマバージョンが文書化される。人間向けの出力は変わらない
- 見出しレベルの飛び、`alt` 属性の無い画像、解決できない別ファイルのアンカーが診断として報告される。
  `alt=""` は報告されず、報告されないことをテストが主張する
- `document.version` / `date` / `authors` が PDF の Author / Subject / Keywords と、HTML・PDF 双方の
  branding フッタへ届く。同じ入力を 2 回ビルドすると同一のバイト列になり、それをテストが主張する
  ——ビルドは自前の日付を書かない
- 公式サイトの設定リファレンスと日本語ミラーが `document` と JSON 出力を載せる

---

## v0.12: 入力と route

目的：

リポジトリが実際に取っている形のまま 1 つの文書を組めるようにし、その中のリンクがファイルの改名で
死ぬのをやめさせる。どちらも route の決定であり、だから 1 つのマイルストーンである。ルートの
`README.md` と `docs/` 配下のページは今は 1 つの文書にできず、1 つにすればその文書の route が全部
動く——だから古いリンクを生かす仕組みは、後からではなく同時に来なければならない。

AsciiDoc の側も同じ理由でここにある。`sources.asciidoc.attributes` は 1.0 より前から約束されていて、
書き手が欲しい属性は文書の読み方を変えるものであり、monodocs が拒否しなければならない属性は
どこからファイルを読むかを変えるものである。その境界は `include::` と画像が既に依存している境界で
あり、そしてそれは architecture.md が主張しているより弱いことが分かっている。

実装範囲：

- `root` と `sources.include` を追加し、`input` は単一ディレクトリの綴りとして残す（12.5）
- 両形式に route の別名を追加し、衝突・被覆・正規化の規則をビルド時に検査する（15.5）
- `sources.asciidoc.attributes` を、分類された集合——許可・書き手定義・拒否・そもそも設定不可——と
  して追加し、ロックではなく既定値として設定する（17.5）
- include したファイルと画像の実体パスを入力ルートと突き合わせる。safe mode はシンボリックリンクを
  解決しないためである。あわせて「外部アクセスを防ぐ」という architecture.md の記述を正す（17.5）

完了条件：

- `root: .` と `sources.include: ["README.md", "docs/**"]` が両方から 1 つの文書を組み、画像・
  リンク・設定ファイルを `root` から解決する。`sources.exclude` は最後に差し引く
- `root` も `include` も無い設定は今日とまったく同じに振る舞い、既存の fixture をそのままビルドする
  テストがそれを示す。`input` が `root` の外を指す場合はマージではなくエラーになる
- frontmatter の `aliases:` と AsciiDoc の `:sd-aliases:` によって、古い hash route がページを描画し、
  hash が現在の route に置き換わる。アンカーは置換をまたいで残る
- 2 つのページが 1 つの別名を主張したらエラー。別名が実在の route と衝突したら警告して実在の route が
  勝つ。その判定の前に別名は正規化される。別名はサイドバーにも検索索引にも前後ナビゲーションにも
  現れない
- `sources.asciidoc.attributes` で `sectnums` と書き手独自の属性を設定でき、文書自身の値が設定値に
  勝つ。`allow-uri-read` / `docinfo` / `backend` / `data-uri` / `imagesdir` / `source-highlighter` /
  `sd-*` は属性名と理由を告げて拒否される。`safe` と `base_dir` はそもそも受理しない
- 実体パスが入力ルートの外へ解決される `include::` と画像は、解決先のパスを示して拒否される。テストは
  実際のシンボリックリンクを使う。architecture.md は safe mode がすることと、この検査がすることを
  書き分ける

---

## v0.13: 単一ファイルの予算

目的：

その文書を渡せるかどうかを決める数字を、書き手に渡す。このプロジェクトのすべては出力が 1 つの
ファイルであることから来ているのに、そのファイルを測るものが無い。33.3 はリスクを名指し、
`maxInlineSize` は画像を 1 枚ずつ裁く——それは部分についての規則であって全体についての事実ではない。
書き手はサイズをメールサーバーの拒否で知る。

実装範囲：

- ビルドの最後に出力サイズと、正直な内訳を報告する（20.5）
- `assets.budget` と `assets.onBudget` を追加する。既定は未設定（20.5）
- 画像を再エンコードしない理由を記録し、問いを開いたままにしない（20.5）
- `pdf.watermark` を追加する。テーマが消せないよう core から出す（24.10）

完了条件：

- ビルドが出力サイズと、埋め込み画像・inline の Mermaid ランタイム・`siteDataJson`・その他の内訳を
  出す。内訳の合計がファイルと一致し、それをテストが主張する。Shiki の行は無い。出力にランタイムを
  残さないからである
- 最大の埋め込み画像がサイズとともに名指しされる。内訳は行動されるためにある
- `assets.budget: 10MB` は超過時に警告し、`onBudget: error` はビルドを失敗させる。未設定なら何も
  変わらず、既存のビルドが警告し始めることはない
- どちらの数字も、ディスクへ書いたバイト数を、ファイルが完成したあとに測ったものである。ビルド中に
  積算した見積りではない
- `pdf.watermark: "DRAFT"` が、PDF とブラウザ印刷の全ページで本文の背後に斜めの 1 行を印字し、画面
  には何も出さない。文字列はエスケープされ、マークアップを含む値はその文字列として現れる
- 透かしの規則は core が印刷用スタイルシートへ出し、`style.css` を差し替えたテーマでビルドしても
  残る
- 画像を再エンコードしないという決定が、理由——バイナリが載せられないネイティブ依存、HTML ビルドが
  獲得してはならない Chromium 依存、失う再現性——とともに記録される。Docker や Homebrew がそうされた
  のと同じように

---

## v0.14: 紙の版面を仕上げる

目的：

紙で手渡す文書を仕上げる。v0.10 がページ番号と密度を与え、v0.11 が紙の終わる位置を書き手に渡した。
まだ無いのは、仕様書を仕様書たらしめているもの——何の版かを言う表紙、番号で引用できる節、何ページを
めくればよいかを言う目次——である。3 つが同時に来るのは互いに依存しているからである。目次は番号付きの
節を並べ、その枚数は表紙がずらしている。

このマイルストーンは、期限切れの理由を繰り返すのではなく、数式の問いにも答える。

実装範囲：

- `numbering.sections` を追加する。どちらかのレンダラーでファイルごとに決めるのではなく、共有の
  `Page` モデルの上で文書全体について決める（19.1）
- `pdf.cover.enabled` を追加する。`document` から表紙を生成し、番号をその後から始める（24.8）
- `pdf.toc` を追加する。検証付きの 2 回描画で作り、確かめていない番号を印字するくらいなら失敗する
  （24.9）
- KaTeX の MathML 出力による数式が採用に足るかを実測し、どちらの結論でも記録する（6.4）

完了条件：

- `numbering.sections: 3` が文書全体を通してサイドバー順で見出しに番号を振り、ディレクトリが 1 階層を
  提供し、`h1` にはページ自身の番号が付く。route・page ID・見出し ID は変わらず、それをテストが主張
  する
- 番号は見出しの中の要素であり、サイドバーとページ内目次に現れ、検索で語に勝たない。番号付けが有効な
  ときの文書内 `:sectnums:` は、設定キーを名指して拒否される
- `pdf.cover.enabled: true` が、`document` の題名・版・日付・作成者を載せた 1 枚目を作る。そこには
  ページ番号が無く、次の紙が 1 になる。PDF のページラベルは印字された番号と一致する
- 1 回の描画で 1 枚だけフッタを抑制できるかを実測する。できなければ表紙を単独の PDF として作り、
  既に完成したバイト列を書き換えている処理の上で連結する
- `pdf.toc.enabled: true` が、1 回目ではなく実際に渡される PDF から読んだページ番号を持つ目次を印字
  する。差し替え後に destination を読み直して印字した番号と比較し、食い違えば有限回まで再試行し、
  収束しない文書はその旨を述べて失敗する
- プレースホルダは取り得る最大のページ番号の幅を予約し、欄は等幅数字で組む。番号が桁を増やしても、
  それが指すページを動かせない
- 2 回目の描画のコストを、100 枚規模の文書について Linux と Windows で、CJK テキストと client モードの
  Mermaid を含めて測り、数字を記録する。`pdf.toc` は既定で off のままにする
- `pageBreakLevel`・表紙・目次・番号付けをすべて有効にした文書で、4 つが互いに一致する。目次の番号が、
  その節が始まる紙である
- 走りヘッダは実装しない。2 回描画の機構がそこへ届かない理由を 24.9 が記録する
- 実際の数式を並べた見本文書を、KaTeX の MathML 出力で両プラットフォームの HTML と PDF に組む。その
  結果として、数式が 1.x の機能になって記法を公開の場で決めるか、あるいは syntax.md が、成り立たなく
  なった依存の議論に代えて、実測に基づく制限の理由を記録するか、どちらかになる

---

## 1.0

目的：

12.4 が書いた条件のもとで、その番号を名乗る。1.0 は機能のマイルストーンではない。表面が安定したと
述べるリリースであり、それを述べる価値があるのは、表面を変えたであろうものが全部済んだあとだけで
ある。

内容：

- 凍結する表面を 1 か所に列挙する。既定値付きのすべての設定キー、すべてのコマンドとオプション、
  CommonMark・GFM・AsciiDoc を超えて monodocs が認識する記法
- 診断 JSON のスキーマバージョンを 1 とし、CI が固定する対象として文書化する
- v0.10 から非推奨の `sidebar.exclude` を削除する。12.4 が定義した非推奨化の形の、最初の実行例と
  して
- 両言語のドキュメントが、ツールを在るがままに記述している。リファレンスにスキーマの持たないキーは
  無く、architecture.md にコードのしない挙動は無い。v0.11 がそれを真にし、1.0 はそれをもう一度
  確かめる場所である。番号が主張しているのはそれだからである

---

## 30. 初期実装タスク

### 30.1 リポジトリ作成

```bash
mkdir monodocs
cd monodocs
pnpm init
```

### 30.2 基本依存追加

```bash
pnpm add -D typescript tsx vitest
pnpm add commander yaml zod
```

### 30.3 Markdown 関連追加

```bash
pnpm add unified remark-parse remark-gfm remark-frontmatter remark-rehype rehype-stringify
```

### 30.4 workspace 作成

```text
packages/
  core/
  cli/
```

### 30.5 core の最初の API

```ts
export async function buildSite(options: BuildOptions): Promise<BuildResult>;
```

```ts
export type BuildOptions = {
  inputDir?: string;
  outputFile?: string;
  configFile?: string;
  format?: "html" | "pdf" | "both";
};
```

### 30.6 最初に実装する関数

```text
loadConfig()
scanSourceFiles()
detectFormat()
readSourceFiles()
extractMarkdownMeta()
renderMarkdown()
buildPages()
buildSidebar()
renderSingleHtml()
writeOutput()
```

### 30.7 最初の CLI

```bash
monodocs build ./docs -o ./dist/docs.html
```

---

## 31. サンプル構成

### 31.1 Markdown のみ

```text
examples/basic-markdown/
  docs/
    index.md
    setup/
      install.md
      config.md
```

### 31.2 AsciiDoc のみ

```text
examples/basic-asciidoc/
  docs/
    index.adoc
    setup/
      install.adoc
      config.adoc
```

### 31.3 混在

```text
examples/mixed/
  docs/
    index.md
    setup/
      install.adoc
      config.md
    guide/
      usage.adoc
      faq.md
```

---

## 32. MVP の定義

最初の MVP は、PDF や AsciiDoc まで広げすぎず、以下に絞る。

```text
v0.1 MVP:
- TypeScript monorepo
- core + cli
- Markdown 複数ファイル読み込み
- H1 タイトル抽出
- GFM 対応
- フォルダ構造サイドバー
- 単一 HTML 出力
- hash route による疑似ページ切り替え
```

ただし、将来の AsciiDoc 対応を見越して、内部設計は最初から Source Renderer Architecture を意識する。

つまり、v0.1 では MarkdownRenderer のみ実装し、v0.2 で AsciiDocRenderer を追加する。

---

## 33. リスクと対策

### 33.1 Markdown / AsciiDoc のリンク変換が複雑

対策：

- 最初はファイル単位リンクのみ対応する
- 見出しリンクは後回しにする
- 解決できないリンクは警告にする
- validate コマンドで検出する

### 33.2 AsciiDoc の機能が広すぎる

対策：

- 初期は Asciidoctor.js の標準変換に任せる
- `include` は Asciidoctor に任せる
- `partials` / `_` 始まりをページ化対象から除外する
- AsciiDoc 拡張は後回しにする

### 33.3 HTML が巨大化する

対策：

- 画像埋め込みを設定で ON / OFF できるようにする
- maxInlineSize を設定する
- サイズ超過時の挙動を warn / error / external から選べるようにする

### 33.4 Mermaid と PDF の相性

対策：

- client mode と pre-render mode の両方に対応する
- PDF 出力時は client mode の描画完了を待つ
- JavaScript なしの出力が必要な場合は pre-render mode で図を SVG として埋め込む

### 33.5 GitHub Flavored Markdown 完全互換は難しい

対策：

- 「GitHub 完全互換」とは表現しない
- 「GFM supported」と表現する
- remark-gfm を基本とする

### 33.6 VS Code 拡張で二重実装になる

対策：

- 変換ロジックは core に閉じ込める
- VS Code 拡張は core を呼び出すだけにする

---

## 34. 開発開始時の優先順位

最初の実装順序は以下。

```text
1. monorepo 初期化
2. core パッケージ作成
3. cli パッケージ作成
4. MarkdownRenderer 実装
5. Page モデル作成
6. サイドバー生成
7. 単一 HTML テンプレート作成
8. hash route 切り替え
9. basic-markdown example 作成
10. vitest による基礎テスト追加
```

この段階で、まず `monodocs` の核を成立させる。

その後、

```text
11. AsciiDocRenderer
12. mixed example
13. link rewrite
14. image embed
15. Mermaid
16. PDF
```

の順に進める。

---

## 35. 最終的な到達点

最終的には、以下のように使えることを目指す。

```bash
monodocs build ./docs --format html -o ./dist/docs.html
monodocs build ./docs --format pdf -o ./dist/docs.pdf
monodocs serve
monodocs validate
```

入力は Markdown / AsciiDoc 混在。

```text
docs/
  index.md
  overview.adoc
  setup/
    install.md
    config.adoc
  guide/
    usage.md
```

出力は単一 HTML または PDF。

```text
dist/
  docs.html
  docs.pdf
```

`monodocs` は、複数ファイルで管理されたドキュメントを、配布しやすい単一ファイルに変換するためのツールである。
