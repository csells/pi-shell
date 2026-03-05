# Pi Shell: Requirements

Technical requirements for implementing pi-shell as a pi extension. Covers the
pi extension API surface, resolved design questions, and implementation
structure.

---

## Design Decisions

### Activation

Pi-shell is a pi extension (package). Install it, and `!`/`!!` become a real
shell. No CLI flag. No mode switching. The extension enhances pi's existing bash
command behavior.

### LLM Context

Same as pi today — no changes:
- `!command` → output included in LLM context
- `!!command` → output excluded from LLM context
- No prefix → talk to the agent

### Alias Import

Import the user's existing shell aliases at startup by running
`$SHELL -ic 'alias'`. This captures aliases from `.bashrc`, `.zshrc`, or
whatever shell the user has configured. No separate pi-shell alias config
needed.

### Shell Expansions (Globs, Env Vars, Tilde, Pipelines)

No special implementation needed. Since pi-shell delegates execution to
`$SHELL -c`, the user's shell handles all expansion and syntax natively:
globs (`*.py`), environment variables (`$HOME`), tilde (`~/`), brace expansion
(`{a,b}`), pipelines (`|`), and redirection (`>`, `>>`).

### Explain Mode (`??`)

`?? command` asks the agent to explain a command. Implementation:

- Intercept via `pi.on("user_bash", ...)` — detect `??` prefix (pi delivers
  `user_bash` with the `!` stripped, so `!!?? cmd` would arrive as `?? cmd`)
- Return `{ result: ... }` to prevent execution
- Inject a user message via `pi.sendUserMessage()` asking the agent to explain
  the command: `"Explain this shell command: <command>"`
- The agent responds with an explanation using its normal context

Alternatively, detect `??` in the `input` event (before `!` parsing) and
transform it into an agent prompt directly.

### Fix-on-Fail

When a `!` command returns non-zero, offer to let the agent diagnose it.

- In the `user_bash` handler, after execution completes with a non-zero exit
  code, use `ctx.ui.confirm()` to ask "Command failed (exit N). Ask the agent
  to diagnose?"
- If confirmed, inject the command and error output into the agent via
  `pi.sendUserMessage()` with a prompt like: "This command failed with exit
  code N: `<command>`. Output: `<output>`. Diagnose the error and suggest a
  fix."
- If declined, do nothing — normal pi behavior

### Smart History

Agent-powered semantic search through shell command history.

- Shell history is persisted via `pi.appendEntry()` (see History section)
- When the user types something like `"that curl command from yesterday"` (no
  `!` prefix), the agent handles it naturally — if the history is in the
  session context, the agent can find it
- For explicit search: `pi.registerCommand("history", ...)` provides a
  `/history` command that shows history with filtering
- Semantic search over history is a stretch goal — requires embedding or
  agent-assisted search

### Inline File Preview

Syntax-highlighted output for `!cat` and `!less`.

- Intercept `cat` and `less` commands in `user_bash`
- Read the file contents using `fs.readFile()`
- Apply syntax highlighting via pi's `highlightCode()` and
  `getLanguageFromPath()` utilities (exported from `@mariozechner/pi-coding-agent`)
- Return the highlighted output as the command result
- For `less`, use the `interactive-shell.ts` pattern (TUI suspend, spawn less
  with stdio inherit) since it's an interactive pager

---

## Resolved Questions

### Shell Compatibility

**Decision:** Don't reimplement a shell. Use `bash -c` (or `$SHELL -c`) for
command execution, which means the user's real shell handles all syntax —
pipelines, redirects, expansion, etc. Pi-shell only needs to:

- Parse enough to detect `cd` and handle it specially
- Provide tab completion (filesystem, commands, git)
- Import aliases from the user's shell

This avoids the impossible task of reimplementing bash/zsh and guarantees
compatibility with the user's existing shell config.

**Dependencies:**
- `shell-quote` (npm, maintained, 1.8.3) — parse and quote shell commands
  for safe argument handling
- No full shell parser needed since actual execution delegates to `$SHELL`

