/**
 * Forgiving JSON repair.
 *
 * Strategy: tokenize input with a permissive lexer (accepts JS-isms, comments,
 * smart quotes, hex/oct/bin numbers, Python literals, etc.), then re-emit the
 * token stream as canonical JSON with structural fixes (missing commas, stray
 * trailing commas, unclosed brackets, multiple top-level values).
 *
 * Returns the cleaned text plus a list of human-readable changes that were
 * applied. UI can show the list so the user knows what was rewritten.
 *
 * Trade-offs:
 * - Tokenizer is intentionally small and lenient. It does not aim for a
 *   perfect grammar; it is good enough for the common pasted-JSON-with-quirks
 *   cases.
 * - We never silently change a JSON-valid string's content; transformations
 *   only touch syntax tokens and ident/punct gaps.
 */

type TokKind = 'ws' | 'lcomment' | 'bcomment' | 'string' | 'number' | 'ident' | 'punct' | 'eof' | 'unknown';

interface Tok {
  kind: TokKind;
  /** Raw source slice. */
  raw: string;
  /** Decoded string value (only for kind === 'string'). */
  value?: string;
  /** Original quote char (`"` `'` `` ` `` `“` `‘`). */
  quote?: string;
  /** Source offset of the token start. */
  pos: number;
}

const SMART_OPEN_DOUBLE  = '“'; // “
const SMART_CLOSE_DOUBLE = '”'; // ”
const SMART_OPEN_SINGLE  = '‘'; // ‘
const SMART_CLOSE_SINGLE = '’'; // ’

function isWs(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}
function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isIdentStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_' || c === '$';
}
function isIdent(c: string): boolean { return isIdentStart(c) || isDigit(c); }

// ──────────────────────────────────────────────────────────────────────────
//  Tokenizer
// ──────────────────────────────────────────────────────────────────────────

function tokenize(src: string): { tokens: Tok[]; notes: Set<string> } {
  const tokens: Tok[] = [];
  const notes = new Set<string>();
  let i = 0;
  const n = src.length;

  // BOM
  if (n > 0 && src.charCodeAt(0) === 0xFEFF) {
    notes.add('Stripped leading BOM');
    i = 1;
  }

  while (i < n) {
    const c = src[i];

    // whitespace
    if (isWs(c)) {
      const start = i;
      while (i < n && isWs(src[i])) i++;
      tokens.push({ kind: 'ws', raw: src.slice(start, i), pos: start });
      continue;
    }

    // line comment // ...
    if (c === '/' && src[i + 1] === '/') {
      const start = i;
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      tokens.push({ kind: 'lcomment', raw: src.slice(start, i), pos: start });
      notes.add('Removed comments');
      continue;
    }

    // block comment /* ... */
    if (c === '/' && src[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      if (i < n) i += 2;
      tokens.push({ kind: 'bcomment', raw: src.slice(start, i), pos: start });
      notes.add('Removed comments');
      continue;
    }

    // hash line comment (YAML-ish, sometimes pasted)
    if (c === '#') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      tokens.push({ kind: 'lcomment', raw: src.slice(start, i), pos: start });
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
      while (i < n && !closers.includes(src[i])) {
        if (src[i] === '\\' && i + 1 < n) {
          const esc = src[i + 1];
          // Standard JSON escapes
          if (esc === '"') value += '"';
          else if (esc === '\\') value += '\\';
          else if (esc === '/')  value += '/';
          else if (esc === 'b')  value += '\b';
          else if (esc === 'f')  value += '\f';
          else if (esc === 'n')  value += '\n';
          else if (esc === 'r')  value += '\r';
          else if (esc === 't')  value += '\t';
          else if (esc === 'u' && /[0-9a-fA-F]{4}/.test(src.slice(i + 2, i + 6))) {
            value += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
            i += 4;
          } else if (esc === "'") value += "'";          // not legal in JSON; we'll re-encode
          else if (esc === '\n' || esc === '\r') {       // line continuation in JS
            // skip
          } else {
            value += esc;                                // keep unknown escape literally
          }
          i += 2;
        } else if (src[i] === '\n') {
          // Real newlines inside strings — invalid in JSON. Keep as escape on emit.
          value += '\n';
          i++;
        } else {
          value += src[i];
          i++;
        }
      }
      if (i < n) i++;                                    // skip closing quote
      tokens.push({ kind: 'string', raw: src.slice(start, i), value, quote: opener, pos: start });
      if (opener !== '"') notes.add('Converted non-double-quoted strings to JSON strings');
      continue;
    }

    // numbers (decimal, hex, oct, bin, with optional sign)
    if (c === '+' || c === '-' || isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const start = i;
      if (c === '+' || c === '-') i++;
      // Hex / oct / bin
      if (src[i] === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X' ||
                             src[i + 1] === 'o' || src[i + 1] === 'O' ||
                             src[i + 1] === 'b' || src[i + 1] === 'B')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++;
      } else {
        while (i < n && (isDigit(src[i]) || src[i] === '_')) i++;
        if (src[i] === '.') { i++; while (i < n && (isDigit(src[i]) || src[i] === '_')) i++; }
        if (src[i] === 'e' || src[i] === 'E') {
          i++;
          if (src[i] === '+' || src[i] === '-') i++;
          while (i < n && isDigit(src[i])) i++;
        }
      }
      // Trailing 'n' for BigInt — drop it on emit
      if (src[i] === 'n') i++;
      tokens.push({ kind: 'number', raw: src.slice(start, i), pos: start });
      continue;
    }

    // identifier (true/false/null/undefined/NaN/Infinity, plus unquoted keys)
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdent(src[i])) i++;
      tokens.push({ kind: 'ident', raw: src.slice(start, i), pos: start });
      continue;
    }

    // punctuation
    if ('{}[]:,'.includes(c)) {
      tokens.push({ kind: 'punct', raw: c, pos: i });
      i++;
      continue;
    }

    // unknown — keep as raw, rare
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
  undefined: 'null',
  NaN: 'null', nan: 'null',
  Infinity: 'null', '-Infinity': 'null',
};

