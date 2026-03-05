import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

/**
 * Offer agent diagnosis when a command fails.
 * Returns true if the user accepted and a diagnosis was requested.
 *
 * If exit code is 0 or no UI is available, returns false immediately.
 * Otherwise, shows a confirmation dialog. If the user accepts, sends
 * the command and output to the agent for diagnosis.
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

  // Truncate output for context (max 2000 chars)
  const truncated =
    output.length > 2000 ? output.slice(-2000) + "\n...(truncated)" : output;

  pi.sendUserMessage(
    `This shell command failed with exit code ${exitCode}:\n` +
      `\`\`\`\n${command}\n\`\`\`\n` +
      `Output:\n\`\`\`\n${truncated}\n\`\`\`\n` +
      `Diagnose the error and suggest a fix.`,
  );

  return true;
}