### Performance Budget

| Operation | Target | Approach |
|---|---|---|
| Tab completion | <50ms | Filesystem reads are ~1-5ms. Cache `$PATH` command list at startup. Git branches via `git branch --list`. |
| Intent detection | N/A | No intent detection. `!` prefix is explicit. |
| Alias import | Startup only | Run `$SHELL -ic 'alias'` once on session start, parse output. |
| `cd` handling | <5ms | `process.chdir()` + `setStatus()` + override bash tool cwd. |

### Configuration Migration

**Decision:** Don't parse config files. Import aliases by running the user's
shell interactively (`$SHELL -ic 'alias'`), which sources their config naturally.
This works regardless of shell (bash, zsh, fish) without needing to parse
shell-specific config formats.

Starship prompt support is out of scope for v1. Pi's footer already shows
cwd and git branch.

### Remote Shells

**Decision:** Out of scope for v1. Pi already has an SSH extension example
(`ssh.ts`) that overrides tool operations for remote execution. Pi-shell's `cd`
tracking and tab completion are inherently local. Remote support can layer on
top later.

### Windows Support

**Decision:** Out of scope for v1. Pi runs on macOS and Linux. WSL users
already have a Unix shell. Native PowerShell support is a different product.

### PTY vs. `bash -c`

**Decision:** Use `$SHELL -c` for command execution. Pi already does this for
`!` commands. PTY adds complexity for minimal benefit in `!` mode — interactive
programs (vim, htop) are already handled by pi's `interactive-shell.ts` extension
pattern using `tui.stop()/start()`.

If interactive program support is needed in `!` mode, it can be added later
using the same pattern: detect the command (vim, htop, etc.), suspend TUI,
spawn with inherited stdio, resume on exit.

---

## Pi Extension API Surface

### Available — Core Building Blocks

| Requirement | Pi API | Usage |
|---|---|---|
| Intercept `!`/`!!` commands | `pi.on("user_bash", ...)` | Detect `cd`, provide shell execution with alias support |
| Custom editor for completions | `ctx.ui.setEditorComponent()` | Replace default editor with shell-aware editor that provides tab completions when input starts with `!` |
| Footer cwd update | `ctx.ui.setStatus()` | Update cwd + git branch after every `cd` |
| Terminal title | `ctx.ui.setTitle()` | Reflect current cwd |
| Keyboard shortcuts | `pi.registerShortcut()` | Ctrl+R for shell history search |
| Execute commands | `pi.exec()` | Run shell commands, alias import |
| Persist state | `pi.appendEntry()` | Shell history across sessions |
| System prompt injection | `pi.on("before_agent_start", ...)` | Tell LLM about current cwd, env, recent shell output |
| Override bash tool | `pi.registerTool()` (same name) | Override built-in `bash` tool to use dynamic cwd |
| Session init | `pi.on("session_start", ...)` | Import aliases, restore shell history, set up editor |
| Cleanup | `pi.on("session_shutdown", ...)` | Save shell history |
| Bash tool override | `createBashTool()` + `spawnHook` | Inject dynamic cwd and alias sourcing into LLM bash calls |
| Interactive programs | `pi.on("user_bash", ...)` + `ctx.ui.custom()` | Detect vim/htop, suspend TUI, hand over terminal |
| Widgets | `ctx.ui.setWidget()` | Show completion candidates if needed |

### CWD Tracking — The Key Technical Challenge

Pi has **no `cd` detection and no `setCwd()` API**. The bash tool captures `cwd`
once at creation time via `createBashTool(cwd)` and never changes it. Pi's
internal `_cwd` is set once at startup and is read-only.

**Solution (no upstream changes needed):**

1. **Intercept `cd` in `user_bash` event** — Detect `cd` commands, resolve the
   target directory, call `process.chdir(newDir)`. This works because pi's
   `!` execution uses `process.cwd()` for the working directory.

2. **Override the `bash` tool** — Register a replacement bash tool that uses
   `process.cwd()` dynamically instead of the captured cwd. This ensures
   LLM-invoked `bash()` calls also use the updated directory. Use the
   `createBashTool()` + `spawnHook` pattern from `bash-spawn-hook.ts`.

