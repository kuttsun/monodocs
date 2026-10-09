#!/usr/bin/env bash
#
# Build the PDF samples the README links to, published next to the single-HTML samples.
#
#   en: examples/en -> site/public/sample.pdf      (/sample.pdf)
#   ja: examples/ja -> site/public/ja/sample.pdf   (/ja/sample.pdf)
#
# Each is the same source as sample.html, printed with a cover and a printed table of contents;
# every body sheet carries the default page-number footer.
#
# Formulas need an OpenType MATH font, which the dev image deliberately lacks (the font-check tests
# rely on a machine without one). The vendored Latin Modern Math is loaded for these builds only,
# through a throwaway HOME whose ~/.fonts fontconfig reads, so nothing is installed anywhere. A build
# that still reports a formula font without a MATH table fails here rather than publishing formulas
# whose brackets do not stretch. (fontCheck: error cannot do this: the examples also use two symbols
# no font in the dev image draws, which stay a warning.)
#
# The monodocs CLI must already be built (the caller runs pnpm build). It runs on its own too:
#   scripts/app.sh pnpm build && scripts/site-pdf-sample.sh
#
# By default it runs inside the dev image. Where Node and Chromium are on the host or in CI, empty
# the runner to run it directly:
#   MONODOCS_RUNNER= scripts/site-pdf-sample.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="${MONODOCS_RUNNER-$ROOT/scripts/app.sh}"

# Either way the working directory is app/ (app.sh runs in /work/app), so paths at the repository
# root are passed with ../ in front.
run() {
  if [ -n "$RUNNER" ]; then
    "$RUNNER" "$@"
  else
    (cd "$ROOT/app" && "$@")
  fi
}

# tmp/ is ignored by git.
WORK="$ROOT/tmp/site-pdf-sample"
rm -rf "$WORK"
mkdir -p "$WORK/home/.fonts" "$ROOT/site/public/ja"
cp "$ROOT/app/packages/core/test-fixtures/fonts/lm-math/opentype/latinmodern-math.otf" "$WORK/home/.fonts/"

printf 'title: "monodocs Sample"\nlang: en\npdf:\n  cover:\n    enabled: true\n  toc:\n    enabled: true\n' \
  > "$WORK/en.yml"
printf 'title: "monodocs サンプル"\nlang: ja\npdf:\n  cover:\n    enabled: true\n  toc:\n    enabled: true\n' \
  > "$WORK/ja.yml"

for lang in en ja; do
  out="site/public/sample.pdf"
  if [ "$lang" = "ja" ]; then out="site/public/ja/sample.pdf"; fi
  # The check below reads the message text, so the CLI speaks English whatever MONODOCS_LANG says.
  log="$WORK/$lang.log"
  run env HOME=../tmp/site-pdf-sample/home node packages/cli/dist/index.js --lang en \
    build "../examples/$lang" -c "../tmp/site-pdf-sample/$lang.yml" -f pdf -o "../$out" 2>&1 \
    | tee "$log"
  if grep -q "no OpenType MATH table" "$log"; then
    echo "[site-pdf-sample] the math font was not picked up for $out" >&2
    exit 1
  fi
done

rm -rf "$WORK"
