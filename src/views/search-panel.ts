/**
 * Custom CodeMirror search panel for JSON OS.
 *
 * Replaces the default builtin layout with a tighter two-row design:
 *   row 1:  [Find ...........] [Aa] [.*] [W] [↑] [↓]   m/n   [×]
 *   row 2:  [Replace .........] [Replace] [All]
 *
 * - Live match counter (current / total)
 * - Toggle pills for case-sensitive / regex / whole-word
 * - Replace row collapses when not needed
 * - Themed via CSS variables; matches the rest of the app
 */

import type { EditorView, Panel } from '@codemirror/view';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';

interface PanelHandles {
  searchInput: HTMLInputElement;
  replaceInput: HTMLInputElement;
  caseBtn: HTMLButtonElement;
  regexBtn: HTMLButtonElement;
  wordBtn: HTMLButtonElement;
  count: HTMLSpanElement;
  toggleReplaceBtn: HTMLButtonElement;
  replaceRow: HTMLDivElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('aria-') || k === 'role' || k === 'type' || k === 'placeholder' || k === 'title' || k === 'name') {
      node.setAttribute(k, v);
    } else {
      (node as any)[k] = v;
    }
  }
  for (const c of children) node.append(c);
  return node;
}

function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

const ARROW_UP   = 'M8 13V3 M4 7l4-4 4 4';
const ARROW_DOWN = 'M8 3v10 M4 9l4 4 4-4';
const X_MARK     = 'M4 4l8 8 M12 4l-8 8';
const CHEVRON_RT = 'M6 4l4 4-4 4';
const CHEVRON_DN = 'M4 6l4 4 4-4';

/** Count total matches and the index of the one nearest the selection. */
function computeMatchInfo(view: EditorView, query: SearchQuery): { total: number; current: number } {
  if (!query.search) return { total: 0, current: 0 };
  let cur;
  try { cur = query.getCursor(view.state.doc); }
  catch { return { total: 0, current: 0 }; }

  const selFrom = view.state.selection.main.from;
  let total = 0;
  let current = 0;
  let firstAtOrAfter = -1;
  while (true) {
    const next = cur.next();
    if (next.done) break;
    total++;
    const m: { from: number; to: number } = next.value as any;
    if (firstAtOrAfter === -1 && m.from >= selFrom) firstAtOrAfter = total;
  }
  if (total > 0) current = firstAtOrAfter === -1 ? total : firstAtOrAfter;
  return { total, current };
}

function buildQuery(handles: PanelHandles): SearchQuery {
  return new SearchQuery({
    search: handles.searchInput.value,
    replace: handles.replaceInput.value,
    caseSensitive: handles.caseBtn.classList.contains('on'),
    regexp: handles.regexBtn.classList.contains('on'),
    wholeWord: handles.wordBtn.classList.contains('on'),
    literal: !handles.regexBtn.classList.contains('on'),
  });
}

function commitQuery(view: EditorView, h: PanelHandles) {
  view.dispatch({ effects: setSearchQuery.of(buildQuery(h)) });
}

function makeToggle(label: string, title: string): HTMLButtonElement {
  const b = el('button', {
    class: 'jx-pill',
    type: 'button',
    title,
    'aria-pressed': 'false',
  }, [label]);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    b.classList.toggle('on');
    b.setAttribute('aria-pressed', String(b.classList.contains('on')));
    b.dispatchEvent(new CustomEvent('jx-toggle', { bubbles: true }));
  });
  return b;
}

function makeIconBtn(d: string, title: string): HTMLButtonElement {
  const b = el('button', { class: 'jx-icon', type: 'button', title });
  b.appendChild(icon(d));
  return b;
}