3. **Update the footer** — Call `ctx.ui.setStatus()` after every `cd` to
   refresh the displayed path and git branch.

4. **Update terminal title** — Call `ctx.ui.setTitle()` with the new cwd.

**Verification:** `process.chdir()` works in Node.js and affects all subsequent
`process.cwd()` calls. Pi's user bash execution (`handleBashCommand`) already
uses `process.cwd()` as the cwd. The bash tool override ensures the LLM's
bash calls also pick up the change.

### Tab Completion in `!` Mode

Pi's editor already detects `!` prefix and sets `isBashMode`. The extension
replaces the editor via `ctx.ui.setEditorComponent()` with a `CustomEditor`
subclass that:

1. Detects when input starts with `!` or `!!`
2. On Tab keypress in bash mode, triggers completion:
   - Parse the current input to find the word being completed
   - Complete paths (readdir), commands ($PATH cache), git branches
3. Renders completions inline (fish-style ghost text) or as a selection list

**Completion sources (in priority order):**
1. **Paths** — `fs.readdir()` relative to cwd. Fast (<5ms).
2. **Commands** — Scan `$PATH` directories at startup, cache the list.
3. **Git refs** — `git branch --list`, `git tag --list`. Cache and refresh on cd.
4. **Aliases** — From the imported alias list.
5. **History** — Match against shell command history.

---

## Implementation Structure

```
pi-shell/
├── package.json            # Pi package manifest with `pi.extensions`
├── src/
│   ├── index.ts            # Extension entry — events, editor, bash override
│   ├── cd.ts               # cd detection, process.chdir, footer/title update
│   ├── completions.ts      # Tab completion (paths, commands, git, aliases)
│   ├── aliases.ts          # Import aliases from $SHELL
│   ├── history.ts          # Shell command history (persist via appendEntry)
│   ├── editor.ts           # CustomEditor subclass with bash-mode completions
│   ├── explain.ts          # ?? explain mode — hand command to agent
│   └── fix-on-fail.ts      # Non-zero exit → offer agent diagnosis
└── README.md
```

### Extension Hooks

| Pi Hook | Pi Shell Usage |
|---|---|
| `pi.on("session_start", ...)` | Import aliases, restore history, cache $PATH commands, set up custom editor |
| `pi.on("user_bash", ...)` | Intercept `cd`, `??`, `cat`/`less`. Source aliases. Detect non-zero exit for fix-on-fail. |
| `pi.on("session_shutdown", ...)` | Save shell history |
| `pi.on("before_agent_start", ...)` | Inject current cwd into agent context |
| `pi.registerTool("bash", ...)` | Override built-in bash tool to use dynamic `process.cwd()` |
| `pi.registerCommand("history", ...)` | Shell history search and display |
| `pi.sendUserMessage(...)` | Inject explain/fix-on-fail prompts into agent |
| `ctx.ui.setEditorComponent(...)` | Custom editor with tab completion in `!` mode |
| `ctx.ui.setStatus(...)` | Update footer with cwd + git branch after cd |
| `ctx.ui.setTitle(...)` | Update terminal title with cwd |
| `ctx.ui.confirm(...)` | Fix-on-fail confirmation dialog |
| `pi.appendEntry(...)` | Persist shell history across sessions |

### Key Existing Examples

Pi extension examples that demonstrate the patterns pi-shell needs:

| Example | Pattern |
|---|---|
| `interactive-shell.ts` | `user_bash` event, interactive program detection, TUI suspend/resume |
| `bash-spawn-hook.ts` | Override bash tool with `createBashTool()` + `spawnHook` for dynamic cwd |
| `modal-editor.ts` | `CustomEditor` subclass with mode detection and custom keybindings |
| `input-transform.ts` | `input` event for intercepting and transforming user input |
| `status-line.ts` | Footer status updates via `setStatus()` |
| `tool-override.ts` | Override built-in tools by registering with the same name |
