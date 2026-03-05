import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  resolveCD,
  isCdCommand,
  formatCwd,
  getGitBranch,
  type CdState,
} from "./cd";

describe("cd module", () => {
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = os.homedir();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("isCdCommand", () => {
    it("detects cd with no args", () => {
      expect(isCdCommand("cd")).toBe(true);
    });

    it("detects cd with argument", () => {
      expect(isCdCommand("cd src")).toBe(true);
    });

    it("detects cd with leading whitespace", () => {
      expect(isCdCommand("  cd src")).toBe(true);
    });

    it("detects pushd", () => {
      expect(isCdCommand("pushd src")).toBe(true);
    });

    it("detects popd", () => {
      expect(isCdCommand("popd")).toBe(true);
    });

    it("rejects commands that don't start with cd/pushd/popd", () => {
      expect(isCdCommand("ls")).toBe(false);
      expect(isCdCommand("echo cd")).toBe(false);
    });

    it("handles compound commands (cd && ls)", () => {
      expect(isCdCommand("cd src && ls")).toBe(true);
    });
  });

  describe("formatCwd", () => {
    it("replaces home with ~ for home directory", () => {
      const home = os.homedir();
      expect(formatCwd(home)).toBe("~");
    });

    it("replaces home prefix with ~", () => {
      const home = os.homedir();
      const path = `${home}/projects/myapp`;
      expect(formatCwd(path)).toBe("~/projects/myapp");
    });

    it("leaves absolute paths unchanged if not in home", () => {
      expect(formatCwd("/usr/local")).toBe("/usr/local");
    });

    it("leaves relative paths unchanged", () => {
      expect(formatCwd("./src")).toBe("./src");
    });
  });

  describe("resolveCD", () => {
    let state: CdState;

    beforeEach(() => {
      state = {
        oldpwd: tempDir,
        dirStack: [],
      };
    });

    it("resolves cd with no argument to home", () => {
      const result = resolveCD("cd", state);
      expect(result.success).toBe(true);
      expect(result.newCwd).toBe(os.homedir());
    });

    it("resolves cd ~ to home", () => {
      const result = resolveCD("cd ~", state);
      expect(result.success).toBe(true);
      expect(result.newCwd).toBe(os.homedir());
    });

    it("resolves cd - to oldpwd", () => {
      const oldDir = path.join(tempDir, "olddir");
      fs.mkdirSync(oldDir);
      state.oldpwd = oldDir;

      const result = resolveCD("cd -", state);
      expect(result.success).toBe(true);
      expect(result.newCwd).toBe(oldDir);
    });

    it("resolves cd ~/path to home relative", () => {
      const home = os.homedir();
      const result = resolveCD("cd ~/Desktop", state);
      expect(result.success).toBe(true);
      expect(result.newCwd).toBe(path.join(home, "Desktop"));
    });

    it("resolves relative paths", () => {
      const subdir = path.join(tempDir, "subdir");
      fs.mkdirSync(subdir);

      const result = resolveCD("cd subdir", state);
      expect(result.success).toBe(true);
      // Use realpath to normalize symlinks (handles /private/ on macOS)
      expect(fs.realpathSync(result.newCwd!)).toBe(fs.realpathSync(subdir));
    });

    it("resolves absolute paths", () => {
      const absPath = path.join(tempDir, "absolute");
      fs.mkdirSync(absPath);

      const result = resolveCD(`cd ${absPath}`, state);
      expect(result.success).toBe(true);
      expect(result.newCwd).toBe(absPath);
    });

    it("fails for non-existent directory", () => {
      const result = resolveCD("cd /nonexistent/path", state);
      expect(result.success).toBe(false);
      expect(result.output).toContain("no such directory");
    });

    it("fails when target is not a directory", () => {
      const file = path.join(tempDir, "file.txt");
      fs.writeFileSync(file, "content");

      const result = resolveCD(`cd ${file}`, state);
      expect(result.success).toBe(false);
      expect(result.output).toContain("not a directory");
    });
  });

  describe("pushd", () => {
    let state: CdState;

    beforeEach(() => {
      state = {
        oldpwd: tempDir,
        dirStack: [],
      };
    });

    it("pushes current directory onto stack before changing", () => {
      const subdir = path.join(tempDir, "subdir");
      fs.mkdirSync(subdir);
      const before = process.cwd();

      const result = resolveCD("pushd subdir", state);
      expect(result.success).toBe(true);
      expect(state.dirStack).toContain(before);
    });

    it("resolves pushd target", () => {
      const subdir = path.join(tempDir, "subdir");
      fs.mkdirSync(subdir);

      const result = resolveCD("pushd subdir", state);
      expect(result.success).toBe(true);
      // Use realpath to normalize symlinks (handles /private/ on macOS)
      expect(fs.realpathSync(result.newCwd!)).toBe(fs.realpathSync(subdir));
    });
  });

  describe("popd", () => {
    let state: CdState;

    beforeEach(() => {
      state = {
        oldpwd: tempDir,
        dirStack: [],
      };
    });

    it("pops from empty stack returns error", () => {
      const result = resolveCD("popd", state);
      expect(result.success).toBe(false);
      expect(result.output).toContain("directory stack empty");
    });

    it("pops and returns directory from stack", () => {
      const subdir = path.join(tempDir, "subdir");
      fs.mkdirSync(subdir);
      state.dirStack.push(subdir);

      const result = resolveCD("popd", state);
      expect(result.success).toBe(true);
      expect(result.newCwd).toBe(subdir);
      expect(result.output).toBe(subdir);
      expect(state.dirStack.length).toBe(0);
    });

    it("pops from multiple-entry stack", () => {
      const dir1 = path.join(tempDir, "dir1");
      const dir2 = path.join(tempDir, "dir2");
      fs.mkdirSync(dir1);
      fs.mkdirSync(dir2);
      state.dirStack.push(dir1, dir2);

      const result = resolveCD("popd", state);
      expect(result.newCwd).toBe(dir2);
      expect(state.dirStack.length).toBe(1);
      expect(state.dirStack[0]).toBe(dir1);
    });
  });

  describe("getGitBranch", () => {
    it("returns undefined for non-git directory", () => {
      const result = getGitBranch(tempDir);
      expect(result).toBeUndefined();
    });

    it("reads branch from .git/HEAD", () => {
      const gitDir = path.join(tempDir, ".git");
      const headPath = path.join(gitDir, "HEAD");
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(headPath, "ref: refs/heads/main\n");

      const result = getGitBranch(tempDir);
      expect(result).toBe("main");
    });

    it("handles detached HEAD state", () => {
      const gitDir = path.join(tempDir, ".git");
      const headPath = path.join(gitDir, "HEAD");
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(headPath, "abc1234567890def\n");

      const result = getGitBranch(tempDir);
      // Returns first 7 chars of SHA
      expect(result).toBe("abc1234");
    });

    it("walks up to find .git in parent directory", () => {
      const gitDir = path.join(tempDir, ".git");
      const headPath = path.join(gitDir, "HEAD");
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(headPath, "ref: refs/heads/develop\n");

      const subdir = path.join(tempDir, "src", "nested");
      fs.mkdirSync(subdir, { recursive: true });

      const result = getGitBranch(subdir);
      expect(result).toBe("develop");
    });
  });
});
