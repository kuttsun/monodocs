<script setup lang="ts">
// Fills the slots the default theme leaves open: the two home-hero slots — the
// image area (with the bundle diagram) and the area under the buttons (with the
// command that produces the artifact the diagram points at) — and the nav bar
// title, which gets the product mark before the name.
import DefaultTheme from 'vitepress/theme-without-fonts'
import BundleDiagram from './BundleDiagram.vue'
import HeroCommand from './HeroCommand.vue'
import NavLogo from './NavLogo.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #nav-bar-title-before>
      <NavLogo />
    </template>
    <template #home-hero-image>
      <BundleDiagram />
    </template>
    <template #home-hero-actions-after>
      <HeroCommand />
    </template>
  </Layout>
</template>
