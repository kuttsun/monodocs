#!/usr/bin/env bash
#
# 版面密度（pdf.density）の比較サンプルを生成する。
#
# 同じ原稿・同じ用紙・同じ余白で密度だけを変えた PDF を言語ごとに 4 本組み、各 PDF の
# 1 ページ目をそのままサムネイル画像にする。サイトの設定リファレンスがこれを並べて見せる。
#
#   英: site/samples/density/print-density.en.md -> site/public/density/*.pdf, *.png
#   日: site/samples/density/print-density.ja.md -> site/public/ja/density/*.pdf, *.png
#
# monodocs CLI がビルド済みであることが前提（呼び出し側が pnpm build を済ませる）。
# 単体で実行することもできる:
#   scripts/app.sh pnpm build && scripts/site-density.sh
#
# 既定は開発イメージの中で実行する（ホストに Node も poppler も要らない）。ホストや CI に
# Node と pdftoppm が直接ある場合は、実行の受け皿を空にしてそのまま走らせる:
#   MONODOCS_RUNNER= scripts/site-density.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="${MONODOCS_RUNNER-$ROOT/scripts/app.sh}"

# どちらの経路でも作業ディレクトリは app/ に揃える（app.sh は -w /work/app で動く）。
# そのため site も tmp もルート直下＝../ を付けて渡す。
run() {
  if [ -n "$RUNNER" ]; then
    "$RUNNER" "$@"
  else
    (cd "$ROOT/app" && "$@")
  fi
}

# 密度以外は変えない、が比較の前提なので、設定は密度だけが違う一時ファイルとして起こす
# （tmp/ は .gitignore 済み）。
WORK="$ROOT/tmp/site-density"
rm -rf "$WORK"
mkdir -p "$WORK" "$ROOT/site/public/density" "$ROOT/site/public/ja/density"

for density in relaxed normal compact tight; do
  printf 'title: "Print density"\nlang: en\npdf:\n  density: %s\n' "$density" \
    > "$WORK/en-$density.yml"
  printf 'title: "版面の密度"\nlang: ja\npdf:\n  density: %s\n' "$density" \
    > "$WORK/ja-$density.yml"
  for lang in en ja; do
    dir="site/public/density"
    if [ "$lang" = "ja" ]; then dir="site/public/ja/density"; fi
    run node packages/cli/dist/index.js build \
      "../site/samples/density/print-density.$lang.md" \
      -c "../tmp/site-density/$lang-$density.yml" \
      -f pdf -o "../$dir/$density.pdf"
    # サムネイルは配る PDF そのものの 1 ページ目。HTML を印刷プレビューで撮り直すと、
    # 実際にダウンロードされるものとは別物を見せることになる。
    run pdftoppm -f 1 -l 1 -png -singlefile -scale-to-x 520 -scale-to-y -1 \
      "../$dir/$density.pdf" "../$dir/$density"
  done
done

rm -rf "$WORK"
