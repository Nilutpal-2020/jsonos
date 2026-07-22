<script lang="ts">
  import { doc } from '../core/store.svelte';
  import { generateTypes, type TargetLang } from '../core/type-gen';

  let target = $state<TargetLang>('typescript');
  let rootName = $state('Root');

  let generatedCode = $derived.by(() => {
    return generateTypes(doc.parse.value, { rootName: rootName.trim() || 'Root', target });
  });

  let copied = $state(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(generatedCode);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch { /* ignore */ }
  }

  function downloadCode() {
    const extMap: Record<TargetLang, string> = {
      typescript: 'ts',
      zod: 'ts',
      python: 'py',
      rust: 'rs',
      go: 'go',
      'json-schema': 'json',
    };
    const filename = `${rootName.toLowerCase() || 'types'}.${extMap[target]}`;
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="typegen-container">
  <div class="config-row">
    <label class="field">
      <span class="label-text">Root Name</span>
      <input type="text" bind:value={rootName} placeholder="Root" class="name-input" />
    </label>

    <div class="field">
      <span class="label-text">Target Language</span>
      <div class="lang-tabs">
        <button class:active={target === 'typescript'} onclick={() => (target = 'typescript')}>TS</button>
        <button class:active={target === 'zod'} onclick={() => (target = 'zod')}>Zod</button>
        <button class:active={target === 'python'} onclick={() => (target = 'python')}>Python</button>
        <button class:active={target === 'rust'} onclick={() => (target = 'rust')}>Rust</button>
        <button class:active={target === 'go'} onclick={() => (target = 'go')}>Go</button>
        <button class:active={target === 'json-schema'} onclick={() => (target = 'json-schema')}>Schema</button>
      </div>
    </div>
  </div>

  <div class="output-header">
    <span class="output-title">Generated {target.toUpperCase()} Code</span>
    <div class="action-btns">
      <button class="action-btn" onclick={copyCode}>
        {copied ? '✓ Copied' : '⎘ Copy'}
      </button>
      <button class="action-btn" onclick={downloadCode}>↧ Download</button>
    </div>
  </div>

  <div class="code-area">
    <pre><code>{generatedCode}</code></pre>
  </div>
</div>

<style>
  .typegen-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 12px;
    padding: 12px;
    overflow-y: auto;
  }
  .config-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label-text {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .name-input {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 5px 8px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
    outline: none;
  }
  .name-input:focus {
    border-color: var(--accent);
  }

  .lang-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .lang-tabs button {
    flex: 1;
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 80ms, color 80ms;
  }
  .lang-tabs button:hover {
    color: var(--fg);
    border-color: var(--muted);
  }
  .lang-tabs button.active {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }

  .output-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 4px;
  }
  .output-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--fg);
  }
  .action-btns {
    display: flex;
    gap: 6px;
  }
  .action-btn {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .action-btn:hover {
    background: var(--row-hover-strong);
  }

  .code-area {
    flex: 1;
    min-height: 180px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: auto;
    padding: 10px;
  }
  .code-area pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: var(--fg);
    white-space: pre;
  }
</style>
