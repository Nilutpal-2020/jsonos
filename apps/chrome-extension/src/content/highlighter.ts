import { anonymizeText, AnonymizeOptions, TextMatch } from '@jsonos/redact-core';

const MARK_CLASS = 'jsonos-redact-highlight';
const STYLE_ID = 'jsonos-redact-styles';

// Inject custom scoped CSS for in-page highlight badges
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    mark.${MARK_CLASS} {
      background: rgba(59, 130, 246, 0.2) !important;
      color: #60a5fa !important;
      border: 1px dashed #3b82f6 !important;
      border-radius: 4px !important;
      padding: 1px 5px !important;
      margin: 0 1px !important;
      font-family: inherit !important;
      font-size: 0.95em !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      display: inline-block !important;
      line-height: 1.2 !important;
      transition: all 0.15s ease-in-out !important;
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.2) !important;
      user-select: text !important;
    }

    mark.${MARK_CLASS}:hover {
      background: rgba(59, 130, 246, 0.35) !important;
      color: #ffffff !important;
      border-color: #60a5fa !important;
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.4) !important;
      transform: translateY(-1px) !important;
    }

    mark.${MARK_CLASS}[data-unmasked="true"] {
      background: rgba(239, 68, 68, 0.2) !important;
      color: #fca5a5 !important;
      border-color: #ef4444 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);
}

// Clear all highlights and restore original text nodes
export function clearHighlights(): number {
  const marks = document.querySelectorAll(`mark.${MARK_CLASS}`);
  let count = 0;
  marks.forEach((mark) => {
    const originalText = mark.getAttribute('data-original');
    if (originalText !== null) {
      const textNode = document.createTextNode(originalText);
      mark.replaceWith(textNode);
      count++;
    }
  });

  const styleEl = document.getElementById(STYLE_ID);
  if (styleEl) styleEl.remove();

  return count;
}

// Scan DOM text nodes on active tab and wrap PII matches with highlight elements
export function highlightPage(options: AnonymizeOptions): { count: number; matches: TextMatch[] } {
  clearHighlights();
  injectStyles();

  const allMatches: TextMatch[] = [];
  let totalCount = 0;

  // Elements to skip during DOM traversal
  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEXTAREA',
    'INPUT',
    'SELECT',
    'OPTION',
    'SVG',
    'IFRAME',
    'CANVAS',
  ]);

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`mark.${MARK_CLASS}`)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || node.nodeValue.trim().length === 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodesToProcess: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    nodesToProcess.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  nodesToProcess.forEach((textNode) => {
    const text = textNode.nodeValue;
    if (!text) return;

    const { count, matches } = anonymizeText(text, options);
    if (count === 0 || matches.length === 0) return;

    totalCount += count;
    allMatches.push(...matches);

    // Build replacement fragment with text chunks & highlight marks
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    // Sort matches by start position
    const sortedMatches = [...matches].sort((a, b) => a.start - b.start);

    for (const match of sortedMatches) {
      if (match.start < lastIndex) continue; // Skip overlapping spans

      // Text chunk before match
      if (match.start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.start)));
      }

      // Perform replacement for this span
      const { result: redactedSpan } = anonymizeText(match.original, options);

      const mark = document.createElement('mark');
      mark.className = MARK_CLASS;
      mark.setAttribute('data-original', match.original);
      mark.setAttribute('data-redacted', redactedSpan);
      mark.setAttribute('data-pii-type', match.type);
      mark.setAttribute('title', `Original: "${match.original}" (Click to toggle)`);
      mark.textContent = redactedSpan;

      // Click to toggle between redacted and original text
      mark.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isUnmasked = mark.getAttribute('data-unmasked') === 'true';
        if (isUnmasked) {
          mark.textContent = mark.getAttribute('data-redacted') || redactedSpan;
          mark.removeAttribute('data-unmasked');
        } else {
          mark.textContent = mark.getAttribute('data-original') || match.original;
          mark.setAttribute('data-unmasked', 'true');
        }
      });

      fragment.appendChild(mark);
      lastIndex = match.end;
    }

    // Remaining text chunk after last match
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    textNode.replaceWith(fragment);
  });

  return { count: totalCount, matches: allMatches };
}
