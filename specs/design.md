# Pi Shell: Technical Design

Implementation blueprint for pi-shell. Every API surface, type signature, and
approach documented here has been verified against the pi source code.

---

## Architecture Overview

Pi-shell is a single pi extension that hooks into four pi systems:

```
┌─────────────────────────────────────────────────────────┐
│ pi-shell extension                                      │
│                                                         │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ user_bash    │  │ Custom   │  │ bash tool        │  │
│  │ handler      │  │ Editor   │  │ override         │  │
│  │              │  │          │  │                  │  │
│  │ • cd         │  │ • Tab    │  │ • spawnHook      │  │
│  │ • ??         │  │   compl. │  │   injects        │  │
│  │ • cat/less   │  │ • !mode  │  │   process.cwd()  │  │
│  │ • execution  │  │   detect │  │   into every     │  │
│  │ • fix-on-fail│  │ • swap   │  │   LLM bash call  │  │
│  │              │  │   provider│  │                  │  │
│  └──────┬───────┘  └────┬─────┘  └────────┬─────────┘  │
│         │               │                  │            │
│  ┌──────┴───────────────┴──────────────────┴─────────┐  │
│  │ Shared state                                      │  │
│  │ • aliases (Map)  • history (array)                │  │
│  │ • $PATH cache    • directory stack                │  │
│  │ • OLDPWD         • git branch cache               │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │                   │
         ▼                    ▼                   ▼
   pi.on("user_bash")  ctx.ui.setEditor   pi.registerTool
   pi.on("session_*")  Component()        ("bash", ...)
   pi.appendEntry()    setStatus/setTitle
```

### Data Flow: `!` Command

```
User types: !git checkout main

  1. Pi detects ! prefix, strips it
  2. Pi fires user_bash event: { command: "git checkout main", ... }
  3. pi-shell handler receives it
  4. NOT cd, NOT ??, NOT cat → normal execution path
  5. Execute via pi.exec($SHELL, ["-ic", command])
  6. Check exit code → non-zero? offer fix-on-fail
  7. Return { result: BashResult } to pi
  8. Pi renders output in TUI (included/excluded from context per !/!!)
```

### Data Flow: `!cd`

```
User types: !cd src/auth

  1. Pi fires user_bash: { command: "cd src/auth", ... }
  2. pi-shell detects cd prefix
  3. Resolve path: path.resolve(process.cwd(), "src/auth")
  4. Verify directory exists: fs.statSync → isDirectory()
  5. process.chdir(resolved)
  6. ctx.ui.setStatus("shell", "~/project/src/auth (main)")
  7. ctx.ui.setTitle("pi - ~/project/src/auth")
  8. Refresh git branch cache (async)
  9. Return { result: { output: "", exitCode: 0, ... } }
```

### Data Flow: Tab Completion

```
User types: !git ch[TAB]

  1. Editor detects Tab keypress
  2. Calls autocompleteProvider.getSuggestions(lines, cursorLine, cursorCol)
  3. ShellAutocompleteProvider.getSuggestions:
     a. Detect ! prefix → bash mode
     b. Extract word at cursor: "ch" after "git "
     c. Detect context: first word is "git" → git subcommand completion
     d. Filter git subcommands matching "ch": ["checkout", "cherry-pick"]
     e. Return { items: [...], prefix: "ch" }
  4. Editor renders SelectList dropdown with matches
  5. User selects "checkout" or presses Tab (auto-apply if single match)
  6. Editor calls applyCompletion → replaces "ch" with "checkout"
```

---

## Module Design

### `index.ts` — Extension Entry Point

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";

