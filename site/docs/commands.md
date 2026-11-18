# Command Options

monodocs is a single CLI with six subcommands: `init`, `build`, `watch`, `serve`, `validate`, and `help`. The four that read documents share the optional input argument and the config-file option, plus a few options of their own; `init` takes neither. `help [command]` prints the help for a command, as `<command> --help` does.

```bash
monodocs <command> [input] [options]
```

`[input]` is the directory to scan, or a single source file (default: `./docs`). Given a file, monodocs bundles that one page and uses the directory holding it as the base for links, images, and `monodocs.config.yml`. CLI options always override the config file; see [Configuration](/docs/configuration) for the merge order and where `monodocs.config.yml` is looked up.

> [!TIP]
> When running from source, replace `monodocs` with `node packages/cli/dist/index.js` (optionally via `scripts/app.sh`). See [Getting Started](/docs/getting-started).

## Global options

| Option           | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `-V, --version`  | Print the version and exit.                                              |
| `-h, --help`     | Show help for the command and exit.                                      |
| `--lang <lang>`  | Language of monodocs' own messages: `en` (default) or `ja`. See below.    |

```bash
monodocs --help          # top-level help (lists all commands)
monodocs build --help    # help for a single command
monodocs help build      # the same
```

### Message language {#message-language}

Everything monodocs prints (`--help`, errors, warnings) is English by default. Choose Japanese per
command or for a whole shell or CI job:

```bash
monodocs --lang ja build ./docs
MONODOCS_LANG=ja monodocs build ./docs
```

- The flag wins over the environment variable, which wins over the default.
- An unsupported value is rejected with a list of the supported ones; it never falls back silently to
  English.
- `LANG` and `LC_ALL` are deliberately **not** consulted, so a build log does not depend on the machine
  that produced it.
