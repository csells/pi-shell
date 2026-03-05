import * as fs from "node:fs";
import * as path from "node:path";
import {
  highlightCode,
  getLanguageFromPath,
} from "@mariozechner/pi-coding-agent";
import type { BashResult } from "@mariozechner/pi-coding-agent";

/**
 * Intercept `cat <file>` and return syntax-highlighted output.
 * Returns null if not a cat command or file doesn't exist.
 *
 * Simple detection for `cat <file>` format (doesn't handle flags).
 * Reads the file and applies syntax highlighting based on file extension.
 */
export function handleCat(command: string): BashResult | null {
  // Simple detection — matches "cat <filepath>"
  // Handles single file only, no flags
  const match = command.match(/^cat\s+(\S+)\s*$/);
  if (!match) return null;

  const filePath = match[1];
  const resolved = path.resolve(process.cwd(), filePath);

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    const lang = getLanguageFromPath(resolved);
    const lines = lang ? highlightCode(content, lang) : content.split("\n");

    return {
      output: lines.join("\n"),
      exitCode: 0,
      cancelled: false,
      truncated: false,
    };
  } catch (err: any) {
    return {
      output: `cat: ${filePath}: ${
        err.code === "ENOENT" ? "No such file or directory" : err.message
      }`,
      exitCode: 1,
      cancelled: false,
      truncated: false,
    };
  }
}
