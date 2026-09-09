import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import { promises as fs } from "fs";
import { isAbsolute, join } from "path";
import { detectRipgrep } from "./ripgrep";

export interface SearchOptions {
  pattern: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  maxResults: number;
  contextLines: number;
  followSymlinks: boolean;
  hiddenFiles: boolean;
  respectGitignore: boolean;
  excludes: string[];
  fileGlob: string;
  type: string;
  maxFileSize: string;
  minFileSize: string;
  modifiedAfter: string;
  modifiedBefore: string;
  sortCriteria: "file" | "line" | "count";
  jsonOutput: boolean;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  beforeContext: string[];
  afterContext: string[];
  totalMatches: number;
}

export interface SearchResultSet {
  matches: SearchMatch[];
  totalFiles: number;
  totalMatches: number;
  duration: number;
  query: string;
  truncated: boolean;
}

type SearchEvent =
  | { type: "match"; match: SearchMatch }
  | { type: "done"; result: SearchResultSet }
  | { type: "error"; message: string };

let activeProcess: ChildProcess | null = null;

export function cancelSearch(): void {
  if (activeProcess) {
    try {
      activeProcess.kill();
    } catch {
      // The process may have already exited; nothing else to do.
    }
    activeProcess = null;
  }
}

export function isSearchActive(): boolean {
  return activeProcess !== null;
}

/**
 * Runs a ripgrep search and streams matches back through onEvent as they
 * arrive, followed by a single "done" (or "error") event. Any previously
 * running search started through this module is cancelled first.
 */
