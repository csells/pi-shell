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
| `!nod` Tab → files starting with "nod" | `!nod` Tab → `node`, `nodemon` from $PATH |
| `!git ch` Tab → files starting with "ch" | `!git ch` Tab → `checkout`, `cherry-pick` |
| `!git checkout` Tab → files | `!git checkout` Tab → `main`, `dev` branches |
| `!g` Tab → files starting with "g" | `!g` Tab → your aliases (`gs → git status`) |
| Aliases don't work in `!` | Your shell aliases just work |
| Alt-tab for real shell work | Stay in pi |

Pi's built-in Tab completion only knows about files. Pi Shell replaces it with context-aware completions — commands, aliases, git subcommands, branches — but only for `!`/`!!` lines. Normal pi input is untouched.

## How It Works

- **No prefix** — talk to the agent (unchanged)
- **`!command`** — real shell with completions, output in LLM context
- **`!!command`** — real shell with completions, output excluded from LLM context

Pi Shell enhances the existing `!`/`!!` mechanism. It doesn't change how pi works — it just makes the shell parts actually good.

## Features

- **Tab completion** — paths, commands, git branches, aliases
- **cd tracking** — `!cd` updates pi's working directory and footer
- **Aliases** — imports your existing shell aliases automatically
- **Command history** — persistent, searchable with Ctrl+R
- **Explain mode** — `!?? command` asks the agent to explain it
- **Fix-on-fail** — failed command? Agent offers to diagnose
- **Syntax highlighting** — `!cat file.ts` with highlighted output

## Design

- [specs/vision.md](specs/vision.md) — what and why
- [specs/requirements.md](specs/requirements.md) — feature requirements and resolved design questions
- [specs/design.md](specs/design.md) — technical design with verified pi API mappings and module blueprints

## Install

```bash
pi install /path/to/pi-shell     # local
pi install github.com/csells/pi-shell  # from git
```

Then restart pi. The extension loads automatically — no flags needed.

## Status

✅ **Implemented** — all modules built, 141 tests passing.

## License

MIT
