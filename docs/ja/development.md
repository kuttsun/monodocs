# 開発ガイド

[English](../development.md)

## 開発方針

- **ホスト環境を汚さない**: Node.js / pnpm はホストにグローバルインストールせず、
  開発・ビルド・テストはすべて devcontainer（または Docker コンテナ）内で実行する。
- **アプリとサイトを分離**: アプリ本体は `app/`、将来公開する紹介サイトは `site/`、
  開発ドキュメントは `docs/` に置く。
- **Source Renderer Architecture**: Markdown / AsciiDoc など各ソース形式は専用 renderer で
  処理し、共通の `Page` モデルに正規化してから出力する（[architecture.md](architecture.md)）。
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
  examples/ja/              # 全記法・全機能のサンプル（日本語。markdown / asciidoc / mixed）
  examples/en/              # 同上の英語版
  site/                     # アプリ紹介の静的 Web サイト（VitePress）
    .vitepress/theme/       # カスタムテーマ（デザイントークン / 書体 / トップの hero）
  docs/                     # 開発ドキュメント（本フォルダ）
  scripts/app.sh            # 専用イメージ内でコマンドを実行するヘルパー
  Dockerfile.dev            # 開発・ビルド・テスト用イメージ（pnpm 焼き込み）
  .devcontainer/            # VS Code Dev Containers 用（任意。Dockerfile.dev を利用）
  README.md
```

## 開発環境（専用 Docker イメージ）

ホストに Node / pnpm を入れず、専用イメージ **`monodocs-dev`** の中で開発・ビルド・テストする。
イメージは Node 22 に pnpm（`app/package.json` の `packageManager` と同じ版）を焼き込んであり、
corepack による pnpm の都度ダウンロードが発生しない。

### 監査から除外しているアプリ依存関係の advisory

`app/pnpm-workspace.yaml` の `auditConfig.ignoreGhsas` に GHSA-238p-pmpm-9mq7 を挙げ、`pnpm audit` がこれで失敗しないようにしています。0.18.2 で修正された低深刻度の KaTeX の advisory で、すでに汚染された `Object.prototype` から継承した `trust` などのオプションを、アプリケーションが設定したかのように扱うというものです。

- **届く場所**: monodocs が使う 1 つの版の mermaid の 2 つのバンドルです。inline ランタイムと pre-render が埋め込む `mermaid.min.js` と、`mermaid.runtime: cdn` がその同じ版を指定して jsDelivr から読み込む ESM バンドルで、どちらも KaTeX 0.16.47 を持ちます。
- **override しない理由**: このリポジトリの KaTeX を override してもどちらのバンドルにも届かず、mermaid 11 も 12 も `katex ^0.16.47` を要求します。出荷物を変えずに監査だけを黙らせることになります。
- **ビルド時の KaTeX**: `@monodocs/core` が直接依存して数式を描きます。版は同じ 0.16.47 で、告知が 1 つの KaTeX を名指し、MathML の書き換え（roadmap 6.4）が測ったものと一致するよう、Mermaid が同梱する版と揃えています。`trust` はすべてのコマンドを拒む関数として明示的に設定しているので、継承された `trust` が信頼の必要なコマンドを有効にすることはありません。ほかのオプションは継承されえますが、それにもやはり `Object.prototype` をすでに汚染したコードが必要です。
- **受け入れたリスク（低）**: 悪用には、すでに `Object.prototype` を汚染したコードと攻撃者が制御する数式の両方が要り、mermaid は出力を DOMPurify に通します。
- **削除の条件**: monodocs が使う mermaid が修正済みの KaTeX を持つようになったら項目を削除し、ビルド時の KaTeX もその版に上げ、その MathML を MathML Core に照らして調べ直します。2026-10-06 時点の再点検では、mermaid 12.1.0 も `katex ^0.16.47` を要求しています。

### アプリ依存関係のセキュリティ override（削除済み）

`app/` は以前、`postcss` を pnpm `overrides`（`pnpm-workspace.yaml`）で `^8.5.18` に固定していました。`postcss <= 8.5.17` は高深刻度の path traversal advisory（GHSA-r28c-9q8g-f849）を持ち、`vitest -> vite` 経由で dev/test 専用の依存ツリーに入っていたためです。2026-10-01、lockfile が自前で `postcss: ^8.5.28` を宣言する `vite` 8.3.1 を解決するようになった時点で削除しました。

あわせて `vite` を `app/package.json` の直接の dev dependency として宣言し、ほかの開発ツールと同じく通常のバージョン更新で追跡されるようにしています。`vitest` の peer dependency にとどまっていた間は、manifest を対象とする Dependabot の通常のバージョン更新が更新を提案せず、上流の修正から 2 か月間、lockfile は `vite` 8.1.0 のままでした。`vitest` がもともと要求していたものなので、インストール内容も公開バンドルも増えません。

### 依存関係の公開後経過時間ポリシー

pnpm 11 は、公開から `minimumReleaseAge` 分（既定 1440 分＝24 時間）が経っていないバージョンをインストールせず、`pnpm install --frozen-lockfile` もコミット済み lockfile を同じポリシーで検証します。悪意あるリリースはたいてい 1 時間ほどでレジストリから削除されるため、1 日待てばその時間帯をほぼ回避できます。リポジトリでは設定せず、pnpm の既定値に任せています。

`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で install が失敗するのは、lockfile が新しすぎるバージョンを指しているためで、そのバージョンが壊れているのではありません。ポリシーを迂回せず、カットオフを過ぎてから再実行してください。

