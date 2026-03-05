import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  ShellAutocompleteProvider,
  scanPathCommands,
  getGitBranches,
  getGitSubcommands,
  type ShellState,
} from "./completions";

// Mock child_process for git functions
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync as execSyncMock } from "node:child_process";
const mockExecSync = execSyncMock as any;

describe("ShellAutocompleteProvider", () => {
  let provider: ShellAutocompleteProvider;
  let state: ShellState;
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "completions-test-"));
    process.chdir(tempDir);

    state = {
      aliases: new Map([
        ["ll", "ls -l"],
        ["la", "ls -a"],
        ["cls", "clear"],
        ["gitlog", "git log --oneline"],
      ]),
      pathCommands: new Set(["ls", "cat", "git", "node", "npm", "grep"]),
      gitBranches: ["main", "develop", "feature/auth", "hotfix/bug"],
      gitSubcommands: [
        "checkout",
        "cherry-pick",
        "commit",
        "add",
        "merge",
        "rebase",
        "switch",
        "diff",
        "log",
        "branch",
      ],
      history: [],
    };

    provider = new ShellAutocompleteProvider(state);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getSuggestions - bash mode detection", () => {
    it("activates with ! prefix", () => {
      const result = provider.getSuggestions(["!ls"], 0, 3);
      expect(result).not.toBeNull();
    });

    it("activates with !! prefix", () => {
      const result = provider.getSuggestions(["!!ls"], 0, 4);
      expect(result).not.toBeNull();
    });

    it("activates with ! and space prefix", () => {
      const result = provider.getSuggestions(["! ls"], 0, 4);
      expect(result).not.toBeNull();
    });

    it("activates with !! and space prefix", () => {
      const result = provider.getSuggestions(["!! ls"], 0, 5);
      expect(result).not.toBeNull();
    });

    it("does not activate without ! prefix", () => {
      const defaultProvider = {
        getSuggestions: vi.fn(() => ({
          items: [{ value: "test", label: "test" }],
          prefix: "t",
        })),
        applyCompletion: vi.fn((lines, line, col, item, prefix) => ({
          lines,
          cursorLine: line,
          cursorCol: col,
        })),
      };
      provider = new ShellAutocompleteProvider(state, defaultProvider);

      const result = provider.getSuggestions(["ls"], 0, 2);
      expect(defaultProvider.getSuggestions).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it("delegates to defaultProvider when not in bash mode", () => {
      const defaultProvider = {
        getSuggestions: vi.fn(() => ({
          items: [{ value: "/test", label: "/test" }],
          prefix: "/t",
        })),
        applyCompletion: vi.fn((lines, line, col, item, prefix) => ({
          lines,
          cursorLine: line,
          cursorCol: col,
        })),
      };
      provider = new ShellAutocompleteProvider(state, defaultProvider);

      provider.getSuggestions(["/t"], 0, 2);
      expect(defaultProvider.getSuggestions).toHaveBeenCalledWith(
        ["/t"],
        0,
        2
      );
    });

    it("returns null when defaultProvider is undefined and not in bash mode", () => {
      const result = provider.getSuggestions(["ls"], 0, 2);
      expect(result).toBeNull();
    });
  });

  describe("getSuggestions - first word completion", () => {
    it("completes alias names at first word", () => {
      const result = provider.getSuggestions(["!ll"], 0, 3);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({
          value: "ll",
          label: "ll",
          description: "→ ls -l",
        })
      );
    });

    it("matches aliases with prefix", () => {
      const result = provider.getSuggestions(["!l"], 0, 2);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "ll" })
      );
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "la" })
      );
      expect(result!.items).not.toContainEqual(
        expect.objectContaining({ value: "cls" })
      );
    });

    it("matches PATH commands with prefix", () => {
      const result = provider.getSuggestions(["!l"], 0, 2);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "ls" })
      );
    });

    it("combines aliases and PATH commands", () => {
      const result = provider.getSuggestions(["!g"], 0, 2);
      expect(result).not.toBeNull();
      const values = result!.items.map((i) => i.value);
      expect(values).toContain("git");
      expect(values).toContain("gitlog");
    });

    it("caps first word completions at 50 items", () => {
      // Add many commands
      const largeCommandSet = new Set<string>();
      for (let i = 0; i < 100; i++) {
        largeCommandSet.add(`cmd${i}`);
      }
      state.pathCommands = largeCommandSet;
      provider = new ShellAutocompleteProvider(state);

      const result = provider.getSuggestions(["!c"], 0, 2);
      expect(result).not.toBeNull();
      expect(result!.items.length).toBeLessThanOrEqual(50);
    });

    it("returns empty prefix for first word at cursor 0", () => {
      const result = provider.getSuggestions(["!"], 0, 1);
      expect(result).toBeNull();
    });
  });

  describe("getSuggestions - git subcommand completion", () => {
    it("completes git subcommands", () => {
      const result = provider.getSuggestions(["!git ch"], 0, 8);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "checkout" })
      );
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "cherry-pick" })
      );
    });

    it("filters git subcommands by prefix", () => {
      const result = provider.getSuggestions(["!git co"], 0, 7);
      expect(result).not.toBeNull();
      const values = result!.items.map((i) => i.value);
      expect(values).toContain("commit");
      // "checkout" starts with "ch", not "co"
      expect(values).not.toContain("checkout");
      expect(values).not.toContain("cherry-pick");
    });

    it("does not suggest git subcommands for second word (not git command)", () => {
      const result = provider.getSuggestions(["!ls ch"], 0, 6);
      // Falls through to path completion — result may be null if no files match "ch"
      if (result) {
        const hasCheckout = result.items.some((i) => i.value === "checkout");
        expect(hasCheckout).toBe(false);
      }
    });
  });

  describe("getSuggestions - git ref context", () => {
    it("completes branches for git checkout", () => {
      const result = provider.getSuggestions(["!git checkout ma"], 0, 17);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "main" })
      );
    });

    it("completes branches for git switch", () => {
      const result = provider.getSuggestions(["!git switch de"], 0, 15);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "develop" })
      );
    });

    it("completes branches for git merge", () => {
      const result = provider.getSuggestions(["!git merge fe"], 0, 14);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "feature/auth" })
      );
    });

    it("completes branches for git rebase", () => {
      const result = provider.getSuggestions(["!git rebase ho"], 0, 15);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "hotfix/bug" })
      );
    });

    it("completes branches for git branch", () => {
      const result = provider.getSuggestions(["!git branch de"], 0, 15);
      expect(result).not.toBeNull();
      const values = result!.items.map((i) => i.value);
      expect(values).toContain("develop");
    });

    it("completes branches for git diff", () => {
      const result = provider.getSuggestions(["!git diff m"], 0, 12);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "main" })
      );
    });

    it("completes branches for git log", () => {
      const result = provider.getSuggestions(["!git log m"], 0, 11);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "main" })
      );
    });

    it("does not complete branches if third word context is wrong", () => {
      const result = provider.getSuggestions(["!git add ma"], 0, 11);
      // "add" is not a ref context command — falls to path completion
      // Result may be null if no files match "ma"
      if (result) {
        const hasBranch = result.items.some((i) => i.value === "main");
        expect(hasBranch).toBe(false);
      }
    });

    it("filters branches by prefix", () => {
      const result = provider.getSuggestions(["!git checkout f"], 0, 16);
      expect(result).not.toBeNull();
      const values = result!.items.map((i) => i.value);
      expect(values).toContain("feature/auth");
      expect(values).not.toContain("main");
    });

    it("adds 'branch' description to git ref items", () => {
      const result = provider.getSuggestions(["!git checkout m"], 0, 16);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({
          value: "main",
          description: "branch",
        })
      );
    });
  });

  describe("getSuggestions - path completion", () => {
    beforeEach(() => {
      // Create test directory structure
      fs.mkdirSync(path.join(tempDir, "src"));
      fs.mkdirSync(path.join(tempDir, "test"));
      fs.writeFileSync(path.join(tempDir, "README.md"), "");
      fs.writeFileSync(path.join(tempDir, "package.json"), "");
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "");
    });

    it("completes paths from current directory", () => {
      const result = provider.getSuggestions(["!cat R"], 0, 7);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "README.md" })
      );
    });

    it("appends / to directory completions", () => {
      const result = provider.getSuggestions(["!cd s"], 0, 5);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "src/" })
      );
    });

    it("does not append / to file completions", () => {
      const result = provider.getSuggestions(["!cat p"], 0, 6);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "package.json" })
      );
    });

    it("hides dotfiles from completion", () => {
      const result = provider.getSuggestions(["!cat ."], 0, 6);
      expect(result).toBeNull(); // No non-dotfile matches
    });

    it("completes paths with subdirectory prefix", () => {
      fs.mkdirSync(path.join(tempDir, "src", "utils"));
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "");

      const result = provider.getSuggestions(["!cat src/"], 0, 9);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "src/index.ts" })
      );
      expect(result!.items).toContainEqual(
        expect.objectContaining({ value: "src/utils/" })
      );
    });

    it("marks directories with 'dir' description", () => {
      const result = provider.getSuggestions(["!cd s"], 0, 5);
      expect(result).not.toBeNull();
      expect(result!.items).toContainEqual(
        expect.objectContaining({
          value: "src/",
          description: "dir",
        })
      );
    });

    it("caps path completions at 50 items", () => {
      // Create many files
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.txt`), "");
      }

      const result = provider.getSuggestions(["!cat f"], 0, 6);
      expect(result).not.toBeNull();
      expect(result!.items.length).toBeLessThanOrEqual(50);
    });

    it("returns empty when directory doesn't exist", () => {
      const result = provider.getSuggestions(["!cat /nonexistent/p"], 0, 20);
      expect(result).toBeNull();
    });
  });

  describe("applyCompletion", () => {
    it("replaces prefix at cursor position", () => {
      const result = provider.applyCompletion(
        ["!git ch"],
        0,
        7,
        { value: "checkout", label: "checkout" },
        "ch"
      );

      expect(result.lines[0]).toBe("!git checkout");
      expect(result.cursorCol).toBe(13);
    });

    it("handles multi-line input", () => {
      const result = provider.applyCompletion(
        ["first line", "!git ch", "third line"],
        1,
        7,
        { value: "checkout", label: "checkout" },
        "ch"
      );

      expect(result.lines[0]).toBe("first line");
      expect(result.lines[1]).toBe("!git checkout");
      expect(result.lines[2]).toBe("third line");
    });

    it("preserves text after cursor", () => {
      const result = provider.applyCompletion(
        ["!git ch something"],
        0,
        7,
        { value: "checkout", label: "checkout" },
        "ch"
      );

      expect(result.lines[0]).toBe("!git checkout something");
    });

    it("updates cursor column correctly for longer completion", () => {
      const result = provider.applyCompletion(
        ["!git c"],
        0,
        6,
        { value: "cherry-pick", label: "cherry-pick" },
        "c"
      );

      expect(result.cursorCol).toBe(16); // !git cherry-pick
    });

    it("updates cursor column correctly for shorter completion", () => {
      const result = provider.applyCompletion(
        ["!git checkout"],
        0,
        13,
        { value: "add", label: "add" },
        "checkout"
      );

      expect(result.cursorCol).toBe(8); // !git add
    });

    it("handles path completion with directory suffix", () => {
      const result = provider.applyCompletion(
        ["!cd s"],
        0,
        5,
        { value: "src/", label: "src/" },
        "s"
      );

      expect(result.lines[0]).toBe("!cd src/");
      expect(result.cursorCol).toBe(8);
    });

    it("preserves content on other lines", () => {
      const lines = ["previous", "!git ch", "next"];
      const result = provider.applyCompletion(
        lines,
        1,
        8,
        { value: "checkout", label: "checkout" },
        "ch"
      );

      expect(result.lines).toHaveLength(3);
      expect(result.lines[0]).toBe("previous");
      expect(result.lines[2]).toBe("next");
    });
  });

  describe("getSuggestions - edge cases", () => {
    it("handles empty line", () => {
      const result = provider.getSuggestions([""], 0, 0);
      expect(result).toBeNull();
    });

    it("handles cursor at bang position", () => {
      const result = provider.getSuggestions(["!"], 0, 1);
      expect(result).toBeNull();
    });

    it("handles multiple spaces between command and arg", () => {
      const result = provider.getSuggestions(["!git   ch"], 0, 9);
      expect(result).not.toBeNull();
    });

    it("handles prefix already in state as empty", () => {
      const resultBefore = provider.getSuggestions(["!"], 0, 1);
      expect(resultBefore).toBeNull();
    });

    it("returns null when no suggestions match", () => {
      const result = provider.getSuggestions(["!xyz"], 0, 4);
      expect(result).toBeNull();
    });
  });
});

describe("scanPathCommands", () => {
  let originalPath: string | undefined;

  beforeEach(() => {
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    if (originalPath) {
      process.env.PATH = originalPath;
    }
  });

  it("reads commands from PATH directories", () => {
    const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), "path-test-1-"));
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "path-test-2-"));

    try {
      fs.writeFileSync(path.join(tmpDir1, "cmd1"), "");
      fs.writeFileSync(path.join(tmpDir1, "cmd2"), "");
      fs.writeFileSync(path.join(tmpDir2, "cmd3"), "");

      process.env.PATH = `${tmpDir1}:${tmpDir2}`;
      const commands = scanPathCommands();

      expect(commands.has("cmd1")).toBe(true);
      expect(commands.has("cmd2")).toBe(true);
      expect(commands.has("cmd3")).toBe(true);
    } finally {
      fs.rmSync(tmpDir1, { recursive: true, force: true });
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });

  it("ignores unreadable directories", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "path-test-"));

    try {
      fs.writeFileSync(path.join(tmpDir, "cmd"), "");
      process.env.PATH = `${tmpDir}:/nonexistent/path`;

      const commands = scanPathCommands();
      expect(commands.has("cmd")).toBe(true);
      // Should not throw, just skip /nonexistent/path
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles empty PATH", () => {
    process.env.PATH = "";
    const commands = scanPathCommands();
    expect(commands.size).toBe(0);
  });

  it("returns Set<string>", () => {
    const commands = scanPathCommands();
    expect(commands instanceof Set).toBe(true);
  });
});

describe("getGitBranches", () => {
  beforeEach(() => {
    mockExecSync.mockClear();
  });

  it("returns branches from git branch --list", () => {
    mockExecSync.mockReturnValue("main\ndevelop\nfeature/auth\n");
    const branches = getGitBranches();

    expect(branches).toEqual(["main", "develop", "feature/auth"]);
  });

  it("returns empty array on empty git output", () => {
    mockExecSync.mockReturnValue("");
    const branches = getGitBranches();

    expect(branches).toEqual([]);
  });

  it("returns empty array when git command fails", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });
    const branches = getGitBranches();

    expect(branches).toEqual([]);
  });

  it("passes 5000ms timeout to execSync", () => {
    mockExecSync.mockReturnValue("main\n");
    getGitBranches();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 5000,
      })
    );
  });

  it("uses utf-8 encoding", () => {
    mockExecSync.mockReturnValue("main\n");
    getGitBranches();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        encoding: "utf-8",
      })
    );
  });

  it("trims output before splitting", () => {
    mockExecSync.mockReturnValue("  main\ndevelop\n  ");
    const branches = getGitBranches();

    expect(branches).toEqual(["main", "develop"]);
  });
});

describe("getGitSubcommands", () => {
  beforeEach(() => {
    mockExecSync.mockClear();
  });

  it("parses git help -a output", () => {
    const helpOutput = `
   add                Add file contents to the index
   branch             List, create, or delete branches
   checkout           Switch branches or restore working tree files
   commit             Record changes to the repository
   diff               Show changes between commits, commit and working tree, etc
`;
    mockExecSync.mockReturnValue(helpOutput);
    const commands = getGitSubcommands();

    expect(commands).toContain("add");
    expect(commands).toContain("branch");
    expect(commands).toContain("checkout");
  });

  it("returns empty array when git help fails", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("git not found");
    });
    const commands = getGitSubcommands();

    expect(commands).toEqual([]);
  });

  it("ignores description text and only extracts command names", () => {
    const helpOutput = `
   add                Add file contents to the index
   branch             List, create, or delete branches
   other text without proper format
`;
    mockExecSync.mockReturnValue(helpOutput);
    const commands = getGitSubcommands();

    expect(commands).toEqual(["add", "branch"]);
    expect(commands).not.toContain("other");
  });

  it("passes 5000ms timeout to execSync", () => {
    mockExecSync.mockReturnValue("");
    getGitSubcommands();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 5000,
      })
    );
  });

  it("uses utf-8 encoding", () => {
    mockExecSync.mockReturnValue("");
    getGitSubcommands();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        encoding: "utf-8",
      })
    );
  });

  it("handles multiple spaces in git help output", () => {
    const helpOutput = `
   add                   Add file contents to the index
   branch                List, create, or delete branches
`;
    mockExecSync.mockReturnValue(helpOutput);
    const commands = getGitSubcommands();

    expect(commands).toEqual(["add", "branch"]);
  });
});
