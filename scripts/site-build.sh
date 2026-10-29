#!/usr/bin/env bash
#
# monodocs 公式サイトを一括ビルドする（すべて Docker 内・ホストを汚さない）。
#
#   1) monodocs CLI 本体をビルド（app/）
#   2) その CLI で英日それぞれの examples を単一 HTML 化（ドッグフーディング）
#      英: examples/en -> site/public/sample.html      (/sample.html)
#      日: examples/ja -> site/public/ja/sample.html   (/ja/sample.html)
#      Two versions of examples/diff compared, as a difference from an earlier version (7.3):
#      en: examples/diff/en/{earlier,current} -> site/public/diff-sample.html      (/diff-sample.html)
#      ja: examples/diff/ja/{earlier,current} -> site/public/ja/diff-sample.html   (/ja/diff-sample.html)
#   3) Print the same examples as PDFs with a cover and contents (scripts/site-pdf-sample.sh)
#      en: examples/en -> site/public/sample.pdf      (/sample.pdf)
#      ja: examples/ja -> site/public/ja/sample.pdf   (/ja/sample.pdf)
#      版面密度（pdf.density）の比較サンプルを生成（scripts/site-density.sh）
#      英: site/samples/density/print-density.en.md -> site/public/density/*.pdf|png
#      日: site/samples/density/print-density.ja.md -> site/public/ja/density/*.pdf|png
#   4) VitePress でサイトをビルド（site/.vitepress/dist/）
#
# 使い方:
#   scripts/site-build.sh                       ビルドのみ
#   scripts/site-build.sh preview               ビルド後にプレビュー（http://localhost:4173/）
#   SITE_BASE=/monodocs/ scripts/site-build.sh  project pages 用にサブパス配信
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/scripts/app.sh"
SITE="$ROOT/scripts/site.sh"

echo "[site-build] 1/4 monodocs CLI をビルド"
"$APP" pnpm build

echo "[site-build] 2/4 単一 HTML サンプルを生成（英 -> sample.html / 日 -> ja/sample.html）"
mkdir -p "$ROOT/site/public/ja"
# app.sh は /work/app 基準で動くため、examples も site もルート直下＝../ を付けて渡す。
"$APP" node packages/cli/dist/index.js build ../examples/en -o ../site/public/sample.html
"$APP" node packages/cli/dist/index.js build ../examples/ja -o ../site/public/ja/sample.html
# The difference is built from the new version's directory, whose counterpart --diff-from-dir names.
for lang in en ja; do
  out="site/public/diff-sample.html"
  [ "$lang" = ja ] && out="site/public/ja/diff-sample.html"
  "$APP" sh -c "cd ../examples/diff/$lang/current && node ../../../../app/packages/cli/dist/index.js build . --diff-from-dir ../earlier -o ../../../../$out"
done

echo "[site-build] 3/4 PDF サンプル（sample.pdf / ja/sample.pdf）と版面密度の比較サンプルを生成"
"$ROOT/scripts/site-pdf-sample.sh"
"$ROOT/scripts/site-density.sh"

echo "[site-build] 4/4 VitePress でサイトをビルド"
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
  併載デモ    : site/public/sample.html（英）/ site/public/ja/sample.html（日）
  差分デモ    : site/public/diff-sample.html（英）/ site/public/ja/diff-sample.html（日）
  PDF サンプル: site/public/sample.pdf（英）/ site/public/ja/sample.pdf（日）
  密度サンプル: site/public/density/（英）/ site/public/ja/density/（日）

  ローカル確認 : scripts/site.sh npm run docs:preview   (http://localhost:4173/)
  サブパス配信 : SITE_BASE=/monodocs/ scripts/site-build.sh
EOF