`.github/dependabot.yml` では npm 系に 3 日の `cooldown` を設定し、CI が走る時点で pnpm のカットオフを過ぎているようにしています。

> [!WARNING]
> cooldown は Dependabot の security update には適用されません。緊急のセキュリティリリースは pnpm のカットオフより新しいことがあり、その場合は（一時的な `minimumReleaseAgeExclude` の追加など）意図的な判断が必要で、黙って迂回してはいけません。

### サイト依存関係のセキュリティ override

`site/` の standalone package は Vite を一時的に `~6.4.3` へ固定しています。VitePress 1.6.4 が宣言する Vite `^5.4.14` は、Dependabot が検出する Vite / esbuild の advisory 対象版へ解決されるためです。override は Vite 6.4 の patch release に限定し、`npm ci`、`npm audit`、VitePress production build を通し続けてください。安全な Vite を含む範囲を宣言する安定版 VitePress へ更新するときに削除を再検討します。2026-10-01 時点の再点検では、安定版は依然として VitePress 1.6.4（`vite ^5.4.14`）、VitePress 2 は alpha（`next` タグの `2.0.0-alpha.20`）のみ、Vite 6.4 系の最新 patch も `6.4.3` のままなので、override を維持します。

### サイトのテーマ

`site/.vitepress/theme/` は VitePress 既定テーマの上に重ねたカスタムテーマです。次の点は装飾ではなく、壊すと動作や意味が変わります。

- `index.ts` は `vitepress/theme` ではなく `vitepress/theme-without-fonts` を継承し、既定テーマが同梱する Inter を配信しません。使う書体は `fonts.css` で宣言して npm（`@fontsource-variable/archivo`、`@fontsource/ibm-plex-mono`）から取得するので、フォント CDN へのリクエストはありません。日本語はシステムフォントにフォールバックし、何もダウンロードしません。
- 等幅は実在する機械文字列（パス・コマンド・パッケージ名）にだけ使います。`style.css` はインラインコードからアクセント色を外し、色付きのリンクだけが押せるものと分かるようにしています。
- `BundleDiagram.vue` と `HeroCommand.vue` は入力ディレクトリと出力ファイル名を共有し、hero を「このコマンドでこのファイルが得られる」と読ませます。出力名は文書の種類ではなく入力ディレクトリに由来します（`docs.html`、および図のもう一方の出力 `docs.pdf`）。monodocs は渡されたページ群を何であれまとめるからです。両方を揃えてください。コマンドは HTML 側なので、揃える対象は `docs.html` です。出力カードのリンク先は公開サンプル（`site/public/sample.html`）で、別のファイルです。
- 図のソース一覧がツリーなのは、ページの階層が出力のサイドバーになるからです。ツリー中の画像はミニサイドバーに意図的に反映していません。`buildSidebar` はページから組み立てるため、アセットしか持たないフォルダは現れません。
- `style.css` の上書きは、セレクタにクラスや要素をひとつ余分に含めています。既定テーマの scoped style は属性セレクタ分の詳細度を持ち、同じ詳細度で書くと結果がスタイルシートの読み込み順に依存するためです。

