import { mdPersist, type PersistedMdDoc } from './md-persist';

const HISTORY_LIMIT = 200;
const SAVE_DEBOUNCE_MS = 400;
const ACTIVE_KEY = 'mdActiveDocId';

const STARTER = `# Welcome to the Markdown Tool

A live previewer with **GFM**, code highlighting, math, and Mermaid diagrams.

## Features

- Editable on the left, rendered on the right
- Tables, task lists, footnotes, autolinks
- Inline code: \`const x = 1\` and fenced blocks

\`\`\`ts
function greet(name: string) {
  return \`hello, \${name}\`;
}
\`\`\`

## Math

Inline: $E = mc^2$ and block:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Mermaid

\`\`\`mermaid
flowchart LR
  A[Edit] --> B{Render}
  B -->|markdown| C[HTML]
  B -->|mermaid|  D[SVG diagram]
\`\`\`

## Embeds

Paste a YouTube link on its own line and it becomes a player:

https://www.youtube.com/watch?v=dQw4w9WgXcQ

## Tasks

- [x] Write the markdown tool
- [ ] Ship it
`;

interface HistoryEntry { text: string }

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export class MdDoc {
  id: string;
  text = $state('');
  name = $state('untitled.md');
  dirty = $state(false);

  past: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(seed?: PersistedMdDoc) {
    this.id = seed?.id ?? newId();
    if (seed) {
      this.text = seed.text;
      this.name = seed.name;
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
    this.scheduleSave();
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push({ text: this.text });
    this.text = prev.text;
    this.scheduleSave();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ text: this.text });
    this.text = next.text;
    this.scheduleSave();
  }

  load(text: string, name?: string) {
    this.past = [];
    this.future = [];
    this.text = text;
    if (name) this.name = name;
    this.dirty = false;
    this.scheduleSave(0);
  }

  download() {
    const blob = new Blob([this.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.name.endsWith('.md') ? this.name : this.name + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  exportHtml(htmlBody: string) {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(this.name)}</title>
<style>
body{font:14px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1a1a1a;}
pre{background:#f4f6fa;padding:12px;border-radius:6px;overflow:auto;}
code{font-family:ui-monospace,Menlo,Consolas,monospace;}
table{border-collapse:collapse;}th,td{border:1px solid #ddd;padding:6px 10px;}
blockquote{border-left:3px solid #ccd;padding:4px 12px;color:#555;margin:0 0 16px;}
img{max-width:100%;}
</style></head><body>${htmlBody}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stem = this.name.replace(/\.md$/i, '');
    a.href = url;
    a.download = stem + '.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  toPersisted(): PersistedMdDoc {
    return { id: this.id, name: this.name, text: this.text, updatedAt: Date.now() };
  }

  private scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try { await mdPersist.save(this.toPersisted()); }
      catch { /* quota */ }
    }, delay);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

class MdWorkspace {
  docs = $state<MdDoc[]>([]);
  activeId = $state<string>('');
  ready = $state(false);
  private starterUsed = false;

  active = $derived<MdDoc | undefined>(this.docs.find((d) => d.id === this.activeId) ?? this.docs[0]);

  async init() {
    if (this.ready) return;
    const ids = await mdPersist.listIds();
    let docs: MdDoc[] = [];
    if (ids.length > 0) {
      const loaded = await Promise.all(ids.map((id) => mdPersist.load(id)));
      docs = loaded.filter((d): d is PersistedMdDoc => !!d).map((d) => new MdDoc(d));
      docs.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (docs.length === 0) {
      const seed = new MdDoc();
      seed.text = STARTER;
      seed.name = 'welcome.md';
      docs = [seed];
      this.starterUsed = true;
      // Persist immediately so the starter survives reloads.
      mdPersist.save(seed.toPersisted()).catch(() => {});
    }
    this.docs = docs;
    const last = await mdPersist.getMeta<string>(ACTIVE_KEY);
    this.activeId = (last && docs.some((d) => d.id === last)) ? last : docs[0].id;
    this.ready = true;
  }

  setActive(id: string) {
    if (!this.docs.some((d) => d.id === id)) return;
    this.activeId = id;
    mdPersist.setMeta(ACTIVE_KEY, id).catch(() => {});
  }

  private nextUntitled(): string {
    const used = new Set(this.docs.map((d) => d.name));
    if (!used.has('untitled.md')) return 'untitled.md';
    for (let i = 1; i < 10000; i++) {
      const c = `untitled${i}.md`;
      if (!used.has(c)) return c;
    }
    return `untitled-${Date.now()}.md`;
  }

  newDoc(text = '', name?: string): MdDoc {
    const d = new MdDoc();
    d.text = text;
    d.name = name ?? this.nextUntitled();
    this.docs = [...this.docs, d];
    this.setActive(d.id);
    if (text) (d as any).scheduleSave?.(0);
    return d;
  }

  rename(id: string, name: string) {
    const d = this.docs.find((x) => x.id === id);
    if (!d) return;
    d.name = name;
    (d as any).scheduleSave?.(0);
  }

  async closeDoc(id: string) {
    const idx = this.docs.findIndex((d) => d.id === id);
    if (idx < 0) return;
    this.docs = this.docs.filter((d) => d.id !== id);
    await mdPersist.remove(id).catch(() => {});
    if (this.docs.length === 0) {
      const fresh = new MdDoc();
      fresh.name = this.nextUntitled();
      this.docs = [fresh];
      this.activeId = fresh.id;
      return;
    }
    if (this.activeId === id) {
      this.activeId = this.docs[Math.min(idx, this.docs.length - 1)].id;
      mdPersist.setMeta(ACTIVE_KEY, this.activeId).catch(() => {});
    }
  }
}

export const mdWorkspace = new MdWorkspace();
