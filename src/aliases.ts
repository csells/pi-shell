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
 * This is best-effort — errors are silently ignored.
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
      // Match: name=value or name='value' or name="value"
      const match = line.match(/^([a-zA-Z0-9_.-]+)=(.+)$/);
      if (match) {
        const name = match[1];
        let value = match[2];

        // Strip surrounding quotes (both single and double)
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
