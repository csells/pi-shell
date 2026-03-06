import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BashResult } from "./types.js";

/**
 * Detect ?? prefix and route to agent for explanation.
 * Returns null if not a ?? command.
 *
 * When a ?? command is detected, sends the command to the agent
 * via sendUserMessage for explanation and returns an empty BashResult.
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
