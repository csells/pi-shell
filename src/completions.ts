import { execSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "@mariozechner/pi-tui";

/**
 * AutocompleteProvider for ! bash mode.
 * Delegates to the user's shell completion system (zsh via zpty capture)
 * for ALL completions — commands, subcommands, flags, branches, paths.
 *
 * Returns null when not in bash mode, allowing the editor to fall back
 * to pi's default provider for slash commands and @ file references.
 */
export class ShellAutocompleteProvider implements AutocompleteProvider {
  private scriptPath: string;

  constructor() {
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    this.scriptPath = path.join(dir, "shell-complete.zsh");
  }

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
   * Call the shell's completion system via zpty capture script.
   * Returns raw completion strings, one per line.
   */
  private getShellCompletions(partial: string): string[] {
    try {
      const output = execSync(
        `zsh ${JSON.stringify(this.scriptPath)} ${JSON.stringify(partial)}`,
        {
          encoding: "utf-8",
          timeout: 2000,
          cwd: process.cwd(),
          env: { ...process.env, TERM: "dumb" },
        },
      );
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