### 必要なもの

- Docker のみ（VS Code / devcontainer は不要）

### イメージのビルド（初回のみ）

```bash
docker build -f Dockerfile.dev -t monodocs-dev .
```

### よく使うコマンド（ヘルパー `scripts/app.sh` 経由）

`scripts/app.sh` は `monodocs-dev` が無ければ自動ビルドし、作業ツリーをマウントして `app/` 内でコマンドを
実行する。**ホスト側でだけ**使う。devcontainer やコンテナシェルでは Docker-in-Docker を避けるため `pnpm` を
直接実行する。

```bash
scripts/app.sh pnpm install     # 依存をインストール
scripts/app.sh pnpm build       # 全パッケージをビルド（tsc）+ テーマアセットのコピー
scripts/app.sh pnpm test        # テスト（vitest）
scripts/app.sh pnpm typecheck   # 型チェック
scripts/app.sh pnpm format      # Prettier で整形
scripts/app.sh pnpm format:check # 変更せずフォーマットを確認
scripts/app.sh pnpm ci:check    # format、build、typecheck、test、CLI bundle
scripts/app.sh pnpm package:verify # npm package artifact の build・install・smoke test
```

> [!IMPORTANT]
> `app/package.json` の `packageManager` と `Dockerfile.dev` の `PNPM_VERSION` は一致させる。

ローカルプレビュー（ホストのブラウザで `http://localhost:4173/`）は、依存インストール（初回のみ）・ビルド・
`serve --host 0.0.0.0` をまとめて行う `scripts/app-serve.sh` が手軽:

```bash
scripts/app-serve.sh
# 別ポート: MONODOCS_PORT=8080 scripts/app-serve.sh --port 8080
```

個別に起動する場合（`scripts/app-serve.sh` は内部でこれに委譲する）:

```bash
scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0
# 別ポート: MONODOCS_PORT=8080 scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0 --port 8080
```

> [!NOTE]
> ホストから見るには `serve` に `--host 0.0.0.0` が必要（`scripts/app-serve.sh` は自動で付与し、
> `scripts/app.sh` は `MONODOCS_PORT`（既定 4173）を公開する）。`http://0.0.0.0:...` ではなく `http://localhost:...` を開く。

単一 HTML（配布物）をファイルに出力する:

```bash
scripts/app.sh node packages/cli/dist/index.js build ../examples/ja -o dist/docs.html
```

トップの README に載せる PDF 見本（`docs/assets/pdf-sample-*.png`）は、`site/samples/readme/` や PDF の版面を
変えたら作り直す:

```bash
scripts/app.sh pnpm build && scripts/readme-pdf-sample.sh
```

### `sources.lineBreak: join` の Unicode データ

`join` には East_Asian_Width プロパティが要るが、JavaScript の正規表現はこれを扱えない。

- `app/packages/core/src/sources/eastAsianWidth.ts` の表は、同梱の
  `app/packages/core/scripts/data/EastAsianWidth-<version>.txt` から生成する。両者が食い違うとテストが失敗する。
- データは Unicode License v3 で、全文を `LICENSE-Unicode.txt` として隣に同梱している。どのパッケージにも
  含まれないので、`app/scripts/bundle.mjs` が `THIRD-PARTY-NOTICES.txt` へ手で加える。
- 既定で "W" とする範囲はデータではなくヘッダーの文章で示されるため、生成スクリプトはヘッダーがその範囲を
  挙げなくなったデータファイルを拒否する。

Unicode のバージョンを上げるときは、データファイルを差し替え、生成スクリプトの参照先を変えて再生成し、
`sources/lineBreak.test.ts` のテストが期待するバージョンも更新する。

```bash
scripts/app.sh sh -c 'cd packages/core && node scripts/generate-east-asian-width.mjs'
```

### inline の Mermaid ランタイムの表記

