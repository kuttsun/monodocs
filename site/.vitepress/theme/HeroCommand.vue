<script setup lang="ts">
// The command that produces the artifact in the diagram, placed under the hero
// buttons so the shortest path to a result is on the page itself.
import { computed, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

// The output is named after the directory it came from rather than after a kind
// of document, so the example does not imply monodocs is only for manuals.
const COMMAND = 'npx monodocs build ./docs -o dist/docs.html'

const LABELS = {
  en: {
    copy: 'Copy',
    copied: 'Copied',
    failed: 'Could not copy. Select the command to copy it by hand.'
  },
  ja: {
    copy: 'コピー',
    copied: 'コピーしました',
    failed: 'コピーできませんでした。コマンドを選択してコピーしてください。'
  }
}

const { lang } = useData()
const t = computed(() => (lang.value.startsWith('ja') ? LABELS.ja : LABELS.en))

// The button keeps one name through the whole flow; what happened is reported in
// the status line instead, which is also where a screen reader picks it up.
const status = ref('')
let clear: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(COMMAND)
    status.value = t.value.copied
  } catch {
    // Blocked by permission, a Permissions-Policy, or a non-secure context —
    // say so, because the command is not focusable and silence would leave a
    // keyboard user with no way to tell the copy did not happen.
    status.value = t.value.failed
  }
  clearTimeout(clear)
  clear = setTimeout(() => (status.value = ''), 4000)
}

onUnmounted(() => clearTimeout(clear))
</script>

<template>
  <div class="command">
    <div class="command-row">
      <code class="command-line">{{ COMMAND }}</code>
      <button class="command-copy" type="button" @click="copy">{{ t.copy }}</button>
    </div>
    <p class="command-status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.command {
  margin-top: 34px;
  border-top: 1px solid var(--md-rule);
  padding-top: 14px;
  max-width: 576px;
}

.command-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.command-line {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
  white-space: nowrap;
  color: var(--md-ink-2);
}

/* The prompt marks the line as something to type, and stays out of a
   selection so copying by hand yields the command alone. */
.command-line::before {
  content: '$ ';
  user-select: none;
  color: var(--md-ink-3);
}

.command-copy {
  flex-shrink: 0;
  border: 1px solid var(--md-rule);
  border-radius: 2px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--md-ink-2);
  transition:
    border-color 0.2s,
    color 0.2s;
}

.command-copy:hover {
  border-color: var(--md-bind);
  color: var(--md-bind);
}

/* Height is held whether or not there is a message, so reporting the outcome
   does not shift the page. */
.command-status {
  margin: 0;
  min-height: 1.5em;
  padding-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--md-ink-3);
}

@media (max-width: 639px) {
  .command {
    margin-top: 26px;
  }

  .command-row {
    align-items: flex-start;
  }

  /* Wrap at the spaces rather than scrolling out of sight: on a phone the whole
     command has to be readable without a gesture that is not signposted. */
  .command-line {
    overflow-x: visible;
    white-space: pre-wrap;
  }
}
</style>
