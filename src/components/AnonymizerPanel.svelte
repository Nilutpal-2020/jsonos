<script lang="ts">
  import { doc } from '../core/store.svelte';
  import { anonymizeJson, type AnonymizeOptions } from '../core/anonymize';

  let mode = $state<AnonymizeOptions['mode']>('redact');
  let maskEmails = $state(true);
  let maskSecrets = $state(true);
  let maskPrices = $state(true);
  let maskNames = $state(true);
  let maskCards = $state(true);
  let maskIps = $state(true);
  let maskPhones = $state(true);
  let maskUrls = $state(true);
  let redactAllValues = $state(false);

  let preview = $derived.by(() => {
    return anonymizeJson(doc.parse.value, {
      mode,
      maskEmails,
      maskSecrets,
      maskPrices,
      maskNames,
      maskCards,
      maskIps,
      maskPhones,
      maskUrls,
      redactAllValues,
    });
  });

  let toast = $state('');

  function applyRedaction() {
    if (preview.result !== undefined) {
      doc.replaceParsed(preview.result);
      toast = `Redacted ${preview.count} sensitive items!`;
      setTimeout(() => (toast = ''), 2000);
    }
  }
</script>

<div class="anon-container">
  <p class="intro">
    Detect and redact sensitive customer data, names, assignees, passwords, JWT tokens, credit cards, prices, phone numbers, web URLs, and IP addresses before sharing or logging.
  </p>

  <div class="detect-card" class:has-items={preview.count > 0}>
    <span class="count-num">{preview.count}</span>
    <span class="count-label">Sensitive items detected in payload</span>
  </div>

  <div class="config-group">
    <span class="group-title">Redaction Mode</span>
    <div class="mode-selector">
      <button class:active={mode === 'redact'} onclick={() => (mode = 'redact')}>
        Redact <code>[REDACTED]</code>
      </button>
      <button class:active={mode === 'mask'} onclick={() => (mode = 'mask')}>
        Mask <code>u***@dom.com</code>
      </button>
      <button class:active={mode === 'hash'} onclick={() => (mode = 'hash')}>
        Hash <code>hash_a1b2</code>
      </button>
    </div>
  </div>

  <div class="config-group">
    <span class="group-title">Target Patterns</span>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskSecrets} />
      <span>Passwords, API Keys, JWT Tokens, Secrets</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskPrices} />
      <span>Prices & Currency Amounts ($100, Rs. 1000)</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskNames} />
      <span>Names, Assignees, Authors & User PII</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskEmails} />
      <span>Email Addresses</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskPhones} />
      <span>Mobile / Phone Numbers</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskUrls} />
      <span>Web URLs & Webhook Endpoints</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskCards} />
      <span>Credit Card Numbers</span>
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={maskIps} />
      <span>IP Addresses</span>
    </label>
    <label class="check-label highlight-check">
      <input type="checkbox" bind:checked={redactAllValues} />
      <span><strong>Redact ALL Values & Payload Data</strong></span>
    </label>
  </div>

  {#if toast}
    <div class="toast-banner">✓ {toast}</div>
  {/if}

  <button class="apply-btn" onclick={applyRedaction} disabled={preview.count === 0}>
    ⚡ Redact Payload ({preview.count})
  </button>
</div>

<style>
  .anon-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 16px;
    padding: 12px;
    overflow-y: auto;
  }
  .intro {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
    margin: 0;
  }

  .detect-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .detect-card.has-items {
    border-color: var(--warn, #eab308);
    background: color-mix(in oklab, var(--warn) 10%, var(--surface));
  }
  .count-num {
    font-size: 24px;
    font-weight: 700;
    font-family: ui-monospace, monospace;
    color: var(--fg);
  }
  .detect-card.has-items .count-num {
    color: var(--warn, #eab308);
  }
  .count-label {
    font-size: 12px;
    color: var(--fg);
    font-weight: 500;
  }

  .config-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .mode-selector {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px;
    gap: 2px;
  }
  .mode-selector button {
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    padding: 6px 4px;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .mode-selector button:hover {
    color: var(--fg);
  }
  .mode-selector button.active {
    background: var(--accent);
    color: #fff;
  }
  .mode-selector code {
    font-size: 10px;
    opacity: 0.85;
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--fg);
    cursor: pointer;
    user-select: none;
  }
  .check-label input {
    cursor: pointer;
  }
  .highlight-check {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px dashed var(--border);
    color: var(--warn, #eab308);
  }

  .toast-banner {
    font-size: 12px;
    color: var(--success, #10b981);
    background: color-mix(in oklab, var(--success, #10b981) 12%, var(--surface));
    border: 1px solid var(--success, #10b981);
    padding: 8px 12px;
    border-radius: var(--radius);
  }

  .apply-btn {
    margin-top: auto;
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 10px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .apply-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
