import type { JsonPath, JsonValue, ParseResult } from './types';
import { jsonWorker } from '../workers/client';
import { applyPatch } from './patch';
import { persist, type PersistedDoc } from './persist';

const HISTORY_LIMIT = 200;
const PARSE_DEBOUNCE_MS = 80;
const SAVE_DEBOUNCE_MS = 400;
const ACTIVE_KEY = 'activeDocId';
const SLOTS_KEY = 'slots';
const SLOT_FRACTIONS_KEY = 'slotFractions';
export const MAX_SLOTS = 3;
const MIN_SLOT_FR = 0.2;

export type SlotView = 'text' | 'tree' | 'table';
export interface Slot {
  docId: string;
  view: SlotView;
}

interface HistoryEntry {
  text: string;
}

function emptyParse(text: string): ParseResult {
  return { text, value: undefined, errors: [], byteSize: new Blob([text]).size };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export class DocStore {
  id: string;
  text = $state('');
  parse = $state<ParseResult>(emptyParse(''));
  name = $state('untitled.json');
  schemaText = $state('');
  schemaErrors = $state<{ message: string; path: string }[]>([]);
  schemaCompileError = $state('');
  dirty = $state(false);
  parsing = $state(false);

  past: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  private parseTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private parseSeq = 0;
  private schemaSeq = 0;

  constructor(seed?: PersistedDoc) {
    this.id = seed?.id ?? newId();
    if (seed) {
      this.text = seed.text;
      this.name = seed.name;
      this.schemaText = seed.schemaText ?? '';
      this.scheduleParse(0);
      this.scheduleSchema();
    }
  }

  setText(next: string, opts: { history?: boolean } = {}) {
    if (next === this.text) return;
    if (opts.history !== false) {
      this.past.push({ text: this.text });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
    }
    this.text = next;
    this.dirty = true;
    this.scheduleParse();
    this.scheduleSave();
  }

  setSchema(text: string) {
    this.schemaText = text;
    this.scheduleSchema();
    this.scheduleSave();
  }

  replaceParsed(value: JsonValue, indent = 2) {
    this.setText(JSON.stringify(value, null, indent));
  }

  applyValuePatch(patch: Parameters<typeof applyPatch>[1]) {
    // $state.snapshot strips Svelte's reactive proxies — pure modules never see them.
    const plain = this.parse.value === undefined ? undefined : $state.snapshot(this.parse.value as any) as JsonValue;
    const next = applyPatch(plain, patch);
    if (next === undefined) return;
    this.replaceParsed(next as JsonValue);
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push({ text: this.text });
    this.text = prev.text;
    this.scheduleParse(0);
    this.scheduleSave();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ text: this.text });
    this.text = next.text;
    this.scheduleParse(0);
    this.scheduleSave();
  }

  async format(indent = 2) {
    const r = await jsonWorker.format(this.text, indent);
    if (r.ok) this.setText(r.text);
  }
  async minify() {
    const r = await jsonWorker.minify(this.text);
    if (r.ok) this.setText(r.text);
  }
  async repair(): Promise<{ ok: true; changes: string[] } | { ok: false; error: string; partial?: string; changes: string[] }> {
    const r = await jsonWorker.repair(this.text);
    if (r.ok) {
      this.setText(r.text);
      return { ok: true, changes: r.changes };
    }
    return { ok: false, error: r.error, partial: r.partial, changes: r.changes ?? [] };
  }
  async sortKeys(deep = true) {
    const r = await jsonWorker.sortKeys(this.text, deep);
    if (r.ok) this.setText(r.text);
    else throw new Error(r.error);
  }

  load(text: string, name?: string) {
    this.past = [];
    this.future = [];
    this.text = text;
    if (name) this.name = name;
    this.dirty = false;
    this.scheduleParse(0);
    this.scheduleSchema();
    this.scheduleSave(0);
  }

  download() {
    const blob = new Blob([this.text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.name.endsWith('.json') ? this.name : this.name + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  pathToString(path: JsonPath): string {
    return path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('') || '$';
  }

  toPersisted(): PersistedDoc {
    return {
      id: this.id,
      name: this.name,
      text: this.text,
      schemaText: this.schemaText || undefined,
      updatedAt: Date.now(),
    };
  }

  private scheduleParse(delay = PARSE_DEBOUNCE_MS) {
    if (this.parseTimer) clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => this.runParse(), delay);
  }

  private async runParse() {
    const seq = ++this.parseSeq;
    const text = this.text;
    this.parsing = true;
    try {
      const result = await jsonWorker.parse(text);
      if (seq !== this.parseSeq) return;
      this.parse = result;
      // re-validate against schema once parse changes
      this.scheduleSchema();
    } finally {
      if (seq === this.parseSeq) this.parsing = false;
    }
  }

  private scheduleSchema() {
    setTimeout(() => this.runSchema(), 100);
  }

  private async runSchema() {
    const seq = ++this.schemaSeq;
    const schemaText = this.schemaText.trim();
    if (!schemaText) {
      this.schemaErrors = [];
      this.schemaCompileError = '';
      return;
    }
    if (this.parse.errors.length || this.parse.value === undefined) {
      // can't validate invalid JSON
      return;
    }
    const r = await jsonWorker.validateSchema(this.text, schemaText);
    if (seq !== this.schemaSeq) return;
    if (!r.ok) {
      this.schemaCompileError = r.error;
      this.schemaErrors = [];
    } else {
      this.schemaCompileError = '';
      this.schemaErrors = r.errors;
    }
  }

  private scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try { await persist.save(this.toPersisted()); }
      catch { /* quota — ignore */ }
    }, delay);
  }
}

