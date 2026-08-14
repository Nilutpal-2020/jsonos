import { highlightPage, clearHighlights } from './highlighter.js';

// Listen for messages from Popup UI or Background Service Worker
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SCAN_AND_HIGHLIGHT_PAGE') {
      try {
        const { count, matches } = highlightPage(message.options);
        sendResponse({ success: true, count, matches });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
      return true;
    }

    if (message.type === 'CLEAR_PAGE_HIGHLIGHTS') {
      try {
        const count = clearHighlights();
        sendResponse({ success: true, count });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
      return true;
    }

    if (message.type === 'WRITE_CLIPBOARD') {
      navigator.clipboard
        .writeText(message.text)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true; // async response
    }

    return false;
  });
}
