/**
 * Forgiving JSON repair engine.
 *
 * Strategy:
 * 1. Pre-pass (preClean): unescape HTML entities, strip surrounding log text/timestamps,
 *    unwrap stringified outer-quoted JSON, and normalize escaped quotes (\").
 * 2. Permissive Tokenizer: handles comments, JS/Python/YAML literals, smart quotes,
 *    hex/oct/bin numbers, unquoted keys (with hyphens/dots), and unescaped inner quotes.
 * 3. Canonical Emitter: re-emits valid JSON, auto-correcting missing colons, '=' as ':',
 *    missing commas, trailing commas, unclosed brackets, and multiple top-level objects.
 */

type TokKind = 'ws' | 'lcomment' | 'bcomment' | 'string' | 'number' | 'ident' | 'punct' | 'eof' | 'unknown';

interface Tok {
  kind: TokKind;
  raw: string;
  value?: string;
  quote?: string;
  pos: number;
}

const SMART_OPEN_DOUBLE  = '“';
const SMART_CLOSE_DOUBLE = '”';
const SMART_OPEN_SINGLE  = '‘';
const SMART_CLOSE_SINGLE = '’';

function isWs(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}
function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isIdentStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_' || c === '$' || c === '@';
}
function isIdent(c: string): boolean {
  return isIdentStart(c) || isDigit(c) || c === '-' || c === '.';
}

