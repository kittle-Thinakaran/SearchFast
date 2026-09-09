import * as vscode from "vscode";
import { execFile, execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface RipgrepInfo {
  path: string;
  version: string;
  available: boolean;
}

let cachedInfo: RipgrepInfo | null = null;

/**
 * Locates a usable ripgrep binary on the current machine.
 * Results are cached in memory for the life of the extension host;
 * call resetCache() to force a fresh lookup (e.g. after installing rg).
 */
export async function detectRipgrep(): Promise<RipgrepInfo> {
  if (cachedInfo) {
    return cachedInfo;
  }

  const candidates = buildCandidateList();

  for (const rgPath of candidates) {
    try {
      const result = await tryRg(rgPath);
      if (result) {
        cachedInfo = result;
        return result;
      }
    } catch {
      // Ignore and try the next candidate path.
      continue;
    }
  }

  cachedInfo = { path: "", version: "", available: false };
  return cachedInfo;
}

function buildCandidateList(): string[] {
  const candidates: string[] = [];

  try {
    const config = vscode.workspace.getConfiguration("searchfast");
    const customPath = config.get<string>("ripgrepPath", "").trim();
    if (customPath && existsSync(customPath)) {
      candidates.push(customPath);
    }
  } catch {
    // Configuration read failed (should not normally happen) - keep going
    // with the built-in search locations below.
  }

  const onPath = findOnSystemPath();
  if (onPath) {
    candidates.push(onPath);
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.PROGRAMFILES || "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
    candidates.push(
      join(localAppData, "Programs", "ripgrep", "rg.exe"),
      join(programFiles, "ripgrep", "rg.exe"),
      join(programFilesX86, "ripgrep", "rg.exe"),
      "rg.exe"
    );
  } else {
    candidates.push(
      "/usr/bin/rg",
      "/usr/local/bin/rg",
      "/opt/homebrew/bin/rg",
      join(process.env.HOME || "", ".cargo/bin/rg"),
      "rg"
    );
  }

  return candidates;
}

/** Looks for `rg` on the user's PATH using the platform's native lookup command. */
function findOnSystemPath(): string | null {
  try {
    const rgPath = execSync(
      process.platform === "win32" ? "where rg 2>nul" : "which rg 2>/dev/null",
      { encoding: "utf-8", timeout: 3000 }
    )
      .split(/\r?\n/)[0]
      .trim();
    return rgPath || null;
  } catch {
    return null;
  }
}

function tryRg(path: string): Promise<RipgrepInfo | null> {
  return new Promise((resolve) => {
    try {
      execFile(path, ["--version"], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const version = stdout.split("\n")[0]?.trim() || "unknown";
        resolve({ path, version, available: true });
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Confirms ripgrep is available, prompting the user with install guidance
 * when it isn't. Returns true only when a working binary was found.
 */
export async function ensureRipgrep(): Promise<boolean> {
  const info = await detectRipgrep();
  if (info.available) {
    return true;
  }

  const platform = process.platform;
  let installCmd = "";
  const installUrl = "https://github.com/BurntSushi/ripgrep/releases/latest";

  switch (platform) {
    case "win32":
      installCmd = "winget install BurntSushi.ripgrep.MSVC";
      break;
    case "darwin":
      installCmd = "brew install ripgrep";
      break;
    default:
      installCmd = "sudo apt-get install ripgrep";
      break;
  }

  const choice = await vscode.window.showErrorMessage(
    "SearchFast needs ripgrep (rg) to search your files, and it isn't installed yet.",
    { modal: true, detail: `Install with:\n${installCmd}\n\nOr download it from:\n${installUrl}` },
    "Copy Install Command",
    "Open Download Page",
    "Run in Terminal"
  );

  try {
    if (choice === "Copy Install Command") {
      await vscode.env.clipboard.writeText(installCmd);
      vscode.window.showInformationMessage(`Copied to clipboard: ${installCmd}`);
    } else if (choice === "Open Download Page") {
      await vscode.env.openExternal(vscode.Uri.parse(installUrl));
    } else if (choice === "Run in Terminal") {
      const terminal = vscode.window.createTerminal("SearchFast: Install ripgrep");
      terminal.show();
      terminal.sendText(installCmd);
      vscode.window.showInformationMessage(
        'Installing ripgrep. Once it finishes, run "SearchFast: Check Ripgrep Installation" to confirm it worked.'
      );
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `SearchFast could not complete that action: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return false;
}

export function resetCache(): void {
  cachedInfo = null;
}
