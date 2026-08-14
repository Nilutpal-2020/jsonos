import { anonymizeText, AnonymizeOptions, RedactMode, TextMatch } from '@jsonos/redact-core';
import { loadOptions, saveOptions } from '../storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Header & Active Tab Card
  const openOptionsBtn = document.getElementById('openOptionsBtn') as HTMLButtonElement;
  const activeTabDomain = document.getElementById('activeTabDomain') as HTMLSpanElement;
  const tabStatusText = document.getElementById('tabStatusText') as HTMLSpanElement;
  const scanPageBtn = document.getElementById('scanPageBtn') as HTMLButtonElement;
  const clearPageBtn = document.getElementById('clearPageBtn') as HTMLButtonElement;

  // Mode & Detectors
  const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');
  const toggleEmails = document.getElementById('toggleEmails') as HTMLInputElement;
  const toggleSecrets = document.getElementById('toggleSecrets') as HTMLInputElement;
  const togglePrices = document.getElementById('togglePrices') as HTMLInputElement;
  const toggleCards = document.getElementById('toggleCards') as HTMLInputElement;
  const toggleIps = document.getElementById('toggleIps') as HTMLInputElement;
  const toggleUrls = document.getElementById('toggleUrls') as HTMLInputElement;
  const togglePhones = document.getElementById('togglePhones') as HTMLInputElement;
  const toggleNames = document.getElementById('toggleNames') as HTMLInputElement;

  // Manual Textarea Section
  const inputText = document.getElementById('inputText') as HTMLTextAreaElement;
  const outputText = document.getElementById('outputText') as HTMLTextAreaElement;
  const inputCharCount = document.getElementById('inputCharCount') as HTMLSpanElement;
  const outputCharCount = document.getElementById('outputCharCount') as HTMLSpanElement;
  const redactBtn = document.getElementById('redactBtn') as HTMLButtonElement;
  const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;

  // Summary & Toast
  const totalMatchesCount = document.getElementById('totalMatchesCount') as HTMLSpanElement;
  const matchesList = document.getElementById('matchesList') as HTMLDivElement;
  const toast = document.getElementById('toast') as HTMLDivElement;

  let currentOptions: AnonymizeOptions = await loadOptions();
  let activeTab: chrome.tabs.Tab | null = null;

  function syncUiFromOptions() {
    modeBtns.forEach((btn) => {
      if (btn.dataset.mode === currentOptions.mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    toggleEmails.checked = currentOptions.maskEmails;
    toggleSecrets.checked = currentOptions.maskSecrets;
    if (togglePrices) togglePrices.checked = currentOptions.maskPrices;
    toggleCards.checked = currentOptions.maskCards;
    toggleIps.checked = currentOptions.maskIps;
    toggleUrls.checked = currentOptions.maskUrls;
    togglePhones.checked = currentOptions.maskPhones;
    toggleNames.checked = currentOptions.maskNames;
  }

  syncUiFromOptions();

  // Detect Active Tab
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      activeTab = tabs[0];
      if (activeTab.url) {
        try {
          const urlObj = new URL(activeTab.url);
          activeTabDomain.textContent = urlObj.hostname;
        } catch {
          activeTabDomain.textContent = activeTab.title || 'Current Tab';
        }
      }
    }
  }

  async function updateOptionsFromUi() {
    let activeMode: RedactMode = 'redact';
    modeBtns.forEach((btn) => {
      if (btn.classList.contains('active')) {
        activeMode = (btn.dataset.mode as RedactMode) || 'redact';
      }
    });

    currentOptions = {
      ...currentOptions,
      mode: activeMode,
      maskEmails: toggleEmails.checked,
      maskSecrets: toggleSecrets.checked,
      maskPrices: togglePrices ? togglePrices.checked : true,
      maskCards: toggleCards.checked,
      maskIps: toggleIps.checked,
      maskUrls: toggleUrls.checked,
      maskPhones: togglePhones.checked,
      maskNames: toggleNames.checked,
    };

    await saveOptions(currentOptions);
    if (inputText && inputText.value) {
      performManualRedaction();
    }
  }

  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  function showToast(message: string) {
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function renderMatchSummary(matches: TextMatch[], count: number) {
    totalMatchesCount.textContent = `${count} ${count === 1 ? 'item' : 'items'} found`;

    if (!matches || matches.length === 0) {
      matchesList.innerHTML = '<span class="match-badge">0 PII items detected</span>';
      return;
    }

    const countsByType: Record<string, number> = {};
    for (const match of matches) {
      countsByType[match.type] = (countsByType[match.type] || 0) + 1;
    }

    const typeLabels: Record<string, string> = {
      email: 'Email',
      secret: 'Secret',
      price: 'Price',
      card: 'Card',
      ip: 'IP',
      phone: 'Phone',
      url: 'URL',
      name: 'Name',
      value: 'Value',
    };

    matchesList.innerHTML = '';
    Object.entries(countsByType).forEach(([type, c]) => {
      const label = typeLabels[type] || type;
      const badge = document.createElement('span');
      badge.className = 'match-badge has-count';
      badge.textContent = `${c} ${label}${c > 1 ? 's' : ''}`;
      matchesList.appendChild(badge);
    });
  }

  async function scanActiveTab() {
    if (!activeTab || !activeTab.id) {
      showToast('No active tab found!');
      return;
    }

    if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://'))) {
      tabStatusText.textContent = 'Restricted page';
      showToast('Cannot scan restricted Chrome internal pages!');
      return;
    }

    tabStatusText.textContent = 'Scanning tab...';

    const sendScanMessage = () => {
      return new Promise<{ success: boolean; count?: number; matches?: TextMatch[]; error?: string }>((resolve) => {
        chrome.tabs.sendMessage(activeTab!.id!, { type: 'SCAN_AND_HIGHLIGHT_PAGE', options: currentOptions }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res || { success: false });
          }
        });
      });
    };

    let response = await sendScanMessage();

    if (!response.success && activeTab.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js'],
        });
        response = await sendScanMessage();
      } catch (err) {
        tabStatusText.textContent = 'Scan error';
        showToast(`Failed to scan page: ${String(err)}`);
        return;
      }
    }

    if (response.success) {
      const count = response.count || 0;
      const matches = response.matches || [];
      tabStatusText.textContent = `Highlighted ${count} items`;
      renderMatchSummary(matches, count);
      showToast(`Highlighted ${count} items on active tab!`);
    } else {
      tabStatusText.textContent = 'Scan failed';
      showToast(`Scan failed: ${response.error || 'Unknown error'}`);
    }
  }

  async function clearActiveTab() {
    if (!activeTab || !activeTab.id) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'CLEAR_PAGE_HIGHLIGHTS' }, () => {
      tabStatusText.textContent = 'Highlights cleared';
      matchesList.innerHTML = '<span class="match-badge">Page highlights cleared</span>';
      totalMatchesCount.textContent = '0 items';
      showToast('Cleared page highlights!');
    });
  }

  function performManualRedaction() {
    const text = inputText.value;
    inputCharCount.textContent = `${text.length} chars`;

    if (!text.trim()) {
      outputText.value = '';
      outputCharCount.textContent = '0 chars';
      return;
    }

    const { result, count, matches } = anonymizeText(text, currentOptions);
    outputText.value = result;
    outputCharCount.textContent = `${result.length} chars`;
    renderMatchSummary(matches, count);
  }

  scanPageBtn.addEventListener('click', scanActiveTab);
  clearPageBtn.addEventListener('click', clearActiveTab);

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateOptionsFromUi();
    });
  });

  const detectorInputs = [toggleEmails, toggleSecrets, togglePrices, toggleCards, toggleIps, toggleUrls, togglePhones, toggleNames].filter(Boolean);
  detectorInputs.forEach((input) => {
    input.addEventListener('change', updateOptionsFromUi);
  });

  if (inputText) inputText.addEventListener('input', performManualRedaction);
  if (redactBtn) redactBtn.addEventListener('click', performManualRedaction);

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const val = outputText.value;
      if (!val) {
        showToast('Nothing to copy!');
        return;
      }
      try {
        await navigator.clipboard.writeText(val);
        showToast('Copied output!');
      } catch {
        outputText.select();
        document.execCommand('copy');
        showToast('Copied output!');
      }
    });
  }

  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });
  }
});