/** Check if text parses directly with standard JSON.parse. */
function canParse(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/** Pre-clean common raw text quirks (HTML entities, log prefixes, stringified JSON quotes). */
function preClean(src: string): { src: string; notes: Set<string> } {
  const notes = new Set<string>();
  let s = src;

  // 1. Unescape HTML entities
  if (/&(quot|apos|lt|gt|amp|#34|#39);/i.test(s)) {
    s = s
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
    notes.add('Unescaped HTML entities (&quot;, &amp;, etc.)');
  }

  // 2. Extract embedded JSON from surrounding log text if present
  // e.g. "2026-07-22 10:00:00 [INFO] {"event": "login"}" -> {"event": "login"}
  const firstBrace = s.search(/[\{\[]/);
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (firstBrace > 0 && lastBrace > firstBrace) {
    const candidate = s.slice(firstBrace, lastBrace + 1);
    if (canParse(candidate)) {
      s = candidate;
      notes.add('Extracted JSON structure from surrounding log text');
    } else if (candidate.includes('\\"')) {
      const unescaped = candidate.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      if (canParse(unescaped)) {
        s = unescaped;
        notes.add('Extracted JSON structure from log output & unescaped quotes');
      }
    }
  }

  // 3. Stringified JSON outer-quote unwrapping: e.g. "{\"name\": \"Alice\", \"age\": 30}"
  let trimmed = s.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1);
    const unescaped = inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const innerTrimmed = unescaped.trim();
    if ((innerTrimmed.startsWith('{') && innerTrimmed.endsWith('}')) || (innerTrimmed.startsWith('[') && innerTrimmed.endsWith(']'))) {
      s = innerTrimmed;
      notes.add('Unwrapped outer string quotes & unescaped embedded JSON');
    }
  }

  // 4. Raw escaped quotes throughout string (e.g. {\"key\": \"value\"})
  if (s.includes('\\"') && !canParse(s)) {
    const unescaped = s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    s = unescaped;
    notes.add('Unescaped quotes (\\")');
  }

  return { src: s, notes };
}

// ──────────────────────────────────────────────────────────────────────────
//  Tokenizer
// ──────────────────────────────────────────────────────────────────────────

function isClosingQuote(src: string, pos: number, opener: string): boolean {
  if (src[pos] !== opener) return false;
  let p = pos + 1;
  const n = src.length;
  while (p < n && isWs(src[p])) p++;
  if (p >= n) return true; // EOF
  const nextChar = src[p];
  return '}:],'.includes(nextChar);
}

function tokenize(src: string): { tokens: Tok[]; notes: Set<string> } {
  const { src: cleanSrc, notes } = preClean(src);
  const tokens: Tok[] = [];
  let i = 0;
  const n = cleanSrc.length;

  // BOM
  if (n > 0 && cleanSrc.charCodeAt(0) === 0xFEFF) {
    notes.add('Stripped leading BOM');
    i = 1;
  }

  while (i < n) {
    const c = cleanSrc[i];

    // whitespace
    if (isWs(c)) {
      const start = i;
      while (i < n && isWs(cleanSrc[i])) i++;
      tokens.push({ kind: 'ws', raw: cleanSrc.slice(start, i), pos: start });
      continue;
    }

    // line comment // ...
    if (c === '/' && cleanSrc[i + 1] === '/') {
      const start = i;
      i += 2;
      while (i < n && cleanSrc[i] !== '\n') i++;
      tokens.push({ kind: 'lcomment', raw: cleanSrc.slice(start, i), pos: start });
      notes.add('Removed comments');
      continue;
    }

    // block comment /* ... */
    if (c === '/' && cleanSrc[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(cleanSrc[i] === '*' && cleanSrc[i + 1] === '/')) i++;
      if (i < n) i += 2;
      tokens.push({ kind: 'bcomment', raw: cleanSrc.slice(start, i), pos: start });
      notes.add('Removed comments');
      continue;
    }

    // hash line comment (# ...)
    if (c === '#') {
      const start = i;
      while (i < n && cleanSrc[i] !== '\n') i++;
      tokens.push({ kind: 'lcomment', raw: cleanSrc.slice(start, i), pos: start });
      notes.add('Removed comments');
      continue;
    }

    // strings: double, single, backtick, smart variants
    if (c === '"' || c === "'" || c === '`'
      || c === SMART_OPEN_DOUBLE || c === SMART_CLOSE_DOUBLE
      || c === SMART_OPEN_SINGLE || c === SMART_CLOSE_SINGLE) {
      const start = i;
      const opener = c;
      const closers: string[] =
        opener === SMART_OPEN_DOUBLE ? [SMART_CLOSE_DOUBLE, '"'] :
        opener === SMART_OPEN_SINGLE ? [SMART_CLOSE_SINGLE, "'"] :
        opener === SMART_CLOSE_DOUBLE ? [SMART_CLOSE_DOUBLE, '"'] :
        opener === SMART_CLOSE_SINGLE ? [SMART_CLOSE_SINGLE, "'"] :
        [opener];
      i++;
      let value = '';
      while (i < n) {
        const char = cleanSrc[i];
        if (closers.includes(char)) {
          // Check if this quote is the true structural closing quote or an unescaped inner quote
          if (isClosingQuote(cleanSrc, i, char)) {
            break;
          } else {
            // Unescaped inner quote! Treat as string content.
            value += char;
            notes.add('Auto-escaped unescaped inner double quotes');
            i++;
            continue;
          }
        }

        if (char === '\\' && i + 1 < n) {
          const esc = cleanSrc[i + 1];
          if (esc === '"') value += '"';
          else if (esc === '\\') value += '\\';
          else if (esc === '/')  value += '/';
          else if (esc === 'b')  value += '\b';
          else if (esc === 'f')  value += '\f';
          else if (esc === 'n')  value += '\n';
          else if (esc === 'r')  value += '\r';
          else if (esc === 't')  value += '\t';
          else if (esc === 'u' && /[0-9a-fA-F]{4}/.test(cleanSrc.slice(i + 2, i + 6))) {
            value += String.fromCharCode(parseInt(cleanSrc.slice(i + 2, i + 6), 16));
            i += 4;
          } else if (esc === "'") value += "'";
          else if (esc === '\n' || esc === '\r') {
            // JS line continuation
          } else {
            value += esc;
          }
          i += 2;
        } else if (char === '\n') {
          value += '\n';
          i++;
        } else {
          value += char;
          i++;
        }
      }
      if (i < n) i++; // skip closing quote
      tokens.push({ kind: 'string', raw: cleanSrc.slice(start, i), value, quote: opener, pos: start });
      if (opener !== '"') notes.add('Converted non-double-quoted strings to JSON strings');
      continue;
    }

    // numbers (decimal, hex, oct, bin, with optional sign)
    if (c === '+' || c === '-' || isDigit(c) || (c === '.' && isDigit(cleanSrc[i + 1]))) {
      const start = i;
      if (c === '+' || c === '-') i++;
      if (cleanSrc[i] === '0' && (cleanSrc[i + 1] === 'x' || cleanSrc[i + 1] === 'X' ||
                                 cleanSrc[i + 1] === 'o' || cleanSrc[i + 1] === 'O' ||
                                 cleanSrc[i + 1] === 'b' || cleanSrc[i + 1] === 'B')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(cleanSrc[i])) i++;
      } else {
        while (i < n && (isDigit(cleanSrc[i]) || cleanSrc[i] === '_')) i++;
        if (cleanSrc[i] === '.') { i++; while (i < n && (isDigit(cleanSrc[i]) || cleanSrc[i] === '_')) i++; }
        if (cleanSrc[i] === 'e' || cleanSrc[i] === 'E') {
          i++;
          if (cleanSrc[i] === '+' || cleanSrc[i] === '-') i++;
          while (i < n && isDigit(cleanSrc[i])) i++;
        }
      }
      if (cleanSrc[i] === 'n') i++;
      tokens.push({ kind: 'number', raw: cleanSrc.slice(start, i), pos: start });
      continue;
    }

    // identifier (true/false/null/undefined/NaN/Infinity, plus unquoted keys with dashes/dots)
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdent(cleanSrc[i])) i++;
      tokens.push({ kind: 'ident', raw: cleanSrc.slice(start, i), pos: start });
      continue;
    }

    // punctuation
    if ('{}[]:,'.includes(c)) {
      tokens.push({ kind: 'punct', raw: c, pos: i });
      i++;
      continue;
    }

    // unknown
    tokens.push({ kind: 'unknown', raw: c, pos: i });
    i++;
  }

  tokens.push({ kind: 'eof', raw: '', pos: n });
  return { tokens, notes };
}

