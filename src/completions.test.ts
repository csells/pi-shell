import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShellAutocompleteProvider } from "./completions.js";

// Mock execSync to avoid needing actual zsh/zpty in tests
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockExecSync = vi.mocked(execSync);

describe("ShellAutocompleteProvider", () => {
  let provider: ShellAutocompleteProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ShellAutocompleteProvider();
  });

  describe("getSuggestions", () => {
    it("returns null for non-bash lines", () => {
      const result = provider.getSuggestions(["hello world"], 0, 5);
      expect(result).toBeNull();
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it("returns null for empty command after !", () => {
      const result = provider.getSuggestions(["!"], 0, 1);
      expect(result).toBeNull();
    });

    it("returns null for empty command after !! ", () => {
      const result = provider.getSuggestions(["!! "], 0, 3);
      expect(result).toBeNull();
    });

    it("calls shell completion for ! prefix", () => {
      mockExecSync.mockReturnValue("stash\nstatus\nstripspace\n");
      const result = provider.getSuggestions(["!git st"], 0, 7);

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(3);
      expect(result!.items[0].value).toBe("stash");
      expect(result!.items[1].value).toBe("status");
      expect(result!.prefix).toBe("st");
    });

    it("calls shell completion for !! prefix", () => {
      mockExecSync.mockReturnValue("src/\nspecs/\n");
      const result = provider.getSuggestions(["!!ls s"], 0, 6);

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(2);
      expect(result!.prefix).toBe("s");
    });

    it("handles ! with space before command", () => {
      mockExecSync.mockReturnValue("stash\nstatus\n");
      const result = provider.getSuggestions(["! git st"], 0, 8);

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(2);
      expect(result!.prefix).toBe("st");
    });

    it("parses descriptions from shell output", () => {
      mockExecSync.mockReturnValue("stash -- Stash changes\nstatus -- Show status\n");
      const result = provider.getSuggestions(["!git st"], 0, 7);

      expect(result).not.toBeNull();
      expect(result!.items[0].value).toBe("stash");
      expect(result!.items[0].description).toBe("Stash changes");
      expect(result!.items[1].value).toBe("status");
      expect(result!.items[1].description).toBe("Show status");
    });

    it("returns null when shell returns no completions", () => {
      mockExecSync.mockReturnValue("");
      const result = provider.getSuggestions(["!xyznotacommand"], 0, 15);
      expect(result).toBeNull();
    });

    it("returns null when shell command fails", () => {
      mockExecSync.mockImplementation(() => { throw new Error("timeout"); });
      const result = provider.getSuggestions(["!git st"], 0, 7);
      expect(result).toBeNull();
    });

    it("caps results at 50", () => {
      const many = Array.from({ length: 100 }, (_, i) => `cmd${i}`).join("\n");
      mockExecSync.mockReturnValue(many);
      const result = provider.getSuggestions(["!c"], 0, 2);

      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(50);
    });

    it("handles first word completion (command names)", () => {
      mockExecSync.mockReturnValue("node\nnodemon\nnpm\n");
      const result = provider.getSuggestions(["!nod"], 0, 4);

      expect(result).not.toBeNull();
      expect(result!.prefix).toBe("nod");
      expect(result!.items[0].value).toBe("node");
    });

    it("passes correct partial to shell script", () => {
      mockExecSync.mockReturnValue("README.md\n");
      provider.getSuggestions(["!cat READ"], 0, 9);

      // Should call with "cat READ" (stripped of ! prefix)
      const callArgs = mockExecSync.mock.calls[0][0] as string;
      expect(callArgs).toContain("cat READ");
    });
  });

  describe("applyCompletion", () => {
    it("replaces prefix with completion value", () => {
      const result = provider.applyCompletion(
        ["!git st"],
        0,
        7,
        { value: "stash", label: "stash" },
        "st",
      );

      expect(result.lines[0]).toBe("!git stash");
      expect(result.cursorCol).toBe(10);
    });

    it("preserves text after cursor", () => {
      const result = provider.applyCompletion(
        ["!git st | less"],
        0,
        7,
        { value: "status", label: "status" },
        "st",
      );

      expect(result.lines[0]).toBe("!git status | less");
      expect(result.cursorCol).toBe(11);
    });

    it("works with !! prefix", () => {
      const result = provider.applyCompletion(
        ["!!ls sr"],
        0,
        7,
        { value: "src/", label: "src/" },
        "sr",
      );

      expect(result.lines[0]).toBe("!!ls src/");
      expect(result.cursorCol).toBe(9);
    });
  });
});
