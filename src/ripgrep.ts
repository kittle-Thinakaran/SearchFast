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

export async function detectRipgrep(): Promise<RipgrepInfo> {
  if (cachedInfo) {
    return cachedInfo;
  }

  const config = vscode.workspace.getConfiguration("searchfast");
  const customPath = config.get<string>("ripgrepPath", "");

  const candidates: string[] = [];

  if (customPath && existsSync(customPath)) {
    candidates.push(customPath);
  }

  // VS Code bundles ripgrep — check that first
  const vscodeRg = getBundledRipgrep();
  if (vscodeRg) {
    candidates.push(vscodeRg);
  }

  // Common installation paths
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

  for (const rgPath of candidates) {
    try {
      const result = await tryRg(rgPath);
      if (result) {
        cachedInfo = result;
        return result;
      }
    } catch {
      continue;
    }
  }

  cachedInfo = { path: "", version: "", available: false };
  return cachedInfo;
}

function getBundledRipgrep(): string | null {
  try {
    const rgPath = execSync(
      process.platform === "win32"
        ? 'where rg 2>nul'
        : "which rg 2>/dev/null",
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    return rgPath || null;
  } catch {
    return null;
  }
}

function tryRg(path: string): Promise<RipgrepInfo | null> {
  return new Promise((resolve) => {
    execFile(path, ["--version"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const version = stdout.split("\n")[0]?.trim() || "unknown";
      resolve({ path, version, available: true });
    });
  });
}

export async function ensureRipgrep(): Promise<boolean> {
  const info = await detectRipgrep();
  if (info.available) {
    return true;
  }

  const platform = process.platform;
  let installCmd = "";
  let installUrl = "";

  switch (platform) {
    case "win32":
      installCmd = "winget install BurntSushi.ripgrep.MSVC";
      installUrl = "https://github.com/BurntSushi/ripgrep/releases/latest";
      break;
    case "darwin":
      installCmd = "brew install ripgrep";
      installUrl = "https://github.com/BurntSushi/ripgrep/releases/latest";
      break;
    default:
      installCmd = "sudo apt-get install ripgrep  # or: cargo install ripgrep";
      installUrl = "https://github.com/BurntSushi/ripgrep/releases/latest";
      break;
  }

  const choice = await vscode.window.showErrorMessage(
    `SearchFast Antigravity requires ripgrep (rg) which is not installed.\n\n` +
      `Version: Not found\n` +
      `Install command: ${installCmd}\n\n` +
      `Or download from: ${installUrl}`,
    { modal: true },
    "Copy Install Command",
    "Open Download Page",
    "Install via Package Manager"
  );

  if (choice === "Copy Install Command") {
    await vscode.env.clipboard.writeText(installCmd);
    vscode.window.showInformationMessage(`Copied: ${installCmd}`);
  } else if (choice === "Open Download Page") {
    vscode.env.openExternal(vscode.Uri.parse(installUrl));
  } else if (choice === "Install via Package Manager") {
    try {
      const terminal = vscode.window.createTerminal("SearchFast: Install ripgrep");
      terminal.show();
      terminal.sendText(installCmd);
      vscode.window.showInformationMessage(
        "Installation started. After it completes, run 'SearchFast: Check Ripgrep Installation' to verify."
      );
    } catch {
      vscode.window.showErrorMessage("Could not open terminal. Please install ripgrep manually.");
    }
  }

  return false;
}

export function resetCache(): void {
  cachedInfo = null;
}
