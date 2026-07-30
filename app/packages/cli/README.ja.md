# monodocs

[English](README.md)

Markdown と AsciiDoc のディレクトリから、自己完結した単一 HTML または PDF を生成します。

## 必要環境

- Node.js 22.12.0 以上
- PDF 出力と Mermaid pre-render には Chromium または Google Chrome。システム上で自動検出できない場合は `PUPPETEER_EXECUTABLE_PATH` を設定してください。

npm package は HTML / PDF 出力と Mermaid の client / pre-render mode に対応します。Node.js 無しで動くスタンドアロンバイナリは Linux x64 / Windows x64 向けに各 [GitHub Release](https://github.com/kuttsun/monodocs/releases) へ添付しています（ヘッドレスブラウザをバンドルから外しているため、PDF 出力と Mermaid pre-render はバイナリでは利用できません）。

## インストール

```bash
npm install -g monodocs
```

グローバルインストールせず実行する場合:

```bash
npx monodocs build ./docs -o ./dist/docs.html
```

tag なしの `monodocs` が安定版です。prerelease は `next` tag で公開します（`npm install -g monodocs@next`）。

## 使い方

```bash
monodocs build ./docs -o ./dist/docs.html
monodocs build ./docs --format pdf -o ./dist/docs.pdf
monodocs build ./docs --format both -o ./dist/
monodocs validate ./docs
monodocs serve ./docs
```

設定、対応記法、既知の制限は https://github.com/kuttsun/monodocs のプロジェクト文書を参照してください。

## ライセンス

MIT
