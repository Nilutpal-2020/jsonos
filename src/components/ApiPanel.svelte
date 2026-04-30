<script lang="ts">
  import { onMount } from 'svelte';
  import {
    apiHistory, newId, authPrefs, applyAuth, originOf,
    type ApiHistoryEntry, type AuthKind, type AuthConfig,
  } from '../core/api-history';
  import { workspace } from '../core/store.svelte';

  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

  let method = $state<Method>('GET');
  let url = $state('https://jsonplaceholder.typicode.com/todos/1');
  let headersText = $state('');
  let body = $state('');
  let sending = $state(false);
  let error = $state('');
  let history = $state<ApiHistoryEntry[]>([]);
  let selectedId = $state<string | null>(null);

  // Auth state
  let auth = $state<AuthConfig>({ kind: 'none' });
  let authOpen = $state(false);
  let revealSecret = $state(false);

  let origin = $derived(originOf(url));
  let selected = $derived(history.find((h) => h.id === selectedId) ?? null);

  onMount(async () => {
    history = await apiHistory.list();
  });

  // Load saved auth when origin changes (debounced via async await)
  let lastOrigin = '';
  $effect(() => {
    const o = origin;
    if (o === lastOrigin) return;
    lastOrigin = o;
    (async () => {
      if (!o) return;
      const cfg = await authPrefs.load(o);
      auth = cfg ?? { kind: 'none' };
    })();
  });

  async function persistAuth() {
    if (origin) await authPrefs.save(origin, auth);
  }

  function parseHeaders(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      if (idx < 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  }

  async function send() {
    error = '';
    sending = true;
    await persistAuth();
    const id = newId();
    const startedAt = Date.now();
    const requestHeaders = parseHeaders(headersText);
    applyAuth(requestHeaders, auth);
    const hasBody = method !== 'GET' && method !== 'HEAD' && body.trim().length > 0;
    if (hasBody && !requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    let entry: ApiHistoryEntry;
    try {
      const res = await fetch(url, {
        method,
        headers: requestHeaders,
        body: hasBody ? body : undefined,
      });
      const text = await res.text();
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });
      entry = {
        id, method, url,
        status: res.status,
        statusText: res.statusText,
        startedAt,
        durationMs: Date.now() - startedAt,
        requestHeaders,
        requestBody: hasBody ? body : undefined,
        responseHeaders: respHeaders,
        responseBody: text,
        responseContentType: respHeaders['content-type'] ?? '',
        ok: res.ok,
      };
    } catch (e) {
      entry = {
        id, method, url,
        status: 0,
        statusText: 'Network error',
        startedAt,
        durationMs: Date.now() - startedAt,
        requestHeaders,
        requestBody: hasBody ? body : undefined,
        responseHeaders: {},
        responseBody: '',
        responseContentType: '',
        ok: false,
        error: (e as Error).message,
      };
      error = entry.error ?? 'Failed';
    } finally {
      sending = false;
    }
    await apiHistory.save(entry);
    history = await apiHistory.list();
    selectedId = entry.id;
  }

  function loadFromEntry(e: ApiHistoryEntry) {
    method = e.method as Method;
    url = e.url;
    headersText = Object.entries(e.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
    body = e.requestBody ?? '';
    selectedId = e.id;
  }

  function openResponseInDoc(e: ApiHistoryEntry) {
    const isJson = /json/i.test(e.responseContentType) || /^[\s]*[{\[]/.test(e.responseBody);
    let text = e.responseBody;
    if (isJson) {
      try { text = JSON.stringify(JSON.parse(e.responseBody), null, 2); } catch {}
    }
    const name = `${e.method} ${new URL(e.url, location.href).pathname}.json`.replace(/\s+/g, '_').slice(0, 80);
    workspace.newDoc(text, name);
  }

  async function deleteEntry(id: string) {
    await apiHistory.remove(id);
    history = await apiHistory.list();
    if (selectedId === id) selectedId = null;
  }

  async function clearAll() {
    if (!confirm('Clear all API history?')) return;
    await apiHistory.clear();
    history = [];
    selectedId = null;
  }

  function fmtTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function statusClass(s: number): string {
    if (s === 0) return 'err';
    if (s < 300) return 'ok';
    if (s < 400) return 'redir';
    return 'err';
  }
</script>

<div class="api">
  <div class="head">
    <span>API Client</span>
    <button class="clear" onclick={clearAll} disabled={history.length === 0}>Clear history</button>
  </div>

  <div class="form">
    <div class="row">
      <select bind:value={method} class="method">
        {#each METHODS as m}<option value={m}>{m}</option>{/each}
      </select>
      <input class="url" bind:value={url} placeholder="https://api.example.com/path" spellcheck="false" />
      <button class="send" onclick={send} disabled={sending || !url}>
        {sending ? '…' : 'Send'}
      </button>
    </div>
    <div class="auth-bar">
      <button class="auth-toggle" onclick={() => authOpen = !authOpen} title="Auth settings">
        {authOpen ? '▾' : '▸'} Auth
      </button>
      <select bind:value={auth.kind} class="auth-kind">
        <option value="none">None</option>
        <option value="bearer">Bearer Token</option>
        <option value="basic">Basic Auth</option>
        <option value="header">Custom Header</option>
      </select>
      {#if origin && auth.kind !== 'none'}
        <span class="auth-host" title="Persisted for this origin">{origin}</span>
      {/if}
      <span class="spacer"></span>
      {#if auth.kind !== 'none'}
        <button class="reveal" onclick={() => revealSecret = !revealSecret} title="Show/hide secrets">
          {revealSecret ? '🙈' : '👁'}
        </button>
      {/if}
    </div>

    {#if authOpen && auth.kind === 'bearer'}
      <input
        class="auth-input"
        type={revealSecret ? 'text' : 'password'}
        bind:value={auth.bearer}
        placeholder="token"
        spellcheck="false"
        autocomplete="off"
      />
    {:else if authOpen && auth.kind === 'basic'}
      <div class="auth-row">
        <input
          class="auth-input"
          type="text"
          bind:value={auth.basicUser}
          placeholder="username"
          spellcheck="false"
          autocomplete="off"
        />
        <input
          class="auth-input"
          type={revealSecret ? 'text' : 'password'}
          bind:value={auth.basicPass}
          placeholder="password"
          spellcheck="false"
          autocomplete="off"
        />
      </div>
    {:else if authOpen && auth.kind === 'header'}
      <div class="auth-row">
        <input
          class="auth-input header-name"
          type="text"
          bind:value={auth.headerName}
          placeholder="X-Api-Key"
          spellcheck="false"
        />
        <input
          class="auth-input"
          type={revealSecret ? 'text' : 'password'}
          bind:value={auth.headerValue}
          placeholder="value"
          spellcheck="false"
          autocomplete="off"
        />
      </div>
    {/if}

    <textarea
      class="headers"
      bind:value={headersText}
      placeholder="Accept: application/json&#10;X-Trace-Id: abc"
      spellcheck="false"
    ></textarea>
    {#if method !== 'GET' && method !== 'HEAD'}
      <textarea
        class="body"
        bind:value={body}
        placeholder="Request body (JSON)"
        spellcheck="false"
      ></textarea>
    {/if}
    {#if error}<div class="err-msg">{error}</div>{/if}
  </div>

  <div class="history">
    <div class="hist-head">History ({history.length})</div>
    {#if history.length === 0}
      <div class="muted">No requests yet.</div>
    {:else}
      <ul>
        {#each history as h (h.id)}
          <li class:active={selectedId === h.id}>
            <button class="hist-row" onclick={() => loadFromEntry(h)}>
              <span class="m">{h.method}</span>
              <span class="s {statusClass(h.status)}">{h.status || '×'}</span>
              <span class="u" title={h.url}>{h.url}</span>
              <span class="d">{h.durationMs}ms</span>
            </button>
            <button class="x" onclick={() => deleteEntry(h.id)} title="Delete" aria-label="delete">×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if selected}
    <div class="resp">
      <div class="resp-head">
        <span class="status {statusClass(selected.status)}">
          {selected.status} {selected.statusText}
        </span>
        <span class="muted">{selected.durationMs}ms · {fmtTime(selected.startedAt)}</span>
        <span class="spacer"></span>
        <button onclick={() => openResponseInDoc(selected!)} title="Open response in new tab">→ Doc</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .api {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
    overflow: hidden;
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
  .clear {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 11px;
  }
  .clear:hover:not(:disabled) { color: var(--fg); }
  .clear:disabled { opacity: 0.5; cursor: not-allowed; }
  .form {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .method, .url, .send {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 8px;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
  }
  .url { flex: 1; min-width: 0; }
  .send {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-fg);
    cursor: pointer;
    padding: 4px 14px;
  }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }
  .auth-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .auth-toggle {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
    font: inherit;
  }
  .auth-toggle:hover { color: var(--fg); }
  .auth-kind {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .auth-host {
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .reveal {
    background: transparent;
    border: 0;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 12px;
  }
  .auth-row { display: flex; gap: 6px; }
  .auth-input {
    flex: 1;
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 8px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
    min-width: 0;
  }
  .auth-input.header-name { flex: 0 0 140px; }
  .spacer { flex: 1; }
  .headers, .body {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 8px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    resize: vertical;
    min-height: 48px;
    outline: none;
  }
  .body { min-height: 80px; }
  .err-msg { color: var(--err); font-size: 12px; }
  .history {
    flex: 1;
    overflow: auto;
    padding: 6px 10px;
  }
  .hist-head {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li {
    display: flex;
    align-items: center;
    border-radius: 3px;
  }
  li:hover { background: var(--row-hover); }
  li.active { background: var(--row-hover-strong); }
  .hist-row {
    flex: 1;
    background: transparent;
    border: 0;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 6px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow: hidden;
  }
  .m { color: var(--accent); width: 50px; flex-shrink: 0; }
  .s { width: 32px; flex-shrink: 0; text-align: center; font-weight: 600; }
  .s.ok { color: var(--ok); }
  .s.redir { color: var(--num); }
  .s.err { color: var(--err); }
  .u { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .d { color: var(--muted); flex-shrink: 0; }
  .x {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 0 6px;
    font-size: 14px;
  }
  .x:hover { color: var(--err); }
  .resp {
    border-top: 1px solid var(--border);
    padding: 6px 10px;
  }
  .resp-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .status { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .status.ok { color: var(--ok); }
  .status.redir { color: var(--num); }
  .status.err { color: var(--err); }
  .muted { color: var(--muted); }
  .spacer { flex: 1; }
  .resp-head button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
  }
  .resp-head button:hover { color: var(--fg); }
</style>
