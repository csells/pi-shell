import { describe, it, expect, beforeEach } from "vitest";
import {
  restoreHistory,
  saveHistory,
  MAX_HISTORY,
  HISTORY_ENTRY_TYPE,
} from "./history";

// Mock types for testing
interface MockEntry {
  type: string;
  customType?: string;
  data?: { commands?: string[] };
}

interface MockSessionManager {
  getEntries(): MockEntry[];
}

interface MockExtensionAPI {
  appendEntry: (type: string, data: any) => void;
}

describe("history", () => {
  describe("restoreHistory", () => {
    it("should restore commands from pi-shell-history entries", () => {
      const sessionManager: MockSessionManager = {
        getEntries: () => [
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["ls", "cd src"] },
          },
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["git status", "npm test"] },
          },
        ],
      };

      const history = restoreHistory(
        sessionManager as any,
      );
      expect(history).toEqual(["ls", "cd src", "git status", "npm test"]);
    });

    it("should deduplicate keeping most recent", () => {
      const sessionManager: MockSessionManager = {
        getEntries: () => [
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["ls", "cd src", "ls"] },
          },
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["npm test", "ls"] },
          },
        ],
      };

      const history = restoreHistory(
        sessionManager as any,
      );
      // "ls" appears 3 times but should only appear once (most recent)
      expect(history).toEqual(["cd src", "npm test", "ls"]);
      expect(history.filter(h => h === "ls").length).toBe(1);
    });

    it("should cap at MAX_HISTORY", () => {
      const commands = Array.from({ length: MAX_HISTORY + 100 }, (_, i) =>
        `cmd${i}`,
      );
      const sessionManager: MockSessionManager = {
        getEntries: () => [
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands },
          },
        ],
      };

      const history = restoreHistory(
        sessionManager as any,
      );
      expect(history.length).toBe(MAX_HISTORY);
      // Should keep the last 1000
      expect(history[0]).toBe("cmd100");
      expect(history[MAX_HISTORY - 1]).toBe(`cmd${MAX_HISTORY + 99}`);
    });

    it("should ignore non-history entries", () => {
      const sessionManager: MockSessionManager = {
        getEntries: () => [
          { type: "user", customType: "other", data: { commands: ["ls"] } },
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["cd src"] },
          },
          { type: "assistant", customType: "response" },
        ],
      };

      const history = restoreHistory(
        sessionManager as any,
      );
      expect(history).toEqual(["cd src"]);
    });

    it("should return empty array if no history entries", () => {
      const sessionManager: MockSessionManager = {
        getEntries: () => [],
      };

      const history = restoreHistory(
        sessionManager as any,
      );
      expect(history).toEqual([]);
    });

    it("should handle mixed entry types", () => {
      const sessionManager: MockSessionManager = {
        getEntries: () => [
          { type: "user" },
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["cmd1"] },
          },
          { type: "assistant", customType: "other" },
          {
            type: "custom",
            customType: HISTORY_ENTRY_TYPE,
            data: { commands: ["cmd2", "cmd3"] },
          },
          { type: "custom", customType: "different" },
        ],
      };

      const history = restoreHistory(
        sessionManager as any,
      );
      expect(history).toEqual(["cmd1", "cmd2", "cmd3"]);
    });
  });

  describe("saveHistory", () => {
    it("should append entry with sliced commands", () => {
      const appendedEntries: Array<{ type: string; data: any }> = [];
      const pi: MockExtensionAPI = {
        appendEntry: (type: string, data: any) => {
          appendedEntries.push({ type, data });
        },
      };

      const commands = ["ls", "cd src", "npm test"];
      saveHistory(pi as any, commands);

      expect(appendedEntries).toHaveLength(1);
      expect(appendedEntries[0].type).toBe(HISTORY_ENTRY_TYPE);
      expect(appendedEntries[0].data.commands).toEqual(commands);
    });

    it("should cap commands at MAX_HISTORY when saving", () => {
      const appendedEntries: Array<{ type: string; data: any }> = [];
      const pi: MockExtensionAPI = {
        appendEntry: (type: string, data: any) => {
          appendedEntries.push({ type, data });
        },
      };

      const commands = Array.from({ length: MAX_HISTORY + 100 }, (_, i) =>
        `cmd${i}`,
      );
      saveHistory(pi as any, commands);

      expect(appendedEntries[0].data.commands).toHaveLength(MAX_HISTORY);
      // Should keep the last 1000
      expect(appendedEntries[0].data.commands[0]).toBe(`cmd100`);
    });
  });
});
