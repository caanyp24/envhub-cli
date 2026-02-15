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
    tableHeader: vi.fn(),
    tableRow: vi.fn(),
    spinner: vi.fn().mockReturnValue(mockSpinner),
  },
}));

import { listCommand } from "../../src/commands/list.js";
import { logger } from "../../src/utils/logger.js";

// ── Tests ────────────────────────────────────────────────────────

describe("listCommand", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("should display a list of secrets as a table", async () => {
    mockProvider.list.mockResolvedValueOnce([
      {
        name: "app-dev",
        secretsCount: 5,
        updatedAt: new Date("2025-06-01"),
        lastMessage: "added redis",
      },
      {
        name: "app-prod",
        secretsCount: 8,
        updatedAt: new Date("2025-06-15"),
        lastMessage: null,
      },
    ]);

    await listCommand();

    expect(mockSpinner.stop).toHaveBeenCalled();
    expect(logger.tableHeader).toHaveBeenCalled();
    expect(logger.tableRow).toHaveBeenCalledTimes(2);
    expect(logger.dim).toHaveBeenCalledWith(
      expect.stringContaining("2 secret(s) found")
    );
  });

  it("should show a message when no secrets exist", async () => {
    mockProvider.list.mockResolvedValueOnce([]);

    await listCommand();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("No secrets found")
    );
    expect(logger.tableHeader).not.toHaveBeenCalled();
  });

  it("should show an error when the provider fails", async () => {
    mockProvider.list.mockRejectedValueOnce(new Error("Network error"));

    await listCommand();

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to list")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