// ──────────────────────────────────────────────────────────────────────────
//  Emitter (token stream → canonical JSON)
// ──────────────────────────────────────────────────────────────────────────

const IDENT_MAP: Record<string, string> = {
  true: 'true',  false: 'false', null: 'null',
  True: 'true',  False: 'false', None: 'null',
  TRUE: 'true',  FALSE: 'false', NULL: 'null',
  yes:  'true',  no:    'false',
  nil:  'null',  Nil:   'null',  NIL:  'null',
  undefined: 'null',
  NaN: 'null', nan: 'null',
  Infinity: 'null', '-Infinity': 'null',
};

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function normalizeNumber(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('n')) s = s.slice(0, -1);
  s = s.replace(/_/g, '');

  const sign = s.startsWith('-') ? '-' : '';
  const body = sign ? s.slice(1) : s;
  if (/^0x[0-9a-fA-F]+$/.test(body)) return sign + parseInt(body, 16);
  if (/^0o[0-7]+$/.test(body))       return sign + parseInt(body.slice(2), 8);
  if (/^0b[01]+$/.test(body))        return sign + parseInt(body.slice(2), 2);

  const m = body.match(/^0+(\d+)(\..*)?$/);
  if (m) return sign + m[1] + (m[2] ?? '');

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return JSON.stringify(n);
}

interface EmitCtx {
  out: string[];
  notes: Set<string>;
  stack: ('object' | 'array')[];
  topValues: number;
}

function nextSig(toks: Tok[], i: number): { tok: Tok; idx: number } {
  while (i < toks.length && (toks[i].kind === 'ws' || toks[i].kind === 'lcomment' || toks[i].kind === 'bcomment')) i++;
  return { tok: toks[i], idx: i };
}

