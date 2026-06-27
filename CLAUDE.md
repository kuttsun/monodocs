# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`single-docs` は複数の Markdown / AsciiDoc ファイルを **単一の自己完結 HTML（将来は PDF）** にまとめる CLI ツール。入力は分割管理したまま、配布物だけを 1 ファイル化する。Pandoc 代替ではなく「単一ファイル配布特化の軽量ジェネレータ」を目指す。仕様とロードマップは [docs/roadmap.md](docs/roadmap.md)、実装状況は [docs/status.md](docs/status.md)。

## 開発環境とコマンド

**ホスト環境を汚さない方針。** Node.js / pnpm はホストにグローバル導入せず、開発・ビルド・テストはすべて devcontainer または Docker コンテナ内で実行する。コードはすべて `app/`（pnpm モノレポ）配下。

devcontainer（または `cd app` 済みのコンテナ）内:

```bash
pnpm install        # 依存インストール
pnpm build          # 全パッケージ tsc ビルド + テーマアセットの dist コピー
pnpm test           # vitest run（全テスト）
pnpm test:watch     # vitest ウォッチ
pnpm typecheck      # pnpm -r typecheck（各パッケージ tsc --noEmit）
pnpm format         # prettier --write .
pnpm format:check   # prettier --check .
```

単一テストの実行（`app/` 内）:

```bash
pnpm exec vitest run packages/core/src/route.test.ts        # ファイル単位
pnpm exec vitest run -t "rewrites links"                     # テスト名で絞り込み
```

ホストに Node が無い場合の Docker フォールバック（リポジトリルートで実行）:

```bash
docker run --rm -v "$PWD":/work -w /work/app node:22-bookworm \
  bash -lc "corepack enable && pnpm install && pnpm build && pnpm test"
```

> 補足: `node_modules/.bin/*` は shell ラッパーのため `node node_modules/.bin/tsc` のような呼び方は失敗する。バイナリを直接叩く場合は `node node_modules/typescript/bin/tsc ...`、vitest は `./node_modules/.bin/vitest ...` を使う。

CLI をローカルで試す（ビルド後）:

```bash
node packages/cli/dist/index.js build examples/mixed/docs -o dist/manual.html
node packages/cli/dist/index.js serve examples/mixed/docs   # http://127.0.0.1:4173/
```

## アーキテクチャ（Source Renderer Architecture）

中心思想は **「形式ごとに専用 renderer で処理し、共通の `Page` モデルへ正規化してから出力する」**（[docs/roadmap.md](docs/roadmap.md) 11章）。Markdown と AsciiDoc を同じ処理で扱おうとしない。型定義は [app/packages/core/src/types.ts](app/packages/core/src/types.ts) に集約。

ビルドの中核は [build.ts](app/packages/core/src/build.ts) の `preparePages()`（`buildSite` と `validateSite` が共用）。データフロー:

```
loadConfig (config.ts)
  → scanSourceFiles (scan.ts)          入力走査・拡張子マップで形式判定・exclude 適用
  → buildPages (pipeline/buildPages.ts) 各 SourceRenderer で render → Page[] に正規化
  → postprocessPages (pipeline/postprocess.ts) HAST 上でリンク変換・画像 data URI 化・Mermaid 変換
  → buildSidebar (pipeline/buildSidebar.ts) フォルダ構造からサイドバーツリー生成
  → renderSingleHtml (pipeline/renderSingleHtml.ts) テンプレートへ埋め込み単一 HTML 生成
  → writeOutput (build.ts)
```

各形式の renderer は [sources/markdown/renderer.ts](app/packages/core/src/sources/markdown/renderer.ts)（unified/remark/rehype）と [sources/asciidoc/renderer.ts](app/packages/core/src/sources/asciidoc/renderer.ts)（Asciidoctor.js）。共通の `SourceRenderer` インターフェース（`extractMeta` / `render`）を実装する。メタデータの正規化（frontmatter / `:sd-*:` → `PageMeta`）は [sources/meta.ts](app/packages/core/src/sources/meta.ts)。

### 単一 HTML 化に伴う重要な不変条件

