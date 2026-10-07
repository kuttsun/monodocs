# コマンドオプション

monodocs は 1 つの CLI に `init`・`build`・`watch`・`serve`・`validate` の 5 つのサブコマンドを持ちます。文書を読む 4 つは省略可能な入力引数と設定ファイルオプションを共有し、それぞれ固有のオプションを少し持ちます。`init` はそのどちらも取りません。

```bash
monodocs <command> [input] [options]
```

`[input]` は走査する入力ディレクトリ、または単一のソースファイル（既定: `./docs`）です。ファイルを渡すと、そのファイル 1 ページだけを束ね、リンク・画像・`monodocs.config.yml` の基準はそれを含むディレクトリになります。CLI オプションは常に設定ファイルより優先されます。マージ順序や `monodocs.config.yml` の探索場所は [設定ファイル](/ja/docs/configuration) を参照してください。

> [!TIP]
> ソースから実行する場合は `monodocs` を `node packages/cli/dist/index.js`（必要に応じて `scripts/app.sh` 経由）に読み替えてください。[はじめに](/ja/docs/getting-started) を参照。

## グローバルオプション

| オプション      | 説明                                                             |
| --------------- | ---------------------------------------------------------------- |
| `-V, --version` | バージョンを表示して終了します。                                 |
| `-h, --help`    | コマンドのヘルプを表示して終了します。                           |
| `--lang <lang>` | monodocs 自身のメッセージの言語。`en`（既定）または `ja`。下記参照。 |

```bash
monodocs --help          # トップレベルのヘルプ（全コマンド一覧）
monodocs build --help    # 個別コマンドのヘルプ
```

### メッセージの言語 {#message-language}

monodocs が印字するもの（`--help`、エラー、警告）は既定で英語です。日本語は、コマンド単位またはシェルや CI ジョブ全体で選びます。

```bash
monodocs --lang ja build ./docs
MONODOCS_LANG=ja monodocs build ./docs
```

