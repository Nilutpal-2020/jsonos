import { anonymizeText } from '@jsonos/redact-core';
import { loadOptions } from '../storage.js';

const CONTEXT_MENU_ID = 'jsonos-redact-selection';

// Create context menu item on extension install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Redact selected text',
    contexts: ['selection'],
  });
});

// Handle context menu action
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    const options = await loadOptions();
    const { result, count } = anonymizeText(info.selectionText, options);

    const success = await copyToClipboard(result, tab);
    if (success) {
      notifyUser(count);
    } else {
      notifyUserError();
    }
  }
});

// Primary & Fallback Clipboard Helper
async function copyToClipboard(text: string, tab?: chrome.tabs.Tab): Promise<boolean> {
  // Strategy 1: Inject script into active tab to use navigator.clipboard
  if (tab && tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (textToCopy: string) => {
          return navigator.clipboard
            .writeText(textToCopy)
            .then(() => true)
            .catch(() => {
              // Fallback DOM copy inside page
              const textArea = document.createElement('textarea');
              textArea.value = textToCopy;
              document.body.appendChild(textArea);
              textArea.select();
              const ok = document.execCommand('copy');
              document.body.removeChild(textArea);
              return ok;
            });
        },
        args: [text],
      });

      if (results && results[0] && results[0].result) {
        return true;
      }
    } catch {
      // Execute script failed (restricted page or permission issue), proceed to offscreen fallback
    }
  }

  // Strategy 2: Offscreen document fallback
  try {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    const existingContexts = await (chrome as any).runtime.getContexts?.({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });

    if (!existingContexts || existingContexts.length === 0) {
      await (chrome as any).offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Copy redacted text to clipboard from background action',
      });
    }

    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_COPY',
      text,
    });

    return !!(response && response.success);
  } catch (err) {
    console.error('Offscreen clipboard copy failed:', err);
    return false;
  }
}

// Notification Helper
function notifyUser(count: number) {
  if (chrome.notifications && chrome.notifications.create) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'JSON OS Redact',
      message: `Redacted text copied — ${count} ${count === 1 ? 'item' : 'items'} removed`,
      priority: 1,
    });
  }
}

function notifyUserError() {
  if (chrome.notifications && chrome.notifications.create) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'JSON OS Redact',
      message: 'Failed to write redacted text to clipboard',
      priority: 1,
    });
  }
}
