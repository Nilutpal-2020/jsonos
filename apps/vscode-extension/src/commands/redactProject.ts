import * as vscode from 'vscode';
import { anonymizeText } from '@jsonos/redact-core';
import { getOptionsFromConfig } from '../diagnostics.js';
import { createProjectReportWebview, FileScanResult } from '../webview/projectReportWebview.js';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export async function redactProject(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('JSON OS Redact: No workspace folder open.');
    return;
  }

  const config = vscode.workspace.getConfiguration('jsonosRedact');
  const excludeGlobs = config.get<string[]>('excludeGlobs', []);

  const defaultExcludes = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.lock',
    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.ico',
    '**/*.pdf',
    '**/*.zip',
    '**/*.tar',
    '**/*.gz',
    '**/*.mp4',
    '**/*.mp3',
    '**/*.woff',
    '**/*.woff2',
    '**/*.ttf',
    '**/*.eot',
    ...excludeGlobs,
  ];

  const excludePattern = `{${defaultExcludes.join(',')}}`;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'JSON OS Redact: Scanning workspace files for PII & secrets...',
      cancellable: true,
    },
    async (progress, token) => {
      const files = await vscode.workspace.findFiles('**/*', excludePattern, 1000, token);
      const options = getOptionsFromConfig();
      const scanResults: FileScanResult[] = [];

      for (let i = 0; i < files.length; i++) {
        if (token.isCancellationRequested) break;
        const uri = files[i];
        progress.report({
          message: `${i + 1}/${files.length} (${vscode.workspace.asRelativePath(uri)})`,
          increment: (1 / files.length) * 100,
        });

        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > MAX_FILE_SIZE_BYTES) continue;

          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          if (!text || !text.trim()) continue;

          const { result, count, matches } = anonymizeText(text, options);
          if (count > 0 && matches.length > 0) {
            scanResults.push({
              uri,
              relativePath: vscode.workspace.asRelativePath(uri),
              count,
              matches,
              redactedText: result,
            });
          }
        } catch {
          // Skip unreadable / binary files gracefully
        }
      }

      if (scanResults.length === 0) {
        vscode.window.showInformationMessage('JSON OS Redact: No PII or secrets found across workspace files.');
        return;
      }

      // Open Webview report for interactive batch review
      createProjectReportWebview(context.extensionUri, scanResults, async (selectedUris) => {
        if (selectedUris.length === 0) return;

        const edit = new vscode.WorkspaceEdit();
        const resultsMap = new Map(scanResults.map((r) => [r.uri.toString(), r]));

        for (const uri of selectedUris) {
          const res = resultsMap.get(uri.toString());
          if (res) {
            const doc = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
            edit.replace(uri, fullRange, res.redactedText);
          }
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
          // Save modified files
          for (const uri of selectedUris) {
            const doc = await vscode.workspace.openTextDocument(uri);
            await doc.save();
          }
          vscode.window.showInformationMessage(
            `JSON OS Redact: Batch redaction complete! Redacted ${selectedUris.length} ${selectedUris.length === 1 ? 'file' : 'files'}.`
          );
        } else {
          vscode.window.showErrorMessage('JSON OS Redact: Failed to apply batch redactions.');
        }
      });
    }
  );
}
