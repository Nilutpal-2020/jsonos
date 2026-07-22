<script lang="ts">
  import { doc, workspace } from "../core/store.svelte";
  import { ui } from "../core/ui-prefs.svelte";
  import { tool } from "../core/tool-router.svelte";

  let { open = $bindable(false) }: { open: boolean } = $props();

  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>();

  interface CommandItem {
    id: string;
    category: "Action" | "Schema Template" | "Query Operator" | "Article & Guide";
    title: string;
    description: string;
    keywords: string;
    icon: string;
    action: () => void;
  }

  const SCHEMA_TEMPLATES = {
    userProfile: JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: "UserProfile",
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string", minLength: 3 },
          email: { type: "string", format: "email" },
          age: { type: "integer", minimum: 0 },
          role: { type: "string", enum: ["admin", "user", "guest"] }
        },
        required: ["id", "username", "email"]
      },
      null,
      2
    ),
    apiResponse: JSON.stringify(
      {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "APIResponse",
        type: "object",
        properties: {
          status: { type: "integer", enum: [200, 400, 404, 500] },
          message: { type: "string" },
          data: { type: "array" }
        },
        required: ["status", "data"]
      },
      null,
      2
    ),
    geoJson: JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: "GeoJSON Feature",
        type: "object",
        properties: {
          type: { type: "string", const: "Feature" },
          geometry: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["Point", "LineString", "Polygon"] },
              coordinates: { type: "array" }
            },
            required: ["type", "coordinates"]
          },
          properties: { type: "object" }
        },
        required: ["type", "geometry"]
      },
      null,
      2
    ),
    avroRecord: JSON.stringify(
      {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "AvroToJSONSchemaRecord",
        type: "object",
        properties: {
          type: { type: "string", const: "record" },
          name: { type: "string" },
          namespace: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: ["string", "array", "object"] }
              },
              required: ["name", "type"]
            }
          }
        },
        required: ["type", "name", "fields"]
      },
      null,
      2
    )
  };

  const ALL_COMMANDS: CommandItem[] = [
    // Actions
    {
      id: "format",
      category: "Action",
      title: "Format JSON Document",
      description: "Beautify active JSON document with 2-space indentation (⌘/)",
      keywords: "format beautify prettify indent json schema validator online",
      icon: "✨",
      action: () => doc.format(2),
    },
    {
      id: "repair",
      category: "Action",
      title: "Repair Broken JSON",
      description: "Auto-fix comments, smart quotes, trailing commas, single quotes, Python literals",
      keywords: "repair fix clean json lint jsonlint alternative ajv online",
      icon: "🛠️",
      action: () => doc.repair(),
    },
    {
      id: "minify",
      category: "Action",
      title: "Minify JSON",
      description: "Remove all whitespace and newlines for compact storage",
      keywords: "minify compact compress json",
      icon: "⚡",
      action: () => doc.minify(),
    },
    {
      id: "sort-keys",
      category: "Action",
      title: "Sort Object Keys",
      description: "Deep-sort all object keys alphabetically",
      keywords: "sort keys alphabetical order json",
      icon: "🔤",
      action: () => doc.sortKeys(true),
    },
    {
      id: "validate-schema",
      category: "Action",
      title: "Validate JSON Schema (Ajv)",
      description: "Open the Schema validation panel for AJV JSON schema validator online",
      keywords: "validate schema ajv json schema validator online online json schema validator type format definition",
      icon: "✔️",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "schema" }));
      },
    },
    {
      id: "query-panel",
      category: "Action",
      title: "MongoDB Query Panel",
      description: "Filter JSON arrays and documents using MongoDB-style query operators (⌘⇧K)",
      keywords: "query filter mongodb find search json search suggestions",
      icon: "🔎",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "query" }));
      },
    },
    {
      id: "compare-pair",
      category: "Action",
      title: "Compare / Diff Side-by-Side",
      description: "Link active document with a second document to compare differences (⌘⇧C)",
      keywords: "compare diff side by side sync scroll json visualizer show json",
      icon: "⇄",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "diff" }));
      },
    },
    {
      id: "toggle-wrap",
      category: "Action",
      title: "Toggle Text Wrap",
      description: "Soft wrap long lines in editor (⌘⇧W)",
      keywords: "wrap text word wrap line wrap",
      icon: "⤶",
      action: () => ui.toggleWrap(),
    },
    {
      id: "switch-markdown",
      category: "Action",
      title: "Switch to Markdown Studio",
      description: "Live Markdown editor with Mermaid diagrams, KaTeX math & code highlighting",
      keywords: "markdown studio editor mermaid preview katex math",
      icon: "✎",
      action: () => tool.set("md"),
    },
    {
      id: "new-doc",
      category: "Action",
      title: "New Document",
      description: "Create a new tab document (⌘T)",
      keywords: "new doc tab create document",
      icon: "➕",
      action: () => workspace.newDoc(),
    },

    // Schema Templates
    {
      id: "tmpl-user",
      category: "Schema Template",
      title: "Template: User Profile Schema",
      description: "JSON Schema definition for user profiles with UUID, email format, and enum role",
      keywords: "user profile template schema definition ajv json schema validator online",
      icon: "👤",
      action: () => {
        workspace.active.setSchema(SCHEMA_TEMPLATES.userProfile);
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "schema" }));
      },
    },
    {
      id: "tmpl-api",
      category: "Schema Template",
      title: "Template: REST API Response Schema",
      description: "JSON Schema for API status codes, messages, and payload arrays",
      keywords: "api response template draft-07 json schema format type",
      icon: "🌐",
      action: () => {
        workspace.active.setSchema(SCHEMA_TEMPLATES.apiResponse);
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "schema" }));
      },
    },
    {
      id: "tmpl-geojson",
      category: "Schema Template",
      title: "Template: GeoJSON Feature Schema",
      description: "JSON Schema for Point, LineString, Polygon geographic features",
      keywords: "geojson template geometry coordinates visualizer",
      icon: "🗺️",
      action: () => {
        workspace.active.setSchema(SCHEMA_TEMPLATES.geoJson);
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "schema" }));
      },
    },
    {
      id: "tmpl-avro",
      category: "Schema Template",
      title: "Template: Avro-to-JSON Schema Definition",
      description: "Schema mapping for Apache Avro record types, fields, and unions",
      keywords: "avro schema validator online avro to json schema record union default",
      icon: "📦",
      action: () => {
        workspace.active.setSchema(SCHEMA_TEMPLATES.avroRecord);
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "schema" }));
      },
    },

    // Query Operator Suggestions
    {
      id: "op-gt",
      category: "Query Operator",
      title: "Query: $gt / $lt Comparison",
      description: "Filter numeric values greater or less than threshold: { age: { $gt: 18 } }",
      keywords: "query gt gte lt lte filter comparison search suggestions",
      icon: "🔢",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "query" }));
      },
    },
    {
      id: "op-in",
      category: "Query Operator",
      title: "Query: $in Array Match",
      description: "Check if property value is contained in array: { role: { $in: ['admin', 'owner'] } }",
      keywords: "query in nin array contains list search suggestions",
      icon: "🎯",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "query" }));
      },
    },
    {
      id: "op-regex",
      category: "Query Operator",
      title: "Query: $regex Pattern Search",
      description: "Match string properties with regular expressions: { email: { $regex: '@example\\\\.com$' } }",
      keywords: "query regex pattern search match string regex search suggestions",
      icon: "🔤",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "query" }));
      },
    },
    {
      id: "op-elemMatch",
      category: "Query Operator",
      title: "Query: $elemMatch Sub-Query",
      description: "Match complex elements inside nested arrays",
      keywords: "query elemmatch nested array object subquery filter",
      icon: "🔍",
      action: () => {
        window.dispatchEvent(new CustomEvent("jsonos:open-side-tab", { detail: "query" }));
      },
    },

    // Articles & Guides
    {
      id: "art-schema-guide",
      category: "Article & Guide",
      title: "Guide: Online JSON Schema Validator with Ajv",
      description: "Learn how to use Ajv, type declarations, format options, and online validation",
      keywords: "online json schema validator ajv json schema validator guide article",
      icon: "📚",
      action: () => window.open("/blog/online-json-schema-validator-guide", "_blank", "noopener"),
    },
    {
      id: "art-visualize",
      category: "Article & Guide",
      title: "Guide: How to Visualize JSON Data Online",
      description: "Interactive tree views, tabular spreadsheets, and object viewer techniques",
      keywords: "visualize json data visualize json online json object viewer guide article",
      icon: "📊",
      action: () => window.open("/blog/how-to-visualize-json-data-online", "_blank", "noopener"),
    },
    {
      id: "art-avro",
      category: "Article & Guide",
      title: "Guide: Avro Schema vs JSON Schema Comparison",
      description: "Detailed comparison of Apache Avro binary schemas vs JSON Schema definitions",
      keywords: "avro schema validator online avro vs json schema comparison guide article",
      icon: "📖",
      action: () => window.open("/blog/avro-schema-vs-json-schema-validation", "_blank", "noopener"),
    },
  ];

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_COMMANDS;
    return ALL_COMMANDS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.keywords.toLowerCase().includes(q)
    );
  });

  $effect(() => {
    if (open) {
      query = "";
      selectedIndex = 0;
      setTimeout(() => inputEl?.focus(), 50);
    }
  });

  function close() {
    open = false;
  }

  function executeItem(item: CommandItem) {
    close();
    item.action();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % Math.max(1, filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filtered.length) % Math.max(1, filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        executeItem(filtered[selectedIndex]);
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="backdrop" onclick={close} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="palette" tabindex="-1" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input
          bind:this={inputEl}
          type="text"
          class="search-input"
          placeholder="Search commands, schema templates, query operators, or guides (e.g., 'schema', 'format', 'visualize')..."
          bind:value={query}
        />
        <kbd class="esc-kbd">ESC</kbd>
      </div>

      <div class="results">
        {#if filtered.length === 0}
          <div class="empty">No matching actions or search suggestions found for &ldquo;{query}&rdquo;</div>
        {:else}
          {#each filtered as item, i (item.id)}
            <button
              class="result-item"
              class:selected={i === selectedIndex}
              onclick={() => executeItem(item)}
              onmouseenter={() => (selectedIndex = i)}
            >
              <span class="item-icon">{item.icon}</span>
              <div class="item-body">
                <div class="item-head">
                  <span class="item-title">{item.title}</span>
                  <span class="item-cat">{item.category}</span>
                </div>
                <div class="item-desc">{item.description}</div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <div class="foot">
        <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> select</span>
        <span><kbd>ESC</kbd> close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: color-mix(in oklab, var(--bg) 40%, transparent);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
  }
  .palette {
    width: min(640px, 92vw);
    max-height: 72vh;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .search-icon {
    font-size: 16px;
  }
  .search-input {
    flex: 1;
    background: transparent;
    border: 0;
    color: var(--fg);
    font: inherit;
    font-size: 14px;
    outline: none;
  }
  .esc-kbd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    color: var(--muted);
  }
  .results {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    max-height: 480px;
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  .result-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 0;
    border-radius: var(--radius);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    transition: background 60ms;
  }
  .result-item:hover,
  .result-item.selected {
    background: var(--row-hover-strong);
  }
  .result-item.selected {
    outline: 1px solid var(--accent);
  }
  .item-icon {
    font-size: 18px;
    line-height: 1.2;
    flex-shrink: 0;
  }
  .item-body {
    flex: 1;
    min-width: 0;
  }
  .item-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .item-title {
    font-weight: 600;
    font-size: 13px;
  }
  .item-cat {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--accent-soft);
    color: var(--accent);
    padding: 1px 6px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .item-desc {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    display: flex;
    gap: 16px;
    padding: 8px 16px;
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
  }
  .foot kbd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 4px;
    color: var(--fg);
  }
</style>
