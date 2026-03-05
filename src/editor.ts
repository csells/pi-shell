import type { TUI } from "@mariozechner/pi-tui";
import type { EditorTheme, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { ShellAutocompleteProvider } from "./completions.js";

/**
 * Custom editor that swaps autocomplete provider based on ! prefix.
 *
 * When the user types ! or !! at the start of a line, the editor switches
 * to ShellAutocompleteProvider for shell completions. Otherwise, it uses
 * pi's default provider (slash commands, file paths).
 */
export class ShellEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    shellProvider: ShellAutocompleteProvider,
  ) {
    super(tui, theme, keybindings);
    this.setAutocompleteProvider(shellProvider);
  }

  handleInput(data: string): void {
    super.handleInput(data);
  }
}
