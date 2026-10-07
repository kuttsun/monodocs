# はじめに

monodocs は Markdown / AsciiDoc のディレクトリを **単一の自己完結 HTML** にまとめる CLI ツールです。ソースは分割したまま、配布物だけを 1 ファイルにします。

## 何ができるか

```bash
monodocs build ./docs -o ./dist/docs.html
```

出力は外部ランタイム不要の単一 HTML で、ページ内検索、目次、前後ナビ、ダークモード、印刷用レイアウトを埋め込みます。ナビの **「単一ファイルサンプル」** は、このプロジェクト同梱の examples から monodocs 自身で生成したものです。

### 生成物を検索する

サイドバーの検索ボックスから、タイトル・見出し・本文を検索できます。

- **検索ボックスへの移動**：文書のどこからでも `/` または `Ctrl+K`（macOS では `⌘K`）。サイドバーを閉じていても使えます（先に開きます）。入力欄で文字を打っている間はどちらのキーも横取りしないので、`/` はそのまま打て、`Ctrl+K` は macOS での編集操作（行末まで削除）のまま残ります。`⌘K` だけは例外で、入力欄の中でも効き、入力済みの語を選択するのでそのまま打ち替えられます。
- **キーワード**：空白（全角空白も可）で区切ると、すべての語を含むページだけに絞り込めます。結果は語の出現箇所（タイトル → 見出し → 本文）で順位付けされ、見出しに一致した結果はその見出しへ直接移動します。
- **照合**：部分一致（日本語のキーワードに分かち書きは不要）で、大文字小文字を区別しません。全角英数字（`ＰＤＦ`）は半角と、カタカナはひらがなと同じに扱い（`インストール` で `いんすとーる` が引けます）、長音記号とダッシュ（`ー` / `―`）、波ダッシュと全角チルダ（`〜` / `～`）の書き分けも区別しません。半角カタカナと送り仮名の揺れ（`引き渡し` / `引渡し`）は吸収しません。
- **キーボード操作**：`↓` / `↑` で結果を辿り（端では反対側へ回り込みます）、`Enter` で選択中の結果を（まだ動かしていなければ先頭の結果を）開き、`Escape` で検索欄を消します。カーソルは検索欄に残るので、そのまま入力を続けられます。
- **強調表示**：開いたページと、そこから移った先のページでもキーワードが強調されます。クエリを打ち替えるか消すと外れます。

## インストール

monodocs は npm で公開しています。Node.js 22.12.0 以上が必要で、対応プラットフォームは Linux x64 と Windows x64 です。

```bash
npm install -g monodocs
# グローバルインストールせずに実行する場合
npx monodocs build ./docs -o ./dist/docs.html
```

バージョンをリポジトリに固定する場合は、プロジェクトに追加します。

```bash
npm install -D monodocs
```

> [!IMPORTANT]
> PDF 出力と Mermaid pre-render には、システムにインストールされた Chromium または Google Chrome が必要です（monodocs はブラウザを自動ダウンロードしません）。Linux と Windows では自動検出します（Windows では Chromium ベースの Microsoft Edge にもフォールバックします）。標準以外の場所にインストールした場合や、自動検出のない macOS などでは `PUPPETEER_EXECUTABLE_PATH` を指定してください。

### スタンドアロンバイナリ（Node.js 不要）

各リリースには Node ランタイムを同梱した単一実行ファイルも添付しています。
[Releases ページ](https://github.com/kuttsun/monodocs/releases) から `monodocs-linux-x64` または
`monodocs-windows-x64.exe` を、対応する `.sha256` ファイルとあわせてダウンロードしてください。
各バイナリには、同梱物（monodocs 本体・npm 依存・Node.js ランタイム）のライセンスをまとめた
`-NOTICES.txt` も添付しています。社内などで再配布する場合はバイナリと一緒に配布してください。

```bash
sha256sum -c monodocs-linux-x64.sha256   # ダウンロードの検証
chmod +x monodocs-linux-x64
./monodocs-linux-x64 build ./docs -o ./dist/docs.html
```

バイナリで使えるのは `init`・`build`（HTML）・`validate`・`watch`・`serve` です。**PDF 出力と Mermaid の
`pre-render` は利用できません**。どちらもヘッドレスブラウザを `puppeteer-core` 経由で使いますが、
これはバンドルに含めていないためで、実行するとその旨のエラーで失敗します。必要な場合は npm 版を
使ってください。

> [!NOTE]
> バイナリは署名していないため、Windows では初回実行時に SmartScreen の警告が出ることがあります。

## 最初のビルド

何も無いところから始めるなら、`init` が手を入れずにビルドできる設定ファイルと最初のページを書き出します。

```bash
monodocs init     # -> monodocs.config.yml, docs/index.md
monodocs build    # -> dist/docs.html
```

上書きはしません。どちらかのファイルが既にあれば、どちらも書かずに見つけたものを伝えるので、作業の入ったディレクトリで試しても安全です。生成される設定ファイルは [`init`](/ja/docs/commands#init) を参照してください。

既にある文書をビルドする場合は次のとおりです。

```bash
# 単一の自己完結 HTML
monodocs build ./docs -o ./dist/docs.html

# PDF（Chromium が必要）
monodocs build ./docs --format pdf -o ./dist/docs.pdf

# リンク切れ、画像の欠落、タイトルの欠落を検出する
monodocs validate ./docs
```

入力ディレクトリの構造がそのままサイドバーになり、Markdown と AsciiDoc は自由に混在できます。

## ローカルプレビュー

```bash
# ライブリロード付きプレビューサーバ（http://127.0.0.1:4173/）
monodocs serve ./docs --open
```

## ソースから実行する

monodocs 自体を開発する場合は、リポジトリからビルドします。ツールチェーンは **Docker 内** で動くので、ホストに Node / pnpm は不要です。

```bash
git clone https://github.com/kuttsun/monodocs.git
cd monodocs

scripts/app.sh pnpm install
scripts/app.sh pnpm build

# 同梱 examples から単一 HTML を生成
scripts/app.sh node packages/cli/dist/index.js build examples/ja -o dist/docs.html
```

## 次のステップ

- コマンド一覧とオプションは [コマンドオプション](/ja/docs/commands)（`init` / `build` / `watch` / `serve` / `validate`）を参照してください。
- `monodocs.config.yml` の設定項目は [設定ファイル](/ja/docs/configuration) を参照してください。
- バージョン計画は [ロードマップ](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) を参照してください。
- 対応記法と、単一ファイル化に伴う制限は [対応記法](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) にまとまっています。
