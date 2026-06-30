#!/usr/bin/env bash
#
# monodocs 公式サイトを一括ビルドする（すべて Docker 内・ホストを汚さない）。
#
#   1) monodocs CLI 本体をビルド（app/）
#   2) その CLI で英日それぞれの examples を単一 HTML 化（ドッグフーディング）
#      英: app/examples/en -> site/public/manual.html      (/manual.html)
#      日: app/examples/ja -> site/public/ja/manual.html   (/ja/manual.html)
#   3) VitePress でサイトをビルド（site/.vitepress/dist/）
#
# 使い方:
#   scripts/site-build.sh                       ビルドのみ
#   scripts/site-build.sh preview               ビルド後にプレビュー（http://localhost:4173/）
#   SITE_BASE=/monodocs/ scripts/site-build.sh  project pages 用にサブパス配信
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/scripts/app.sh"
SITE="$ROOT/scripts/site.sh"

echo "[site-build] 1/3 monodocs CLI をビルド"
"$APP" pnpm build

echo "[site-build] 2/3 単一 HTML マニュアルを生成（英 -> manual.html / 日 -> ja/manual.html）"
mkdir -p "$ROOT/site/public/ja"
# app.sh は /work/app 基準で動くため、入力は app/ からの相対、出力は ../site/... で渡す。
"$APP" node packages/cli/dist/index.js build examples/en -o ../site/public/manual.html
"$APP" node packages/cli/dist/index.js build examples/ja -o ../site/public/ja/manual.html

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
  併載デモ    : site/public/manual.html（英）/ site/public/ja/manual.html（日）

  ローカル確認 : scripts/site.sh npm run docs:preview   (http://localhost:4173/)
  サブパス配信 : SITE_BASE=/monodocs/ scripts/site-build.sh
EOF
