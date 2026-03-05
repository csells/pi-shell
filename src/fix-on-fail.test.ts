import { describe, it, expect, vi } from "vitest";
import { offerFixOnFail } from "./fix-on-fail";

interface MockExtensionContext {
  hasUI: boolean;
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
  };
}

interface MockExtensionAPI {
  sendUserMessage: (message: string) => void;
}

describe("fix-on-fail", () => {
  describe("offerFixOnFail", () => {
    it("should return false if exit code is 0", async () => {
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: vi.fn(),
      };

      const result = await offerFixOnFail("ls", "", 0, ctx as any, pi as any);

      expect(result).toBe(false);
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("should return false if no UI", async () => {
      const ctx: MockExtensionContext = {
        hasUI: false,
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: vi.fn(),
      };

      const result = await offerFixOnFail("ls", "error", 1, ctx as any, pi as any);

      expect(result).toBe(false);
      expect(ctx.ui.confirm).not.toHaveBeenCalled();
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("should show confirm dialog with exit code", async () => {
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(false),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: vi.fn(),
      };

      await offerFixOnFail("npm test", "error output", 1, ctx as any, pi as any);

      expect(ctx.ui.confirm).toHaveBeenCalledWith(
        "Command failed (exit 1)",
        "Ask the agent to diagnose?",
      );
    });

    it("should return false if user declines", async () => {
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(false),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: vi.fn(),
      };

      const result = await offerFixOnFail(
        "npm test",
        "error",
        1,
        ctx as any,
        pi as any,
      );

      expect(result).toBe(false);
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("should send diagnosis message if user accepts", async () => {
      const messages: string[] = [];
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: (msg: string) => messages.push(msg),
      };

      const result = await offerFixOnFail(
        "npm test",
        "test failed",
        1,
        ctx as any,
        pi as any,
      );

      expect(result).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("npm test");
      expect(messages[0]).toContain("test failed");
      expect(messages[0]).toContain("exit code 1");
      expect(messages[0]).toContain("Diagnose the error");
    });

    it("should truncate output over 2000 chars", async () => {
      const messages: string[] = [];
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: (msg: string) => messages.push(msg),
      };

      const longOutput = "x".repeat(3000);
      await offerFixOnFail(
        "npm test",
        longOutput,
        1,
        ctx as any,
        pi as any,
      );

      expect(messages[0]).toContain("...(truncated)");
      expect(messages[0]).not.toContain("x".repeat(2001));
      // Should contain last 2000 chars
      expect(messages[0]).toContain("x".repeat(1000));
    });

    it("should not truncate output under 2000 chars", async () => {
      const messages: string[] = [];
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: (msg: string) => messages.push(msg),
      };

      const output = "short error message";
      await offerFixOnFail("npm test", output, 1, ctx as any, pi as any);

      expect(messages[0]).toContain(output);
      expect(messages[0]).not.toContain("...(truncated)");
    });

    it("should include command and output in message", async () => {
      const messages: string[] = [];
      const ctx: MockExtensionContext = {
        hasUI: true,
        ui: {
          confirm: vi.fn().mockResolvedValue(true),
        },
      };
      const pi: MockExtensionAPI = {
        sendUserMessage: (msg: string) => messages.push(msg),
      };

      await offerFixOnFail(
        "git commit",
        "fatal: not a git repository",
        128,
        ctx as any,
        pi as any,
      );

      const msg = messages[0];
      expect(msg).toContain("git commit");
      expect(msg).toContain("fatal: not a git repository");
      expect(msg).toContain("exit code 128");
    });

    it("should work with various exit codes", async () => {
      for (const exitCode of [1, 2, 127, 255]) {
        const ctx: MockExtensionContext = {
          hasUI: true,
          ui: {
            confirm: vi.fn().mockResolvedValue(true),
          },
        };
        const pi: MockExtensionAPI = {
          sendUserMessage: vi.fn(),
        };

        await offerFixOnFail("cmd", "error", exitCode, ctx as any, pi as any);

        expect(ctx.ui.confirm).toHaveBeenCalledWith(
          `Command failed (exit ${exitCode})`,
          expect.any(String),
        );
      }
    });
  });
});
