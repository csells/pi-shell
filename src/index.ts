import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { importAliases } from "./aliases.js";
import { resolveCD, isCdCommand, formatCwd, getGitBranch, type CdState } from "./cd.js";
import { ShellAutocompleteProvider, scanPathCommands, getGitBranches, getGitSubcommands } from "./completions.js";
import { ShellEditor } from "./editor.js";
import { restoreHistory, saveHistory } from "./history.js";
import { handleExplain } from "./explain.js";
import { handleCat } from "./preview.js";
import { offerFixOnFail } from "./fix-on-fail.js";

interface SharedState extends CdState {
  aliases: Map<string, string>;
  pathCommands: Set<string>;
  gitBranches: string[];
  gitSubcommands: string[];
  history: string[];
}

/**
 * Pi-shell extension entry point.
 * Wires together: shared state, bash tool override, custom editor, and event handlers.
 */
export default function piShell(pi: ExtensionAPI) {
  const state: SharedState = {
    aliases: new Map(),
    pathCommands: new Set(),
    gitBranches: [],
    gitSubcommands: [],
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

  // --- session_start: initialize caches and install custom editor ---
  pi.on("session_start", async (_event, ctx) => {
    state.aliases = importAliases();
    state.pathCommands = scanPathCommands();
    state.gitBranches = getGitBranches();
    state.gitSubcommands = getGitSubcommands();
    state.history = restoreHistory(ctx.sessionManager);

    // Install custom editor — factory receives tui, theme, keybindings
    if (ctx.hasUI) {
      const shellProvider = new ShellAutocompleteProvider(state);
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

  // --- user_bash: main ! command handler ---
  pi.on("user_bash", async (event, ctx) => {
    const command = event.command.trim();

    // 1. ?? explain mode
    const explainResult = handleExplain(command, pi);
    if (explainResult) {
      return { result: explainResult };
    }

    // 2. cat → syntax-highlighted preview
    const catResult = handleCat(command);
    if (catResult) {
      state.history.push(command);
      activeEditor?.addToHistory?.(`!${command}`);
      return { result: catResult };
    }

    // 3. cd / pushd / popd
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

      // Refresh git caches for new directory
      state.gitBranches = getGitBranches();

      if (ctx.hasUI) {
        updateFooter(ctx);
      }

      state.history.push(command);
      activeEditor?.addToHistory?.(`!${command}`);

      return {
        result: {
          output: cdResult.output,
          exitCode: 0,
          cancelled: false,
          truncated: false,
        },
      };
    }

    // 4. Normal execution via user's shell with alias support.
    //    We execute ourselves so we can inspect the exit code for fix-on-fail.
    const shell = process.env.SHELL || "/bin/sh";
    let output: string;
    let exitCode: number;

    try {
      const result = await pi.exec(shell, ["-ic", command], { timeout: 0 });
      output = (result.stdout || "") + (result.stderr || "");
      exitCode = result.code ?? 0;
    } catch (err: any) {
      output = err.message || "Execution error";
      exitCode = 1;
    }

    // Offer fix-on-fail for non-zero exit — but NOT for !! commands
    // (requirements: "Must not interrupt !! commands")
    if (exitCode !== 0 && ctx.hasUI && !event.excludeFromContext) {
      await offerFixOnFail(command, output, exitCode, ctx, pi);
    }

    state.history.push(command);
    // Add to editor history for up/down navigation
    const prefix = event.excludeFromContext ? "!!" : "!";
    activeEditor?.addToHistory?.(`${prefix}${command}`);

    return {
      result: {
        output,
        exitCode,
        cancelled: false,
        truncated: false,
      },
    };
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

  // --- Helper: update footer status and terminal title ---
  function updateFooter(ctx: ExtensionContext): void {
    const cwd = formatCwd(process.cwd());
    const gitBranch = getGitBranch(process.cwd());
    const statusText = gitBranch ? `${cwd} (${gitBranch})` : cwd;
    ctx.ui.setStatus("shell", `shell: ${statusText}`);
    ctx.ui.setTitle(`pi - ${cwd}`);
  }
}
