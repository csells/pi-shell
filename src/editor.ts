import type { TUI, EditorTheme, AutocompleteProvider, AutocompleteItem } from "@mariozechner/pi-tui";
import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { ShellAutocompleteProvider } from "./completions.js";

/**
 * Custom editor that intercepts setAutocompleteProvider to wrap pi's
 * built-in provider with our shell provider.
 *
 * Problem: pi calls setAutocompleteProvider(builtinProvider) AFTER our
 * constructor, overwriting whatever we set. So we intercept that call,
 * capture pi's provider, and install a wrapper that delegates to our
 * shell provider for !-prefixed lines and to pi's provider for everything else.
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
  }

  /**
   * Intercept pi's setAutocompleteProvider call.
   * Instead of letting pi overwrite our provider, wrap both together.
   */
  setAutocompleteProvider(provider: AutocompleteProvider): void {
    const wrapper = new WrappedProvider(this.shellProvider, provider);
    super.setAutocompleteProvider(wrapper);
  }

  handleInput(data: string): void {
    super.handleInput(data);
  }
}

/**
 * Wraps the shell provider and pi's built-in provider.
 * For !-prefixed lines, delegates to shell. Otherwise, delegates to pi's built-in.
 * Also implements getForceFileSuggestions and shouldTriggerFileCompletion
 * so that Tab-triggered completions work correctly.
 */
class WrappedProvider implements AutocompleteProvider {
  constructor(
    private shell: ShellAutocompleteProvider,
    private builtin: AutocompleteProvider,
  ) {}

  private isBashLine(lines: string[], cursorLine: number): boolean {
    const line = lines[cursorLine] || "";
    return /^!{1,2}/.test(line);
  }

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null {
    if (this.isBashLine(lines, cursorLine)) {
      return this.shell.getSuggestions(lines, cursorLine, cursorCol);
    }
    return this.builtin.getSuggestions(lines, cursorLine, cursorCol);
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    if (this.isBashLine(lines, cursorLine)) {
      return this.shell.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    }
    return this.builtin.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  /**
   * Called by Editor on Tab press.
   * For ! lines: return shell completions.
   * For regular lines: delegate to pi's built-in provider.
   */
  getForceFileSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null {
    if (this.isBashLine(lines, cursorLine)) {
      return this.shell.getSuggestions(lines, cursorLine, cursorCol);
    }
    const b = this.builtin as any;
    return typeof b.getForceFileSuggestions === "function"
      ? b.getForceFileSuggestions(lines, cursorLine, cursorCol)
      : null;
  }

  /**
   * Called by Editor to decide if Tab should trigger completion.
   * Always true for ! lines. For regular lines, delegate to pi's built-in.
   */
  shouldTriggerFileCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean {
    if (this.isBashLine(lines, cursorLine)) {
      return true;
    }
    const b = this.builtin as any;
    return typeof b.shouldTriggerFileCompletion === "function"
      ? b.shouldTriggerFileCompletion(lines, cursorLine, cursorCol)
      : false;
  }
}