export default function piShell(pi: ExtensionAPI) {
  // Shared state
  const state = {
    aliases: new Map<string, string>(),
    pathCommands: new Set<string>(),
    gitBranches: [] as string[],
    gitSubcommands: [] as string[],
    history: [] as string[],
    dirStack: [] as string[],
    oldpwd: process.cwd(),
  };

  // Override bash tool for LLM calls — inject dynamic cwd
  pi.registerTool({
    ...createBashTool(process.cwd(), {
      spawnHook: ({ command, cwd, env }) => ({
        command,
        cwd: process.cwd(),  // always current, not captured
        env,
      }),
    }),
    // Must provide execute that delegates to the created tool
  });

  // Set up custom editor with shell completions
  pi.on("session_start", async (_event, ctx) => {
    // 1. Import aliases
    // 2. Cache $PATH commands
    // 3. Cache git data
    // 4. Restore shell history from session entries
    // 5. Install custom editor with ShellAutocompleteProvider
  });

  // Main ! command handler
  pi.on("user_bash", async (event, ctx) => {
    // Route: cd | ?? | cat/less | normal execution
  });

  // Persist history on shutdown
  pi.on("session_shutdown", async () => {
    // Save history via pi.appendEntry()
  });

  // Inject cwd context for agent
  pi.on("before_agent_start", async (event, ctx) => {
    // Tell agent about current working directory
  });
}
```

### `cd.ts` — Directory Tracking

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

interface CdState {
  oldpwd: string;
  dirStack: string[];
}

interface CdResult {
  success: boolean;
  output: string;
  newCwd?: string;
}

/**
 * Parse and execute a cd/pushd/popd command.
 * Does NOT call process.chdir — caller does that after validation.
 */
export function resolveCD(command: string, state: CdState): CdResult {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const arg = parts[1];

  if (cmd === "cd") {
    return resolveCdTarget(arg, state);
  }
  if (cmd === "pushd") {
    return resolvePushd(arg, state);
  }
  if (cmd === "popd") {
    return resolvePopd(state);
  }
  return { success: false, output: "Not a cd command" };
}

function resolveCdTarget(
  arg: string | undefined,
  state: CdState,
): CdResult {
  let target: string;

  if (!arg || arg === "~") {
    target = homedir();
  } else if (arg === "-") {
    target = state.oldpwd;
  } else if (arg.startsWith("~/")) {
    target = path.join(homedir(), arg.slice(2));
  } else {
    target = path.resolve(process.cwd(), arg);
  }

  // Validate
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return { success: false, output: `cd: not a directory: ${arg}` };
    }
  } catch {
    return { success: false, output: `cd: no such directory: ${arg}` };
  }

  return { success: true, output: "", newCwd: target };
}

function resolvePushd(
  arg: string | undefined,
  state: CdState,
): CdResult {
  const result = resolveCdTarget(arg, state);
  if (result.success) {
    state.dirStack.push(process.cwd());
  }
  return result;
}

function resolvePopd(state: CdState): CdResult {
  if (state.dirStack.length === 0) {
    return { success: false, output: "popd: directory stack empty" };
  }
  const target = state.dirStack.pop()!;
  return { success: true, output: target, newCwd: target };
}

/**
 * Detect if a command starts with cd, pushd, or popd.
 * Handles compound commands: "cd foo && ls" → true (we execute cd,
 * then run the rest normally).
 */
export function isCdCommand(command: string): boolean {
  const trimmed = command.trimStart();
  return /^(cd|pushd|popd)(\s|$)/.test(trimmed);
}

/**
 * Format cwd for display in footer.
 * /Users/chris/projects/myapp → ~/projects/myapp
 */
export function formatCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(home + "/")) return "~" + cwd.slice(home.length);
  return cwd;
}

/**
 * Get current git branch (synchronous, fast).
 */
export function getGitBranch(cwd: string): string | undefined {
  try {
    const head = fs.readFileSync(
      path.join(cwd, ".git", "HEAD"),
      "utf-8",
    ).trim();
    if (head.startsWith("ref: refs/heads/")) {
      return head.slice(16);
    }
    return head.slice(0, 7); // detached HEAD
  } catch {
    // Walk up to find .git
    const parent = path.dirname(cwd);
    if (parent === cwd) return undefined;
    return getGitBranch(parent);
  }
}
```

### `completions.ts` — Shell Autocomplete Provider

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { AutocompleteItem, AutocompleteProvider } from "@mariozechner/pi-tui";

