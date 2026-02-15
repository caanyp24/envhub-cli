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

import { revokeCommand } from "../../src/commands/revoke.js";

// ── Tests ────────────────────────────────────────────────────────

describe("revokeCommand", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("should revoke access successfully", async () => {
    mockProvider.revoke.mockResolvedValueOnce(undefined);

    await revokeCommand("my-app", "bob");

    expect(mockProvider.revoke).toHaveBeenCalledWith("my-app", "bob");
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Revoked 'bob' access to 'my-app'")
    );
  });

  it("should show an error when revoking fails", async () => {
    mockProvider.revoke.mockRejectedValueOnce(
      new Error("User does not have access")
    );

    await revokeCommand("my-app", "unknown-user");

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to revoke access")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
