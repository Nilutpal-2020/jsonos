<script lang="ts">
  import { onDestroy } from 'svelte';
  import { renderMarkdown, enhance } from './md-renderer';
  import { theme } from '../core/theme.svelte';
  import type { MdDoc } from './md-store.svelte';

  type Props = { doc: MdDoc };
  let { doc }: Props = $props();

  let host: HTMLDivElement;
  let lastSrc = '';
  let lastTheme = '';
  let pending: number | null = null;

  $effect(() => {
    const src = doc.text;
    const themeNow = theme.effective;
    if (src === lastSrc && themeNow === lastTheme) return;
    lastSrc = src;
    lastTheme = themeNow;
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = null;
      if (!host) return;
      const html = renderMarkdown(src);
      host.innerHTML = html;
      enhance(host, { theme: themeNow === 'light' ? 'light' : 'dark' }).catch(() => {});
    });
  });

  onDestroy(() => {
    if (pending) cancelAnimationFrame(pending);
  });

  export function getHtml(): string { return host?.innerHTML ?? ''; }
</script>

<div class="md-preview" bind:this={host}></div>

<style>
  .md-preview {
    height: 100%;
    overflow: auto;
    padding: 28px 36px;
    background: var(--surface);
    color: var(--fg);
    font: 14px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    word-wrap: break-word;
  }
  @media (max-width: 768px) {
    .md-preview { padding: 16px 18px; font-size: 13px; }
  }

  :global(.md-preview > *:first-child) { margin-top: 0; }
  :global(.md-preview h1, .md-preview h2, .md-preview h3, .md-preview h4, .md-preview h5, .md-preview h6) {
    color: var(--fg);
    margin: 1.6em 0 0.6em;
    line-height: 1.3;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  :global(.md-preview h1) { font-size: 1.85em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
  :global(.md-preview h2) { font-size: 1.45em; border-bottom: 1px solid var(--border); padding-bottom: 0.25em; }
  :global(.md-preview h3) { font-size: 1.2em; }
  :global(.md-preview h4) { font-size: 1.05em; }
  :global(.md-preview p)  { margin: 0 0 1em; }
  :global(.md-preview a)  { color: var(--accent); text-decoration: none; }
  :global(.md-preview a:hover) { text-decoration: underline; }

  :global(.md-preview code) {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font: 0.92em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--str);
  }
  :global(.md-preview pre) {
    position: relative;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px 16px;
    margin: 0 0 1em;
    overflow: auto;
    font: 12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  :global(.md-preview pre > code) {
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    display: block;
  }

  :global(.md-preview .md-copy) {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 3px;
    padding: 2px 8px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms, color 120ms, background 120ms;
  }
  :global(.md-preview pre:hover .md-copy) { opacity: 1; }
  :global(.md-preview .md-copy:hover) { color: var(--fg); background: var(--row-hover-strong); }

  :global(.md-preview blockquote) {
    border-left: 3px solid var(--border);
    color: var(--muted);
    padding: 0.1em 1em;
    margin: 0 0 1em;
  }
  :global(.md-preview ul, .md-preview ol) {
    margin: 0 0 1em;
    padding-left: 1.6em;
  }
  :global(.md-preview li) { margin: 0.25em 0; }
  :global(.md-preview li > input[type="checkbox"]) {
    margin-right: 6px;
    transform: translateY(1px);
  }
  :global(.md-preview hr) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 2em 0;
  }
  :global(.md-preview img) {
    max-width: 100%;
    border-radius: var(--radius);
  }

  :global(.md-preview table) {
    border-collapse: collapse;
    margin: 0 0 1em;
    font-size: 0.95em;
    overflow: auto;
    display: block;
    max-width: 100%;
  }
  :global(.md-preview thead) { background: var(--surface-2); }
  :global(.md-preview th, .md-preview td) {
    border: 1px solid var(--border);
    padding: 6px 12px;
    text-align: left;
  }

  :global(.md-preview .md-embed) {
    width: 100%;
    margin: 0 0 1em;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  :global(.md-preview .md-embed iframe) {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  :global(.md-preview .md-embed-tweet) {
    border-left: 3px solid var(--accent);
    padding: 12px 16px;
    color: var(--muted);
  }

  :global(.md-preview .md-mermaid) {
    display: flex;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
    margin: 0 0 1em;
    overflow: auto;
  }
  :global(.md-preview .md-mermaid svg) { max-width: 100%; height: auto; }
  :global(.md-preview .md-mermaid-error) {
    color: var(--err);
    background: var(--err-bg);
    padding: 8px 12px;
    border-radius: var(--radius);
    white-space: pre-wrap;
  }

  :global(.md-preview .md-math-block) {
    margin: 0 0 1em;
    overflow-x: auto;
  }
  :global(.md-preview .md-math-error) {
    color: var(--err);
  }

  /* highlight.js — themed via our CSS vars */
  :global(.md-preview .hljs)             { color: var(--fg); }
  :global(.md-preview .hljs-comment),
  :global(.md-preview .hljs-quote)       { color: var(--muted); font-style: italic; }
  :global(.md-preview .hljs-keyword),
  :global(.md-preview .hljs-selector-tag),
  :global(.md-preview .hljs-literal),
  :global(.md-preview .hljs-built_in)    { color: var(--bool); }
  :global(.md-preview .hljs-string),
  :global(.md-preview .hljs-attr),
  :global(.md-preview .hljs-template-tag),
  :global(.md-preview .hljs-template-variable),
  :global(.md-preview .hljs-meta-string) { color: var(--str); }
  :global(.md-preview .hljs-number),
  :global(.md-preview .hljs-symbol),
  :global(.md-preview .hljs-bullet),
  :global(.md-preview .hljs-link)        { color: var(--num); }
  :global(.md-preview .hljs-title),
  :global(.md-preview .hljs-section),
  :global(.md-preview .hljs-name),
  :global(.md-preview .hljs-selector-id) { color: var(--key); font-weight: 600; }
  :global(.md-preview .hljs-attribute),
  :global(.md-preview .hljs-variable),
  :global(.md-preview .hljs-tag)         { color: var(--key); }
  :global(.md-preview .hljs-regexp)      { color: var(--warn); }
  :global(.md-preview .hljs-deletion)    { color: var(--err); }
  :global(.md-preview .hljs-addition)    { color: var(--ok); }
  :global(.md-preview .hljs-emphasis)    { font-style: italic; }
  :global(.md-preview .hljs-strong)      { font-weight: 700; }
</style>
