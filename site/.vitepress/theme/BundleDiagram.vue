<script setup lang="ts">
// The one thing this page has to prove: many sources go in, one file comes out.
// The directory and the artifact match the command under the hero buttons, so
// the two read as one story — run that, get this. The artifact links to the
// single-file sample scripts/site-build.sh publishes from examples/.
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

// The directory the command below is pointed at.
const ROOT = './docs'

// Named for the directory it came from, not for a kind of document: monodocs
// bundles whatever set of pages it is given, which is not necessarily a manual.
const ARTIFACT = 'docs.html'

// Markdown and AsciiDoc side by side in one tree, plus an asset — every kind of
// input that ends up inside the bundle. Kept short on purpose: the row is set in
// monospace and never wrapped, so a long path is what makes the diagram outgrow
// the hero column.
const SOURCES = [
  'index.md',
  'guide/install.md',
  'guide/config.adoc',
  'notes/faq.md',
  'images/logo.svg'
]

// Vertical centre of each row, in the 0–100 space of the fan's viewBox. The
// list renders as six equal rows (the five paths above plus the ellipsis), so
// these stay correct at any height.
const ROW_CENTERS = [8.33, 25, 41.67, 58.33, 75, 91.67]

// UI strings live here rather than in the page Markdown because the diagram is
// one component shared by both locales. File names, paths, and the artifact name
// are machine strings and are the same in every language.
const LABELS = {
  en: {
    sources: `Source files in ${ROOT}`,
    rest: 'and more',
    facts: ['1 file', 'no server', 'reads offline'],
    open: 'Open the sample'
  },
  ja: {
    sources: `${ROOT} 内のソースファイル`,
    rest: 'ほか複数',
    facts: ['1 ファイル', 'サーバ不要', 'オフラインで読める'],
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
    <figcaption class="bundle-root">{{ ROOT }}</figcaption>

    <div class="bundle-body">
      <ul class="sources" :aria-label="t.sources">
        <li v-for="source in SOURCES" :key="source">{{ source }}</li>
        <li class="sources-rest">
          <span aria-hidden="true">…</span>
          <span class="sources-rest-label">{{ t.rest }}</span>
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
          :d="`M 0,${y} C 46,${y} 54,50 100,50`"
          :style="{ '--i': i }"
          pathLength="1"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <div class="drop" aria-hidden="true">↓</div>

      <a class="artifact" :href="sampleHref" target="_blank" rel="noopener">
        <span class="artifact-name">{{ ARTIFACT }}</span>
        <ul class="artifact-facts">
          <li v-for="fact in t.facts" :key="fact">{{ fact }}</li>
        </ul>
        <span class="artifact-open">
          {{ t.open }}<span class="artifact-arrow" aria-hidden="true">↗</span>
        </span>
      </a>
    </div>
  </figure>
</template>

<style scoped>
.bundle {
  margin: 0;
  width: 100%;
  max-width: 512px;
}

.bundle-root {
  padding-bottom: 10px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--md-ink-3);
}

/* The fan gets a fixed width, not a flexible track. Anything elastic here makes
   the curves' geometry depend on how much room the hero column happens to have:
   too wide and their near-horizontal approach stretches into a flat run that
   reads as detached from the artifact, too narrow and they bunch up. Fixed plus
   `justify-content: start` means the three parts sit the same distance apart at
   every width, and spare room falls outside the diagram. */
.bundle-body {
  display: grid;
  grid-template-columns: minmax(0, auto) 132px minmax(0, auto);
  justify-content: start;
  align-items: stretch;
}

/* The spine: one hairline the sources hang off, echoing the bound artifact. */
/* The min-height sets how far the fan spreads: the grid row stretches to it, so
   the six sources sit far enough apart for the convergence to read. */
.sources {
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  margin: 0;
  padding: 0 0 0 12px;
  min-height: 182px;
  border-left: 1px solid var(--md-rule);
  list-style: none;
}

.sources li {
  display: flex;
  align-items: center;
  /* Guarantees a gap before the fan starts, so the longest path cannot sit
     against the first curve when the column is tight. */
  padding-right: 10px;
  font-family: var(--vp-font-family-mono);
  /* Scales with the viewport so the longest path still fits the hero column
     between 960px (where the diagram moves beside the text) and full width. */
  font-size: clamp(10.5px, 1.15vw, 12.5px);
  line-height: 1.3;
  white-space: nowrap;
  color: var(--md-ink-2);
}

.sources-rest {
  color: var(--md-ink-3);
}

/* The ellipsis carries "there is more in the directory" visually; this says the
   same thing to a screen reader, which cannot read an ellipsis as meaning. */
.sources-rest-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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

.artifact {
  align-self: center;
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

.artifact:hover {
  border-color: var(--md-bind);
  transform: translateY(-1px);
}

.artifact-name {
  display: block;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--md-ink);
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

/* The bundling reads as a single gesture on load: the paths draw in order, then
   the artifact lands. Declared here rather than reduced away afterwards, so the
   finished state is what the markup renders when motion is unwanted or
   animation never runs at all. */
@media (prefers-reduced-motion: no-preference) {
  .fan path {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: bundle-draw 0.55s ease-out forwards;
    animation-delay: calc(var(--i) * 60ms);
  }

  /* Opacity only. An animation that also touches `transform` keeps hold of it
     once `forwards` retains the last keyframe, which would silently cancel the
     hover lift below for the rest of the visit. */
  .artifact {
    opacity: 0;
    animation: bundle-land 0.4s ease-out 0.42s forwards;
  }

  @keyframes bundle-draw {
    to {
      stroke-dashoffset: 0;
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
    grid-template-rows: none;
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

  .artifact {
    align-self: start;
  }
}
</style>
