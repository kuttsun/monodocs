#!/usr/bin/env bash
#
# ローカルプレビュー用ショートカット。依存インストール（初回のみ）とビルドを
# 自動実行してから serve を起動する。中身は scripts/dev.sh に委譲するので
# Docker イメージのビルドやポート公開（既定 4173）はそちらが面倒を見る。
#
# 例:
#   scripts/serve.sh                 # examples/ja（全記法ショーケース）を配信
#   scripts/serve.sh examples/ja   # 入力ディレクトリを明示
#   MONODOCS_PORT=8080 scripts/serve.sh examples/ja --port 8080
#
# 起動後、ホストのブラウザで http://localhost:4173/ を開く（止めるときは Ctrl+C）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="$ROOT/scripts/dev.sh"

# 入力ディレクトリ（省略時はショーケース）。残りは serve への追加引数として渡す。
# 先頭が `-` で始まるとき（例: `serve.sh --open`）はオプションなので DOCS は既定のまま。
DOCS="examples/ja"
if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; then
  DOCS="$1"
  shift
fi

# 依存が未インストールなら install（node_modules があればスキップ）。
# 依存を更新したいときは `scripts/dev.sh pnpm install` を明示実行する。
if [ ! -d "$ROOT/app/node_modules" ]; then
  "$DEV" pnpm install
fi

# 毎回ビルド（テーマアセットの dist コピーを含むため serve 前に必須）。
"$DEV" pnpm build

# コンテナ内の配信をホストへ公開するため --host 0.0.0.0 を付与する。
exec "$DEV" node packages/cli/dist/index.js serve "$DOCS" --host 0.0.0.0 "$@"
