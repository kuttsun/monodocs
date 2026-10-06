// Generates src/themes/mermaid-notices.txt: the third-party notices for the prebuilt Mermaid runtime
// (mermaid/dist/mermaid.min.js) that `mermaid.runtime: inline` embeds in the output HTML.
//
// The runtime is a single file mermaid's own build produced from mermaid's own lockfile, so what it
// contains is not what node_modules resolves: it carries versions this repository does not install,
// and two versions of some packages. The component list is therefore read from the runtime's source
// map — the packages its sources come from, and the packages esbuild names in the path comments of
// the pre-bundled chunks inside it (@mermaid-js/parser) — and each component's licence is read from
// that exact version: from the pnpm store when it is installed, otherwise from its npm tarball,
// checked against the registry's integrity hash (roadmap 21.3).
//
// A source map cannot see inside a package that ships its own pre-built file: roughjs's rollup
// bundle carries four packages, cytoscape's carries three of its devDependencies, and some files
// carry code copied in with its own licence. So a component with a large or pre-built source must be
// audited at its exact version in PREBUILT_AUDITED, which names what it carries, and every runtime
// dependency of every component must be listed or explained in NOT_IN_RUNTIME. Either gap fails the
// run rather than leaving a notice out.
//
//   node scripts/generate-mermaid-notices.mjs           rewrite the notices (may use the network)
//   node scripts/generate-mermaid-notices.mjs --check   exit 1 if the components listed in the
//                                                       notices are not the runtime's (offline)
//
// After a mermaid upgrade, run without --check and commit the result.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

// `--file <path>` points --check at another copy, which is how the tests feed it a broken one.
const fileArg = process.argv.indexOf("--file");
const NOTICES_FILE =
  fileArg === -1
    ? new URL("../src/themes/mermaid-notices.txt", import.meta.url)
    : process.argv[fileArg + 1];
const require = createRequire(new URL("../src/themes/mermaid.ts", import.meta.url));
const mermaidDir = dirname(require.resolve("mermaid/package.json"));
// LICENSE, LICENSE.txt, LICENSE-MIT, NOTICE.md…, but not a script such as license-update.mjs.
const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice)([-.][a-z0-9]+)?(\.(md|txt|markdown))?$/i;
const SEP = "=".repeat(80);

/**
 * A hash of this script, written into the notices. The audit tables, the notes, and the rendering all
 * live here, so --check can tell offline that they changed after the notices were last generated.
 */
