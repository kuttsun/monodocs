#!/usr/bin/env bash
#
# monodocs 本体（app/）の配布物＝単一ネイティブ実行ファイル（Node 22 SEA）をビルドする
# ショートカット。専用 Docker イメージ内で esbuild バンドル → SEA 化までを実行する
# （中身は scripts/app.sh に委譲）。tsc コンパイルだけなら `scripts/app.sh pnpm build`。
#
# 出力: app/dist/monodocs（ホストに node 不要・ビルド環境と同じ OS/arch 向け）。
# 例:
#   scripts/app-build.sh
#   app/dist/monodocs serve ~/任意のドキュメント --host 127.0.0.1   # 任意ディレクトリを配信
#   app/dist/monodocs build ~/任意のドキュメント -o ~/manual.html
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/scripts/app.sh"

# 依存が未インストールなら install（esbuild / postject を含む）。
if [ ! -d "$ROOT/app/node_modules" ]; then
  "$APP" pnpm install
fi

"$APP" pnpm build:bin

echo ""
echo "✓ Built: app/dist/monodocs"
echo "  例: app/dist/monodocs serve <ドキュメントのディレクトリ>"
