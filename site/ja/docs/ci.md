# CI で使う

自動化する価値があるのは 2 つです。Pull Request ごとにドキュメントを検証することと、既定ブランチやタグの更新時に配布用の HTML / PDF を生成することです。

monodocs は普通の npm CLI なので、専用の Action やプラグインは要りません。`npm` / `npx` でインストールし、ローカルと同じコマンドを実行します。

## CI に必要なもの

| 要件 | 対象 |
| ---- | ---- |
| Node.js 22.12.0 以上 | すべて |
| Chromium または Google Chrome | `--format pdf` / `--format both` と `mermaid.mode: pre-render` のみ |
| ビルド時のネットワーク | `mermaid.mode: client` で CDN ランタイムを使う場合のみ |

`validate` はエラーを検出すると終了コード `1` を返すので、Pull Request のゲートに使えます。HTML 出力と `validate` はブラウザを起動しません。

ビルドを再現可能にするため、バージョンは固定してください。devDependency として追加して（`npm install -D monodocs`）`npm exec` から呼ぶか、`npx` に厳密なバージョンを渡します。

## GitHub Actions

### Pull Request で検証する

```yaml
name: Docs

on:
  pull_request:
    paths: ['docs/**', 'monodocs.config.yml']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx --yes monodocs@0.10.0 validate ./docs
```

### 単一 HTML と PDF を生成する

GitHub ホストランナーには Google Chrome が同梱されており、monodocs が自動検出します。`ubuntu-latest` と `windows-latest` では PDF 生成に追加設定は不要です。

```yaml
name: Build docs

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # 日本語や絵文字を含む PDF を出力する場合だけ必要。
      - name: Install fonts
        run: sudo apt-get update && sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji

      - name: Build HTML and PDF
        run: npx --yes monodocs@0.10.0 build ./docs --format both -o ./dist

      - uses: actions/upload-artifact@v4
        with:
          name: manual
          path: dist/
```

`--format both` では `-o` をディレクトリとして扱い、`docs.html` と `docs.pdf` を出力します（0.8.0 以前は `manual.html` と `manual.pdf`）。

ビルド成果物ではなくリリースに添付する場合は、ワークフローを `release: types: [published]` で起動し、ジョブに `permissions: contents: write` を与えて、upload ステップを次に置き換えます。ファイル名ではなく拡張子で選べば、どのバージョンを固定していてもこのステップは動きます。

```yaml
      - name: Attach to the release
        run: gh release upload "$GITHUB_REF_NAME" dist/*.html dist/*.pdf
        env:
          GH_TOKEN: ${{ github.token }}
```

### GitHub Pages で公開する

単一 HTML は自己完結しているため、公開は Pages の成果物に 1 ファイルをコピーするだけです。このリポジトリの [`deploy-site.yml`](https://github.com/kuttsun/monodocs/blob/main/.github/workflows/deploy-site.yml) は、VitePress サイトと併せてこれを行っています。

## GitLab CI

```yaml
docs:
  image: node:22-bookworm-slim
  script:
    - npx --yes monodocs@0.10.0 validate ./docs
    - npx --yes monodocs@0.10.0 build ./docs -o ./dist/docs.html
  artifacts:
    paths: [dist/]
```

`node` イメージにはブラウザが入っていません。PDF も生成するジョブでは、Chromium とフォントを追加します。

```yaml
  before_script:
    - apt-get update
    - apt-get install -y chromium fonts-noto-cjk fonts-noto-color-emoji
  variables:
    PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium
```

## 注意点

- **Chromium の検出**：`PUPPETEER_EXECUTABLE_PATH` が常に最優先です。未指定の場合、Linux と Windows では標準のインストール先を探索します（Windows では Chromium ベースの Microsoft Edge にフォールバックします）。コンテナイメージと macOS では明示的に指定してください。
- **PDF のフォントはランナー側のもの**：フォントが無い文字は PDF で tofu（□）になります。日本語には `fonts-noto-cjk`、絵文字には `fonts-noto-color-emoji` が必要です。HTML は閲覧側のフォントを使うため影響を受けません。ランナーが描けない文字があるとビルドが警告し、[`fontCheck: error`](/ja/docs/configuration#font-check) にすればその警告でジョブを落とせます。
- **オフラインビルド**：`mermaid.mode: client` は既定で CDN からランタイムを読み込みます。ランナーが外部ネットワークに出られない場合は `inline` か `pre-render` を使ってください。
- **警告では `build` は失敗しない**：リンク切れやタイトルの欠落は報告されますが、出力は生成されます。ジョブを失敗させたい場合は `validate` を実行してください。

## 関連ページ

- [コマンドオプション](/ja/docs/commands)：上記で使ったフラグと終了コード。
- [設定ファイル](/ja/docs/configuration)：ここで触れた `mermaid`、`pdf`、`assets` の各キー。
