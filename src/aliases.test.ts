import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { importAliases } from "./aliases";

describe("aliases module", () => {
  // We'll mock execSync to test parsing without needing an actual shell
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("importAliases", () => {
    it("parses simple aliases without quotes", () => {
      const { execSync } = require("node:child_process");
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "cls=clear\nll=ls -l\n"
      );

      const aliases = importAliases();
      expect(aliases.get("cls")).toBe("clear");
      expect(aliases.get("ll")).toBe("ls -l");
    });

    it("parses single-quoted aliases", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "ll='lsd -l'\nla='lsd -a'\n"
      );

      const aliases = importAliases();
      expect(aliases.get("ll")).toBe("lsd -l");
      expect(aliases.get("la")).toBe("lsd -a");
    });

    it("parses double-quoted aliases", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        'myalias="echo hello world"\n'
      );

      const aliases = importAliases();
      expect(aliases.get("myalias")).toBe("echo hello world");
    });

    it("handles mixed quote styles", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "single='value1'\ndouble=\"value2\"\nnoquote=value3\n"
      );

      const aliases = importAliases();
      expect(aliases.get("single")).toBe("value1");
      expect(aliases.get("double")).toBe("value2");
      expect(aliases.get("noquote")).toBe("value3");
    });

    it("ignores empty lines", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "alias1=value1\n\nalias2=value2\n"
      );

      const aliases = importAliases();
      expect(aliases.size).toBe(2);
      expect(aliases.get("alias1")).toBe("value1");
      expect(aliases.get("alias2")).toBe("value2");
    });

    it("ignores malformed lines", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "valid=value\ninvalid line without equals\nanother=valid\n"
      );

      const aliases = importAliases();
      expect(aliases.size).toBe(2);
      expect(aliases.get("valid")).toBe("value");
      expect(aliases.get("another")).toBe("valid");
    });

    it("accepts alias names with underscores, dashes, and dots", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "my_alias=val1\nmy-alias=val2\nmy.alias=val3\n"
      );

      const aliases = importAliases();
      expect(aliases.get("my_alias")).toBe("val1");
      expect(aliases.get("my-alias")).toBe("val2");
      expect(aliases.get("my.alias")).toBe("val3");
    });

    it("handles complex command expansions", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "gitlog='git log --oneline -10'\nfindpy='find . -name \"*.py\"'\n"
      );

      const aliases = importAliases();
      expect(aliases.get("gitlog")).toBe("git log --oneline -10");
      expect(aliases.get("findpy")).toBe('find . -name "*.py"');
    });

    it("returns empty map when execSync fails", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockImplementation(
        () => {
          throw new Error("Shell not available");
        }
      );

      const aliases = importAliases();
      expect(aliases.size).toBe(0);
    });

    it("returns empty map for empty shell output", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue("");

      const aliases = importAliases();
      expect(aliases.size).toBe(0);
    });

    it("handles shell timeout gracefully", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockImplementation(
        () => {
          const err = new Error("Timeout");
          (err as any).code = "ETIMEDOUT";
          throw err;
        }
      );

      const aliases = importAliases();
      expect(aliases.size).toBe(0);
    });

    it("preserves spaces in quoted values", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "spaced='a b c d'\n"
      );

      const aliases = importAliases();
      expect(aliases.get("spaced")).toBe("a b c d");
    });

    it("handles values with = sign in them", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        "export='export FOO=bar'\n"
      );

      const aliases = importAliases();
      expect(aliases.get("export")).toBe("export FOO=bar");
    });

    it("strips only outer quotes, not inner ones", () => {
      vi.spyOn(require("node:child_process"), "execSync").mockReturnValue(
        'nested="echo \\"quoted\\""\n'
      );

      const aliases = importAliases();
      expect(aliases.get("nested")).toBe('echo \\"quoted\\"');
    });

    it("passes timeout and TERM=dumb env to execSync", () => {
      const execSyncSpy = vi
        .spyOn(require("node:child_process"), "execSync")
        .mockReturnValue("alias=value\n");

      importAliases();

      expect(execSyncSpy).toHaveBeenCalledWith(
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
