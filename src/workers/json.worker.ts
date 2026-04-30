import * as Comlink from 'comlink';
import { parseJson, formatJson, minifyJson, repairJson } from '../core/json';
import type { JsonValue, ParseResult } from '../core/types';

type AjvInstance = import('ajv').default;
let ajvP: Promise<AjvInstance> | null = null;

async function getAjv(): Promise<AjvInstance> {
  if (!ajvP) {
    ajvP = (async () => {
      const [{ default: Ajv }, { default: addFormats }] = await Promise.all([
        import('ajv'),
        import('ajv-formats'),
      ]);
      const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
      addFormats(ajv);
      return ajv;
    })();
  }
  return ajvP;
}

function sortKeysDeep(v: JsonValue): JsonValue {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep((v as any)[k]);
    return out;
  }
  return v;
}

function sortKeysShallow(v: JsonValue): JsonValue {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, JsonValue> = {};
    for (const k of Object.keys(v).sort()) out[k] = (v as any)[k];
    return out;
  }
  return v;
}

const api = {
  parse(text: string): ParseResult {
    return parseJson(text);
  },
  format(text: string, indent = 2): { ok: true; text: string } | { ok: false; error: string } {
    try { return { ok: true, text: formatJson(text, indent) }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  },
  minify(text: string): { ok: true; text: string } | { ok: false; error: string } {
    try { return { ok: true, text: minifyJson(text) }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  },
  repair(text: string): { ok: true; text: string } | { ok: false; error: string } {
    try { return { ok: true, text: repairJson(text) }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  },
  sortKeys(text: string, deep = true): { ok: true; text: string } | { ok: false; error: string } {
    try {
      const v = JSON.parse(text);
      const sorted = (deep ? sortKeysDeep : sortKeysShallow)(v);
      return { ok: true, text: JSON.stringify(sorted, null, 2) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
  async validateSchema(
    text: string,
    schemaText: string,
  ): Promise<{ ok: false; error: string } | { ok: true; errors: { message: string; path: string }[] }> {
    let schema: any;
    try { schema = JSON.parse(schemaText); }
    catch (e) { return { ok: false, error: 'Schema parse error: ' + (e as Error).message }; }
    let value: any;
    try { value = JSON.parse(text); }
    catch (e) { return { ok: false, error: 'Document parse error: ' + (e as Error).message }; }
    const ajv = await getAjv();
    let validate;
    try { validate = ajv.compile(schema); }
    catch (e) { return { ok: false, error: 'Schema compile error: ' + (e as Error).message }; }
    const valid = validate(value);
    if (valid) return { ok: true, errors: [] };
    const errors = (validate.errors ?? []).map((e: any) => ({
      message: `${e.instancePath || '$'} ${e.message ?? ''}`.trim(),
      path: e.instancePath || '$',
    }));
    return { ok: true, errors };
  },
};

export type JsonWorkerApi = typeof api;

Comlink.expose(api);