interface ShellState {
  aliases: Map<string, string>;
  pathCommands: Set<string>;
  gitBranches: string[];
  gitSubcommands: string[];
  history: string[];
}

/**
 * AutocompleteProvider for ! bash mode.
 * Returns null when not in bash mode, falling through to pi's default provider.
 */
export class ShellAutocompleteProvider implements AutocompleteProvider {
  private state: ShellState;
  private defaultProvider: AutocompleteProvider | undefined;

  constructor(state: ShellState, defaultProvider?: AutocompleteProvider) {
    this.state = state;
    this.defaultProvider = defaultProvider;
  }

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null {
    const line = lines[cursorLine] || "";

    // Only activate in bash mode (! or !! prefix)
    const bashMatch = line.match(/^(!{1,2})\s*/);
    if (!bashMatch) {
      // Not in bash mode — delegate to default pi provider
      return this.defaultProvider?.getSuggestions(lines, cursorLine, cursorCol) ?? null;
    }

    const bangPrefix = bashMatch[0].length;
    const commandText = line.slice(bangPrefix);
    const cursorInCommand = cursorCol - bangPrefix;

    if (cursorInCommand <= 0) return null;

    // Extract the word being completed
    const beforeCursor = commandText.slice(0, cursorInCommand);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1] || "";
    const isFirstWord = words.filter(w => w).length <= 1 && !beforeCursor.includes(" ");

    let items: AutocompleteItem[];

    if (isFirstWord) {
      // Completing the command name
      items = this.getCommandCompletions(currentWord);
    } else if (words[0] === "git" && words.length === 2) {
      // git subcommand completion
      items = this.getGitSubcommandCompletions(currentWord);
    } else if (words[0] === "git" && this.isGitRefContext(words)) {
      // git branch/tag completion
      items = this.getGitRefCompletions(currentWord);
    } else {
      // Default: path completion
      items = this.getPathCompletions(currentWord);
    }

    return items.length > 0 ? { items, prefix: currentWord } : null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const line = lines[cursorLine] || "";
    const before = line.slice(0, cursorCol - prefix.length);
    const after = line.slice(cursorCol);
    const newLine = before + item.value + after;

    return {
      lines: [...lines.slice(0, cursorLine), newLine, ...lines.slice(cursorLine + 1)],
      cursorLine,
      cursorCol: cursorCol - prefix.length + item.value.length,
    };
  }

  // --- Completion sources ---

  private getCommandCompletions(prefix: string): AutocompleteItem[] {
    const items: AutocompleteItem[] = [];

    // Aliases
    for (const [name, value] of this.state.aliases) {
      if (name.startsWith(prefix)) {
        items.push({ value: name, label: name, description: `→ ${value}` });
      }
    }

    // $PATH commands
    for (const cmd of this.state.pathCommands) {
      if (cmd.startsWith(prefix)) {
        items.push({ value: cmd, label: cmd });
      }
    }

    return items.slice(0, 50); // Cap for performance
  }

  private getPathCompletions(partial: string): AutocompleteItem[] {
    const dir = partial.includes("/")
      ? path.dirname(partial)
      : ".";
    const prefix = partial.includes("/")
      ? path.basename(partial)
      : partial;

    const resolvedDir = path.resolve(process.cwd(), dir);
    try {
      const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
      return entries
        .filter(e => e.name.startsWith(prefix) && !e.name.startsWith("."))
        .map(e => {
          const suffix = e.isDirectory() ? "/" : "";
          const displayPath = dir === "." ? e.name : `${dir}/${e.name}`;
          return {
            value: displayPath + suffix,
            label: e.name + suffix,
            description: e.isDirectory() ? "dir" : undefined,
          };
        })
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  private getGitSubcommandCompletions(prefix: string): AutocompleteItem[] {
    return this.state.gitSubcommands
      .filter(cmd => cmd.startsWith(prefix))
      .map(cmd => ({ value: cmd, label: cmd }));
  }

  private getGitRefCompletions(prefix: string): AutocompleteItem[] {
    return this.state.gitBranches
      .filter(b => b.startsWith(prefix))
      .map(b => ({ value: b, label: b, description: "branch" }));
  }

  private isGitRefContext(words: string[]): boolean {
    // git checkout <branch>, git merge <branch>, git rebase <branch>, etc.
    const refCommands = ["checkout", "switch", "merge", "rebase", "branch", "diff", "log"];
    return words.length >= 2 && refCommands.includes(words[1]);
  }
}

// --- Cache builders ---

export function scanPathCommands(): Set<string> {
  const commands = new Set<string>();
  const dirs = (process.env.PATH || "").split(":");
  for (const dir of dirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        commands.add(entry);
      }
    } catch {}
  }
  return commands;
}

