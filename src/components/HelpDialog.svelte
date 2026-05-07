<script lang="ts">
  type Tab = "docs" | "shortcuts" | "about" | "feedback";

  let {
    open = $bindable(false),
    tab = $bindable<Tab>("docs"),
  }: { open: boolean; tab: Tab } = $props();

  const FEEDBACK_EMAIL = "jsonos.online@gmail.com";

  function close() {
    open = false;
  }
  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  function openMail() {
    const subject = encodeURIComponent("JSON OS feedback");
    const body = encodeURIComponent(
      `\n\n---\nUA: ${navigator.userAgent}\nApp: JSON OS\n`,
    );
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  }

  // ───── Share JSON OS on social platforms ─────
  const SHARE_URL = "https://jsonos.online/";
  const SHARE_TITLE = "JSON OS — free, local-first JSON editor + Markdown previewer";
  const SHARE_TEXT =
    "Free online JSON editor and Markdown previewer. Format, validate, repair, compare, query JSON; render Markdown with Mermaid + KaTeX. Local-first, no signup.";

  const SHARE_TARGETS: { id: string; label: string; href: string; icon: string }[] = [
    {
      id: "twitter",
      label: "X / Twitter",
      icon: "𝕏",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TITLE)}&url=${encodeURIComponent(SHARE_URL)}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      icon: "in",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
    },
    {
      id: "reddit",
      label: "Reddit",
      icon: "r/",
      href: `https://reddit.com/submit?url=${encodeURIComponent(SHARE_URL)}&title=${encodeURIComponent(SHARE_TITLE)}`,
    },
    {
      id: "hn",
      label: "Hacker News",
      icon: "Y",
      href: `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(SHARE_URL)}&t=${encodeURIComponent(SHARE_TITLE)}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      icon: "f",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: "✆",
      href: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${SHARE_TITLE} ${SHARE_URL}`)}`,
    },
    {
      id: "telegram",
      label: "Telegram",
      icon: "✈",
      href: `https://t.me/share/url?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TITLE)}`,
    },
    {
      id: "email",
      label: "Email",
      icon: "✉",
      href: `mailto:?subject=${encodeURIComponent(SHARE_TITLE)}&body=${encodeURIComponent(`${SHARE_TEXT}\n\n${SHARE_URL}`)}`,
    },
  ];

  let copyState = $state<"" | "ok" | "err">("");
  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      copyState = "ok";
    } catch {
      copyState = "err";
    }
    setTimeout(() => (copyState = ""), 1500);
  }
  async function nativeShare() {
    if (!navigator.share) {
      copyShareLink();
      return;
    }
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
    } catch { /* user cancelled */ }
  }

  // Shortcut groups, kept declarative so additions are one-line.
  const SHORTCUTS: {
    group: string;
    items: { keys: string; label: string }[];
  }[] = [
    {
      group: "Editing",
      items: [
        { keys: "⌘ Z", label: "Undo" },
        { keys: "⌘ ⇧ Z  /  ⌘ Y", label: "Redo" },
        { keys: "⌘ S", label: "Download active doc" },
        { keys: "⌘ /", label: "Format JSON (2-space indent)" },
        { keys: "⌘ F", label: "Find / replace (in text view)" },
        { keys: "⌘ ⇧ W", label: "Toggle text wrap" },
      ],
    },
    {
      group: "Workspace",
      items: [
        { keys: "⌘ T", label: "New doc" },
        { keys: "⌘ 1 / 2 / 3", label: "Focus column 1, 2, or 3" },
        { keys: "⌘ \\", label: "Toggle side panel" },
        { keys: "⌘ ⇧ C", label: "Toggle Compare pair (link / unlink)" },
        { keys: "⌘ ⇧ K", label: "Open Query panel (MongoDB-style filter)" },
      ],
    },
    {
      group: "Tree view",
      items: [
        { keys: "Click caret", label: "Expand or collapse a node" },
        { keys: "Click key", label: "Rename the key inline" },
        { keys: "Click value", label: "Edit the value inline" },
        { keys: "Right-click row", label: "Open the context menu" },
        { keys: "⌘ C / X / V", label: "Copy / cut / paste node" },
        { keys: "⌘ D", label: "Duplicate node" },
      ],
    },
    {
      group: "Repair button",
      items: [
        {
          keys: "Repair",
          label:
            "Auto-fix comments, smart quotes, trailing commas, unquoted keys, hex/oct/bin numbers, Python literals (True/False/None), unclosed brackets, missing commas, and more",
        },
      ],
    },
  ];

  const STACK = [
    "Svelte 5 (runes)",
    "Vite + TypeScript",
    "CodeMirror 6",
    "@tanstack/virtual-core",
    "jsonc-parser · Ajv",
    "idb-keyval · Comlink",
  ];
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="backdrop" onclick={onBackdrop} role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div class="head">
        <div class="brand">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <defs>
              <linearGradient
                id="hd-grad"
                x1="0"
                y1="0"
                x2="32"
                y2="32"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stop-color="#5b9eff" />
                <stop offset="1" stop-color="#2563eb" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="7" fill="url(#hd-grad)" />
            <g
              fill="none"
              stroke="#fff"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M11.5 7.5c-2.5 0-3.5 1.2-3.5 3.2v3.1c0 1.4-.7 2.2-2 2.2 1.3 0 2 .8 2 2.2v3.1c0 2 1 3.2 3.5 3.2"
              />
              <path
                d="M20.5 7.5c2.5 0 3.5 1.2 3.5 3.2v3.1c0 1.4.7 2.2 2 2.2-1.3 0-2 .8-2 2.2v3.1c0 2-1 3.2-3.5 3.2"
              />
            </g>
            <circle cx="16" cy="16" r="1.5" fill="#fff" />
          </svg>
          <h3 id="help-title">Help</h3>
        </div>
        <button class="x" onclick={close} aria-label="close">×</button>
      </div>

      <div class="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "docs"}
          class:on={tab === "docs"}
          onclick={() => (tab = "docs")}>Docs</button
        >
        <button
          role="tab"
          aria-selected={tab === "shortcuts"}
          class:on={tab === "shortcuts"}
          onclick={() => (tab = "shortcuts")}>Shortcuts</button
        >
        <button
          role="tab"
          aria-selected={tab === "about"}
          class:on={tab === "about"}
          onclick={() => (tab = "about")}>About</button
        >
        <button
          role="tab"
          aria-selected={tab === "feedback"}
          class:on={tab === "feedback"}
          onclick={() => (tab = "feedback")}>Feedback</button
        >
      </div>

      <div class="body">
        {#if tab === "docs"}
          <section>
            <h4>Getting started</h4>
            <p>
              Drop a JSON file, paste from clipboard, or click <strong
                >Sample</strong
              > on an empty column to play with a small example. Each tab is a separate
              document; everything is auto-saved to your browser.
            </p>
          </section>

          <section>
            <h4>Three views, switch any time</h4>
            <ul>
              <li>
                <strong>Text</strong> — full editor with syntax highlight, lint markers
                (errors mapped to source ranges), and find / replace.
              </li>
              <li>
                <strong>Tree</strong> — hierarchy with path-aware actions. Click
                a caret to expand, click a key to rename, click a value to edit.
                Right-click a row for cut, copy, paste, duplicate, insert before
                / after, sort keys, convert type, and remove.
              </li>
              <li>
                <strong>Table</strong> — for arrays of objects. Sort and filter by
                column, inline-edit cells, export the current view to CSV.
              </li>
            </ul>
          </section>

          <section>
            <h4>Multi-column workspace</h4>
            <p>
              Open up to three columns side by side. Each picks its own document
              and view, so you can edit JSON on the left while watching the tree
              on the right. Drag the gap between columns to resize.
            </p>
          </section>

          <section>
            <h4>Repair</h4>
            <p>
              The <strong>Repair</strong> button runs the document through a
              forgiving tokenizer and re-emits canonical JSON. It fixes the
              usual suspects: comments, smart quotes, single-quoted strings,
              unquoted keys, trailing commas, missing commas, hex / octal /
              binary numbers, Python literals (<code>True</code>,
              <code>False</code>, <code>None</code>), unclosed brackets, and
              stray top-level values. After running, a banner lists exactly what
              was rewritten.
            </p>
          </section>

          <section>
            <h4>Schema validation</h4>
            <p>
              Open the side panel and pick the <strong>Schema</strong> tab.
              Paste a JSON Schema and the active document is continuously
              validated against it (Ajv with formats). Errors show up with their
              <code>instancePath</code> so you can jump to the offending node.
            </p>
          </section>

          <section>
            <h4>Compare</h4>
            <p>
              Click the <strong>⇄ Compare</strong> button (or press
              <code>⌘ ⇧ C</code>) to set up a side-by-side diff. Pick a peer
              document, choose Text or Tree view, and the workspace switches to
              two linked columns with synced scroll. Differences are tinted:
              green for added, red for removed, amber for changed, blue for
              moved. Open the panel to see a stats summary, the change list, and
              ignore-rule toggles (ignore paths, treat <code>null</code> as
              missing, case-insensitive strings, trim whitespace, match arrays
              by an id field). Click <strong>⊗ Unlink</strong> to disconnect.
            </p>
          </section>

          <section>
            <h4>Themes &amp; layout</h4>
            <p>
              Switch between light, dark, and system in the toolbar. Toggle text
              wrap with <code>⌘ ⇧ W</code>. Drag the side-panel edge to resize
              (up to half the page).
            </p>
          </section>

          <section>
            <h4>Privacy</h4>
            <p>
              Everything happens locally in your browser. Documents persist to
              IndexedDB on your device. No data is sent anywhere unless you
              explicitly export it. Read the
              <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>
              and
              <a href="/terms.html" target="_blank" rel="noopener">Terms of Service</a>.
            </p>
          </section>
        {:else if tab === "shortcuts"}
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
        {:else if tab === "about"}
          <section>
            <h4>JSON OS</h4>
            <p>
              A browser-based JSON workbench. View, edit, validate, format,
              repair, and compare JSON locally — no servers, no uploads, no
              accounts.
            </p>
          </section>
          <section>
            <h4>Highlights</h4>
            <ul>
              <li>
                Tree, text, and table views per column (up to three columns)
              </li>
              <li>JSON Schema validation in a Web Worker (Ajv, lazy-loaded)</li>
              <li>
                Side-by-side compare with ignore rules, sync-scroll, and move
                detection
              </li>
              <li>Forgiving auto-repair with a diagnostics list</li>
              <li>
                CSV export of the current table view (with filters and sort
                applied)
              </li>
              <li>Light, dark, and system themes</li>
              <li>
                Local-first: parses run in a Web Worker, docs persist in
                IndexedDB
              </li>
            </ul>
          </section>
          <section>
            <h4>Built with</h4>
            <ul class="stack">
              {#each STACK as s}<li>{s}</li>{/each}
            </ul>
          </section>
          <section>
            <h4>Share JSON OS</h4>
            <p class="muted small">If JSON OS saved you time, sharing the link helps others find it.</p>
            <div class="share-row">
              {#each SHARE_TARGETS as s}
                <a
                  class="share-btn"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Share on ${s.label}`}
                  title={`Share on ${s.label}`}
                >
                  <span class="ic" aria-hidden="true">{s.icon}</span>
                  <span class="lb">{s.label}</span>
                </a>
              {/each}
              <button class="share-btn" onclick={copyShareLink} title="Copy link">
                <span class="ic" aria-hidden="true">⧉</span>
                <span class="lb">{copyState === 'ok' ? 'Copied!' : copyState === 'err' ? 'Copy failed' : 'Copy link'}</span>
              </button>
              <button class="share-btn" onclick={nativeShare} title="Native share sheet">
                <span class="ic" aria-hidden="true">↗</span>
                <span class="lb">Share…</span>
              </button>
            </div>
          </section>
        {:else}
          <section>
            <h4>Feedback</h4>
            <p>
              JSON OS is a work in progress, and your input helps shape its
              future. If you spot a bug or have ideas or questions, reach out
              anytime at <a href="mailto:{FEEDBACK_EMAIL}">{FEEDBACK_EMAIL}</a>.
            </p>
            <p>Thank you!</p>
          </section>
          <section>
            <button class="primary" onclick={openMail}>✉ Send feedback</button>
            <p class="muted small">
              Opens your default mail client. We&rsquo;ll tack on the browser
              user-agent so we can reproduce issues.
            </p>
          </section>
        {/if}
      </div>

      <div class="foot">
        <button onclick={close}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--bg) 30%, transparent);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .dialog {
    width: min(640px, 94vw);
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand h3 {
    margin: 0;
    font-size: 14px;
  }
  .x {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 18px;
    padding: 0 4px;
  }
  .x:hover {
    color: var(--fg);
  }

  .tabs {
    display: flex;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
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
  }
  .tabs button:hover {
    color: var(--fg);
  }
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
  section {
    margin-bottom: 18px;
  }
  section:last-child {
    margin-bottom: 0;
  }
  section h4 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  section p {
    margin: 0 0 10px;
  }
  section p:last-child {
    margin-bottom: 0;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  li {
    padding: 1px 0;
  }
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
  a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dotted currentColor;
  }
  a:hover {
    border-bottom-style: solid;
  }

  table.kbd {
    width: 100%;
    border-collapse: collapse;
  }
  table.kbd td {
    padding: 4px 8px;
    vertical-align: top;
  }
  table.kbd td.k {
    width: 200px;
    white-space: nowrap;
  }
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
  .lbl {
    color: var(--fg);
  }

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
  .primary:hover {
    filter: brightness(1.1);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 11px;
    margin-top: 6px !important;
  }

  .share-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: var(--radius);
    padding: 5px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    text-decoration: none;
    transition: border-color 80ms, background 80ms;
  }
  .share-btn:hover {
    border-color: var(--accent);
    background: var(--row-hover-strong);
  }
  .share-btn .ic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .foot {
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    justify-content: flex-end;
  }
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
  .foot button:hover {
    background: var(--row-hover-strong);
  }
</style>
