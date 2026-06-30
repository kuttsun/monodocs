# はじめに

> **Status: v0.4** — Markdown / AsciiDoc から単一 HTML を生成できます（リンク変換・画像埋め込み・Mermaid・ページ内検索・目次・ダークモード・`watch` / `serve`）。PDF 出力は v0.5、npm / Docker 配布は v0.6 で対応予定です。

monodocs は Markdown / AsciiDoc のディレクトリを **単一の自己完結 HTML** にまとめる CLI ツールです。ドキュメントは複数ファイルに分割して管理しながら、配布物だけを 1 ファイル化します。

## 何ができるか

```bash
monodocs build ./docs -o ./dist/manual.html
```

出力は外部ランタイム不要の単一 HTML です。ページ内検索・目次・前後ナビ・ダークモード・印刷用レイアウトがすべて埋め込まれます。ナビの **「単一ファイルデモ」** は、このプロジェクト同梱の examples から monodocs 自身で生成したものです。

## ソースからの実行

monodocs はまだパッケージレジストリに公開していないため、ソースからビルドします。開発ツールチェーンは **Docker 内** で動くので、ホストに Node / pnpm を入れる必要はありません。

```bash
git clone https://gitlab.com/kuttsun/monodocs.git
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

- バージョン計画は [ロードマップ](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/roadmap.md) を参照してください。
- 対応記法と、単一ファイル化に伴う制限は [対応記法](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/syntax.md) にまとまっています。
