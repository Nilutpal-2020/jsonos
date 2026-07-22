<script lang="ts">
  import { onMount } from 'svelte';
  import {
    apiHistory, newId, authPrefs, applyAuth, originOf,
    type ApiHistoryEntry, type AuthConfig,
  } from '../core/api-history';
  import { workspace } from '../core/store.svelte';
  import { parseCurl, generateCurl } from '../core/curl-parser';

  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

  let method = $state<Method>('GET');
  let url = $state('https://jsonplaceholder.typicode.com/todos/1');
  let headersText = $state('Accept: application/json');
  let body = $state('');
  let sending = $state(false);
  let error = $state('');
  let history = $state<ApiHistoryEntry[]>([]);
  let selectedId = $state<string | null>(null);

  // cURL modal & toasts
  let importCurlOpen = $state(false);
  let curlInputText = $state('');
  let toastMsg = $state('');

  // Auth state
  let auth = $state<AuthConfig>({ kind: 'none' });
  let authOpen = $state(false);
  let revealSecret = $state(false);

  // Active doc derived state
  let activeDoc = $derived(workspace.active);
  let activeDocValid = $derived(activeDoc ? activeDoc.parse.errors.length === 0 : false);

  let bodySyntaxError = $derived.by(() => {
    if (method === 'GET' || method === 'HEAD' || !body.trim()) return '';
    try {
      JSON.parse(body);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  });

  let origin = $derived(originOf(url));
  let selected = $derived(history.find((h) => h.id === selectedId) ?? null);

  onMount(async () => {
    history = await apiHistory.list();
  });

  $effect(() => {
    const o = origin;
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

  function headersToString(headers: Record<string, string>): string {
    return Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  function handleImportCurl() {
    if (!curlInputText.trim()) return;
    const parsed = parseCurl(curlInputText);
    if (parsed.method) method = parsed.method as Method;
    if (parsed.url) url = parsed.url;
    if (Object.keys(parsed.headers).length > 0) {
      headersText = headersToString(parsed.headers);
    }
    if (parsed.body) body = parsed.body;

    importCurlOpen = false;
    curlInputText = '';
    showToast('cURL command imported!');
  }

  async function handleCopyCurl() {
    const headersObj = parseHeaders(headersText);
    applyAuth(headersObj, auth);
    const curlStr = generateCurl(method, url, headersObj, body);
    try {
      await navigator.clipboard.writeText(curlStr);
      showToast('✓ Copied as cURL');
    } catch {}
  }

  function useActiveDocAsBody() {
    if (!activeDoc) {
      showToast('❌ No active document found');
      return;
    }
    if (!activeDocValid) {
      error = `Cannot load "${activeDoc.name}": Document contains JSON syntax errors. Fix or ⚡ Repair JSON first.`;
      showToast('⚠️ Cannot load: Active document has syntax errors');
      return;
    }
    body = activeDoc.text;
    error = '';
    if (method === 'GET' || method === 'HEAD') {
      method = 'POST';
    }
    showToast(`✓ Loaded "${activeDoc.name}" as Request Body`);
  }

  function loadResponseToTab(respText: string) {
    if (!respText) return;
    workspace.newDoc(respText, 'api-response.json');
    showToast('✓ Response loaded into Workbench!');
  }

  function showToast(msg: string) {
    toastMsg = msg;
    setTimeout(() => (toastMsg = ''), 2400);
  }

  async function send() {
    error = '';
    const hasBody = method !== 'GET' && method !== 'HEAD' && body.trim().length > 0;

    if (hasBody && bodySyntaxError) {
      error = `Invalid JSON in Request Body: ${bodySyntaxError}. Please fix before sending.`;
      showToast('⚠️ Cannot send: Request body has JSON syntax errors');
      return;
    }

    sending = true;
    await persistAuth();
    const id = newId();
    const startedAt = Date.now();
    const requestHeaders = parseHeaders(headersText);
    applyAuth(requestHeaders, auth);

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

  function restoreHistory(h: ApiHistoryEntry) {
    selectedId = h.id;
    method = h.method as Method;
    url = h.url;
    headersText = headersToString(h.requestHeaders);
    body = h.requestBody ?? '';
  }

  async function removeHistory(id: string, e: Event) {
    e.stopPropagation();
    await apiHistory.remove(id);
    history = await apiHistory.list();
    if (selectedId === id) selectedId = null;
  }
</script>

<div class="api-panel">
  <!-- Top Bar: Request Config -->
  <div class="req-bar">
    <select bind:value={method} class="method-select">
      {#each METHODS as m}
        <option value={m}>{m}</option>
      {/each}
    </select>
    <input type="text" bind:value={url} placeholder="https://api.example.com/data" class="url-input" />
    <button class="send-btn" onclick={send} disabled={sending || (!!body.trim() && !!bodySyntaxError)}>
      {sending ? 'Sending…' : 'Send ⚡'}
    </button>
  </div>

  <!-- Action Helpers -->
  <div class="tools-row">
    <button class="tool-btn" onclick={() => (importCurlOpen = !importCurlOpen)}>📋 Import cURL</button>
    <button class="tool-btn" onclick={handleCopyCurl}>⎘ Copy cURL</button>
    <button class="tool-btn" onclick={() => (authOpen = !authOpen)}>
      🔒 Auth: {auth.kind.toUpperCase()}
    </button>
  </div>

  {#if toastMsg}
    <div class="toast-banner">{toastMsg}</div>
  {/if}

  {#if error}
    <div class="error-banner">⚠️ {error}</div>
  {/if}

  <!-- cURL Import Modal -->
  {#if importCurlOpen}
    <div class="curl-modal">
      <span class="modal-title">Paste cURL Command</span>
      <textarea
        bind:value={curlInputText}
        placeholder={`curl -X POST "https://api.example.com/v1/items" \\
  -H "Authorization: Bearer token123" \\
  -d '{"name": "test"}'`}
        rows="4"
        class="curl-input"
      ></textarea>
      <div class="modal-actions">
        <button class="action-btn primary" onclick={handleImportCurl}>Import</button>
        <button class="action-btn" onclick={() => (importCurlOpen = false)}>Cancel</button>
      </div>
    </div>
  {/if}

  <!-- Auth Settings Drawer -->
  {#if authOpen}
    <div class="auth-drawer">
      <div class="auth-row">
        <span class="label">Auth Type:</span>
        <select bind:value={auth.kind} class="ctrl-select">
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="header">Custom Header</option>
        </select>
      </div>

      {#if auth.kind === 'bearer'}
        <input type="text" bind:value={auth.bearer} placeholder="Token value (ey...)" class="ctrl-input" />
      {:else if auth.kind === 'basic'}
        <input type="text" bind:value={auth.basicUser} placeholder="Username" class="ctrl-input" />
        <input type={revealSecret ? 'text' : 'password'} bind:value={auth.basicPass} placeholder="Password" class="ctrl-input" />
      {:else if auth.kind === 'header'}
        <input type="text" bind:value={auth.headerName} placeholder="Header Name (e.g. X-API-Key)" class="ctrl-input" />
        <input type="text" bind:value={auth.headerValue} placeholder="Header Value" class="ctrl-input" />
      {/if}
    </div>
  {/if}

  <!-- Headers & Body Inputs -->
  <div class="input-grid">
    <div class="input-block">
      <span class="block-label">Request Headers</span>
      <textarea bind:value={headersText} placeholder="Accept: application/json&#10;X-Custom: 123" rows="2"></textarea>
    </div>

    <div class="input-block">
      <div class="block-header">
        <span class="block-label">Request Body (JSON)</span>
        <button
          class="active-doc-btn"
          onclick={useActiveDocAsBody}
          disabled={!activeDocValid}
          title={activeDocValid ? `Load active file (${activeDoc?.name}) as body` : `Active file (${activeDoc?.name}) contains JSON syntax errors`}
        >
          📥 Load Active Doc ({activeDoc?.name ?? 'none'})
        </button>
      </div>

      {#if !activeDocValid && activeDoc}
        <div class="doc-warn-banner">
          ⚠️ Active file <strong>{activeDoc.name}</strong> has JSON syntax errors. ⚡ Repair it before loading as body.
        </div>
      {/if}

      {#if bodySyntaxError}
        <div class="body-err-banner">
          ⚠️ Request Body JSON Error: {bodySyntaxError}
        </div>
      {/if}

      <textarea bind:value={body} placeholder={'{\n  "title": "foo"\n}'} rows="4"></textarea>
    </div>
  </div>

  <!-- Response Inspection Card -->
  {#if selected}
    <div class="resp-card">
      <div class="resp-header">
        <div class="status-badge" class:ok={selected.ok} class:err={!selected.ok}>
          {selected.status > 0 ? `${selected.status} ${selected.statusText}` : 'ERROR'}
        </div>
        <span class="duration">{selected.durationMs} ms</span>
        <div class="spacer"></div>
        {#if selected.responseBody}
          <button class="open-tab-btn" onclick={() => loadResponseToTab(selected.responseBody)}>
            ⚡ Open Response in Workbench Tab
          </button>
        {/if}
      </div>

      {#if selected.error}
        <div class="err-box">{selected.error}</div>
      {/if}

      <div class="resp-body">
        <pre><code>{selected.responseBody.slice(0, 5000)}{selected.responseBody.length > 5000 ? '\n...[truncated]' : ''}</code></pre>
      </div>
    </div>
  {/if}

  <!-- History Timeline -->
  <div class="history-section">
    <span class="section-title">Request History ({history.length})</span>
    <div class="history-list">
      {#each history as h (h.id)}
        <button
          type="button"
          class="hist-item"
          class:selected={h.id === selectedId}
          onclick={() => restoreHistory(h)}
        >
          <span class="hist-method">{h.method}</span>
          <span class="hist-url">{h.url}</span>
          <span class="hist-status" class:ok={h.ok}>{h.status || 'ERR'}</span>
          <span class="remove-btn" role="button" tabindex="0" onclick={(e) => removeHistory(h.id, e)} onkeydown={(e) => e.key === 'Enter' && removeHistory(h.id, e)}>×</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .api-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 10px;
    padding: 12px;
    background: var(--surface);
    color: var(--fg);
    overflow-y: auto;
  }

  .req-bar {
    display: flex;
    gap: 6px;
  }
  .method-select {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px;
    font-weight: 700;
    font-size: 12px;
  }
  .url-input {
    flex: 1;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 8px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }
  .send-btn {
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
    border-radius: var(--radius);
    padding: 6px 12px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
  }
  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tools-row {
    display: flex;
    gap: 6px;
  }
  .tool-btn {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .toast-banner {
    background: var(--ok-bg, rgba(34, 197, 94, 0.15));
    color: var(--ok, #22c55e);
    border: 1px solid var(--ok, #22c55e);
    padding: 4px 8px;
    border-radius: var(--radius);
    font-size: 11px;
    text-align: center;
    font-weight: 600;
  }
  .error-banner {
    background: color-mix(in oklab, #dc2626 15%, var(--surface));
    color: #ef4444;
    border: 1px solid #ef4444;
    padding: 6px 10px;
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 500;
  }

  .curl-modal, .auth-drawer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
  }
  .modal-title, .block-label, .section-title {
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
  }
  .curl-input, textarea {
    width: 100%;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    box-sizing: border-box;
  }
  .modal-actions {
    display: flex;
    gap: 6px;
  }
  .action-btn {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .action-btn.primary {
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
  }

  .input-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .active-doc-btn {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .active-doc-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .doc-warn-banner {
    background: color-mix(in oklab, #eab308 15%, var(--surface));
    color: #eab308;
    border: 1px solid #eab308;
    padding: 4px 8px;
    border-radius: var(--radius);
    font-size: 11px;
    margin-bottom: 4px;
  }

  .body-err-banner {
    background: color-mix(in oklab, #dc2626 15%, var(--surface));
    color: #ef4444;
    border: 1px solid #ef4444;
    padding: 4px 8px;
    border-radius: var(--radius);
    font-size: 11px;
    margin-bottom: 4px;
  }

  .resp-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .resp-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    background: var(--muted);
    color: #fff;
  }
  .status-badge.ok { background: #16a34a; }
  .status-badge.err { background: #dc2626; }
  .duration { font-size: 11px; color: var(--muted); }
  .open-tab-btn {
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
    border-radius: var(--radius);
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .resp-body {
    max-height: 180px;
    overflow: auto;
    background: var(--surface);
    padding: 8px;
    border-radius: var(--radius);
  }
  .resp-body pre {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }

  .history-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hist-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 8px;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 11px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .hist-item.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .hist-method { font-weight: 700; color: var(--accent); }
  .hist-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; }
  .hist-status { font-weight: 600; color: #dc2626; }
  .hist-status.ok { color: #16a34a; }
  .remove-btn { border: 0; background: transparent; color: var(--muted); cursor: pointer; }
  .remove-btn:hover { color: var(--fg); }
</style>
