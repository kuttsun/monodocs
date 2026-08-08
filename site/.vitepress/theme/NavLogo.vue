<script setup lang="ts">
// The product mark, in the nav bar beside the name.
//
// Inline rather than `themeConfig.logo`, which takes a file. A file would have
// to state its own colours, and would need a second copy for dark mode — two
// more places holding the palette that style.css owns. Drawn here it is filled
// with `currentColor`, so it is always exactly the ink the title next to it is
// set in, in either theme and through the toggle.
//
// The drawing is site/public/favicon.svg without its paper tile: the tile is
// what keeps the icon legible on a browser tab strip, and here the nav bar is
// already paper. Keep the two in step — this is the same book.
</script>

<template>
  <svg
    class="nav-logo"
    viewBox="3 5 26 22"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M15.2 8C12.4 6.2 9 5.2 6 5.2 4.6 5.2 3.4 6.1 3.4 7.4v14.3c0 1.2 1 1.9 2.3 1.9 3.1 0 6.7 1 9.5 2.8Z"
    />
    <path
      d="M16.8 8c2.8-1.8 6.2-2.8 9.2-2.8 1.4 0 2.6.9 2.6 2.2v14.3c0 1.2-1 1.9-2.3 1.9-3.1 0-6.7 1-9.5 2.8Z"
    />
    <!-- The rules are cut out of the pages rather than drawn over them, so the
         mark stays one colour and needs no second value for the page fill. -->
    <g stroke="var(--vp-c-bg)" stroke-width="2.2" stroke-linecap="round">
      <path d="M6.4 12 13.2 14.1" />
      <path d="M6.4 17.2 13.2 19.3" />
      <path d="M25.6 12 18.8 14.1" />
      <path d="M25.6 17.2 18.8 19.3" />
    </g>
  </svg>
</template>

<style scoped>
/* Sized against the name it sits beside rather than in pixels, so the two keep
   their proportion if the nav title's size ever changes. */
.nav-logo {
  width: 1.45em;
  height: 1.45em;
  margin-right: 9px;
  flex-shrink: 0;
}
</style>
