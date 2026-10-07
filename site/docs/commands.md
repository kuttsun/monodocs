# Command Options

monodocs is a single CLI with five subcommands: `init`, `build`, `watch`, `serve`, and `validate`. The four that read documents share the optional input argument and the config-file option, plus a few options of their own; `init` takes neither.

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

On success it prints the number of pages generated and the output path. Warnings (e.g. broken links, missing titles) are printed but do not fail the build; use [`validate`](#validate) to fail on an error, and `validate --strict` to fail on a warning as well. The one exception is [`fontCheck: error`](/docs/configuration#font-check), which stops a build whose output would carry characters this machine has no font for.

## `watch`

Rebuilds whenever an input or config file changes. It writes the output but does not serve it; use `serve` for a preview server.

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

`validate` runs the same pipeline as a build, so a build reports every check `validate` does (and still writes its output). The reverse does not hold: a build that writes a PDF also reports what only that work can find, such as a bottom margin too small for the page-number band or a character no font on the machine can draw.

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
