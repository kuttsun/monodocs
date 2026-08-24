# Command Options

monodocs is a single CLI with five subcommands: `init`, `build`, `watch`, `serve`, and `validate`. The four that read documents take the same optional input argument and share the config-file option, each adding a few of its own; `init` takes neither, because it creates what the others read.

```bash
monodocs <command> [input] [options]
```

The `[input]` argument is the directory to scan, or a single source file (default: `./docs`). When omitted, monodocs uses `./docs`. Given a file, monodocs bundles that one page and treats the directory holding it as the base for the links, images, and `monodocs.config.yml` it uses. CLI options always override the config file — see [Configuration](/docs/configuration) for the merge order and where `monodocs.config.yml` is looked up.

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
```

### Message language {#message-language}

Everything monodocs prints — `--help`, every error, every warning — is English by default. Japanese
is an explicit choice, either per command or for a whole shell or CI job:

```bash
monodocs --lang ja build ./docs
MONODOCS_LANG=ja monodocs build ./docs
```

The flag wins over the environment variable, which wins over the default. A value monodocs does not
ship is rejected, naming the ones it does, rather than falling back quietly to English — a setting
that is silently ignored is the hardest kind to notice.

`LANG` and `LC_ALL` are deliberately **not** consulted. Detecting the locale would be convenient and
would make a build log depend on which machine produced it, so a log pasted into an issue could not
be reproduced from the command alone.

This is separate from [`lang`](configuration#lang) in the configuration file, which describes the
document being built rather than the terminal building it. A document is often written in one
language by someone working in a terminal that reports another.

One boundary is worth knowing: a message that reaches you unwrapped from a dependency — the body of
a Zod schema error, a Puppeteer stack trace — stays in whatever language that dependency emits.
Where monodocs wraps one, the wrapper is translated. The argument errors you are most likely to hit —
an unknown option or command, a missing argument — are translated even though the argument parser
raises them; a rarer one it phrases in a way monodocs cannot rebuild keeps the parser's wording
rather than being paraphrased into something less precise.

## `init`

Writes a configuration and a first page to start from. It is the one subcommand with no input argument and no config option: it creates what the others read.

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

**It never overwrites.** When either file is already there it writes *neither*, names everything it found, and exits with code `1`, so running it in a directory that already holds work cannot cost you any of it. An existing `docs/` directory is not in its way — the page is added beside what is there.

The scaffold follows the [message language](#message-language) throughout: its comments, the text of the first page, and the `lang` it sets. `monodocs --lang ja init` therefore writes a Japanese first page under `lang: "ja"`, rather than Japanese text in a document that declares English. The two settings are otherwise independent, and the generated file says so where `lang` sits; documenting in another language means changing that one line.

## `build`

Builds the documentation into a single self-contained HTML file.

```bash
monodocs build [input] [options]
```

| Argument / Option       | Default                | Description                                                  |
| ----------------------- | ---------------------- | ------------------------------------------------------------ |
| `[input]`               | `./docs`               | Input directory to scan, or a single source file.            |
| `-o, --output <file>`   | `./dist/docs.html`   | Output file path. Overrides `output.path`.                   |
| `-c, --config <file>`   | auto-detected          | Config file. Uses `monodocs.config.yml` if present.          |
| `-f, --format <format>` | `html`                 | Output format: `html` \| `pdf` \| `both`. Overrides `output.format`. |

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

On success it prints the number of pages generated and the output path. Warnings (e.g. broken links, missing titles) are printed but do not fail the build — use `validate` to fail on issues. The one setting that changes this is [`fontCheck: error`](/docs/configuration#font-check), which stops a build whose output would carry characters this machine has no font for.

## `watch`

Rebuilds whenever an input or config file changes. It writes the output on every change but does not serve it — use `serve` if you also want a preview server.

```bash
monodocs watch [input] [options]
```

| Argument / Option     | Default              | Description                                         |
| --------------------- | -------------------- | --------------------------------------------------- |
| `[input]`             | `./docs`             | Input directory, or a single source file, to watch. |
| `-o, --output <file>` | `./dist/docs.html` | Output file path. Overrides `output.path`.          |
| `-c, --config <file>` | auto-detected        | Config file. Uses `monodocs.config.yml` if present. |

Writes to the output file are ignored, so a rebuild never re-triggers itself. Press `Ctrl+C` to stop.

## `serve`

Serves the output over HTTP, watches for changes, and live-reloads the browser (via server-sent events).

```bash
monodocs serve [input] [options]
```

| Argument / Option     | Default              | Description                                         |
| --------------------- | -------------------- | --------------------------------------------------- |
| `[input]`             | `./docs`             | Input directory, or a single source file, to serve. |
| `-o, --output <file>` | `./dist/docs.html` | Output file path. Overrides `output.path`.          |
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

Press `Ctrl+C` to stop.

## `validate`

Checks for broken links, missing images, missing titles, skipped heading levels, and images with no `alt` attribute — **without writing any output**. Intended for CI: it exits non-zero when anything is found.

```bash
monodocs validate [input] [options]
```

| Argument / Option     | Default       | Description                                         |
| --------------------- | ------------- | --------------------------------------------------- |
| `[input]`             | `./docs`      | Input directory, or a single source file, to validate. |
| `-c, --config <file>` | auto-detected | Config file. Uses `monodocs.config.yml` if present. |
| `--format <format>`   | `human`       | Report format: `human` or `json`.                   |

```bash
monodocs validate ./docs
```

Errors and warnings are printed to stderr. The process exits with code `1` if **anything** is found, warnings included, so there is no separate strict mode. Mermaid diagrams are validated without a browser, so pre-render rendering and diagram syntax errors are not checked here.

`validate` runs the same pipeline a build runs, so what it reports is what a build reports; a build prints the same warnings and writes its output anyway.

### A report a job can read {#json-report}

`--format json` prints one JSON object on stdout and nothing else, so a workflow can parse the stream without skipping prose:

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

Pin `schemaVersion`, not the monodocs version. The two move for different reasons: a release adds checks and codes without changing the shape a job parses, and `schemaVersion` moves only when that shape does.

`code` is the stable part of a finding — `link/unresolved` keeps meaning exactly that, so a job filtering on it keeps filtering on it. `message` is the sentence a person reads: it is translated by [`--lang`](#message-language) and reworded between releases, so a job must not match on it. `path` is relative to the input directory, and `line` is present where monodocs knows it.

## See also

- [Configuration](/docs/configuration) — every `monodocs.config.yml` key, and how CLI options override it.
- [Getting Started](/docs/getting-started) — install and first build.
