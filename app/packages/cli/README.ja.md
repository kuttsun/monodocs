# monodocs

[English](README.md)

Markdown と AsciiDoc のディレクトリから、自己完結した単一 HTML または PDF を生成します。

## 必要環境

- Node.js 22 以上
- PDF 出力と Mermaid pre-render には Chromium または Google Chrome。システム上で自動検出できない場合は `PUPPETEER_EXECUTABLE_PATH` を設定してください。

npm package は HTML / PDF 出力と Mermaid の client / pre-render mode に対応します。standalone SEA binary は将来の別配布です。

## インストール

```bash
npm install -g monodocs@next
```

グローバルインストールせず実行する場合:

```bash
npx monodocs@next build ./docs -o ./dist/manual.html
```

v0.6 prerelease 期間は `next` tag を使用します。stable release 後は tag なしの `monodocs` で安定版が選択されます。

## 使い方

```bash
monodocs build ./docs -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
monodocs build ./docs --format both -o ./dist/
monodocs validate ./docs
monodocs serve ./docs
```

設定、対応記法、既知の制限は https://github.com/kuttsun/monodocs のプロジェクト文書を参照してください。

## ライセンス

MIT
