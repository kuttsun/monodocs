# コマンドオプション

monodocs は 1 つの CLI に `build`・`watch`・`serve`・`validate` の 4 つのサブコマンドを持ちます。どのサブコマンドも同じ入力引数を取り、設定ファイルオプションを共有します。それぞれに固有のオプションがいくつか加わります。

```bash
monodocs <command> [input] [options]
```

`[input]` は走査する入力ディレクトリ（既定: `./docs`）です。省略すると `./docs` が使われます。CLI オプションは常に設定ファイルより優先されます。マージ順序や `monodocs.config.yml` の探索場所は [設定ファイル](/ja/docs/configuration) を参照してください。

> ソースから実行する場合は `monodocs` を `node packages/cli/dist/index.js`（必要に応じて `scripts/app.sh` 経由）に読み替えてください。[はじめに](/ja/docs/getting-started) を参照。

## グローバルオプション

| オプション      | 説明                                   |
| --------------- | -------------------------------------- |
| `-V, --version` | バージョンを表示して終了します。       |
| `-h, --help`    | コマンドのヘルプを表示して終了します。 |

```bash
monodocs --help          # トップレベルのヘルプ（全コマンド一覧）
monodocs build --help    # 個別コマンドのヘルプ
```

## `build`

ドキュメントをビルドして単一の自己完結 HTML を生成します。

```bash
monodocs build [input] [options]
```

| 引数 / オプション       | 既定値                 | 説明                                                       |
| ----------------------- | ---------------------- | ---------------------------------------------------------- |
| `[input]`               | `./docs`               | 走査する入力ディレクトリ。                                 |
| `-o, --output <file>`   | `./dist/manual.html`   | 出力ファイルパス。`output.path` を上書き。                 |
| `-c, --config <file>`   | 自動検出               | 設定ファイル。`monodocs.config.yml` があれば使用。         |
| `-f, --format <format>` | `html`                 | 出力形式: `html` \| `pdf` \| `both`。`output.format` を上書き。 |

```bash
# ./docs を ./dist/manual.html にビルド
monodocs build

# 入力と出力を明示
monodocs build ./docs -o ./dist/manual.html

# 設定ファイルを明示
monodocs build ./docs -c ./monodocs.config.yml
```

成功すると生成ページ数と出力パスを表示します。警告（リンク切れ・タイトル欠落など）は表示されますがビルドは失敗しません。問題で失敗させたいときは `validate` を使います。

## `watch`

入力・設定ファイルの変更を検知するたびに再ビルドします。変更のたびに出力を書き出しますが配信はしません。プレビューサーバも必要なら `serve` を使います。

```bash
monodocs watch [input] [options]
```

| 引数 / オプション     | 既定値               | 説明                                               |
| --------------------- | -------------------- | -------------------------------------------------- |
| `[input]`             | `./docs`             | 監視する入力ディレクトリ。                         |
| `-o, --output <file>` | `./dist/manual.html` | 出力ファイルパス。`output.path` を上書き。         |
| `-c, --config <file>` | 自動検出             | 設定ファイル。`monodocs.config.yml` があれば使用。 |

出力ファイルへの書き込みイベントは無視するため、再ビルドが自分自身を再トリガすることはありません。`Ctrl+C` で停止します。

## `serve`

出力を HTTP で配信し、変更を監視して、ブラウザをライブリロード（Server-Sent Events）します。

```bash
monodocs serve [input] [options]
```

| 引数 / オプション     | 既定値               | 説明                                               |
| --------------------- | -------------------- | -------------------------------------------------- |
| `[input]`             | `./docs`             | 配信する入力ディレクトリ。                         |
| `-o, --output <file>` | `./dist/manual.html` | 出力ファイルパス。`output.path` を上書き。         |
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

リンク切れ・画像欠落・タイトル欠落などを **出力を書き出さずに** 検出します。CI 向けで、エラーがあると非ゼロ終了します。

```bash
monodocs validate [input] [options]
```

| 引数 / オプション     | 既定値   | 説明                                               |
| --------------------- | -------- | -------------------------------------------------- |
| `[input]`             | `./docs` | 検証する入力ディレクトリ。                         |
| `-c, --config <file>` | 自動検出 | 設定ファイル。`monodocs.config.yml` があれば使用。 |

```bash
monodocs validate ./docs
```

エラーと警告は標準エラー出力に表示されます。**エラー** が 1 件でもあると終了コード `1` で終了します（警告だけでは失敗しません）。Mermaid はブラウザなしで検証するため、pre-render の実描画や図の構文エラーはここでは検査されません。

## 関連

- [設定ファイル](/ja/docs/configuration) — `monodocs.config.yml` の全キーと、CLI オプションによる上書き。
- [はじめに](/ja/docs/getting-started) — インストールと最初のビルド。
