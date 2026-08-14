"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const diagnostics_js_1 = require("./diagnostics.js");
const quickfixes_js_1 = require("./quickfixes.js");
const redactFile_js_1 = require("./commands/redactFile.js");
const redactSelection_js_1 = require("./commands/redactSelection.js");
const redactProject_js_1 = require("./commands/redactProject.js");
let diagnosticCollection;
let statusBarItem;
let debounceTimeout;
function activate(context) {
    console.log('JSON OS Redact VS Code extension is active.');
    // Create namespaced DiagnosticCollection & Status Bar Item
    diagnosticCollection = vscode.languages.createDiagnosticCollection('JSON OS Redact');
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'workbench.action.problems.focus';
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(statusBarItem);
    // Register Quick Fix Provider
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new quickfixes_js_1.RedactQuickFixProvider(), { providedCodeActionKinds: quickfixes_js_1.RedactQuickFixProvider.providedCodeActionKinds }));
    // Register Commands
    context.subscriptions.push(vscode.commands.registerCommand('jsonosRedact.redactCurrentFile', () => (0, redactFile_js_1.redactCurrentFile)()));
    context.subscriptions.push(vscode.commands.registerCommand('jsonosRedact.redactAllValuesInFile', () => (0, redactFile_js_1.redactAllValuesInFile)()));
    context.subscriptions.push(vscode.commands.registerCommand('jsonosRedact.redactSelection', () => (0, redactSelection_js_1.redactSelection)()));
    context.subscriptions.push(vscode.commands.registerCommand('jsonosRedact.redactProject', () => (0, redactProject_js_1.redactProject)(context)));
    // Trigger initial scan on active editor
    if (vscode.window.activeTextEditor) {
        triggerDiagnosticsScan(vscode.window.activeTextEditor.document);
    }
    // Document Event Listeners
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => {
        triggerDiagnosticsScan(doc);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        triggerDiagnosticsScan(event.document, 400); // 400ms debounce
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            triggerDiagnosticsScan(editor.document, 0);
        }
        else {
            statusBarItem.hide();
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('jsonosRedact') && vscode.window.activeTextEditor) {
            triggerDiagnosticsScan(vscode.window.activeTextEditor.document, 0);
        }
    }));
}
function triggerDiagnosticsScan(document, delayMs = 0) {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }
    if (delayMs <= 0) {
        (0, diagnostics_js_1.updateDiagnostics)(document, diagnosticCollection, statusBarItem);
    }
    else {
        debounceTimeout = setTimeout(() => {
            (0, diagnostics_js_1.updateDiagnostics)(document, diagnosticCollection, statusBarItem);
        }, delayMs);
    }
}
function deactivate() {
    if (diagnosticCollection)
        diagnosticCollection.dispose();
    if (statusBarItem)
        statusBarItem.dispose();
}
//# sourceMappingURL=extension.js.map