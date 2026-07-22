import type { JsonValue } from './types';

export interface AnonymizeOptions {
  mode: 'redact' | 'mask' | 'hash';
  maskEmails: boolean;
  maskSecrets: boolean;
  maskCards: boolean;
  maskIps: boolean;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const JWT_REGEX = /^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
const CREDIT_CARD_REGEX = /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$/;
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const SECRET_KEY_PATTERNS = [
  'password', 'passwd', 'secret', 'token', 'auth', 'api_key', 'apikey',
  'access_token', 'private_key', 'ssn', 'credit_card', 'card_number'
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((p) => k.includes(p));
}

function maskString(val: string, mode: AnonymizeOptions['mode'], type: 'email' | 'secret' | 'card' | 'ip'): string {
  if (mode === 'redact') {
    return `[REDACTED_${type.toUpperCase()}]`;
  }
  if (mode === 'hash') {
    let hash = 0;
    for (let i = 0; i < val.length; i++) {
      hash = (hash << 5) - hash + val.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  // Mask mode
  if (type === 'email') {
    const parts = val.split('@');
    if (parts.length === 2) {
      const u = parts[0];
      const maskedUser = u.length > 2 ? `${u[0]}***${u[u.length - 1]}` : '***';
      return `${maskedUser}@${parts[1]}`;
    }
  }
  if (type === 'card') {
    const clean = val.replace(/[\s-]/g, '');
    return `****-****-****-${clean.slice(-4)}`;
  }
  if (type === 'ip') {
    return '192.168.*.*';
  }
  return '************';
}

export function anonymizeJson(
  val: JsonValue | undefined,
  opts: AnonymizeOptions
): { result: JsonValue | undefined; count: number } {
  if (val === undefined) return { result: undefined, count: 0 };
  let count = 0;

  function traverse(v: JsonValue, currentKey = ''): JsonValue {
    if (v === null || typeof v === 'boolean' || typeof v === 'number') {
      return v;
    }

    if (typeof v === 'string') {
      const cleanVal = v.trim();

      // Secret key matching
      if (opts.maskSecrets && currentKey && isSecretKey(currentKey)) {
        count++;
        return maskString(v, opts.mode, 'secret');
      }

      // Email matching
      if (opts.maskEmails && EMAIL_REGEX.test(cleanVal)) {
        count++;
        return maskString(cleanVal, opts.mode, 'email');
      }

      // JWT token matching
      if (opts.maskSecrets && (JWT_REGEX.test(cleanVal) || cleanVal.startsWith('Bearer '))) {
        count++;
        return maskString(cleanVal, opts.mode, 'secret');
      }

      // Credit Card matching
      if (opts.maskCards && CREDIT_CARD_REGEX.test(cleanVal.replace(/[\s-]/g, ''))) {
        count++;
        return maskString(cleanVal, opts.mode, 'card');
      }

      // IP matching
      if (opts.maskIps && IP_REGEX.test(cleanVal)) {
        count++;
        return maskString(cleanVal, opts.mode, 'ip');
      }

      return v;
    }

    if (Array.isArray(v)) {
      return v.map((item) => traverse(item, currentKey));
    }

    if (typeof v === 'object') {
      const out: Record<string, JsonValue> = {};
      for (const [k, propVal] of Object.entries(v)) {
        out[k] = traverse(propVal, k);
      }
      return out;
    }

    return v;
  }

  const result = traverse(val);
  return { result, count };
}
