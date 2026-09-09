# Installing ripgrep

SearchFast doesn't do the actual searching itself — it hands your query to a tool called **ripgrep** (the command is `rg`) and displays the results. This means you need ripgrep installed on your machine for SearchFast to work.

If you already have VS Code's built-in search working, there's a good chance ripgrep is already on your system somewhere, but VS Code bundles its own private copy that other applications (like this extension) generally can't see or use. So it's worth installing a system-wide copy of your own — it only takes a minute.

You can check whether you already have it by opening a terminal and running:

```
rg --version
```

If that prints a version number, you're already done — you can skip the rest of this page. If it says something like "command not found", follow the instructions for your operating system below.

## Windows

The easiest way is with [winget](https://learn.microsoft.com/windows/package-manager/winget/), which comes built into modern versions of Windows:

```
winget install BurntSushi.ripgrep.MSVC
```

If you use [Scoop](https://scoop.sh/) instead:

```
scoop install ripgrep
```

Or [Chocolatey](https://chocolatey.org/):

```
choco install ripgrep
```

After installing, close and reopen your terminal (and VS Code, if it's open) so the updated system PATH takes effect. Then confirm it worked:

```
rg --version
```

## macOS

The simplest route is [Homebrew](https://brew.sh/):

```
brew install ripgrep
```

If you use [MacPorts](https://www.macports.org/) instead:

```
sudo port install ripgrep
```

Once it finishes, verify:

```
rg --version
```

## Linux

Most package managers carry ripgrep, though the package name is occasionally `rg` instead of `ripgrep`.

**Debian / Ubuntu:**
```
sudo apt-get update
sudo apt-get install ripgrep
```

**Fedora:**
```
sudo dnf install ripgrep
```

**Arch Linux:**
```
sudo pacman -S ripgrep
```

**openSUSE:**
```
sudo zypper install ripgrep
```

**Alpine:**
```
sudo apk add ripgrep
```

If your distribution's repositories only carry an old version, or you'd rather not wait for a package update, you can also install it with Cargo (Rust's package manager) or grab a prebuilt binary directly:

```
cargo install ripgrep
```

Prebuilt binaries for every platform are available on the [ripgrep releases page](https://github.com/BurntSushi/ripgrep/releases/latest) if none of the above suit your setup.

## Confirming it worked

Whichever method you used, the check is the same. Open a terminal and run:

```
rg --version
```

You should see output similar to:

```
ripgrep 14.1.0
```

Then, back in VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
SearchFast: Check Ripgrep Installation
```

SearchFast will confirm it found ripgrep and tell you which version and file path it's using. If it still can't find it, see the section below.

## If SearchFast still can't find ripgrep

This usually comes down to one of two things:

1. **Your terminal's PATH and VS Code's PATH aren't the same.** This can happen if you installed ripgrep after VS Code was already open, or if you're using a shell profile that only loads in interactive terminals. Try fully quitting and reopening VS Code (not just reloading the window), so it picks up your current environment.

2. **Ripgrep is installed somewhere non-standard.** If you installed it to a custom location and don't want to add it to your PATH, you can point SearchFast directly at the binary using the `searchfast.ripgrepPath` setting:

   ```json
   {
     "searchfast.ripgrepPath": "/full/path/to/rg"
   }
   ```

   On Windows this would look something like `"C:\\Tools\\ripgrep\\rg.exe"`.

After changing anything here, run **SearchFast: Check Ripgrep Installation** again to confirm.
