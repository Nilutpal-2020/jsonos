<script lang="ts">
  import { theme, type ThemeMode } from '../core/theme.svelte';

  const MODES: { value: ThemeMode; icon: string; label: string }[] = [
    { value: 'light',  icon: '☀',   label: 'Light' },
    { value: 'system', icon: '◐',   label: 'System' },
    { value: 'dark',   icon: '☾',   label: 'Dark'  },
  ];
</script>

<div class="seg" role="group" aria-label="Theme">
  {#each MODES as m}
    <button
      type="button"
      class:on={theme.mode === m.value}
      onclick={() => theme.set(m.value)}
      title="{m.label} theme"
      aria-pressed={theme.mode === m.value}
    >
      <span class="ic">{m.icon}</span>
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface);
  }
  .seg button {
    background: transparent;
    color: var(--muted);
    border: 0;
    border-left: 1px solid var(--border);
    padding: 4px 8px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    line-height: 1;
    min-width: 26px;
  }
  .seg button:first-child { border-left: 0; }
  .seg button:hover { color: var(--fg); background: var(--row-hover); }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .ic { display: inline-block; transform: translateY(-1px); }
</style>
