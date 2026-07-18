# Command Options

monodocs is a single CLI with four subcommands: `build`, `watch`, `serve`, and `validate`. Every subcommand takes the same optional input argument and shares the config-file option; each adds a few of its own.

```bash
monodocs <command> [input] [options]
```

The `[input]` argument is the directory to scan (default: `./docs`). When omitted, monodocs uses `./docs`. CLI options always override the config file — see [Configuration](/docs/configuration) for the merge order and where `monodocs.config.yml` is looked up.

> When running from source, replace `monodocs` with `node packages/cli/dist/index.js` (optionally via `scripts/app.sh`). See [Getting Started](/docs/getting-started).

## Global options

| Option          | Description                            |
| --------------- | -------------------------------------- |
| `-V, --version` | Print the version and exit.            |
| `-h, --help`    | Show help for the command and exit.    |

```bash
monodocs --help          # top-level help (lists all commands)
monodocs build --help    # help for a single command
```

## `build`

Builds the documentation into a single self-contained HTML file.

```bash
monodocs build [input] [options]
```

| Argument / Option       | Default                | Description                                                  |
| ----------------------- | ---------------------- | ------------------------------------------------------------ |
| `[input]`               | `./docs`               | Input directory to scan.                                     |
| `-o, --output <file>`   | `./dist/manual.html`   | Output file path. Overrides `output.path`.                   |
| `-c, --config <file>`   | auto-detected          | Config file. Uses `monodocs.config.yml` if present.          |
| `-f, --format <format>` | `html`                 | Output format: `html` \| `pdf` \| `both`. Overrides `output.format`. |

```bash
# Build ./docs into ./dist/manual.html
monodocs build

# Explicit input and output
monodocs build ./docs -o ./dist/manual.html

# Use a specific config file
monodocs build ./docs -c ./monodocs.config.yml
```

On success it prints the number of pages generated and the output path. Warnings (e.g. broken links, missing titles) are printed but do not fail the build — use `validate` to fail on issues.

## `watch`

Rebuilds whenever an input or config file changes. It writes the output on every change but does not serve it — use `serve` if you also want a preview server.

```bash
monodocs watch [input] [options]
```

| Argument / Option     | Default              | Description                                         |
| --------------------- | -------------------- | --------------------------------------------------- |
| `[input]`             | `./docs`             | Input directory to watch.                           |
| `-o, --output <file>` | `./dist/manual.html` | Output file path. Overrides `output.path`.          |
| `-c, --config <file>` | auto-detected        | Config file. Uses `monodocs.config.yml` if present. |

Writes to the output file are ignored, so a rebuild never re-triggers itself. Press `Ctrl+C` to stop.

## `serve`

Serves the output over HTTP, watches for changes, and live-reloads the browser (via server-sent events).

```bash
monodocs serve [input] [options]
```

| Argument / Option     | Default              | Description                                         |
| --------------------- | -------------------- | --------------------------------------------------- |
| `[input]`             | `./docs`             | Input directory to serve.                           |
| `-o, --output <file>` | `./dist/manual.html` | Output file path. Overrides `output.path`.          |
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

Checks for broken links, missing images, and missing titles **without writing any output**. Intended for CI: it exits non-zero when errors are found.

```bash
monodocs validate [input] [options]
```

| Argument / Option     | Default       | Description                                         |
| --------------------- | ------------- | --------------------------------------------------- |
| `[input]`             | `./docs`      | Input directory to validate.                        |
| `-c, --config <file>` | auto-detected | Config file. Uses `monodocs.config.yml` if present. |

```bash
monodocs validate ./docs
```

Errors and warnings are printed to stderr. The process exits with code `1` if any **error** is found (warnings alone do not fail). Mermaid diagrams are validated without a browser, so pre-render rendering and diagram syntax errors are not checked here.

## See also

- [Configuration](/docs/configuration) — every `monodocs.config.yml` key, and how CLI options override it.
- [Getting Started](/docs/getting-started) — install and first build.
