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
exports.RedactQuickFixProvider = void 0;
const vscode = __importStar(require("vscode"));
const redact_core_1 = require("@jsonos/redact-core");
const diagnostics_js_1 = require("./diagnostics.js");
class RedactQuickFixProvider {
    static providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
    provideCodeActions(document, range, context, _token) {
        const actions = [];
        const redactDiagnostics = context.diagnostics.filter((d) => d.source === diagnostics_js_1.DIAGNOSTIC_SOURCE);
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
    createRedactAction(document, diagnostic) {
        const action = new vscode.CodeAction('Redact this value', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const originalText = document.getText(diagnostic.range);
        const options = (0, diagnostics_js_1.getOptionsFromConfig)();
        const { result } = (0, redact_core_1.anonymizeText)(originalText, options);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, diagnostic.range, result);
        action.edit = edit;
        return action;
    }
    createIgnoreLineAction(document, diagnostic) {
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
    getCommentSyntax(languageId) {
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
exports.RedactQuickFixProvider = RedactQuickFixProvider;
//# sourceMappingURL=quickfixes.js.map