import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "@mariozechner/pi-tui";

export interface ShellState {
  aliases: Map<string, string>;
  pathCommands: Set<string>;
  gitBranches: string[];
  gitSubcommands: string[];
  history: string[];
}

/**
 * AutocompleteProvider for ! bash mode.
 * Returns null when not in bash mode, allowing the editor to delegate
 * to pi's default provider for slash commands and other completions.
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
    cursorCol: number
  ): { items: AutocompleteItem[]; prefix: string } | null {
    const line = lines[cursorLine] || "";

    // Only activate in bash mode (! or !! prefix)
    const bashMatch = line.match(/^(!{1,2})\s*/);
    if (!bashMatch) {
      // Not in bash mode — delegate to default pi provider
      return (
        this.defaultProvider?.getSuggestions(lines, cursorLine, cursorCol) ??
        null
      );
    }

    const bangPrefix = bashMatch[0].length;
    const commandText = line.slice(bangPrefix);
    const cursorInCommand = cursorCol - bangPrefix;

    if (cursorInCommand <= 0) return null;

    // Extract the word being completed
    const beforeCursor = commandText.slice(0, cursorInCommand);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1] || "";
    const nonEmptyWords = words.filter((w) => w);
    const isFirstWord =
      nonEmptyWords.length <= 1 && !beforeCursor.trim().includes(" ");

    let items: AutocompleteItem[];

    if (isFirstWord) {
      // Completing the command name
      items = this.getCommandCompletions(currentWord);
    } else if (
      nonEmptyWords[0] === "git" &&
      nonEmptyWords.length === 2
    ) {
      // git subcommand completion
      items = this.getGitSubcommandCompletions(currentWord);
    } else if (nonEmptyWords[0] === "git" && this.isGitRefContext(nonEmptyWords)) {
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
    prefix: string
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const line = lines[cursorLine] || "";
    const before = line.slice(0, cursorCol - prefix.length);
    const after = line.slice(cursorCol);
    const newLine = before + item.value + after;

    return {
      lines: [
        ...lines.slice(0, cursorLine),
        newLine,
        ...lines.slice(cursorLine + 1),
      ],
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
        items.push({
          value: name,
          label: name,
          description: `→ ${value}`,
        });
      }
    }

    // $PATH commands
    for (const cmd of this.state.pathCommands) {
      if (cmd.startsWith(prefix)) {
        items.push({
          value: cmd,
          label: cmd,
        });
      }
    }

    return items.slice(0, 50); // Cap for performance
  }

  private getPathCompletions(partial: string): AutocompleteItem[] {
    let dir: string;
    let prefix: string;

    if (partial.endsWith("/")) {
      // "src/" → list contents of src/ with empty prefix
      dir = partial.slice(0, -1) || ".";
      prefix = "";
    } else if (partial.includes("/")) {
      dir = path.dirname(partial);
      prefix = path.basename(partial);
    } else {
      dir = ".";
      prefix = partial;
    }

    const resolvedDir = path.resolve(process.cwd(), dir);
    const dirPrefix = dir === "." ? "" : dir + "/";
    try {
      const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
      return entries
        .filter((e) => e.name.startsWith(prefix) && !e.name.startsWith("."))
        .map((e) => {
          const suffix = e.isDirectory() ? "/" : "";
          const displayPath = dirPrefix + e.name;
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
      .filter((cmd) => cmd.startsWith(prefix))
      .map((cmd) => ({
        value: cmd,
        label: cmd,
      }));
  }

  private getGitRefCompletions(prefix: string): AutocompleteItem[] {
    return this.state.gitBranches
      .filter((b) => b.startsWith(prefix))
      .map((b) => ({
        value: b,
        label: b,
        description: "branch",
      }));
  }

  private isGitRefContext(words: string[]): boolean {
    // git checkout <branch>, git merge <branch>, git rebase <branch>, etc.
    const refCommands = [
      "checkout",
      "switch",
      "merge",
      "rebase",
      "branch",
      "diff",
      "log",
    ];
    return words.length >= 2 && refCommands.includes(words[1]);
  }
}

// --- Cache builders ---

/**
 * Scan all directories in $PATH for executables.
 * Returns a Set of command names found. Ignores read errors silently.
 */
export function scanPathCommands(): Set<string> {
  const commands = new Set<string>();
  const dirs = (process.env.PATH || "").split(":");
  for (const dir of dirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        commands.add(entry);
      }
    } catch {
      // Ignore unreadable directories
    }
  }
  return commands;
}

/**
 * Get list of git branches from current repository.
 * Uses git branch --list to get all local branches.
 * Returns empty array on failure (not a git repo, git not installed, etc).
 */
export function getGitBranches(): string[] {
  try {
    const output = execSync("git branch --list --format='%(refname:short)'", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
}

/**
 * Get list of git subcommands from git help -a.
 * Parses the output to extract command names.
 * Returns empty array on failure.
 */
export function getGitSubcommands(): string[] {
  try {
    const output = execSync("git help -a", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const commands: string[] = [];
    for (const line of output.split("\n")) {
      // Match columnar format: 3 spaces, command name, then 2+ spaces before description
      const match = line.match(/^\s{3}([a-z][-a-z0-9]*)\s{2,}/);
      if (match) {
        commands.push(match[1]);
      }
    }
    return commands;
  } catch {
    return [];
  }
}
