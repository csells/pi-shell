import { execSync } from "node:child_process";
import * as path from "node:path";
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "@mariozechner/pi-tui";

// Resolve script paths at module load time.
// Use __dirname which jiti provides, with import.meta.url as fallback.
declare const __dirname: string | undefined;
const SCRIPTS_DIR = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  const { fileURLToPath } = require("node:url") as typeof import("node:url");
  return path.dirname(fileURLToPath(import.meta.url));
})();

// Detect which shell completion to use: zsh if available, else bash
const SHELL_CMD = (() => {
  const zshScript = path.join(SCRIPTS_DIR, "shell-complete.zsh");
  const bashScript = path.join(SCRIPTS_DIR, "shell-complete.bash");
  try {
    execSync("zsh --version", { stdio: "ignore", timeout: 1000 });
    return (partial: string) =>
      `zsh ${JSON.stringify(zshScript)} ${JSON.stringify(partial)}`;
  } catch {
    return (partial: string) =>
      `bash ${JSON.stringify(bashScript)} ${JSON.stringify(partial)}`;
  }
})();

/**
 * AutocompleteProvider for ! bash mode.
 * Delegates to the user's shell completion system (zsh or bash) for
 * ALL completions — commands, subcommands, flags, branches, paths.
 *
 * Returns null when not in bash mode, allowing the editor to fall back
 * to pi's default provider for slash commands and @ file references.
 */
export class ShellAutocompleteProvider implements AutocompleteProvider {

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null {
    const line = lines[cursorLine] || "";

    // Only activate in bash mode (! or !! prefix)
    const bashMatch = line.match(/^(!{1,2})\s*/);
    if (!bashMatch) return null;

    const bangPrefix = bashMatch[0].length;
    const commandText = line.slice(bangPrefix, cursorCol);

    if (commandText.length === 0) return null;

    // Extract the word being completed (prefix for the dropdown)
    const words = commandText.split(/\s+/);
    const currentWord = words[words.length - 1] || "";

    // Ask the shell for completions
    const completions = this.getShellCompletions(commandText);
    if (completions.length === 0) return null;

    const items: AutocompleteItem[] = completions.map((c) => {
      const parts = c.split(" -- ");
      return {
        value: parts[0],
        label: parts[0],
        description: parts[1]?.trim(),
      };
    });

    return { items, prefix: currentWord };
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
      lines: [
        ...lines.slice(0, cursorLine),
        newLine,
        ...lines.slice(cursorLine + 1),
      ],
      cursorLine,
      cursorCol: cursorCol - prefix.length + item.value.length,
    };
  }

  /**
   * Call the shell's completion system via capture script.
   * Uses zsh (with zpty) if available, falls back to bash.
   * Returns raw completion strings, one per line.
   */
  private getShellCompletions(partial: string): string[] {
    try {
      const output = execSync(SHELL_CMD(partial), {
        encoding: "utf-8",
        timeout: 2000,
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      return output
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .slice(0, 50);
    } catch {
      return [];
    }
  }
}
