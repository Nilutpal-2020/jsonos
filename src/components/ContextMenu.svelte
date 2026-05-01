<script lang="ts" module>
  export type MenuItem =
    | { kind: 'item'; label: string; icon?: string; hint?: string; disabled?: boolean; danger?: boolean; onSelect: () => void }
    | { kind: 'submenu'; label: string; icon?: string; items: MenuItem[]; disabled?: boolean }
    | { kind: 'divider' };
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  type Props = {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
  };
  let { x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let openSub = $state<number | null>(null);
  let pos = $state({ x: 0, y: 0 });

  // Clamp menu inside viewport after render.
  onMount(() => {
    pos = { x, y };
    if (!menuEl) return;
    const r = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + r.width  > vw - 6) nx = Math.max(6, vw - r.width - 6);
    if (ny + r.height > vh - 6) ny = Math.max(6, vh - r.height - 6);
    pos = { x: nx, y: ny };
    menuEl.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }
  function onBackdrop() { onClose(); }
  function onContextBackdrop(e: MouseEvent) { e.preventDefault(); onClose(); }

  function pick(it: Extract<MenuItem, { kind: 'item' }>) {
    if (it.disabled) return;
    onClose();
    queueMicrotask(() => it.onSelect());
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="presentation"
  onmousedown={onBackdrop}
  oncontextmenu={onContextBackdrop}
></div>

<div
  class="menu"
  bind:this={menuEl}
  tabindex="-1"
  role="menu"
  style:left="{pos.x}px"
  style:top="{pos.y}px"
>
  {#each items as it, i}
    {#if it.kind === 'divider'}
      <div class="divider" role="separator"></div>
    {:else if it.kind === 'submenu'}
      <div
        class="row sub"
        class:disabled={it.disabled}
        role="menuitem"
        tabindex="-1"
        aria-haspopup="menu"
        aria-expanded={openSub === i}
        aria-disabled={it.disabled ? 'true' : 'false'}
        onmouseenter={() => { if (!it.disabled) openSub = i; }}
        onclick={() => { if (!it.disabled) openSub = openSub === i ? null : i; }}
        onkeydown={(e) => {
          if (it.disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSub = openSub === i ? null : i; }
        }}
      >
        {#if it.icon}<span class="icon">{it.icon}</span>{/if}
        <span class="label">{it.label}</span>
        <span class="chev">›</span>
        {#if openSub === i}
          <div class="submenu" role="menu">
            {#each it.items as si}
              {#if si.kind === 'divider'}
                <div class="divider"></div>
              {:else if si.kind === 'item'}
                <button
                  class="row"
                  class:disabled={si.disabled}
                  class:danger={si.danger}
                  onclick={(e) => { e.stopPropagation(); pick(si); }}
                  type="button"
                  role="menuitem"
                  disabled={si.disabled}
                >
                  {#if si.icon}<span class="icon">{si.icon}</span>{/if}
                  <span class="label">{si.label}</span>
                  {#if si.hint}<span class="hint">{si.hint}</span>{/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <button
        class="row"
        class:disabled={it.disabled}
        class:danger={it.danger}
        onclick={() => pick(it)}
        type="button"
        role="menuitem"
        disabled={it.disabled}
      >
        {#if it.icon}<span class="icon">{it.icon}</span>{/if}
        <span class="label">{it.label}</span>
        {#if it.hint}<span class="hint">{it.hint}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
    background: transparent;
  }
  .menu {
    position: fixed;
    z-index: 200;
    min-width: 200px;
    background: var(--surface-hi);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 4px;
    box-shadow: var(--shadow);
    color: var(--fg);
    font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    outline: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: 0;
    border-radius: var(--radius);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    position: relative;
  }
  .row:hover:not(.disabled) { background: var(--row-hover-strong); }
  .row.disabled { color: var(--muted); cursor: not-allowed; opacity: 0.55; }
  .row.danger { color: var(--err); }
  .row .icon { width: 14px; text-align: center; opacity: 0.85; flex-shrink: 0; }
  .row .label { flex: 1; }
  .row .hint {
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
  }
  .row.sub .chev { color: var(--muted); }
  .divider { height: 1px; background: var(--border); margin: 4px 2px; }
  .submenu {
    position: absolute;
    left: 100%;
    top: -5px;
    min-width: 180px;
    background: var(--surface-hi);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 4px;
    box-shadow: var(--shadow);
  }
</style>
