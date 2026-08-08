<script setup lang="ts">
// The one thing this page has to prove: many sources go in, one file comes out,
// and the shape of the directory is what the output is built around. The tree
// and the artifacts match the command under the hero buttons, so the two read as
// one story — run that, get this. The HTML artifact links to the single-file
// sample scripts/site-build.sh publishes from examples/.
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

// The directory the command below is pointed at.
const ROOT = './docs'

// Named for the directory they came from, not for a kind of document: monodocs
// bundles whatever set of pages it is given, which is not necessarily a manual.
const ARTIFACTS = { html: 'docs.html', pdf: 'docs.pdf' }

// Markdown and AsciiDoc side by side at the same depth, plus an asset — every
// kind of input that ends up inside the bundle. Written as a tree rather than a
// list of paths because the nesting is the claim being made: the hierarchy of
// pages is what becomes the sidebar of the artifact. The image is not a page and
// gets no sidebar entry of its own; it is here because assets are pulled into
// the bundle too. Kept short on purpose: the rows are set in monospace and never
// wrapped, so a long name is what makes the diagram outgrow the hero column.
const SOURCES = [
  { name: 'docs/', depth: 0 },
  { name: 'index.md', depth: 1 },
  { name: 'guide/', depth: 1 },
  { name: 'install.md', depth: 2 },
  { name: 'config.adoc', depth: 2 },
  { name: 'notes/', depth: 1 },
  { name: 'faq.adoc', depth: 2 },
  { name: 'images/', depth: 1 },
  { name: 'logo.svg', depth: 2 }
]

// The connectors are derived, not drawn by hand, so the list above stays the one
// place the structure is declared. A row draws the vertical segment for its own
// level — stopping at the row's centre when it is the last entry in its
// directory, running the whole row when a sibling follows — plus one for every
// ancestor directory that still has entries below.
const open: string[] = []
const ROWS = SOURCES.map((source, i) => {
  const segments: { level: number; half: boolean }[] = []

  // The path is only there to key the list. Two files in different folders can
  // share a name, and a name alone would then be a duplicate key.
  open[source.depth] = source.name
  const path = open.slice(0, source.depth + 1).join('')

  for (let level = 0; level < source.depth; level++) {
    let follows = false
    for (const next of SOURCES.slice(i + 1)) {
      // A shallower row closes this directory, so nothing below belongs to it.
      if (next.depth <= level) break
      if (next.depth === level + 1) {
        follows = true
        break
      }
    }

    const own = level === source.depth - 1
    if (own || follows) segments.push({ level, half: own && !follows })
  }

  return { ...source, path, segments, isDir: source.name.endsWith('/') }
})

// Vertical centre of each row, in the 0–100 space of the fan's viewBox. The list
// renders as equal rows, so these stay correct at any height.
const ROW_CENTERS = SOURCES.map((_, i) => ((i + 0.5) / SOURCES.length) * 100)

// UI strings live here rather than in the page Markdown because the diagram is
// one component shared by both locales. File names, paths, the artifact names,
// and the flag are machine strings and are the same in every language.
const LABELS = {
  en: {
    caption: `The files in ${ROOT}, nested in folders, bundle into a single ${ARTIFACTS.html} whose sidebar follows the same hierarchy of pages, or a single ${ARTIFACTS.pdf}.`,
    sources: `Source files in ${ROOT}`,
    html: ['1 file', 'no server', 'reads offline'],
    pdf: ['1 file', 'bookmarks', 'page links'],
    open: 'Open the sample'
  },
  ja: {
    caption: `${ROOT} 内のファイルは、ページの階層がそのままサイドバーになる単一の ${ARTIFACTS.html}、または単一の ${ARTIFACTS.pdf} にまとまります。`,
    sources: `${ROOT} 内のソースファイル`,
    html: ['1 ファイル', 'サーバ不要', 'オフラインで読める'],
    pdf: ['1 ファイル', 'しおり付き', 'ページ間リンク'],
    open: 'サンプルを開く'
  }
}

const { lang } = useData()
const isJa = computed(() => lang.value.startsWith('ja'))
const t = computed(() => (isJa.value ? LABELS.ja : LABELS.en))

// The published sample is per locale, and it sits in public/ — outside VitePress
// routing — so the link needs the site base prefixed and must open natively. An
// in-page navigation would be intercepted by the router and render a 404.
const sampleHref = computed(() => withBase(isJa.value ? '/ja/sample.html' : '/sample.html'))
</script>

