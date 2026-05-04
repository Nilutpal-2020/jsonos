<script lang="ts">
  import { workspace, type SlotView } from '../core/store.svelte';
  import { compare } from '../core/compare.svelte';
  import { type DiffNode } from '../core/diff-engine';

  let active = $derived(workspace.active);
  let peerId = $state<string>('');
  let sideBySideView = $state<SlotView>('tree');
  let cursor = $state(0);
  let newIgnorePath = $state('');
  let newArrayKeyPath = $state('');
  let newArrayKeyField = $state('');

  // If a pair is already active, default the peer dropdown to its right doc.
  $effect(() => {
    const r = compare.rightDoc;
    if (r && !peerId) peerId = r.id;
  });

  let candidates = $derived(workspace.docs.filter((d) => d.id !== active.id));
  let peer = $derived(candidates.find((d) => d.id === peerId));
  let result = $derived(compare.result);
  let stats = $derived(result?.stats ?? { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 });
  let total = $derived(stats.added + stats.removed + stats.changed + stats.moved);
  let changes = $derived<DiffNode[]>(compare.changes);

  function trunc(v: unknown): string {
    const s = JSON.stringify(v);
    if (s === undefined) return 'undefined';
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  }

  function openCompare() {
    if (!peer) return;
    workspace.openSideBySide(active.id, peer.id, sideBySideView);
    // The slots are now [0]=active, [1]=peer.
    compare.setPair(0, 1);
    cursor = 0;
  }

  function unlink() {
    compare.clear();
  }

  function gotoChange(i: number) {
    if (changes.length === 0) return;
    const idx = ((i % changes.length) + changes.length) % changes.length;
    cursor = idx;
    // Cheap scroll: emit a sync-scroll roughly where the change is, so both
    // panels jump close to it. Real precision needs row-level mapping; defer.
    const ratio = changes.length === 1 ? 0 : idx / (changes.length - 1);
    if (compare.pair) compare.publishScroll(compare.pair.left, ratio);
  }

  function nextChange() { gotoChange(cursor + 1); }
  function prevChange() { gotoChange(cursor - 1); }

  function addIgnorePath() {
    const p = newIgnorePath.trim();
    if (!p) return;
    const next = [...new Set([...compare.rules.paths, p])];
    compare.setRules({ ...compare.rules, paths: next });
    newIgnorePath = '';
  }
  function removeIgnorePath(p: string) {
    compare.setRules({ ...compare.rules, paths: compare.rules.paths.filter((x) => x !== p) });
  }
  function addArrayKey() {
    const path = newArrayKeyPath.trim();
    const key  = newArrayKeyField.trim();
    if (!path || !key) return;
    compare.setRules({ ...compare.rules, arrayKeys: { ...compare.rules.arrayKeys, [path]: key } });
    newArrayKeyPath = '';
    newArrayKeyField = '';
  }
  function removeArrayKey(p: string) {
    const next = { ...compare.rules.arrayKeys };
    delete next[p];
    compare.setRules({ ...compare.rules, arrayKeys: next });
  }

  function statusSym(s: DiffNode['status']): string {
    return s === 'added' ? '+' : s === 'removed' ? '−' : s === 'moved' ? '⇄' : '~';
  }
</script>

