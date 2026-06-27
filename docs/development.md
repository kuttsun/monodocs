# 開発ガイド

## 開発方針

- **ホスト環境を汚さない**: Node.js / pnpm はホストにグローバルインストールせず、
  開発・ビルド・テストはすべて devcontainer（または Docker コンテナ）内で実行する。
- **アプリとサイトを分離**: アプリ本体は `app/`、将来公開する紹介サイトは `site/`、
  開発ドキュメントは `docs/` に置く。
- **Source Renderer Architecture**: Markdown / AsciiDoc など各ソース形式は専用 renderer で
  処理し、共通の `Page` モデルに正規化してから出力する（[roadmap.md](roadmap.md) 11章）。
- **段階的リリース**: ロードマップのバージョン単位で機能を追加する（[status.md](status.md)）。

## ディレクトリ構成

```text
single-docs/
  app/                      # アプリ本体（pnpm モノレポ）
    packages/
      core/                 # 変換処理の中核（@single-docs/core）
        src/
          sources/          # 各形式の SourceRenderer（markdown / asciidoc）
          pipeline/         # buildPages / buildSidebar / renderSingleHtml
          themes/default/   # HTML テンプレート / CSS / クライアント JS
      cli/                  # CLI（single-docs コマンド）
    examples/               # basic-markdown / mixed
  site/                     # （予定）アプリ紹介の静的 Web サイト
  docs/                     # 開発ドキュメント（本フォルダ）
  .devcontainer/
  README.md
```

## 開発環境（devcontainer）

### 必要なもの

- Docker
- VS Code + [Dev Containers 拡張](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### セットアップ

1. リポジトリを VS Code で開く
2. **Dev Containers: Reopen in Container** を実行する
3. 初回起動時に `corepack enable` と `app/` での `pnpm install` が自動実行される

ベースイメージは `mcr.microsoft.com/devcontainers/typescript-node:22`、
パッケージマネージャは corepack 経由の pnpm（バージョンは `app/package.json` の
`packageManager` で固定）。

### よく使うコマンド

`app/` ディレクトリで実行する。

```bash
cd app
pnpm install        # 依存をインストール
pnpm build          # 全パッケージをビルド（tsc）+ テーマアセットのコピー
pnpm test           # テスト（vitest）
pnpm typecheck      # 型チェック
pnpm format         # Prettier で整形
```

### devcontainer を使わない場合

Docker のみでビルド・テストを実行できる（ホストを汚さない）。

```bash
docker run --rm -v "$PWD":/work -w /work/app node:22-bookworm \
  bash -lc "corepack enable && pnpm install && pnpm build && pnpm test"
```

## アーキテクチャ

```text
Markdown / AsciiDoc files
      ↓  Source Renderer（形式ごと）
   Page[]（共通モデル）
      ↓  buildSidebar / renderSingleHtml
  single HTML
      ↓  (optional) headless browser   ※ PDF は v0.5 で対応予定
     PDF
```

- `core/src/sources/<format>/renderer.ts` … `SourceRenderer` 実装（`extractMeta` / `render`）
- `core/src/pipeline/buildPages.ts` … ソースを `Page` に正規化（route / page id の重複検知）
- `core/src/pipeline/buildSidebar.ts` … フォルダ構造からサイドバーツリーを生成
- `core/src/pipeline/renderSingleHtml.ts` … テンプレートに埋め込み単一 HTML を生成
- `core/src/themes/default/` … テンプレート / CSS / クライアント JS（hash route 切り替え）

単一 HTML 内での見出し ID 衝突を避けるため、各見出し / 要素 ID は
`{page-id}-{元のID}` に prefix する（AsciiDoc の同一文書内 xref も追従して書き換える）。

## 入力の前提（セキュリティ）

`single-docs` は **自分（チーム）が管理する信頼できるドキュメント** を変換する用途を想定する。

- Markdown は生 HTML を通さない（remark-rehype の既定でドロップ）。
- AsciiDoc は passthrough により著者が意図した生 HTML を出力でき、その HTML はサニタイズせず
  そのまま埋め込む。したがって **信頼できない AsciiDoc を変換すると XSS になり得る**。
- AsciiDoc の `include::[]` は `safe` モードで入力ファイルのディレクトリ配下に jail する
  （`base_dir` を入力ファイルのディレクトリに設定）。外部ファイルの読み込みはできない。

信頼できない入力を扱う必要が出た場合は、`rehype-sanitize` 等によるサニタイズ層の追加を検討する
（現状は未導入。導入すると著者が意図した HTML/passthrough も制限される点に注意）。
