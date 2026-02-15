import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────

const { mockProvider, mockSpinner } = vi.hoisted(() => ({
  mockProvider: {
    name: "aws",
    push: vi.fn(),
    pull: vi.fn(),
    cat: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    getVersion: vi.fn(),
  },
  mockSpinner: {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../../src/config/config.js", () => ({
  configManager: {
    load: vi.fn().mockResolvedValue({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {},
    }),
  },
}));

vi.mock("../../src/providers/provider.factory.js", () => ({
  ProviderFactory: {
    createProvider: vi.fn().mockReturnValue(mockProvider),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    dim: vi.fn(),
    newline: vi.fn(),
    spinner: vi.fn().mockReturnValue(mockSpinner),
  },
}));

import { catCommand } from "../../src/commands/cat.js";
import { logger } from "../../src/utils/logger.js";

// ── Tests ────────────────────────────────────────────────────────

describe("catCommand", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("should display secret content in formatted output", async () => {
    mockProvider.cat.mockResolvedValueOnce(
      "DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=secret123"
    );

    await catCommand("my-app");

    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("3 keys")
    );
    expect(logger.log).toHaveBeenCalled();
    const logCalls = (logger.log as any).mock.calls.map((c: any) => c[0]).join("\n");
    expect(logCalls).toContain("DB_HOST");
    expect(logCalls).toContain("DB_PORT");
    expect(logCalls).toContain("API_KEY");
  });

  it("should show an error when the secret cannot be read", async () => {
    mockProvider.cat.mockRejectedValueOnce(new Error("Secret not found"));

    await catCommand("nonexistent");

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should handle empty secrets gracefully", async () => {
    mockProvider.cat.mockResolvedValueOnce("");

    await catCommand("empty-secret");

    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("0 keys")
    );
  });
});
