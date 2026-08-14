import * as vscode from 'vscode';
import { anonymizeText, AnonymizeOptions } from '@jsonos/redact-core';

export const DIAGNOSTIC_SOURCE = 'JSON OS Redact';
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB safety limit

export function getOptionsFromConfig(): AnonymizeOptions {
  const config = vscode.workspace.getConfiguration('jsonosRedact');
  return {
    mode: config.get<'redact' | 'mask' | 'hash'>('mode', 'redact'),
    maskEmails: config.get<boolean>('maskEmails', true),
    maskSecrets: config.get<boolean>('maskSecrets', true),
    maskPrices: config.get<boolean>('maskPrices', true),
    maskCards: config.get<boolean>('maskCards', true),
    maskIps: config.get<boolean>('maskIps', true),
    maskUrls: config.get<boolean>('maskUrls', true),
    maskPhones: config.get<boolean>('maskPhones', false),
    maskNames: config.get<boolean>('maskNames', false),
    redactAllValues: config.get<boolean>('redactAllValues', false),
  };
}

export function isExcludedFile(document: vscode.TextDocument): boolean {
  if (document.isUntitled) return false;
  const config = vscode.workspace.getConfiguration('jsonosRedact');
  const excludeGlobs = config.get<string[]>('excludeGlobs', []);
  const relativePath = vscode.workspace.asRelativePath(document.uri);

  for (const pattern of excludeGlobs) {
    if (relativePath.includes(pattern.replace(/\*/g, ''))) return true;
  }
  return false;
}

export function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  statusBarItem: vscode.StatusBarItem
): void {
  if (!document || isExcludedFile(document)) {
    collection.delete(document.uri);
    return;
  }

  const config = vscode.workspace.getConfiguration('jsonosRedact');
  const liveEnabled = config.get<boolean>('liveSuggestions', true);

  if (!liveEnabled) {
    collection.delete(document.uri);
    statusBarItem.hide();
    return;
  }

  const text = document.getText();
  if (text.length > MAX_FILE_SIZE_BYTES) {
    collection.delete(document.uri);
    return;
  }

  const options = getOptionsFromConfig();
  const { matches } = anonymizeText(text, options);

  const diagnostics: vscode.Diagnostic[] = [];

  for (const match of matches) {
    const startPos = document.positionAt(match.start);
    const endPos = document.positionAt(match.end);

    // Ignore lines that contain trailing or inline 'redact-ignore' comments
    const lineText = document.lineAt(startPos.line).text;
    if (lineText.includes('redact-ignore')) continue;

    const range = new vscode.Range(startPos, endPos);
    const message = `Possible ${match.type} detected — consider redacting before sharing.`;

    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    diag.source = DIAGNOSTIC_SOURCE;
    diag.code = match.type;

    diagnostics.push(diag);
  }

  collection.set(document.uri, diagnostics);

  // Update Status Bar Item
  if (vscode.window.activeTextEditor?.document === document) {
    const count = diagnostics.length;
    if (count > 0) {
      statusBarItem.text = `$(warning) ${count} ${count === 1 ? 'PII match' : 'PII matches'}`;
      statusBarItem.tooltip = `JSON OS Redact: ${count} sensitive ${count === 1 ? 'item' : 'items'} found in active file. Click to view Problems.`;
      statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      statusBarItem.show();
    } else {
      statusBarItem.text = `$(shield) 0 PII`;
      statusBarItem.tooltip = 'JSON OS Redact: Clean active file (no PII matches).';
      statusBarItem.color = undefined;
      statusBarItem.show();
    }
  }
}
