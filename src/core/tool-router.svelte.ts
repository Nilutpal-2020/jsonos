/**
 * Top-level tool selector. Currently 'json' (the JSON workbench) and 'md' (the
 * Markdown previewer). Persisted in localStorage and reflected in the URL via
 * ?tool=md so links and reloads stay sticky.
 */

export type Tool = 'json' | 'md';

export interface ToolMeta {
  id: Tool;
  name: string;
  short: string;
  icon: string;
  desc: string;
  hint: string;
}

export const TOOLS: readonly ToolMeta[] = [
  {
    id: 'json',
    name: 'JSON Workbench',
    short: 'JSON',
    icon: '{ }',
    desc: 'Format, validate, repair, query and diff JSON.',
    hint: 'Tree · text · table',
  },
  {
    id: 'md',
    name: 'Markdown Studio',
    short: 'Markdown',
    icon: '✎',
    desc: 'Live preview with Mermaid, math, code highlighting and embeds.',
    hint: 'Editor + preview',
  },
];

const STORAGE_KEY = 'jsonos.tool';
const PARAM = 'tool';

function readInitial(): Tool {
  if (typeof window === 'undefined') return 'json';
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get(PARAM);
    if (q === 'md' || q === 'json') return q;
  } catch { /* fallthrough */ }
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'md' || v === 'json') return v;
  } catch { /* fallthrough */ }
  return 'json';
}

class ToolRouter {
  current = $state<Tool>(readInitial());

  set(t: Tool) {
    if (this.current === t) return;
    this.current = t;
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* quota */ }
    try {
      const url = new URL(window.location.href);
      if (t === 'json') url.searchParams.delete(PARAM);
      else url.searchParams.set(PARAM, t);
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  }
}

export const tool = new ToolRouter();
