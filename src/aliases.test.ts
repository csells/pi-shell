import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd, opts) => {
    // Mock implementation: return shell alias output based on test context
    // In practice, we'll override this in each test
    return "";
  }),
}));

// Import AFTER mocking
import { importAliases } from "./aliases";
import { execSync as execSyncMock } from "node:child_process";

const mockExecSync = execSyncMock as any;

describe("aliases module", () => {
  describe("importAliases", () => {
    beforeEach(() => {
      mockExecSync.mockClear();
    });

    it("parses simple aliases without quotes", () => {
      mockExecSync.mockReturnValue("cls=clear\nll=ls -l\n");
      const aliases = importAliases();
      expect(aliases.get("cls")).toBe("clear");
      expect(aliases.get("ll")).toBe("ls -l");
    });

    it("parses single-quoted aliases", () => {
      mockExecSync.mockReturnValue("ll='lsd -l'\nla='lsd -a'\n");
      const aliases = importAliases();
      expect(aliases.get("ll")).toBe("lsd -l");
      expect(aliases.get("la")).toBe("lsd -a");
    });

    it("parses double-quoted aliases", () => {
      mockExecSync.mockReturnValue('myalias="echo hello world"\n');
      const aliases = importAliases();
      expect(aliases.get("myalias")).toBe("echo hello world");
    });

    it("handles mixed quote styles", () => {
      mockExecSync.mockReturnValue(
        "single='value1'\ndouble=\"value2\"\nnoquote=value3\n"
      );
      const aliases = importAliases();
      expect(aliases.get("single")).toBe("value1");
      expect(aliases.get("double")).toBe("value2");
      expect(aliases.get("noquote")).toBe("value3");
    });

    it("ignores empty lines", () => {
      mockExecSync.mockReturnValue("alias1=value1\n\nalias2=value2\n");
      const aliases = importAliases();
      expect(aliases.size).toBe(2);
      expect(aliases.get("alias1")).toBe("value1");
      expect(aliases.get("alias2")).toBe("value2");
    });

    it("ignores malformed lines", () => {
      mockExecSync.mockReturnValue(
        "valid=value\ninvalid line without equals\nanother=valid\n"
      );
      const aliases = importAliases();
      expect(aliases.size).toBe(2);
      expect(aliases.get("valid")).toBe("value");
      expect(aliases.get("another")).toBe("valid");
    });

    it("accepts alias names with underscores, dashes, and dots", () => {
      mockExecSync.mockReturnValue("my_alias=val1\nmy-alias=val2\nmy.alias=val3\n");
      const aliases = importAliases();
      expect(aliases.get("my_alias")).toBe("val1");
      expect(aliases.get("my-alias")).toBe("val2");
      expect(aliases.get("my.alias")).toBe("val3");
    });

    it("handles complex command expansions", () => {
      mockExecSync.mockReturnValue(
        "gitlog='git log --oneline -10'\nfindpy='find . -name \"*.py\"'\n"
      );
      const aliases = importAliases();
      expect(aliases.get("gitlog")).toBe("git log --oneline -10");
      expect(aliases.get("findpy")).toBe('find . -name "*.py"');
    });

    it("returns empty map when execSync fails", () => {
      mockExecSync.mockImplementation(() => {
        throw new Error("Shell not available");
      });
      const aliases = importAliases();
      expect(aliases.size).toBe(0);
    });

    it("returns empty map for empty shell output", () => {
      mockExecSync.mockReturnValue("");
      const aliases = importAliases();
      expect(aliases.size).toBe(0);
    });

    it("handles shell timeout gracefully", () => {
      mockExecSync.mockImplementation(() => {
        const err = new Error("Timeout");
        (err as any).code = "ETIMEDOUT";
        throw err;
      });
      const aliases = importAliases();
      expect(aliases.size).toBe(0);
    });

    it("preserves spaces in quoted values", () => {
      mockExecSync.mockReturnValue("spaced='a b c d'\n");
      const aliases = importAliases();
      expect(aliases.get("spaced")).toBe("a b c d");
    });

    it("handles values with = sign in them", () => {
      mockExecSync.mockReturnValue("export='export FOO=bar'\n");
      const aliases = importAliases();
      expect(aliases.get("export")).toBe("export FOO=bar");
    });

    it("strips only outer quotes, not inner ones", () => {
      mockExecSync.mockReturnValue('nested="echo \\"quoted\\""\n');
      const aliases = importAliases();
      expect(aliases.get("nested")).toBe('echo \\"quoted\\"');
    });

    it("passes timeout and TERM=dumb env to execSync", () => {
      mockExecSync.mockReturnValue("alias=value\n");
      importAliases();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          encoding: "utf-8",
          timeout: 5000,
          env: expect.objectContaining({
            TERM: "dumb",
          }),
        })
      );
    });
  });
});
