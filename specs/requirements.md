# Pi Shell: Requirements

Technical requirements for implementing pi-shell as a pi extension. Covers the
pi extension API surface needed, gaps to address, activation model, and
implementation structure.

---

## Activation Model: `--shell` Flag

Pi supports custom CLI flags via `pi.registerFlag()`. Pi Shell registers a
`--shell` flag:

```
pi --shell     # Full shell mode
pi             # Normal pi (with lightweight shell fixes)
```

### Behavior Matrix

| Behavior | Without `--shell` | With `--shell` |
|---|---|---|
| `cd dir` | Intercept, update cwd + footer | Same |
| `ls`, `git status` | Pass to agent as normal | Execute locally, skip LLM |
| `"find test files"` | Pass to agent | Pass to agent |
| Tab completion | Pi's default | Shell-style (paths, commands, branches) |
| Prompt | Pi's default | Custom shell prompt (`~/proj (main) λ`) |
| History | Pi's session history | Separate shell history + Ctrl+R |
| Job control | Not available | `&`, Ctrl+Z, `fg`, `bg` |

**Rationale:** Even without the flag, `cd` should work because it's
broken-by-design in every agent today. The flag opts into the full shell
experience. This enables progressive adoption — install the extension, get `cd`
fixed for free, opt into shell mode when ready.

---

## Pi Extension API Surface

### Available — Core Building Blocks

| Requirement | Pi API | How It's Used |
|---|---|---|
| `--shell` flag | `pi.registerFlag()` | Opt-in shell mode |
| Intercept all input | `pi.on("input", ...)` | Intent router: return `"handled"` for shell commands, `"continue"` for agent |
| Intercept `!` commands | `pi.on("user_bash", ...)` | Interactive programs (vim, htop) — `interactive-shell.ts` example does this |
| Custom editor | `ctx.ui.setEditorComponent()` | Tab completion, history nav, shell keybindings — full keystroke control |
| Footer cwd/status | `ctx.ui.setStatus()` | Update cwd + git branch on every `cd` |
| Replace footer entirely | `ctx.ui.setFooter()` | Full shell-style footer |
| Keyboard shortcuts | `pi.registerShortcut()` | Ctrl+R (history search), Ctrl+Z (job control) |
| Execute commands | `pi.exec()` | Run shell commands from the extension |
| Shell builtins | `pi.registerCommand()` | `/alias`, `/history`, `/export` as pi commands |
| Custom output rendering | `pi.registerTool()` + `renderResult` | Syntax-highlighted `cat`, colored `ls` |
| Terminal title | `ctx.ui.setTitle()` | Update with cwd like a real terminal |
| Widgets | `ctx.ui.setWidget()` | Job status bar, completion candidates |
| Interactive programs | `ctx.ui.custom()` + `tui.stop()/start()` | Suspend TUI, hand terminal to vim/htop, resume |
| Persist state | `pi.appendEntry()` | Shell history, aliases, env vars across sessions |
| System prompt injection | `pi.on("before_agent_start", ...)` | Tell the LLM about current shell state (cwd, env, running jobs) |
| Tool control | `pi.setActiveTools()` | Adjust available tools based on shell mode |

### Needs Investigation

| Requirement | Gap | Possible Workaround |
|---|---|---|
| Set pi's cwd | `ctx.cwd` is read-only, no `setCwd()` API | `process.chdir()` may work but bypasses pi's internal tracking |
| Environment persistence | Each `bash()` spawns a new subprocess | Manage env vars in memory, inject via `pi.exec()` env option or `bash -c 'export ...; cmd'` |
| Tab completion UI | No built-in completion dropdown API | `setEditorComponent()` gives full keystroke control — implement completion rendering in the custom editor |
| Background job management | No process lifecycle API in pi | Extension spawns/tracks child processes directly, display via `setWidget()` |
| Pipeline parsing | No shell parser built-in | Bring a dependency (`shell-quote`, `bash-parser`) or write a lightweight parser |

### Likely Needs Pi Upstream Changes