export function getGitBranches(): string[] {
  try {
    const { execSync } = require("node:child_process");
    const output = execSync("git branch --list --format='%(refname:short)'", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
}

export function getGitSubcommands(): string[] {
  try {
    const { execSync } = require("node:child_process");
    const output = execSync("git help -a", { encoding: "utf-8", timeout: 5000 });
    const commands: string[] = [];
    for (const line of output.split("\n")) {
      const match = line.match(/^\s{3}(\S+)/);
      if (match) commands.push(match[1]);
    }
    return commands;
  } catch {
    return [];
  }
}
```

### `editor.ts` — Custom Editor

```typescript
import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme, TUI } from "@mariozechner/pi-tui";
import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { ShellAutocompleteProvider } from "./completions.js";

/**
 * Custom editor that swaps autocomplete provider based on ! prefix.
 *
 * When the user types ! or !! at the start of a line, the editor switches
 * to ShellAutocompleteProvider for shell completions. Otherwise, it uses
 * pi's default provider (slash commands, file paths).
 *
 * The ShellAutocompleteProvider itself handles the fallback — returning
 * null when not in bash mode, which causes the editor to show no
 * completions (the provider swap ensures the right provider is active).
 */
export class ShellEditor extends CustomEditor {
  private shellProvider: ShellAutocompleteProvider;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    shellProvider: ShellAutocompleteProvider,
  ) {
    super(tui, theme, keybindings);
    this.shellProvider = shellProvider;

    // The shell provider handles both modes — it delegates to pi's default
    // completions when not in bash mode, and provides shell completions
    // when in bash mode.
    this.setAutocompleteProvider(this.shellProvider);
  }

  handleInput(data: string): void {
    // All key handling delegated to parent (CustomEditor → Editor)
    // Tab completion is handled by the Editor base class via the provider
    super.handleInput(data);
  }
}
```

### `aliases.ts` — Alias Import

```typescript
import { execSync } from "node:child_process";

/**
 * Import aliases from the user's shell.
 * Runs $SHELL -ic 'alias' with TERM=dumb to suppress escape codes.
 *
 * Verified output format (zsh):
 *   cls=clear
 *   ll='lsd -l'
 *   la='lsd -a'
 *
 * Returns a Map of alias name → expansion.
 */
export function importAliases(): Map<string, string> {
  const aliases = new Map<string, string>();
  const shell = process.env.SHELL || "/bin/sh";

  try {
    const output = execSync(`${shell} -ic 'alias'`, {
      encoding: "utf-8",
      env: { ...process.env, TERM: "dumb" },
      timeout: 5000,
    });

    for (const line of output.split("\n")) {
      // Match: name=value or name='value'
      const match = line.match(/^([a-zA-Z0-9_.-]+)=(.+)$/);
      if (match) {
        const name = match[1];
        let value = match[2];
        // Strip surrounding quotes
        if (
          (value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))
        ) {
          value = value.slice(1, -1);
        }
        aliases.set(name, value);
      }
    }
  } catch {
    // Alias import is best-effort — don't block startup
  }

  return aliases;
}
```

### `history.ts` — Shell History

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ReadonlySessionManager } from "@mariozechner/pi-coding-agent";

const MAX_HISTORY = 1000;
const HISTORY_ENTRY_TYPE = "pi-shell-history";

/**
 * Restore shell history from session entries.
 * Scans for custom entries of type "pi-shell-history".
 */
export function restoreHistory(
  sessionManager: ReadonlySessionManager,
): string[] {
  const commands: string[] = [];

  for (const entry of sessionManager.getEntries()) {
    if (
      entry.type === "custom" &&
      entry.customType === HISTORY_ENTRY_TYPE &&
      Array.isArray(entry.data?.commands)
    ) {
      commands.push(...entry.data.commands);
    }
  }

  // Deduplicate, keep most recent
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (let i = commands.length - 1; i >= 0; i--) {
    if (!seen.has(commands[i])) {
      seen.add(commands[i]);
      deduped.unshift(commands[i]);
    }
  }

  return deduped.slice(-MAX_HISTORY);
}

/**
 * Save shell history to session.
 */
export function saveHistory(
  pi: ExtensionAPI,
  commands: string[],
): void {
  pi.appendEntry(HISTORY_ENTRY_TYPE, {
    commands: commands.slice(-MAX_HISTORY),
  });
}
```