`mermaid.runtime: inline` でビルドした HTML は、mermaid のビルド済み `mermaid.min.js` と
`app/packages/core/src/themes/mermaid-notices.txt` の第三者表記を埋め込む。ランタイムは mermaid 自身の
lockfile でバンドルされているので、表記は `node_modules` ではなくそのソースマップから生成する。対象は、
ソースの出どころのパッケージと、事前バンドルされたパーサーの中で esbuild が名指すパッケージである。
ライセンスは、その版が pnpm ストアにあればそこから、無ければ npm の tarball から読み、tarball はレジストリの
integrity ハッシュと照合する。

ソースマップは自前のビルド済みファイルを同梱するパッケージの中を見られないので、次の場合に生成は失敗する。

- コンポーネントの実行時の依存のうち、表記が挙げも説明もしないものがある。ランタイムに無い依存は
  `NOT_IN_RUNTIME` に理由とともに書く。
- 大きなソースやビルド済みのソースを持つコンポーネントが、その版で `PREBUILT_AUDITED` に無い。ファイルを
  読み、取り込んでいるパッケージと別のライセンスで持ち込まれたコード（あるいは何も含まないこと）を
  `PREBUILT_AUDITED` に記録する。
- ソースのコメントが挙げる URL が `REVIEWED_URLS` に記録されていない。

ライセンス文の無いコンポーネントでも失敗する。

ソースは大きさ、minify、パス、バンドラーの痕跡で判定するので、痕跡を残さない小さな minify されていない
バンドルは素通りしうる。mermaid とパーサー自身のソースは判定の対象外で、mermaid の版ごとに人が監査する。
古くなった `mermaid@<version>` の項目がそれを強制し、生成時に表示される出典の一覧が手がかりになる。

表記が挙げるコンポーネントがランタイムのものと食い違うとき（mermaid を上げるとそうなる）、また監査を持つ
生成スクリプトが表記の生成後に変わったとき、テストが失敗する。再生成して（ネットワークを使うことがある）
結果をコミットする。

```bash
scripts/app.sh sh -c 'cd packages/core && node scripts/generate-mermaid-notices.mjs'
```

### 単一実行ファイル（ネイティブバイナリ）をビルドする

`scripts/app.sh` / `scripts/app-serve.sh` はコンテナにリポジトリ（`/work`）しかマウントせず、作業ディレクトリも
`/work/app` のため、**リポジトリ配下のパスしか配信できない**（`app/` の外は `../examples/ja` のように `../` を
付けて指す）。任意の場所のドキュメントを試すには、ホストで直接動く単一実行ファイルを使う。

`scripts/app-build.sh` が依存込みの単一ネイティブバイナリ（Node 22 の
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)）を
`app/dist/monodocs` に出力する。esbuild で全依存とテーマアセットを 1 ファイルにバンドルし、
SEA blob を `postject` で node バイナリへ注入する。**ホストに node は不要**（ビルド環境と同じ OS/arch 向け）。

```bash
scripts/app-build.sh                              # → app/dist/monodocs を生成

# 以降はホストで直接実行（Docker 不要・任意ディレクトリを指せる）
app/dist/monodocs serve ~/任意のドキュメント       # ローカルプレビュー（--host 0.0.0.0 不要）
app/dist/monodocs build ~/任意のドキュメント -o ~/docs.html
```

> [!NOTE]
> - 出力は約 130 MiB（node ランタイム同梱のため）。`app/dist/` は `.gitignore` 済み。
> - Windows では `app/dist/monodocs.exe` を出力する（Windows は拡張子で実行可否を判断するため）。
>   公開リリースには同じバイナリを `monodocs-linux-x64` / `monodocs-windows-x64.exe` として添付し、
>   リリースワークフローで生成、Pull Request CI で毎回 smoke test している。
> - `pnpm build:bin` は `app/dist/monodocs-NOTICES.txt`（monodocs・Node.js ランタイム・第三者ライセンス）も
>   出力する。バイナリ単体では通知を持ち歩けないため、リリースでは各バイナリの隣に公開する。
> - テーマアセット（`template.html` / `style.css` / `app.js`）と mermaid inline ランタイムは
>   バンドル時に `globalThis.__MONODOCS_ASSETS__` へ埋め込む（`scripts/bundle.mjs`）。
>   `loadTheme` / `mermaidRuntimeScript` はこれを優先し、無ければファイルから読む。
> - バンドルだけ欲しいとき（ホストに node がある場合）は `scripts/app.sh pnpm bundle` で
>   `app/dist/monodocs.cjs` を生成し `node app/dist/monodocs.cjs ...` で実行できる。

