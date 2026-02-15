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

import { grantCommand } from "../../src/commands/grant.js";

// ── Tests ────────────────────────────────────────────────────────

describe("grantCommand", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("should grant access successfully", async () => {
    mockProvider.grant.mockResolvedValueOnce(undefined);

    await grantCommand("my-app", "bob");

    expect(mockProvider.grant).toHaveBeenCalledWith("my-app", "bob");
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Granted 'bob' access to 'my-app'")
    );
  });

  it("should show an error when granting fails", async () => {
    mockProvider.grant.mockRejectedValueOnce(
      new Error("User not found")
    );

    await grantCommand("my-app", "unknown-user");

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to grant access")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