class WorkspaceStore {
  docs = $state<DocStore[]>([new DocStore()]);
  slots = $state<Slot[]>([]);
  slotFractions = $state<number[]>([1]);
  focusedSlotIndex = $state(0);
  ready = $state(false);

  /** Doc shown in the focused slot — what the toolbar / shortcuts target. */
  active = $derived<DocStore>(this.slotDoc(this.focusedSlotIndex) ?? this.docs[0]);

  constructor() {
    this.slots = [{ docId: this.docs[0].id, view: 'text' }];
    this.slotFractions = [1];
  }

  /** Adjust slotFractions length to match slots; fill new slots with 1. */
  private normalizeFractions() {
    const want = this.slots.length;
    if (this.slotFractions.length === want) return;
    const next = this.slotFractions.slice(0, want);
    while (next.length < want) next.push(1);
    this.slotFractions = next;
  }

  setSlotFractions(next: number[]) {
    if (next.length !== this.slots.length) return;
    if (next.some((f) => !Number.isFinite(f) || f < MIN_SLOT_FR)) return;
    this.slotFractions = next;
    this.persistSlots();
  }

  resetSlotFractions() {
    this.slotFractions = this.slots.map(() => 1);
    this.persistSlots();
  }

  slotDoc(slotIdx: number): DocStore | undefined {
    const s = this.slots[slotIdx];
    if (!s) return undefined;
    return this.docs.find((d) => d.id === s.docId);
  }

  async init() {
    const ids = await persist.listIds();
    let docs: DocStore[] = this.docs;
    if (ids.length > 0) {
      const loaded = await Promise.all(ids.map((id) => persist.load(id)));
      const restored = loaded.filter((d): d is PersistedDoc => !!d).map((d) => new DocStore(d));
      restored.sort((a, b) => a.name.localeCompare(b.name));
      if (restored.length > 0) docs = restored;
    }
    // Dedupe duplicate names left over from earlier versions.
    const seen = new Map<string, number>();
    for (const d of docs) {
      const count = seen.get(d.name) ?? 0;
      if (count > 0) {
        const m = d.name.match(/^(.*?)(\.[^.]+)?$/);
        const stem = m?.[1] ?? d.name;
        const ext = m?.[2] ?? '';
        d.name = `${stem}${count}${ext}`;
        (d as any).scheduleSave?.(0);
      }
      seen.set(d.name, count + 1);
    }
    this.docs = docs;

    // Restore slots if persisted, else start with one slot on a sensible doc
    const savedSlots = await persist.getMeta<Slot[]>(SLOTS_KEY);
    const validSlots = (savedSlots ?? [])
      .filter((s) => docs.some((d) => d.id === s.docId))
      .slice(0, MAX_SLOTS);
    if (validSlots.length > 0) {
      this.slots = validSlots;
    } else {
      const last = await persist.getMeta<string>(ACTIVE_KEY);
      const startId = (last && docs.some((d) => d.id === last)) ? last : docs[0].id;
      this.slots = [{ docId: startId, view: 'text' }];
    }

    const savedFractions = await persist.getMeta<number[]>(SLOT_FRACTIONS_KEY);
    if (
      savedFractions
      && savedFractions.length === this.slots.length
      && savedFractions.every((f) => Number.isFinite(f) && f >= MIN_SLOT_FR)
    ) {
      this.slotFractions = savedFractions;
    } else {
      this.slotFractions = this.slots.map(() => 1);
    }

    this.focusedSlotIndex = 0;
    this.ready = true;
  }

  /** Click a tab: if doc is shown in a slot, focus it; else replace focused slot's doc. */
  setActive(id: string) {
    const idx = this.slots.findIndex((s) => s.docId === id);
    if (idx >= 0) {
      this.focusedSlotIndex = idx;
    } else if (this.slots[this.focusedSlotIndex]) {
      const next = this.slots.slice();
      next[this.focusedSlotIndex] = { ...next[this.focusedSlotIndex], docId: id };
      this.slots = next;
    } else {
      this.slots = [{ docId: id, view: 'text' }];
      this.focusedSlotIndex = 0;
    }
    this.persistSlots();
    persist.setMeta(ACTIVE_KEY, id).catch(() => {});
  }

