<script lang="ts">
  import { workspace } from '../core/store.svelte';

  type Props = {
    leftIndex: number;       // slot index immediately to the left of this gap
    containerEl: HTMLElement | null;
  };
  let { leftIndex, containerEl }: Props = $props();

  let dragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    if (!containerEl) return;
    e.preventDefault();
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startFr = workspace.slotFractions.slice();
    const totalFr = startFr.reduce((s, f) => s + f, 0);
    // Usable px = container width minus all resizers (each 4px), N = slots count
    const N = workspace.slots.length;
    const resizerPx = (N - 1) * 6;
    const usablePx = Math.max(1, containerEl.clientWidth - resizerPx);

    const minFr = 0.2;

    function onMove(ev: PointerEvent) {
      const dxPx = ev.clientX - startX;
      const dxFr = (dxPx / usablePx) * totalFr;
      let l = startFr[leftIndex] + dxFr;
      let r = startFr[leftIndex + 1] - dxFr;
      // Clamp to minimum, redistributing the overage
      if (l < minFr) { r += l - minFr; l = minFr; }
      if (r < minFr) { l += r - minFr; r = minFr; }
      if (l < minFr || r < minFr) return;
      const next = startFr.slice();
      next[leftIndex] = l;
      next[leftIndex + 1] = r;
      workspace.slotFractions = next;
    }

    function onUp() {
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Persist the final fractions
      workspace.setSlotFractions(workspace.slotFractions);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onDblClick() {
    workspace.resetSlotFractions();
  }
</script>

<div
  class="resizer"
  class:dragging
  onpointerdown={onPointerDown}
  ondblclick={onDblClick}
  role="separator"
  aria-orientation="vertical"
  title="Drag to resize · double-click to reset"
><span class="grip" aria-hidden="true"></span></div>

<style>
  /* Element fills the full 6px column. Visible line is the center 1px,
     painted via background-clip; the rest is invisible click area. */
  .resizer {
    width: 6px;
    cursor: col-resize;
    background:
      linear-gradient(to right, transparent 2px, var(--border) 2px, var(--border) 3px, transparent 3px);
    flex-shrink: 0;
    user-select: none;
    transition: background 120ms;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .resizer:hover {
    background:
      linear-gradient(to right, transparent 2px, var(--accent) 2px, var(--accent) 3px, transparent 3px);
  }
  .resizer.dragging {
    background:
      linear-gradient(to right, transparent 1px, var(--accent) 1px, var(--accent) 4px, transparent 4px);
  }
  /* Tiny grip dots — only visible on hover, signal "drag me" without taking space. */
  .grip {
    width: 4px; height: 28px;
    background: radial-gradient(circle 1px at 50% 25%, var(--accent), transparent 1.4px),
                radial-gradient(circle 1px at 50% 50%, var(--accent), transparent 1.4px),
                radial-gradient(circle 1px at 50% 75%, var(--accent), transparent 1.4px);
    opacity: 0;
    transition: opacity 120ms;
  }
  .resizer:hover .grip, .resizer.dragging .grip { opacity: 1; }
</style>
