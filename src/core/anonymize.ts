import type { JsonValue } from './types';

export interface AnonymizeOptions {
  mode: 'redact' | 'mask' | 'hash';
  maskEmails: boolean;
  maskSecrets: boolean;
  maskCards: boolean;
  maskIps: boolean;
  maskPhones: boolean;
  maskUrls: boolean;
  maskNames: boolean;
  maskPrices: boolean;
  redactAllValues: boolean;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const JWT_REGEX = /^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
const CREDIT_CARD_REGEX = /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$/;
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const PHONE_KEY_PATTERNS = ['phone', 'mobile', 'tel', 'cell', 'contact_num', 'contact_number', 'whatsapp', 'phone_number', 'mobile_number'];
const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/i;
const URL_KEY_PATTERNS = ['url', 'website', 'endpoint', 'link', 'uri', 'webhook', 'callback_url', 'origin_url', 'site_url'];

const SECRET_KEY_PATTERNS = [
  'password', 'passwd', 'secret', 'token', 'auth', 'api_key', 'apikey',
  'access_token', 'private_key', 'ssn', 'credit_card', 'card_number',
  'bearer', 'key', 'session', 'hash', 'salt', 'certificate', 'credential', 'pin', 'cvv'
];

const NAME_PII_KEY_PATTERNS = [
  'name', 'fullname', 'full_name', 'first_name', 'firstname', 'last_name', 'lastname',
  'user', 'username', 'user_name', 'assignee', 'author', 'owner', 'creator',
  'created_by', 'updated_by', 'member', 'person', 'contact', 'customer', 'client',
  'address', 'street', 'city', 'state', 'country', 'zipcode', 'postal', 'location',
  'dob', 'birthdate'
];

const PRICE_KEY_PATTERNS = [
  'price', 'cost', 'amount', 'fee', 'charge', 'rate', 'budget', 'salary',
  'income', 'expense', 'total', 'subtotal', 'tax', 'balance', 'currency'
];

const PRICE_REGEX_G =
  /(?:(?:[\$\€\£\¥\₹\₽\₩\₴\₺\฿\₫]|Rs\.?|INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|R\$)\s*\d+(?:[,\.\s]\d+)*(?:\.\d{1,2})?|\b\d+(?:[,\.\s]\d+)*(?:\.\d{1,2})?\s*(?:INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|Rs\.?)\b)/gi;

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((p) => k.includes(p));
}

function isNameKey(key: string): boolean {
  const k = key.toLowerCase();
  return NAME_PII_KEY_PATTERNS.some((p) => k.includes(p));
}

function isPhoneKey(key: string): boolean {
  const k = key.toLowerCase();
  return PHONE_KEY_PATTERNS.some((p) => k.includes(p));
}

function isUrlKey(key: string): boolean {
  const k = key.toLowerCase();
  return URL_KEY_PATTERNS.some((p) => k.includes(p));
}

function isPriceKey(key: string): boolean {
  const k = key.toLowerCase();
  return PRICE_KEY_PATTERNS.some((p) => k.includes(p));
}