  focusSlot(idx: number) {
    if (idx < 0 || idx >= this.slots.length) return;
    this.focusedSlotIndex = idx;
    const id = this.slots[idx].docId;
    persist.setMeta(ACTIVE_KEY, id).catch(() => {});
  }

  setSlotView(idx: number, view: SlotView) {
    if (!this.slots[idx]) return;
    const next = this.slots.slice();
    next[idx] = { ...next[idx], view };
    this.slots = next;
    this.persistSlots();
  }

  /** Add a new slot (next to focused) showing a given doc, defaulting to focused doc. */
  addSlot(docId?: string, view: SlotView = 'text') {
    if (this.slots.length >= MAX_SLOTS) return;
    const id = docId ?? this.active?.id ?? this.docs[0].id;
    const insertAt = this.focusedSlotIndex + 1;
    const next = [...this.slots.slice(0, insertAt), { docId: id, view }, ...this.slots.slice(insertAt)];
    this.slots = next;
    const fr = this.slotFractions.slice();
    fr.splice(insertAt, 0, 1);
    this.slotFractions = fr;
    this.focusedSlotIndex = insertAt;
    this.persistSlots();
  }

  /** Replace slots with [A, B] showing the same view; useful for diff side-by-side. */
  openSideBySide(idA: string, idB: string, view: SlotView = 'text') {
    if (idA === idB) {
      this.setActive(idA);
      return;
    }
    if (!this.docs.find((d) => d.id === idA) || !this.docs.find((d) => d.id === idB)) return;
    this.slots = [
      { docId: idA, view },
      { docId: idB, view },
    ];
    this.slotFractions = [1, 1];
    this.focusedSlotIndex = 0;
    this.persistSlots();
  }

  closeSlot(idx: number) {
    if (this.slots.length <= 1) return; // always keep at least one slot
    const next = this.slots.slice();
    next.splice(idx, 1);
    this.slots = next;
    const fr = this.slotFractions.slice();
    fr.splice(idx, 1);
    this.slotFractions = fr;
    if (this.focusedSlotIndex >= next.length) this.focusedSlotIndex = next.length - 1;
    this.persistSlots();
  }

  /** Find the lowest available untitled name (untitled.json, untitled1.json, ...). */
  private nextUntitledName(): string {
    const used = new Set(this.docs.map((d) => d.name));
    if (!used.has('untitled.json')) return 'untitled.json';
    for (let i = 1; i < 10000; i++) {
      const candidate = `untitled${i}.json`;
      if (!used.has(candidate)) return candidate;
    }
    return `untitled-${Date.now()}.json`;
  }

  newDoc(text = '', name?: string): DocStore {
    const d = new DocStore();
    d.text = text;
    d.name = name ?? this.nextUntitledName();
    this.docs = [...this.docs, d];
    this.setActive(d.id);
    return d;
  }

  async closeDoc(id: string) {
    const idx = this.docs.findIndex((d) => d.id === id);
    if (idx < 0) return;
    this.docs = this.docs.filter((d) => d.id !== id);
    await persist.remove(id);

    if (this.docs.length === 0) {
      const fresh = new DocStore();
      this.docs = [fresh];
      this.slots = [{ docId: fresh.id, view: 'text' }];
      this.focusedSlotIndex = 0;
      this.persistSlots();
      return;
    }

    // Repoint any slots that were showing the closed doc.
    // Prefer a doc not already shown elsewhere, so we don't end up with two columns
    // unintentionally showing the same thing. Fall back to nearest-by-index otherwise.
    const shownElsewhere = new Set(
      this.slots.filter((s) => s.docId !== id).map((s) => s.docId),
    );
    const notShown = this.docs.find((d) => !shownElsewhere.has(d.id));
    const fallback = notShown ?? this.docs[Math.min(idx, this.docs.length - 1)];
    const next = this.slots.map((s) => s.docId === id ? { ...s, docId: fallback.id } : s);
    this.slots = next;
    if (this.focusedSlotIndex >= this.slots.length) this.focusedSlotIndex = this.slots.length - 1;
    this.persistSlots();
  }

  rename(id: string, name: string) {
    const d = this.docs.find((x) => x.id === id);
    if (!d) return;
    d.name = name;
    (d as any).scheduleSave?.(0);
  }

  private persistSlots() {
    this.normalizeFractions();
    persist.setMeta(SLOTS_KEY, this.slots).catch(() => {});
    persist.setMeta(SLOT_FRACTIONS_KEY, this.slotFractions).catch(() => {});
  }
}

export const workspace = new WorkspaceStore();

// Backward-compat proxy: components import { doc } and get the active one.
export const doc: DocStore = new Proxy({} as DocStore, {
  get(_t, prop) {
    const a = workspace.active;
    if (!a) return undefined;
    const v = (a as any)[prop];
    return typeof v === 'function' ? v.bind(a) : v;
  },
  set(_t, prop, value) {
    const a = workspace.active;
    if (!a) return false;
    (a as any)[prop] = value;
    return true;
  },
});
