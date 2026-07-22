<script lang="ts">
  import { workspace } from '../core/store.svelte';
  import { selection } from '../core/selection.svelte';
  import {
    filter, validate, pickDefaultTarget, getAtPath, formatPath, parsePath,
    type FilterResult, type QueryDoc,
  } from '../core/query-engine';
  import type { JsonPath, JsonValue } from '../core/types';

  let active = $derived(workspace.active);
  let parsed = $derived(active.parse.value);

  // Per-doc UI state — keep last query / target while switching tabs and docs.
  // We mirror per-doc strings into local writable $state so `bind:value` works
  // cleanly on the textarea/input without fighting a $derived.
  let queryByDoc = $state<Record<string, string>>({});
  let pathByDoc  = $state<Record<string, string>>({});
  let queryText  = $state('{}');
  let targetText = $state('$');
  let lastDocId  = $state('');

  // Hydrate locals from the per-doc store whenever the active doc changes.
  $effect(() => {
    if (active.id === lastDocId) return;
    lastDocId  = active.id;
    queryText  = queryByDoc[active.id] ?? '{}';
    targetText = pathByDoc[active.id]  ?? formatPath(pickDefaultTarget(parsed));
  });

  // Mirror local edits back into the per-doc store. Skip the initial hydrate
  // tick so we don't ping-pong overwriting the source-of-truth.
  $effect(() => {
    if (active.id !== lastDocId) return;
    if (queryByDoc[active.id] !== queryText) {
      queryByDoc = { ...queryByDoc, [active.id]: queryText };
    }
  });
  $effect(() => {
    if (active.id !== lastDocId) return;
    if (pathByDoc[active.id] !== targetText) {
      pathByDoc = { ...pathByDoc, [active.id]: targetText };
    }
  });

  // Parse the query string. Returning both the parsed object and the error
  // here keeps everything inside one $derived — Svelte 5 forbids writing to
  // $state from inside a derivation, which silently broke reactivity earlier.
  let parsedQueryRes = $derived.by<{ query: QueryDoc | null; error: string }>(() => {
    const t = queryText.trim();
    if (!t) return { query: {}, error: '' };
    try {
      const v = JSON.parse(t);
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        return { query: null, error: 'Query must be a JSON object' };
      }
      return { query: v as QueryDoc, error: '' };
    } catch (e) {
      return { query: null, error: (e as Error).message };
    }
  });
  let parsedQuery = $derived(parsedQueryRes.query);
  let queryError  = $derived(parsedQueryRes.error);

  let targetPath = $derived.by<JsonPath | null>(() => {
    const p = parsePath(targetText);
    return p;
  });

  let targetValue = $derived<JsonValue | undefined>(
    targetPath === null ? undefined : getAtPath(parsed, targetPath),
  );

  let mode = $derived<'filter' | 'validate'>(
    Array.isArray(targetValue) ? 'filter' : 'validate',
  );

  let result = $derived.by<FilterResult | null>(() => {
    if (!parsedQuery) return null;
    if (targetPath === null) return null;
    if (targetValue === undefined) return null;
    return filter(parsedQuery, targetValue, targetPath);
  });

  let validateResult = $derived.by(() => {
    if (mode !== 'validate') return null;
    if (!parsedQuery) return null;
    if (targetValue === undefined) return null;
    return validate(parsedQuery, targetValue);
  });

  let resultText = $derived(
    result ? JSON.stringify(result.matches.map((m) => m.value), null, 2) : '',
  );

  // Suggested top-level array paths the user might want to query.
  let arrayPaths = $derived.by<{ path: JsonPath; label: string; size: number }[]>(() => {
    if (parsed === undefined) return [];
    const out: { path: JsonPath; label: string; size: number }[] = [];
    if (Array.isArray(parsed)) out.push({ path: [], label: '$', size: parsed.length });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v)) out.push({ path: [k], label: formatPath([k]), size: v.length });
      }
    }
    return out;
  });

  // Auto-detected document property keys for quick query field suggestions.
  let suggestedKeys = $derived.by<string[]>(() => {
    if (!targetValue) return [];
    let obj: any = targetValue;
    if (Array.isArray(targetValue) && targetValue.length > 0) {
      obj = targetValue[0];
    }
    if (obj && typeof obj === 'object') {
      return Object.keys(obj).slice(0, 10);
    }
    return [];
  });

  function appendKeyQuery(k: string) {
    queryText = `{ "${k}": "" }`;
  }

  function copyResult() {
    if (!resultText) return;
    navigator.clipboard?.writeText(resultText).catch(() => {});
  }

  function replaceDoc() {
    if (!result || mode !== 'filter') return;
    const next = result.matches.map((m) => m.value);
    active.applyValuePatch({ op: 'replace', path: targetPath ?? [], value: next as any });
  }

  function jumpTo(path: JsonPath) {
    selection.set(active.id, path, 'external');
  }

  function shortPreview(v: JsonValue): string {
    const s = JSON.stringify(v);
    if (!s) return String(v);
    return s.length > 90 ? s.slice(0, 87) + '…' : s;
  }

  // Operator cheatsheet — shown collapsed by default.
  const cheats: { op: string; desc: string }[] = [
    { op: '$eq / $ne',          desc: 'equal / not equal' },
    { op: '$gt $gte $lt $lte',  desc: 'numeric / lexical comparisons' },
    { op: '$in $nin',           desc: 'value in / not in array' },
    { op: '$exists',            desc: 'true → field present, false → missing' },
    { op: '$type',              desc: 'string|number|boolean|null|array|object' },
    { op: '$regex / $options',  desc: 'pattern match (e.g. "i" for case-insens.)' },
    { op: '$mod: [d,r]',        desc: 'value % d === r' },
    { op: '$size',              desc: 'array length' },
    { op: '$all',               desc: 'array contains every value' },
    { op: '$elemMatch',         desc: 'sub-query against array elements' },
    { op: '$and $or $nor $not', desc: 'logical combinators (top-level)' },
  ];

  const examples: { label: string; q: string }[] = [
    { label: 'equal',           q: '{ "name": "Alice" }' },
    { label: 'gt + lt',         q: '{ "age": { "$gt": 18, "$lt": 65 } }' },
    { label: 'in',              q: '{ "role": { "$in": ["admin", "owner"] } }' },
    { label: 'regex',           q: '{ "email": { "$regex": "@example\\\\.com$" } }' },
    { label: 'exists',          q: '{ "deletedAt": { "$exists": false } }' },
    { label: 'or',              q: '{ "$or": [ { "active": true }, { "vip": true } ] }' },
    { label: 'elemMatch',       q: '{ "items": { "$elemMatch": { "qty": { "$gte": 1 } } } }' },
  ];

  function pickExample(q: string) { queryText = q; }
