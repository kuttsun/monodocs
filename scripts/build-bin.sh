#!/usr/bin/env bash
#
# monodocs を単一ネイティブ実行ファイル（Node 22 SEA）にビルドするショートカット。
# 専用 Docker イメージ内で esbuild バンドル → SEA 化までを実行する（中身は scripts/dev.sh に委譲）。
#
# 出力: app/dist/monodocs（ホストに node 不要・ビルド環境と同じ OS/arch 向け）。
# 例:
#   scripts/build-bin.sh
#   app/dist/monodocs serve ~/任意のドキュメント --host 127.0.0.1   # 任意ディレクトリを配信
#   app/dist/monodocs build ~/任意のドキュメント -o ~/manual.html
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="$ROOT/scripts/dev.sh"

# 依存が未インストールなら install（esbuild / postject を含む）。
if [ ! -d "$ROOT/app/node_modules" ]; then
  "$DEV" pnpm install
fi

"$DEV" pnpm build:bin

echo ""
echo "✓ Built: app/dist/monodocs"
echo "  例: app/dist/monodocs serve <ドキュメントのディレクトリ>"
