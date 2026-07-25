<script lang="ts">
  import { doc } from '../core/store.svelte';
  import { anonymizeJson, type AnonymizeOptions } from '../core/anonymize';

  let mode = $state<AnonymizeOptions['mode']>('redact');
  let maskEmails = $state(true);
  let maskSecrets = $state(true);
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
    Detect and redact sensitive customer data, names, assignees, passwords, JWT tokens, credit cards, phone numbers, web URLs, and IP addresses before sharing or logging.
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
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .mode-selector {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mode-selector button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .mode-selector button code {
    font-size: 11px;
    color: var(--muted);
  }
  .mode-selector button.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
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
  .check-label.highlight-check {
    margin-top: 6px;
    padding: 6px 8px;
    background: var(--accent-soft);
    border: 1px dashed var(--accent);
    border-radius: var(--radius);
  }

  .toast-banner {
    background: var(--ok-bg, rgba(34, 197, 94, 0.15));
    border: 1px solid var(--ok, #22c55e);
    color: var(--ok, #22c55e);
    padding: 8px 12px;
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }

  .apply-btn {
    margin-top: auto;
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
    border-radius: var(--radius);
    padding: 10px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: filter 80ms;
  }
  .apply-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .apply-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
