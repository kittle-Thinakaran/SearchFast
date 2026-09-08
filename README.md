# SearchFast Antigravity

Ultra-fast file and content search for VS Code, powered by [ripgrep](https://github.com/BurntSushi/ripgrep).

## Why Ripgrep?

Ripgrep (`rg`) is **10x-100x faster** than traditional grep. It:
- Auto-skips `.gitignore`d files
- Uses parallel regex matching
- Supports Unicode
- Has zero-config smart defaults

## Install Ripgrep

SearchFast requires `rg` to be installed on your system.

| Platform | Command |
|----------|---------|
| **Windows** | `winget install BurntSushi.ripgrep.MSVC` |
| **macOS** | `brew install ripgrep` |
| **Linux (Debian/Ubuntu)** | `sudo apt-get install ripgrep` |
| **Linux (Fedora)** | `sudo dnf install ripgrep` |
| **Linux (Arch)** | `sudo pacman -S ripgrep` |
| **Cargo (any)** | `cargo install ripgrep` |

Or download from [GitHub Releases](https://github.com/BurntSushi/ripgrep/releases/latest).

> If ripgrep is not found, the extension will prompt you with install instructions.

## Features

### Quick Search (`Ctrl+Alt+F` / `Cmd+Alt+F`)
Instant full-text search across your workspace.

### Regex Search (`Ctrl+Alt+R` / `Cmd+Alt+R`)
Pattern-based search with full regex support.

### Advanced Search (`Ctrl+Alt+G` / `Cmd+Alt+G`)
Multi-step search with filters:
- Case sensitivity
- Whole word matching
- File glob patterns
- Custom exclusions
- Context lines
- Hidden file inclusion

### Search by File Type
Filter searches by language/extension.

### Search by File Size
Find files within size ranges.

### Search Word Under Cursor (`Ctrl+Alt+D`)
Instantly search for the word at your cursor position.

### Search Selected Text
Right-click selected text to search for it.

## Results Panel

Results appear in the **SearchFast sidebar** (activity bar) as a tree:
- Grouped by file
- Line numbers with clickable navigation
- Match highlighting
- Summary with duration and file count

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `searchfast.ripgrepPath` | `""` | Custom path to rg binary |
| `searchfast.maxResults` | `5000` | Max results before truncation |
| `searchfast.contextLines` | `2` | Context lines around matches |
| `searchfast.caseSensitive` | `false` | Default case sensitivity |
| `searchfast.wholeWord` | `false` | Default whole word matching |
| `searchfast.useRegex` | `false` | Default regex mode |
| `searchfast.followSymlinks` | `false` | Follow symlinks |
| `searchfast.hiddenFiles` | `false` | Include hidden files |
| `searchfast.respectGitignore` | `true` | Honor .gitignore |
| `searchfast.defaultExcludes` | `[...]` | Patterns to always exclude |
| `searchfast.enableHighlight` | `true` | Highlight matches in results |

## Performance

- Streams results as they arrive (no waiting for full search)
- Uses `--json` output for reliable, fast parsing
- `--max-count` per file prevents runaway single-file matches
- Cancels instantly via `SearchFast: Clear Results`
- Zero unnecessary dependencies

## License

MIT
