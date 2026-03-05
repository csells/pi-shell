import { describe, it, expect } from "vitest";
import { handleExplain } from "./explain";

interface MockExtensionAPI {
  sendUserMessage: (message: string) => void;
}

describe("explain", () => {
  describe("handleExplain", () => {
    it("should detect ?? prefix and send message", () => {
      const messages: string[] = [];
      const pi: MockExtensionAPI = {
        sendUserMessage: (message: string) => {
          messages.push(message);
        },
      };

      const result = handleExplain("?? ls -la", pi as any);

      expect(result).not.toBeNull();
      expect(result?.output).toBe("");
      expect(result?.exitCode).toBe(0);
      expect(result?.cancelled).toBe(false);
      expect(result?.truncated).toBe(false);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("ls -la");
      expect(messages[0]).toContain("Explain this shell command");
    });

    it("should extract command after ??", () => {
      const messages: string[] = [];
      const pi: MockExtensionAPI = {
        sendUserMessage: (message: string) => {
          messages.push(message);
        },
      };

      handleExplain("?? git rebase -i HEAD~5", pi as any);

      expect(messages[0]).toContain("git rebase -i HEAD~5");
      expect(messages[0]).not.toContain("??");
    });

    it("should handle multiple spaces after ??", () => {
      const messages: string[] = [];
      const pi: MockExtensionAPI = {
        sendUserMessage: (message: string) => {
          messages.push(message);
        },
      };

      const result = handleExplain("??   grep -r pattern", pi as any);

      expect(result).not.toBeNull();
      expect(messages[0]).toContain("grep -r pattern");
    });

    it("should return null for non-?? commands", () => {
      const messages: string[] = [];
      const pi: MockExtensionAPI = {
        sendUserMessage: (message: string) => {
          messages.push(message);
        },
      };

      const result = handleExplain("ls -la", pi as any);

      expect(result).toBeNull();
      expect(messages).toHaveLength(0);
    });

    it("should return null for ? prefix (single question mark)", () => {
      const messages: string[] = [];
      const pi: MockExtensionAPI = {
        sendUserMessage: (message: string) => {
          messages.push(message);
        },
      };

      const result = handleExplain("? ls -la", pi as any);

      expect(result).toBeNull();
      expect(messages).toHaveLength(0);
    });

    it("should handle complex commands", () => {
      const messages: string[] = [];
      const pi: MockExtensionAPI = {
        sendUserMessage: (message: string) => {
          messages.push(message);
        },
      };

      const result = handleExplain(
        '?? find . -name "*.ts" -type f | xargs grep TODO',
        pi as any,
      );

      expect(result).not.toBeNull();
      expect(messages[0]).toContain('find . -name "*.ts" -type f | xargs grep TODO');
    });

    it("should return empty BashResult", () => {
      const pi: MockExtensionAPI = {
        sendUserMessage: () => {},
      };

      const result = handleExplain("?? echo hello", pi as any);

      expect(result?.output).toBe("");
      expect(result?.exitCode).toBe(0);
      expect(result?.cancelled).toBe(false);
      expect(result?.truncated).toBe(false);
    });
  });
});
