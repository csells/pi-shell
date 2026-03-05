import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleCat } from "./preview";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock the pi functions
vi.mock("@mariozechner/pi-coding-agent", () => ({
  highlightCode: (code: string, lang?: string) => {
    // Simple mock: just return the code split by lines
    return code.split("\n");
  },
  getLanguageFromPath: (filePath: string) => {
    const ext = path.extname(filePath);
    switch (ext) {
      case ".ts":
        return "typescript";
      case ".js":
        return "javascript";
      case ".json":
        return "json";
      case ".md":
        return "markdown";
      default:
        return undefined;
    }
  },
}));

describe("preview", () => {
  describe("handleCat", () => {
    let testDir: string;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-test-"));
    });

    afterEach(() => {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    });

    it("should detect cat command with single file", () => {
      const testFile = path.join(testDir, "test.txt");
      fs.writeFileSync(testFile, "test content");

      const result = handleCat(`cat ${testFile}`);

      expect(result).not.toBeNull();
      expect(result?.exitCode).toBe(0);
      expect(result?.output).toContain("test content");
    });

    it("should return null for non-cat commands", () => {
      const result = handleCat("ls -la");
      expect(result).toBeNull();
    });

    it("should return null for cat with flags", () => {
      const result = handleCat("cat -n file.txt");
      expect(result).toBeNull();
    });

    it("should handle absolute paths", () => {
      const testFile = path.join(testDir, "absolute.txt");
      fs.writeFileSync(testFile, "absolute path test");

      const result = handleCat(`cat ${testFile}`);

      expect(result).not.toBeNull();
      expect(result?.output).toContain("absolute path test");
    });

    it("should return error for non-existent file", () => {
      const result = handleCat(`cat ${path.join(testDir, "nonexistent.txt")}`);

      expect(result).not.toBeNull();
      expect(result?.exitCode).toBe(1);
      expect(result?.output).toContain("No such file or directory");
    });

    it("should handle multiline content", () => {
      const testFile = path.join(testDir, "multiline.txt");
      const content = "line 1\nline 2\nline 3";
      fs.writeFileSync(testFile, content);

      const result = handleCat(`cat ${testFile}`);

      expect(result?.output).toContain("line 1");
      expect(result?.output).toContain("line 2");
      expect(result?.output).toContain("line 3");
    });

    it("should return empty BashResult fields correctly", () => {
      const testFile = path.join(testDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      const result = handleCat(`cat ${testFile}`);

      expect(result?.cancelled).toBe(false);
      expect(result?.truncated).toBe(false);
    });

    it("should handle typescript files", () => {
      const testFile = path.join(testDir, "test.ts");
      fs.writeFileSync(testFile, "const x: number = 42;");

      const result = handleCat(`cat ${testFile}`);

      expect(result?.output).toContain("const x: number = 42;");
    });

    it("should handle json files", () => {
      const testFile = path.join(testDir, "test.json");
      fs.writeFileSync(testFile, '{"key": "value"}');

      const result = handleCat(`cat ${testFile}`);

      expect(result?.output).toContain("key");
      expect(result?.output).toContain("value");
    });

    it("should have correct BashResult structure", () => {
      const testFile = path.join(testDir, "test.txt");
      fs.writeFileSync(testFile, "test");

      const result = handleCat(`cat ${testFile}`);

      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("exitCode");
      expect(result).toHaveProperty("cancelled");
      expect(result).toHaveProperty("truncated");
      expect(Object.keys(result || {}).length).toBe(4);
    });

    it("should return null for cat with multiple files", () => {
      const result = handleCat("cat file1.txt file2.txt");
      expect(result).toBeNull();
    });

    it("should work with cat and trailing whitespace", () => {
      const testFile = path.join(testDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      const result = handleCat(`cat ${testFile}   `);

      expect(result).not.toBeNull();
      expect(result?.output).toContain("content");
    });
  });
});