### `explain.ts` — Explain Mode

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BashResult } from "@mariozechner/pi-coding-agent";

/**
 * Detect ?? prefix and route to agent for explanation.
 * Returns null if not a ?? command.
 */
export function handleExplain(
  command: string,
  pi: ExtensionAPI,
): BashResult | null {
  const match = command.match(/^\?\?\s*(.+)/);
  if (!match) return null;

  const shellCommand = match[1].trim();

  // Send to agent as a user message
  pi.sendUserMessage(
    `Explain this shell command concisely:\n\`\`\`\n${shellCommand}\n\`\`\``,
  );

  // Return empty result to prevent shell execution
  return {
    output: "",
    exitCode: 0,
    cancelled: false,
    truncated: false,
  };
}
```

### `fix-on-fail.ts` — Fix on Failure

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Offer agent diagnosis when a command fails.
 * Returns true if the user accepted and a diagnosis was requested.
 */
export async function offerFixOnFail(
  command: string,
  output: string,
  exitCode: number,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<boolean> {
  if (exitCode === 0 || !ctx.hasUI) return false;

  const confirmed = await ctx.ui.confirm(
    `Command failed (exit ${exitCode})`,
    "Ask the agent to diagnose?",
  );

  if (!confirmed) return false;

  // Truncate output for context
  const truncated = output.length > 2000
    ? output.slice(-2000) + "\n...(truncated)"
    : output;

  pi.sendUserMessage(
    `This shell command failed with exit code ${exitCode}:\n` +
    `\`\`\`\n${command}\n\`\`\`\n` +
    `Output:\n\`\`\`\n${truncated}\n\`\`\`\n` +
    `Diagnose the error and suggest a fix.`,
  );

  return true;
}
```

### `preview.ts` — Inline File Preview

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import type { BashResult } from "@mariozechner/pi-coding-agent";

/**
 * Intercept `cat <file>` and return syntax-highlighted output.
 * Returns null if not a cat command or file doesn't exist.
 */
export function handleCat(command: string): BashResult | null {
  // Simple detection — doesn't handle cat with flags
  const match = command.match(/^cat\s+(\S+)\s*$/);
  if (!match) return null;

  const filePath = match[1];
  const resolved = path.resolve(process.cwd(), filePath);

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    const lang = getLanguageFromPath(resolved);
    const lines = lang
      ? highlightCode(content, lang)
      : content.split("\n");

    return {
      output: lines.join("\n"),
      exitCode: 0,
      cancelled: false,
      truncated: false,
    };
  } catch (err: any) {
    return {
      output: `cat: ${filePath}: ${err.code === "ENOENT" ? "No such file or directory" : err.message}`,
      exitCode: 1,
      cancelled: false,
      truncated: false,
    };
  }
}
```

---

## Pi API Reference

Types and signatures verified against the pi source code.

### UserBashEvent / UserBashEventResult

```typescript
// Source: core/extensions/types.d.ts
interface UserBashEvent {
  type: "user_bash";
  command: string;              // ! stripped, e.g. "cd src" from "!cd src"
  excludeFromContext: boolean;  // true if !! prefix
  cwd: string;
}

interface UserBashEventResult {
  operations?: BashOperations;  // custom ops for execution
  result?: BashResult;          // full replacement — skip default execution
}
```

