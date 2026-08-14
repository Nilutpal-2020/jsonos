import { AnonymizeOptions, DEFAULT_ANONYMIZE_OPTIONS } from '@jsonos/redact-core';

export const EXTENSION_DEFAULT_OPTIONS: AnonymizeOptions = {
  ...DEFAULT_ANONYMIZE_OPTIONS,
  maskPhones: false, // Turned off by default in Chrome extension UI to reduce false positives in code/logs
  maskNames: false,  // Turned off by default in Chrome extension UI
  maskPrices: true,  // Prices/Amounts detector enabled by default
};

const STORAGE_KEY = 'jsonos_redact_options';

export async function loadOptions(): Promise<AnonymizeOptions> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (result && result[STORAGE_KEY]) {
          resolve({ ...EXTENSION_DEFAULT_OPTIONS, ...result[STORAGE_KEY] });
        } else {
          resolve({ ...EXTENSION_DEFAULT_OPTIONS });
        }
      });
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          resolve({ ...EXTENSION_DEFAULT_OPTIONS, ...JSON.parse(stored) });
          return;
        } catch {
          // ignore
        }
      }
      resolve({ ...EXTENSION_DEFAULT_OPTIONS });
    }
  });
}

export async function saveOptions(options: AnonymizeOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: options }, () => {
        resolve();
      });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
      resolve();
    }
  });
}
