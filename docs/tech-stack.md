# Tech Stack

| Category               | Adopted                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Language / Runtime     | TypeScript 6 (NodeNext / strict), Node.js 22 LTS                                                          |
| Package management     | pnpm 11 workspace (via corepack)                                                                          |
| Markdown conversion    | unified / remark-parse / remark-gfm / remark-frontmatter / remark-rehype / rehype-slug / rehype-stringify |
| AsciiDoc conversion    | @asciidoctor/core 4 (native ESM / async API) + post-processing via rehype-parse                           |
| HTML / text processing | hast-util-to-text / unist-util-visit / mdast-util-to-string                                               |
| Configuration files    | yaml + zod                                                                                                |
| File traversal         | picomatch (exclusion glob)                                                                                |
| Testing                | vitest 4 (happy-dom for DOM tests)                                                                        |
| Formatting             | Prettier 3                                                                                                |

## Versioning Policy

- Align Node.js with the LTS (currently 22). Keep `@types/node` on the same line (`^22`) as well.
- Specify dependencies with caret (`^`) by default, and pin them with `pnpm-lock.yaml`.
- Pin pnpm via the `packageManager` field in `app/package.json`, and resolve it with corepack.
- Because pnpm 11's supply-chain protection rejects build scripts by default, explicitly allow only the necessary ones via `allowBuilds` in `app/pnpm-workspace.yaml` (e.g., `esbuild`).

## Notes

- In TypeScript 6, Node global types are not imported automatically, so `types: ["node"]` is explicitly set in `app/tsconfig.base.json`.
- Theme assets (`*.html` / `*.css` / `*.js`) are not copied by tsc, so they are copied to `dist/` with `app/packages/core/scripts/copy-theme.mjs` during build.
- The HTML template `template.html` is excluded from formatting because Prettier breaks its placeholders (such as `{{appJs}}`).
