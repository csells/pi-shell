import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { importAliases } from "./aliases.js";
import { resolveCD, isCdCommand, formatCwd, getGitBranch, type CdState } from "./cd.js";
import { ShellAutocompleteProvider } from "./completions.js";
import { ShellEditor } from "./editor.js";
import { restoreHistory, saveHistory } from "./history.js";
import { handleExplain } from "./explain.js";
import { handleCat } from "./preview.js";
import { offerFixOnFail } from "./fix-on-fail.js";

interface SharedState extends CdState {
  aliases: Map<string, string>;
  history: string[];
}

/**
 * Pi-shell extension entry point.
 * Wires together: shared state, bash tool override, custom editor, and event handlers.
 */
export default function piShell(pi: ExtensionAPI) {
  const state: SharedState = {
    aliases: new Map(),
    history: [],
    dirStack: [],
    oldpwd: process.cwd(),
  };

  // Override bash tool to inject dynamic cwd into every LLM bash call.
  // Without this, the agent's bash() calls use the cwd captured at startup.
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd: _cwd, env }) => ({
      command,
      cwd: process.cwd(), // always current, not the captured value
      env,
    }),
  });
  pi.registerTool(bashTool);

  // Reference to the active editor for history wiring
  let activeEditor: ShellEditor | undefined;

  // --- session_start: initialize and install custom editor ---
  pi.on("session_start", async (_event, ctx) => {
    state.aliases = importAliases();
    state.history = restoreHistory(ctx.sessionManager);

    // Install custom editor — factory receives tui, theme, keybindings
    if (ctx.hasUI) {
      const shellProvider = new ShellAutocompleteProvider();
      ctx.ui.setEditorComponent((tui, theme, keybindings) => {
        const editor = new ShellEditor(tui, theme, keybindings, shellProvider);
        activeEditor = editor;

        // Seed editor history with restored shell commands for up/down nav
        for (const cmd of state.history) {
          editor.addToHistory?.(`!${cmd}`);
        }

        return editor;
      });
      updateFooter(ctx);
    }
  });

  // --- user_bash: intercept only commands we handle specially ---
  // For everything else, return nothing and let pi's built-in bash handle it.
  pi.on("user_bash", async (event, ctx) => {
    const command = event.command.trim();

    // 1. ?? explain mode — don't execute, ask agent to explain
    const explainResult = handleExplain(command, pi);
    if (explainResult) {
      return { result: explainResult };
    }

    // 2. cat → syntax-highlighted preview
    const catResult = handleCat(command);
    if (catResult) {
      addToHistory(command, event.excludeFromContext);
      return { result: catResult };
    }

    // 3. cd / pushd / popd — must handle in-process (process.chdir)
    if (isCdCommand(command)) {
      const cdResult = resolveCD(command, state);

      if (!cdResult.success) {
        return {
          result: {
            output: cdResult.output,
            exitCode: 1,
            cancelled: false,
            truncated: false,
          },
        };
      }

      state.oldpwd = process.cwd();
      process.chdir(cdResult.newCwd!);

      if (ctx.hasUI) {
        updateFooter(ctx);
      }

      addToHistory(command, event.excludeFromContext);

      return {
        result: {
          output: cdResult.output,
          exitCode: 0,
          cancelled: false,
          truncated: false,
        },
      };
    }

    // 4. Everything else — let pi's built-in bash handle execution.
    //    We just record history. Fix-on-fail is handled via tool_result below.
    addToHistory(command, event.excludeFromContext);
    return undefined;
  });

  // --- tool_result: fix-on-fail after pi's built-in bash runs ---
  pi.on("tool_result", async (event, ctx) => {
    // Only act on user_bash results with non-zero exit codes
    if (event.toolName !== "user_bash") return;
    if (!ctx.hasUI) return;

    // Check if it failed
    const details = event.details as Record<string, unknown> | undefined;
    const exitCode = details?.exitCode as number | undefined;
    if (!exitCode || exitCode === 0) return;

    // Don't interrupt !! commands
    const excludeFromContext = details?.excludeFromContext as boolean | undefined;
    if (excludeFromContext) return;

    const command = details?.command as string | undefined;
    const output = (event.content?.[0] as { text?: string })?.text ?? "";

    if (command) {
      await offerFixOnFail(command, output, exitCode, ctx, pi);
    }
  });

  // --- session_shutdown: persist history ---
  pi.on("session_shutdown", async () => {
    if (state.history.length > 0) {
      saveHistory(pi, state.history);
    }
  });

  // --- before_agent_start: inject cwd context ---
  pi.on("before_agent_start", async (event) => {
    const cwd = process.cwd();
    const gitBranch = getGitBranch(cwd);
    const context = gitBranch
      ? `Shell cwd: ${cwd} (git: ${gitBranch})`
      : `Shell cwd: ${cwd}`;

    return {
      systemPrompt: event.systemPrompt + `\n\n${context}`,
    };
  });

  // --- Helpers ---

  function addToHistory(command: string, excludeFromContext: boolean): void {
    state.history.push(command);
    const prefix = excludeFromContext ? "!!" : "!";
    activeEditor?.addToHistory?.(`${prefix}${command}`);
  }

  function updateFooter(ctx: ExtensionContext): void {
    const cwd = formatCwd(process.cwd());
    const gitBranch = getGitBranch(process.cwd());
    const statusText = gitBranch ? `${cwd} (${gitBranch})` : cwd;
    ctx.ui.setStatus("shell", `shell: ${statusText}`);
    ctx.ui.setTitle(`pi - ${cwd}`);
  }
}
