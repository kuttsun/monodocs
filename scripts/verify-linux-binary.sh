#!/usr/bin/env bash
# Verifies a published monodocs Linux x64 release binary on a host without Node.js.
#
# The counterpart of scripts/verify-windows-binary.ps1. They are separate scripts on purpose: a
# Linux host that deliberately has no Node.js should not need PowerShell installed either, and the
# platform-specific checks differ (executable bit and recursive fs.watch here; Mark of the Web and
# Windows path handling there). docs/maintenance.md is where the required checks are recorded; these
# two scripts are its implementations.
#
# What this script deliberately does NOT cover, and still needs a person:
#   * Browser rendering: sidebar, search interaction, dark mode, narrow-width drawer.
#   * `serve --open`, which launches the default browser through xdg-open.
#
# Usage:
#   scripts/verify-linux-binary.sh --version v0.9.0
#   scripts/verify-linux-binary.sh --version 0.9.0 --binary ./monodocs-linux-x64 \
#       --sha256 ./monodocs-linux-x64.sha256 --notices ./monodocs-linux-x64-NOTICES.txt \
#       --source . --port 4183

# No pipefail on purpose: the checks pipe multi-megabyte pages into `grep -q`, which exits at the
# first match and leaves the writer with SIGPIPE. With pipefail that success would read as a failure.
set -u

REPOSITORY="kuttsun/monodocs"
ASSET_NAME="monodocs-linux-x64"
NOTICES_NAME="monodocs-linux-x64-NOTICES.txt"

version=""
work_dir=""
binary_path=""
sha256_path=""
notices_path=""
source_path=""
port=4173
clean=0

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) version="${2:-}"; shift 2 ;;
    --work-dir) work_dir="${2:-}"; shift 2 ;;
    --binary) binary_path="${2:-}"; shift 2 ;;
    --sha256) sha256_path="${2:-}"; shift 2 ;;
    --notices) notices_path="${2:-}"; shift 2 ;;
    --source) source_path="${2:-}"; shift 2 ;;
    --port) port="${2:-}"; shift 2 ;;
    --clean) clean=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

[ -n "$version" ] || { echo "--version is required" >&2; usage 1; }

case "$version" in
  v*) tag="$version"; plain_version="${version#v}" ;;
  *) tag="v$version"; plain_version="$version" ;;
esac

: "${work_dir:=${TMPDIR:-/tmp}/monodocs-verify-$plain_version}"
mkdir -p "$work_dir" || exit 1
work_dir="$(cd "$work_dir" && pwd)"
log_dir="$work_dir/logs"
mkdir -p "$log_dir"

# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------

if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_YELLOW=$'\033[33m'; C_OFF=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_CYAN=""; C_YELLOW=""; C_OFF=""
fi

results=()
run_index=0
serve_pid=""
sse_pid=""
watch_pid=""

section() { printf '\n%s== %s%s\n' "$C_CYAN" "$1" "$C_OFF"; }

record() { results+=("$1|$2|$3"); }

# Each check function writes diagnostics to stderr and returns non-zero on failure. Failures are
# recorded and the run continues, so a single pass reports everything.
#
# The check runs in this shell rather than in a command substitution: the serve and watch checks
# assign the background PIDs that later checks and the exit trap need, and a subshell would strand
# those processes.
run_check() {
  local name="$1"; shift
  local detail status
  local detail_file="$log_dir/.check-detail"
  : >"$detail_file"
  "$@" >/dev/null 2>"$detail_file"
  status=$?
  detail="$(tr '\n' ' ' <"$detail_file")"
  if [ "$status" -eq 0 ]; then
    record PASS "$name" ""
    printf '  %s[PASS]%s %s\n' "$C_GREEN" "$C_OFF" "$name"
  else
    record FAIL "$name" "$detail"
    printf '  %s[FAIL]%s %s\n         %s\n' "$C_RED" "$C_OFF" "$name" "$detail"
  fi
}

fatal() { printf '\n%serror:%s %s\n' "$C_RED" "$C_OFF" "$1" >&2; exit 1; }

