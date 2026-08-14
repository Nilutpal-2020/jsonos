import * as vscode from 'vscode';
import { anonymizeText, anonymizeJson } from '@jsonos/redact-core';
import { getOptionsFromConfig } from '../diagnostics.js';

export async function redactCurrentFile(forceRedactAllValues = false): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('JSON OS Redact: No active text editor found.');
    return;
  }

  const document = editor.document;
  const originalText = document.getText();

  if (!originalText.trim()) {
    vscode.window.showInformationMessage('JSON OS Redact: Current document is empty.');
    return;
  }

  const baseOptions = getOptionsFromConfig();
  const options = forceRedactAllValues ? { ...baseOptions, redactAllValues: true } : baseOptions;

  let redactedText = '';
  let count = 0;

  const isJson = document.languageId === 'json' || document.languageId === 'jsonc';

  if (isJson || forceRedactAllValues) {
    try {
      const parsed = JSON.parse(originalText);
      const res = anonymizeJson(parsed, options);
      if (res.result !== undefined) {
        redactedText = JSON.stringify(res.result, null, 2);
        count = res.count;
      }
    } catch {
      // Fallback to text-based redaction if JSON parsing fails
      const textRes = anonymizeText(originalText, options);
      redactedText = textRes.result;
      count = textRes.count;
    }
  } else {
    const textRes = anonymizeText(originalText, options);
    redactedText = textRes.result;
    count = textRes.count;
  }

  if (count === 0) {
    vscode.window.showInformationMessage(
      forceRedactAllValues
        ? 'JSON OS Redact: No values found to redact in current file.'
        : 'JSON OS Redact: No PII or secrets detected in current file.'
    );
    return;
  }

  // Create virtual document URI for diff preview
  const originalUri = document.uri;

  // Create in-memory document with redacted content
  const redactedDoc = await vscode.workspace.openTextDocument({
    content: redactedText,
    language: document.languageId,
  });

  const labelSuffix = forceRedactAllValues ? 'ALL Values Redacted' : 'PII Redacted';
  await vscode.commands.executeCommand(
    'vscode.diff',
    originalUri,
    redactedDoc.uri,
    `JSON OS Redact Diff — ${vscode.workspace.asRelativePath(originalUri)} (${count} items | ${labelSuffix})`
  );

  // Ask for user confirmation
  const actionLabel = forceRedactAllValues ? 'Apply REDACT ALL VALUES' : 'Apply Redaction';
  const choice = await vscode.window.showInformationMessage(
    `JSON OS Redact: Replace content of ${vscode.workspace.asRelativePath(originalUri)} (${count} ${forceRedactAllValues ? 'values' : 'items'} ${forceRedactAllValues ? 'redacted/masked' : 'detected'})?`,
    { modal: true },
    actionLabel,
    'Cancel'
  );

  if (choice === actionLabel) {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(originalText.length)
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(originalUri, fullRange, redactedText);
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      vscode.window.showInformationMessage(
        `JSON OS Redact: Successfully redacted ${count} items in ${vscode.workspace.asRelativePath(originalUri)}!`
      );
    } else {
      vscode.window.showErrorMessage('JSON OS Redact: Failed to apply redaction edit.');
    }
  }
}

export async function redactAllValuesInFile(): Promise<void> {
  return redactCurrentFile(true);
}
