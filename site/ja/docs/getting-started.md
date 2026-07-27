# はじめに

monodocs は Markdown / AsciiDoc のディレクトリを **単一の自己完結 HTML** にまとめる CLI ツールです。ドキュメントは複数ファイルに分割して管理しながら、配布物だけを 1 ファイル化します。

## 何ができるか

```bash
monodocs build ./docs -o ./dist/manual.html
```

出力は外部ランタイム不要の単一 HTML です。ページ内検索、目次、前後ナビ、ダークモード、印刷用レイアウトがすべて埋め込まれます。ナビの **「単一ファイルサンプル」** は、このプロジェクト同梱の examples から monodocs 自身で生成したものです。

## インストール

monodocs は npm で公開しています。Node.js 22.12.0 以上が必要で、対応プラットフォームは Linux x64 と Windows x64 です。

```bash
npm install -g monodocs
# グローバルインストールせずに実行する場合
npx monodocs build ./docs -o ./dist/manual.html
```

バージョンをリポジトリに固定したい場合は、プロジェクトに追加します。

```bash
npm install -D monodocs
```

PDF 出力と Mermaid pre-render には、システムにインストールされた Chromium または Google Chrome が必要です（monodocs はブラウザを自動ダウンロードしません）。Linux と Windows では自動検出します（Windows では Chromium ベースの Microsoft Edge にもフォールバックします）。標準以外の場所にインストールしている場合や、自動検出に対応していない macOS などでは `PUPPETEER_EXECUTABLE_PATH` を指定してください。

## 最初のビルド

```bash
# 単一の自己完結 HTML
monodocs build ./docs -o ./dist/manual.html

# PDF（Chromium が必要）
monodocs build ./docs --format pdf -o ./dist/manual.pdf

# リンク切れ、画像の欠落、タイトルの欠落を検出する
monodocs validate ./docs
```

入力ディレクトリの構造がそのままサイドバーになります。Markdown と AsciiDoc は自由に混在させられます。

## ローカルプレビュー

```bash
# ライブリロード付きプレビューサーバ（http://127.0.0.1:4173/）
monodocs serve ./docs --open
```

## ソースから実行する

monodocs 自体を開発する場合は、リポジトリからビルドします。開発ツールチェーンは **Docker 内** で動くので、ホストに Node / pnpm を入れる必要はありません。

```bash
git clone https://github.com/kuttsun/monodocs.git
cd monodocs

scripts/app.sh pnpm install
scripts/app.sh pnpm build

# 同梱 examples から単一 HTML を生成
scripts/app.sh node packages/cli/dist/index.js build examples/ja -o dist/manual.html
```

## 次のステップ

- コマンド一覧とオプションは [コマンドオプション](/ja/docs/commands)（`build` / `watch` / `serve` / `validate`）を参照してください。
- `monodocs.config.yml` の設定項目は [設定ファイル](/ja/docs/configuration) を参照してください。
- バージョン計画は [ロードマップ](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) を参照してください。
- 対応記法と、単一ファイル化に伴う制限は [対応記法](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) にまとまっています。
