import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import { detectRipgrep, RipgrepInfo } from "./ripgrep";

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
    activeProcess.kill();
    activeProcess = null;
  }
}

export function isSearchActive(): boolean {
  return activeProcess !== null;
}

export async function executeSearch(
  options: SearchOptions,
  cwd: string,
  onEvent: (event: SearchEvent) => void,
  token?: vscode.CancellationToken
): Promise<void> {
  cancelSearch();

  const rgInfo = await detectRipgrep();
  if (!rgInfo.available) {
    onEvent({ type: "error", message: "ripgrep not found" });
    return;
  }

  const args = buildArgs(options, cwd);

  const startTime = Date.now();
  let matchCount = 0;
  let fileCount = 0;
  const filesSeen = new Set<string>();
  let outputBuffer = "";
  let truncated = false;

  const rg = spawn(rgInfo.path, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  activeProcess = rg;

  const abortHandler = token?.onCancellationRequested(() => {
    cancelSearch();
    onEvent({ type: "error", message: "Search cancelled" });
  });

  rg.stdout!.on("data", (chunk: Buffer) => {
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

  rg.stderr!.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf-8").trim();
    if (msg && !msg.includes("WARNING")) {
      onEvent({ type: "error", message: msg });
    }
  });

  rg.on("close", (code) => {
    activeProcess = null;
    abortHandler?.dispose();

    if (outputBuffer.trim()) {
      const match = parseRgLine(outputBuffer.trim());
      if (match) {
        matchCount++;
        fileCount++;
        match.totalMatches = matchCount;
        if (matchCount <= options.maxResults) {
          onEvent({ type: "match", match });
        } else {
          truncated = true;
        }
      }
    }

    const duration = Date.now() - startTime;
    onEvent({
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
    onEvent({ type: "error", message: err.message });
  });
}

function buildArgs(options: SearchOptions, _cwd: string): string[] {
  const args: string[] = [];

  // Output format: file:line:col:text
  args.push("--column");
  args.push("--line-number");

  // Case sensitivity
  if (options.caseSensitive) {
    args.push("--case-sensitive");
  } else {
    args.push("--ignore-case");
  }

  // Whole word
  if (options.wholeWord) {
    args.push("--word-regexp");
  }

  // Regex mode (default for rg)
  if (!options.useRegex) {
    args.push("--fixed-strings");
  }

  // Context lines
  if (options.contextLines > 0) {
    args.push("-C", String(options.contextLines));
  }

  // Hidden files
  if (options.hiddenFiles) {
    args.push("--hidden");
  }

  // Follow symlinks
  if (options.followSymlinks) {
    args.push("--follow");
  }

  // .gitignore
  if (!options.respectGitignore) {
    args.push("--no-ignore");
  }

  // Excludes
  for (const excl of options.excludes) {
    args.push("--glob", `!${excl}`);
  }

  // File glob filter
  if (options.fileGlob) {
    args.push("--glob", options.fileGlob);
  }

  // Type filter
  if (options.type) {
    args.push("--type", options.type);
  }

  // File size
  if (options.maxFileSize) {
    args.push("--max-filesize", options.maxFileSize);
  }
  if (options.minFileSize) {
    args.push("--min-filesize", options.minFileSize);
  }

  // Date filters (uses --changed-before / --changed-after if available)
  if (options.modifiedAfter) {
    args.push("--changed-after", options.modifiedAfter);
  }
  if (options.modifiedBefore) {
    args.push("--changed-before", options.modifiedBefore);
  }

  // Max count per file to avoid huge output from single files
  args.push("--max-count", String(options.maxResults));

  // JSON output for reliable parsing
  args.push("--json");

  // The search pattern
  args.push(options.pattern);

  return args;
}

interface RawRgJson {
  type: "begin" | "match" | "end" | "stats" | "path";
  data: any;
}

function parseRgLine(line: string): SearchMatch | null {
  try {
    const parsed = JSON.parse(line) as RawRgJson;

    if (parsed.type === "match") {
      const d = parsed.data;
      const filePath = d.path?.text || d.path || "";
      const lineNumber = d.line_number || 0;
      const columnNumber = d.submatches?.[0]?.start || 0;
      const text = d.lines?.text || "";
      const beforeContext: string[] = [];
      const afterContext: string[] = [];

      return {
        file: filePath,
        line: lineNumber,
        column: columnNumber,
        text: text.replace(/\n$/, ""),
        beforeContext,
        afterContext,
        totalMatches: 0,
      };
    }

    return null;
  } catch {
    // Fallback: try to parse plain text output (file:line:col:text format)
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

export function getDefaultOptions(): SearchOptions {
  const config = vscode.workspace.getConfiguration("searchfast");
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
