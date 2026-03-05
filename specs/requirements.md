# Pi Shell: Requirements

Technical requirements for implementing pi-shell as a pi extension. All API
surfaces and implementation approaches have been verified against the pi source.

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

---

## Feature Requirements

### CWD Tracking

**The problem:** Pi has no `cd` detection. The bash tool captures `cwd` once at
creation time via `createBashTool(cwd)` and never changes it. Pi's internal
`_cwd` is set once at startup. `process.cwd()` is used for `!` user bash
commands but there's no mechanism to update it.

**Verified solution (no upstream changes needed):**

1. **Intercept `cd` in `user_bash` event.** The `UserBashEvent` has
   `{ command, excludeFromContext, cwd }`. Return `{ result: BashResult }` to
   prevent default execution. `BashResult` is
   `{ output, exitCode, cancelled, truncated }`.

2. **Call `process.chdir(resolved)`.** Verified: this works in Node.js and
   affects all subsequent `process.cwd()` calls. Pi's `handleBashCommand`
   already uses `process.cwd()` for the cwd of user bash execution.

3. **Override the `bash` tool** for LLM-invoked commands. Use
   `createBashTool()` with a `spawnHook` that injects `process.cwd()` as the
   cwd. The `bash-spawn-hook.ts` example demonstrates this exact pattern:
   ```typescript
   createBashTool(process.cwd(), {
     spawnHook: ({ command, cwd, env }) => ({
       command,
       cwd: process.cwd(), // dynamic, not captured
       env,
     }),
   });
   ```

4. **Update footer** via `ctx.ui.setStatus()` and **title** via
   `ctx.ui.setTitle()` after every `cd`.

**cd edge cases to handle:**
- `cd` with no args → `$HOME`
- `cd -` → previous directory (extension tracks `OLDPWD`)
- `cd ~` / `cd ~/path` → home directory expansion
- `pushd` / `popd` → extension maintains a directory stack
- Relative paths → resolve against `process.cwd()`
- Nonexistent directory → return error result, don't change cwd

### Tab Completion

**The key finding:** Pi's `Editor` base class already has a built-in
autocomplete system. It provides:

- `setAutocompleteProvider(provider: AutocompleteProvider)` — accepts a custom
  provider
- `AutocompleteProvider` interface with `getSuggestions()` and
  `applyCompletion()`
- Built-in rendering of completion dropdown (via `SelectList`)
- Tab key handling that calls the provider automatically
- Single-result auto-apply on Tab

The extension does NOT need to build completion UI. It only needs to implement
`AutocompleteProvider` for shell completions.

**Implementation:**

1. Create a `ShellAutocompleteProvider` implementing `AutocompleteProvider`:
   ```typescript
   interface AutocompleteProvider {
     getSuggestions(lines: string[], cursorLine: number, cursorCol: number):
       { items: AutocompleteItem[], prefix: string } | null;
     applyCompletion(lines: string[], cursorLine: number, cursorCol: number,
       item: AutocompleteItem, prefix: string):
       { lines: string[], cursorLine: number, cursorCol: number };
   }
   ```

2. In `getSuggestions`, detect `!`/`!!` prefix. If present, extract the word
   at cursor and return completions. If not in bash mode, return `null` to
   fall through to pi's default completions.

3. Subclass `CustomEditor` and swap the autocomplete provider via
   `this.setAutocompleteProvider()`. Use `onChange` callback to detect when
   the user enters/exits bash mode and swap providers accordingly.

**Completion sources (verified performance):**
- **Paths** — `fs.readdirSync()` relative to `process.cwd()`. ~1-5ms.
- **Commands** — Scan `$PATH` directories at startup, cache. 2173 commands
  in ~45ms on this machine. One-time cost, cached thereafter.
- **Git branches** — `git branch --list`. ~38ms. Cache, refresh on `cd`.
- **Git subcommands** — `git help -a`. ~24ms. Cache at startup.
- **Aliases** — From the imported alias map. Instant (in-memory).

### Alias Import

**Verified approach:** Run `TERM=dumb $SHELL -ic 'alias'` at startup.

