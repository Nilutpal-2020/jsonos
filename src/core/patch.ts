import type { JsonPath, JsonValue, Patch } from './types';

function setIn(root: JsonValue, path: JsonPath, value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const arr = root.slice();
    const i = head as number;
    arr[i] = setIn(arr[i] as JsonValue, rest, value);
    return arr;
  }
  if (root && typeof root === 'object') {
    return { ...root, [head as string]: setIn((root as any)[head], rest, value) };
  }
  // path goes through scalar — overwrite
  const isIdx = typeof head === 'number';
  const fresh: JsonValue = isIdx ? [] : {};
  return setIn(fresh, path, value);
}

function removeIn(root: JsonValue, path: JsonPath): JsonValue {
  if (path.length === 0) return null;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const arr = root.slice();
    if (rest.length === 0) arr.splice(head as number, 1);
    else arr[head as number] = removeIn(arr[head as number] as JsonValue, rest);
    return arr;
  }
  if (root && typeof root === 'object') {
    if (rest.length === 0) {
      const { [head as string]: _drop, ...keep } = root as any;
      return keep;
    }
    return { ...root, [head as string]: removeIn((root as any)[head], rest) };
  }
  return root;
}

function getIn(root: JsonValue, path: JsonPath): JsonValue | undefined {
  let cur: any = root;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
}

export function applyPatch(value: JsonValue | undefined, patch: Patch): JsonValue | undefined {
  if (patch.op === 'replaceText') return value; // text-only patch handled at text layer
  const root: JsonValue = value === undefined ? (typeof patch.path[0] === 'number' ? [] : {}) : value;
  switch (patch.op) {
    case 'replace':
    case 'add':
      return setIn(root, patch.path, patch.value);
    case 'remove':
      return removeIn(root, patch.path);
    case 'move': {
      const moved = getIn(root, patch.from);
      if (moved === undefined) return root;
      const removed = removeIn(root, patch.from);
      return setIn(removed, patch.path, moved);
    }
  }
}

export function invertPatch(prev: JsonValue | undefined, patch: Patch): Patch | null {
  if (patch.op === 'replaceText') return null;
  const before = prev === undefined ? undefined : getIn(prev as JsonValue, patch.op === 'move' ? patch.from : patch.path);
  switch (patch.op) {
    case 'replace':
      return before === undefined
        ? { op: 'remove', path: patch.path }
        : { op: 'replace', path: patch.path, value: before as JsonValue };
    case 'add':
      return { op: 'remove', path: patch.path };
    case 'remove':
      return before === undefined ? null : { op: 'add', path: patch.path, value: before as JsonValue };
    case 'move':
      return { op: 'move', from: patch.path, path: patch.from };
  }
}