### ヘルパーを使わず `docker run` で実行する場合

```bash
docker run --rm -it -v "$PWD":/work -w /work/app monodocs-dev pnpm test
docker run --rm -it -p 4173:4173 -v "$PWD":/work -w /work/app monodocs-dev \
  node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0
```

### VS Code Dev Containers（任意）

必須ではない。`.devcontainer` は同じ `Dockerfile.dev` からイメージを構築する。
**Dev Containers: Reopen in Container** で起動すると `postCreate` で `pnpm install` が走り、
コンテナ内では `pnpm build` / `pnpm test` を直接実行できる（`scripts/app.sh` は不要）。
`node packages/cli/dist/index.js serve examples/ja` では VS Code がポート 4173 を自動フォワードする（`--host` は不要）。

## アーキテクチャ

完全なアーキテクチャ、実装上の不変条件、セキュリティ境界、出力制約は [architecture.md](architecture.md) を参照してください。概要は次のとおりです。

```text
Markdown / AsciiDoc files
      ↓  Source Renderer（形式ごと）
   Page[]（共通モデル）
      ↓  buildSidebar / renderSingleHtml
  single HTML
      ↓  (optional) headless browser   ※ PDF 対応は v0.5 から
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

対応記法や単一ファイル制約を変更するときは [syntax.md](syntax.md) を、ロードマップのバージョン完了時は [status.md](status.md) と [testing.md](testing.md) を更新します。

### UI（chrome）の言語

テーマの UI 文言（コピー/折り返し、前後ナビ、検索、目次など）は**文書の `lang` に従う**。既定は `en`（v0.10）。
言語はビルド時に決まり、読者に追従するランタイム i18n は行わない（単一ファイルの読者は一度に一種類である）。

core が `lang` に対応する表を解決し、`html.labels` を上から適用し、結果を `siteDataJson` に公開する。
`themes/default/app.js` は自前の写しを持たずそれを消費し、静的文言は `template.html` のトークンから
取る。同梱する表は `en` と `ja`。ラベルを追加するときは両方の表と、列挙されたキー集合の両方に足す。
片方の表に無いキーは黙ってフォールバックせずビルドを失敗させる。

> [!NOTE]
> v0.10 までは UI 文言が常に英語で、`lang="ja"` の文書が `On this page` を表示し、設定でも直せなかった。
> [roadmap.md](roadmap.md) 23.4 を参照。

### PDF のフォント

PDF 出力（`--format pdf` / `both`）と Mermaid pre-render はヘッドレス Chromium で描画するため、
**実行環境にフォントの無い文字は PDF で豆腐（□ / ☒）になる**（HTML はブラウザ側の
フォントで表示するため影響しない）。`Dockerfile.dev` には以下を同梱している:

- `fonts-noto-cjk` … 日本語（CJK）
- `fonts-noto-color-emoji` … 絵文字（`✅` / `⚠️` など）

自前環境で PDF を出す場合は、使う文字種に応じたフォントを別途インストールする。

> [!IMPORTANT]
> フォントを追加したら `docker build -f Dockerfile.dev -t monodocs-dev .` でイメージを再ビルドする。
> `scripts/app.sh` はイメージが**無いときだけ**自動ビルドするので、Dockerfile 変更後は手動再ビルドが必要。

ビルドは文書が実際に含む文字とそのマシンが描けるものを突き合わせ、該当する文字と例フォントを挙げて警告する
（`fontCheck: warn | error | off`、既定 `warn`。[roadmap.md](roadmap.md) 24.3.3）。

> [!NOTE]
> 同梱のサンプル文書が開発イメージでこの警告に引っかかるのは、数式についてだけである。開発イメージには意図して
> 数式用のフォントを入れていないので、`examples/en`、`examples/ja`、`examples/math` は数式の文字と、OpenType の
> MATH テーブルを持たないフォントを報告する。数式用のフォントを入れれば何も報告しない。これは
> `build.fontcheck.test.ts` が確かめている。

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

> [!CAUTION]
> 信頼できない入力を扱う場合は、`rehype-sanitize` 等によるサニタイズ層の追加を検討する（現状は未導入）。
> 導入すると著者が意図した HTML/passthrough も制限される。
