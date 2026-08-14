chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_COPY') {
    try {
      const textarea = document.getElementById('offscreenClipboardTarget') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = message.text;
        textarea.select();
        document.execCommand('copy');
        sendResponse({ success: true });
      } else {
        navigator.clipboard
          .writeText(message.text)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
      }
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
    return true;
  }
  return false;
});
