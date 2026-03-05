# Pi Shell: Requirements

What pi-shell must do and the design decisions behind it. For implementation
details, see [design.md](design.md).

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

`!cd src` must change pi's working directory. The footer and terminal title
must update immediately. Subsequent `!` commands and agent `bash()` calls must
run in the new directory. Must support `cd -`, `cd ~`, `pushd`, and `popd`.

### Tab Completion

Tab in `!` mode must complete paths, command names, git branches, git
subcommands, and aliases. Must respond in <50ms. Must fall through to pi's
default completions when not in bash mode.

### Alias Import

Import the user's existing shell aliases at startup. Must work without
configuration. Must support bash and zsh.

### Shell Expansions

Globs, environment variables, tilde, brace expansion, pipelines, and
redirection must all work. (Delegated to `$SHELL` — no custom implementation.)

### Explain Mode (`??`)

`!?? command` must hand the command to the agent for explanation instead of
executing it.

### Fix-on-Fail

When a `!` command returns non-zero, offer to let the agent diagnose. Must be
opt-in via confirmation dialog. Must not interrupt `!!` commands.

### Smart History

Shell history for `!` commands must persist across sessions. Must be searchable.
Must feed into tab completion. Up/down arrow must navigate shell history when
in bash mode.

### Inline File Preview

`!cat file.ts` must display syntax-highlighted output. `!less` must hand the
terminal to the real less process.

---

## Resolved Questions

### Shell Compatibility

Don't reimplement a shell. Execute via `$SHELL -ic` for full compatibility
with the user's shell. Pi-shell only parses enough to detect `cd`, `??`, `cat`,
and completion context.

### Performance Budget

| Operation | Target |
|---|---|
| Tab completion | <50ms |
| `cd` handling | <5ms |
| Alias import | Startup only |

### Configuration Migration

Import aliases by running the user's shell interactively. No config file
parsing. Starship prompt support out of scope for v1.

### Out of Scope (v1)

- Remote shells / SSH
- Windows / PowerShell
- PTY management (interactive programs handled by existing pi pattern)