<div class="diff">
  <div class="head">
    <span>Compare</span>
    <span class="hint">Pick a peer doc to diff side-by-side. ⌘⇧C toggles a pair.</span>
    <select bind:value={peerId}>
      <option value="">— pick peer —</option>
      {#each candidates as d (d.id)}
        <option value={d.id}>{d.name}</option>
      {/each}
    </select>
  </div>

  <div class="actions">
    <span class="label">View</span>
    <div class="seg">
      <button class:on={sideBySideView === 'text'} onclick={() => sideBySideView = 'text'}>Text</button>
      <button class:on={sideBySideView === 'tree'} onclick={() => sideBySideView = 'tree'}>Tree</button>
    </div>
    <span class="spacer"></span>
    {#if compare.pair}
      <button class="ghost" onclick={unlink} title="Unlink the diff pair">Unlink</button>
    {/if}
    <button class="primary" onclick={openCompare} disabled={!peer} title="Replace slots with this pair and link them">
      Open ↔
    </button>
  </div>

  <details class="rules" open={false}>
    <summary>Ignore rules</summary>
    <label class="check">
      <input type="checkbox" checked={compare.rules.nullEqMissing}
             onchange={(e) => compare.toggleRule('nullEqMissing', (e.currentTarget as HTMLInputElement).checked)} />
      <span>Treat <code>null</code> = missing</span>
    </label>
    <label class="check">
      <input type="checkbox" checked={compare.rules.caseInsensitive}
             onchange={(e) => compare.toggleRule('caseInsensitive', (e.currentTarget as HTMLInputElement).checked)} />
      <span>Case-insensitive strings</span>
    </label>
    <label class="check">
      <input type="checkbox" checked={compare.rules.trimStrings}
             onchange={(e) => compare.toggleRule('trimStrings', (e.currentTarget as HTMLInputElement).checked)} />
      <span>Trim string whitespace</span>
    </label>

    <div class="rule-block">
      <div class="rb-head">Ignore paths <span class="muted">(<code>$.path</code>, <code>$.**.id</code>)</span></div>
      <div class="rb-add">
        <input
          class="rb-in"
          placeholder="$.timestamp"
          spellcheck="false"
          bind:value={newIgnorePath}
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIgnorePath(); } }}
        />
        <button onclick={addIgnorePath}>Add</button>
      </div>
      {#each compare.rules.paths as p}
        <div class="chip">
          <code>{p}</code>
          <button class="x" onclick={() => removeIgnorePath(p)} aria-label="remove">×</button>
        </div>
      {/each}
    </div>

    <div class="rule-block">
      <div class="rb-head">Array keys <span class="muted">(match by id field)</span></div>
      <div class="rb-add">
        <input class="rb-in" placeholder="$.users" spellcheck="false" bind:value={newArrayKeyPath} />
        <input class="rb-in" placeholder="id" spellcheck="false" bind:value={newArrayKeyField} />
        <button onclick={addArrayKey}>Add</button>
      </div>
      {#each Object.entries(compare.rules.arrayKeys) as [p, k]}
        <div class="chip">
          <code>{p}</code> <span class="muted">→</span> <code>{k}</code>
          <button class="x" onclick={() => removeArrayKey(p)} aria-label="remove">×</button>
        </div>
      {/each}
    </div>
  </details>

  <div class="body">
    {#if !compare.pair}
      <div class="muted">Pick a peer doc, then <strong>Open ↔</strong>.</div>
    {:else if !result}
      <div class="muted">Both docs need to parse cleanly.</div>
    {:else if total === 0}
      <div class="ok">No structural differences.</div>
    {:else}
      <div class="stats">
        <span class="stat add">+{stats.added}</span>
        <span class="stat rem">−{stats.removed}</span>
        <span class="stat chg">~{stats.changed}</span>
        {#if stats.moved > 0}<span class="stat mv">⇄{stats.moved}</span>{/if}
        <span class="muted">  {total} change{total === 1 ? '' : 's'}</span>
        <span class="spacer"></span>
        <button class="nav" onclick={prevChange} title="Previous change (⌘[)">↑</button>
        <span class="counter">{Math.min(cursor + 1, changes.length)} / {changes.length}</span>
        <button class="nav" onclick={nextChange} title="Next change (⌘])">↓</button>
      </div>
      <ul>
        {#each changes as e, i}
          <li class="row-li {e.status}" class:active={i === cursor}>
            <button type="button" class="row-btn" onclick={() => (cursor = i)}>
              <span class="sym">{statusSym(e.status)}</span>
              <span class="path" title={e.id}>{e.id}</span>
              {#if e.status === 'changed'}
                <span class="before">{trunc(e.before)}</span>
                <span class="arrow">→</span>
                <span class="after">{trunc(e.after)}</span>
              {:else if e.status === 'added'}
                <span class="after">{trunc(e.after)}</span>
              {:else if e.status === 'removed'}
                <span class="before">{trunc(e.before)}</span>
              {:else if e.status === 'moved'}
                <span class="muted">[{e.fromIndex}] → [{e.toIndex}]</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .head .hint {
    flex: 1;
    text-transform: none;
    letter-spacing: 0;
    color: var(--muted);
    font-size: 11px;
    margin-left: 8px;
  }
  .head select {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: none;
    letter-spacing: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    font-size: 11px;
  }
  .label { color: var(--muted); }
  .seg { display: flex; }
  .seg button {
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
  }
  .seg button:first-child { border-radius: 3px 0 0 3px; }
  .seg button:last-child  { border-radius: 0 3px 3px 0; }
  .seg button + button { border-left: 0; }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .spacer { flex: 1; }
  .actions .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: var(--radius);
    padding: 3px 8px;
    cursor: pointer;
    font: inherit;
  }
  .actions .ghost:hover { color: var(--fg); }
  .actions .primary {
    background: var(--accent);
    color: var(--accent-fg);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 3px 10px;
    cursor: pointer;
    font: inherit;
  }
  .actions .primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .rules {
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    padding: 4px 10px 8px;
    font-size: 11px;
  }
  .rules summary {
    cursor: pointer;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 0;
  }
  .rules summary:hover { color: var(--fg); }
  .check { display: flex; align-items: center; gap: 6px; padding: 3px 0; color: var(--fg); }
  .rule-block { margin-top: 6px; }
  .rb-head { color: var(--muted); margin-bottom: 4px; }
  .rb-add { display: flex; gap: 4px; margin-bottom: 4px; }
  .rb-in {
    flex: 1; min-width: 0;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
  }
  .rb-add button {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 4px 2px 8px;
    margin: 2px 4px 2px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .chip .x {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    padding: 0 4px;
    border-radius: 999px;
  }
  .chip .x:hover { color: var(--err); background: var(--row-hover-strong); }

  .body {
    flex: 1;
    overflow: auto;
    padding: 6px 10px;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .stats {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
  }
  .stat { font-weight: 700; }
  .stat.add { color: var(--ok); }
  .stat.rem { color: var(--err); }
  .stat.chg { color: var(--warn); }
  .stat.mv  { color: var(--accent); }
  .nav {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1px 6px;
    cursor: pointer;
    font: inherit;
  }
  .nav:hover { background: var(--row-hover-strong); }
  .counter { color: var(--muted); min-width: 48px; text-align: center; }

  ul { list-style: none; padding: 0; margin: 0; }
  .row-li { display: block; }
  .row-btn {
    display: flex;
    gap: 8px;
    padding: 3px 6px;
    width: 100%;
    align-items: center;
    white-space: nowrap;
    border-radius: 3px;
    cursor: pointer;
    background: transparent;
    border: 0;
    color: var(--fg);
    font: inherit;
    text-align: left;
  }
  .row-btn:hover { background: var(--row-hover); }
  .row-li.active .row-btn { background: var(--row-hover-strong); }
  .row-li.added .sym, .row-li.added .after { color: var(--ok); }
  .row-li.removed .sym, .row-li.removed .before { color: var(--err); }
  .row-li.changed .sym, .row-li.changed .arrow { color: var(--warn); }
  .row-li.moved .sym { color: var(--accent); }
  .sym { width: 12px; flex-shrink: 0; font-weight: 700; }
  .path { color: var(--key); min-width: 160px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; }
  .before { color: var(--err); overflow: hidden; text-overflow: ellipsis; }
  .after { color: var(--ok); overflow: hidden; text-overflow: ellipsis; }
  .arrow { color: var(--muted); }
  .muted { color: var(--muted); }
  .ok { color: var(--ok); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
