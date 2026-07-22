<script lang="ts">
  import { workspace } from '../core/store.svelte';
  let active = $derived(workspace.active);
  const placeholder = 'Paste JSON Schema, e.g. {"type": "object", "required": ["name"]}';

  const PRESETS = [
    {
      label: 'User Profile',
      schema: JSON.stringify(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          title: 'UserProfile',
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string', minLength: 3 },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'user', 'guest'] }
          },
          required: ['id', 'username', 'email']
        },
        null,
        2
      )
    },
    {
      label: 'API Response',
      schema: JSON.stringify(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          title: 'APIResponse',
          type: 'object',
          properties: {
            status: { type: 'integer', enum: [200, 400, 404, 500] },
            message: { type: 'string' },
            data: { type: 'array' }
          },
          required: ['status', 'data']
        },
        null,
        2
      )
    },
    {
      label: 'GeoJSON',
      schema: JSON.stringify(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          title: 'GeoJSON',
          type: 'object',
          properties: {
            type: { type: 'string', const: 'Feature' },
            geometry: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['Point', 'LineString', 'Polygon'] },
                coordinates: { type: 'array' }
              },
              required: ['type', 'coordinates']
            }
          },
          required: ['type', 'geometry']
        },
        null,
        2
      )
    },
    {
      label: 'Avro to JSON',
      schema: JSON.stringify(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          title: 'AvroRecord',
          type: 'object',
          properties: {
            type: { type: 'string', const: 'record' },
            name: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: ['string', 'array', 'object'] }
                },
                required: ['name', 'type']
              }
            }
          },
          required: ['type', 'name', 'fields']
        },
        null,
        2
      )
    }
  ];

  function loadPreset(schema: string) {
    active.setSchema(schema);
  }
</script>

<div class="schema">
  <div class="head">
    <span>JSON Schema (Ajv)</span>
    <button class="clear" onclick={() => active.setSchema('')} disabled={!active.schemaText}>Clear</button>
  </div>
  <div class="hint">Paste a JSON Schema or pick a preset template; Ajv validates violations inline.</div>

  <div class="presets">
    <span class="preset-lbl">Presets:</span>
    {#each PRESETS as p}
      <button class="preset-chip" onclick={() => loadPreset(p.schema)}>{p.label}</button>
    {/each}
  </div>

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
      <div class="muted">No schema loaded. Pick a preset chip above or paste a schema.</div>
    {:else if active.schemaErrors.length === 0}
      <div class="ok">✓ Document matches JSON Schema definition.</div>
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
  .presets {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .preset-lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    margin-right: 2px;
  }
  .preset-chip {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 999px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 10.5px;
    transition: border-color 80ms, color 80ms;
  }
  .preset-chip:hover {
    border-color: var(--accent);
    color: var(--accent);
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
  .ok { color: var(--ok); font-weight: 600; }
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
