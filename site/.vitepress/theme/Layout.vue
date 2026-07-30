<script setup lang="ts">
// Fills the two home-hero slots the default theme leaves open:
// the image area (with the bundle diagram) and the area under the buttons
// (with the command that produces the artifact the diagram points at).
import DefaultTheme from 'vitepress/theme-without-fonts'
import BundleDiagram from './BundleDiagram.vue'
import HeroCommand from './HeroCommand.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <BundleDiagram />
    </template>
    <template #home-hero-actions-after>
      <HeroCommand />
    </template>
  </Layout>
</template>