export async function executeSearch(
  options: SearchOptions,
  cwd: string,
  onEvent: (event: SearchEvent) => void,
  token?: vscode.CancellationToken
): Promise<void> {
  cancelSearch();

  if (!options.pattern || !options.pattern.trim()) {
    onEvent({ type: "error", message: "Enter a search term to get started." });
    return;
  }

  if (options.useRegex) {
    const regexError = validateRegex(options.pattern);
    if (regexError) {
      onEvent({ type: "error", message: `Invalid regular expression: ${regexError}` });
      return;
    }
  }

  const rgInfo = await detectRipgrep();
  if (!rgInfo.available) {
    onEvent({ type: "error", message: "ripgrep (rg) was not found on this machine." });
    return;
  }

  let args: string[];
  try {
    args = buildArgs(options);
  } catch (err) {
    onEvent({
      type: "error",
      message: `Could not build the search command: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const startTime = Date.now();
  let matchCount = 0;
  let fileCount = 0;
  const filesSeen = new Set<string>();
  let outputBuffer = "";
  let truncated = false;
  let settled = false;

  let rg: ChildProcess;
  try {
    rg = spawn(rgInfo.path, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (err) {
    onEvent({
      type: "error",
      message: `Could not start ripgrep: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  activeProcess = rg;

  const finishOnce = (event: SearchEvent) => {
    if (settled) {
      return;
    }
    settled = true;
    onEvent(event);
  };

  const abortHandler = token?.onCancellationRequested(() => {
    cancelSearch();
    finishOnce({ type: "error", message: "Search cancelled." });
  });

  rg.stdout?.on("data", (chunk: Buffer) => {
    outputBuffer += chunk.toString("utf-8");

    let newlineIndex: number;
    while ((newlineIndex = outputBuffer.indexOf("\n")) !== -1) {
      const line = outputBuffer.substring(0, newlineIndex);
      outputBuffer = outputBuffer.substring(newlineIndex + 1);

      const match = parseRgLine(line);
      if (match) {
        if (!filesSeen.has(match.file)) {
          filesSeen.add(match.file);
          fileCount++;
        }
        matchCount++;
        match.totalMatches = matchCount;

        if (matchCount <= options.maxResults) {
          onEvent({ type: "match", match });
        } else {
          truncated = true;
          cancelSearch();
        }
      }
    }
  });

  rg.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf-8").trim();
    // ripgrep writes benign warnings (e.g. skipped binary files) to stderr;
    // only surface messages that look like real failures.
    if (msg && !/^WARNING/i.test(msg)) {
      finishOnce({ type: "error", message: msg });
      cancelSearch();
    }
  });

  rg.on("close", () => {
    activeProcess = null;
    abortHandler?.dispose();

    if (settled) {
      return;
    }

    if (outputBuffer.trim()) {
      const match = parseRgLine(outputBuffer.trim());
      if (match) {
        matchCount++;
        if (!filesSeen.has(match.file)) {
          filesSeen.add(match.file);
          fileCount++;
        }
        match.totalMatches = matchCount;
        if (matchCount <= options.maxResults) {
          onEvent({ type: "match", match });
        } else {
          truncated = true;
        }
      }
    }

    const duration = Date.now() - startTime;
    finishOnce({
      type: "done",
      result: {
        matches: [],
        totalFiles: fileCount,
        totalMatches: matchCount,
        duration,
        query: options.pattern,
        truncated,
      },
    });
  });

  rg.on("error", (err) => {
    activeProcess = null;
    finishOnce({ type: "error", message: err.message || "ripgrep failed to run." });
  });
}

/** Returns an error message if the pattern is not a valid JS-compatible regex, otherwise null. */
function validateRegex(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function buildArgs(options: SearchOptions): string[] {
  const args: string[] = [];

  args.push("--column");
  args.push("--line-number");

  if (options.caseSensitive) {
    args.push("--case-sensitive");
  } else {
    args.push("--ignore-case");
  }

  if (options.wholeWord) {
    args.push("--word-regexp");
  }

  if (!options.useRegex) {
    args.push("--fixed-strings");
  }

  const contextLines = Number.isFinite(options.contextLines)
    ? Math.max(0, Math.min(50, Math.floor(options.contextLines)))
    : 0;
  if (contextLines > 0) {
    args.push("-C", String(contextLines));
  }

  if (options.hiddenFiles) {
    args.push("--hidden");
  }

  if (options.followSymlinks) {
    args.push("--follow");
  }

  if (!options.respectGitignore) {
    args.push("--no-ignore");
  }

  for (const excl of options.excludes) {
    const trimmed = excl.trim();
    if (trimmed) {
      args.push("--glob", `!${trimmed}`);
    }
  }

  if (options.fileGlob) {
    for (const glob of options.fileGlob.split(",").map((g) => g.trim()).filter(Boolean)) {
      args.push("--glob", glob);
    }
  }

  if (options.type) {
    args.push("--type", options.type);
  }

  if (options.maxFileSize) {
    args.push("--max-filesize", options.maxFileSize);
  }
  if (options.minFileSize) {
    args.push("--min-filesize", options.minFileSize);
  }

  if (options.modifiedAfter) {
    args.push("--changed-after", options.modifiedAfter);
  }
  if (options.modifiedBefore) {
    args.push("--changed-before", options.modifiedBefore);
  }

  const maxResults = Number.isFinite(options.maxResults) && options.maxResults > 0
    ? Math.floor(options.maxResults)
    : 5000;
  // Cap per-file matches too, so one huge file can't stall the whole search.
  args.push("--max-count", String(maxResults));

  args.push("--json");
  args.push("--");
  args.push(options.pattern);

  return args;
}

interface RawRgJson {
  type: "begin" | "match" | "end" | "stats" | "path";
  data: any;
}

function parseRgLine(line: string): SearchMatch | null {
  if (!line) {
    return null;
  }
  try {
    const parsed = JSON.parse(line) as RawRgJson;

    if (parsed.type === "match") {
      const d = parsed.data;
      const filePath = d?.path?.text ?? d?.path ?? "";
      const lineNumber = typeof d?.line_number === "number" ? d.line_number : 0;
      const columnNumber = typeof d?.submatches?.[0]?.start === "number" ? d.submatches[0].start : 0;
      const text = typeof d?.lines?.text === "string" ? d.lines.text : "";

      if (!filePath) {
        return null;
      }

      return {
        file: filePath,
        line: lineNumber,
        column: columnNumber,
        text: text.replace(/\r?\n$/, ""),
        beforeContext: [],
        afterContext: [],
        totalMatches: 0,
      };
    }

    return null;
  } catch {
    // ripgrep should always emit valid JSON with --json, but fall back to
    // parsing plain "file:line:col:text" output just in case.
    const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
    if (match) {
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        text: match[4],
        beforeContext: [],
        afterContext: [],
        totalMatches: 0,
      };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

export interface ReplaceOptions {
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  respectGitignore: boolean;
  hiddenFiles: boolean;
  excludes: string[];
  fileGlob: string;
  /** When set, only these files are touched instead of the whole workspace. */
  filesFilter?: string[];
}

export interface ReplaceFileResult {
  file: string;
  replacements: number;
  error?: string;
}

export interface ReplaceSummary {
  filesChanged: number;
  totalReplacements: number;
  results: ReplaceFileResult[];
}

/**
 * Lists every file that currently matches the given search, without reading
 * or modifying anything. Used to show an accurate confirmation prompt before
 * a replace runs.
 */
export async function listMatchingFiles(options: ReplaceOptions, cwd: string): Promise<string[]> {
  const rgInfo = await detectRipgrep();
  if (!rgInfo.available) {
    throw new Error("ripgrep (rg) was not found on this machine.");
  }

  const args = buildReplaceScanArgs(options);

  // Spawn with stdin ignored: ripgrep's stdin heuristic means a live stdin
  // pipe (which execFile leaves open) is treated as data to search, so rg
  // would read an empty pipe instead of the workspace files. This is why the
  // search path uses spawn with stdio:["ignore", ...] and replaces must too.
  return new Promise((resolve, reject) => {
    const proc = spawn(rgInfo.path, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      // ripgrep exits with code 1 when there are simply no matches - that is
      // not a real failure.
      if (code !== null && code !== 0 && code !== 1) {
        reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`));
        return;
      }
      const files = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      resolve(options.filesFilter ? files.filter((f) => options.filesFilter!.includes(f)) : files);
    });
  });
}

function buildReplaceScanArgs(options: ReplaceOptions): string[] {
  const args: string[] = ["--files-with-matches"];

  if (options.caseSensitive) {
    args.push("--case-sensitive");
  } else {
    args.push("--ignore-case");
  }
  if (options.wholeWord) {
    args.push("--word-regexp");
  }
  if (!options.useRegex) {
    args.push("--fixed-strings");
  }
  if (options.hiddenFiles) {
    args.push("--hidden");
  }
  if (!options.respectGitignore) {
    args.push("--no-ignore");
  }
  for (const excl of options.excludes) {
    const trimmed = excl.trim();
    if (trimmed) {
      args.push("--glob", `!${trimmed}`);
    }
  }
  if (options.fileGlob) {
    for (const glob of options.fileGlob.split(",").map((g) => g.trim()).filter(Boolean)) {
      args.push("--glob", glob);
    }
  }

  args.push("--");
  args.push(options.pattern);
  return args;
}

/**
 * The subset of search options that determine how a JS RegExp should be
 * built to mirror ripgrep's matching behavior.
 */
interface MatcherOptions {
  pattern: string;
  useRegex: boolean;
  wholeWord: boolean;
  caseSensitive: boolean;
}

/** Builds a RegExp that mirrors how ripgrep would interpret the same options. */
function buildMatcher(options: MatcherOptions): RegExp {
  let source = options.useRegex ? options.pattern : escapeForRegex(options.pattern);
  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`;
  }
  const flags = options.caseSensitive ? "g" : "gi";
  return new RegExp(source, flags);
}

export interface ReplaceSingleMatchOptions {
  filePath: string;
  line: number;
  column: number;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface ReplaceSingleMatchResult {
  replaced: boolean;
  error?: string;
}

/**
 * Replaces exactly one occurrence of the pattern: the match on `line` whose
 * start column equals `column` (the column reported by ripgrep for that
 * result), falling back to the first occurrence on the line. Only that single
 * occurrence is changed; the rest of the file is left untouched.
 */
export async function replaceSingleMatch(options: ReplaceSingleMatchOptions): Promise<ReplaceSingleMatchResult> {
  let matcher: RegExp;
  try {
    matcher = buildMatcher(options);
  } catch (err) {
    return { replaced: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const original = await fs.readFile(options.filePath, "utf-8");
    // Split on "\n" only so CRLF files keep their \r line endings intact.
    const lines = original.split("\n");
    const lineIdx = Math.max(0, Math.min(options.line - 1, lines.length - 1));
    const lineText = lines[lineIdx];

    const search = new RegExp(matcher.source, matcher.flags);
    const occurrences: Array<{ start: number; text: string }> = [];
    let match: RegExpExecArray | null;
    search.lastIndex = 0;
    while ((match = search.exec(lineText)) !== null && occurrences.length < 5000) {
      if (match[0].length === 0) {
        search.lastIndex++;
        continue;
      }
      occurrences.push({ start: match.index, text: match[0] });
      if (search.lastIndex === match.index) {
        search.lastIndex++;
      }
    }

    const target = occurrences.find((o) => o.start === options.column) ?? occurrences[0];
    if (!target) {
      return { replaced: false };
    }

    const replacementText = options.useRegex
      ? options.replacement
      : options.replacement.replace(/\$/g, "$$$$");

    const segment = lineText.slice(target.start, target.start + target.text.length);
    const editedLine =
      lineText.slice(0, target.start) +
      segment.replace(matcher, replacementText) +
      lineText.slice(target.start + target.text.length);

    if (editedLine === lineText) {
      return { replaced: false };
    }

    lines[lineIdx] = editedLine;
    await fs.writeFile(options.filePath, lines.join("\n"), "utf-8");
    return { replaced: true };
  } catch (err) {
    return { replaced: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every match of options.pattern with options.replacement across
 * the files that currently match the search. Files that fail to read or
 * write are reported individually instead of aborting the whole run.
 */
export async function executeReplace(options: ReplaceOptions, cwd: string): Promise<ReplaceSummary> {
  if (!options.pattern.trim()) {
    throw new Error("Enter a search term before replacing.");
  }
  if (options.useRegex) {
    try {
      new RegExp(options.pattern);
    } catch (err) {
      throw new Error(`Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const files = await listMatchingFiles(options, cwd);
  const matcher = buildMatcher(options);
  const results: ReplaceFileResult[] = [];
  let filesChanged = 0;
  let totalReplacements = 0;

  // Read/write files concurrently so large replaces don't serialize on I/O.
  // The extension host is single-threaded, so our counters stay race-free.
  const concurrency = Math.min(8, Math.max(1, Math.ceil(files.length / 4)));
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < files.length) {
      const i = nextIndex++;
      const relativeFile = files[i];
      const absolutePath = isAbsolute(relativeFile) ? relativeFile : join(cwd, relativeFile);

      try {
        const original = await fs.readFile(absolutePath, "utf-8");
        const count = (original.match(matcher) || []).length;

        // For regex mode, pass the replacement straight to String.replace so
        // capture-group references like $1 work the way ripgrep users expect.
        // For plain-text mode, escape any accidental $ patterns so they are
        // inserted literally instead of being treated as replacement tokens.
        const replacementText = options.useRegex
          ? options.replacement
          : options.replacement.replace(/\$/g, "$$$$");
        const updated = count > 0 ? original.replace(matcher, replacementText) : original;

        if (count > 0 && updated !== original) {
          await fs.writeFile(absolutePath, updated, "utf-8");
          filesChanged++;
          totalReplacements += count;
          results.push({ file: relativeFile, replacements: count });
        } else if (count > 0) {
          results.push({ file: relativeFile, replacements: count });
          totalReplacements += count;
        }
      } catch (err) {
        results.push({
          file: relativeFile,
          replacements: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, files.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  results.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  return { filesChanged, totalReplacements, results };
}

export function getDefaultOptions(): SearchOptions {
  let config: vscode.WorkspaceConfiguration;
  try {
    config = vscode.workspace.getConfiguration("searchfast");
  } catch {
    config = { get: (_key: string, def: any) => def } as unknown as vscode.WorkspaceConfiguration;
  }

  return {
    pattern: "",
    caseSensitive: config.get<boolean>("caseSensitive", false),
    wholeWord: config.get<boolean>("wholeWord", false),
    useRegex: config.get<boolean>("useRegex", false),
    maxResults: config.get<number>("maxResults", 5000),
    contextLines: config.get<number>("contextLines", 2),
    followSymlinks: config.get<boolean>("followSymlinks", false),
    hiddenFiles: config.get<boolean>("hiddenFiles", false),
    respectGitignore: config.get<boolean>("respectGitignore", true),
    excludes: config.get<string[]>("defaultExcludes", []),
    fileGlob: "",
    type: "",
    maxFileSize: "",
    minFileSize: "",
    modifiedAfter: "",
    modifiedBefore: "",
    sortCriteria: "file",
    jsonOutput: true,
  };
}
