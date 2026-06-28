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
    examples/               # basic-markdown / mixed / showcase（全記法サンプル）
  site/                     # （予定）アプリ紹介の静的 Web サイト
  docs/                     # 開発ドキュメント（本フォルダ）
  scripts/dev.sh            # 専用イメージ内でコマンドを実行するヘルパー
  Dockerfile.dev            # 開発・ビルド・テスト用イメージ（pnpm 焼き込み）
  .devcontainer/            # VS Code Dev Containers 用（任意。Dockerfile.dev を利用）
  README.md
```

## 開発環境（専用 Docker イメージ）

ホストに Node / pnpm を入れず、専用イメージ **`single-docs-dev`** の中で開発・ビルド・
テストする。イメージは Node 22 に pnpm（`app/package.json` の `packageManager` と同一の
バージョン）を焼き込んであるため、corepack による pnpm の都度ダウンロードが発生しない。

### 必要なもの

- Docker のみ（VS Code / devcontainer は不要）

### イメージのビルド（初回のみ）

```bash
docker build -f Dockerfile.dev -t single-docs-dev .
```

### よく使うコマンド（ヘルパー `scripts/dev.sh` 経由）

`scripts/dev.sh` は `single-docs-dev` が無ければ自動ビルドし、作業ツリーをマウントして
`app/` 内でコマンドを実行する。**ホスト側で**実行する。

```bash
scripts/dev.sh pnpm install     # 依存をインストール
scripts/dev.sh pnpm build       # 全パッケージをビルド（tsc）+ テーマアセットのコピー
scripts/dev.sh pnpm test        # テスト（vitest）
scripts/dev.sh pnpm typecheck   # 型チェック
scripts/dev.sh pnpm format      # Prettier で整形
```

ローカルプレビュー（ホストのブラウザで `http://localhost:4173/`）:

```bash
scripts/dev.sh node packages/cli/dist/index.js serve examples/mixed/docs --host 0.0.0.0
# 別ポート: SDOCS_PORT=8080 scripts/dev.sh node packages/cli/dist/index.js serve examples/mixed/docs --host 0.0.0.0 --port 8080
```

> コンテナ内から配信をホストへ公開するため、`serve` は `--host 0.0.0.0` が必要
> （`scripts/dev.sh` は `SDOCS_PORT`（既定 4173）を公開する）。`http://0.0.0.0:...` ではなく
> `http://localhost:...` を開く。

### ヘルパーを使わず `docker run` で実行する場合

```bash
docker run --rm -it -v "$PWD":/work -w /work/app single-docs-dev pnpm test
docker run --rm -it -p 4173:4173 -v "$PWD":/work -w /work/app single-docs-dev \
  node packages/cli/dist/index.js serve examples/mixed/docs --host 0.0.0.0
```

### VS Code Dev Containers（任意）

必須ではない。使う場合、`.devcontainer` は同じ `Dockerfile.dev` からイメージを構築する。
**Dev Containers: Reopen in Container** で起動すると `postCreate` で `pnpm install` が走り、
コンテナ内では `pnpm build` / `pnpm test` を直接実行できる（`scripts/dev.sh` は不要）。

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
- `core/src/pipeline/renderSingleHtml.ts` … テンプレートに埋め込み単一 HTML を生成（目次/検索用のページデータも埋め込む）
- `core/src/themes/default/` … テンプレート / CSS / クライアント JS（hash route 切り替え・検索・目次・前後ナビ・ダークモード・折りたたみ）
- `core/src/watch.ts` … 入力・設定の変更を監視して再ビルド（`fs.watch`、デバウンス付き）
- `core/src/serve.ts` … ローカル HTTP 配信 + 監視 + SSE ライブリロード

単一 HTML 内での見出し ID 衝突を避けるため、各見出し / 要素 ID は
`{page-id}-{元のID}` に prefix する（AsciiDoc の同一文書内 xref も追従して書き換える）。

## 入力の前提（セキュリティ）

`single-docs` は **自分（チーム）が管理する信頼できるドキュメント** を変換する用途を想定する。

- Markdown は生 HTML を通さない（remark-rehype の既定でドロップ）。
- AsciiDoc は passthrough により著者が意図した生 HTML を出力でき、その HTML はサニタイズせず
  そのまま埋め込む。したがって **信頼できない AsciiDoc を変換すると XSS になり得る**。
- AsciiDoc の `include::[]` は `safe` モードで入力ファイルのディレクトリ配下に jail する
  （`base_dir` を入力ファイルのディレクトリに設定）。外部ファイルの読み込みはできない。
- 画像の data URI 埋め込みは、実体パス（symlink 解決後）が入力ルート配下にあるものだけを対象とする。
  入力ルート外を指す画像は埋め込まず警告する。
- 画像サイズ上限（`assets.maxInlineSize`）超過時の挙動は `assets.onLargeImage` で選ぶ:
  `warn`（警告して埋め込む。既定）/ `external`（埋め込まず元 src のまま）/ `error`（ビルド失敗）。

信頼できない入力を扱う必要が出た場合は、`rehype-sanitize` 等によるサニタイズ層の追加を検討する
（現状は未導入。導入すると著者が意図した HTML/passthrough も制限される点に注意）。
