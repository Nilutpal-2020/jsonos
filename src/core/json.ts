import {
  parseTree,
  printParseErrorCode,
  getNodePath,
  type Node,
  type ParseError as JPError,
} from 'jsonc-parser';
import type { JsonPath, JsonValue, ParseError, ParseResult } from './types';

function nodeToValue(node: Node | undefined): JsonValue | undefined {
  if (!node) return undefined;
  switch (node.type) {
    case 'null': return null;
    case 'boolean': return node.value as boolean;
    case 'number': return node.value as number;
    case 'string': return node.value as string;
    case 'array':
      return (node.children ?? []).map((c) => nodeToValue(c) as JsonValue);
    case 'object': {
      const o: Record<string, JsonValue> = {};
      for (const prop of node.children ?? []) {
        const [k, v] = prop.children ?? [];
        if (k && v) o[k.value as string] = nodeToValue(v) as JsonValue;
      }
      return o;
    }
    default: return undefined;
  }
}

function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1, col = 1;
  const max = Math.min(offset, text.length);
  for (let i = 0; i < max; i++) {
    if (text.charCodeAt(i) === 10) { line++; col = 1; }
    else col++;
  }
  return { line, column: col };
}

export function parseJson(text: string): ParseResult {
  const rawErrors: JPError[] = [];
  const tree = parseTree(text, rawErrors, { allowTrailingComma: false, disallowComments: true });
  const value = nodeToValue(tree);
  const errors: ParseError[] = rawErrors.map((e) => {
    const { line, column } = offsetToLineCol(text, e.offset);
    const path = pathFromOffset(tree, e.offset);
    return {
      message: printParseErrorCode(e.error),
      path,
      offset: e.offset,
      length: e.length,
      line,
      column,
      severity: 'error',
    };
  });
  return {
    text,
    value: errors.length ? undefined : value,
    errors,
    byteSize: new Blob([text]).size,
  };
}

function pathFromOffset(root: Node | undefined, offset: number): JsonPath {
  if (!root) return [];
  // walk down to deepest node containing offset
  let cur: Node | undefined = root;
  while (cur) {
    const children: Node[] = cur.children ?? [];
    const child: Node | undefined = children.find(
      (c) => offset >= c.offset && offset <= c.offset + c.length,
    );
    if (!child) break;
    cur = child;
  }
  return cur ? getNodePath(cur) : [];
}

export function formatJson(text: string, indent = 2): string {
  const v = JSON.parse(text);
  return JSON.stringify(v, null, indent);
}

export function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text));
}

// `repair` lives in json-repair.ts. Re-exported here so legacy callers see it.
export { repair as repairJsonDetailed } from './json-repair';

/** Lightweight wrapper that throws on failure — existing callers expect this. */
import { repair as _repair } from './json-repair';
export function repairJson(text: string): string {
  const r = _repair(text);
  if (!r.ok) throw new Error(r.error ?? 'Could not repair input');
  return r.text;
}

export function getValueAtPath(value: JsonValue | undefined, path: JsonPath): JsonValue | undefined {
  let cur: any = value;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
}
