#!/usr/bin/env bash
#
# monodocs 公式サイトを一括ビルドする（すべて Docker 内・ホストを汚さない）。
#
#   1) monodocs CLI 本体をビルド（app/）
#   2) その CLI で同梱 examples を単一 HTML 化し site/public/manual.html に出力（ドッグフーディング）
#   3) VitePress でサイトをビルド（site/.vitepress/dist/）
#
# 使い方:
#   scripts/site-build.sh                     ビルドのみ
#   scripts/site-build.sh preview             ビルド後にプレビュー（http://localhost:4173/）
#   SITE_BASE=/monodocs/ scripts/site-build.sh   project pages 用にサブパス配信
#   MANUAL_SRC=examples/mixed/docs scripts/site-build.sh   デモ入力を差し替え（app/ からの相対）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="$ROOT/scripts/dev.sh"
SITE="$ROOT/scripts/site.sh"

# ドッグフーディングのデモ入力（app/ からの相対。dev.sh は /work/app 基準で動く）。
MANUAL_SRC="${MANUAL_SRC:-examples/docs}"

echo "[site-build] 1/3 monodocs CLI をビルド"
"$DEV" pnpm build

echo "[site-build] 2/3 単一 HTML マニュアルを生成 -> site/public/manual.html"
mkdir -p "$ROOT/site/public"
"$DEV" node packages/cli/dist/index.js build "$MANUAL_SRC" -o ../site/public/manual.html

echo "[site-build] 3/3 VitePress でサイトをビルド"
"$SITE" npm install
"$SITE" npm run docs:build

if [ "${1:-}" = "preview" ]; then
  cat <<'EOF'

[site-build] 完了。プレビューサーバを起動します（http://localhost:4173/）。
EOF
  exec "$SITE" npm run docs:preview
fi

cat <<'EOF'

[site-build] 完了。
  サイト生成物: site/.vitepress/dist/
  併載デモ    : site/public/manual.html

  ローカル確認 : scripts/site.sh npm run docs:preview   (http://localhost:4173/)
  サブパス配信 : SITE_BASE=/monodocs/ scripts/site-build.sh
EOF