### BashResult

```typescript
// Source: core/bash-executor.d.ts
interface BashResult {
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}
```

### AutocompleteProvider

```typescript
// Source: pi-tui/autocomplete.d.ts
interface AutocompleteItem {
  value: string;
  label: string;
  description?: string;
}

interface AutocompleteProvider {
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null;

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number };
}
```

### CustomEditor

```typescript
// Source: modes/interactive/components/custom-editor.d.ts
class CustomEditor extends Editor {
  handleInput(data: string): void;  // override for custom key handling
}

// Inherited from Editor:
//   setAutocompleteProvider(provider: AutocompleteProvider): void
//   onChange?: (text: string) => void
//   addToHistory(text: string): void
//   getText(): string
//   setText(text: string): void
```

### createBashTool + spawnHook

```typescript
// Source: core/tools/bash.js
function createBashTool(cwd: string, options?: {
  operations?: BashOperations;
  commandPrefix?: string;
  spawnHook?: (context: {
    command: string;
    cwd: string;
    env: Record<string, string>;
  }) => {
    command: string;
    cwd: string;
    env: Record<string, string>;
  };
}): ToolDefinition;
```

### Syntax Highlighting

```typescript
// Source: modes/interactive/theme/theme.d.ts
// Exported from "@mariozechner/pi-coding-agent"
function highlightCode(code: string, lang?: string): string[];
function getLanguageFromPath(filePath: string): string | undefined;
```

### Extension Context UI

```typescript
// Used by pi-shell:
ctx.ui.setStatus(key: string, text: string | undefined): void;
ctx.ui.setTitle(title: string): void;
ctx.ui.confirm(title: string, message: string): Promise<boolean>;
ctx.ui.setEditorComponent(
  factory: (tui, theme, keybindings) => CustomEditor
): void;
```

---

## File Structure

```
pi-shell/
├── package.json
│   {
│     "name": "pi-shell",
│     "pi": { "extensions": ["./src/index.ts"] },
│     "dependencies": { "shell-quote": "^1.8.3" },
│     "peerDependencies": {
│       "@mariozechner/pi-coding-agent": "*",
│       "@mariozechner/pi-tui": "*",
│       "@sinclair/typebox": "*"
│     }
│   }
├── src/
│   ├── index.ts          # Extension entry, event wiring, bash tool override
│   ├── cd.ts             # cd/pushd/popd resolution, cwd formatting, git branch
│   ├── completions.ts    # ShellAutocompleteProvider, $PATH/git cache builders
│   ├── editor.ts         # ShellEditor (CustomEditor subclass)
│   ├── aliases.ts        # Import aliases from $SHELL
│   ├── history.ts        # Persist/restore shell history
│   ├── explain.ts        # ?? handler → sendUserMessage
│   ├── fix-on-fail.ts    # Non-zero exit → confirm → sendUserMessage
│   └── preview.ts        # cat → highlightCode
└── README.md
```

---

## Performance Characteristics

All measurements taken on macOS, Apple Silicon, with zsh as default shell.

| Operation | Time | Method | When |
|---|---|---|---|
| `$PATH` scan | ~45ms | `fs.readdirSync` per $PATH dir | Startup (cached) |
| Git branches | ~38ms | `git branch --list` | Startup + after cd (cached) |
| Git subcommands | ~24ms | `git help -a` | Startup (cached) |
| Alias import | ~100ms | `TERM=dumb $SHELL -ic 'alias'` | Startup (one-time) |
| Path completion | ~1-5ms | `fs.readdirSync` on cwd | Per Tab keypress |
| `cd` (process.chdir) | ~0ms | Synchronous Node.js API | Per cd command |
| Git branch (read .git/HEAD) | ~0ms | `fs.readFileSync` | After cd |
| Command match | ~0ms | Set/Map lookup | Per Tab keypress |

**Startup total:** ~200ms for all caches. Non-blocking — extension registers
handlers immediately, caches populate async.