</script>

<div class="qp">
  <div class="head">
    <span>Query</span>
    <span class="pill">MongoDB-style</span>
  </div>
  <div class="hint">Filter arrays or validate a single value. Click a result to jump to it in the tree.</div>

  <div class="row target-row">
    <span class="lbl">Target</span>
    <input
      class="input mono"
      spellcheck="false"
      placeholder="$  or  $.users  or  $.orders[0]"
      bind:value={targetText}
    />
  </div>

  {#if arrayPaths.length > 0}
    <div class="chips">
      {#each arrayPaths as ap}
        <button class="chip" onclick={() => (targetText = ap.label)}>
          <span class="chip-path">{ap.label}</span>
          <span class="chip-meta">[{ap.size}]</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if suggestedKeys.length > 0}
    <div class="key-suggestions">
      <span class="key-lbl">Fields:</span>
      {#each suggestedKeys as k}
        <button class="key-chip" onclick={() => appendKeyQuery(k)} title="Quick query field {k}">
          {k}
        </button>
      {/each}
    </div>
  {/if}

  <div class="row">
    <span class="lbl">Query</span>
    <span class="mode" class:filter={mode === 'filter'} class:validate={mode === 'validate'}>
      {mode === 'filter' ? 'filter' : 'validate'}
    </span>
  </div>
  <textarea
    class="query-input mono"
    spellcheck="false"
    rows="6"
    placeholder={'{ "field": { "$gt": 1 } }'}
    bind:value={queryText}
  ></textarea>

  <details class="examples">
    <summary>Examples</summary>
    <div class="ex-grid">
      {#each examples as ex}
        <button class="ex" onclick={() => pickExample(ex.q)} title={ex.q}>
          <span class="ex-label">{ex.label}</span>
          <code class="ex-q">{ex.q}</code>
        </button>
      {/each}
    </div>
  </details>

  <details class="cheats">
    <summary>Operators</summary>
    <ul>
      {#each cheats as c}
        <li><code>{c.op}</code> <span class="muted">— {c.desc}</span></li>
      {/each}
    </ul>
  </details>

  <div class="status">
    {#if parsed === undefined}
      <span class="muted">Document not parsed.</span>
    {:else if queryError}
      <span class="err">{queryError}</span>
    {:else if targetPath === null}
      <span class="err">Bad target path.</span>
    {:else if targetValue === undefined}
      <span class="err">No value at <code>{targetText}</code>.</span>
    {:else if result?.error}
      <span class="err">{result.error.message}</span>
    {:else if mode === 'filter' && result}
      <span class="ok">{result.matches.length}</span>
      <span class="muted"> of {result.total} match{result.total === 1 ? '' : 'es'}</span>
    {:else if mode === 'validate' && validateResult}
      {#if validateResult.ok}
        <span class="ok">✓ valid</span>
      {:else}
        <span class="err">✗ no match</span>
      {/if}
    {/if}
    <span class="spacer"></span>
    <button onclick={copyResult} disabled={mode !== 'filter' || !result || result.matches.length === 0}>Copy</button>
    <button onclick={replaceDoc}
            disabled={mode !== 'filter' || !result || !!result.error}
            title="Replace target with filtered results">→ Doc</button>
  </div>

  <div class="results">
    {#if mode === 'filter' && result && result.matches.length > 0}
      <ul>
        {#each result.matches as m}
          <li>
            <button class="hit" onclick={() => jumpTo(m.path)} title="Click to highlight in tree">
              <span class="hit-path">{formatPath(m.path)}</span>
              <span class="hit-val mono">{shortPreview(m.value)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if mode === 'validate' && validateResult?.ok}
      <pre class="mono">{JSON.stringify(targetValue, null, 2)}</pre>
    {:else if mode === 'filter' && result && result.matches.length === 0 && !result.error}
      <div class="muted center">No matches.</div>
    {/if}
  </div>
</div>

<style>
  .qp {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .pill {
    text-transform: none;
    letter-spacing: 0;
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 10px;
    font-weight: 600;
  }
  .hint {
    padding: 4px 10px 6px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    border-bottom: 1px solid var(--border);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .target-row { padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .lbl { text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
  .mode {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .mode.filter   { background: var(--accent-soft); color: var(--accent); }
  .mode.validate { background: var(--ok-soft);     color: var(--ok); }
  .input {
    flex: 1;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 12px;
    outline: none;
  }
  .input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--ring); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  .chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 4px 10px 6px;
    border-bottom: 1px solid var(--border);
  }
  .key-suggestions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 4px 10px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .key-lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
  }
  .key-chip {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 999px;
    padding: 1px 7px;
    cursor: pointer;
    font-size: 10.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    transition: border-color 80ms, color 80ms;
  }
  .key-chip:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 999px;
    padding: 1px 8px;
    cursor: pointer;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip-meta { color: var(--muted); }

  .query-input {
    flex: 0 0 auto;
    margin: 0 10px 6px;
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 6px 8px;
    font-size: 12px;
    line-height: 1.4;
    resize: vertical;
    outline: none;
  }
  .query-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--ring); }

  .examples, .cheats {
    border-top: 1px solid var(--border);
    padding: 4px 10px;
    font-size: 11px;
  }
  .examples summary, .cheats summary {
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    padding: 2px 0;
  }
  .examples summary:hover, .cheats summary:hover { color: var(--fg); }
  .ex-grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
  .ex {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    padding: 4px 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font: inherit;
    color: var(--fg);
    text-align: left;
    max-width: 100%;
  }
  .ex:hover { border-color: var(--accent); }
  .ex-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .ex-q {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: var(--fg);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cheats ul { list-style: none; padding: 4px 0; margin: 0; }
  .cheats li { padding: 1px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
  }
  .status .spacer { flex: 1; }
  .status button {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }
  .status button:hover:not(:disabled) { background: var(--row-hover-strong); border-color: var(--muted); }
  .status button:disabled { opacity: 0.4; cursor: not-allowed; }
  .err { color: var(--err); }
  .ok { color: var(--ok); font-weight: 600; }
  .muted { color: var(--muted); }
  .center { text-align: center; padding: 12px; }

  .results {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  .results ul { list-style: none; margin: 0; padding: 0; }
  .results li { border-bottom: 1px solid var(--border); }
  .hit {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: flex-start;
    gap: 2px;
    padding: 6px 10px;
    background: transparent;
    border: 0;
    cursor: pointer;
    font: inherit;
    color: var(--fg);
    text-align: left;
  }
  .hit:hover { background: var(--row-hover); }
  .hit-path { color: var(--key); font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .hit-val {
    color: var(--muted);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .results pre {
    margin: 0;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--fg);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