function isValueStart(t: Tok): boolean {
  if (t.kind === 'string' || t.kind === 'number') return true;
  if (t.kind === 'punct' && (t.raw === '{' || t.raw === '[')) return true;
  if (t.kind === 'ident') return true;
  return false;
}

function emitValue(toks: Tok[], i: number, ctx: EmitCtx): number {
  const { tok, idx } = nextSig(toks, i);
  i = idx;
  if (!isValueStart(tok)) {
    ctx.out.push('null');
    ctx.notes.add('Filled in missing value with null');
    return i;
  }

  if (tok.kind === 'string') {
    ctx.out.push(jsonString(tok.value!));
    return i + 1;
  }

  if (tok.kind === 'number') {
    const n = normalizeNumber(tok.raw);
    if (n === null) {
      ctx.out.push('null');
      ctx.notes.add(`Replaced invalid number "${tok.raw}" with null`);
    } else {
      if (n !== tok.raw) ctx.notes.add('Normalized non-decimal / underscore numbers');
      ctx.out.push(n);
    }
    return i + 1;
  }

  if (tok.kind === 'ident') {
    const k = tok.raw;
    const mapped = IDENT_MAP[k];
    if (mapped !== undefined) {
      if (mapped !== k) ctx.notes.add(`Normalized identifier "${k}" → ${mapped}`);
      ctx.out.push(mapped);
      return i + 1;
    }
    ctx.out.push(jsonString(k));
    ctx.notes.add(`Quoted bare identifier "${k}" as string`);
    return i + 1;
  }

  if (tok.kind === 'punct' && tok.raw === '{') {
    return emitObject(toks, i, ctx);
  }
  if (tok.kind === 'punct' && tok.raw === '[') {
    return emitArray(toks, i, ctx);
  }

  ctx.out.push('null');
  return i + 1;
}

function emitObject(toks: Tok[], i: number, ctx: EmitCtx): number {
  ctx.out.push('{');
  ctx.stack.push('object');
  i++;
  let first = true;
  let trailingComma = false;
  while (true) {
    const { tok, idx } = nextSig(toks, i);
    i = idx;
    if (tok.kind === 'eof') break;
    if (tok.kind === 'punct' && tok.raw === '}') {
      i++;
      ctx.stack.pop();
      ctx.out.push('}');
      if (trailingComma) ctx.notes.add('Removed trailing comma');
      return i;
    }
    if (!first) {
      if (tok.kind === 'punct' && tok.raw === ',') {
        ctx.out.push(',');
        i++;
        const { tok: after, idx: aidx } = nextSig(toks, i);
        i = aidx;
        if (after.kind === 'punct' && after.raw === '}') {
          ctx.out.pop();
          trailingComma = true;
          continue;
        }
      } else {
        ctx.out.push(',');
        ctx.notes.add('Inserted missing comma');
      }
    }
    first = false;
    trailingComma = false;

    // Key
    const { tok: kTok, idx: kidx } = nextSig(toks, i);
    i = kidx;
    if (kTok.kind === 'string') {
      ctx.out.push(jsonString(kTok.value!));
      i++;
    } else if (kTok.kind === 'ident') {
      ctx.out.push(jsonString(kTok.raw));
      ctx.notes.add('Quoted unquoted object keys');
      i++;
    } else if (kTok.kind === 'number') {
      ctx.out.push(jsonString(kTok.raw));
      ctx.notes.add('Quoted numeric object keys');
      i++;
    } else if (kTok.kind === 'punct' && kTok.raw === '}') {
      ctx.stack.pop();
      ctx.out.push('}');
      i++;
      return i;
    } else {
      break;
    }

    // Colon
    const { tok: cTok, idx: cidx } = nextSig(toks, i);
    i = cidx;
    if (cTok.kind === 'punct' && cTok.raw === ':') {
      ctx.out.push(':');
      i++;
    } else if (cTok.kind === 'punct' && cTok.raw === '=') {
      ctx.out.push(':');
      ctx.notes.add('Replaced "=" with ":"');
      i++;
    } else {
      ctx.out.push(':');
      ctx.notes.add('Inserted missing ":"');
    }

    // Value
    i = emitValue(toks, i, ctx);
  }
  ctx.out.push('}');
  ctx.stack.pop();
  ctx.notes.add('Closed unbalanced "}"');
  return i;
}

