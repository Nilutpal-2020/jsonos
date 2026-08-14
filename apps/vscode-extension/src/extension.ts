import * as vscode from 'vscode';
import { updateDiagnostics } from './diagnostics.js';
import { RedactQuickFixProvider } from './quickfixes.js';
import { redactCurrentFile, redactAllValuesInFile } from './commands/redactFile.js';
import { redactSelection } from './commands/redactSelection.js';
import { redactProject } from './commands/redactProject.js';

let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let debounceTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('JSON OS Redact VS Code extension is active.');

  // Create namespaced DiagnosticCollection & Status Bar Item
  diagnosticCollection = vscode.languages.createDiagnosticCollection('JSON OS Redact');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'workbench.action.problems.focus';

  context.subscriptions.push(diagnosticCollection);
  context.subscriptions.push(statusBarItem);

  // Register Quick Fix Provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      new RedactQuickFixProvider(),
      { providedCodeActionKinds: RedactQuickFixProvider.providedCodeActionKinds }
    )
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonosRedact.redactCurrentFile', () => redactCurrentFile())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonosRedact.redactAllValuesInFile', () => redactAllValuesInFile())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonosRedact.redactSelection', () => redactSelection())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('jsonosRedact.redactProject', () => redactProject(context))
  );

  // Trigger initial scan on active editor
  if (vscode.window.activeTextEditor) {
    triggerDiagnosticsScan(vscode.window.activeTextEditor.document);
  }

  // Document Event Listeners
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      triggerDiagnosticsScan(doc);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      triggerDiagnosticsScan(event.document, 400); // 400ms debounce
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        triggerDiagnosticsScan(editor.document, 0);
      } else {
        statusBarItem.hide();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('jsonosRedact') && vscode.window.activeTextEditor) {
        triggerDiagnosticsScan(vscode.window.activeTextEditor.document, 0);
      }
    })
  );
}

function triggerDiagnosticsScan(document: vscode.TextDocument, delayMs = 0): void {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }

  if (delayMs <= 0) {
    updateDiagnostics(document, diagnosticCollection, statusBarItem);
  } else {
    debounceTimeout = setTimeout(() => {
      updateDiagnostics(document, diagnosticCollection, statusBarItem);
    }, delayMs);
  }
}

export function deactivate(): void {
  if (diagnosticCollection) diagnosticCollection.dispose();
  if (statusBarItem) statusBarItem.dispose();
}
