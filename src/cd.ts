import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

/**
 * Represents the state needed to execute cd commands.
 */
export interface CdState {
  oldpwd: string;
  dirStack: string[];
}

/**
 * Result of a cd/pushd/popd command execution.
 */
export interface CdResult {
  success: boolean;
  output: string;
  newCwd?: string;
}

/**
 * Parse and execute a cd/pushd/popd command.
 * Does NOT call process.chdir — caller does that after validation.
 *
 * Handles:
 * - cd (no arg) → home directory
 * - cd ~ → home directory
 * - cd - → OLDPWD
 * - cd ~/path → home relative
 * - cd relative/path → relative to current
 * - cd /absolute/path → absolute path
 * - pushd [arg] → like cd but pushes current to stack
 * - popd → pops and returns target
 */
export function resolveCD(command: string, state: CdState): CdResult {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const arg = parts[1];

  if (cmd === "cd") {
    return resolveCdTarget(arg, state);
  }
  if (cmd === "pushd") {
    return resolvePushd(arg, state);
  }
  if (cmd === "popd") {
    return resolvePopd(state);
  }
  return { success: false, output: "Not a cd command" };
}

function resolveCdTarget(arg: string | undefined, state: CdState): CdResult {
  let target: string;

  if (!arg || arg === "~") {
    target = homedir();
  } else if (arg === "-") {
    target = state.oldpwd;
  } else if (arg.startsWith("~/")) {
    target = path.join(homedir(), arg.slice(2));
  } else {
    target = path.resolve(process.cwd(), arg);
  }

  // Validate
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return { success: false, output: `cd: not a directory: ${arg}` };
    }
  } catch {
    return { success: false, output: `cd: no such directory: ${arg}` };
  }

  return { success: true, output: "", newCwd: target };
}

function resolvePushd(arg: string | undefined, state: CdState): CdResult {
  const result = resolveCdTarget(arg, state);
  if (result.success) {
    state.dirStack.push(process.cwd());
  }
  return result;
}

function resolvePopd(state: CdState): CdResult {
  if (state.dirStack.length === 0) {
    return { success: false, output: "popd: directory stack empty" };
  }
  const target = state.dirStack.pop()!;
  return { success: true, output: target, newCwd: target };
}

/**
 * Detect if a command starts with cd, pushd, or popd.
 * Handles compound commands: "cd foo && ls" → true (we execute cd,
 * then run the rest normally).
 */
export function isCdCommand(command: string): boolean {
  const trimmed = command.trimStart();
  return /^(cd|pushd|popd)(\s|$)/.test(trimmed);
}

/**
 * Format cwd for display in footer.
 * Replaces home prefix with ~.
 * Examples:
 *   /home/user → ~
 *   /home/user/projects/myapp → ~/projects/myapp
 */
export function formatCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(home + "/")) return "~" + cwd.slice(home.length);
  return cwd;
}

/**
 * Get current git branch (synchronous, fast).
 * Returns branch name, detached HEAD hash, or undefined if not in a git repo.
 *
 * - Reads .git/HEAD in the given cwd
 * - If in detached HEAD state, returns first 7 chars of SHA
 * - Walks up to parent directories if .git/HEAD not found
 */
export function getGitBranch(cwd: string): string | undefined {
  try {
    const head = fs.readFileSync(path.join(cwd, ".git", "HEAD"), "utf-8").trim();
    if (head.startsWith("ref: refs/heads/")) {
      return head.slice(16);
    }
    return head.slice(0, 7); // detached HEAD
  } catch {
    // Walk up to find .git
    const parent = path.dirname(cwd);
    if (parent === cwd) return undefined;
    return getGitBranch(parent);
  }
}
