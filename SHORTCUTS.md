# Keyboard Shortcuts

SearchFast comes with a small set of default shortcuts. None of them are fixed — every one can be changed, removed, or given a second shortcut, using VS Code's regular keybinding system.

## Defaults

| Action | Windows / Linux | macOS | When it works |
|---|---|---|---|
| Search word under cursor | `Ctrl+Alt+F` | `Cmd+Alt+F` | Cursor is inside a text editor |
| Search selected text | `Ctrl+Alt+D` | `Cmd+Alt+D` | Some text is selected in the editor |
| Focus the SearchFast search box | `Ctrl+Alt+S` | `Cmd+Alt+S` | Anywhere |

These are just the defaults SearchFast ships with. If any of them already do something else on your machine, or you'd simply rather use different keys, changing them takes about ten seconds.

## Changing a shortcut

There are two easy ways to get to the right place:

**Option 1 — from the Command Palette:**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **SearchFast: Change Keyboard Shortcuts**. This opens the Keyboard Shortcuts editor, already filtered to SearchFast's commands.

**Option 2 — the manual route:**

1. Open the Keyboard Shortcuts editor (`Ctrl+K Ctrl+S` / `Cmd+K Cmd+S`, or **File → Preferences → Keyboard Shortcuts**).
2. Type `searchfast` into the search box at the top to filter down to just SearchFast's commands.

From either route, once you can see the list:

1. Click the pencil icon next to the command you want to change (or double-click the row).
2. Press the new key combination you want.
3. Press `Enter` to confirm.

To remove a shortcut entirely without replacing it, right-click the command and choose **Remove Keybinding**.

## Adding a second shortcut for the same command

VS Code doesn't limit you to one shortcut per command. If you'd like both the default and something else to trigger the same action, add a new entry directly in your `keybindings.json` (accessible via **Preferences: Open Keyboard Shortcuts (JSON)** in the Command Palette):

```json
{
  "key": "ctrl+shift+f11",
  "command": "searchfast.searchWordUnderCursor",
  "when": "editorTextFocus"
}
```

The available commands are:

- `searchfast.searchWordUnderCursor`
- `searchfast.searchSelectedText`
- `searchfast.focusSearchInput`
- `searchfast.checkRipgrep`
- `searchfast.changeShortcuts`

## Why some shortcuts only work sometimes

You'll notice **Search Word Under Cursor** and **Search Selected Text** only fire while you're focused in a text editor — that's intentional, since they act on your cursor position or current selection, and don't mean anything otherwise. If you'd prefer to loosen or tighten this behavior, edit the `"when"` clause for that binding in `keybindings.json`. Common conditions include:

- `editorTextFocus` — an editor has focus
- `editorHasSelection` — the active editor has a text selection
- `editorFocus` — a broader condition than `editorTextFocus`, also true for diff and notebook editors

You can combine conditions with `&&`, for example `"editorTextFocus && editorHasSelection"`.

## Typing shortcuts, not clicking them

Everything SearchFast can do from a keyboard shortcut can also be triggered from the Command Palette by typing "SearchFast" and picking the action you want — handy if you've forgotten a shortcut, or just don't feel like memorizing one.
