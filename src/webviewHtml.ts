export interface ClientConfig {
  liveSearchDelay: number;
  minQueryLength: number;
  isMac: boolean;
}

export interface WebviewAssets {
  /** Webview URI of resources/codicons/codicon.css. */
  codiconCssUri: string;
  /** Value from webview.cspSource, used to allow the codicon stylesheet + font. */
  cspSource: string;
}

/**
 * Builds the full HTML document rendered inside the SearchFast sidebar webview.
 * Kept in its own module so the provider file stays focused on VS Code wiring.
 */
export function getWebviewHtml(config: ClientConfig, assets: WebviewAssets): string {
  const modKey = config.isMac ? "Cmd" : "Ctrl";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${assets.cspSource} 'unsafe-inline'; font-src ${assets.cspSource}; script-src 'unsafe-inline';" />
<title>SearchFast</title>
<link rel="stylesheet" href="${assets.codiconCssUri}" />
<style>
${CSS}
</style>
</head>
<body>
  ${BODY}
<script>
  window.__SEARCHFAST_CONFIG__ = ${JSON.stringify(config)};
  window.__SEARCHFAST_MOD_KEY__ = ${JSON.stringify(modKey)};
</script>
<script>
${CLIENT_SCRIPT}
</script>
</body>
</html>`;
}

const ICONS = {
  search: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.4"/><line x1="10.1" y1="10.1" x2="14" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  close: `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  chevronDown: `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 6L8 10.5L12.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevronRight: `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  replace: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 6.5H11.5L9 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 9.5H4.5L7 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  gear: `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.2"/><path d="M8 2v1.4M8 12.6V14M14 8h-1.4M3.4 8H2M12.1 3.9l-1 1M4.9 11.1l-1 1M12.1 12.1l-1-1M4.9 4.9l-1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  keyboard: `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="4" width="13" height="8" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M4 6.5h0M6.5 6.5h0M9 6.5h0M11.5 6.5h0M4.5 9.5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

const BODY = `
<div class="app" role="application">
  <div class="toolbar">
    <div class="search-row">
      <div class="search-box" id="searchBox">
        <span class="search-box-icon" aria-hidden="true">${ICONS.search}</span>
        <input
          id="searchInput"
          type="text"
          placeholder="Search across your workspace"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          aria-label="Search"
        />
        <button class="icon-btn clear-btn" id="clearInput" title="Clear search" aria-label="Clear search" hidden>
          ${ICONS.close}
        </button>
      </div>
      <button class="icon-btn toolbar-btn" id="toggleReplace" title="Toggle replace" aria-label="Toggle replace" aria-pressed="false">
        ${ICONS.replace}
      </button>
    </div>

    <div class="replace-row" id="replaceRow" hidden>
      <div class="search-box replace-box">
        <input
          id="replaceInput"
          type="text"
          placeholder="Replace with"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          aria-label="Replace with"
        />
      </div>
      <button class="btn btn-primary" id="replaceAllBtn" title="Replace all matches">Replace All</button>
    </div>

    <div class="filters-row">
      <button class="chip" id="toggleCase" data-key="caseSensitive" title="Match case" aria-pressed="false">Aa</button>
      <button class="chip" id="toggleWord" data-key="wholeWord" title="Match whole word" aria-pressed="false">ab</button>
      <button class="chip" id="toggleRegex" data-key="useRegex" title="Use regular expression" aria-pressed="false">.*</button>
      <button class="chip chip-ghost" id="expandAdvanced" aria-expanded="false">
        <span class="chip-chevron">${ICONS.chevronRight}</span>
        Filters
      </button>
    </div>

    <div class="advanced-panel" id="advancedOptions">
      <div class="field-row">
        <label class="field-label" for="inputFiles">Files to include</label>
        <input class="field-input" id="inputFiles" placeholder="e.g. *.ts, *.{js,tsx}" spellcheck="false" />
      </div>
      <div class="field-row">
        <label class="field-label" for="inputExcludes">Files to exclude</label>
        <input class="field-input" id="inputExcludes" placeholder="e.g. *.test.*, dist/**" spellcheck="false" />
      </div>
      <div class="field-row field-row-inline">
        <label class="field-label" for="inputContext">Context lines</label>
        <input class="field-input field-input-small" id="inputContext" type="number" value="0" min="0" max="10" />
      </div>
    </div>
  </div>

  <div class="sep"></div>
  <div class="status-bar" id="statusBar" aria-live="polite"></div>
  <div class="results" id="results"></div>

  <div class="empty-state" id="emptyState">
    <div class="empty-state-icon" aria-hidden="true">${ICONS.search}</div>
    <p class="empty-state-title">Search this workspace</p>
    <p class="empty-state-text">Start typing above. Results appear as you type, powered by ripgrep.</p>
    <div class="empty-state-links">
      <button class="link-btn" id="linkShortcuts">${ICONS.keyboard}<span>Keyboard shortcuts</span></button>
      <button class="link-btn" id="linkSettings">${ICONS.gear}<span>Settings</span></button>
    </div>
  </div>
</div>
`;

const CSS = `
  :root {
    --bg: var(--vscode-sideBar-background);
    --bg-input: var(--vscode-input-background);
    --bg-input-hover: var(--vscode-toolbar-hoverBackground, var(--vscode-input-background));
    --bg-active: var(--vscode-inputOption-activeBackground);
    --bg-active-border: var(--vscode-inputOption-activeBorder, var(--vscode-focusBorder));
    --border: var(--vscode-input-border, #3c3c3c);
    --border-focus: var(--vscode-focusBorder);
    --text: var(--vscode-sideBar-foreground, var(--vscode-foreground));
    --text-dim: var(--vscode-descriptionForeground);
    --text-input: var(--vscode-input-foreground);
    --accent: var(--vscode-textLink-foreground);
    --accent-fg: var(--vscode-button-foreground, #fff);
    --danger: var(--vscode-errorForeground);
    --danger-bg: var(--vscode-inputValidation-errorBackground, rgba(244, 71, 71, 0.12));
    --danger-border: var(--vscode-inputValidation-errorBorder, var(--danger));
    --highlight-text: var(--vscode-list-highlightForeground, var(--accent));
    --match-bg: var(--vscode-editor-findMatchHighlightBackground);
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
    --file-fg: var(--vscode-descriptionForeground);
    --separator: var(--vscode-widget-border, var(--border));
    --radius-sm: 4px;
    --radius-md: 6px;
  }

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { margin: 0; padding: 0; height: 100%; }

  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--text);
    overflow: hidden;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* ---------- Toolbar ---------- */
  .toolbar {
    padding: 10px 10px 6px 10px;
    flex-shrink: 0;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    position: relative;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    transition: border-color 0.12s ease;
  }
  .search-box:focus-within {
    border-color: var(--border-focus);
  }
  .search-box-icon {
    display: flex;
    align-items: center;
    padding-left: 8px;
    color: var(--text-dim);
    pointer-events: none;
  }
  .search-box input {
    flex: 1;
    width: 100%;
    background: transparent;
    color: var(--text-input);
    border: none;
    outline: none;
    padding: 6px 6px;
    font-family: inherit;
    font-size: inherit;
  }
  .search-box input::placeholder { color: var(--text-dim); }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: 5px;
  }
  .icon-btn:hover { background: var(--bg-input-hover); color: var(--text); }
  .icon-btn:focus-visible { outline: 1px solid var(--border-focus); outline-offset: 1px; }

  .clear-btn { margin-right: 3px; }

  .toolbar-btn {
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
  }
  .toolbar-btn[aria-pressed="true"] {
    color: var(--text);
    background: var(--bg-active);
    border-color: var(--bg-active-border);
  }

  /* ---------- Replace row ---------- */
  .replace-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .replace-box { flex: 1; }
  .replace-box input { padding: 6px 8px; }

  .btn {
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: 5px 10px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn:hover { background: var(--bg-input-hover); }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn-primary {
    background: var(--vscode-button-background, var(--accent));
    color: var(--accent-fg);
    border-color: transparent;
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground, var(--accent)); }

  /* ---------- Filter chips ---------- */
  .filters-row {
    display: flex;
    gap: 4px;
    margin-top: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .chip {
    background: var(--bg-input);
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px 8px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    font-weight: 600;
    line-height: 1.4;
  }
  .chip:hover { background: var(--bg-input-hover); color: var(--text); }
  .chip[aria-pressed="true"] {
    background: var(--bg-active);
    color: var(--text);
    border-color: var(--bg-active-border);
  }
  .chip-ghost {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    background: none;
    border-color: transparent;
    font-weight: 500;
    color: var(--text-dim);
  }
  .chip-ghost:hover { background: var(--bg-input-hover); }
  .chip-chevron { display: flex; transition: transform 0.12s ease; }
  .chip-ghost[aria-expanded="true"] .chip-chevron { transform: rotate(90deg); }

  /* ---------- Advanced panel ---------- */
  .advanced-panel {
    display: none;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--separator);
  }
  .advanced-panel.visible { display: flex; }
  .field-row { display: flex; flex-direction: column; gap: 3px; }
  .field-row-inline { flex-direction: row; align-items: center; gap: 8px; }
  .field-label {
    font-size: 11px;
    color: var(--text-dim);
    font-weight: 500;
  }
  .field-row-inline .field-label { flex: 1; }
  .field-input {
    background: var(--bg-input);
    color: var(--text-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px 7px;
    font-family: inherit;
    font-size: 11px;
    outline: none;
  }
  .field-input:focus { border-color: var(--border-focus); }
  .field-input-small { width: 56px; flex: none; }

  /* ---------- Separator ---------- */
  .sep {
    height: 1px;
    background: var(--separator);
    margin: 4px 10px 0 10px;
    flex-shrink: 0;
  }

  /* ---------- Status bar ---------- */
  .status-bar {
    padding: 6px 10px;
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
  }
  .status-bar.is-error { color: var(--danger); }
  .status-bar .count { color: var(--accent); font-weight: 700; }
  .status-bar .spinner {
    width: 12px; height: 12px;
    border: 2px solid var(--text-dim);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: sf-spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  .status-icon { display: flex; flex-shrink: 0; }
  @keyframes sf-spin { to { transform: rotate(360deg); } }

  /* ---------- Results ---------- */
  .results {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 12px;
  }

  .virtual-viewport {
    position: relative;
  }

  .v-header {
    position: absolute;
    left: 0;
    right: 0;
    height: 26px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    cursor: pointer;
    font-size: 12px;
    color: var(--file-fg);
    background: var(--bg);
    border-bottom: 1px solid var(--separator);
    overflow: hidden;
    z-index: 1;
  }
  .v-header:hover { background: var(--bg-input-hover); }
  .v-header:hover .file-replace-btn,
  .file-replace-btn:focus-visible { opacity: 1; }

  .v-match {
    position: absolute;
    left: 0;
    right: 0;
    height: 24px;
    display: flex;
    align-items: stretch;
    cursor: pointer;
    overflow: hidden;
  }
  .v-match:hover { background: var(--bg-input-hover); }

  .file-header-icon {
    display: inline-flex;
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1;
    opacity: 0.9;
    color: var(--vscode-icon-foreground, var(--file-fg));
  }
  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .file-count {
    background: var(--badge-bg);
    color: var(--badge-fg);
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .file-replace-btn {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    opacity: 0;
  }
  .file-replace-btn:focus-visible { opacity: 1; }

  .line-num {
    min-width: 42px;
    padding: 2px 6px;
    text-align: right;
    color: var(--text-dim);
    font-size: 11px;
    user-select: none;
    flex-shrink: 0;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
  }
  .line-text {
    flex: 1;
    padding: 2px 8px 2px 4px;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 12px;
    line-height: 20px;
  }
  .highlight {
    background: var(--match-bg);
    color: var(--highlight-text);
    border-radius: 2px;
  }

  /* ---------- Empty state ---------- */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    gap: 6px;
    color: var(--text-dim);
  }
  .empty-state-icon {
    color: var(--text-dim);
    opacity: 0.5;
    margin-bottom: 6px;
    transform: scale(2.4);
  }
  .empty-state-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .empty-state-text {
    margin: 0;
    font-size: 12px;
    max-width: 220px;
    line-height: 1.5;
  }
  .empty-state-links {
    display: flex;
    gap: 14px;
    margin-top: 10px;
  }
  .link-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    padding: 2px 4px;
  }
  .link-btn:hover { text-decoration: underline; }

  .no-results-msg {
    text-align: center;
    padding: 32px 20px;
    color: var(--text-dim);
    font-size: 12px;
  }

  .replace-summary {
    padding: 8px 10px;
    font-size: 12px;
    border-bottom: 1px solid var(--separator);
  }
  .replace-summary.has-errors { color: var(--danger); }
`;

const CLIENT_SCRIPT = `
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();
  var cfg = window.__SEARCHFAST_CONFIG__ || { liveSearchDelay: 300, minQueryLength: 2 };

  var $ = function (id) { return document.getElementById(id); };

  var searchInput = $('searchInput');
  var clearBtn = $('clearInput');
  var toggleReplaceBtn = $('toggleReplace');
  var replaceRow = $('replaceRow');
  var replaceInput = $('replaceInput');
  var replaceAllBtn = $('replaceAllBtn');
  var statusBar = $('statusBar');
  var resultsDiv = $('results');
  var emptyState = $('emptyState');
  var advancedOptions = $('advancedOptions');
  var expandBtn = $('expandAdvanced');
  var inputFiles = $('inputFiles');
  var inputExcludes = $('inputExcludes');
  var inputContext = $('inputContext');
  var linkShortcuts = $('linkShortcuts');
  var linkSettings = $('linkSettings');

  var state = { caseSensitive: false, wholeWord: false, useRegex: false };
  var debounceTimer = null;
  var currentHighlightRegex = null;
  var hasResults = false;
  var lastSearchedValue = '';

  function safeRegex(pattern, flags) {
    try {
      return new RegExp(pattern, flags);
    } catch (e) {
      return null;
    }
  }

  function buildHighlightRegex(query) {
    if (!query) { return null; }
    var flags = state.caseSensitive ? 'g' : 'gi';
    var source = state.useRegex ? query : query.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    if (state.wholeWord) { source = '\\\\b(?:' + source + ')\\\\b'; }
    return safeRegex(source, flags);
  }

  function setEmptyState(visible) {
    emptyState.hidden = !visible;
    resultsDiv.hidden = visible;
  }

  function currentOptions() {
    var excludes = inputExcludes.value
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    return {
      useRegex: state.useRegex,
      caseSensitive: state.caseSensitive,
      wholeWord: state.wholeWord,
      fileGlob: inputFiles.value.trim(),
      excludes: excludes,
      contextLines: parseInt(inputContext.value, 10) || 0,
    };
  }

  function resetResults() {
    resetVirtual();
  }

  function runSearch(immediate) {
    var q = searchInput.value.trim();
    lastSearchedValue = q;

    if (!q) {
      vscode.postMessage({ type: 'clear' });
      resetResults();
      statusBar.innerHTML = '';
      statusBar.classList.remove('is-error');
      setEmptyState(true);
      return;
    }

    if (!immediate && q.length < cfg.minQueryLength) {
      return;
    }

    resetResults();
    currentHighlightRegex = buildHighlightRegex(q);
    setEmptyState(false);
    vscode.postMessage({ type: 'search', pattern: q, options: currentOptions() });
  }

  function scheduleSearch() {
    clearTimeout(debounceTimer);
    var q = searchInput.value.trim();
    if (!q) {
      runSearch(true);
      return;
    }
    if (q.length < cfg.minQueryLength) {
      return;
    }
    debounceTimer = setTimeout(function () { runSearch(false); }, cfg.liveSearchDelay);
  }

  // ---- Search input wiring (onChange / live-as-you-type search) ----
  searchInput.addEventListener('input', function () {
    clearBtn.hidden = searchInput.value.length === 0;
    scheduleSearch();
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      runSearch(true);
    } else if (e.key === 'Escape') {
      vscode.postMessage({ type: 'cancel' });
    }
  });

  clearBtn.addEventListener('click', function () {
    searchInput.value = '';
    clearBtn.hidden = true;
    clearTimeout(debounceTimer);
    runSearch(true);
    searchInput.focus();
  });

  // ---- Filter chips ----
  document.querySelectorAll('.chip[data-key]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.key;
      state[key] = !state[key];
      btn.setAttribute('aria-pressed', String(state[key]));
      if (searchInput.value.trim().length >= cfg.minQueryLength || lastSearchedValue) {
        clearTimeout(debounceTimer);
        runSearch(true);
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    var mod = cfg.isMac ? e.metaKey : e.ctrlKey;
    if (!mod) { return; }
    if (e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); $('toggleRegex').click(); }
  });

  // ---- Advanced filters panel ----
  expandBtn.addEventListener('click', function () {
    var isVisible = advancedOptions.classList.toggle('visible');
    expandBtn.setAttribute('aria-expanded', String(isVisible));
  });

  [inputFiles, inputExcludes, inputContext].forEach(function (el) {
    el.addEventListener('change', function () {
      if (lastSearchedValue) { runSearch(true); }
    });
  });

  // ---- Replace panel ----
  toggleReplaceBtn.addEventListener('click', function () {
    var isOpen = replaceRow.hidden;
    replaceRow.hidden = !isOpen;
    toggleReplaceBtn.setAttribute('aria-pressed', String(isOpen));
    if (isOpen) { replaceInput.focus(); }
  });

  replaceAllBtn.addEventListener('click', function () {
    var pattern = searchInput.value.trim();
    if (!pattern) {
      searchInput.focus();
      return;
    }
    replaceAllBtn.disabled = true;
    vscode.postMessage({
      type: 'replaceAll',
      pattern: pattern,
      replacement: replaceInput.value,
      options: currentOptions(),
    });
  });

  replaceInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceAllBtn.click();
    }
  });

  // ---- Footer links ----
  linkShortcuts.addEventListener('click', function () {
    vscode.postMessage({ type: 'openShortcuts' });
  });
  linkSettings.addEventListener('click', function () {
    vscode.postMessage({ type: 'openSettings' });
  });

  // ---- Result rendering (incremental, DOM-based, no innerHTML for user text) ----
  function highlightInto(container, text) {
    if (!currentHighlightRegex) {
      container.appendChild(document.createTextNode(text));
      return;
    }
    currentHighlightRegex.lastIndex = 0;
    var lastIndex = 0;
    var match;
    var safety = 0;
    while ((match = currentHighlightRegex.exec(text)) !== null && safety < 5000) {
      safety++;
      if (match[0].length === 0) {
        currentHighlightRegex.lastIndex++;
        continue;
      }
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      var span = document.createElement('span');
      span.className = 'highlight';
      span.textContent = match[0];
      container.appendChild(span);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function shortFileName(file) {
    var parts = file.split(/[\\/\\\\]/);
    return parts[parts.length - 1] || file;
  }

  // Maps a file path to a VS Code codicon class by file type. The rendered
  // icon uses VS Code's themed codicon font and color, matching the IDE.
  function codiconForFile(file) {
    var name = String(file || '').toLowerCase();
    var dot = name.lastIndexOf('.');
    var ext = dot > 0 ? name.slice(dot + 1) : '';

    switch (ext) {
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'bmp':
      case 'webp': case 'ico': case 'avif': case 'tif': case 'tiff':
        return 'codicon-file-media';
      case 'pdf':
        return 'codicon-file-pdf';
      case 'zip': case 'tar': case 'gz': case 'rar': case '7z': case 'bz2':
      case 'xz': case 'tgz':
        return 'codicon-file-zip';
      case 'exe': case 'dll': case 'so': case 'dylib': case 'o': case 'obj':
      case 'class': case 'jar': case 'dat': case 'bin': case 'db': case 'sqlite':
      case 'wasm': case 'pyc': case 'pyo':
        return 'codicon-file-binary';
      case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': case 'cjs':
      case 'jsconfig': case 'tsconfig': case 'json': case 'jsonc': case 'css':
      case 'scss': case 'less': case 'html': case 'htm': case 'xml': case 'yaml':
      case 'yml': case 'toml': case 'py': case 'java': case 'c': case 'h':
      case 'cpp': case 'hpp': case 'cc': case 'go': case 'rs': case 'rb':
      case 'php': case 'sh': case 'bash': case 'zsh': case 'fish': case 'md':
      case 'markdown': case 'sql': case 'graphql': case 'gql': case 'vue':
      case 'svelte': case 'astro': case 'cs': case 'fs': case 'fsx': case 'swift':
      case 'kt': case 'kts': case 'dart': case 'lua': case 'r': case 'pl':
      case 'pm': case 'clj': case 'cljs': case 'ex': case 'exs': case 'erl':
      case 'hrl': case 'scala': case 'groovy': case 'gradle': case 'dockerfile':
      case 'makefile': case 'cmake': case 'ini': case 'conf': case 'cfg':
      case 'bat': case 'cmd': case 'ps1': case 'psm1':
        return 'codicon-file-code';
      default:
        return 'codicon-file';
    }
  }

  // ---- Virtualized result rendering ----
  // Only the rows near the visible viewport are created in the DOM, so
  // thousands of matches don't produce thousands of nodes. Each row is
  // absolutely positioned inside a tall spacer (.virtual-viewport) and
  // gets recycled as the user scrolls.
  var matches = [];
  var vRows = [];
  var rowTops = [];
  var totalHeight = 0;
  var rowEls = new Map();
  var fileCounts = new Map();
  var ROW_H = 24;
  var HEADER_H = 26;
  var BUFFER = 8;
  var rafPending = false;

  var viewportEl = document.createElement('div');
  viewportEl.className = 'virtual-viewport';
  viewportEl.style.height = '0px';
  resultsDiv.appendChild(viewportEl);

  function resetVirtual() {
    matches = [];
    vRows = [];
    rowTops = [];
    totalHeight = 0;
    rowEls = new Map();
    fileCounts = new Map();
    hasResults = false;
    if (!viewportEl) { return; }
    viewportEl.innerHTML = '';
    viewportEl.style.height = '0px';
    var leftovers = resultsDiv.querySelectorAll('.replace-summary, .no-results-msg');
    for (var i = 0; i < leftovers.length; i++) {
      leftovers[i].parentNode.removeChild(leftovers[i]);
    }
  }

  function rebuildVirtual() {
    vRows = [];
    rowTops = [];
    var total = 0;
    var seen = new Set();
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!seen.has(m.file)) {
        seen.add(m.file);
        vRows.push({ type: 'header', file: m.file });
        rowTops.push(total);
        total += HEADER_H;
      }
      vRows.push({ type: 'match', match: m, file: m.file });
      rowTops.push(total);
      total += ROW_H;
    }
    totalHeight = total;
    viewportEl.style.height = totalHeight + 'px';
  }

  function lowerBound(target) {
    var lo = 0;
    var hi = rowTops.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (rowTops[mid] < target) { lo = mid + 1; } else { hi = mid; }
    }
    return lo;
  }

  function scheduleRender() {
    if (rafPending) { return; }
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      renderVisible();
    });
  }

  function renderVisible() {
    if (!viewportEl || vRows.length === 0 || resultsDiv.hidden) { return; }
    var scrollTop = resultsDiv.scrollTop;
    var vp = resultsDiv.clientHeight;
    if (vp <= 0) { return; }
    var start = Math.max(0, lowerBound(scrollTop) - BUFFER);
    var end = Math.min(vRows.length, lowerBound(scrollTop + vp) + BUFFER);

    var keys = Array.from(rowEls.keys());
    for (var i = 0; i < keys.length; i++) {
      var idx = keys[i];
      if (idx < start || idx >= end) {
        var old = rowEls.get(idx);
        old.parentNode.removeChild(old);
        rowEls.delete(idx);
      }
    }

    for (var r = start; r < end; r++) {
      var row = vRows[r];
      var el = rowEls.get(r);
      if (!el) {
        el = row.type === 'header' ? createHeaderRow(row.file) : createMatchRow(row.match);
        viewportEl.appendChild(el);
        rowEls.set(r, el);
      }
      if (row.type === 'header') {
        el._countEl.textContent = String(fileCounts.get(row.file) || 0);
      }
      el.style.top = rowTops[r] + 'px';
    }
  }

  function createHeaderRow(file) {
    var header = document.createElement('div');
    header.className = 'v-header';
    header.setAttribute('data-path', file);
    header.setAttribute('data-line', '1');
    header.title = file;

    var icon = document.createElement('span');
    icon.className = 'file-header-icon codicon ' + codiconForFile(file);
    header.appendChild(icon);

    var nameEl = document.createElement('span');
    nameEl.className = 'file-name';
    nameEl.textContent = shortFileName(file);
    header.appendChild(nameEl);

    var countEl = document.createElement('span');
    countEl.className = 'file-count';
    countEl.textContent = '0';
    header.appendChild(countEl);
    header._countEl = countEl;

    var replaceFileBtn = document.createElement('button');
    replaceFileBtn.className = 'icon-btn file-replace-btn';
    replaceFileBtn.title = 'Replace in this file';
    replaceFileBtn.setAttribute('aria-label', 'Replace in this file');
    replaceFileBtn.innerHTML = ${JSON.stringify(ICONS.replace)};
    replaceFileBtn.addEventListener('click', function (evt) {
      evt.stopPropagation();
      var pattern = searchInput.value.trim();
      if (!pattern) { return; }
      vscode.postMessage({
        type: 'replaceInFile',
        pattern: pattern,
        replacement: replaceInput.value,
        options: currentOptions(),
        file: file,
      });
    });
    header.appendChild(replaceFileBtn);
    return header;
  }

  function createMatchRow(m) {
    var line = document.createElement('div');
    line.className = 'v-match';
    line.setAttribute('data-path', m.file);
    line.setAttribute('data-line', String(m.line));

    var lineNum = document.createElement('span');
    lineNum.className = 'line-num';
    lineNum.textContent = String(m.line);

    var lineText = document.createElement('span');
    lineText.className = 'line-text';
    highlightInto(lineText, m.text);

    line.appendChild(lineNum);
    line.appendChild(lineText);
    return line;
  }

  function appendMatches(newMatches) {
    for (var i = 0; i < newMatches.length; i++) {
      var m = newMatches[i];
      matches.push(m);
      fileCounts.set(m.file, (fileCounts.get(m.file) || 0) + 1);
    }
    rebuildVirtual();
    scheduleRender();
    hasResults = fileCounts.size > 0;
  }

  resultsDiv.addEventListener('scroll', scheduleRender);
  window.addEventListener('resize', scheduleRender);

  resultsDiv.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-path]') : null;
    if (!el) { return; }
    var path = el.getAttribute('data-path');
    var line = parseInt(el.getAttribute('data-line') || '1', 10) || 1;
    if (path) {
      vscode.postMessage({ type: 'openFile', path: path, line: line });
    }
  });

  function setStatus(html, isError) {
    statusBar.innerHTML = html;
    statusBar.classList.toggle('is-error', !!isError);
  }

  function renderReplaceSummary(summary) {
    var box = document.createElement('div');
    var hasErrors = summary.results.some(function (r) { return r.error; });
    box.className = 'replace-summary' + (hasErrors ? ' has-errors' : '');
    var text = 'Replaced ' + summary.totalReplacements + ' match(es) in ' + summary.filesChanged + ' file(s).';
    if (hasErrors) {
      var failed = summary.results.filter(function (r) { return r.error; }).length;
      text += ' ' + failed + ' file(s) could not be updated.';
    }
    box.textContent = text;
    resultsDiv.insertBefore(box, resultsDiv.firstChild);
  }

  // ---- Messages from the extension host ----
  window.addEventListener('message', function (e) {
    var msg = e.data || {};
    switch (msg.type) {
      case 'config':
        cfg = msg.config || cfg;
        break;

      case 'focus':
        searchInput.focus();
        searchInput.select();
        break;

      case 'populate':
        searchInput.value = msg.pattern || '';
        clearBtn.hidden = searchInput.value.length === 0;
        break;

      case 'searching':
        currentHighlightRegex = buildHighlightRegex(searchInput.value.trim());
        setStatus('<span class="spinner"></span> Searching...', false);
        resetResults();
        setEmptyState(false);
        break;

      case 'matches':
        appendMatches(msg.matches || []);
        break;

      case 'searchDone': {
        var parts = [];
        if (typeof msg.totalMatches === 'number') {
          parts.push('<span class="count">' + msg.totalMatches + '</span> match' + (msg.totalMatches === 1 ? '' : 'es'));
        }
        if (typeof msg.totalFiles === 'number') {
          parts.push(msg.totalFiles + ' file' + (msg.totalFiles === 1 ? '' : 's'));
        }
        if (typeof msg.duration === 'number') {
          parts.push(msg.duration + ' ms');
        }
        if (msg.truncated) {
          parts.push('<span style="color:var(--danger)">results truncated</span>');
        }
        setStatus(parts.join(' &middot; '), false);
        if (!hasResults) {
          var noResults = document.createElement('div');
          noResults.className = 'no-results-msg';
          noResults.textContent = 'No results found.';
          resultsDiv.appendChild(noResults);
        }
        break;
      }

      case 'error':
        setStatus(msg.message || 'Something went wrong.', true);
        break;

      case 'clear':
        setStatus('', false);
        resetResults();
        setEmptyState(true);
        break;

      case 'replaceStarted':
        replaceAllBtn.disabled = true;
        setStatus('<span class="spinner"></span> Replacing in ' + msg.fileCount + ' file(s)...', false);
        break;

      case 'replaceDone':
        replaceAllBtn.disabled = false;
        setStatus('Replace finished.', false);
        renderReplaceSummary(msg.summary);
        break;

      case 'replaceCancelled':
        replaceAllBtn.disabled = false;
        setStatus('Replace cancelled.', false);
        break;

      case 'replaceError':
        replaceAllBtn.disabled = false;
        setStatus(msg.message || 'Replace failed.', true);
        break;
    }
  });

  setEmptyState(true);
  searchInput.focus();
})();
`;
