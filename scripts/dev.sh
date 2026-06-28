#!/usr/bin/env bash
#
# monodocs を専用 Docker イメージ（pnpm 焼き込み）内で実行するヘルパー。
# ホストに Node / pnpm を入れず、corepack の都度ダウンロードも発生しない。
#
# 例:
#   scripts/dev.sh pnpm install
#   scripts/dev.sh pnpm build
#   scripts/dev.sh pnpm test
#   scripts/dev.sh pnpm typecheck
#   scripts/dev.sh node packages/cli/dist/index.js serve examples/mixed/docs --host 0.0.0.0
#
# serve のときだけプレビュー用ポート（既定 4173）を公開する。別ポートは MONODOCS_PORT で変更:
#   MONODOCS_PORT=8080 scripts/dev.sh node packages/cli/dist/index.js serve examples/mixed/docs --host 0.0.0.0 --port 8080
set -euo pipefail

IMAGE="monodocs-dev"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${MONODOCS_PORT:-4173}"

# イメージが無ければビルドする（pnpm を焼き込んだ開発イメージ）。
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE from Dockerfile.dev ..." >&2
  docker build -f "$ROOT/Dockerfile.dev" -t "$IMAGE" "$ROOT"
fi

# docker の引数を 1 つの配列に組み立てる（空配列展開の曖昧さを避ける）。
# 生成物（node_modules / dist 等）をホストユーザー所有で書き込むため呼び出しユーザーで実行し、
# HOME は任意 uid でも書き込める /tmp に向ける（pnpm のキャッシュ等用）。
args=(run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp)

# 対話端末があれば -it、無ければ（CI 等）-i のみ。
if [ -t 0 ] && [ -t 1 ]; then args+=(-it); else args+=(-i); fi

# serve のときだけプレビュー用ポートを公開する（build / test がポート競合で失敗しないように）。
for arg in "$@"; do
  if [ "$arg" = "serve" ]; then
    args+=(-p "${PORT}:${PORT}")
    break
  fi
done

args+=(-v "$ROOT:/work" -w /work/app "$IMAGE" "$@")

exec docker "${args[@]}"