<template>
  <figure class="bundle">
    <!-- What the drawing says with geometry — the nesting, and everything
         converging on one file — put in words for a screen reader, which is
         given none of it: the connectors and the fan are hidden from it, and the
         sources are one flat list because the fan depends on rows of equal
         height. -->
    <figcaption class="bundle-caption">{{ t.caption }}</figcaption>

    <div class="bundle-body">
      <ul class="sources" :aria-label="t.sources">
        <li
          v-for="row in ROWS"
          :key="row.path"
          :class="{ dir: row.isDir }"
          :style="{ '--depth': row.depth }"
        >
          <span
            v-for="segment in row.segments"
            :key="segment.level"
            class="seg"
            :class="{ 'seg-half': segment.half }"
            :style="{ '--level': segment.level }"
            aria-hidden="true"
          ></span>
          <span
            v-if="row.depth > 0"
            class="tick"
            :style="{ '--level': row.depth - 1 }"
            aria-hidden="true"
          ></span>
          {{ row.name }}
        </li>
      </ul>

      <svg
        class="fan"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          v-for="(y, i) in ROW_CENTERS"
          :key="y"
          :d="`M 0,${y} C 30,${y} 42,50 68,50`"
          :style="{ '--i': i }"
          vector-effect="non-scaling-stroke"
        />
        <!-- One bundle, two possible artifacts. Equal card rows put these two
             ends on each card's centre to within a pixel or two: the gap between
             the cards moves each true centre by half of it. -->
        <path
          d="M 68,50 C 84,50 86,25 100,25"
          :style="{ '--i': ROW_CENTERS.length }"
          vector-effect="non-scaling-stroke"
        />
        <path
          d="M 68,50 C 84,50 86,75 100,75"
          :style="{ '--i': ROW_CENTERS.length + 1 }"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <div class="drop" aria-hidden="true">↓</div>

      <div class="artifacts">
        <a class="artifact" :href="sampleHref" target="_blank" rel="noopener">
          <span class="artifact-name">{{ ARTIFACTS.html }}</span>
          <ul class="artifact-facts">
            <li v-for="fact in t.html" :key="fact">{{ fact }}</li>
          </ul>
          <span class="artifact-open">
            {{ t.open }}<span class="artifact-arrow" aria-hidden="true">↗</span>
          </span>
        </a>

        <!-- Not a link: the HTML artifact has a published sample to open, the
             PDF does not. -->
        <div class="artifact">
          <span class="artifact-name">
            {{ ARTIFACTS.pdf }}
            <!-- The card says how, not just what: PDF is the one output that
                 takes a flag, and it is short enough to sit on the name row. -->
            <span class="artifact-flag">--format pdf</span>
          </span>
          <ul class="artifact-facts">
            <li v-for="fact in t.pdf" :key="fact">{{ fact }}</li>
          </ul>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.bundle {
  margin: 0;
  width: 100%;
  max-width: 512px;
}

.bundle-caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The fan gets a fixed width, not a flexible track. Anything elastic here makes
   the curves' geometry depend on how much room the hero column happens to have:
   too wide and their near-horizontal approach stretches into a flat run that
   reads as detached from the artifacts, too narrow and they bunch up. Fixed plus
   `justify-content: start` means the three parts sit the same distance apart at
   every width, and spare room falls outside the diagram. */
.bundle-body {
  display: grid;
  grid-template-columns: minmax(0, auto) 118px minmax(0, auto);
  justify-content: start;
  align-items: stretch;
}

/* Equal rows are what let the fan line up: the curves are placed at fractions of
   the viewBox, so they stay on their rows however tall the diagram ends up. The
   min-height sets how far the fan spreads when the artifacts are short. */
.sources {
  display: grid;
  grid-auto-rows: 1fr;
  margin: 0;
  padding: 0;
  min-height: 210px;
  list-style: none;
}

.sources li {
  position: relative;
  display: flex;
  align-items: center;
  /* One indent step per level, and a gap before the fan starts so the longest
     name cannot sit against the first curve when the column is tight. */
  padding-left: calc(var(--depth) * 18px);
  padding-right: 10px;
  font-family: var(--vp-font-family-mono);
  /* Scales with the viewport so the longest name still fits the hero column
     between 960px (where the diagram moves beside the text) and full width. */
  font-size: clamp(10.5px, 1.15vw, 12.5px);
  line-height: 1.3;
  white-space: nowrap;
  color: var(--md-ink-2);
}