function digestOf(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function generatorHash() {
  const text = (await readFile(fileURLToPath(import.meta.url), "utf8")).replace(/\r\n?/g, "\n");
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
const SUB = "-".repeat(80);

/** The W3C Software and Document License (2015), which the WICG explainer cytoscape drew on uses. */
const W3C_SOFTWARE_AND_DOCUMENT_LICENSE = [
  "W3C Software and Document License",
  "https://www.w3.org/copyright/software-license-2015/",
  "",
  "This work is being provided by the copyright holders under the following license.",
  "",
  "License",
  "By obtaining and/or copying this work, you (the licensee) agree that you have read, understood,",
  "and will comply with the following terms and conditions.",
  "",
  "Permission to copy, modify, and distribute this work, with or without modification, for any",
  "purpose and without fee or royalty is hereby granted, provided that you include the following on",
  "ALL copies of the work or portions thereof, including modifications:",
  "- The full text of this NOTICE in a location viewable to users of the redistributed or derivative",
  "  work.",
  "- Any pre-existing intellectual property disclaimers, notices, or terms and conditions. If none",
  "  exist, the W3C Software and Document Short Notice should be included.",
  "- Notice of any changes or modifications, through a copyright statement on the new code or",
  '  document such as "This software or document includes material copied from or derived from',
  '  [title and URI of the W3C document]. Copyright © [YEAR] W3C® (MIT, ERCIM, Keio, Beihang)."',
  "",
  "Disclaimers",
  'THIS WORK IS PROVIDED "AS IS," AND COPYRIGHT HOLDERS MAKE NO REPRESENTATIONS OR WARRANTIES,',
  "EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO, WARRANTIES OF MERCHANTABILITY OR FITNESS FOR ANY",
  "PARTICULAR PURPOSE OR THAT THE USE OF THE SOFTWARE OR DOCUMENT WILL NOT INFRINGE ANY THIRD PARTY",
  "PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.",
  "",
  "COPYRIGHT HOLDERS WILL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, SPECIAL OR CONSEQUENTIAL DAMAGES",
  "ARISING OUT OF ANY USE OF THE SOFTWARE OR DOCUMENT.",
  "",
  "The name and trademarks of copyright holders may NOT be used in advertising or publicity",
  "pertaining to the work without specific, written prior permission. Title to copyright in this",
  "work will at all times remain with copyright holders.",
  "",
  "Changes: cytoscape adapted the explainer's feature-detection snippet into its own renderer.",
];

/**
 * Components with a source over 20 KB, minified, or under bundled/, build/ or umd/, audited by hand
 * at the version named: `bundled` lists the packages the file carries (its own build picked their
 * versions, so each is named by the range it declares and the version its licence text is read
 * from), and `vendored` describes code copied into it under another licence. An empty entry records
 * that the file was read and carries only the package's own code.
 */
const PREBUILT_AUDITED = {
  "@upsetjs/venn.js@2.0.0": {
    // build/venn.esm.js inlines fmin (nelderMead, conjugateGradient, bisect, zeros), patched by venn.js.
    bundled: [{ name: "fmin", version: "0.0.4", declared: "0.0.4, patched by venn.js" }],
    vendored: [
      "build/venn.esm.js also contains wrapText, adapted from",
      "http://engineering.findthebest.com/wrapping-axis-labels-in-d3-js/, which states no licence.",
    ],
  },
  // Inside the pre-bundled parser, single files over 20 KB of the package's own code.
  "@chevrotain/regexp-to-ast@13.2.0": {},
  "@chevrotain/utils@13.2.0": {
    vendored: [
      "src/to-fast-properties.ts is based on bluebird's util.js",
      "(https://github.com/petkaantonov/bluebird), under the MIT License:",
      "  Copyright (c) 2013-2018 Petka Antonov.",
    ],
  },
  "chevrotain@13.2.0": {},
  "chevrotain-allstar@0.5.0": {},
  "langium@4.4.0": {},
  "vscode-jsonrpc@9.0.3": {},
  "vscode-languageserver-protocol@3.18.4": {},
  "vscode-languageserver-types@3.18.4": {},
  "cose-base@1.0.3": {}, // requires layout-base rather than carrying it
  "cose-base@2.2.0": {},
  "cytoscape@3.34.0": {
    // dist/cytoscape.esm.mjs inlines these devDependencies.
    bundled: [
      { name: "gl-matrix", version: "3.4.3", declared: "^3.4.3" },
      { name: "heap", version: "0.2.7", declared: "^0.2.7" },
      { name: "lodash", version: "4.17.21", declared: "^4.17.21" },
    ],
    vendored: [
      "dist/cytoscape.esm.mjs also contains code under the MIT License whose authors it names:",
      "  Promises/A+ 1.1.1 Thenable — Copyright (c) 2013-2014 Ralf S. Engelschall (http://engelschall.com)",
      "  Bezier curve function generator — Copyright Gaetan Renaudeau",
      "  Runge-Kutta spring physics function generator, adapted from Framer.js — copyright Koen Bok",
      "  Event object based on jQuery events (https://github.com/jquery/jquery/blob/master/src/event.js)",
      "    — Copyright OpenJS Foundation and other contributors",
      "  Babel helper functions its build injected (_classCallCheck and the like): MIT,",
      "    Copyright (c) 2014-present Sebastian McKenzie and other contributors (@babel/helpers).",
      "It also contains code from sources that state no licence:",
      "  RGB/HSL conversion, from Michael Jackson",
      "    (http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript)",
      "  signed distance functions, from Inigo Quilez (https://iquilezles.org/articles/distfunctions2d/,",
      "    https://www.shadertoy.com/view/4lsXDN)",
      "and, under licences of their own:",
      "  asVec and calcCornerArc, adapted from a Stack Overflow answer by Blindman67",
      "    (https://stackoverflow.com/a/44856925), posted 2017-07-01 and so licensed under",
      "    CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), the licence Stack Overflow",
      "    applied to contributions of that date.",
      "  Passive-listener feature detection, derived from the WICG EventListenerOptions explainer",
      "    (https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md), copyright its",
      "    contributors, under the W3C Software and Document License, whose full text follows:",
      ...W3C_SOFTWARE_AND_DOCUMENT_LICENSE.map((line) => `    ${line}`),
      "The MIT License text is reproduced above.",
    ],
  },
  "cytoscape-cose-bilkent@4.1.0": {}, // a webpack UMD of its own code; requires cose-base
  // A webpack UMD that requires cose-base rather than carrying it, with Babel's helpers.
  "cytoscape-fcose@2.2.0": {
    vendored: [
      "cytoscape-fcose.js also contains code under the MIT License above:",
      "  Babel helper functions its build injected (_classCallCheck and the like): MIT,",
      "    Copyright (c) 2014-present Sebastian McKenzie and other contributors (@babel/helpers).",
    ],
  },
  "dagre-d3-es@7.0.14": {},
  "dayjs@1.11.21": {},
  "dompurify@3.4.12": {},
  "js-yaml@4.3.0": {},
  // lib/elk.bundled.js is a browserify bundle of elkjs's API, its worker, and web-worker's browser
  // entry; the worker (elk-worker.min.js) is ELK compiled to JavaScript by GWT, together with the
  // Java libraries ELK uses and GWT's own runtime.
  "elkjs@0.9.3": {
    bundled: [
      {
        name: "web-worker",
        version: "1.3.0",
        declared: "^1.0.0 (devDependency); only its browser entry, identical in 1.0.0 to 1.3.0",
      },
    ],
    vendored: [
      "Corresponding Source (EPL-2.0, section 3.1): lib/elk-worker.min.js is the Eclipse Layout",
      "Kernel compiled to JavaScript with GWT. Its source is ELK at tag v0.9.1",
      "(https://github.com/eclipse/elk, commit 62d5909f96fad541bc101ad52dabaece6b7eab7e), built by",
      "elkjs at tag 0.9.3 (https://github.com/kieler/elkjs, commit",
      "a8304cf79fde75bc2ab1a89d28320f53f8637436) with GWT 2.10.0, EMF GWT 2.12.4, Guava 31.1-jre, and",
      "Xtext 2.28.0. elkjs's release procedure builds against ELK's matching release tag, and v0.9.1",
      "was ELK's latest 0.9 release when elkjs 0.9.3 was tagged on 2024-04-16; the bundle itself does",
      "not record the ELK commit.",
      "",
      "Compiled into the worker with ELK, under the Eclipse Public License 2.0 above:",
      "  Eclipse Modeling Framework (org.eclipse.emf.common, org.eclipse.emf.ecore) and Xtext's",
      "    xbase library (org.eclipse.xtext.xbase.lib) — Copyright the Eclipse contributors.",
      "and under the Apache License, Version 2.0, whose full text is reproduced in this document under",
      "the Apache-2.0 components:",
      "  Guava (com.google.common) — Copyright The Guava Authors.",
      "  GWT's runtime and Java runtime emulation (com.google.gwt, java.lang, java.util, java.math) —",
      "    Copyright the GWT Project Authors.",
      "lib/elk.bundled.js also contains Babel helper functions its build injected, under the MIT",
      "License, whose text is reproduced in this document: Copyright (c) 2014-present Sebastian",
      "McKenzie and other contributors (@babel/helpers).",
    ],
    apache: true,
  },
  "katex@0.16.47": {
    vendored: [
      "dist/katex.mjs also contains hyphenate and escape, adapted from Facebook's React under the",
      "Apache License, Version 2.0 (Copyright Facebook, Inc.), whose full text is reproduced in this",
      "document under the Apache-2.0 components.",
    ],
    apache: true,
  },
  // Not pre-built, but its comments name the code it took.
  "khroma@2.1.0": {
    vendored: [
      "dist/methods/mix.js is adapted from Dart Sass (https://github.com/sass/dart-sass), under the",
      "MIT License above: Copyright (c) 2016, Google Inc.",
      "dist/utils/channel.js contains hue2rgb, from Michael Jackson's gist",
      "(https://gist.github.com/mjackson/5311256), which states no licence.",
    ],
  },
  "layout-base@1.0.2": {
    vendored: [
      "layout-base.js also contains code under the MIT License above:",
      "  Babel helper functions its build injected (_classCallCheck and the like): MIT,",
      "    Copyright (c) 2014-present Sebastian McKenzie and other contributors (@babel/helpers).",
      "It also contains",
      "  RandomSeed.nextDouble, adapted from a Stack Overflow answer by Antti Kissaniemi",
      "    (https://stackoverflow.com/a/19303725), posted 2013-10-10 and so licensed under CC BY-SA 3.0",
      "    (https://creativecommons.org/licenses/by-sa/3.0/), the licence Stack Overflow applied to",
      "    contributions of that date. The code is unchanged in the answer's later revisions.",
    ],
  },
  "layout-base@2.0.1": {
    vendored: [
      "layout-base.js also contains code adopted, with changes, from JamaJS",
      "(https://github.com/dragonfly-ai/JamaJS), under the Apache License, Version 2.0. The file",
      "carries the licence's full text, which is reproduced in this document under the Apache-2.0",
      "components.",
      "It also contains, under the MIT License above,",
      "  Babel helper functions its build injected (_classCallCheck and the like): MIT,",
      "    Copyright (c) 2014-present Sebastian McKenzie and other contributors (@babel/helpers).",
      "It also contains",
      "  RandomSeed.nextDouble, adapted from a Stack Overflow answer by Antti Kissaniemi",
      "    (https://stackoverflow.com/a/19303725), posted 2013-10-10 and so licensed under CC BY-SA 3.0",
      "    (https://creativecommons.org/licenses/by-sa/3.0/), the licence Stack Overflow applied to",
      "    contributions of that date. The code is unchanged in the answer's later revisions.",
    ],
    apache: true,
  },
  "marked@16.3.0": {},
  "mermaid@12.1.0": {
    vendored: [
      "src/diagrams/gantt/ganttRenderer.js contains checkUnique, adapted from a Stack Overflow answer",
      "by Justin Johnson (https://stackoverflow.com/a/1890233), posted 2009-12-12 and so licensed",
      "under CC BY-SA 2.5 (https://creativecommons.org/licenses/by-sa/2.5/), the licence Stack",
      "Overflow applied to contributions of that date.",
      "src/diagram-api/regexes.ts has a front-matter expression based on Jekyll's",
      "(https://github.com/jekyll/jekyll), under the MIT License: Copyright (c) 2008-2016 Tom",
      "Preston-Werner.",
    ],
    // src/utils.ts copies entity-decode's browser decoder ("source: …/entity-decode/blob/v2.0.1").
    bundled: [
      {
        name: "entity-decode",
        version: "2.0.1",
        copied: "into src/utils.ts, from the version its source comment names",
        // The upstream LICENSE leaves the holder blank; package.json names the author.
        notice: "The copyright holder left blank above is the package's author, shrpne.",
      },
      // Each parser generated from a .jison grammar carries jison's parser runtime and jison-lex's
      // lexer runtime ("parser generated by jison 0.4.18", "generated by jison-lex 0.3.4").
      {
        name: "jison",
        version: "0.4.18",
        copied: "into the parsers it generated from mermaid's .jison grammars",
      },
      {
        name: "jison-lex",
        version: "0.3.4",
        copied: "into the lexers of those parsers",
        notice:
          "jison-lex's README states only \"MIT\". It is by jison's author; jison's notice and the\n" +
          "MIT License text are under jison above.",
      },
    ],
  },
  // Inside the pre-bundled parser: lib/esm/index.mjs is a webpack bundle carrying path-browserify.
  "vscode-uri@3.1.0": {
    bundled: [
      {
        name: "path-browserify",
        version: "1.0.1",
        declared: "^1.0.1 (devDependency)",
        // index.js is Node.js's path module, and keeps Node's notice in a header the bundle dropped.
        notice:
          "index.js is the path module extracted from Node.js v8.11.1, under the MIT License above:\n" +
          "  Copyright Joyent, Inc. and other Node contributors.",
      },
    ],
  },
  "roughjs@4.6.6": {
    // bundled/rough.esm.js is a rollup bundle of roughjs and its four dependencies.
    bundled: [
      { name: "hachure-fill", version: "0.5.2", declared: "^0.5.2" },
      { name: "path-data-parser", version: "0.1.0", declared: "^0.1.0" },
      { name: "points-on-curve", version: "0.2.0", declared: "^0.2.0" },
      { name: "points-on-path", version: "0.2.1", declared: "^0.2.1" },
    ],
  },
};

/**
 * Lines in mermaid's and the parser's own sources that cite where code came from. Those sources are
 * not in the store and are not judged by needsAudit; they are audited by hand with each mermaid
 * version (the mermaid@<version> entry above goes stale and forces it), and this list is printed on
 * generation as the place to start.
 */
export function ownSourceCitations(map) {
  const cites = [];
  const re =
    /(source:|adapted from|ported from|copied from|taken from|from this|copyright|licen[cs]ed under|stackoverflow\.com|stackexchange\.com)/i;
  map.sources.forEach((source, i) => {
    const content = map.sourcesContent?.[i] ?? "";
    let at = source;
    // esbuild's closing "Bundled license information" belongs to no section; lodash-es is listed.
    const end = content.indexOf("/*! Bundled license information:");
    for (const line of (end === -1 ? content : content.slice(0, end)).split("\n")) {
      const mark = /^\/\/ (\S+\.[cm]?[jt]s)$/.exec(line);
      if (mark) at = mark[1];
      else if (!storeRef(at) && /^\s*(\/\/|\/?\*)/.test(line) && re.test(line))
        cites.push(`${at}: ${line.trim().slice(0, 140)}`);
    }
  });
  return cites;
}

/** Whether a source is one a component's own build may have filled with other code. */
function needsAudit(file, content, inEsbuildChunk = false) {
  const bundlerTrace =
    /__webpack_require__|\/\*{3}\/|createCommonjsModule|getDefaultExportFromCjs|function require[A-Z]\w* \(\)|typeof exports *=== *['"]object['"] *&& *typeof module/;
  if (bundlerTrace.test(content)) return true;
  // Inside mermaid's own esbuild chunk, __commonJS is esbuild wrapping the section's own module.
  if (!inEsbuildChunk && /__commonJS/.test(content)) return true;
  // Minified code runs to tens of thousands of characters a line; a long declaration does not.
  if (content.split("\n").some((line) => line.length > 10_000)) return true;
  return (
    content.length > 20_000 || /\.min\.js$/.test(file) || /(^|\/)(bundled|build|umd)\//.test(file)
  );
}

/** Declared dependencies that are not in the runtime, each with the reason. */
const NOT_IN_RUNTIME = {
  mermaid: { "@types/d3": "type declarations" },
  "@mermaid-js/parser": { "@chevrotain/types": "type declarations" },
  "@chevrotain/gast": { "@chevrotain/types": "type declarations" },
  "@chevrotain/cst-dts-gen": { "@chevrotain/types": "type declarations" },
  chevrotain: {
    "@chevrotain/types": "type declarations",
    "@chevrotain/cst-dts-gen": "absent from the parser chunk's esbuild path comments",
  },
  langium: { "vscode-languageserver": "absent from the parser chunk's esbuild path comments" },
  "d3-delaunay": { delaunator: "only src/index.js is in the runtime; Delaunay is tree-shaken" },
  "d3-dsv": { rw: "command-line tools", commander: "command-line tools", "iconv-lite": "same" },
  "js-yaml": { argparse: "the command-line tool" },
  katex: { commander: "the command-line tool" },
  jison: Object.fromEntries(
    ["JSONSelect", "cjson", "ebnf-parser", "escodegen", "esprima", "lex-parser", "nomnom"].map(
      (d) => [d, "the generator's toolchain; a generated parser carries only its runtime"],
    ),
  ),
  "jison-lex": Object.fromEntries(
    ["lex-parser", "nomnom"].map((d) => [d, "the generator's toolchain, as for jison"]),
  ),
  "entity-decode": { he: "its Node entry; the browser decoder mermaid copied uses the DOM" },
  fmin: { contour_plot: "fmin's plotting demos; venn.js's bundle has no contour code" },
  fastdom: { strictdom: "fastdom-strict.js, which the runtime does not import" },
  "@iconify/utils": Object.fromEntries(
    [
      "@antfu/install-pkg",
      "@antfu/utils",
      "@iconify/types",
      "debug",
      "globals",
      "kolorist",
      "local-pkg",
      "mlly",
    ].map((d) => [
      d,
      "only lib/icon, lib/icon-set, lib/svg and lib/customisations are in the runtime",
    ]),
  ),
};

/**
 * Every URL a comment in the runtime's sources cites, outside the hosts of specifications and
 * references below, with what was decided about it: "attributed" when code came from it and the
 * notices say so (in PREBUILT_AUDITED), "reference" when it explains, cites an issue, or gives a
 * formula. A URL in neither fails generation and --check, so a mermaid upgrade cannot bring in
 * code from a new source unread.
 */
const REFERENCE_HOSTS =
  /^https?:\/\/(www\.)?(w3\.org|w3c\.github\.io|ecma-international\.org|en\.wikipedia\.org|developer\.mozilla\.org|yaml\.org|unicode\.org|datatracker\.ietf\.org|url\.spec\.whatwg\.org|html\.spec\.whatwg\.org|lodash\.com|openjsf\.org|underscorejs\.org|mathworld\.wolfram\.com|dagrejs\.github\.io|bugs\.chromium\.org|bugs\.webkit\.org|tex\.stackexchange\.com|math\.stackexchange\.com)\//;
const REVIEWED_URLS = {
  "http://www.eclipse.org/emf/2002/Ecore": "reference",
  "http://www.eclipse.org/emf/2003/XMLType": "reference",
  "http://www.eclipse.org/legal/epl-2.0.": "reference",
  "https://esbuild.github.io/content-types/#direct-eval": "reference",
  "https://github.com/chevrotain/chevrotain/issues/869": "reference",
  "https://github.com/mermaid-js/mermaid/issues/4121.": "reference",
  "https://github.com/petkaantonov/bluebird/blob/b97c0d2d487e8c5076e8bd897e0dcd4622d31846/src/util.js#L201-L216":
    "attributed",
  "https://hackernoon.com/the-madness-of-parsing-real-world-javascript-regexps-d9ee336df983":
    "reference",
  "https://stackoverflow.com/a/4228528": "reference",
  "https://www.eclipse.org/legal/epl-2.0/": "reference",
  "https://www.typescriptlang.org/docs/handbook/functions.html#this-parameters": "reference",
  "http://dl.acm.org/citation.cfm?id=1498047": "reference",
  "http://engelschall.com": "attributed",
  "http://opensource.org/licenses/MIT": "reference",
  "http://www.apache.org/licenses/": "reference",
  "http://www.apache.org/licenses/LICENSE-2.0": "reference",
  "https://github.com/KaTeX/KaTeX/wiki/Examining-TeX#group-types": "reference",
  "https://github.com/jquery/jquery/blob/master/src/event.js": "attributed",
  "https://jquery.org/license/": "attributed",
  "https://tldrlegal.com/license/mit-license": "reference",
  "https://www.linkedin.com/in/gerardohuck/": "reference",
  "http://ctan.math.washington.edu/tex-archive/macros/latex/contrib/braket/braket.pdf": "reference",
  "http://eev.ee/blog/2015/09/12/dark-corners-of-unicode/": "reference",
  "http://engineering.findthebest.com/wrapping-axis-labels-in-d3-js/": "attributed",
  "http://mirrors.concertpass.com/tex-archive/macros/latex/required/amsmath/amsmath.pdf":
    "reference",
  "http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript":
    "attributed",
  "http://stackoverflow.com/questions/1890203/unique-for-arrays-in-javascript": "attributed",
  "http://stackoverflow.com/questions/8458984": "reference",
  "http://www.btluke.com/simanf1.html": "reference",
  "https://css-tricks.com/debouncing-throttling-explained-examples/": "reference",
  "https://ctan.math.illinois.edu/macros/latex/contrib/statmath/statmath.pdf": "reference",
  "https://en.wikibooks.org/wiki/LaTeX/Lengths": "reference",
  "https://gist.github.com/mjackson/5311256": "attributed",
  "https://github.com/KaTeX/KaTeX/pull/2460.": "reference",
  "https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md#feature-detection":
    "attributed",
  "https://github.com/WICG/declarative-partial-updates": "reference",
  "https://github.com/benfred/venn.js/issues/103": "reference",
  "https://github.com/benfred/venn.js/issues/120": "reference",
  "https://github.com/benfred/venn.js/issues/48#issuecomment-146069777": "reference",
  "https://github.com/cytoscape/cytoscape.js-affinity-propagation": "reference",
  "https://github.com/cytoscape/cytoscape.js-hierarchical": "reference",
  "https://github.com/cytoscape/cytoscape.js-markov-cluster": "reference",
  "https://github.com/cytoscape/cytoscape.js/issues/3365": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/components.png": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/dijkstra-source.png": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/preorder.png": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/prim-input.png": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/prim-output.png": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/tarjan.png": "reference",
  "https://github.com/dagrejs/graphlib/wiki/images/topsort.png": "reference",
  "https://github.com/dragonfly-ai/JamaJS": "attributed",
  "https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/issues/67": "reference",
  "https://github.com/jashkenas/underscore/pull/1247": "reference",
  "https://github.com/jekyll/jekyll/blob/6dd3cc21c40b98054851846425af06c64f9fb466/lib/jekyll/document.rb#L10":
    "attributed",
  "https://github.com/mbostock/d3/issues/1642": "reference",
  "https://github.com/mermaid-js/mermaid/discussions": "reference",
  "https://github.com/mermaid-js/mermaid/issues/1618": "reference",
  "https://github.com/mermaid-js/mermaid/issues/5976": "reference",
  "https://github.com/mermaid-js/mermaid/pull/4759.": "reference",
  "https://github.com/nodeca/js-yaml/issues/164": "reference",
  "https://github.com/sass/dart-sass/blob/7457d2e9e7e623d9844ffd037a070cf32d39c348/lib/src/functions/color.dart#L718-L756":
    "attributed",
  "https://github.com/shrpne/entity-decode/blob/v2.0.1/browser.js}": "attributed",
  "https://github.com/sindresorhus/validate-element-name": "reference",
  "https://github.com/thysultan/stylis": "reference",
  "https://iquilezles.org/articles/distfunctions2d/": "attributed",
  "https://jekyllrb.com/docs/front-matter/": "reference",
  "https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae": "reference",
  "https://mathiasbynens.be/notes/javascript-unicode": "reference",
  "https://observablehq.com/@mbostock/lab-and-rgb": "reference",
  "https://planetcalc.com/7779": "reference",
  "https://stackoverflow.com/a/19303725": "attributed",
  "https://stackoverflow.com/a/44856925/11028828": "attributed",
  "https://www.math.lsu.edu/~aperlis/publications/mathclap/": "reference",
  "https://www.particleincell.com/2012/bezier-splines/": "reference",
  "https://www.shadertoy.com/view/4lsXDN": "attributed",
  "https://www.tug.org/TUGboat/tb09-3/tb22bechtolsheim.pdf": "reference",
  "https://www.w3schools.com/charsets/ref_html_entities_a.asp": "reference",
};

/** URLs cited in comments of the runtime's sources that REVIEWED_URLS does not cover. */
export function unreviewedUrls(map) {
  const found = new Set();
  map.sources.forEach((source, i) => {
    const content = map.sourcesContent?.[i] ?? "";
    const end = content.indexOf("/*! Bundled license information:");
    const code = end === -1 ? content : content.slice(0, end);
    // Block comments, and line comments wherever they start: not after a ":" (a URL's "//"), a
    // backslash, or a quote, which would put the "//" inside a string.
    for (const comment of code.matchAll(/\/\*[\s\S]*?\*\/|(?<![:\\"'])\/\/[^\n]*/g)) {
      for (const m of comment[0].matchAll(/https?:\/\/[^\s)'"`>\]]+/g)) {
        if (!REFERENCE_HOSTS.test(m[0]) && !REVIEWED_URLS[m[0]]) found.add(m[0]);
      }
    }
  });
  return [...found].sort();
}

/** Licence files left out on purpose: dompurify is dual-licensed and monodocs elects Apache-2.0. */
const EXCLUDED_FILES = { dompurify: ["LICENSE-MPL"] };

/** Packages whose published tarball has no licence file and states it in its README instead. */
const LICENCE_IN_README = new Set(["fastdom", "jison", "jison-lex"]);

/** The last `.pnpm/<key>/node_modules/<name>/<file>` in a path, as { name, version, patched, file }. */
function storeRef(path) {
  const all = [
    ...path.matchAll(/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\/?([^\s]*)/g),
  ];
  if (all.length === 0) return null;
  const [, key, name, file] = all[all.length - 1];
  // A store key is `<name with / as +>@<version>`, then a peer or patch suffix.
  const prefix = `${name.replace("/", "+")}@`;
  if (!key.startsWith(prefix)) throw new Error(`unexpected store key ${key} for ${name}`);
  const rest = key.slice(prefix.length);
  return { name, version: /^[^_(]+/.exec(rest)[0], patched: rest.includes("patch_hash="), file };
}

/** The label a component carries in the notices, which is also what --check compares. */
function labelOf(c) {
  if (c.bundledIn) {
    const how = c.copied ? "copied into" : "bundled inside";
    return `${c.name}@${c.version} (${how} ${labelOf(c.bundledIn)})`;
  }
  const at = c.version ? `@${c.version}` : ` (built with mermaid@${c.builtWith})`;
  return `${c.name}${at}${c.patched ? " (patched by mermaid)" : ""}`;
}

/** Every component the runtime contains, sorted. */
export function componentsOf(map, mermaidVersion) {
  const found = new Map();
  const unaudited = new Set();
  const add = (path, content, inEsbuildChunk) => {
    const ref = storeRef(path);
    if (!ref) return;
    const id = `${ref.name}@${ref.version}`;
    found.set(id, {
      name: ref.name,
      version: ref.version,
      patched: ref.patched || Boolean(found.get(id)?.patched),
    });
    if (needsAudit(ref.file, content, inEsbuildChunk) && !PREBUILT_AUDITED[id]) {
      unaudited.add(`${id} (${ref.file})`);
    }
  };
  map.sources.forEach((source, i) => {
    const content = map.sourcesContent?.[i];
    if (content == null && storeRef(source))
      throw new Error(`${source}: no sourcesContent to audit`);
    add(source, content ?? "");
    // Pre-bundled chunks keep esbuild's `// <path>` comments naming where each part came from; each
    // section up to the next comment is that part's code, and is audited as its own source.
    // Sections are bounded by every path comment, the chunk's own src/ files included.
    const marks = [...(content ?? "").matchAll(/^\/\/ (\S+\.[cm]?[jt]s)$/gm)];
    marks.forEach((m, k) => {
      const section = content.slice(m.index + m[0].length, marks[k + 1]?.index ?? content.length);
      add(m[1], section, true);
    });
  });
  found.set("mermaid", { name: "mermaid", version: mermaidVersion, patched: false });
  // The parser is built from mermaid's repository in the same release, and mermaid depends on it by
  // range, so the bundle does not say which published version it equals. It is named by the release
  // it was built with.
  if (map.sources.some((s) => s.includes("/parser/dist/"))) {
    found.set("@mermaid-js/parser", {
      name: "@mermaid-js/parser",
      builtWith: mermaidVersion,
      patched: false,
    });
  }
  if (unaudited.size > 0) {
    throw new Error(
      "components with a large or pre-built source that PREBUILT_AUDITED does not cover at this " +
        `version; read each file and record what it carries:\n  ${[...unaudited].join("\n  ")}`,
    );
  }
  const present = new Set([...found.values()].map((c) => `${c.name}@${c.version}`));
  const stale = Object.keys(PREBUILT_AUDITED).filter((id) => !present.has(id));
  if (stale.length > 0) {
    throw new Error(
      `PREBUILT_AUDITED lists components the runtime no longer has: ${stale.join(", ")}`,
    );
  }
  for (const parent of [...found.values()]) {
    for (const b of PREBUILT_AUDITED[`${parent.name}@${parent.version}`]?.bundled ?? []) {
      found.set(`${b.name}@${b.version} in ${labelOf(parent)}`, {
        name: b.name,
        version: b.version,
        declared: b.declared,
        copied: b.copied,
        notice: b.notice,
        bundledIn: parent,
        patched: false,
      });
    }
  }
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || labelOf(a).localeCompare(labelOf(b)),
  );
}

/** The component labels a notices file lists: the lines between each SEP and SUB. */
export function listedComponents(text) {
  return [...text.matchAll(new RegExp(`^${SEP}\\n([\\s\\S]*?)\\n${SUB}$`, "gm"))]
    .flatMap((m) => m[1].split("\n"))
    .map((line) => line.split("  —  ")[0]);
}

/** Top-level files of an npm tarball (`package/<file>`), as name → Buffer. */
function topLevelFiles(tgz) {
  const tar = gunzipSync(tgz);
  const files = new Map();
  let paxPath;
  for (let off = 0; off + 512 <= tar.length;) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) =>
      header
        .subarray(start, start + len)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const data = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      // A pax header carries the next entry's path when it does not fit the ustar fields.
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString("utf8"))?.[1];
      continue;
    }
    const prefix = field(345, 155);
    const name = (paxPath ?? (prefix ? `${prefix}/` : "") + field(0, 100)).replace(/^\.\//, "");
    paxPath = undefined;
    const parts = name.split("/");
    if ((type === "0" || type === "") && parts.length === 2) files.set(parts[1], data);
  }
  return files;
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** { pkg, files } for a package directory: package.json, and its top-level files' names → text. */
async function fromDir(dir) {
  const files = new Map();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (LICENSE_FILE_RE.test(entry.name) || /^readme(\.[^.]*)?$/i.test(entry.name)) {
      files.set(entry.name, await readFile(join(dir, entry.name), "utf8"));
    }
  }
  return { pkg: JSON.parse(await readFile(join(dir, "package.json"), "utf8")), files };
}

/** The pnpm store entries of exactly `name@version`. */
function storeEntries(entries, name, version) {
  const prefix = `${name.replace("/", "+")}@${version}`;
  return entries.filter(
    (e) => e === prefix || e.startsWith(`${prefix}_`) || e.startsWith(`${prefix}(`),
  );
}

/** { pkg, files } for exactly `name@version`: from the pnpm store, else from the registry. */
async function fetchPackage(storeDir, entries, name, version) {
  for (const entry of storeEntries(entries, name, version)) {
    const found = await fromDir(join(storeDir, entry, "node_modules", name)).catch(() => null);
    if (found?.pkg.version === version) return found;
  }
  const meta = await (await fetchOk(`https://registry.npmjs.org/${name}/${version}`)).json();
  const tgz = Buffer.from(await (await fetchOk(meta.dist.tarball)).arrayBuffer());
  const [algo, digest] = meta.dist.integrity.split("-");
  if (createHash(algo).update(tgz).digest("base64") !== digest) {
    throw new Error(`${name}@${version}: tarball does not match the registry's integrity`);
  }
  const files = new Map();
  for (const [f, data] of topLevelFiles(tgz)) {
    if (f === "package.json" || LICENSE_FILE_RE.test(f) || /^readme(\.[^.]*)?$/i.test(f)) {
      files.set(f, data.toString("utf8"));
    }
  }
  return { pkg: JSON.parse(files.get("package.json")), files };
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license === "object") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(" OR ");
  return "UNKNOWN";
}

// A package with no `license` field (khroma) is named by its licence file's heading, and only when
// the heading is unambiguous, as scripts/bundle.mjs does for THIRD-PARTY-NOTICES.txt.
function inferLicense(text) {
  const head = text?.slice(0, 400) ?? "";
  if (/\bMIT License\b/i.test(head)) return "MIT";
  if (/\bISC License\b/i.test(head)) return "ISC";
  if (/\bApache License\b/i.test(head)) return "Apache-2.0";
  return "UNKNOWN";
}

/** Every licence and notice file of a package, joined; NOTICE files are kept for Apache-2.0. */
function licenceText(label, { pkg, files }) {
  const excluded = EXCLUDED_FILES[pkg.name] ?? [];
  const texts = [];
  for (const f of [...files.keys()].sort()) {
    if (!LICENSE_FILE_RE.test(f) || excluded.includes(f)) continue;
    const text = files.get(f).replace(/\r\n?/g, "\n").trim();
    if (text && !texts.includes(text)) texts.push(text);
  }
  if (texts.length === 0 && LICENCE_IN_README.has(pkg.name)) {
    const readme = [...files.entries()].find(([f]) => /^readme/i.test(f))?.[1] ?? "";
    // An ATX heading (## License) or a setext one (License, then a line of - or =).
    const section =
      /^(?:#+\s*Licen[sc]e\s*|Licen[sc]e\s*\n[-=]{3,}\s*)\n([\s\S]*?)(?=\n#+\s|\n[^\n]+\n[-=]{3,}\s*\n|(?![\s\S]))/im.exec(
        readme.replace(/\r\n?/g, "\n"),
      );
    if (section) texts.push(`(From the package's README.)\n\n${section[1].trim()}`);
  }
  if (texts.length === 0) throw new Error(`${label}: no licence text found`);
  return texts.join(`\n\n${SUB}\n\n`);
}

export async function render(components, mermaidVersion) {
  const marker = `${sep}.pnpm${sep}`;
  const at = mermaidDir.lastIndexOf(marker);
  if (at === -1) throw new Error(`mermaid is not installed by pnpm (${mermaidDir})`);
  const storeDir = mermaidDir.slice(0, at + marker.length);
  const entries = await readdir(storeDir);
  const names = new Set(components.map((c) => c.name));
  const parserDir = join(dirname(mermaidDir), "@mermaid-js", "parser");
  // Components whose licence text is identical (most of d3, say) share one block, so the text the
  // output carries once per diagram document is not repeated dozens of times.
  const blocks = new Map();
  const unexplained = [];
  for (const c of components) {
    let found;
    let note = "";
    if (c.bundledIn) {
      found = await fetchPackage(storeDir, entries, c.name, c.version);
      note = c.copied
        ? `(Copied by ${labelOf(c.bundledIn)} ${c.copied}.)\n\n`
        : `(Declared by ${labelOf(c.bundledIn)} as ${c.declared}; its build chose the version, and ` +
          `the licence text is ${c.name}@${c.version}'s.)\n\n`;
    } else if (c.version) {
      found = await fetchPackage(storeDir, entries, c.name, c.version);
    } else {
      found = await fromDir(parserDir);
      note = `(Licence text from ${c.name}@${found.pkg.version}.)\n\n`;
    }
    for (const dep of Object.keys(found.pkg.dependencies ?? {})) {
      if (names.has(dep) || NOT_IN_RUNTIME[c.name]?.[dep]) continue;
      unexplained.push(`${labelOf(c)} → ${dep}`);
    }
    const audit = c.version ? PREBUILT_AUDITED[`${c.name}@${c.version}`] : undefined;
    const vendored = audit?.vendored ? `\n\n${SUB}\n\n${audit.vendored.join("\n")}` : "";
    const extra = c.notice ? `\n\n${c.notice}` : "";
    const body = note + licenceText(labelOf(c), found) + extra + vendored;
    let license = licenseOf(found.pkg);
    if (license === "UNKNOWN") license = inferLicense(body);
    const block = blocks.get(body) ?? { labels: [], body };
    block.labels.push(`${labelOf(c)}  —  ${license}`);
    blocks.set(body, block);
  }
  if (unexplained.length > 0) {
    throw new Error(
      "dependencies the notices neither list nor explain; add each to PREBUILT_AUDITED or " +
        `NOT_IN_RUNTIME:\n  ${unexplained.join("\n  ")}`,
    );
  }
  const header = [
    `Third-party notices for the Mermaid runtime (mermaid@${mermaidVersion}) embedded in this file.`,
    `Generated by monodocs from the runtime's source map. Components: ${components.length}.`,
    `Generator: ${await generatorHash()}`,
    "Digest: {digest}",
    "The runtime below also keeps the licence comments its own build preserved.",
    "",
    ...(names.has("dompurify")
      ? [
          'Note: "dompurify" is dual-licensed under "MPL-2.0 OR Apache-2.0"; monodocs elects the',
          "Apache-2.0 terms.",
          "",
        ]
      : []),
  ].join("\n");
  // Vendored code that refers to the Apache-2.0 text relies on another component carrying it.
  const needsApache = components.some((c) => PREBUILT_AUDITED[`${c.name}@${c.version}`]?.apache);
  if (needsApache && ![...blocks.keys()].some((b) => /Apache License\s+Version 2\.0/.test(b))) {
    throw new Error("vendored Apache-2.0 code refers to a licence text no component carries");
  }
  const text = [...blocks.values()]
    .map((b) => `${SEP}\n${b.labels.join("\n")}\n${SUB}\n${b.body}\n`)
    .join("\n");
  // The digest covers the whole file but its own value, so --check sees a hand edit anywhere.
  const file = `${header}\n${text}`;
  return file.replace("{digest}", digestOf(file));
}

async function main() {
  const { version } = JSON.parse(await readFile(join(mermaidDir, "package.json"), "utf8"));
  const map = JSON.parse(await readFile(join(mermaidDir, "dist/mermaid.min.js.map"), "utf8"));
  const components = componentsOf(map, version);
  const unreviewed = unreviewedUrls(map);
  if (unreviewed.length > 0) {
    console.error(
      "comments in the Mermaid runtime cite URLs nobody has reviewed; read the code beside each, " +
        `attribute it in PREBUILT_AUDITED if it came from there, and add it to REVIEWED_URLS:\n  ${unreviewed.join("\n  ")}`,
    );
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    const text = await readFile(NOTICES_FILE, "utf8").catch(() => "");
    const listed = listedComponents(text);
    const expected = components.map(labelOf);
    if ([...listed].sort().join("\n") !== [...expected].sort().join("\n")) {
      const missing = expected.filter((l) => !listed.includes(l));
      const extra = listed.filter((l) => !expected.includes(l));
      console.error(
        "mermaid-notices.txt does not list the Mermaid runtime's components; run " +
          "scripts/generate-mermaid-notices.mjs\n" +
          `  missing: ${missing.join(", ") || "-"}\n  not in the runtime: ${extra.join(", ") || "-"}`,
      );
      process.exit(1);
    }
    const generator = /^Generator: (\w+)$/m.exec(text)?.[1];
    if (generator !== (await generatorHash())) {
      console.error(
        "scripts/generate-mermaid-notices.mjs changed after mermaid-notices.txt was generated; " +
          "run it without --check",
      );
      process.exit(1);
    }
    const digest = /^Digest: (\w+)$/m.exec(text)?.[1];
    if (digest !== digestOf(text.replace(/^Digest: \w+$/m, "Digest: {digest}"))) {
      console.error("mermaid-notices.txt was edited after it was generated; regenerate it");
      process.exit(1);
    }
    // Every block carries a licence text, not only a label.
    const bodies = [
      ...text.matchAll(new RegExp(`^${SUB}\\n([\\s\\S]*?)(?=\\n${SEP}\\n|(?![\\s\\S]))`, "gm")),
    ];
    if (bodies.some((m) => !/copyright|permission|licen[cs]e/i.test(m[1]))) {
      console.error("mermaid-notices.txt has a block with no licence text; regenerate it");
      process.exit(1);
    }
    return;
  }
  await writeFile(NOTICES_FILE, await render(components, version), "utf8");
  const cites = ownSourceCitations(map);
  if (cites.length > 0) {
    console.log(`mermaid's own sources cite (audit by hand):\n  ${cites.join("\n  ")}`);
  }
  const shown = NOTICES_FILE instanceof URL ? fileURLToPath(NOTICES_FILE) : NOTICES_FILE;
  console.log(`mermaid-notices: ${shown} (${components.length} components)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