- **見出し ID の衝突回避**: 複数ファイルを 1 つの HTML に入れるため、すべての要素 ID を `{page-id}-{元のID}` に prefix する。Markdown 側は `collectHeadingsAndText`（renderer 内 rehype プラグイン）、AsciiDoc 側も同様に prefix し、同一文書内の xref/アンカーも追従して書き換える。`buildPages` は **route だけでなく page id の衝突も検知してエラー**にする（例: `a-b.md` と `a/b.md` は同じ page id になる）。
- **ルーティング**: 相対パスから拡張子を除いた route を生成（`index` → `/`）。単一 HTML 内は hash route（`#/setup/install`）で疑似ページ切り替え。`href` は `encodeURI` 済み、`data-route` は生のまま保持し、クライアント側で `decodeURI` して照合する（日本語・空白対応。[themes/default/app.js](app/packages/core/src/themes/default/app.js)）。
- **リンク変換**: `.md` / `.adoc` / `.html` 相当リンクと AsciiDoc xref を hash route へ。見出しアンカー（`file.md#見出し`）はファイル単位までの解決で、アンカー部分は落として警告する（未対応）。
- **ID prefix の共通化**: Markdown / AsciiDoc 双方の renderer が [sources/prefixIds.ts](app/packages/core/src/sources/prefixIds.ts) の `prefixIdsAndCollect` を使い、全要素 ID の prefix・同一文書内アンカー書き換え・見出し/テキスト収集を共通で行う。脚注など自動生成 ID もこれで衝突を回避する。

対応記法と、単一 HTML 化に伴い対応できない／意図的に制限する記法は [docs/syntax.md](docs/syntax.md) にまとめる。記法の対応範囲を変えたらこの文書も更新する。

### クライアントテーマ

[themes/default/](app/packages/core/src/themes/default/) に `template.html` / `style.css` / `app.js`。`renderSingleHtml` がトークン（`{{title}}` `{{style}}` `{{sidebar}}` `{{pages}}` `{{siteDataJson}}` `{{appJs}}` `{{bodyScripts}}`）を差し替える。`window.__SINGLE_DOCS_DATA__` に検索・目次・前後ナビ用のページデータ（route/title/hidden/h2,h3見出し/本文テキスト）を埋め込む。`app.js` は検索・ページ内目次・前後ナビ・ダークモード・サイドバー折りたたみ・hash routing を担当（素の IIFE。要素は常に null ガード）。print 時は `@media print` で全ページを縦展開。

> **テーマアセットの dist コピーが必須**: `tsc` は `.html/.css/.js` を dist へコピーしないため、`packages/core/scripts/copy-theme.mjs` が `src/themes` → `dist/themes` をコピーする（`pnpm build` に含まれる）。`loadTheme` は実行時に `src/themes`（vitest）/ `dist/themes`（ビルド後）を参照する。テーマを編集したら再ビルドが必要。

### watch / serve

[watch.ts](app/packages/core/src/watch.ts) は `fs.watch`（可能なら recursive、デバウンス付き）で入力・設定を監視して再ビルド。**出力ファイルへの書き込みイベントは無視**して自己再ビルドループを防ぐ。入力ディレクトリ不在時は例外を投げる。[serve.ts](app/packages/core/src/serve.ts) は HTTP 配信 + `watchSite` + SSE ライブリロード。依存追加を避けるため chokidar 等は使わず Node 標準で実装している。

## テスト方針

vitest。ユニット（route/format 判定/各 renderer/サイドバー）、e2e（`buildSite()` で一時ディレクトリから単一 HTML 生成・検証）、**クライアントテスト**（`@vitest-environment happy-dom` で `app.js` を `new Function(theme.appJs)()` 実行し、hash routing・検索・目次・ダークモード等を検証。例: [themes/default/app.v04.test.ts](app/packages/core/src/themes/default/app.v04.test.ts)）。詳細は [docs/testing.md](docs/testing.md)。

## 入力の前提（セキュリティ）

**信頼できる（自チーム管理の）ドキュメントの変換が前提。** Markdown は生 HTML を通さない（remark-rehype 既定でドロップ）が、**AsciiDoc は passthrough で生 HTML を出力でき、それをサニタイズせず埋め込む** → 信頼できない AsciiDoc は XSS になり得る。AsciiDoc の `include::[]` は safe モードで入力ファイルのディレクトリ配下に jail。画像 data URI 埋め込みは実体パス（symlink 解決後）が入力ルート配下のものだけが対象。詳細は [docs/development.md](docs/development.md)。

## 進め方

ロードマップのバージョン単位で機能を追加する（v0.1=Markdown単一HTML / v0.2=AsciiDoc・混在 / v0.3=リンク・画像・Mermaid・validate / v0.4=検索・目次・watch/serve / v0.5=PDF …）。各バージョン完了時に [docs/status.md](docs/status.md) と [docs/testing.md](docs/testing.md) を更新する。コミットメッセージは日本語・conventional prefix・末尾に対象バージョン（例: `feat: …（v0.4）`）。

## レビュー（必須ルール）

**実装がまとまったら（typecheck / test / format を通したうえで）、`codex` CLI にコードレビューを依頼し、指摘に対応する。** これはこのリポジトリの運用ルール。

```bash
codex review --uncommitted          # コミット前: staged/unstaged/untracked を対象
codex review --commit <SHA>         # コミット後: 特定コミットの変更を対象
```

`--uncommitted` はカスタムプロンプトと併用不可。指摘（P1/P2 等）が出たら原則修正し、対応内容を報告する。