| Requirement | Why |
|---|---|
| **`setCwd(path)`** | The single most critical missing API. Without it, `cd` can't update pi's working directory for subsequent bash tool calls and footer display. `process.chdir()` might work but feels hacky and may not update pi's internal state. |
| **Editor completion popup** | `setEditorComponent()` gives keystroke control, but rendering a dropdown *above* the editor may need overlay support or a new widget placement option. |

---

## Implementation Structure

```
pi-shell/
├── package.json            # Pi package manifest with `pi.extensions`
├── src/
│   ├── index.ts            # Extension entry point — registerFlag, events, setup
│   ├── intent-router.ts    # Shell vs. agent intent detection (heuristics)
│   ├── executor.ts         # Local command execution (PTY or bash -c)
│   ├── completions/
│   │   ├── path.ts         # Filesystem path completion
│   │   ├── command.ts      # Command name completion ($PATH scan)
│   │   ├── git.ts          # Git branch/tag/remote completion
│   │   ├── history.ts      # History-based completion
│   │   └── smart.ts        # Agent-powered contextual completion (Tier 2)
│   ├── expansion/
│   │   ├── glob.ts         # Glob expansion
│   │   ├── env.ts          # Environment variable expansion
│   │   ├── tilde.ts        # Tilde expansion
│   │   └── brace.ts        # Brace expansion
│   ├── editor.ts           # Custom editor (extends CustomEditor) for shell keybindings
│   ├── history.ts          # Persistent command history
│   ├── prompt.ts           # Shell prompt rendering (footer + title)
│   └── jobs.ts             # Background job management
└── README.md
```

### Extension Hooks

| Pi Hook | Pi Shell Usage |
|---|---|
| `pi.registerFlag("shell", ...)` | Enable full shell mode via `--shell` |
| `pi.on("session_start", ...)` | Initialize shell state, restore history/aliases/env, set up editor |
| `pi.on("input", ...)` | Intent router — detect shell vs. agent, execute shell commands directly |
| `pi.on("user_bash", ...)` | Detect interactive programs (vim, htop), suspend TUI and hand over terminal |
| `pi.on("before_agent_start", ...)` | Inject shell context (cwd, env, running jobs) into system prompt |
| `pi.on("session_shutdown", ...)` | Clean up child processes, save history, flush state |
| `ctx.ui.setEditorComponent(...)` | Replace default editor with shell-aware editor (tab completion, history nav) |
| `ctx.ui.setFooter(...)` | Shell-style footer with cwd, git branch, prompt character |
| `ctx.ui.setTitle(...)` | Terminal title reflecting cwd |
| `ctx.ui.setWidget(...)` | Job status, completion candidates |
| `pi.registerShortcut(...)` | Ctrl+R (history search), Ctrl+Z (suspend foreground job) |
| `pi.appendEntry(...)` | Persist shell history and aliases across sessions |

### PTY vs. `bash -c`

Two execution strategies for shell commands:

| Approach | Pros | Cons |
|---|---|---|
| `bash -c "command"` via `pi.exec()` | Simple, no dependency, good enough for most commands | No interactive program support, no job control |
| Spawn a real PTY | Full interactive support (vim, htop), proper job control, signal handling | Complex, platform-specific, resource overhead |

**Recommendation:** Start with `bash -c` for Tier 1. Add PTY for interactive
programs using the `tui.stop()/start()` pattern from `interactive-shell.ts`.

---

## Key Existing Examples

These pi extension examples demonstrate patterns pi-shell will use:

| Example | Relevant Pattern |
|---|---|
| `interactive-shell.ts` | Persistent shell session, `user_bash` event handling |
| `input-transform.ts` | `input` event — intercept, transform, or handle user input |
| `modal-editor.ts` | `CustomEditor` subclass with custom keybindings and mode indicator |
| `ssh.ts` | `registerFlag()` for custom CLI flags, tool operation overrides |
| `plan-mode/` | Complex extension with flag, status, widget, shortcuts, message injection |
| `status-line.ts` | Footer status updates |
| `custom-footer.ts` | Full footer replacement |