- `TERM=dumb` suppresses iTerm2/shell integration escape codes that pollute
  output
- Output format (zsh): `name=value` or `name='value with spaces'`
- Parse with simple regex: `/^([^=]+)=(.+)$/` per line
- Store as `Map<string, string>`

**Using aliases in execution:** The `createBashTool` `commandPrefix` option
prepends text to every command. Set it to `shopt -s expand_aliases; source
~/.bashrc` (or equivalent for the user's shell). Alternatively, execute via
`$SHELL -ic 'command'` which sources the interactive config and loads aliases.

### Shell Expansions

No implementation needed. Since execution delegates to `$SHELL -c` (or
`$SHELL -ic` for alias support), the user's shell handles all syntax natively:
globs, env vars, tilde, brace expansion, pipelines, redirection.

### Explain Mode (`??`)

Intercept in `user_bash` handler. Pi strips the `!` prefix before firing the
event, so `!?? ls -la` arrives as `?? ls -la`.

- Detect `??` prefix in `event.command`
- Return `{ result: { output: "", exitCode: 0, cancelled: false, truncated: false } }` to prevent execution
- Call `pi.sendUserMessage("Explain this shell command: ls -la")` to hand to
  the agent

### Fix-on-Fail

The `user_bash` handler can perform execution itself and inspect the result.

- Execute the command via `pi.exec(shell, ["-c", command])`
- Check `result.code` for non-zero exit
- If failed and `ctx.hasUI`, call `ctx.ui.confirm()` to ask the user
- If confirmed, call `pi.sendUserMessage()` with the command and error output
- Return `{ result: BashResult }` with the execution output

**Note:** This means pi-shell handles execution for ALL `!` commands (not just
`cd`), which gives us control over alias sourcing, exit code inspection, and
output formatting.

### Smart History

- Persist shell history via `pi.appendEntry("shell-history", { commands: [...] })`
- Restore on `session_start` by scanning `ctx.sessionManager.getEntries()`
- Register `/history` command via `pi.registerCommand()` for search/display
- Feed history into the `ShellAutocompleteProvider` for Tab completion
- The `Editor` base class already has `addToHistory()` for up/down arrow
  navigation — call it after each `!` command

### Inline File Preview

`highlightCode()` and `getLanguageFromPath()` are verified exports from
`@mariozechner/pi-coding-agent`:

```typescript
highlightCode(code: string, lang?: string): string[]
getLanguageFromPath(filePath: string): string | undefined
```

- Intercept `cat <file>` in `user_bash`
- Read file via `fs.readFileSync()`
- Detect language: `getLanguageFromPath(filePath)`
- Highlight: `highlightCode(content, lang)`
- Return as `{ result: { output: highlighted.join("\n"), ... } }`
- For `less`, use `ctx.ui.custom()` + `tui.stop()/start()` pattern from
  `interactive-shell.ts` to hand terminal to the real `less` process

---

## Resolved Questions

### Shell Compatibility

**Decision:** Don't reimplement a shell. Execute via `$SHELL -ic` which gives
full compatibility with the user's shell (bash, zsh, fish). Pi-shell only needs
to parse enough to detect `cd`, `??`, `cat`, and completion context.

**Dependencies:**
- `shell-quote` (npm, 1.8.3) — parse shell commands for safe argument splitting
  in the completion engine. NOT needed for execution (that's delegated to
  `$SHELL`).

### Performance Budget

| Operation | Target | Verified |
|---|---|---|
| Tab completion (paths) | <50ms | ~1-5ms via `fs.readdirSync()` |
| Tab completion (commands) | <50ms | ~45ms startup scan of $PATH (2173 commands), then instant from cache |
| Tab completion (git) | <50ms | ~38ms for `git branch --list`, cached |
| Alias import | Startup only | `TERM=dumb $SHELL -ic 'alias'` |
| `cd` handling | <5ms | `process.chdir()` is synchronous, ~0ms |

### Configuration Migration

**Decision:** Import aliases via `TERM=dumb $SHELL -ic 'alias'`. This sources
the user's shell config naturally without parsing `.zshrc`/`.bashrc`. Verified
working with zsh — output is `name=value` format, one per line.

Starship prompt support: out of scope for v1.

### Remote Shells / Windows / PTY

All out of scope for v1. See vision doc for future considerations.

---

## Implementation Structure

```
pi-shell/
├── package.json            # Pi package manifest with pi.extensions
├── src/
│   ├── index.ts            # Extension entry — events, editor, bash override
│   ├── cd.ts               # cd/pushd/popd detection, process.chdir, footer update
│   ├── completions.ts      # ShellAutocompleteProvider (paths, commands, git, aliases)
│   ├── aliases.ts          # Import aliases via TERM=dumb $SHELL -ic 'alias'
│   ├── history.ts          # Shell history (persist via appendEntry, restore on start)
│   ├── editor.ts           # CustomEditor subclass — swap autocomplete in bash mode
│   ├── explain.ts          # ?? prefix → sendUserMessage to agent
│   ├── fix-on-fail.ts      # Non-zero exit → confirm → sendUserMessage
│   └── preview.ts          # cat interception → highlightCode
└── README.md
```

### Extension Hook Map

| Pi Hook | Usage |
|---|---|
| `pi.on("session_start", ...)` | Import aliases, restore history, cache $PATH, set up custom editor |
| `pi.on("user_bash", ...)` | Main handler: intercept cd, ??, cat/less. Execute all other commands with alias support. Inspect exit code for fix-on-fail. |
| `pi.on("session_shutdown", ...)` | Save shell history |
| `pi.on("before_agent_start", ...)` | Inject current cwd into agent context |
| `pi.registerTool("bash", ...)` | Override built-in bash tool with dynamic `process.cwd()` via `spawnHook` |
| `pi.registerCommand("history", ...)` | Shell history search and display |
| `pi.sendUserMessage(...)` | Inject explain/fix-on-fail prompts into agent |
| `ctx.ui.setEditorComponent(...)` | Custom editor with `ShellAutocompleteProvider` in bash mode |
| `ctx.ui.setStatus(...)` | Update footer with cwd + git branch after cd |
| `ctx.ui.setTitle(...)` | Update terminal title with cwd |
| `ctx.ui.confirm(...)` | Fix-on-fail confirmation dialog |
| `pi.appendEntry(...)` | Persist shell history across sessions |

### Verified Pi APIs

| API | Source | Verified How |
|---|---|---|
| `UserBashEvent` / `UserBashEventResult` | `core/extensions/types.d.ts` | Read type definitions — `{ result: BashResult }` prevents default execution |
| `BashResult` | `core/bash-executor.d.ts` | `{ output, exitCode, cancelled, truncated, fullOutputPath? }` |
| `AutocompleteProvider` | `pi-tui/autocomplete.d.ts` | `getSuggestions()` + `applyCompletion()` interface |
| `Editor.setAutocompleteProvider()` | `pi-tui/components/editor.d.ts` | Public method on base Editor class |
| `Editor.onChange` | `pi-tui/components/editor.d.ts` | Callback fired on text changes — used to detect `!` prefix |
| `Editor.addToHistory()` | `pi-tui/components/editor.d.ts` | Adds to up/down arrow history |
| `CustomEditor` | `modes/interactive/components/custom-editor.d.ts` | Extends `Editor`, `handleInput()` is overridable |
| `createBashTool()` + `spawnHook` | `core/tools/bash.js` | `spawnHook` receives `{ command, cwd, env }`, returns modified values |
| `highlightCode()` | `modes/interactive/theme/theme.d.ts` | Exported from `@mariozechner/pi-coding-agent` |
| `getLanguageFromPath()` | `modes/interactive/theme/theme.d.ts` | Exported from `@mariozechner/pi-coding-agent` |
| `process.chdir()` | Node.js | Tested — updates `process.cwd()` globally |
| `$PATH` scan | Node.js `fs.readdirSync` | Tested — 2173 commands in 45ms |
| Alias import | `TERM=dumb zsh -ic 'alias'` | Tested — clean `name=value` output |
