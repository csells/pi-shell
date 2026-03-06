/**
 * Matches pi's BashResult from core/bash-executor.
 * Defined locally because it's not re-exported from the main package index.
 */
export interface BashResult {
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}
