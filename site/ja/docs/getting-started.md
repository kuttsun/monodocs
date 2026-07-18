# はじめに

> **Status: v0.6 beta candidate** — HTML・PDF・validate・Mermaid・`watch`・`serve` は実装済みです。npm prerelease を `next` タグで公開する準備を進めています。

monodocs は Markdown / AsciiDoc のディレクトリを **単一の自己完結 HTML** にまとめる CLI ツールです。ドキュメントは複数ファイルに分割して管理しながら、配布物だけを 1 ファイル化します。

## 何ができるか

```bash
monodocs build ./docs -o ./dist/manual.html
```

出力は外部ランタイム不要の単一 HTML です。ページ内検索・目次・前後ナビ・ダークモード・印刷用レイアウトがすべて埋め込まれます。ナビの **「単一ファイルデモ」** は、このプロジェクト同梱の examples から monodocs 自身で生成したものです。

## beta のインストール

npm での beta 公開が告知された後は、Node.js 22 以上の環境でインストールできます。

```bash
npm install -g monodocs@next
# グローバルインストールせずに実行する場合
npx monodocs@next build ./docs -o ./dist/manual.html
```

PDF 出力と Mermaid pre-render には Chromium または Google Chrome が必要です。自動検出できない場合は `PUPPETEER_EXECUTABLE_PATH` を指定してください。

## beta 公開前にソースから実行する

npm prerelease が告知されるまでは、ソースからビルドします。開発ツールチェーンは **Docker 内** で動くので、ホストに Node / pnpm を入れる必要はありません。

```bash
git clone https://github.com/kuttsun/monodocs.git
cd monodocs

scripts/app.sh pnpm install
scripts/app.sh pnpm build

# 同梱 examples から単一 HTML を生成
scripts/app.sh node packages/cli/dist/index.js build examples/ja -o dist/manual.html
```

## ローカルプレビュー

```bash
# ライブリロード付きプレビューサーバ
scripts/app.sh node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0
# → http://localhost:4173/
```

## 次のステップ

- コマンド一覧とオプションは [コマンドオプション](/ja/docs/commands)（`build` / `watch` / `serve` / `validate`）を参照してください。
- `monodocs.config.yml` の設定項目は [設定ファイル](/ja/docs/configuration) を参照してください。
- バージョン計画は [ロードマップ](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) を参照してください。
- 対応記法と、単一ファイル化に伴う制限は [対応記法](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) にまとまっています。
