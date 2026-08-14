import * as vscode from 'vscode';
import { anonymizeText } from '@jsonos/redact-core';
import { DIAGNOSTIC_SOURCE, getOptionsFromConfig } from './diagnostics.js';

export class RedactQuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    const redactDiagnostics = context.diagnostics.filter((d) => d.source === DIAGNOSTIC_SOURCE);

    for (const diagnostic of redactDiagnostics) {
      // 1. Quick Fix: Redact this value
      const redactAction = this.createRedactAction(document, diagnostic);
      actions.push(redactAction);

      // 2. Quick Fix: Ignore this line
      const ignoreAction = this.createIgnoreLineAction(document, diagnostic);
      actions.push(ignoreAction);
    }

    return actions;
  }

  private createRedactAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction('Redact this value', vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const originalText = document.getText(diagnostic.range);
    const options = getOptionsFromConfig();
    const { result } = anonymizeText(originalText, options);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, diagnostic.range, result);
    action.edit = edit;

    return action;
  }

  private createIgnoreLineAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction('Ignore this line (add // redact-ignore)', vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];

    const line = document.lineAt(diagnostic.range.start.line);
    const commentPrefix = this.getCommentSyntax(document.languageId);
    const ignoreComment = `${commentPrefix} redact-ignore`;

    const edit = new vscode.WorkspaceEdit();
    const lineEndPosition = line.range.end;
    edit.insert(document.uri, lineEndPosition, ignoreComment);
    action.edit = edit;

    return action;
  }

  private getCommentSyntax(languageId: string): string {
    switch (languageId) {
      case 'python':
      case 'shellscript':
      case 'yaml':
      case 'dockerfile':
      case 'r':
      case 'perl':
      case 'makefile':
        return ' #';
      case 'clojure':
      case 'lisp':
        return ' ;';
      case 'sql':
      case 'lua':
        return ' --';
      default:
        return ' //';
    }
  }
}
