# single-docs

複数の Markdown / AsciiDoc ファイルから、**単一の HTML または PDF** ドキュメントを生成する CLI ツールです。

ドキュメントは複数ファイルに分割して管理しながら、配布時には 1 ファイルにまとめられることを目的としています。

> **Status: v0.1 実装済み**
> Markdown 群から単一 HTML を生成できます（フォルダ構造サイドバー / hash route ページ切り替え / H1 タイトル / GFM）。
> AsciiDoc・PDF などは未対応です。全体像は [ROADMAP.md](ROADMAP.md) を参照してください。

## リポジトリ構成

アプリ本体と、将来公開する紹介サイトをフォルダで分離しています。

```text
single-docs/
  app/        # アプリ本体（single-docs。pnpm モノレポ）
  site/       # （予定）アプリ紹介の静的 Web サイト
  ROADMAP.md  # 仕様・設計・ロードマップ
  README.md
```

開発コマンドは原則 `app/` ディレクトリで実行します。

## 特徴（目標）

- 複数 Markdown ファイルを単一 HTML にまとめる
- 複数 AsciiDoc ファイルを単一 HTML にまとめる
- Markdown / AsciiDoc の混在に対応する
- フォルダ構造に従ったサイドバー目次を自動生成する
- 画像を HTML 内に data URI として埋め込む
- Mermaid などの図表記法に対応する
- GitHub Flavored Markdown に対応する
- 単一 HTML を元に PDF 出力する
- CLI / npm / Docker / GitHub Actions / VS Code 拡張など複数の提供形態を想定する

`single-docs` は Pandoc の代替を直接目指すものではなく、
**単一ファイル配布に特化した軽量ドキュメントジェネレータ**を目指します。

## 対応状況

| 機能                                | 状態    | 対象バージョン |
| ----------------------------------- | ------- | -------------- |
| 開発環境（devcontainer / monorepo） | ✅ 完了 | -              |
| Markdown → 単一 HTML（MVP）         | ✅ 完了 | v0.1           |
| AsciiDoc 対応・混在対応             | 🚧 予定 | v0.2           |
| リンク変換 / 画像埋め込み / Mermaid | 🚧 予定 | v0.3           |
| 検索 / 目次 / watch / serve         | 🚧 予定 | v0.4           |
| PDF 出力                            | 🚧 予定 | v0.5           |
| npm / Docker / GitHub Actions       | 🚧 予定 | v0.6           |
| VS Code 拡張                        | 🚧 予定 | v0.7           |

## アーキテクチャ

`app/` は pnpm workspace によるモノレポです。

```text
app/
  packages/
    core/   # 変換処理の中核（@single-docs/core）
    cli/    # CLI（single-docs コマンド）
  examples/
    basic-markdown/
```

各ソース形式（Markdown / AsciiDoc / 将来の他形式）は専用 renderer で処理し、
共通の `Page` モデルへ正規化してから HTML / PDF を出力します（Source Renderer Architecture）。

```text
Markdown / AsciiDoc files
      ↓  Source Renderer
   Page[]
      ↓  sidebar / links / assets / search
  single HTML
      ↓  (optional) headless browser
     PDF
```

## 開発環境

開発環境は **devcontainer** で構築します。ホスト環境に Node.js / pnpm を直接インストールする必要はありません。

### 必要なもの

- Docker
- VS Code + [Dev Containers 拡張](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### セットアップ

1. このリポジトリを VS Code で開く
2. コマンドパレットから **Dev Containers: Reopen in Container** を実行する
3. コンテナ初回起動時に `corepack enable` と `app/` での `pnpm install` が自動実行されます

ベースイメージは `mcr.microsoft.com/devcontainers/typescript-node:22`、
パッケージマネージャは corepack 経由の pnpm を使用します。

### よく使うコマンド

`app/` ディレクトリで実行します。

```bash
cd app
pnpm install        # 依存をインストール
pnpm build          # 全パッケージをビルド（tsc）
pnpm test           # テスト（vitest）
pnpm typecheck      # 型チェック
pnpm format         # Prettier で整形
```

### devcontainer を使わない場合

Docker のみでビルド・テストを実行することもできます（ホストを汚さずに動作確認できます）。

```bash
docker run --rm -v "$PWD":/work -w /work/app node:22-bookworm \
  bash -lc "corepack enable && pnpm install && pnpm build && pnpm test"
```

## 使い方

> `single-docs` の npm 公開は v0.6 で対応予定です。現時点では `app/` 内でビルドして実行します。
> PDF（`--format pdf` / `both`）は v0.5 で対応予定で、現状は HTML のみ対応です。

```bash
cd app
pnpm build

# サンプルから単一 HTML を生成
node packages/cli/dist/index.js build examples/basic-markdown/docs -o dist/manual.html
```

生成された `manual.html` をブラウザで開くと、左サイドバーから各ページを
切り替えられます（hash route による疑似ページ切り替え）。

入力例:

```text
docs/
  index.md
  setup/
    install.md
    config.md
  guide/
    usage.md
```

出力例:

```text
dist/
  manual.html
```

## 設定ファイル（任意）

入力ディレクトリを置く場所に `single-docs.config.yml` を置くと挙動をカスタマイズできます。
無い場合はデフォルト（入力 `./docs`、出力 `./dist/manual.html`）が使われます。

```yaml
title: "社内ドキュメント"
input: "./docs"
output:
  format: "html"
  path: "./dist/manual.html"
sidebar:
  exclude:
    - "_partials/**"
sources:
  markdown:
    extensions: [".md", ".markdown"]
```

設定項目の全体像は [ROADMAP.md](ROADMAP.md) の「12. 設定ファイル」を参照してください。

## ロードマップ

詳細な仕様・設計・バージョン別の実装範囲は [ROADMAP.md](ROADMAP.md) にまとめています。

## ライセンス

未定（TBD）。
