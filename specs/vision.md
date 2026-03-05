# Pi Shell: Vision Document

## The AI Agent That *Is* Your Shell

### The Gap

Today's AI-powered CLI tools — ShellGPT, AIChat, Shell-AI, Mods — all sit *on
top of* or *beside* a traditional shell. They translate natural language into
commands, suggest completions via hotkeys, or pipe output through an LLM. But
none of them **replace** the shell itself.

Meanwhile, developers already live inside agents like pi for hours at a time,
typing commands like `cd ..`, `git remote -v`, and `ls` — and the agent dutifully
wraps them in `bash()` calls. We're effectively using pi as a shell already, just
a very expensive, high-latency one with no completions.

**Pi Shell** closes that gap: a pi extension that makes pi a first-class
interactive shell, with all the ergonomics developers expect from zsh/fish, plus
the intelligence of an AI agent when you want it.

---

## Core Principle

> **Shell-first, agent-second.**
>
> Typing `ls` should feel instant and local — not round-trip through an LLM.
> But typing `"find all the test files that import the auth module"` should
> seamlessly engage the agent. The user never has to switch modes.

---

## Architecture

Pi Shell is a **pi extension** (`pi-shell`) that:

1. **Intercepts the pi input line** before it reaches the LLM.
2. **Detects shell-intent** vs. agent-intent using fast, local heuristics.
3. **Executes shell commands directly** when intent is unambiguous.
4. **Falls through to the agent** for everything else.

```
┌─────────────────────────────────────────────┐
│  Pi TUI Input Line                          │
│  ┌────────────────────────────────────────┐ │
│  │ > git log --oneline -5                 │ │  ← keystrokes
│  └────────────────────────────────────────┘ │
│         │                                   │
│         ▼                                   │
│  ┌──────────────┐   shell?   ┌───────────┐ │
│  │ Intent Router │──────────▶│ Local Exec │ │  ← fast path (no LLM)
│  │              │            └───────────┘ │
│  │              │   agent?   ┌───────────┐ │
│  │              │──────────▶│ Pi Agent   │ │  ← full agent path
│  └──────────────┘            └───────────┘ │
└─────────────────────────────────────────────┘
```

---

## Feature Set

### Tier 1 — Shell Parity (Day 1)

These make pi feel like a real shell. Without them, nobody switches.

| Feature | Description |
|---|---|
| **Tab completion** | Paths, filenames, directories, git branches, command names. Powered by the local filesystem, not the LLM. |
| **Glob expansion** | `*.py`, `**/*.test.ts`, `src/{a,b}/*.rs` — expanded locally before execution. |
| **Environment variables** | `$HOME`, `$PATH`, `${VAR:-default}` — standard POSIX expansion. |
| **Tilde expansion** | `~/Documents`, `~user/` |
| **Command history** | Persistent, searchable (Ctrl+R), per-project and global. |
| **Aliases & functions** | User-defined shortcuts: `alias ll='ls -la'`, shell functions. |
| **Pipelines & redirection** | `|`, `>`, `>>`, `2>&1`, `<()` — parsed and executed locally. |
| **Job control** | `&`, Ctrl+Z, `fg`, `bg`, `jobs` — background process management. |
| **Prompt customization** | Starship-compatible or built-in prompt with git status, node version, k8s context, etc. |
| **cd tracking** | `cd`, `pushd`/`popd`, `cd -` — with pi's working directory staying in sync. |

### Tier 2 — Agent Superpowers (The Reason to Switch)

These are impossible in a traditional shell and justify the migration.

| Feature | Description |
|---|---|
| **Natural language fallback** | If input doesn't parse as a command, ask the agent: `"find large files modified this week"` → `find . -mtime -7 -size +10M` with confirmation. |
| **Explain mode** | `?? awk '{print $3}'` — agent explains the command inline. |
| **Fix-on-fail** | Command returns non-zero? Agent offers to diagnose and suggest a fix. |
| **Smart history** | `"that curl command from yesterday"` — agent searches history semantically. |
| **Context-aware completion** | Tab-complete with awareness of *what you're doing*: completing `docker run -v` suggests recent volume mounts, not random paths. |
| **Pipeline builder** | `"get the top 10 largest node_modules"` → builds a multi-stage pipeline, shows it, executes on Enter. |
| **Inline file preview** | `cat` and `less` with syntax highlighting, powered by pi's existing rendering. |
| **Conversational shell** | Multi-turn: `> find all TODO comments` → (results) → `"now group them by file"` → agent refines. |

### Tier 3 — Ecosystem Integration

| Feature | Description |
|---|---|
| **pi skills in the shell** | Skills like `git-pushing`, `tmux`, `harden` activate contextually. |
| **MCP tool access** | Shell commands can invoke MCP tools directly. |
| **Multi-agent shell** | `pi_messenger` coordination from the command line. |
| **Shell scripts with agent blocks** | `.pish` scripts that mix shell and natural language sections. |

---

## Intent Detection

The critical design challenge: **how does pi know when you're typing a shell
command vs. talking to the agent?**

### Heuristic Rules (fast, local, no LLM)