function emitArray(toks: Tok[], i: number, ctx: EmitCtx): number {
  ctx.out.push('[');
  ctx.stack.push('array');
  i++;
  let first = true;
  let trailingComma = false;
  while (true) {
    const { tok, idx } = nextSig(toks, i);
    i = idx;
    if (tok.kind === 'eof') break;
    if (tok.kind === 'punct' && tok.raw === ']') {
      i++;
      ctx.stack.pop();
      ctx.out.push(']');
      if (trailingComma) ctx.notes.add('Removed trailing comma');
      return i;
    }
    if (!first) {
      if (tok.kind === 'punct' && tok.raw === ',') {
        ctx.out.push(',');
        i++;
        const { tok: after, idx: aidx } = nextSig(toks, i);
        i = aidx;
        if (after.kind === 'punct' && after.raw === ']') {
          ctx.out.pop();
          trailingComma = true;
          continue;
        }
        if (after.kind === 'punct' && after.raw === ',') {
          ctx.out.push('null');
          ctx.notes.add('Filled holes in sparse array with null');
          continue;
        }
      } else {
        ctx.out.push(',');
        ctx.notes.add('Inserted missing comma');
      }
    }
    first = false;
    trailingComma = false;

    i = emitValue(toks, i, ctx);
  }
  ctx.out.push(']');
  ctx.stack.pop();
  ctx.notes.add('Closed unbalanced "]"');
  return i;
}

// ──────────────────────────────────────────────────────────────────────────
//  Public entry
// ──────────────────────────────────────────────────────────────────────────

export interface RepairOutcome {
  ok: boolean;
  text: string;
  changes: string[];
  error?: string;
}

export function repair(src: string): RepairOutcome {
  if (!src.trim()) {
    return { ok: false, text: '', changes: [], error: 'Empty text' };
  }

  // Fast path: if already valid JSON, return directly
  if (canParse(src)) {
    try {
      const parsed = JSON.parse(src);
      const text = JSON.stringify(parsed, null, 2);
      return { ok: true, text, changes: [] };
    } catch { /* fall through */ }
  }

  const { tokens, notes } = tokenize(src);
  const ctx: EmitCtx = { out: [], notes, stack: [], topValues: 0 };
  let i = 0;

  while (true) {
    const { tok, idx } = nextSig(tokens, i);
    i = idx;
    if (tok.kind === 'eof') break;

    if (ctx.topValues > 0) {
      ctx.notes.add('Wrapped multiple top-level values in an array');
      const cur = ctx.out.join('');
      ctx.out.length = 0;
      ctx.out.push('[', cur, ',');
    }
    if (isValueStart(tok)) {
      i = emitValue(tokens, i, ctx);
      ctx.topValues++;
    } else if (tok.kind === 'punct' && tok.raw === ',') {
      i++;
      ctx.notes.add('Removed stray top-level comma');
    } else {
      i++;
      ctx.notes.add('Removed stray characters');
    }
  }

  if (ctx.topValues > 1) {
    ctx.out.push(']');
  }

  let text = ctx.out.join('');
  if (!text) {
    return { ok: false, text: '', changes: [], error: 'No JSON value found' };
  }

  // Auto-format clean output
  try {
    const parsed = JSON.parse(text);
    text = JSON.stringify(parsed, null, 2);
    return { ok: true, text, changes: [...notes] };
  } catch (e) {
    return {
      ok: false,
      text,
      changes: [...notes],
      error: (e as Error).message,
    };
  }
}
