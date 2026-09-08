import * as vscode from "vscode";
import { SearchSidebarProvider } from "./searchProvider";
import { detectRipgrep, resetCache, ensureRipgrep } from "./ripgrep";
import { cancelSearch } from "./searchEngine";

let sidebarProvider: SearchSidebarProvider;

export function activate(context: vscode.ExtensionContext) {
  sidebarProvider = new SearchSidebarProvider(context.extensionUri);

  // Register sidebar webview
  const webviewPanel = vscode.window.registerWebviewViewProvider(
    SearchSidebarProvider.viewType,
    sidebarProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );
  context.subscriptions.push(webviewPanel);

  // Search word under cursor
  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.searchWordUnderCursor", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
      if (!wordRange) return;
      const word = editor.document.getText(wordRange);
      if (word) {
        sidebarProvider.populateFromSearch(word);
      }
    })
  );

  // Search selected text
  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.searchSelectedText", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selected = editor.document.getText(editor.selection);
      if (selected) {
        sidebarProvider.populateFromSearch(selected);
      }
    })
  );

  // Check ripgrep
  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.checkRipgrep", async () => {
      resetCache();
      const info = await detectRipgrep();
      if (info.available) {
        vscode.window.showInformationMessage(
          `ripgrep found: ${info.version}\n${info.path}`
        );
      } else {
        await ensureRipgrep();
      }
    })
  );

  // Status bar
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(search) SearchFast";
  statusBarItem.tooltip = "SearchFast Antigravity";
  statusBarItem.command = "searchfast.searchWordUnderCursor";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  cancelSearch();
}
