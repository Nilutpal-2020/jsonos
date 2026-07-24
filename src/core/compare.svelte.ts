/**
 * Compare store — links two doc IDs as a side-by-side pair, holds ignore rules,
 * and exposes a memoized DiffResult that auto-recomputes when either text or
 * the rules change.
 */

import type { DocStore } from './store.svelte';
import { workspace } from './store.svelte';
import {
  diffJson, collectChanges,
  DEFAULT_RULES, type IgnoreRules, type DiffNode, type DiffResult,
} from './diff-engine';

const STORAGE_RULES_KEY = 'jsonos.compareRules';

function readRules(): IgnoreRules {
  try {
    const raw = localStorage.getItem(STORAGE_RULES_KEY);
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RULES, ...parsed };
  } catch { return DEFAULT_RULES; }
}

class CompareStore {
  /** When non-null, slots `left` and `right` are diff-paired. */
  pair = $state<{ left: number; right: number } | null>(null);
  rules = $state<IgnoreRules>(readRules());

  effectivePair = $derived.by<{ left: number; right: number } | null>(() => {
    if (this.pair) return this.pair;
    if (workspace.slots.length >= 2 && workspace.slots[0].docId !== workspace.slots[1].docId) {
      return { left: 0, right: 1 };
    }
    return null;
  });

  leftDoc = $derived<DocStore | null>(this.effectivePair ? workspace.slotDoc(this.effectivePair.left) ?? null : null);
  rightDoc = $derived<DocStore | null>(this.effectivePair ? workspace.slotDoc(this.effectivePair.right) ?? null : null);

  result = $derived.by<DiffResult | null>(() => {
    const L = this.leftDoc;
    const R = this.rightDoc;
    if (!L || !R) return null;
    if (L.parse.errors.length || R.parse.errors.length) return null;
    if (L.parse.value === undefined || R.parse.value === undefined) return null;
    return diffJson(
      $state.snapshot(L.parse.value as any),
      $state.snapshot(R.parse.value as any),
      this.rules,
    );
  });

  /** Flat list of changed leaf nodes for prev/next navigation. */
  changes = $derived<DiffNode[]>(this.result ? collectChanges(this.result.root) : []);

  /** Sync-scroll: ratio in [0,1] published by whichever paired slot scrolled
      last. Peers $effect on this and mirror their own scroll position. */
  scrollSignal = $state<number | null>(null);
  scrollSourceSlot = $state<number | null>(null);

  publishScroll(slotIdx: number, ratio: number) {
    if (!Number.isFinite(ratio)) return;
    this.scrollSourceSlot = slotIdx;
    this.scrollSignal = Math.max(0, Math.min(1, ratio));
  }

  /** Establish a pair from two slot indices. */
  setPair(leftSlot: number, rightSlot: number) {
    if (leftSlot === rightSlot) return;
    this.pair = { left: leftSlot, right: rightSlot };
  }

  clear() { this.pair = null; }

  /** True if `slotIdx` is part of the active pair. */
  isPaired(slotIdx: number): boolean {
    if (this.effectivePair) {
      return this.effectivePair.left === slotIdx || this.effectivePair.right === slotIdx;
    }
    return false;
  }

  /** Which side of the pair is this slot? */
  side(slotIdx: number): 'left' | 'right' | null {
    if (!this.effectivePair) return null;
    if (slotIdx === this.effectivePair.left)  return 'left';
    if (slotIdx === this.effectivePair.right) return 'right';
    return null;
  }

  setRules(next: IgnoreRules) {
    this.rules = next;
    try { localStorage.setItem(STORAGE_RULES_KEY, JSON.stringify(next)); } catch {}
  }

  toggleRule<K extends keyof IgnoreRules>(k: K, v: IgnoreRules[K]) {
    this.setRules({ ...this.rules, [k]: v });
  }
}

export const compare = new CompareStore();