- This is separate from [`lang`](configuration#lang) in the configuration file, which describes the
  document being built, not the terminal building it.

> [!NOTE]
> A message passed through unwrapped from a dependency (the body of a Zod schema error, a Puppeteer
> stack trace) stays in that dependency's language; where monodocs wraps one, the wrapper is
> translated. Common argument-parser errors (unknown option or command, missing argument) are
> translated; a rarer one monodocs cannot rebuild keeps the parser's wording.

## `init`

Writes a configuration and a first page to start from. It is the one subcommand with no input argument and no config option.

```bash
monodocs init
```

| Writes                | Contents                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `monodocs.config.yml` | A short commented starting point — `title`, `lang`, `input`, `output`. Every other key keeps its default; the rest of them are in [Configuration](/docs/configuration). |
| `docs/index.md`       | A first page, at the path the default `input` already points at.                                                                                       |

What it writes builds unedited, so the first build needs no options either:

```bash
monodocs init
monodocs build      # -> dist/docs.html
```

**It never overwrites.** When either file is already there it writes *neither*, names everything it found, and exits with code `1`. An existing `docs/` directory is fine; the page is added beside what is there.

The scaffold follows the [message language](#message-language): its comments, the first page's text, and the `lang` it sets. `monodocs --lang ja init` therefore writes a Japanese first page under `lang: "ja"`. Otherwise the two settings are independent, as the generated file notes next to `lang`; to document in another language, change that one line.

## `build`

Builds the documentation into a single self-contained file: HTML, PDF, or both (`--format`).

```bash
monodocs build [input] [options]
```

| Argument / Option       | Default                | Description                                                  |
| ----------------------- | ---------------------- | ------------------------------------------------------------ |
| `[input]`               | `./docs`               | Input directory to scan, or a single source file.            |
| `-o, --output <path>`   | by format              | Output path: a file under `html` and `pdf`, a directory under `both`. Overrides `output.path`. See [below](#output-path). |
| `-c, --config <file>`   | auto-detected          | Config file. Uses `monodocs.config.yml` if present.          |
| `-f, --format <format>` | `html`                 | Output format: `html` \| `pdf` \| `both`. Overrides `output.format`. |
| `--diff-from <ref>` | — | Write the difference from an earlier version, a git ref, into the HTML. See [below](#difference). |
| `--diff-from-dir <dir>` | — | Write the difference from an earlier version, read from a directory that stands for the current one. See [below](#difference). |

```bash
# Build ./docs into ./dist/docs.html
monodocs build

# Explicit input and output
monodocs build ./docs -o ./dist/docs.html

# Use a specific config file
monodocs build ./docs -c ./monodocs.config.yml

# A single file, as a one-page document
monodocs build ./docs/plan.md --format pdf -o ./dist/plan.pdf
```

### Where the output goes {#output-path}

What `-o` (or `output.path`) names, and its default, depend on the output format:

| Format | `-o` / `output.path` names | Default |
| ------ | -------------------------- | ------- |
| `html` | the HTML file | `./dist/docs.html` |
| `pdf`  | the PDF file | `./dist/docs.pdf` |
| `both` | a directory, which receives `docs.html` and `docs.pdf` | `./dist` |

Under `both` the path is always read as a directory, even one whose name has a dot in it such as `dist/v1.0`: `-o ./dist/docs.html` writes `./dist/docs.html/docs.html` and `./dist/docs.html/docs.pdf`.

On success it prints the number of pages generated and the output path. Warnings (e.g. broken links, missing titles) are printed but do not fail the build; an error (e.g. a missing input, two pages on one route) stops it with exit code `1`. Three settings turn a finding that is otherwise a warning into an error that stops the build: [`fontCheck: error`](/docs/configuration#font-check), for characters this machine has no font for; [`assets.onLargeImage: error`](/docs/configuration#assets), for an image larger than `assets.maxInlineSize`; and [`assets.onBudget: error`](/docs/configuration#assets), for an output larger than `assets.budget`. To check without writing any output, use [`validate`](#validate); `validate --strict` fails on a warning as well.

### The difference from an earlier version {#difference}

When a revised document is handed over, `--diff-from` and `--diff-from-dir` build the HTML with the difference from an earlier version written into it, for readers who do not look at Git. See the <a href="../diff-sample.html" target="_blank" rel="noopener">difference sample</a>.

```bash
# The earlier version as a git tag, branch, or commit
monodocs build ./docs -o ./dist/docs.html --diff-from v1.2

# The earlier version as a directory
monodocs build ./docs -o ./dist/docs.html --diff-from-dir ../project-1.2
```

What the reader gets:

- **The list of changes**, the page the document opens on unless [`html.diffViewDefault`](/docs/configuration#html) opens it in a version's own view: added, moved, changed, and deleted pages, each linking to its page with how many blocks were added, deleted, and changed in it, and the number of unchanged pages. Its title names the two versions by their [`document.version`](/docs/configuration#document); an earlier version without one is named by the argument as written (`v1.2`, `../project-1.2`).
- **A changed page side by side**: the earlier page on the left and the new one on the right, with what they share lined up, deleted blocks marked in the left column and added ones in the right. A page that did not change is shown once. A deleted page is a page of its own, where it stood in the earlier sidebar; an added page carries a note.
- **A changed block**: a deleted block of text, code, a table row, a display formula, or a diagram, and the added one that took its place, of the same kind in the same place, are one block with the difference inside it, lined up with its earlier self — the deleted words struck through in the left column, the added ones underlined in the right, and a changed line of code marked by a band rather than struck or underlined. A paragraph, a heading, a list item, or a caption is compared word by word, and Chinese and Japanese character by character; code by line; a table row cell by cell, when its cells keep their number, kind, and span; a display formula or a diagram is shown old and new whole, side by side in one column. A block of text or code that keeps less than half of itself stays a deletion and an addition.
- **One column**, the **Inline** view: the new version with each deleted block written back where it stood, struck through, beside the added blocks, underlined — one document to read through, as with tracked changes. A changed block is shown once, its deleted words put back before the added ones.
- **A bar fixed at the top** with four views — side by side, inline, the earlier version, the new version — and previous/next buttons that walk every change with a count. A version's own view shows that version plain; **Show changes** marks its changes. Search covers the version the view reads: the earlier one in its own view, the new one otherwise. The document opens side by side, or in the view [`html.diffViewDefault`](/docs/configuration#html) names; a view the reader chooses is not kept.
- **The sidebar** marks added pages green with `+`, deleted pages red with `−`, changed pages orange with `•`, and moved pages blue with `→`. In a version's own view it is that version's sidebar.

A block is compared by what it reads as: a link's target, emphasis, a table's frame, and the numbers the build generates (sections, figures, footnotes) are not differences. A page moved to a new route is matched through [`aliases`](/docs/configuration#aliases); otherwise it is a deletion and an addition.

**How the earlier version is found.** Both versions are built by this monodocs, the earlier one from its own sources:

- `--diff-from <ref>` reads the files a checkout of the ref would give, from the repository the current directory is in, without touching its working tree, index, or refs. It needs `git` on `PATH`, and, in CI, the history: check out with `fetch-depth: 0`. Files stored in LFS need git-lfs; a page, include, or image that comes out as an LFS pointer is `diff/lfs-pointer`. Submodules come out empty, as in a checkout without `--recurse-submodules`.
- `--diff-from-dir <dir>` names the earlier version's counterpart of the **current directory**, not of the input: run from a project's root with `./docs` as the input, `--diff-from-dir ../project-1.2` reads `../project-1.2/docs`. The input argument and `-c` are mapped the same way. Its name in the output is the path as written, so prefer a relative path or a `document.version`.
- The earlier version uses its own configuration for what the document contains — `input`, `root`, `sources.*`, `sidebar.mode`, `sidebar.items`, `sidebar.titleFrom`, `sidebar.titleTransform`, `sidebar.flattenSingleChild`, `math.enabled`, `mermaid.enabled` — and the new one for how the output looks. A path the earlier version does not have, or one that leaves it, is `diff/outside-version`: a version whose document directory was later renamed is passed as a copy laid out as the new one, with `--diff-from-dir`.
- Warnings from the earlier build are not reported, since a released version cannot be fixed; an error in it stops the build.

The two options cannot be used together (`diff/conflicting-options`), exist on `build` only, and have no key in the configuration file: what to compare against belongs to the build. How the difference is shown belongs to the document, and is the key `html.diffViewDefault`. The difference is HTML only: with a PDF output, from `-f pdf`, `-f both`, or `output.format`, the build stops with `diff/unsupported`. A PDF cannot switch views as the HTML does, so the difference in PDF is deferred past 1.0. The wording of the bar, the list, and the notes follows `lang`, like every other UI label (English, or Japanese under `lang: ja`), and can be changed with [`html.labels`](/docs/configuration#html-labels); the [size report](/docs/configuration#assets) gains a `difference` line.

## `watch`

Rebuilds whenever an input or config file changes. It writes the output but does not serve it; use `serve` for a preview server.

```bash
monodocs watch [input] [options]
```

| Argument / Option     | Default              | Description                                         |
| --------------------- | -------------------- | --------------------------------------------------- |
| `[input]`             | `./docs`             | Input directory, or a single source file, to watch. |
| `-o, --output <file>` | by format            | Output path, read as for `build` (see [Where the output goes](#output-path)). Overrides `output.path`. |
| `-c, --config <file>` | auto-detected        | Config file. Uses `monodocs.config.yml` if present. |

`watch` has no `--format`: it writes the format `output.format` sets, HTML by default. Writes to the output file are ignored, so a rebuild never re-triggers itself. Press `Ctrl+C` to stop.

> [!NOTE]
> On Linux, watching takes an inotify instance, and the number a user may hold (`fs.inotify.max_user_instances`, often 128) is shared with every program they run, editors and browsers included. With none left, `watch` and `serve` stop with `EMFILE: too many open files, watch`. Check the limit with `cat /proc/sys/fs/inotify/max_user_instances` and raise it with `sudo sysctl fs.inotify.max_user_instances=1024`; to keep it across reboots, put `fs.inotify.max_user_instances = 1024` in a file under `/etc/sysctl.d/`. A Docker container that runs as the host user's UID, as the repository's development scripts do, shares the limit with that user. Watching also takes one inotify watch per directory and file under the input, from a second limit, `fs.inotify.max_user_watches`; with none of those left, part of the tree goes unwatched. Only a watch that fails after watching has started, such as one for a directory added later, is reported; one that fails while watching is being set up goes unnoticed, so raise this limit too if changes under the input are missed.

## `serve`

Serves the output over HTTP, watches for changes, and live-reloads the browser (via server-sent events).

```bash
monodocs serve [input] [options]
```

| Argument / Option     | Default              | Description                                         |
| --------------------- | -------------------- | --------------------------------------------------- |
| `[input]`             | `./docs`             | Input directory, or a single source file, to serve. |
| `-o, --output <file>` | `./dist/docs.html`   | The HTML file to write and serve. Overrides `output.path`. |
| `-c, --config <file>` | auto-detected        | Config file. Uses `monodocs.config.yml` if present. |
| `-p, --port <port>`   | `4173`               | Port to listen on.                                  |
| `-H, --host <host>`   | `127.0.0.1`          | Host to bind. Use `0.0.0.0` to accept connections from outside the machine (e.g. from a Docker host). |
| `--open`              | off                  | Open the served URL in your default browser on start. |

```bash
# Serve ./docs at http://127.0.0.1:4173/
monodocs serve

# Bind all interfaces (e.g. to reach it from the Docker host) and open the browser
monodocs serve ./docs --host 0.0.0.0 --open
```

`serve` always writes and serves HTML, whatever `output.format` says; it never writes a PDF. `-o` names the HTML file under every format. Without `-o`, the HTML goes where the configuration puts it: to `output.path` under `html`, to `docs.html` beside the PDF under `pdf`, and to `docs.html` in the output directory under `both` — `./dist/docs.html` by default in each case.

Press `Ctrl+C` to stop.

## `validate`

Checks for broken links, missing images, missing titles, skipped heading levels, and images with no `alt` attribute, **without writing any output**. Intended for CI.

```bash
monodocs validate [input] [options]
```

| Argument / Option     | Default       | Description                                         |
| --------------------- | ------------- | --------------------------------------------------- |
| `[input]`             | `./docs`      | Input directory, or a single source file, to validate. |
| `-c, --config <file>` | auto-detected | Config file. Uses `monodocs.config.yml` if present. |
| `--format <format>`   | `human`       | Report format: `human` or `json`.                   |
| `--strict`            | off           | Fail on warnings as well as errors.                 |

```bash
monodocs validate ./docs
```

Errors and warnings are printed to stderr. It exits with code `1` when an **error** is found; a warning alone leaves it at `0` and prints `⚠ 2 warning(s) in 20 page(s); no errors.`. `--strict` makes a warning fail the command too:

```bash
monodocs validate ./docs           # errors fail, warnings are reported
monodocs validate ./docs --strict  # a warning fails it as well
```

The exit code follows the `severity` in the report, so a release that adds a check as a warning does not turn a passing job red. To make warnings a release gate, add `--strict` in the workflow.

`validate` runs the same pipeline as a build up to writing the output, so a build reports every check `validate` makes: an error `validate` reports stops the build too, including an image over `assets.maxInlineSize` under `assets.onLargeImage: error`. The reverse does not hold: a build also reports what only writing the output can find — an output larger than [`assets.budget`](/docs/configuration#assets), a bottom margin too small for a PDF's page-number band, and a character in a PDF or a pre-rendered diagram that no font on the machine can draw. `validate` therefore passes a document whose build `assets.onBudget: error` or `fontCheck: error` would stop.

> [!NOTE]
> Mermaid diagrams are validated without a browser, so pre-render rendering and diagram syntax errors are not checked by `validate`.

### A report a job can read {#json-report}

`--format json` prints one JSON object on stdout and nothing else, so a workflow can parse it directly:

```bash
monodocs validate ./docs --format json
```

```json
{
  "schemaVersion": 1,
  "diagnostics": [
    {
      "code": "link/unresolved",
      "severity": "warning",
      "message": "Unresolved link \"nope.md\" in \"index.md:3\".",
      "path": "index.md",
      "line": 3
    }
  ]
}
```

- `schemaVersion` changes only when the shape a job parses changes; a release can add checks and codes without changing it. Pin `schemaVersion`, not the monodocs version.
- `code` is stable: `link/unresolved` keeps meaning exactly that, so a job can filter on it.
- `path` is relative to the input directory; `line` is present where monodocs knows it.

> [!WARNING]
> Do not match on `message`. It is the sentence a person reads: translated by [`--lang`](#message-language) and reworded between releases.

## See also

- [Configuration](/docs/configuration) — every `monodocs.config.yml` key, and how CLI options override it.
- [Getting Started](/docs/getting-started) — install and first build.
