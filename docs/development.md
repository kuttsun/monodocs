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
monodocs/
  app/                      # アプリ本体（pnpm モノレポ）
    packages/
      core/                 # 変換処理の中核（@monodocs/core）
        src/
          sources/          # 各形式の SourceRenderer（markdown / asciidoc）
          pipeline/         # buildPages / buildSidebar / renderSingleHtml
          themes/default/   # HTML テンプレート / CSS / クライアント JS
      cli/                  # CLI（monodocs コマンド）
    examples/ja/            # 全記法・全機能のショーケース（日本語。markdown / asciidoc / mixed）
    examples/en/            # 同上の英語版
  site/                     # アプリ紹介の静的 Web サイト（VitePress）
  docs/                     # 開発ドキュメント（本フォルダ）
  scripts/app.sh            # 専用イメージ内でコマンドを実行するヘルパー
  Dockerfile.dev            # 開発・ビルド・テスト用イメージ（pnpm 焼き込み）
  .devcontainer/            # VS Code Dev Containers 用（任意。Dockerfile.dev を利用）
  README.md
```

## 開発環境（専用 Docker イメージ）

ホストに Node / pnpm を入れず、専用イメージ **`monodocs-dev`** の中で開発・ビルド・
テストする。イメージは Node 22 に pnpm（`app/package.json` の `packageManager` と同一の
バージョン）を焼き込んであるため、corepack による pnpm の都度ダウンロードが発生しない。

### 必要なもの

- Docker のみ（VS Code / devcontainer は不要）

### イメージのビルド（初回のみ）

```bash
docker build -f Dockerfile.dev -t monodocs-dev .
```

### よく使うコマンド（ヘルパー `scripts/app.sh` 経由）

`scripts/app.sh` は `monodocs-dev` が無ければ自動ビルドし、作業ツリーをマウントして
`app/` 内でコマンドを実行する。**ホスト側で**実行する。

```bash
scripts/app.sh pnpm install     # 依存をインストール
scripts/app.sh pnpm build       # 全パッケージをビルド（tsc）+ テーマアセットのコピー
scripts/app.sh pnpm test        # テスト（vitest）
scripts/app.sh pnpm typecheck   # 型チェック
scripts/app.sh pnpm format      # Prettier で整形
```

ローカルプレビュー（ホストのブラウザで `http://localhost:4173/`）。
依存インストール（初回のみ）・ビルド・`serve --host 0.0.0.0` をまとめて行う
ショートカット `scripts/app-serve.sh` が手軽:

```bash
scripts/app-serve.sh examples/ja
# 別ポート: MONODOCS_PORT=8080 scripts/app-serve.sh examples/ja --port 8080
```

個別に起動する場合（`scripts/app-serve.sh` は内部でこれに委譲する）:

```bash
scripts/app.sh node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0
# 別ポート: MONODOCS_PORT=8080 scripts/app.sh node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0 --port 8080
```

> コンテナ内から配信をホストへ公開するため、`serve` は `--host 0.0.0.0` が必要
> （`scripts/app-serve.sh` は自動で付与し、`scripts/app.sh` は `MONODOCS_PORT`（既定 4173）を公開する）。
> `http://0.0.0.0:...` ではなく `http://localhost:...` を開く。

単一 HTML（配布物）をファイルに出力する:

```bash
scripts/app.sh node packages/cli/dist/index.js build examples/ja -o dist/manual.html
```

### 単一実行ファイル（ネイティブバイナリ）をビルドする

`scripts/app.sh` / `scripts/app-serve.sh` はコンテナにリポジトリ（`/work`）しかマウントせず、
作業ディレクトリも `/work/app` のため、**`app/` 配下のパスしか配信できない**（リポジトリ外の
任意ディレクトリを指せない）。これを避けて任意の場所のドキュメントを試すには、ホストで直接動く
単一実行ファイルを使う。

`scripts/app-build.sh` が依存込みの単一ネイティブバイナリ（Node 22 の
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)）を
`app/dist/monodocs` に出力する。esbuild で全依存とテーマアセットを 1 ファイルにバンドルし、
SEA blob を `postject` で node バイナリへ注入する。**ホストに node は不要**（ビルド環境と
同じ OS/arch 向け）。

```bash
scripts/app-build.sh                              # → app/dist/monodocs を生成

# 以降はホストで直接実行（Docker 不要・任意ディレクトリを指せる）
app/dist/monodocs serve ~/任意のドキュメント       # ローカルプレビュー（--host 0.0.0.0 不要）
app/dist/monodocs build ~/任意のドキュメント -o ~/manual.html
```

> - 出力は約 130 MiB（node ランタイム同梱のため）。`app/dist/` は `.gitignore` 済み。
> - テーマアセット（`template.html` / `style.css` / `app.js`）と mermaid inline ランタイムは
>   バンドル時に `globalThis.__MONODOCS_ASSETS__` へ埋め込む（`scripts/bundle.mjs`）。
>   `loadTheme` / `mermaidRuntimeScript` はこの埋め込みを優先し、無ければ従来どおりファイルから読む。
> - バンドルだけ欲しいとき（ホストに node がある場合）は `scripts/app.sh pnpm bundle` で
>   `app/dist/monodocs.cjs` を生成し `node app/dist/monodocs.cjs ...` で実行できる。

### ヘルパーを使わず `docker run` で実行する場合

```bash
docker run --rm -it -v "$PWD":/work -w /work/app monodocs-dev pnpm test
docker run --rm -it -p 4173:4173 -v "$PWD":/work -w /work/app monodocs-dev \
  node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0
```

### VS Code Dev Containers（任意）

必須ではない。使う場合、`.devcontainer` は同じ `Dockerfile.dev` からイメージを構築する。
**Dev Containers: Reopen in Container** で起動すると `postCreate` で `pnpm install` が走り、
コンテナ内では `pnpm build` / `pnpm test` を直接実行できる（`scripts/app.sh` は不要）。
コンテナ内で `node packages/cli/dist/index.js serve examples/ja` を実行すると、
VS Code がポート 4173 を自動フォワードする（`--host` は不要）。

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

### UI（chrome）の言語

テーマの UI 文言（コピー/折り返し、前後ナビ、検索、目次など）は**英語で統一する**。
ユーザーが用意した Markdown / AsciiDoc を単一 HTML にまとめる仕様上、読者の言語に追従する
ランタイム i18n は単一ファイルでは意味が薄いため行わない。本文の言語とは独立した UI ラベルと
割り切り、国際的に読める英語をデフォルトとする。クライアント側の動的文言は
`themes/default/app.js` の `LABELS` に集約し、静的文言は `template.html` に置く（将来 config で
ビルド時に言語/ラベルを差し替えられる余地を残すための集約）。

## 入力の前提（セキュリティ）

`monodocs` は **自分（チーム）が管理する信頼できるドキュメント** を変換する用途を想定する。

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
