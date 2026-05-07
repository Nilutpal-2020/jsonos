/**
 * Markdown render pipeline.
 *
 *   markdown → marked (GFM) → sanitize (DOMPurify) → post-process
 *     - syntax highlight (highlight.js, lazy + auto-detect language)
 *     - math via KaTeX ($...$ inline, $$...$$ block) — extracted before parse
 *       so it can't collide with markdown syntax
 *     - mermaid code blocks → inline SVG
 *     - link-only paragraphs to known providers (YouTube, Vimeo, CodePen,
 *       GitHub Gist, CodeSandbox, Twitter/X, JSFiddle) → embed iframe
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

let hljsModulePromise: Promise<typeof import('highlight.js').default> | null = null;
async function getHljs() {
  if (!hljsModulePromise) {
    hljsModulePromise = import('highlight.js').then((m) => m.default);
  }
  return hljsModulePromise;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
async function getMermaid(theme: 'dark' | 'default') {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mm = m.default;
      mm.initialize({ startOnLoad: false, theme, securityLevel: 'strict', fontFamily: 'inherit' });
      return mm;
    });
  } else {
    mermaidPromise.then((mm) => mm.initialize({ startOnLoad: false, theme, securityLevel: 'strict', fontFamily: 'inherit' }));
  }
  return mermaidPromise;
}

// ─── Math extraction ──────────────────────────────────────────────────────
type MathSlot = { display: boolean; src: string };

const MATH_TOKEN = (i: number) => `@@JX_MATH_${i}@@`;
const MATH_RE = /(\$\$[\s\S]+?\$\$|(?<![\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d))/g;

function extractMath(src: string): { src: string; slots: MathSlot[] } {
  const slots: MathSlot[] = [];
  const out = src.replace(MATH_RE, (m) => {
    const display = m.startsWith('$$');
    const inner = display ? m.slice(2, -2) : m.slice(1, -1);
    const i = slots.push({ display, src: inner.trim() }) - 1;
    return MATH_TOKEN(i);
  });
  return { src: out, slots };
}

function renderMath(slots: MathSlot[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    try {
      const html = katex.renderToString(s.src, { displayMode: s.display, throwOnError: false, output: 'html' });
      const wrapped = s.display ? `<div class="md-math md-math-block">${html}</div>` : `<span class="md-math md-math-inline">${html}</span>`;
      map.set(MATH_TOKEN(i), wrapped);
    } catch {
      map.set(MATH_TOKEN(i), `<code class="md-math-error">${escapeHtml(s.display ? '$$' + s.src + '$$' : '$' + s.src + '$')}</code>`);
    }
  }
  return map;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function escapeAttr(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// ─── Embed providers ──────────────────────────────────────────────────────

interface EmbedRule {
  match: RegExp;
  build: (m: RegExpMatchArray) => string;
}

const EMBEDS: EmbedRule[] = [
  {
    match: /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{6,})(?:&\S*)?$/i,
    build: (m) => iframe(`https://www.youtube-nocookie.com/embed/${m[1]}`, '16/9', 'YouTube video'),
  },
  {
    match: /^https?:\/\/(?:www\.)?youtu\.be\/([\w-]{6,})(?:\?\S*)?$/i,
    build: (m) => iframe(`https://www.youtube-nocookie.com/embed/${m[1]}`, '16/9', 'YouTube video'),
  },
  {
    match: /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/[\w]+)?\/?$/i,
    build: (m) => iframe(`https://player.vimeo.com/video/${m[1]}`, '16/9', 'Vimeo video'),
  },
  {
    match: /^https?:\/\/codepen\.io\/([\w-]+)\/pen\/([\w-]+)\/?$/i,
    build: (m) => iframe(`https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, '4/3', 'CodePen embed'),
  },
  {
    match: /^https?:\/\/codesandbox\.io\/s\/([\w-]+)\/?$/i,
    build: (m) => iframe(`https://codesandbox.io/embed/${m[1]}?view=preview`, '4/3', 'CodeSandbox embed'),
  },
  {
    match: /^https?:\/\/jsfiddle\.net\/([\w/-]+)\/?$/i,
    build: (m) => iframe(`https://jsfiddle.net/${m[1]}/embedded/result/`, '4/3', 'JSFiddle embed'),
  },
  {
    match: /^https?:\/\/gist\.github\.com\/([\w-]+\/[a-f0-9]+)\/?$/i,
    build: (m) => `<div class="md-embed md-embed-gist"><script src="https://gist.github.com/${m[1]}.js"></script><noscript><a href="https://gist.github.com/${m[1]}">View gist</a></noscript></div>`,
  },
  {
    match: /^https?:\/\/(?:twitter|x)\.com\/([\w]+)\/status\/(\d+)\/?$/i,
    build: (m) => `<blockquote class="md-embed md-embed-tweet"><a href="https://twitter.com/${m[1]}/status/${m[2]}" target="_blank" rel="noopener">Tweet by @${m[1]}</a></blockquote>`,
  },
];

function iframe(src: string, ratio: string, title: string): string {
  return `<div class="md-embed" style="aspect-ratio:${ratio}"><iframe src="${src}" title="${escapeAttr(title)}" loading="lazy" allow="fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

function tryEmbed(url: string): string | null {
  const trimmed = url.trim();
  for (const rule of EMBEDS) {
    const m = trimmed.match(rule.match);
    if (m) return rule.build(m);
  }
  return null;
}

// ─── marked configuration ─────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: false });

marked.use({
  renderer: {
    link(token: any) {
      const href = token.href as string;
      const title = token.title as string | null;
      const tokens = token.tokens as any[] | undefined;
      const inner = tokens && this.parser ? this.parser.parseInline(tokens) : (token.text ?? '');
      const isExt = typeof href === 'string' && /^(https?:)?\/\//i.test(href);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      const targetAttrs = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeAttr(href)}"${titleAttr}${targetAttrs}>${inner}</a>`;
    },
    paragraph(token: any) {
      const ts: any[] = token.tokens ?? [];
      // Single autolink (e.g. <https://x>) — marked emits a `link` token.
      if (ts.length === 1 && ts[0].type === 'link') {
        const href = ts[0].href as string | undefined;
        if (href) {
          const embed = tryEmbed(href);
          if (embed) return embed + '\n';
        }
      }
      // Bare URL with surrounding whitespace only — text token.
      if (ts.length === 1 && ts[0].type === 'text') {
        const txt = String(ts[0].text ?? '').trim();
        if (/^https?:\/\/\S+$/.test(txt)) {
          const embed = tryEmbed(txt);
          if (embed) return embed + '\n';
        }
      }
      return false; // fall through to default
    },
  },
});

// ─── DOMPurify config ─────────────────────────────────────────────────────

const PURIFY_OPTS = {
  ADD_TAGS: ['iframe', 'foreignObject', 'script'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'sandbox', 'loading', 'referrerpolicy', 'target', 'rel'],
  USE_PROFILES: { html: true, mathMl: true, svg: true },
};

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'script') {
    const el = node as Element;
    const src = el.getAttribute && el.getAttribute('src');
    if (!src || !/^https:\/\/gist\.github\.com\/[\w-]+\/[a-f0-9]+\.js$/.test(src)) {
      el.parentNode?.removeChild(el);
    }
  }
});

const IFRAME_HOST = /^(https?:)?\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|codepen\.io|codesandbox\.io|jsfiddle\.net)\b/i;
DOMPurify.addHook('uponSanitizeAttribute', (node, hookEvent) => {
  if ((node as Element).tagName === 'IFRAME' && hookEvent.attrName === 'src') {
    if (!IFRAME_HOST.test(hookEvent.attrValue)) hookEvent.keepAttr = false;
  }
});

// ─── Public API ───────────────────────────────────────────────────────────

export interface RenderOptions { theme: 'dark' | 'light' }

export function renderMarkdown(src: string): string {
  const { src: srcNoMath, slots } = extractMath(src);
  const rawHtml = marked.parse(srcNoMath, { async: false }) as string;
  const safe = DOMPurify.sanitize(rawHtml, PURIFY_OPTS) as unknown as string;
  if (slots.length === 0) return safe;
  const map = renderMath(slots);
  return safe.replace(/@@JX_MATH_\d+@@/g, (tok) => map.get(tok) ?? tok);
}

/** Run async DOM enhancements: highlight, mermaid, copy buttons. */
export async function enhance(root: HTMLElement, opts: RenderOptions): Promise<void> {
  const mermaidBlocks = root.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid');
  if (mermaidBlocks.length > 0) {
    const mm = await getMermaid(opts.theme === 'dark' ? 'dark' : 'default');
    let i = 0;
    for (const code of Array.from(mermaidBlocks)) {
      const pre = code.parentElement;
      if (!pre) continue;
      const src = code.textContent ?? '';
      const id = `md-mermaid-${Date.now()}-${i++}`;
      const host = document.createElement('div');
      host.className = 'md-mermaid';
      try {
        const { svg } = await mm.render(id, src);
        host.innerHTML = svg;
        pre.replaceWith(host);
      } catch (e) {
        host.innerHTML = `<pre class="md-mermaid-error">${escapeHtml(String((e as Error).message ?? e))}\n\n${escapeHtml(src)}</pre>`;
        pre.replaceWith(host);
      }
    }
  }

  const codes = root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]');
  if (codes.length > 0) {
    const hljs = await getHljs();
    for (const code of Array.from(codes)) {
      const cls = (code.className.match(/language-([\w-]+)/) || [])[1];
      if (!cls || cls === 'mermaid') continue;
      try {
        if (hljs.getLanguage(cls)) {
          const result = hljs.highlight(code.textContent ?? '', { language: cls, ignoreIllegals: true });
          code.innerHTML = result.value;
          code.classList.add('hljs');
        } else {
          const result = hljs.highlightAuto(code.textContent ?? '');
          code.innerHTML = result.value;
          code.classList.add('hljs');
        }
      } catch { /* leave plain */ }
    }
  }

  const pres = root.querySelectorAll<HTMLPreElement>('pre');
  for (const pre of Array.from(pres)) {
    if (pre.querySelector(':scope > .md-copy')) continue;
    if (!pre.querySelector(':scope > code')) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-copy';
    btn.textContent = 'Copy';
    btn.title = 'Copy code';
    btn.addEventListener('click', async () => {
      const text = pre.querySelector('code')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      } catch { /* ignore */ }
    });
    pre.appendChild(btn);
  }
}
