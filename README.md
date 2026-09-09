# SearchFast

SearchFast is a search sidebar for VS Code that finds text across your whole workspace, fast. It's built on top of [ripgrep](https://github.com/BurntSushi/ripgrep), the same search engine VS Code uses internally, so it stays quick even in large projects.

The idea behind it is simple: open the sidebar, start typing, and see results appear as you type. No extra clicks, no waiting around for a search button.

## What it does

- **Searches as you type.** Results start showing up a moment after you stop typing — there's no "Search" button to click.
- **Jumps straight to the match.** Click any result and the file opens with the matching line selected and briefly highlighted.
- **Search word under cursor or selected text**, using a keyboard shortcut, without touching the mouse.
- **Find and replace across files.** Not just search — SearchFast can also replace matches, either across the whole workspace or in a single file, with a confirmation step first so you don't accidentally rewrite half your codebase.
- **The usual search filters**, done properly: match case, whole word, and regular expressions, plus file include/exclude patterns and context lines for a bit more surrounding code.
- **Everything is keyboard accessible**, and every shortcut can be changed to whatever you're comfortable with.

## Getting started

1. Install [ripgrep](https://github.com/BurntSushi/ripgrep) if you don't already have it. See [INSTALLATION.md](./INSTALLATION.md) for step-by-step instructions for your operating system.
2. Open a folder or workspace in VS Code.
3. Open the SearchFast sidebar from the Activity Bar, or run **SearchFast: Focus Search Box** from the Command Palette.
4. Start typing. That's it.

If ripgrep isn't installed, SearchFast will tell you as soon as you try to search, and it'll offer to help you install it — it won't just fail silently.

## Using the search box

Type your query into the box at the top of the sidebar. By default, SearchFast waits a short moment after you stop typing before it searches (this avoids firing off a search on every single keystroke, which would be wasteful). If you don't want to wait, press **Enter** to search immediately.

Three toggles sit just under the search box:

| Toggle | What it does |
|---|---|
| `Aa` | Match case exactly as typed |
| `ab` | Match whole words only, so searching for `log` won't match `catalogue` |
| `.*` | Treat your search text as a regular expression |

Click **Filters** to reveal more options: which files to include, which to exclude, and how many lines of surrounding context to show around each match.

## Searching from your code

Instead of typing a query by hand, you can search for whatever your cursor is touching:

- Put your cursor on a word and press the shortcut for **Search Word Under Cursor**.
- Select some text and press the shortcut for **Search Selected Text**.

Both immediately drop the text into the search box and run the search. See [SHORTCUTS.md](./SHORTCUTS.md) for the default key combinations and how to change them.

## Replacing text

Click the replace icon next to the search box to reveal a second input field. Type what you want to replace matches with, then either:

- Click **Replace All** to replace every match across the workspace, or
- Click the small replace icon next to a specific file's results to replace matches in just that file.

Before anything is written to disk, SearchFast shows you how many files will be affected and asks you to confirm. This isn't a step you can skip by accident — it's there because editing files directly can't be undone with a simple Ctrl+Z once VS Code has closed those files. If you're working in a Git repository, it's a good habit to commit your current work before running a large replace, just in case you want to compare or revert afterward.

## Settings

SearchFast can be configured from **Settings → Extensions → SearchFast**, or by editing your `settings.json` directly. A few worth knowing about:

- `searchfast.liveSearchDelay` — how long (in milliseconds) SearchFast waits after you stop typing before searching automatically. Default is 300ms.
- `searchfast.minQueryLength` — how many characters you need to type before an automatic search kicks in. Default is 2. Pressing Enter always searches regardless of this.
- `searchfast.confirmBeforeReplace` — whether SearchFast asks for confirmation before replacing text. This defaults to on, and we'd recommend leaving it that way.
- `searchfast.respectGitignore`, `searchfast.hiddenFiles`, `searchfast.defaultExcludes` — control which files get searched by default.

## Why ripgrep?

Ripgrep is a command-line search tool written in Rust. It's what VS Code's own built-in search uses under the hood, and it's genuinely one of the fastest text search tools available — it skips files listed in `.gitignore` automatically, understands most file encodings, and can search gigabytes of code without breaking a sweat. SearchFast is essentially a friendly sidebar wrapped around it.

## Troubleshooting

**"ripgrep was not found"** — SearchFast couldn't locate an `rg` binary on your system. Run **SearchFast: Check Ripgrep Installation** from the Command Palette, or follow [INSTALLATION.md](./INSTALLATION.md).

**Search feels slow** — this is almost always a sign that ripgrep is scanning far more files than expected, often because `.gitignore` isn't being respected or a `node_modules`-style folder is being searched. Check the `searchfast.respectGitignore` setting and your exclude patterns.

**A replace didn't do what I expected** — double-check your Match Case, Whole Word, and Regex toggles before replacing; they affect replacements the same way they affect search. If in doubt, run the search first, look through the highlighted results, and only then switch to replace.

## Feedback

Found a bug, or something feels clunky? Open an issue on the repository — real-world feedback is what makes an extension like this better over time.
