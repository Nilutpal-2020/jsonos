import type { JsonPath, JsonValue, ParseResult } from './types';
import { jsonWorker } from '../workers/client';
import { applyPatch } from './patch';
import { persist, type PersistedDoc } from './persist';

const HISTORY_LIMIT = 200;
const PARSE_DEBOUNCE_MS = 80;
const SAVE_DEBOUNCE_MS = 400;
const ACTIVE_KEY = 'activeDocId';

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
  async repair() {
    const r = await jsonWorker.repair(this.text);
    if (r.ok) this.setText(r.text);
    else throw new Error(r.error);
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
  activeId = $state<string | null>(null);
  ready = $state(false);

  active = $derived<DocStore>(
    this.docs.find((d) => d.id === this.activeId) ?? this.docs[0],
  );

  constructor() {
    this.activeId = this.docs[0].id;
  }

  async init() {
    const ids = await persist.listIds();
    if (ids.length === 0) {
      this.ready = true;
      return;
    }
    const loaded = await Promise.all(ids.map((id) => persist.load(id)));
    const docs = loaded.filter((d): d is PersistedDoc => !!d).map((d) => new DocStore(d));
    docs.sort((a, b) => a.name.localeCompare(b.name));
    if (docs.length > 0) {
      this.docs = docs;
      const last = await persist.getMeta<string>(ACTIVE_KEY);
      this.activeId = (last && docs.some((d) => d.id === last)) ? last : docs[0].id;
    }
    this.ready = true;
  }

  setActive(id: string) {
    this.activeId = id;
    persist.setMeta(ACTIVE_KEY, id).catch(() => {});
  }

  newDoc(text = '', name = 'untitled.json'): DocStore {
    const d = new DocStore();
    d.text = text;
    d.name = name;
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
      this.activeId = fresh.id;
    } else if (this.activeId === id) {
      const next = this.docs[Math.min(idx, this.docs.length - 1)];
      if (next) this.setActive(next.id);
    }
  }

  rename(id: string, name: string) {
    const d = this.docs.find((x) => x.id === id);
    if (!d) return;
    d.name = name;
    d['scheduleSave' as keyof DocStore] && (d as any).scheduleSave(0);
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
