<script lang="ts">
  type Tab = 'docs' | 'syntax' | 'shortcuts' | 'embeds' | 'about' | 'feedback';

  let {
    open = $bindable(false),
    tab = $bindable<Tab>('docs'),
  }: { open: boolean; tab: Tab } = $props();

  const FEEDBACK_EMAIL = 'jsonos.online@gmail.com';

  function close() { open = false; }
  function onBackdrop(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
  }
  function openMail() {
    const subject = encodeURIComponent('JSON OS — Markdown Studio feedback');
    const body = encodeURIComponent(`\n\n---\nUA: ${navigator.userAgent}\nApp: JSON OS · Markdown\n`);
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  }

  const SHORTCUTS: { group: string; items: { keys: string; label: string }[] }[] = [
    {
      group: 'Editing',
      items: [
        { keys: '⌘ B', label: 'Bold (wrap selection in **…**)' },
        { keys: '⌘ I', label: 'Italic (wrap in *…*)' },
        { keys: '⌘ E', label: 'Inline code (wrap in `…`)' },
        { keys: '⌘ K', label: 'Insert link [text](url)' },
        { keys: '⌘ ⇧ .', label: 'Toggle blockquote on selected lines' },
        { keys: '⌘ Z', label: 'Undo' },
        { keys: '⌘ ⇧ Z  /  ⌘ Y', label: 'Redo' },
        { keys: '⌘ F', label: 'Find / replace inside the editor' },
      ],
    },
    {
      group: 'Workspace',
      items: [
        { keys: '⌘ T', label: 'New markdown doc' },
        { keys: '⌘ S', label: 'Download active doc as .md' },
        { keys: '⌘ ⇧ P', label: 'Toggle preview-only / split layout' },
        { keys: '⌘ ⇧ W', label: 'Toggle text wrap in the editor' },
        { keys: '?', label: 'Open this help dialog' },
        { keys: 'Esc', label: 'Close any open dialog or menu' },
      ],
    },
  ];

  const SYNTAX: { group: string; items: { code: string; label: string }[] }[] = [
    {
      group: 'Inline',
      items: [
        { code: '**bold**',           label: 'Bold' },
        { code: '*italic*',           label: 'Italic' },
        { code: '~~strike~~',         label: 'Strikethrough (GFM)' },
        { code: '`code`',             label: 'Inline code' },
        { code: '[label](https://…)', label: 'Link (external links open in a new tab)' },
        { code: '![alt](image.png)',  label: 'Image' },
      ],
    },
    {
      group: 'Block',
      items: [
        { code: '# H1   ## H2   ### H3',   label: 'Headings' },
        { code: '- item   * item   + item', label: 'Bullet list' },
        { code: '1. one   2. two',          label: 'Numbered list' },
        { code: '- [ ] todo   - [x] done',  label: 'Task list (GFM)' },
        { code: '> quote',                  label: 'Blockquote' },
        { code: '```ts\\ncode\\n```',         label: 'Fenced code (lang highlights)' },
        { code: '| a | b |\\n|---|---|\\n| 1 | 2 |', label: 'Table (GFM)' },
        { code: '---',                      label: 'Horizontal rule' },
      ],
    },
    {
      group: 'Math (KaTeX)',
      items: [
        { code: '$E = mc^2$',                           label: 'Inline math' },
        { code: '$$\\\\int_0^\\\\infty e^{-x^2}\\\\,dx$$', label: 'Block math' },
      ],
    },
    {
      group: 'Mermaid',
      items: [
        { code: '```mermaid\\nflowchart LR\\nA --> B\\n```', label: 'Diagram block (rendered to SVG)' },
      ],
    },
  ];

  const EMBEDS: { provider: string; example: string; note: string }[] = [
    { provider: 'YouTube',     example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', note: 'or youtu.be/<id>' },
    { provider: 'Vimeo',       example: 'https://vimeo.com/76979871',                 note: 'numeric id' },
    { provider: 'CodePen',     example: 'https://codepen.io/user/pen/abcXYZ',         note: 'public pens' },
    { provider: 'CodeSandbox', example: 'https://codesandbox.io/s/abcdef',            note: 'preview view' },
    { provider: 'JSFiddle',    example: 'https://jsfiddle.net/user/abcd1234/',        note: 'result tab' },
    { provider: 'GitHub Gist', example: 'https://gist.github.com/user/abc123',        note: 'rendered via gist.js' },
    { provider: 'Twitter / X', example: 'https://twitter.com/user/status/12345',      note: 'styled card link' },
  ];

  const STACK = [
    'Svelte 5 (runes)',
    'CodeMirror 6',
    'marked v18',
    'DOMPurify',
    'KaTeX',
    'Mermaid',
    'highlight.js',
    'idb-keyval',
  ];
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="backdrop" onclick={onBackdrop} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="md-help-title">
      <div class="head">
        <div class="brand">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <defs>
              <linearGradient id="md-hd-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#5b9eff" />
                <stop offset="1" stop-color="#2563eb" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="7" fill="url(#md-hd-grad)" />
            <g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11.5 7.5c-2.5 0-3.5 1.2-3.5 3.2v3.1c0 1.4-.7 2.2-2 2.2 1.3 0 2 .8 2 2.2v3.1c0 2 1 3.2 3.5 3.2"/>
              <path d="M20.5 7.5c2.5 0 3.5 1.2 3.5 3.2v3.1c0 1.4.7 2.2 2 2.2-1.3 0-2 .8-2 2.2v3.1c0 2-1 3.2-3.5 3.2"/>
            </g>
            <circle cx="16" cy="16" r="1.5" fill="#fff" />
          </svg>
          <h3 id="md-help-title">Markdown Studio · Help</h3>
        </div>
        <button class="x" onclick={close} aria-label="close">×</button>
      </div>

      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'docs'}      class:on={tab === 'docs'}      onclick={() => (tab = 'docs')}>Docs</button>
        <button role="tab" aria-selected={tab === 'syntax'}    class:on={tab === 'syntax'}    onclick={() => (tab = 'syntax')}>Syntax</button>
        <button role="tab" aria-selected={tab === 'shortcuts'} class:on={tab === 'shortcuts'} onclick={() => (tab = 'shortcuts')}>Shortcuts</button>
        <button role="tab" aria-selected={tab === 'embeds'}    class:on={tab === 'embeds'}    onclick={() => (tab = 'embeds')}>Embeds</button>
        <button role="tab" aria-selected={tab === 'about'}     class:on={tab === 'about'}     onclick={() => (tab = 'about')}>About</button>
        <button role="tab" aria-selected={tab === 'feedback'}  class:on={tab === 'feedback'}  onclick={() => (tab = 'feedback')}>Feedback</button>
      </div>

      <div class="body">
        {#if tab === 'docs'}
          <section>
            <h4>Getting started</h4>
            <p>
              Drop a <code>.md</code> file anywhere, click <strong>Open</strong>, or paste from
              clipboard. Each tab is its own document; everything is auto-saved to your browser
              (IndexedDB) and survives reloads.
            </p>
          </section>

          <section>
            <h4>Three layouts</h4>
            <ul>
              <li><strong>Edit</strong> — full-width editor for distraction-free writing.</li>
              <li><strong>Split</strong> — editor on the left, live preview on the right (default).</li>
              <li><strong>Preview</strong> — full-width rendered output. Toggle with <code>⌘ ⇧ P</code>.</li>
            </ul>
          </section>

          <section>
            <h4>Editor</h4>
            <p>
              CodeMirror 6 with markdown syntax highlight, fenced-code language sub-highlighting
              (TypeScript, JavaScript, HTML, CSS, JSON), bracket matching, fold gutter, and
              regex-aware find / replace. The toolbar buttons and shortcuts wrap the current
              selection — try <code>⌘ B</code> with text selected.
            </p>
          </section>

          <section>
            <h4>Live preview</h4>
            <p>
              Renders <strong>GitHub-Flavored Markdown</strong> (tables, task lists, autolinks,
              strikethrough). Headings get anchor IDs, code blocks get a hover Copy button, and
              external links open in a new tab. The preview re-renders as you type.
            </p>
          </section>

          <section>
            <h4>Math (KaTeX)</h4>
            <p>
              Inline math with <code>$…$</code>, block math with <code>$$…$$</code>. The renderer
              extracts math <em>before</em> markdown parsing so braces and underscores in
              equations are never mangled by markdown syntax.
            </p>
          </section>

          <section>
            <h4>Mermaid diagrams</h4>
            <p>
              Use a fenced code block with the language <code>mermaid</code> to render a flowchart,
              sequence, gantt, ER, or class diagram. Mermaid loads on first use only and follows
              the active light / dark theme.
            </p>
          </section>

          <section>
            <h4>Embeds</h4>
            <p>
              Paste a URL on its own line (no markdown around it) and supported providers turn
              into a player or card. See the <strong>Embeds</strong> tab for the full list.
            </p>
          </section>

          <section>
            <h4>Export</h4>
            <ul>
              <li><strong>Save</strong> downloads the source as <code>.md</code>.</li>
              <li><strong>⎘ HTML</strong> copies the rendered HTML to the clipboard.</li>
              <li><strong>↧ HTML</strong> downloads a standalone <code>.html</code> with light-theme styles inlined.</li>
            </ul>
          </section>

          <section>
            <h4>Privacy</h4>
            <p>
              Everything happens locally in your browser — parsing, rendering, persistence. No
              upload, no account, no telemetry beyond the privacy-friendly analytics described
              in the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.
              Embed iframes load directly from the provider's domain.
            </p>
          </section>
        {:else if tab === 'syntax'}
          {#each SYNTAX as g}
            <section>
              <h4>{g.group}</h4>
              <table class="kbd">
                <tbody>
                  {#each g.items as it}
                    <tr>
                      <td class="k"><code class="syntax">{it.code.replace(/\\n/g, '\n')}</code></td>
                      <td class="lbl">{it.label}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>
          {/each}
        {:else if tab === 'shortcuts'}
          {#each SHORTCUTS as g}
            <section>
              <h4>{g.group}</h4>
              <table class="kbd">
                <tbody>
                  {#each g.items as it}
                    <tr>
                      <td class="k"><kbd>{it.keys}</kbd></td>
                      <td class="lbl">{it.label}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>
          {/each}
        {:else if tab === 'embeds'}
          <section>
            <h4>How to embed</h4>
            <p>
              Paste a URL from a supported provider on its own line, with no surrounding markdown.
              The renderer recognises the URL and replaces the paragraph with an iframe (for video
              and code playgrounds) or a card (for gists and tweets).
            </p>
            <p class="muted small">
              Iframe sources are restricted to the providers below — DOMPurify strips any
              iframe pointing elsewhere.
            </p>
          </section>
          <section>
            <h4>Supported providers</h4>
            <table class="kbd">
              <tbody>
                {#each EMBEDS as e}
                  <tr>
                    <td class="k"><strong>{e.provider}</strong></td>
                    <td class="lbl">
                      <code class="syntax small">{e.example}</code>
                      <div class="muted small">{e.note}</div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
          <section>
            <h4>Custom HTML &amp; iframes</h4>
            <p>
              Inline HTML in markdown is sanitised (DOMPurify). Most safe tags are kept, but
              <code>&lt;script&gt;</code> is stripped (except the one Gist embed needs) and any
              <code>&lt;iframe&gt;</code> with a host outside the allowlist is removed.
            </p>
          </section>
        {:else if tab === 'about'}
          <section>
            <h4>Markdown Studio</h4>
            <p>
              A second tool inside JSON OS for editing and previewing markdown. Same local-first
              philosophy: no server, no upload, no account. Documents are kept in IndexedDB on
              your device and never leave it.
            </p>
          </section>
          <section>
            <h4>Highlights</h4>
            <ul>
              <li>GitHub-Flavored Markdown with live preview</li>
              <li>Mermaid diagrams (flowchart, sequence, gantt, class, ER, …)</li>
              <li>KaTeX math, inline and block</li>
              <li>Syntax-highlighted fenced code with one-click copy</li>
              <li>YouTube, Vimeo, CodePen, CodeSandbox, JSFiddle, Gist, Twitter / X embeds</li>
              <li>Three layouts: edit, split, preview</li>
              <li>Multi-tab workspace, drag-drop import, .md / .html export</li>
            </ul>
          </section>
          <section>
            <h4>Built with</h4>
            <ul class="stack">
              {#each STACK as s}<li>{s}</li>{/each}
            </ul>
          </section>
        {:else}
          <section>
            <h4>Feedback</h4>
            <p>
              Markdown Studio is brand new and rough edges are expected. If something looks wrong
              in a render, a shortcut feels off, or you want a provider added to the embed list,
              get in touch at <a href="mailto:{FEEDBACK_EMAIL}">{FEEDBACK_EMAIL}</a>.
            </p>
            <p>Thank you!</p>
          </section>
          <section>
            <button class="primary" onclick={openMail}>✉ Send feedback</button>
            <p class="muted small">Opens your default mail client. We'll tack on the user-agent so we can reproduce.</p>
          </section>
        {/if}
      </div>

      <div class="foot">
        <span class="hint muted small">Press <kbd>Esc</kbd> to close · <kbd>?</kbd> to reopen</span>
        <button onclick={close}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: color-mix(in oklab, var(--bg) 30%, transparent);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .dialog {
    width: min(680px, 94vw);
    max-height: 86vh;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--fg);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand h3 { margin: 0; font-size: 14px; }
  .x {
    background: transparent; border: 0;
    color: var(--muted); cursor: pointer;
    font-size: 18px; padding: 0 4px;
  }
  .x:hover { color: var(--fg); }

  .tabs {
    display: flex;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tabs button {
    background: transparent;
    border: 0;
    color: var(--muted);
    padding: 8px 14px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    transition: color 80ms;
    white-space: nowrap;
  }
  .tabs button:hover { color: var(--fg); }
  .tabs button.on {
    color: var(--fg);
    border-bottom: 2px solid var(--accent);
    margin-bottom: -1px;
  }

  .body {
    padding: 16px 20px;
    overflow: auto;
    flex: 1;
    font-size: 13px;
    line-height: 1.55;
  }
  section { margin-bottom: 18px; }
  section:last-child { margin-bottom: 0; }
  section h4 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  section p { margin: 0 0 10px; }
  section p:last-child { margin-bottom: 0; }
  ul { margin: 0; padding-left: 18px; }
  li { padding: 1px 0; }
  ul.stack {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  ul.stack li {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 10px;
  }
  code {
    background: var(--surface-2);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
  }
  code.syntax {
    display: inline-block;
    white-space: pre;
    line-height: 1.5;
    padding: 4px 8px;
  }
  code.small { font-size: 11px; padding: 1px 5px; }
  a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dotted currentColor;
  }
  a:hover { border-bottom-style: solid; }

  table.kbd { width: 100%; border-collapse: collapse; }
  table.kbd td { padding: 6px 8px; vertical-align: top; }
  table.kbd td.k { width: 240px; white-space: nowrap; }
  kbd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 1px 6px;
    color: var(--fg);
  }
  .lbl { color: var(--fg); }
  .muted { color: var(--muted); }
  .small { font-size: 11px; }

  .primary {
    background: var(--accent);
    color: var(--accent-fg);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 6px 14px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .primary:hover { filter: brightness(1.1); }

  .foot {
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .foot .hint { font-size: 11px; }
  .foot button {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: var(--radius);
    padding: 6px 14px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .foot button:hover { background: var(--row-hover-strong); }
</style>