- フラグが環境変数に優先し、環境変数が既定に優先します。
- 対応していない値は、対応する値を挙げて拒否します。黙って英語へフォールバックすることはありません。
- `LANG` / `LC_ALL` は意図的に**見ません**。ビルドログが、それを作ったマシンに依存しないようにするためです。
- 設定ファイルの [`lang`](configuration#lang) とは別物です。あちらはビルドされる文書を記述し、ビルドしている端末は記述しません。

> [!NOTE]
> 依存パッケージのメッセージが包まれずに届くもの（Zod のスキーマエラー本体、Puppeteer のスタックトレース）は、その依存パッケージの言語のままです。monodocs が包んでいるものは、その包み側を訳します。よくある引数パーサのエラー（不明なオプション・不明なコマンド・引数の欠落）は訳します。組み立て直せない稀なものはパーサの文言のまま出します。

## `init`

出発点になる設定ファイルと最初のページを書き出します。入力引数も設定ファイルオプションも持たない唯一のサブコマンドです。

```bash
monodocs init
```

| 書き出すもの          | 内容                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `monodocs.config.yml` | コメント付きの短い出発点（`title`・`lang`・`input`・`output`）。他のキーは既定値のままです。残りは [設定ファイル](/ja/docs/configuration) にあります。 |
| `docs/index.md`       | 最初のページ。既定の `input` が指す場所に置かれます。                                                                                   |

書き出したものは手を入れずにビルドできるので、最初のビルドにもオプションは要りません。

```bash
monodocs init
monodocs build      # -> dist/docs.html
```

**上書きはしません。** どちらかのファイルが既にある場合は*どちらも*書かず、見つかったものをすべて名指しして終了コード `1` で終わります。既にある `docs/` ディレクトリは問題なく、ページはそこにあるものの隣に置かれます。

雛形は [メッセージの言語](#message-language) に従います（コメント、最初のページの文章、設定する `lang` の値）。そのため `monodocs --lang ja init` は `lang: "ja"` の下に日本語の最初のページを書き出します。それ以外では 2 つの設定は独立で、書き出されるファイルの `lang` の位置にもそう書いてあります。別の言語で書くときは、その 1 行を書き換えてください。

## `build`

ドキュメントをビルドして単一の自己完結ファイルを生成します。HTML、PDF、またはその両方（`--format`）です。

```bash
monodocs build [input] [options]
```

| 引数 / オプション       | 既定値                 | 説明                                                       |
| ----------------------- | ---------------------- | ---------------------------------------------------------- |
| `[input]`               | `./docs`               | 走査する入力ディレクトリ、または単一のソースファイル。      |
| `-o, --output <file>`   | `./dist/docs.html`   | 出力ファイルパス。`output.path` を上書き。                 |
| `-c, --config <file>`   | 自動検出               | 設定ファイル。`monodocs.config.yml` があれば使用。         |
| `-f, --format <format>` | `html`                 | 出力形式: `html` \| `pdf` \| `both`。`output.format` を上書き。 |

```bash
# ./docs を ./dist/docs.html にビルド
monodocs build

# 入力と出力を明示
monodocs build ./docs -o ./dist/docs.html

# 設定ファイルを明示
monodocs build ./docs -c ./monodocs.config.yml

# 単一ファイルを 1 ページの文書として出力する
monodocs build ./docs/plan.md --format pdf -o ./dist/plan.pdf
```

成功すると生成ページ数と出力パスを表示します。警告（リンク切れ・タイトル欠落など）は表示されますがビルドは失敗しません。エラーで失敗させたいときは [`validate`](#validate) を、警告でも失敗させたいときは `validate --strict` を使います。唯一の例外は [`fontCheck: error`](/ja/docs/configuration#font-check) で、そのマシンにフォントが無い文字を成果物が抱えることになるビルドを止めます。

## `watch`

入力・設定ファイルの変更を検知するたびに再ビルドします。出力は書き出しますが配信はしません。プレビューサーバが必要なら `serve` を使います。

```bash
monodocs watch [input] [options]
```

| 引数 / オプション     | 既定値               | 説明                                               |
| --------------------- | -------------------- | -------------------------------------------------- |
| `[input]`             | `./docs`             | 監視する入力ディレクトリ、または単一のソースファイル。 |
| `-o, --output <file>` | `./dist/docs.html` | 出力ファイルパス。`output.path` を上書き。         |
| `-c, --config <file>` | 自動検出             | 設定ファイル。`monodocs.config.yml` があれば使用。 |

出力ファイルへの書き込みイベントは無視するため、再ビルドが自分自身を再トリガすることはありません。`Ctrl+C` で停止します。

## `serve`

出力を HTTP で配信し、変更を監視して、ブラウザをライブリロード（Server-Sent Events）します。

```bash
monodocs serve [input] [options]
```

| 引数 / オプション     | 既定値               | 説明                                               |
| --------------------- | -------------------- | -------------------------------------------------- |
| `[input]`             | `./docs`             | 配信する入力ディレクトリ、または単一のソースファイル。 |
| `-o, --output <file>` | `./dist/docs.html` | 出力ファイルパス。`output.path` を上書き。         |
| `-c, --config <file>` | 自動検出             | 設定ファイル。`monodocs.config.yml` があれば使用。 |
| `-p, --port <port>`   | `4173`               | 待ち受けポート番号。                               |
| `-H, --host <host>`   | `127.0.0.1`          | バインドするホスト。マシン外（例: Docker ホスト）から接続を受けるには `0.0.0.0` を指定。 |
| `--open`              | 無効                 | 起動時に既定のブラウザで配信 URL を開きます。      |

```bash
# ./docs を http://127.0.0.1:4173/ で配信
monodocs serve

# 全インターフェースにバインド（例: Docker ホストから見る）してブラウザを開く
monodocs serve ./docs --host 0.0.0.0 --open
```

`Ctrl+C` で停止します。

## `validate`

リンク切れ・画像欠落・タイトル欠落・見出しレベルの飛び・`alt` 属性の無い画像を、**出力を書き出さずに** 検出します。CI 向けです。

```bash
monodocs validate [input] [options]
```

| 引数 / オプション     | 既定値   | 説明                                               |
| --------------------- | -------- | -------------------------------------------------- |
| `[input]`             | `./docs` | 検証する入力ディレクトリ、または単一のソースファイル。 |
| `-c, --config <file>` | 自動検出 | 設定ファイル。`monodocs.config.yml` があれば使用。 |
| `--format <format>`   | `human`  | 報告の形式。`human` または `json`。                |
| `--strict`            | 無効     | エラーだけでなく警告でも失敗させる。               |

```bash
monodocs validate ./docs
```

エラーと警告は標準エラー出力に表示されます。**エラー** が見つかったときに終了コード `1` で終了します。警告だけなら `0` のままで、`⚠ 警告 2 件（20 ページ）。エラーはありません。` と表示します。`--strict` を付けると警告でも失敗します。

```bash
monodocs validate ./docs           # エラーで失敗し、警告は報告する
monodocs validate ./docs --strict  # 警告でも失敗する
```

終了コードは報告の `severity` に従うため、リリースで検査が警告として増えても、通っていたジョブは失敗しません。警告をリリースのゲートにするには、ワークフローで `--strict` を付けてください。

`validate` はビルドと同じパイプラインを走らせるので、`validate` が報告する検査はすべてビルドも報告します（ビルドはそのうえで出力も書き出します）。逆は成り立ちません。PDF を書き出すビルドは、ページ番号の帯に対して下余白が足りない、このマシンのどのフォントも描けない文字がある、といったその作業でしか分からないことも報告します。

> [!NOTE]
> Mermaid はブラウザなしで検証するため、pre-render の実描画や図の構文エラーは `validate` では検査されません。

### ジョブが読める報告 {#json-report}

`--format json` は JSON オブジェクトを 1 つだけ標準出力に出し、ほかには何も出さないので、ワークフローはそのまま解析できます。

```bash
monodocs validate ./docs --format json
```

```json
{
  "schemaVersion": 1,
  "diagnostics": [
    {
      "code": "link/unresolved",
      "severity": "warning",
      "message": "Unresolved link \"nope.md\" in \"index.md:3\".",
      "path": "index.md",
      "line": 3
    }
  ]
}
```

- `schemaVersion` はジョブが解析する形が変わったときだけ変わります。リリースは形を変えずに検査とコードを増やせます。固定するのは monodocs のバージョンではなく `schemaVersion` です。
- `code` は安定しています。`link/unresolved` はこれからもまさにそれを指すので、ジョブはこれで絞り込めます。
- `path` は入力ディレクトリからの相対パス、`line` は monodocs が知っている場合に入ります。

> [!WARNING]
> `message` に一致させないでください。人が読む文で、[`--lang`](#message-language) で翻訳され、リリースをまたいで書き直されます。

## 関連

- [設定ファイル](/ja/docs/configuration) — `monodocs.config.yml` の全キーと、CLI オプションによる上書き。
- [はじめに](/ja/docs/getting-started) — インストールと最初のビルド。
