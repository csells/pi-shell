# Pi Shell: Vision Document

## A Real Shell Inside Pi

### The Gap

Developers already live inside pi for hours at a time, typing commands like
`cd ..`, `git remote -v`, and `ls` — and the agent dutifully wraps them in
`bash()` calls. When you need a quick shell command, you reach for pi's `!`
prefix: `!ls`, `!git status`, `!cd src`.

But pi's `!` mode is barely a shell. No tab completion. No aliases. `cd` doesn't
actually change directory — each command runs in a fresh subprocess, so directory
changes evaporate. You end up alt-tabbing to a real terminal for anything beyond
the simplest commands.

**Pi Shell** fixes this: a pi extension that makes `!` and `!!` behave like a
real shell — tab completion, directory tracking, aliases, and all the ergonomics
developers expect.

---

## Core Principle

> **Pi is the primary interface. `!` is a real shell.**
>
> No prefix means you're talking to the agent, exactly as pi works today.
> `!` and `!!` drop you into a proper shell experience — fast, local, with
> completions and state that persists across commands.

---

## Feature Set

### Shell Fundamentals

Make `!` and `!!` feel like a real shell.

| Feature | Description |
|---|---|
| **Tab completion** | Paths, filenames, directories, git branches, command names. Powered by the local filesystem, not the LLM. |
| **cd tracking** | `!cd src` actually changes pi's working directory. The footer updates. Subsequent `!` commands and agent `bash()` calls run in the new directory. `pushd`/`popd`/`cd -` all work. |
| **Aliases** | Import the user's existing shell aliases from their `$SHELL` config at startup. |
| **Environment variables** | `$HOME`, `$PATH`, `${VAR:-default}` — standard expansion. |
| **Tilde expansion** | `~/Documents`, `~user/` |
| **Command history** | Shell history for `!` commands, searchable with Ctrl+R. |
| **Glob expansion** | `*.py`, `**/*.test.ts`, `src/{a,b}/*.rs` — expanded locally. |
| **Pipelines & redirection** | `|`, `>`, `>>`, `2>&1` — executed locally. |

### LLM Context

Same behavior as pi today:

| Prefix | Behavior |
|---|---|
| `!command` | Execute as shell, output included in LLM context |
| `!!command` | Execute as shell, output excluded from LLM context |
| (no prefix) | Talk to the agent |

### Agent Enhancements

Features that layer intelligence on top of the shell experience.

| Feature | Description |
|---|---|
| **Explain mode** | `?? awk '{print $3}'` — agent explains the command inline. |
| **Fix-on-fail** | `!` command returns non-zero? Agent offers to diagnose and suggest a fix. |
| **Smart history** | `"that curl command from yesterday"` — agent searches history semantically. |
| **Inline file preview** | `!cat` and `!less` with syntax highlighting, powered by pi's rendering. |

---

## User Experience

### What It Looks Like

```
> !ls src/
auth/  api/  models/  utils/  index.ts

> !cd src/auth
  (footer updates: ~/projects/myapp/src/auth (main))

> !git log --oneline -3
a1b2c3d feat: add OAuth flow
d4e5f6g fix: token refresh race condition
h7i8j9k chore: upgrade dependencies

> what files handle token refresh?
  → Agent uses bash to search, knows cwd is src/auth...

> !!docker compose up -d
  (runs, output excluded from agent context)

> ?? docker compose up -d
  → Starts all services in detached mode. Use `docker compose logs` to see output.
```

### What Changes

| Before (pi today) | After (with pi-shell) |
|---|---|
| `!cd src` does nothing useful | `!cd src` changes cwd, footer updates |
| `!ls` then tab → nothing | `!ls` then tab → path completions |
| `!git ch` then tab → nothing | `!git ch` then tab → `checkout` |
| Aliases don't work in `!` | Your shell aliases work |
| Alt-tab to terminal for real shell work | Stay in pi |

---

## Why This Matters

Pi is where developers spend their time. But every time they need a quick shell
command with tab completion or a directory change that sticks, they alt-tab to a
terminal. Pi Shell eliminates that context switch by making `!` actually good.

It's not about replacing the shell. It's about making the shell inside pi good
enough that you stop needing a separate terminal window.

---

## Success Criteria

- `!cd` changes the working directory and the footer updates immediately
- Tab completion in `!` mode responds in <50ms and completes paths, commands,
  and git branches
- The user's existing shell aliases work without configuration
- A developer can go a full work session without alt-tabbing to a separate
  terminal for shell commands
