import { describe, it, expect, vi, beforeEach } from "vitest";
import { VersionControl } from "../../src/versioning/version-control.js";
import { ConfigManager } from "../../src/config/config.js";
import type { SecretProvider } from "../../src/providers/provider.interface.js";

// ── Helpers ──────────────────────────────────────────────────────

function createMockProvider(overrides: Partial<SecretProvider> = {}): SecretProvider {
  return {
    name: "mock",
    push: vi.fn(),
    pull: vi.fn(),
    cat: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    getVersion: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function createMockConfigManager(trackedVersion: number = 0) {
  const manager = {
    getTrackedVersion: vi.fn().mockReturnValue(trackedVersion),
    updateSecret: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfigManager;
  return manager;
}

// ── Tests ────────────────────────────────────────────────────────

describe("VersionControl", () => {
  describe("checkBeforePush", () => {
    it("should allow push when secret does not exist remotely", async () => {
      const provider = createMockProvider({
        getVersion: vi.fn().mockRejectedValue(new Error("Not found")),
      });
      const configManager = createMockConfigManager(0);
      const vc = new VersionControl(configManager, provider);

      const result = await vc.checkBeforePush("my-secret");

      expect(result.canPush).toBe(true);
      expect(result.localVersion).toBe(0);
      expect(result.remoteVersion).toBe(0);
    });

    it("should allow push when remote version is 0", async () => {
      const provider = createMockProvider({
        getVersion: vi.fn().mockResolvedValue(0),
      });
      const configManager = createMockConfigManager(0);
      const vc = new VersionControl(configManager, provider);

      const result = await vc.checkBeforePush("my-secret");

      expect(result.canPush).toBe(true);
      expect(result.remoteVersion).toBe(0);
    });

    it("should allow push when local version matches remote", async () => {
      const provider = createMockProvider({
        getVersion: vi.fn().mockResolvedValue(3),
      });
      const configManager = createMockConfigManager(3);
      const vc = new VersionControl(configManager, provider);

      const result = await vc.checkBeforePush("my-secret");

      expect(result.canPush).toBe(true);
      expect(result.localVersion).toBe(3);
      expect(result.remoteVersion).toBe(3);
    });

    it("should allow push when local version is ahead of remote", async () => {
      const provider = createMockProvider({
        getVersion: vi.fn().mockResolvedValue(2),
      });
      const configManager = createMockConfigManager(3);
      const vc = new VersionControl(configManager, provider);

      const result = await vc.checkBeforePush("my-secret");

      expect(result.canPush).toBe(true);
    });

    it("should detect a conflict when remote is ahead", async () => {
      const provider = createMockProvider({
        getVersion: vi.fn().mockResolvedValue(5),
      });
      const configManager = createMockConfigManager(3);
      const vc = new VersionControl(configManager, provider);

      const result = await vc.checkBeforePush("my-secret");

      expect(result.canPush).toBe(false);
      expect(result.localVersion).toBe(3);
      expect(result.remoteVersion).toBe(5);
      expect(result.reason).toContain("Remote version (5)");
      expect(result.reason).toContain("local version (3)");
    });
  });

  describe("recordPush", () => {
    it("should update the config with the new version and file path", async () => {
      const configManager = createMockConfigManager();
      const provider = createMockProvider();
      const vc = new VersionControl(configManager, provider);

      await vc.recordPush("my-secret", 4, ".env");

      expect(configManager.updateSecret).toHaveBeenCalledWith("my-secret", {
        version: 4,
        file: ".env",
      });
    });
  });

  describe("recordPull", () => {
    it("should update the config with version, file, and timestamp", async () => {
      const configManager = createMockConfigManager();
      const provider = createMockProvider();
      const vc = new VersionControl(configManager, provider);

      const beforeCall = new Date().toISOString();
      await vc.recordPull("my-secret", 2, ".env.local");

      expect(configManager.updateSecret).toHaveBeenCalledTimes(1);

      const callArgs = (configManager.updateSecret as any).mock.calls[0];
      expect(callArgs[0]).toBe("my-secret");
      expect(callArgs[1].version).toBe(2);
      expect(callArgs[1].file).toBe(".env.local");
      expect(callArgs[1].lastPulled).toBeDefined();
      // Timestamp should be a valid ISO string roughly around now
      expect(new Date(callArgs[1].lastPulled).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeCall).getTime() - 1000
      );
    });
  });
});
