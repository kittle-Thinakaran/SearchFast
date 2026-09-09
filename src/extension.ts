import * as vscode from "vscode";
import { SearchSidebarProvider } from "./searchProvider";
import { detectRipgrep, resetCache, ensureRipgrep } from "./ripgrep";
import { cancelSearch } from "./searchEngine";

let sidebarProvider: SearchSidebarProvider;

export function activate(context: vscode.ExtensionContext) {
  sidebarProvider = new SearchSidebarProvider(context.extensionUri);

  const webviewPanel = vscode.window.registerWebviewViewProvider(
    SearchSidebarProvider.viewType,
    sidebarProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );
  context.subscriptions.push(webviewPanel);

  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.searchWordUnderCursor", async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("Open a file first, then place your cursor on a word to search for it.");
          return;
        }
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
        if (!wordRange) {
          vscode.window.showInformationMessage("There's no word under the cursor to search for.");
          return;
        }
        const word = editor.document.getText(wordRange);
        if (word) {
          await sidebarProvider.populateFromSearch(word);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`SearchFast: ${describeError(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.searchSelectedText", async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("Open a file and select some text first.");
          return;
        }
        const selected = editor.document.getText(editor.selection);
        if (!selected.trim()) {
          vscode.window.showInformationMessage("Select some text first, then try again.");
          return;
        }
        await sidebarProvider.populateFromSearch(selected);
      } catch (err) {
        vscode.window.showErrorMessage(`SearchFast: ${describeError(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.checkRipgrep", async () => {
      try {
        resetCache();
        const info = await detectRipgrep();
        if (info.available) {
          vscode.window.showInformationMessage(`ripgrep found (${info.version}) at ${info.path}`);
        } else {
          await ensureRipgrep();
        }
      } catch (err) {
        vscode.window.showErrorMessage(`SearchFast: ${describeError(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.focusSearchInput", async () => {
      try {
        await vscode.commands.executeCommand("searchfast.searchView.focus");
        sidebarProvider.focusInput();
      } catch (err) {
        vscode.window.showErrorMessage(`SearchFast: ${describeError(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("searchfast.changeShortcuts", async () => {
      try {
        await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "searchfast");
      } catch (err) {
        vscode.window.showErrorMessage(`SearchFast: ${describeError(err)}`);
      }
    })
  );

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(search) SearchFast";
  statusBarItem.tooltip = "Open SearchFast and search this workspace";
  statusBarItem.command = "searchfast.focusSearchInput";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  try {
    cancelSearch();
  } catch {
    // Best-effort cleanup during shutdown; nothing more we can do here.
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
