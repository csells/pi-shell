# Pi Shell

**A real shell inside [pi](https://github.com/badlogic/pi-mono).**

Pi Shell is a pi extension that makes `!` and `!!` commands behave like a real shell — tab completion, directory tracking, aliases, and all the ergonomics developers expect.

## The Problem

Pi's `!` mode is barely a shell. No tab completion. No aliases. `!cd src` doesn't actually change directory — each command runs in a fresh subprocess, so directory changes evaporate. You end up alt-tabbing to a real terminal for anything beyond the simplest commands.

## What Pi Shell Does

Install the extension, and `!`/`!!` become a proper shell:

| Before (pi today) | After (with pi-shell) |
|---|---|
| `!cd src` does nothing useful | `!cd src` changes cwd, footer updates |
| `!git ch` Tab → files starting with "ch" | `!git ch` Tab → `checkout`, `cherry-pick` |
| `!git checkout` Tab → files | `!git checkout` Tab → `main`, `dev` branches |
| `!docker` Tab → nothing useful | `!docker` Tab → `build`, `run`, `compose` |
| `!npm` Tab → nothing useful | `!npm` Tab → `install`, `test`, `run` |
| Aliases don't work in `!` | Your shell aliases just work |
| Alt-tab for real shell work | Stay in pi |

Pi's built-in Tab only knows about files. Pi Shell delegates to your shell's own completion system (zsh or bash) — so every command that has completions in your terminal works the same way in pi. Only active for `!`/`!!` lines; normal pi input is untouched.

## How It Works

- **No prefix** — talk to the agent (unchanged)
- **`!command`** — real shell with completions, output in LLM context
- **`!!command`** — real shell with completions, output excluded from LLM context

Pi Shell enhances the existing `!`/`!!` mechanism. It doesn't change how pi works — it just makes the shell parts actually good.

## Features

- **Tab completion** — delegates to your shell's completion system (zsh with zpty capture, bash fallback). Every command that completes in your terminal completes in pi.
- **Case-insensitive matching** — `cd s` and `cd S` both match `src/` on macOS
- **Backspace re-matching** — narrow too far? Backspace re-opens completions with the shorter prefix
- **cd tracking** — `!cd`, `!pushd`, `!popd`, `!cd -` all update pi's working directory and footer
- **Aliases** — imports your existing shell aliases automatically
- **Command history** — persistent across sessions, up/down navigation
- **Explain mode** — `!?? command` asks the agent to explain it
- **Fix-on-fail** — failed `!` command? Agent offers to diagnose (skipped for `!!`)
- **Syntax highlighting** — `!cat file.ts` with highlighted output

## Install

```bash
pi install /path/to/pi-shell     # local
pi install github.com/csells/pi-shell  # from git
```

Then restart pi (or `/reload`). The extension loads automatically — no flags needed.

## Requirements

- **zsh** (preferred) — full completion support via zpty capture
- **bash** (fallback) — command and file completions; programmable completions if bash-completion is installed

## Status

✅ **Implemented** — 94 tests passing.

## License

MIT
