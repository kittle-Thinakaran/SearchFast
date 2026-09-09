import * as vscode from "vscode";
import { join } from "path";
import {
  SearchMatch,
  SearchResultSet,
  SearchOptions,
  ReplaceOptions,
  executeSearch,
  executeReplace,
  listMatchingFiles,
  replaceSingleMatch,
  getDefaultOptions,
  cancelSearch,
} from "./searchEngine";
import { ensureRipgrep } from "./ripgrep";
import { getWebviewHtml } from "./webviewHtml";

export class SearchSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "searchfast.searchView";
  private _view?: vscode.WebviewView;
  private _matchLookup = new Map<string, SearchMatch>();
  private _metadata: SearchResultSet | null = null;
  private _searching = false;
  private _replacing = false;
  private _highlightDecoration!: vscode.TextEditorDecorationType;
  private _highlightTimeout: NodeJS.Timeout | null = null;
  private _currentPattern = "";
  private _configListener: vscode.Disposable | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
      overviewRulerColor: new vscode.ThemeColor("editor.findMatchHighlightBorder"),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "resources"),
      ],
    };

    const codiconCssUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "codicons", "codicon.css")
    );

    try {
      webviewView.webview.html = getWebviewHtml(this._readClientConfig(), {
        codiconCssUri: codiconCssUri.toString(),
        cspSource: webviewView.webview.cspSource,
      });
    } catch (err) {
      webviewView.webview.html = this._getFallbackErrorHtml(err);
      return;
    }

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this._handleMessage(msg);
      } catch (err) {
        this._post({ type: "error", message: `Unexpected error: ${describeError(err)}` });
      }
    });

    this._configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("searchfast")) {
        this._post({ type: "config", config: this._readClientConfig() });
      }
    });

    webviewView.onDidDispose(() => {
      cancelSearch();
      this._highlightDecoration.dispose();
      if (this._highlightTimeout) {
        clearTimeout(this._highlightTimeout);
      }
      this._configListener?.dispose();
      this._configListener = null;
    });
  }

  /** Puts input focus back on the search box inside the webview, if it is visible. */
  focusInput(): void {
    this._post({ type: "focus" });
  }

  async populateFromSearch(pattern: string): Promise<void> {
    if (!this._view) {
      return;
    }
    this._post({ type: "populate", pattern });
    await this._doSearch(pattern, {});
  }

  private async _handleMessage(msg: any): Promise<void> {
    if (!msg || typeof msg.type !== "string") {
      return;
    }

    switch (msg.type) {
      case "search":
        await this._doSearch(String(msg.pattern ?? ""), msg.options ?? {});
        break;

      case "cancel":
        cancelSearch();
        this._searching = false;
        this._post({ type: "searchDone", duration: 0 });
        break;

      case "clear":
        cancelSearch();
        this._matchLookup.clear();
        this._metadata = null;
        this._searching = false;
        this._post({ type: "clear" });
        break;

      case "openFile":
        this._openFile(String(msg.path ?? ""), Number(msg.line) || 1);
        break;

      case "replaceAll":
        await this._doReplace(String(msg.pattern ?? ""), String(msg.replacement ?? ""), msg.options ?? {});
        break;

      case "replaceInFile":
        await this._doReplace(String(msg.pattern ?? ""), String(msg.replacement ?? ""), msg.options ?? {}, String(
          msg.file ?? ""
        ));
        break;

      case "replaceMatch":
        await this._replaceSingle(String(msg.pattern ?? ""), String(msg.replacement ?? ""), msg.options ?? {}, msg);
        break;

      case "openShortcuts":
        await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "searchfast");
        break;

      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "searchfast");
        break;

      default:
        // Unknown message types are ignored rather than treated as errors,
        // so older/newer webview builds can coexist safely.
        break;
    }
  }

  private _readClientConfig() {
    const config = vscode.workspace.getConfiguration("searchfast");
    return {
      liveSearchDelay: clampNumber(config.get<number>("liveSearchDelay", 300), 0, 2000, 300),
      minQueryLength: clampNumber(config.get<number>("minQueryLength", 2), 1, 10, 2),
      isMac: process.platform === "darwin",
    };
  }

  private async _doSearch(pattern: string, overrides: Partial<SearchOptions>): Promise<void> {
    if (!pattern || !pattern.trim()) {
      cancelSearch();
      this._matchLookup.clear();
      this._metadata = null;
      this._searching = false;
      this._post({ type: "clear" });
      return;
    }

    const hasRg = await ensureRipgrep();
    if (!hasRg) {
      this._post({ type: "error", message: "ripgrep (rg) was not found. Install it and try again." });
      return;
    }

    cancelSearch();
    this._matchLookup.clear();
    this._metadata = null;
    this._searching = true;
    this._currentPattern = pattern;

    const opts: SearchOptions = {
      ...getDefaultOptions(),
      ...overrides,
      pattern,
    };

    const cwd = this._workspaceRoot();
    if (!cwd) {
      this._searching = false;
      this._post({ type: "error", message: "Open a folder or workspace before searching." });
      return;
    }

    let liveBuffer: SearchMatch[] = [];
    this._post({ type: "searching", pattern });

    await executeSearch(opts, cwd, (event) => {
      switch (event.type) {
        case "match": {
          this._matchLookup.set(`${event.match.file}:${event.match.line}`, event.match);
          liveBuffer.push(event.match);
          if (liveBuffer.length >= 100) {
            this._post({ type: "matches", matches: liveBuffer });
            liveBuffer = [];
          }
          break;
        }
        case "done": {
          if (liveBuffer.length > 0) {
            this._post({ type: "matches", matches: liveBuffer });
            liveBuffer = [];
          }
          this._metadata = event.result;
          this._searching = false;
          this._post({
            type: "searchDone",
            totalMatches: event.result.totalMatches,
            totalFiles: event.result.totalFiles,
            duration: event.result.duration,
            truncated: event.result.truncated,
          });
          break;
        }
        case "error": {
          this._searching = false;
          this._post({ type: "error", message: event.message });
          break;
        }
      }
    });
  }

  private async _doReplace(
    pattern: string,
    replacement: string,
    overrides: Partial<SearchOptions>,
    onlyFile?: string
  ): Promise<void> {
    if (this._replacing) {
      this._post({ type: "error", message: "A replace is already running. Please wait for it to finish." });
      return;
    }
    if (!pattern || !pattern.trim()) {
      this._post({ type: "error", message: "Enter a search term before replacing." });
      return;
    }

    const hasRg = await ensureRipgrep();
    if (!hasRg) {
      this._post({ type: "error", message: "ripgrep (rg) was not found. Install it and try again." });
      return;
    }

    const cwd = this._workspaceRoot();
    if (!cwd) {
      this._post({ type: "error", message: "Open a folder or workspace before replacing." });
      return;
    }

    const base: SearchOptions = { ...getDefaultOptions(), ...overrides, pattern };
    const replaceOptions: ReplaceOptions = {
      pattern: base.pattern,
      replacement,
      caseSensitive: base.caseSensitive,
      wholeWord: base.wholeWord,
      useRegex: base.useRegex,
      respectGitignore: base.respectGitignore,
      hiddenFiles: base.hiddenFiles,
      excludes: base.excludes,
      fileGlob: base.fileGlob,
      filesFilter: onlyFile ? [onlyFile] : undefined,
    };

    try {
      const affectedFiles = await listMatchingFiles(replaceOptions, cwd);
      if (affectedFiles.length === 0) {
        this._post({ type: "error", message: "No matches found to replace." });
        return;
      }

      const config = vscode.workspace.getConfiguration("searchfast");
      const shouldConfirm = config.get<boolean>("confirmBeforeReplace", true);

      if (shouldConfirm) {
        const fileWord = affectedFiles.length === 1 ? "file" : "files";
        const choice = await vscode.window.showWarningMessage(
          `Replace "${pattern}" with "${replacement}" across ${affectedFiles.length} ${fileWord}?`,
          { modal: true, detail: "This edits your files directly. Commit or back up your work first if you want an easy way back." },
          "Replace"
        );
        if (choice !== "Replace") {
          this._post({ type: "replaceCancelled" });
          return;
        }
      }

      this._replacing = true;
      this._post({ type: "replaceStarted", fileCount: affectedFiles.length });

      const summary = await executeReplace(replaceOptions, cwd);
      this._post({ type: "replaceDone", summary });

      // Refresh the results list so it reflects the file contents after the edit.
      await this._doSearch(pattern, overrides);
    } catch (err) {
      this._post({ type: "replaceError", message: describeError(err) });
    } finally {
      this._replacing = false;
    }
  }

  private async _replaceSingle(
    pattern: string,
    replacement: string,
    overrides: Partial<SearchOptions>,
    msg: any
  ): Promise<void> {
    if (this._replacing) {
      this._post({ type: "error", message: "A replace is already running. Please wait for it to finish." });
      return;
    }
    const filePath = String(msg.file ?? "");
    const line = Number(msg.line) || 1;
    const column = Number(msg.column) || 0;
    if (!pattern || !pattern.trim() || !filePath) {
      this._post({ type: "error", message: "Could not replace this match." });
      return;
    }

    let targetPath = filePath;
    const workspaceRoot = this._workspaceRoot();
    if (
      workspaceRoot &&
      !filePath.includes(":") &&
      !filePath.startsWith("/") &&
      !filePath.startsWith("\\\\") &&
      !filePath.startsWith(workspaceRoot)
    ) {
      targetPath = join(workspaceRoot, filePath);
    }

    const base: SearchOptions = { ...getDefaultOptions(), ...overrides, pattern };
    this._replacing = true;
    try {
      this._post({ type: "replaceStarted", fileCount: 1 });
      const result = await replaceSingleMatch({
        filePath: targetPath,
        line,
        column,
        pattern: base.pattern,
        replacement,
        caseSensitive: base.caseSensitive,
        wholeWord: base.wholeWord,
        useRegex: base.useRegex,
      });

      if (result.error) {
        this._post({ type: "replaceError", message: `Replace failed: ${result.error}` });
      } else if (!result.replaced) {
        this._post({ type: "error", message: "No match was found to replace." });
      } else {
        this._post({
          type: "replaceDone",
          summary: {
            filesChanged: 1,
            totalReplacements: 1,
            results: [{ file: targetPath, replacements: 1 }],
          },
        });
        await this._doSearch(pattern, overrides);
      }
    } catch (err) {
      this._post({ type: "replaceError", message: describeError(err) });
    } finally {
      this._replacing = false;
    }
  }

  private _workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private _openFile(filePath: string, line: number): void {
    if (!filePath) {
      return;
    }

    let targetPath = filePath;
    const workspaceRoot = this._workspaceRoot();

    if (
      workspaceRoot &&
      !filePath.includes(":") &&
      !filePath.startsWith("/") &&
      !filePath.startsWith("\\\\") &&
      !filePath.startsWith(workspaceRoot)
    ) {
      targetPath = join(workspaceRoot, filePath);
    }

    const uri = vscode.Uri.file(targetPath);
    vscode.workspace.openTextDocument(uri).then(
      (doc) => {
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One).then(
          (editor) => {
            try {
              this._revealMatch(editor, doc, filePath, line);
            } catch (err) {
              // Navigation is a nice-to-have; failing to highlight the exact
              // match shouldn't be treated as a hard error.
              console.error("SearchFast: could not highlight match", err);
            }
          },
          (err) => {
            vscode.window.showErrorMessage(`SearchFast: could not open "${targetPath}": ${describeError(err)}`);
          }
        );
      },
      (err) => {
        vscode.window.showErrorMessage(`SearchFast: could not open "${targetPath}": ${describeError(err)}`);
      }
    );
  }

  private _revealMatch(editor: vscode.TextEditor, doc: vscode.TextDocument, filePath: string, line: number): void {
    const lineIdx = Math.max(0, Math.min(line - 1, doc.lineCount - 1));
    const lineText = doc.lineAt(lineIdx).text;

    const matchObj = this._matchLookup.get(`${filePath}:${line}`);
    let highlightRange: vscode.Range | null = null;

    if (matchObj) {
      const startCol = matchObj.column;
      if (startCol >= 0 && startCol < lineText.length) {
        const slice = lineText.slice(startCol, startCol + this._currentPattern.length);
        let endCol = startCol + this._currentPattern.length;
        if (
          this._currentPattern &&
          slice.toLowerCase().startsWith(this._currentPattern.toLowerCase().slice(0, slice.length))
        ) {
          endCol = startCol + slice.length;
        }
        highlightRange = new vscode.Range(lineIdx, startCol, lineIdx, endCol);
      }
    }

    if (!highlightRange && this._currentPattern) {
      const searchIdx = lineText.toLowerCase().indexOf(this._currentPattern.toLowerCase());
      if (searchIdx >= 0) {
        highlightRange = new vscode.Range(lineIdx, searchIdx, lineIdx, searchIdx + this._currentPattern.length);
      }
    }

    if (highlightRange) {
      editor.selection = new vscode.Selection(highlightRange.start, highlightRange.end);
      editor.revealRange(highlightRange, vscode.TextEditorRevealType.InCenter);
      editor.setDecorations(this._highlightDecoration, [highlightRange]);

      if (this._highlightTimeout) {
        clearTimeout(this._highlightTimeout);
      }
      this._highlightTimeout = setTimeout(() => {
        editor.setDecorations(this._highlightDecoration, []);
      }, 2000);
    } else {
      const startPos = new vscode.Position(lineIdx, 0);
      const endPos = new vscode.Position(lineIdx, lineText.length);
      editor.selection = new vscode.Selection(startPos, endPos);
      editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
    }
  }

  private _post(msg: any): void {
    try {
      this._view?.webview.postMessage(msg);
    } catch {
      // The view may have just been disposed; there is nothing to recover.
    }
  }

  private _getFallbackErrorHtml(err: unknown): string {
    const message = describeError(err).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">
      <h3>SearchFast failed to load</h3>
      <p>${message}</p>
      <p>Try reloading the window (Developer: Reload Window).</p>
    </body></html>`;
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
