import * as vscode from 'vscode';
import { anonymizeText } from '@jsonos/redact-core';
import { getOptionsFromConfig } from '../diagnostics.js';

export async function redactSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('JSON OS Redact: No active text editor found.');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('JSON OS Redact: Please select text to redact.');
    return;
  }

  const selectedText = editor.document.getText(selection);
  const options = getOptionsFromConfig();
  const { result, count } = anonymizeText(selectedText, options);

  if (count === 0) {
    vscode.window.showInformationMessage('JSON OS Redact: No PII or secrets detected in selected text.');
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `JSON OS Redact: Redact selection (${count} ${count === 1 ? 'item' : 'items'} found)?`,
    'Redact',
    'Cancel'
  );

  if (choice === 'Redact') {
    await editor.edit((editBuilder) => {
      editBuilder.replace(selection, result);
    });
    vscode.window.showInformationMessage(`JSON OS Redact: Redacted selection (${count} items removed).`);
  }
}
