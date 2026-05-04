<script lang="ts">
  import { workspace } from '../core/store.svelte';
  let active = $derived(workspace.active);
  const placeholder = 'Paste JSON Schema, e.g. {"type": "object", "required": ["name"]}';
</script>

<div class="schema">
  <div class="head">
    <span>JSON Schema</span>
    <button class="clear" onclick={() => active.setSchema('')} disabled={!active.schemaText}>Clear</button>
  </div>
  <div class="hint">Paste a JSON Schema; violations appear inline and in the editor gutter.</div>
  <textarea
    class="editor"
    spellcheck="false"
    {placeholder}
    value={active.schemaText}
    oninput={(e) => active.setSchema((e.currentTarget as HTMLTextAreaElement).value)}
  ></textarea>

  <div class="status">
    {#if active.schemaCompileError}
      <div class="err">{active.schemaCompileError}</div>
    {:else if !active.schemaText}
      <div class="muted">No schema loaded.</div>
    {:else if active.schemaErrors.length === 0}
      <div class="ok">Document matches schema.</div>
    {:else}
      <div class="err-head">{active.schemaErrors.length} schema violation{active.schemaErrors.length === 1 ? '' : 's'}</div>
      <ul>
        {#each active.schemaErrors as e}
          <li><span class="path">{e.path || '$'}</span> <span class="msg">{e.message}</span></li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .schema {
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
  .hint {
    padding: 4px 10px 6px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    border-bottom: 1px solid var(--border);
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
  .editor {
    flex: 1;
    min-height: 100px;
    border: 0;
    background: var(--surface);
    color: var(--fg);
    padding: 8px 12px;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    resize: none;
    outline: none;
  }
  .status {
    border-top: 1px solid var(--border);
    padding: 6px 12px;
    font-size: 12px;
    max-height: 180px;
    overflow: auto;
  }
  .ok { color: var(--ok); }
  .err, .err-head { color: var(--err); margin-bottom: 4px; }
  .err-head { font-weight: 600; }
  .muted { color: var(--muted); }
  ul { list-style: none; padding: 0; margin: 0; }
  li {
    padding: 2px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    display: flex;
    gap: 8px;
  }
  .path { color: var(--err); flex-shrink: 0; }
  .msg { color: var(--fg); }
</style>
