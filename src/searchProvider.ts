import * as vscode from "vscode";
import { join } from "path";
import {
  SearchMatch,
  SearchResultSet,
  SearchOptions,
  executeSearch,
  getDefaultOptions,
  cancelSearch,
} from "./searchEngine";
import { ensureRipgrep } from "./ripgrep";

export class SearchSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "searchfast.searchView";
  private _view?: vscode.WebviewView;
  private _allMatches: SearchMatch[] = [];
  private _metadata: SearchResultSet | null = null;
  private _searching = false;
  private _highlightDecoration!: vscode.TextEditorDecorationType;
  private _highlightTimeout: NodeJS.Timeout | null = null;
  private _currentPattern = "";

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor(
        "editor.findMatchHighlightBackground"
      ),
      overviewRulerColor: new vscode.ThemeColor(
        "editor.findMatchHighlightBorder"
      ),
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
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "search":
          await this._doSearch(msg.pattern, msg.options);
          break;
        case "cancel":
          cancelSearch();
          this._searching = false;
          this._post({ type: "searchDone", duration: 0 });
          break;
        case "clear":
          cancelSearch();
          this._allMatches = [];
          this._metadata = null;
          this._searching = false;
          this._post({ type: "clear" });
          break;
        case "openFile":
          this._openFile(msg.path, msg.line);
          break;      }
    });

    webviewView.onDidDispose(() => {
      cancelSearch();
      this._highlightDecoration.dispose();
      if (this._highlightTimeout) {
        clearTimeout(this._highlightTimeout);
      }
    });
  }

  populateFromSearch(pattern: string): void {
    if (this._view) {
      this._post({ type: "populate", pattern });
      this._doSearch(pattern, {});
    }
  }

  private async _doSearch(
    pattern: string,
    overrides: Partial<SearchOptions>
  ): Promise<void> {
    if (!pattern) return;
    const hasRg = await ensureRipgrep();
    if (!hasRg) {
      this._post({ type: "error", message: "ripgrep not found" });
      return;
    }

    cancelSearch();
    this._allMatches = [];
    this._metadata = null;
    this._searching = true;
    this._currentPattern = pattern;

    const opts: SearchOptions = {
      ...getDefaultOptions(),
      ...overrides,
      pattern,
    };

    const cwd =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    const startTime = Date.now();
    let liveBuffer: SearchMatch[] = [];

    this._post({ type: "searching", pattern });

    executeSearch(opts, cwd, (event) => {
      switch (event.type) {
        case "match": {
          this._allMatches.push(event.match);
          liveBuffer.push(event.match);
          // send in batches of 30 for performance
          if (liveBuffer.length >= 30) {
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

  private _openFile(filePath: string, line: number): void {
    let targetPath = filePath;
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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
            const lineIdx = Math.max(0, line - 1);
            const lineText = doc.lineAt(lineIdx).text;

            // Find the exact match for this file + line
            const matchObj = this._allMatches.find(
              (m) => m.file === filePath && m.line === line
            );

            let highlightRange: vscode.Range | null = null;

            if (matchObj) {
              let startCol = matchObj.column;
              let endCol = startCol + this._currentPattern.length;

              // rg column may be 0-based byte offset; ensure it's valid
              if (
                startCol >= 0 &&
                startCol < lineText.length
              ) {
                // If byte vs char mismatch, fall back to matching the
                // substring around the reported offset.
                const slice = lineText
                  .slice(startCol, startCol + this._currentPattern.length);
                if (
                  this._currentPattern &&
                  slice.toLowerCase().startsWith(
                    this._currentPattern.toLowerCase().slice(0, slice.length)
                  )
                ) {
                  endCol = startCol + slice.length;
                }
                highlightRange = new vscode.Range(
                  lineIdx,
                  startCol,
                  lineIdx,
                  endCol
                );
              }
            }

            // Fallback: search the pattern within the line
            if (!highlightRange && this._currentPattern) {
              const searchIdx = lineText
                .toLowerCase()
                .indexOf(this._currentPattern.toLowerCase());
              if (searchIdx >= 0) {
                highlightRange = new vscode.Range(
                  lineIdx,
                  searchIdx,
                  lineIdx,
                  searchIdx + this._currentPattern.length
                );
              }
            }

            if (highlightRange) {
              editor.selection = new vscode.Selection(
                highlightRange.start,
                highlightRange.end
              );
              editor.revealRange(
                highlightRange,
                vscode.TextEditorRevealType.InCenter
              );

              editor.setDecorations(this._highlightDecoration, [
                highlightRange,
              ]);

              if (this._highlightTimeout) {
                clearTimeout(this._highlightTimeout);
              }
              this._highlightTimeout = setTimeout(() => {
                editor.setDecorations(this._highlightDecoration, []);
              }, 2000);
            } else {
              const startPos = new vscode.Position(lineIdx, 0);
              const endPos = new vscode.Position(
                lineIdx,
                lineText.length
              );
              editor.selection = new vscode.Selection(startPos, endPos);
              editor.revealRange(
                new vscode.Range(startPos, endPos),
                vscode.TextEditorRevealType.InCenter
              );
            }
          },
          (err) => {
            vscode.window.showErrorMessage(`SearchFast: ${err.message}`);
          }
        );
      },
      (err) => {
        vscode.window.showErrorMessage(
          `SearchFast: Could not open "${targetPath}"\n${err.message}`
        );
      }
    );
  }

  private _post(msg: any): void {
    this._view?.webview.postMessage(msg);
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  :root {
    --bg: var(--vscode-sideBar-background);
    --bg-input: var(--vscode-input-background);
    --bg-input-hover: var(--vscode-input-hoverBackground);
    --bg-active: var(--vscode-inputOption-activeBackground);
    --border: var(--vscode-input-border, #3c3c3c);
    --border-focus: var(--vscode-focusBorder);
    --text: var(--vscode-sideBar-foreground);
    --text-dim: var(--vscode-descriptionForeground);
    --text-input: var(--vscode-input-foreground);
    --accent: var(--vscode-textLink-foreground);
    --highlight-bg: #e2c08d33;
    --highlight-text: #e2c08d;
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
    --match-bg: var(--vscode-editor-findMatchHighlightBackground);
    --file-fg: var(--vscode-descriptionForeground);
    --separator: var(--vscode-widget-border);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--text);
    padding: 0;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Search controls */
  .search-bar {
    padding: 8px 10px 4px 10px;
    flex-shrink: 0;
  }
  .input-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .input-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }
  .input-wrapper input {
    width: 100%;
    background: var(--bg-input);
    color: var(--text-input);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 28px 4px 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    outline: none;
  }
  .input-wrapper input:focus {
    border-color: var(--border-focus);
  }
  .clear-btn {
    position: absolute;
    right: 4px;
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    line-height: 1;
    border-radius: 3px;
  }
  .clear-btn:hover { background: var(--bg-input-hover); color: var(--text); }

  .search-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 3px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    height: 26px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .search-btn:hover { opacity: 0.85; }
  .search-btn:disabled { opacity: 0.4; cursor: default; }

  /* Toggle buttons row */
  .toggles-row {
    display: flex;
    gap: 2px;
    margin-top: 6px;
    flex-wrap: wrap;
  }
  .toggle-btn {
    background: var(--bg-input);
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 7px;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    user-select: none;
    white-space: nowrap;
  }
  .toggle-btn:hover { background: var(--bg-input-hover); color: var(--text); }
  .toggle-btn.active {
    background: var(--bg-active);
    color: var(--text);
    border-color: var(--accent);
  }

  /* Expandable options */
  .expand-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 3px;
    font-family: var(--vscode-font-family);
  }
  .expand-btn:hover { color: var(--text); background: var(--bg-input-hover); }

  .advanced-options {
    display: none;
    margin-top: 6px;
    padding: 6px 0;
    gap: 6px;
    flex-direction: column;
  }
  .advanced-options.visible { display: flex; }
  .option-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .option-label {
    font-size: 11px;
    color: var(--text-dim);
    min-width: 52px;
    text-align: right;
    flex-shrink: 0;
  }
  .option-input {
    flex: 1;
    background: var(--bg-input);
    color: var(--text-input);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 6px;
    font-family: var(--vscode-font-family);
    font-size: 11px;
    outline: none;
  }
  .option-input:focus { border-color: var(--border-focus); }

  /* Separator */
  .sep {
    height: 1px;
    background: var(--separator);
    margin: 6px 10px;
    flex-shrink: 0;
  }

  /* Status bar */
  .status-bar {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status-bar .spinner {
    display: inline-block;
    width: 12px; height: 12px;
    border: 2px solid var(--text-dim);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status-bar .count { color: var(--accent); font-weight: 600; }

  /* Results */
  .results {
    flex: 1;
    overflow-y: auto;
    padding: 0 0 10px 0;
  }
  .no-results-msg {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-dim);
    font-size: 13px;
  }

  .file-group { }
  .file-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
    color: var(--file-fg);
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 1;
    border-bottom: 1px solid var(--separator);
  }
  .file-header:hover { background: var(--bg-input-hover); }
  .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .file-count {
    background: var(--badge-bg);
    color: var(--badge-fg);
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .match-line {
    display: flex;
    align-items: stretch;
    cursor: pointer;
    border-bottom: 1px solid transparent;
  }
  .match-line:hover { background: var(--bg-input-hover); }
  .line-num {
    min-width: 42px;
    padding: 2px 6px;
    text-align: right;
    color: var(--text-dim);
    font-size: 11px;
    user-select: none;
    flex-shrink: 0;
    font-family: var(--vscode-font-family);
  }
  .line-text {
    flex: 1;
    padding: 2px 8px 2px 4px;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    line-height: 20px;
  }
  .highlight {
    background: var(--match-bg);
    color: var(--highlight-text);
    border-radius: 2px;
    padding: 0 1px;
  }

  /* Loading skeleton */
  .loading-line {
    height: 18px;
    margin: 3px 10px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--bg-input) 25%, var(--bg-input-hover) 50%, var(--bg-input) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
  @keyframes shimmer { to { background-position: -200% 0; } }
</style>
</head>
<body>

<div class="search-bar">
  <div class="input-row">
    <div class="input-wrapper">
      <input type="text" id="searchInput" placeholder="Search..." autocomplete="off" spellcheck="false" />
      <button class="clear-btn" id="clearInput" title="Clear">&times;</button>
    </div>
    <button class="search-btn" id="searchBtn" title="Search (Enter)">
      <span>&#128269;</span>
    </button>
  </div>

  <div class="toggles-row">
    <button class="toggle-btn" id="toggleRegex" data-key="useRegex" title="Regex (Alt+R)">.*</button>
    <button class="toggle-btn" id="toggleCase" data-key="caseSensitive" title="Match Case (Alt+C)">Aa</button>
    <button class="toggle-btn" id="toggleWord" data-key="wholeWord" title="Whole Word (Alt+W)">ab</button>
    <button class="expand-btn" id="expandAdvanced">&#9660; Filters</button>
  </div>

  <div class="advanced-options" id="advancedOptions">
    <div class="option-row">
      <span class="option-label">Files</span>
      <input class="option-input" id="inputFiles" placeholder="e.g. *.ts, *.{js,ts}" spellcheck="false" />
    </div>
    <div class="option-row">
      <span class="option-label">Exclude</span>
      <input class="option-input" id="inputExcludes" placeholder="e.g. *.test.*, dist/**" spellcheck="false" />
    </div>
    <div class="option-row">
      <span class="option-label">Context</span>
      <input class="option-input" id="inputContext" type="number" value="0" min="0" max="10" style="width:50px;flex:none" />
    </div>
  </div>
</div>

<div class="sep"></div>
<div class="status-bar" id="statusBar"></div>
<div class="results" id="results"></div>

<script>
(function() {
  const vscode = acquireVsCodeApi();

  const $ = id => document.getElementById(id);
  const searchInput  = $('searchInput');
  const searchBtn    = $('searchBtn');
  const clearInput   = $('clearInput');
  const statusBar    = $('statusBar');
  const resultsDiv   = $('results');
  const advancedOpts = $('advancedOptions');
  const expandBtn    = $('expandAdvanced');
  const inputFiles   = $('inputFiles');
  const inputExcludes = $('inputExcludes');
  const inputContext = $('inputContext');

  // State
  const state = { useRegex: false, caseSensitive: false, wholeWord: false };
  const pendingMatches = [];
  const fileMap = new Map();

  // Toggle buttons
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      state[key] = !state[key];
      btn.classList.toggle('active', state[key]);
    });
  });

  // Keyboard shortcut hints
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'r') { e.preventDefault(); $('toggleRegex').click(); }
    if (e.altKey && e.key === 'c') { e.preventDefault(); $('toggleCase').click(); }
    if (e.altKey && e.key === 'w') { e.preventDefault(); $('toggleWord').click(); }
  });

  // Expand advanced
  expandBtn.addEventListener('click', () => {
    advancedOpts.classList.toggle('visible');
    expandBtn.textContent = advancedOpts.classList.contains('visible') ? '▲ Filters' : '▼ Filters';
  });

  // Clear input
  clearInput.addEventListener('click', () => {
    searchInput.value = '';
    vscode.postMessage({ type: 'clear' });
    fileMap.clear();
    resultsDiv.innerHTML = '';
    statusBar.innerHTML = '';
    searchInput.focus();
  });

  // Search
  function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    fileMap.clear();
    resultsDiv.innerHTML = '';
    const files = inputFiles.value.trim();
    const excludes = inputExcludes.value.trim().split(',').map(s=>s.trim()).filter(Boolean);
    const ctx = parseInt(inputContext.value, 10) || 0;
    vscode.postMessage({
      type: 'search',
      pattern: q,
      options: {
        useRegex: state.useRegex,
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        fileGlob: files,
        excludes: excludes,
        contextLines: ctx
      }
    });
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
  searchInput.focus();

  // Escape to cancel
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      vscode.postMessage({ type: 'cancel' });
    }
  });

  // Open file on click (delegated click handling)
  resultsDiv.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const el = target.closest('[data-path]');
    if (!el) return;
    const path = el.getAttribute('data-path');
    const line = parseInt(el.getAttribute('data-line') || '1', 10) || 1;
    if (path) {
      vscode.postMessage({ type: 'openFile', path, line });
    }
  });

  // Messages from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {
      case 'populate':
        searchInput.value = msg.pattern;
        break;
      case 'searching':
        statusBar.innerHTML = '<span class="spinner"></span> Searching...';
        resultsDiv.innerHTML = '';
        fileMap.clear();
        break;
      case 'matches': {
        for (const m of msg.matches) {
          let fileMatches = fileMap.get(m.file);
          if (!fileMatches) {
            fileMatches = [];
            fileMap.set(m.file, fileMatches);
          }
          fileMatches.push(m);
        }
        renderResults();
        break;
      }
      case 'searchDone': {
        const parts = [];
        if (msg.totalMatches !== undefined) parts.push('<span class="count">' + msg.totalMatches + '</span> matches');
        if (msg.totalFiles !== undefined) parts.push(msg.totalFiles + ' files');
        if (msg.duration !== undefined) parts.push(msg.duration + 'ms');
        if (msg.truncated) parts.push('<span style="color:var(--vscode-charts-red)">TRUNCATED</span>');
        statusBar.innerHTML = parts.join(' &middot; ');
        searchBtn.disabled = false;
        break;
      }
      case 'error':
        statusBar.innerHTML = '<span style="color:var(--vscode-errorForeground)">' + msg.message + '</span>';
        searchBtn.disabled = false;
        break;
      case 'clear':
        statusBar.innerHTML = '';
        resultsDiv.innerHTML = '';
        fileMap.clear();
        break;
    }
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderResults() {
    const query = searchInput.value.trim();
    let regex;
    try { regex = new RegExp(query.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&'), 'gi'); }
    catch { regex = new RegExp('^\\\\b__none__\\\\b$'); }

    const fileGroups = [];
    for (const [file, matches] of fileMap) {
      const shortName = file.split(/[/\\\\]/).pop() || file;
      fileGroups.push({ file, shortName, matches });
    }

    let html = '';
    for (const group of fileGroups) {
      html += '<div class="file-group">';
      html += '<div class="file-header" data-path="' + escapeHtml(group.file) + '" data-line="1" title="' + escapeHtml(group.file) + '">';
      html += '<span class="file-name">' + escapeHtml(group.shortName) + '</span>';
      html += '<span class="file-count">' + group.matches.length + '</span>';
      html += '</div>';
      for (const m of group.matches) {
        let highlighted = escapeHtml(m.text);
        if (query) {
          highlighted = highlighted.replace(regex, '<span class="highlight">\\$1</span>');
        }
        html += '<div class="match-line" data-path="' + escapeHtml(m.file) + '" data-line="' + m.line + '">';
        html += '<span class="line-num">' + m.line + '</span>';
        html += '<span class="line-text">' + highlighted + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    if (fileMap.size === 0 && statusBar.innerHTML) {
      html = '<div class="no-results-msg">No results found</div>';
    }
    resultsDiv.innerHTML = html;
  }
})();
</script>
</body>
</html>`;
  }
}