```
SHELL INTENT (execute directly):
  - Starts with a known command name (binary in $PATH, alias, builtin)
  - Starts with `./ `, `/ `, `~/ `, `$`
  - Contains pipes, redirects, semicolons: `|`, `>`, `>>`, `;`, `&&`, `||`
  - Matches common patterns: `cd ...`, `ls ...`, `git ...`, `docker ...`
  - Starts with `!` (force shell mode): `!echo hello`

AGENT INTENT (send to LLM):
  - Starts with `?` or `??` (force agent mode)
  - Contains natural language indicators (articles, prepositions, question words)
  - Doesn't resolve to any known command
  - Phrased as a question: "how do I...", "what is...", "why did..."
  - Quoted full sentences: "find all the test files that import auth"
```

### Escape Hatches

| Prefix | Behavior |
|---|---|
| `!command` | Always shell — never consult the agent |
| `?query` | Always agent — never try to execute |
| `??command` | Explain this command (agent) |
| (none) | Auto-detect with heuristics |

---

## Implementation as a Pi Extension

```
pi-shell/
├── extension.json          # Pi extension manifest
├── src/
│   ├── shell.ts            # Main extension entry point
│   ├── intent-router.ts    # Shell vs. agent intent detection
│   ├── executor.ts         # Local command execution (PTY-based)
│   ├── completions/
│   │   ├── path.ts         # Filesystem path completion
│   │   ├── command.ts      # Command name completion
│   │   ├── git.ts          # Git branch/tag/remote completion
│   │   ├── history.ts      # History-based completion
│   │   └── smart.ts        # Agent-powered contextual completion
│   ├── expansion/
│   │   ├── glob.ts         # Glob expansion
│   │   ├── env.ts          # Environment variable expansion
│   │   ├── tilde.ts        # Tilde expansion
│   │   └── brace.ts        # Brace expansion
│   ├── history.ts          # Persistent command history
│   ├── prompt.ts           # Customizable shell prompt
│   └── jobs.ts             # Background job management
├── config/
│   └── default.yaml        # Default shell configuration
└── README.md
```

### Extension Hooks

Pi Shell would leverage pi's extension API to:

- **Override input handling** — intercept keystrokes before they reach the agent
- **Custom TUI rendering** — shell prompt, completion menus, job status
- **Lifecycle hooks** — `onActivate` starts the shell session, `onDeactivate`
  cleans up child processes
- **Tool registration** — register `shell_exec` as a tool the agent can call
  with awareness of the shell's state (cwd, env, running jobs)

---

## User Experience

### What It Looks Like

```
~/projects/myapp (main) λ ls src/
auth/  api/  models/  utils/  index.ts

~/projects/myapp (main) λ git log --oneline -3
a1b2c3d feat: add OAuth flow
d4e5f6g fix: token refresh race condition
h7i8j9k chore: upgrade dependencies

~/projects/myapp (main) λ find the files that handle token refresh
  → Agent suggests: rg -l "token.*refresh\|refresh.*token" src/
  → Execute? [Y/n/edit]:

~/projects/myapp (main) λ docker compose up -d &
[1] docker compose up -d (running)

~/projects/myapp (main) λ ?? docker compose up -d
  → Starts all services defined in docker-compose.yml in detached mode.
    Containers run in the background. Use `docker compose logs` to see output.

~/projects/myapp (main) λ "why is the auth test failing"
  → Agent reads test output, analyzes src/auth/, suggests fix...
```

### What It Replaces

| Before | After |
|---|---|
| Open terminal + open pi side by side | Just open pi |
| Copy command from pi → paste in terminal | Type directly in pi |
| Alt-tab to terminal for quick `ls` | `ls` runs inline, instantly |
| `sgpt -s "find large log files"` | `"find large log files"` |
| Separate shell history + pi history | Unified, searchable history |

---

## Open Questions

1. **PTY management** — Should pi-shell spawn a real PTY subprocess, or
   simulate shell execution via `bash -c`? PTY gives better interactive program
   support (vim, top, htop) but adds complexity.

2. **Shell compatibility** — Should we aim for POSIX sh compatibility, bash
   compatibility, or define our own shell language? Users will expect their
   `.bashrc`/`.zshrc` aliases to work.

3. **Performance budget** — Tab completion must respond in <50ms. Intent
   detection must complete in <10ms. Any slower and it feels broken.

4. **Configuration migration** — Can we import from `.zshrc`, `.bashrc`,
   Starship config? Or is a clean break better?

5. **Remote shells** — How does this work over SSH? Can pi-shell be the local
   agent that drives a remote shell session?

6. **Windows support** — PowerShell compatibility? WSL-first?

---

## Why This Matters

The terminal is the last major developer surface that AI hasn't absorbed. IDEs
have Copilot. Browsers have AI assistants. But the shell — where developers
spend a huge portion of their time — still runs the same way it did in 1990.

The projects that exist today (ShellGPT, AIChat, Mods) prove there's demand, but
they all made the same compromise: bolt AI onto the side of an existing shell.
Nobody has tried to **be** the shell.

Pi is uniquely positioned for this because developers already use it as an
interactive command-line environment. Pi Shell just makes that experience native
— instant for simple commands, intelligent for complex ones, and seamless in
between.

---

## Success Criteria

- A developer can use `pi --shell` as their daily driver for one full week
  without needing to open a separate terminal
- Tab completion feels as fast as zsh with `fzf`
- Shell commands execute with zero perceptible overhead vs. running them directly
- At least once per session, the agent saves the developer from a Google search
  or man page lookup
- History, aliases, and environment carry over naturally from their existing
  shell config
