import { AnonymizeOptions, RedactMode } from '@jsonos/redact-core';
import { loadOptions, saveOptions } from '../storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');
  const toggleEmails = document.getElementById('toggleEmails') as HTMLInputElement;
  const toggleSecrets = document.getElementById('toggleSecrets') as HTMLInputElement;
  const togglePrices = document.getElementById('togglePrices') as HTMLInputElement;
  const toggleCards = document.getElementById('toggleCards') as HTMLInputElement;
  const toggleIps = document.getElementById('toggleIps') as HTMLInputElement;
  const toggleUrls = document.getElementById('toggleUrls') as HTMLInputElement;
  const togglePhones = document.getElementById('togglePhones') as HTMLInputElement;
  const toggleNames = document.getElementById('toggleNames') as HTMLInputElement;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const statusMsg = document.getElementById('statusMsg') as HTMLSpanElement;

  let currentOptions: AnonymizeOptions = await loadOptions();

  function syncUi() {
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

  syncUi();

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  saveBtn.addEventListener('click', async () => {
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

    statusMsg.classList.add('show');
    setTimeout(() => {
      statusMsg.classList.remove('show');
    }, 2500);
  });
});