# Runs the binary to completion, capturing both streams. Sets bin_status/bin_out/bin_err.
invoke_bin() {
  local cwd="$1"; shift
  run_index=$((run_index + 1))
  local out="$log_dir/run-$(printf '%02d' "$run_index").out.log"
  local err="$log_dir/run-$(printf '%02d' "$run_index").err.log"
  ( cd "$cwd" && "$bin" "$@" ) >"$out" 2>"$err"
  bin_status=$?
  bin_out="$(cat "$out")"
  bin_err="$(cat "$err")"
}

wait_until() {
  local timeout="$1"; shift
  local deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if "$@"; then return 0; fi
    sleep 0.5
  done
  return 1
}

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; }

port_closed() { ! port_open; }

file_contains() { grep -q -- "$2" "$1" 2>/dev/null; }

url_contains() { curl -fsS --max-time 15 "$1" 2>/dev/null | grep -q -- "$2"; }

stop_process() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  # SIGINT is the documented way to stop serve / watch, so use the same path a person would.
  kill -INT "$pid" 2>/dev/null
  local deadline=$(( $(date +%s) + 10 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
  kill -9 "$pid" 2>/dev/null
  return 0
}

cleanup() {
  stop_process "$sse_pid"
  stop_process "$serve_pid"
  stop_process "$watch_pid"
}
trap cleanup EXIT INT TERM

new_marker() { echo "MONODOCS-$1-$$-${RANDOM}"; }

# ---------------------------------------------------------------------------------------------
# Setup: acquire the release asset, verify its checksum, stage the example documents.
# Failures here are fatal -- every later check depends on them.
# ---------------------------------------------------------------------------------------------

printf '%smonodocs %s - Linux x64 release binary verification%s\n' "$C_OFF" "$tag" "$C_OFF"
echo "Work directory: $work_dir"

# The point of this pass is that the release asset runs where Node.js is absent, so say it out loud
# when the host has one. It does not weaken any single check below, only what the run demonstrates.
if command -v node >/dev/null 2>&1; then
  printf '%sNote: node is on PATH. The binary carries its own runtime, but a Node-free host is what this pass is meant to demonstrate.%s\n' "$C_YELLOW" "$C_OFF"
fi

for tool in curl tar sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || fatal "$tool is required"
done

section "Acquiring the release asset"

download_base="https://github.com/$REPOSITORY/releases/download/$tag"
downloaded=0
if [ -n "$binary_path" ]; then
  [ -n "$sha256_path" ] || fatal "--binary requires --sha256"
  bin="$(cd "$(dirname "$binary_path")" && pwd)/$(basename "$binary_path")"
  checksum_file="$(cd "$(dirname "$sha256_path")" && pwd)/$(basename "$sha256_path")"
else
  bin="$work_dir/$ASSET_NAME"
  checksum_file="$bin.sha256"
  echo "  Downloading $ASSET_NAME (about 130 MiB)"
  curl -fsSL -o "$bin" "$download_base/$ASSET_NAME" || fatal "Download failed: $ASSET_NAME"
  curl -fsSL -o "$checksum_file" "$download_base/$ASSET_NAME.sha256" || fatal "Download failed: $ASSET_NAME.sha256"
  downloaded=1
fi

if [ -n "$notices_path" ]; then
  notices_file="$(cd "$(dirname "$notices_path")" && pwd)/$(basename "$notices_path")"
else
  notices_file="$work_dir/$NOTICES_NAME"
  curl -fsSL -o "$notices_file" "$download_base/$NOTICES_NAME" || fatal "Download failed: $NOTICES_NAME"
fi

# sha256sum format: "<hash>  <file name>".
expected_hash="$(awk 'NR==1 {print tolower($1)}' "$checksum_file")"
actual_hash="$(sha256sum "$bin" | awk '{print tolower($1)}')"
if [ "$expected_hash" != "$actual_hash" ]; then
  fatal "SHA-256 mismatch. Published: $expected_hash / downloaded: $actual_hash"
fi
record PASS "SHA-256 matches the published checksum" ""
printf '  %s[PASS]%s SHA-256 matches the published checksum (%s)\n' "$C_GREEN" "$C_OFF" "$actual_hash"

# Unlike Windows, which decides executability by extension, a downloaded release asset arrives
# without the executable bit. Note it, then set it -- users have to do the same.
if [ "$downloaded" -eq 1 ] && [ ! -x "$bin" ]; then
  echo "  The downloaded asset is not executable yet; applying chmod +x (as the documentation tells users to)"
fi
chmod +x "$bin" || fatal "Could not make $bin executable"

section "Staging example documents"

if [ -n "$source_path" ]; then
  examples_root="$(cd "$source_path" && pwd)/examples"
else
  archive="$work_dir/monodocs-$plain_version-source.tar.gz"
  extract_root="$work_dir/source"
  [ -f "$archive" ] || curl -fsSL -o "$archive" "https://github.com/$REPOSITORY/archive/refs/tags/$tag.tar.gz" \
    || fatal "Download failed: source archive"
  rm -rf "$extract_root"
  mkdir -p "$extract_root"
  tar -xzf "$archive" -C "$extract_root" || fatal "Could not extract the source archive"
  examples_root="$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | head -1)/examples"
fi
[ -d "$examples_root/en" ] || fatal "examples/en not found under $examples_root"

# Independent copies so that the serve and watch edits cannot interfere with each other.
docs_en="$work_dir/docs-en"
docs_serve="$work_dir/docs-serve"
docs_watch="$work_dir/docs-watch"
for pair in "en:$docs_en" "ja:$docs_serve" "ja:$docs_watch"; do
  locale="${pair%%:*}"; destination="${pair#*:}"
  rm -rf "$destination"
  cp -r "$examples_root/$locale" "$destination" || fatal "Could not stage $destination"
done
echo "  Staged docs-en / docs-serve / docs-watch"

# ---------------------------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------------------------

section "Basic commands"

check_version() {
  invoke_bin "$work_dir" --version
  [ "$bin_status" -eq 0 ] || { echo "Exit code $bin_status: $bin_err" >&2; return 1; }
  [ "$(echo "$bin_out" | tr -d '[:space:]')" = "$plain_version" ] || { echo "Reported '$bin_out'" >&2; return 1; }
}
run_check "--version reports $plain_version" check_version

check_help() {
  invoke_bin "$work_dir" --help
  [ "$bin_status" -eq 0 ] || { echo "Exit code $bin_status: $bin_err" >&2; return 1; }
  for command in build watch serve validate; do
    echo "$bin_out" | grep -qE "^[[:space:]]+$command\b" || { echo "Missing '$command' in help output" >&2; return 1; }
  done
}
run_check "--help lists build / watch / serve / validate" check_help

check_validate() {
  invoke_bin "$work_dir" validate "$docs_en"
  [ "$bin_status" -eq 0 ] || { echo "Exit code $bin_status: $bin_err" >&2; return 1; }
  echo "$bin_out" | grep -q "No issues found" || { echo "Unexpected output: $bin_out" >&2; return 1; }
}
run_check "validate reports no issues for examples/en" check_validate

section "Build output"

default_build_dir="$work_dir/build-default"
mkdir -p "$default_build_dir"
default_output="$default_build_dir/dist/docs.html"

check_default_output() {
  invoke_bin "$default_build_dir" build "$docs_en"
  [ "$bin_status" -eq 0 ] || { echo "Exit code $bin_status: $bin_err" >&2; return 1; }
  [ -f "$default_output" ] || { echo "dist/docs.html was not created" >&2; return 1; }
  # 0.9.0 renamed the default output; make sure the old name is really gone.
  [ ! -f "$default_build_dir/dist/manual.html" ] || { echo "dist/manual.html was created" >&2; return 1; }
}
run_check "build without -o writes dist/docs.html" check_default_output

check_self_contained() {
  file_contains "$default_output" "__MONODOCS_DATA__" || { echo "Embedded document payload not found" >&2; return 1; }
  file_contains "$default_output" "data-route" || { echo "No pages were rendered" >&2; return 1; }
  if grep -qE 'src="https?://' "$default_output"; then echo "External asset reference found" >&2; return 1; fi
}
run_check "HTML output is self-contained" check_self_contained

check_spaces_in_path() {
  local awkward_dir="$work_dir/verify output dir"
  mkdir -p "$awkward_dir"
  invoke_bin "$awkward_dir" build "$docs_en" -o "$awkward_dir/spaced docs.html"
  [ "$bin_status" -eq 0 ] || { echo "Exit code $bin_status: $bin_err" >&2; return 1; }
  [ -f "$awkward_dir/spaced docs.html" ] || { echo "Output file was not created" >&2; return 1; }
}
run_check "build succeeds from a path containing spaces" check_spaces_in_path

section "Browser-dependent features fail as designed"

check_pdf_fails() {
  local pdf_dir="$work_dir/build-pdf"
  mkdir -p "$pdf_dir"
  invoke_bin "$pdf_dir" build "$docs_en" --format pdf -o "$pdf_dir/docs.pdf"
  [ "$bin_status" -ne 0 ] || { echo "The binary produced a PDF instead of failing" >&2; return 1; }
  [ ! -f "$pdf_dir/docs.pdf" ] || { echo "A PDF file was written" >&2; return 1; }
  # The standalone branch of the message must win: users of the binary have no Node.js.
  echo "$bin_err" | grep -q "npm install -g monodocs" || { echo "Unexpected message: $bin_err" >&2; return 1; }
  if echo "$bin_err" | grep -q "pnpm add puppeteer-core"; then
    echo "Got the npm-package guidance, not the standalone one" >&2
    return 1
  fi
}
run_check "PDF output fails and points at the npm build" check_pdf_fails

check_prerender_fails() {
  local prerender_dir="$work_dir/build-prerender"
  mkdir -p "$prerender_dir"
  printf 'mermaid:\n  mode: pre-render\n' >"$prerender_dir/pre-render.yml"
  invoke_bin "$prerender_dir" build "$docs_en" -c "$prerender_dir/pre-render.yml" -o "$prerender_dir/pre.html"
  [ "$bin_status" -ne 0 ] || { echo "Pre-render succeeded without a browser" >&2; return 1; }
  echo "$bin_err" | grep -q "npm install -g monodocs" || { echo "Unexpected message: $bin_err" >&2; return 1; }
}
run_check "Mermaid pre-render fails and points at the npm build" check_prerender_fails

section "Redistribution notices"

check_notices() {
  local needle
  for needle in "MIT License" "Node.js runtime" "Components:"; do
    grep -qF "$needle" "$notices_file" || { echo "Missing '$needle'" >&2; return 1; }
  done
  if grep -qF -- "—  UNKNOWN" "$notices_file"; then echo "Unresolved license entry found" >&2; return 1; fi
}
run_check "NOTICES covers monodocs, the Node.js runtime, and dependencies" check_notices

section "serve (long-running; out of scope for verify-published.yml)"

serve_dir="$work_dir/serve"
mkdir -p "$serve_dir"
serve_url="http://127.0.0.1:$port/"
serve_log="$log_dir/serve.out.log"
serve_err="$log_dir/serve.err.log"
sse_body="$log_dir/serve-sse.txt"
sse_headers="$log_dir/serve-sse-headers.txt"

check_serve_starts() {
  if port_open; then echo "Port $port is already in use; rerun with --port" >&2; return 1; fi
  # `exec` so that $! is the binary itself: without it the recorded PID is the subshell, SIGINT never
  # reaches serve, and killing the subshell would strand a process holding the port.
  ( cd "$serve_dir" && exec "$bin" serve "$docs_serve" -p "$port" ) >"$serve_log" 2>"$serve_err" &
  serve_pid=$!
  wait_until 90 file_contains "$serve_log" "Serving at" \
    || { echo "serve did not report a listening URL: $(cat "$serve_err")" >&2; return 1; }
  wait_until 30 port_open || { echo "Port $port never opened" >&2; return 1; }
  local body
  body="$(curl -fsS --max-time 15 "$serve_url")" || { echo "Could not fetch $serve_url" >&2; return 1; }
  echo "$body" | grep -q "__MONODOCS_DATA__" || { echo "Served page has no document payload" >&2; return 1; }
  echo "$body" | grep -q "EventSource" || { echo "Live reload script was not injected" >&2; return 1; }
  echo "$body" | grep -q "__monodocs-livereload" || { echo "Live reload endpoint not referenced" >&2; return 1; }
}
run_check "serve starts on port $port and injects live reload" check_serve_starts

check_live_reload() {
  [ -n "$serve_pid" ] || { echo "serve is not running" >&2; return 1; }
  # Reading the SSE endpoint directly proves the reload broadcast without driving a browser.
  curl -sN -D "$sse_headers" "${serve_url}__monodocs-livereload" >"$sse_body" 2>/dev/null &
  sse_pid=$!
  wait_until 15 test -s "$sse_headers" || { echo "No response headers from the live reload endpoint" >&2; return 1; }
  grep -qi "content-type: *text/event-stream" "$sse_headers" \
    || { echo "Unexpected live reload headers: $(cat "$sse_headers")" >&2; return 1; }

  local marker
  marker="$(new_marker SERVE)"
  printf '\n\n## %s\n' "$marker" >>"$docs_serve/index.md"
  wait_until 90 file_contains "$sse_body" "data: reload" \
    || { echo "No reload event on the live reload stream" >&2; return 1; }
  wait_until 30 url_contains "$serve_url" "$marker" || { echo "Served page never picked up the edit" >&2; return 1; }
  file_contains "$serve_log" "Rebuilt" || { echo "No rebuild was reported on stdout" >&2; return 1; }
}
run_check "live reload broadcasts a rebuild over SSE and serves the new content" check_live_reload

check_serve_stops() {
  stop_process "$sse_pid"; sse_pid=""
  stop_process "$serve_pid"; serve_pid=""
  wait_until 15 port_closed || { echo "Port $port stayed open" >&2; return 1; }
}
run_check "serve releases the port when it stops" check_serve_stops

section "watch (long-running; out of scope for verify-published.yml)"

watch_dir="$work_dir/watch"
mkdir -p "$watch_dir"
watch_output="$watch_dir/out/watch.html"
watch_log="$log_dir/watch.out.log"
watch_err="$log_dir/watch.err.log"

check_watch_starts() {
  ( cd "$watch_dir" && exec "$bin" watch "$docs_watch" -o "$watch_output" ) >"$watch_log" 2>"$watch_err" &
  watch_pid=$!
  wait_until 90 test -f "$watch_output" || { echo "No initial build: $(cat "$watch_err")" >&2; return 1; }
  wait_until 30 file_contains "$watch_log" "Watching for changes" || { echo "watch never reported that it is watching" >&2; return 1; }
  file_contains "$watch_log" "Generated" || { echo "No build summary was reported" >&2; return 1; }
}
run_check "watch performs the initial build and keeps watching" check_watch_starts

# Edits a file in a subdirectory rather than at the top level: on Linux the recursive fs.watch
# implementation differs from the Windows one, and a top-level edit would not exercise it.
check_watch_rebuilds_nested() {
  [ -n "$watch_pid" ] || { echo "watch is not running" >&2; return 1; }
  local nested marker
  nested="$(find "$docs_watch" -mindepth 2 -name '*.md' | head -1)"
  [ -n "$nested" ] || { echo "No nested Markdown file to edit" >&2; return 1; }
  marker="$(new_marker WATCH)"
  printf '\n\n## %s\n' "$marker" >>"$nested"
  wait_until 90 file_contains "$watch_output" "$marker" \
    || { echo "Output never picked up the edit to ${nested#"$docs_watch"/}" >&2; return 1; }
}
run_check "watch rebuilds after an edit in a subdirectory (recursive fs.watch)" check_watch_rebuilds_nested

check_watch_stops() {
  stop_process "$watch_pid"; watch_pid=""
}
run_check "watch stops on SIGINT" check_watch_stops

# ---------------------------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------------------------

section "Summary"

failed=0
for entry in "${results[@]}"; do
  status="${entry%%|*}"; rest="${entry#*|}"; name="${rest%%|*}"; detail="${rest#*|}"
  printf '%-6s %s\n' "$status" "$name"
  [ -n "$detail" ] && printf '       %s\n' "$detail"
  [ "$status" = "FAIL" ] && failed=$((failed + 1))
done
printf '\n%d passed, %d failed\n' "$(( ${#results[@]} - failed ))" "$failed"

printf '\n%sStill to check by hand:%s\n' "$C_YELLOW" "$C_OFF"
echo "  1. Open $default_output in a browser: sidebar, previous/next navigation, search (kana"
echo "     folding, highlighting, arrow keys and Enter), dark mode, and the drawer at a narrow"
echo "     window width."
echo "  2. serve --open, which launches the default browser through xdg-open."

if [ "$failed" -eq 0 ] && [ "$clean" -eq 1 ]; then
  rm -rf "$work_dir"
  printf '\nRemoved %s\n' "$work_dir"
else
  printf '\nLogs and build outputs: %s\n' "$work_dir"
fi

[ "$failed" -eq 0 ]