/* Directories read a shade stronger than the files hanging off them, and the
   root a shade stronger again: it is the thing the command is pointed at. */
.sources li.dir {
  color: var(--md-ink);
}

.sources li:first-child {
  font-weight: 600;
}

/* The spine of one directory level, running the height of this row. Rows sit
   flush against each other, so the segments join into one continuous hairline. */
.seg {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--level) * 18px + 5px);
  border-left: 1px solid var(--md-rule);
}

/* The last entry in a directory closes its spine at the elbow. */
.seg-half {
  bottom: 50%;
}

.tick {
  position: absolute;
  top: 50%;
  left: calc(var(--level) * 18px + 5px);
  width: 8px;
  border-top: 1px solid var(--md-rule);
}

/* Stretched to the height of the sources block, so viewBox y maps to rows. */
.fan {
  width: 100%;
  height: 100%;
}

.fan path {
  fill: none;
  stroke: var(--md-ink-3);
  stroke-width: 1;
  opacity: 0.7;
}

.drop {
  display: none;
}

/* Equal rows again: they put the gap between the two cards exactly on the
   fan's convergence, so neither output looks like the primary one by position. */
.artifacts {
  display: grid;
  grid-auto-rows: 1fr;
  gap: 10px;
}

.artifact {
  border: 1px solid var(--md-rule);
  border-left: 3px solid var(--md-bind);
  border-radius: 2px;
  padding: 13px 15px 12px;
  background-color: var(--vp-c-bg-elv);
  text-decoration: none;
  transition:
    border-color 0.2s,
    transform 0.2s;
}

a.artifact:hover {
  border-color: var(--md-bind);
  transform: translateY(-1px);
}

.artifact-name {
  display: block;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  color: var(--md-ink);
}

.artifact-flag {
  padding-left: 7px;
  font-size: 11px;
  font-weight: 400;
  color: var(--md-ink-3);
}

.artifact-facts {
  margin: 7px 0 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--md-ink-2);
}

.artifact-open {
  display: block;
  padding-top: 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--md-bind);
}

.artifact-arrow {
  padding-left: 4px;
}

/* The bundling reads as a single gesture on load: the curves arrive in the order
   of the tree, the split arrives last, and the artifacts land. The animation is
   declared inside the query rather than undone in a `reduce` block afterwards,
   so a reader who prefers reduced motion gets the finished drawing from the
   markup with nothing to take back. Inside the query the finished state does
   depend on the animation: everything below starts at `opacity: 0` and is left
   visible by `forwards`.

   Opacity, not a stroke-dash reveal, even though drawing each curve on would
   suit the diagram better. `vector-effect: non-scaling-stroke` is what keeps the
   curves at a hairline under this column's very non-uniform scale, and it also
   makes Chromium measure the dash pattern in screen space: a `pathLength`-
   normalised dasharray is then far shorter than the curve it is meant to cover,
   so the tail of every path stays undrawn even at the end of the animation. */
@media (prefers-reduced-motion: no-preference) {
  .fan path {
    opacity: 0;
    animation: bundle-draw 0.45s ease-out forwards;
    animation-delay: calc(var(--i) * 35ms);
  }

  /* Opacity only. An animation that also touches `transform` keeps hold of it
     once `forwards` retains the last keyframe, which would silently cancel the
     hover lift above for the rest of the visit. */
  .artifact {
    opacity: 0;
    animation: bundle-land 0.4s ease-out 0.55s forwards;
  }

  /* Lands on the same 0.7 the fan is drawn at, so the last frame is the resting
     state rather than a step back to it. */
  @keyframes bundle-draw {
    to {
      opacity: 0.7;
    }
  }

  @keyframes bundle-land {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}

/* Too narrow for a fan: stack the transformation vertically instead. */
@media (max-width: 639px) {
  .bundle {
    max-width: 340px;
  }

  .bundle-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .sources {
    grid-auto-rows: auto;
    min-height: auto;
  }

  .sources li {
    padding-block: 3px;
    font-size: 12.5px;
  }

  .fan {
    display: none;
  }

  .drop {
    display: block;
    padding: 10px 0 12px 12px;
    font-size: 15px;
    line-height: 1;
    color: var(--md-ink-3);
  }

  .artifacts {
    grid-auto-rows: auto;
  }
}
</style>