function isPhoneNumberValue(str: string, currentKey: string): boolean {
  const keyMatch = currentKey ? isPhoneKey(currentKey) : false;
  if (keyMatch) {
    if (/[a-zA-Z]/.test(str)) return false;
    const digits = str.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  if (/[a-zA-Z]/.test(str)) return false;
  if (str.includes(':') || str.includes('/') || str.includes('T')) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return false;

  const digits = str.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;

  if (/^\+\d{1,4}[-.\s]?\d{6,14}$/.test(str)) return true;
  if (/^(?:\+\d{1,4}\s?)?\(\d{2,5}\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}$/.test(str)) return true;
  if (/^\d{3,4}[-.]\d{3,4}[-.]\d{3,4}$/.test(str)) return true;

  return false;
}

function maskUrlString(val: string, mode: AnonymizeOptions['mode']): string {
  try {
    const parsed = new URL(val);
    const originHost = parsed.hostname;
    const portSuffix = parsed.port ? `:${parsed.port}` : '';
    const pathAndQuery = val.slice(parsed.origin.length);

    let newHost: string;
    if (mode === 'redact') {
      newHost = '[REDACTED_DOMAIN]';
    } else if (mode === 'hash') {
      let hash = 0;
      for (let i = 0; i < originHost.length; i++) {
        hash = (hash << 5) - hash + originHost.charCodeAt(i);
        hash |= 0;
      }
      newHost = `hash_${Math.abs(hash).toString(16)}`;
    } else {
      const parts = originHost.split('.');
      if (parts.length > 1) {
        const tld = parts[parts.length - 1];
        const maskedParts = parts.slice(0, -1).map((p) => (p.length > 2 ? `${p[0]}***${p[p.length - 1]}` : '***'));
        newHost = [...maskedParts, tld].join('.');
      } else {
        newHost = '***.local';
      }
    }

    return `${parsed.protocol}//${newHost}${portSuffix}${pathAndQuery}`;
  } catch {
    if (mode === 'redact') return '[REDACTED_DOMAIN]';
    if (mode === 'hash') return 'hash_domain';
    return 'https://a***e.com';
  }
}

function maskString(
  val: string,
  mode: AnonymizeOptions['mode'],
  type: 'email' | 'secret' | 'card' | 'ip' | 'phone' | 'url' | 'name' | 'price' | 'value'
): string {
  if (type === 'url') {
    return maskUrlString(val, mode);
  }

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
  if (type === 'name') {
    const words = val.split(/\s+/);
    return words.map((w) => (w.length > 2 ? `${w[0]}***${w[w.length - 1]}` : '***')).join(' ');
  }
  if (type === 'card') {
    const clean = val.replace(/[\s-]/g, '');
    return `****-****-****-${clean.slice(-4)}`;
  }
  if (type === 'ip') {
    return '192.168.*.*';
  }
  if (type === 'phone') {
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 4) {
      const last4 = digits.slice(-4);
      return `***-***-${last4}`;
    }
    return '***-***-****';
  }
  if (type === 'price') {
    return val.replace(/\d/g, '*');
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
    if (v === null || typeof v === 'boolean') {
      return v;
    }

    if (typeof v === 'number') {
      if (opts.redactAllValues) {
        count++;
        return opts.mode === 'redact' ? 0 : 9999;
      }
      return v;
    }

    if (typeof v === 'string') {
      const cleanVal = v.trim();
      if (!cleanVal) return v;

      if (opts.redactAllValues) {
        count++;
        return maskString(v, opts.mode, 'value');
      }

      if (opts.maskSecrets && currentKey && isSecretKey(currentKey)) {
        count++;
        return maskString(v, opts.mode, 'secret');
      }

      if (opts.maskNames && currentKey && isNameKey(currentKey)) {
        count++;
        return maskString(v, opts.mode, 'name');
      }

      if (opts.maskEmails && EMAIL_REGEX.test(cleanVal)) {
        count++;
        return maskString(cleanVal, opts.mode, 'email');
      }

      if (opts.maskSecrets && (JWT_REGEX.test(cleanVal) || cleanVal.startsWith('Bearer '))) {
        count++;
        return maskString(cleanVal, opts.mode, 'secret');
      }

      if (opts.maskCards && CREDIT_CARD_REGEX.test(cleanVal.replace(/[\s-]/g, ''))) {
        count++;
        return maskString(cleanVal, opts.mode, 'card');
      }

      if (opts.maskIps && IP_REGEX.test(cleanVal)) {
        count++;
        return maskString(cleanVal, opts.mode, 'ip');
      }

      if (opts.maskPhones && isPhoneNumberValue(cleanVal, currentKey)) {
        count++;
        return maskString(cleanVal, opts.mode, 'phone');
      }

      if (
        opts.maskPrices &&
        ((currentKey && isPriceKey(currentKey)) || PRICE_REGEX_G.test(cleanVal))
      ) {
        count++;
        return maskString(cleanVal, opts.mode, 'price');
      }

      if (
        opts.maskUrls &&
        (URL_REGEX.test(cleanVal) ||
          (currentKey && isUrlKey(currentKey) && (cleanVal.startsWith('http://') || cleanVal.startsWith('https://'))))
      ) {
        count++;
        return maskString(cleanVal, opts.mode, 'url');
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
