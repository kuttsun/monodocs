# はじめに

monodocs は Markdown / AsciiDoc のディレクトリを **単一の自己完結 HTML** にまとめる CLI ツールです。ドキュメントは複数ファイルに分割して管理しながら、配布物だけを 1 ファイル化します。

## 何ができるか

```bash
monodocs build ./docs -o ./dist/manual.html
```

出力は外部ランタイム不要の単一 HTML です。ページ内検索、目次、前後ナビ、ダークモード、印刷用レイアウトがすべて埋め込まれます。ナビの **「単一ファイルサンプル」** は、このプロジェクト同梱の examples から monodocs 自身で生成したものです。

### 生成物を検索する

サイドバーの検索ボックスから、タイトル・見出し・本文を検索できます。キーワードを空白（全角空白も可）で区切ると、すべての語を含むページだけに絞り込めます。結果は語の出現箇所（タイトル → 見出し → 本文）で順位付けされ、見出しに一致した結果はその見出しへ直接移動します。照合は大文字小文字を区別せず、全角英数字（`ＰＤＦ`）は半角と同じに扱い、部分一致で行うため日本語のキーワードに分かち書きは不要です。

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

### スタンドアロンバイナリ（Node.js 不要）

各リリースには Node ランタイムを同梱した単一実行ファイルも添付しています。Node.js が入っていない
マシンでもそのまま動きます。[Releases ページ](https://github.com/kuttsun/monodocs/releases) から
`monodocs-linux-x64` または `monodocs-windows-x64.exe` を、対応する `.sha256` ファイルとあわせて
ダウンロードしてください。各バイナリには、同梱物（monodocs 本体・npm 依存・Node.js ランタイム）の
ライセンスをまとめた `-NOTICES.txt` も添付しています。社内などで再配布する場合はバイナリと一緒に
配布してください。

```bash
sha256sum -c monodocs-linux-x64.sha256   # ダウンロードの検証
chmod +x monodocs-linux-x64
./monodocs-linux-x64 build ./docs -o ./dist/manual.html
```

バイナリで使えるのは `build`（HTML）・`validate`・`watch`・`serve` です。**PDF 出力と Mermaid の
`pre-render` は利用できません**。どちらもヘッドレスブラウザを `puppeteer-core` 経由で使いますが、
これはバンドルに含めていないためで、実行するとその旨のエラーで失敗します。必要な場合は npm 版を
使ってください。バイナリは署名していないため、Windows では初回実行時に SmartScreen の警告が出る
ことがあります。

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
