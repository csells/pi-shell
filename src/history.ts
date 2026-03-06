import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export const MAX_HISTORY = 1000;
export const HISTORY_ENTRY_TYPE = "pi-shell-history";

/**
 * Restore shell history from session entries.
 * Scans for custom entries of type "pi-shell-history", deduplicates keeping
 * most recent, and caps at MAX_HISTORY.
 */
export function restoreHistory(
  sessionManager: ExtensionContext["sessionManager"],
): string[] {
  const commands: string[] = [];

  for (const entry of sessionManager.getEntries()) {
    if (
      entry.type === "custom" &&
      entry.customType === HISTORY_ENTRY_TYPE &&
      Array.isArray((entry.data as Record<string, unknown>)?.commands)
    ) {
      commands.push(...(entry.data as { commands: string[] }).commands);
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
 * Appends a custom entry with the command history.
 */
export function saveHistory(
  pi: ExtensionAPI,
  commands: string[],
): void {
  pi.appendEntry(HISTORY_ENTRY_TYPE, {
    commands: commands.slice(-MAX_HISTORY),
  });
}
