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

CI や社内環境向け。

```bash
docker run --rm \
  -v "$PWD:/work" \
  monodocs/monodocs build /work/docs -o /work/dist/docs.html
```

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

```yaml
title: "社内ドキュメント"

input: "./docs"

output:
  format: "html"
  path: "./dist/docs.html"

sources:
  markdown:
    enabled: true
    extensions:
      - ".md"
      - ".markdown"
    gfm: true
    frontmatter: true

  asciidoc:
    enabled: true
    extensions:
      - ".adoc"
      - ".asciidoc"
      - ".asc"
    safeMode: "safe"
    attributes:
      sectnums: true
      icons: font

sidebar:
  mode: "folder"
  # タイトルの取得元。"heading"（既定）= frontmatter → 見出し(H1 / = Title) → ファイル名。
  # "filename" = 見出しがあってもファイル名をタイトルに使う（明示タイトルは常に最優先）。
  titleFrom: "heading"
  collapsible: true
  # この階層より深いディレクトリを既定で折りたたむ（隠さず畳むだけなので到達性は失わない）。
  # 0 = 全ディレクトリを畳む / 未指定 = 折りたたみなし（全展開）。トップレベルを深さ 1 とする。
  collapseDepth: 2
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
  exclude:
    - "_partials/**"
    - "partials/**"
    - "includes/**"

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

html:
  selfContained: true
  routeMode: "hash"
  theme: "default"
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
  darkMode: true

pdf:
  enabled: false
  pageSize: "A4"
  margin:
    top: "20mm"
    right: "15mm"
    bottom: "20mm"
    left: "15mm"
  printBackground: true

search:
  enabled: true
```

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
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>{{ title }}</title>
    <style>
      {{ style }}
    </style>
  </head>
  <body>
    <div id="app">
      <aside id="sidebar">{{ sidebar }}</aside>

      <main id="content">{{ pages }}</main>
    </div>

    <script>
      window.__MONODOCS_DATA__ = {{ siteDataJson }};
    </script>

    <script>
      {
        {
          appJs;
        }
      }
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
`overflow-wrap: anywhere`、表は `display: table` + `table-layout: fixed` に戻す（画面側で
スクロールさせるための `display: block` は `thead` の繰り返しも無効にするため、ページをまたぐ表は
見出し行を失っていた）。セルは長語を折り返し、図は紙幅で頭打ちにする。本文の
`overflow-wrap: break-word` は本文中の長い URL に効き、画面側にも同じ効果がある。狭い画面で横
スクロールが出ていた原因も、同じ分割できない文字列だった。

### 24.3.2 文書情報（v0.8）

配布する PDF は、何で作られたのかを自身に持つべきである。Chromium は Creator に自分の UA 文字列を
残し、しおり付与に使う pdf-lib は Producer に自身を書き込む。どちらも monodocs を示さず、タイトルも
空のままなのでビューアにはファイル名しか出ない。`setPdfMetadata` が設定のタイトルと
`monodocs v<version>` を Creator / Producer の両方へ設定する。しおり付与の後に実行し、pdf-lib の
`updateMetadata` を無効にして、保存時に再び上書きされないようにしている。あわせてビューア設定の
`DisplayDocTitle` も立てる。これが無いと、タイトルがあっても標準に従うビューアはファイル名を
表示し続ける。

### 24.4 PDF 用表示モード

HTML の疑似ページ表示とは別に、PDF 用には全ページを縦に並べる print mode を用意する。

```text
interactive mode:
  hash route で 1 ページずつ表示

print mode:
  全ページを縦に展開
```

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
