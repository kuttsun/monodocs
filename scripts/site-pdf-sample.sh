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
# Formulas are set in the math font monodocs carries (roadmap 6.4), which the dev image, with no math
# font of its own, shows as a reader of the samples gets it. Each PDF must embed that font, read off
# its font descriptors, or the script fails rather than publishing formulas set in whatever the
# machine had. A message would say less: its wording is not frozen, and build prints it with no code.
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
mkdir -p "$WORK" "$ROOT/site/public/ja"

printf 'title: "monodocs Sample"\nlang: en\npdf:\n  cover:\n    enabled: true\n  toc:\n    enabled: true\n' \
  > "$WORK/en.yml"
printf 'title: "monodocs サンプル"\nlang: ja\npdf:\n  cover:\n    enabled: true\n  toc:\n    enabled: true\n' \
  > "$WORK/ja.yml"

for lang in en ja; do
  out="site/public/sample.pdf"
  if [ "$lang" = "ja" ]; then out="site/public/ja/sample.pdf"; fi
  run node packages/cli/dist/index.js \
    build "../examples/$lang" -c "../tmp/site-pdf-sample/$lang.yml" -f pdf -o "../$out"
  if ! run node ../scripts/assert-pdf-fonts.mjs "../$out" --embeds NewCMMath-Book; then
    echo "[site-pdf-sample] the carried math font was not picked up for $out" >&2
    exit 1
  fi
done

rm -rf "$WORK"