export function createSearchPanel(view: EditorView): Panel {
  const dom = el('div', { class: 'jx-search', role: 'search' });

  const searchInput = el('input', {
    class: 'jx-input',
    type: 'text',
    placeholder: 'Find',
    'aria-label': 'Find',
    name: 'search',
  });
  const replaceInput = el('input', {
    class: 'jx-input',
    type: 'text',
    placeholder: 'Replace',
    'aria-label': 'Replace',
    name: 'replace',
  });

  const caseBtn  = makeToggle('Aa', 'Match case');
  const regexBtn = makeToggle('.*', 'Regular expression');
  const wordBtn  = makeToggle('W',  'Whole word');

  const prevBtn  = makeIconBtn(ARROW_UP,   'Previous match (⇧↵)');
  const nextBtn  = makeIconBtn(ARROW_DOWN, 'Next match (↵)');
  const closeBtn = makeIconBtn(X_MARK,     'Close (Esc)');
  closeBtn.classList.add('jx-close');

  const count = el('span', { class: 'jx-count', 'aria-live': 'polite' }, ['0 / 0']);

  const toggleReplaceBtn = el('button', {
    class: 'jx-disclose',
    type: 'button',
    title: 'Toggle replace',
    'aria-expanded': 'false',
    'aria-label': 'Toggle replace',
  });
  toggleReplaceBtn.appendChild(icon(CHEVRON_RT));

  const replaceRow = el('div', { class: 'jx-row jx-row-replace' });
  const replaceBtn = el('button', { class: 'jx-btn', type: 'button', title: 'Replace next match' }, ['Replace']);
  const replaceAllBtn = el('button', { class: 'jx-btn', type: 'button', title: 'Replace all matches' }, ['All']);
  replaceRow.append(replaceInput, replaceBtn, replaceAllBtn);

  const findRow = el('div', { class: 'jx-row jx-row-find' });
  findRow.append(toggleReplaceBtn, searchInput, caseBtn, regexBtn, wordBtn, prevBtn, nextBtn, count, closeBtn);

  dom.append(findRow, replaceRow);

  const handles: PanelHandles = {
    searchInput, replaceInput,
    caseBtn, regexBtn, wordBtn,
    count, toggleReplaceBtn, replaceRow,
  };

  // --- behaviour ----
  function onQueryEdit() { commitQuery(view, handles); refreshCount(); }
  function refreshCount() {
    const q = getSearchQuery(view.state);
    const { total, current } = computeMatchInfo(view, q);
    count.textContent = total === 0 ? (q.search ? '0 / 0' : '') : `${current} / ${total}`;
    count.classList.toggle('empty', total === 0 && !!q.search);
  }
  function setReplaceOpen(open: boolean) {
    dom.classList.toggle('jx-open', open);
    toggleReplaceBtn.setAttribute('aria-expanded', String(open));
    toggleReplaceBtn.replaceChildren(icon(open ? CHEVRON_DN : CHEVRON_RT));
  }

  searchInput.addEventListener('input', onQueryEdit);
  replaceInput.addEventListener('input', onQueryEdit);
  for (const b of [caseBtn, regexBtn, wordBtn]) b.addEventListener('jx-toggle', onQueryEdit);

  prevBtn.addEventListener('click', (e) => { e.preventDefault(); findPrevious(view); refreshCount(); view.focus(); });
  nextBtn.addEventListener('click', (e) => { e.preventDefault(); findNext(view); refreshCount(); view.focus(); });
  closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeSearchPanel(view); view.focus(); });
  toggleReplaceBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setReplaceOpen(!dom.classList.contains('jx-open'));
  });
  replaceBtn.addEventListener('click', (e) => { e.preventDefault(); replaceNext(view); refreshCount(); });
  replaceAllBtn.addEventListener('click', (e) => { e.preventDefault(); replaceAll(view); refreshCount(); });

  // Keyboard:  Enter = next, Shift+Enter = prev (in find input)
  //            Enter in replace input = Replace next
  //            Esc = close
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) findPrevious(view); else findNext(view);
      refreshCount();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view); view.focus();
    }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); replaceNext(view); refreshCount(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(view); view.focus(); }
  });

  return {
    dom,
    top: true,
    mount() {
      // Reflect any current query into the panel inputs/toggles.
      const q = getSearchQuery(view.state);
      searchInput.value = q.search ?? '';
      replaceInput.value = q.replace ?? '';
      caseBtn.classList.toggle('on', q.caseSensitive);
      regexBtn.classList.toggle('on', q.regexp);
      wordBtn.classList.toggle('on', q.wholeWord);
      setReplaceOpen(!!q.replace);
      // Focus the search input on first open.
      requestAnimationFrame(() => {
        searchInput.focus();
        searchInput.select();
        refreshCount();
      });
    },
    update() { refreshCount(); },
  };
}