function jsonString(value: string): string {
  // Use JSON.stringify for full RFC 8259 escaping correctness (newlines, ctrls, \u).
  return JSON.stringify(value);
}

function normalizeNumber(raw: string): string | null {
  let s = raw.trim();
  // strip leading +
  if (s.startsWith('+')) s = s.slice(1);
  // strip BigInt 'n'
  if (s.endsWith('n')) s = s.slice(0, -1);
  // drop digit-separator underscores (JS / Python style)
  s = s.replace(/_/g, '');

  // hex / oct / bin → decimal
  const sign = s.startsWith('-') ? '-' : '';
  const body = sign ? s.slice(1) : s;
  if (/^0x[0-9a-fA-F]+$/.test(body)) return sign + parseInt(body, 16);
  if (/^0o[0-7]+$/.test(body))       return sign + parseInt(body.slice(2), 8);
  if (/^0b[01]+$/.test(body))        return sign + parseInt(body.slice(2), 2);

  // strip pointless leading zeros: 007 → 7
  const m = body.match(/^0+(\d+)(\..*)?$/);
  if (m) return sign + m[1] + (m[2] ?? '');

  // Validate by parseFloat + JSON round-trip
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return JSON.stringify(n);
}

type EmitState =
  | 'top'
  | 'value'              // expects a value next
  | 'after-value'        // expects , or close
  | 'object-key'         // expects key (string|ident) or close
  | 'after-key'          // expects :
  | 'after-colon'        // expects value
  | 'array-value'        // expects value or close
  ;

interface EmitCtx {
  out: string[];
  notes: Set<string>;
  /** Stack of container kinds to balance later. */
  stack: ('object' | 'array')[];
  /** Number of complete top-level values emitted. */
  topValues: number;
}

function nextSig(toks: Tok[], i: number): { tok: Tok; idx: number } {
  while (i < toks.length && (toks[i].kind === 'ws' || toks[i].kind === 'lcomment' || toks[i].kind === 'bcomment')) i++;
  return { tok: toks[i], idx: i };
}

function isValueStart(t: Tok): boolean {
  if (t.kind === 'string' || t.kind === 'number') return true;
  if (t.kind === 'punct' && (t.raw === '{' || t.raw === '[')) return true;
  if (t.kind === 'ident') return true;          // we'll coerce / quote
  return false;
}

function emitValue(toks: Tok[], i: number, ctx: EmitCtx): number {
  const { tok, idx } = nextSig(toks, i);
  i = idx;
  if (!isValueStart(tok)) {
    // Insert null placeholder
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
    // Bare identifier as a value — quote as string
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

  // Shouldn't get here
  ctx.out.push('null');
  return i + 1;
}

function emitObject(toks: Tok[], i: number, ctx: EmitCtx): number {
  ctx.out.push('{');
  ctx.stack.push('object');
  i++;                                          // consume '{'
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
    // Need comma between entries
    if (!first) {
      if (tok.kind === 'punct' && tok.raw === ',') {
        ctx.out.push(',');
        i++;
        const { tok: after, idx: aidx } = nextSig(toks, i);
        i = aidx;
        if (after.kind === 'punct' && after.raw === '}') {
          // trailing comma; let the close branch above handle next loop
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
      // Numeric keys → quoted
      ctx.out.push(jsonString(kTok.raw));
      ctx.notes.add('Quoted numeric object keys');
      i++;
    } else if (kTok.kind === 'punct' && kTok.raw === '}') {
      // empty
      ctx.stack.pop();
      ctx.out.push('}');
      i++;
      return i;
    } else {
      // unrecoverable here — bail out
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
  // Unclosed
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
        // ",,"  → "," + null  (sparse arrays normalized)
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
  const { tokens, notes } = tokenize(src);
  const ctx: EmitCtx = { out: [], notes, stack: [], topValues: 0 };
  let i = 0;

  while (true) {
    const { tok, idx } = nextSig(tokens, i);
    i = idx;
    if (tok.kind === 'eof') break;

    if (ctx.topValues > 0) {
      // Multiple top-level values → wrap in array.
      ctx.notes.add('Wrapped multiple top-level values in an array');
      const cur = ctx.out.join('');
      ctx.out.length = 0;
      ctx.out.push('[', cur, ',');
    }
    if (isValueStart(tok)) {
      i = emitValue(tokens, i, ctx);
      ctx.topValues++;
    } else if (tok.kind === 'punct' && tok.raw === ',') {
      i++;                                      // skip stray comma at top level
      ctx.notes.add('Removed stray top-level comma');
    } else {
      // unknown garbage → skip
      i++;
      ctx.notes.add('Removed stray characters');
    }
  }

  if (ctx.topValues > 1) {
    ctx.out.push(']');
  }

  const text = ctx.out.join('');
  if (!text) {
    return { ok: false, text: '', changes: [], error: 'No JSON value found' };
  }

  // Validate the output. If still invalid, return error so caller can fall back.
  try {
    JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      text,
      changes: [...notes],
      error: (e as Error).message,
    };
  }

  return { ok: true, text, changes: [...notes] };
}
