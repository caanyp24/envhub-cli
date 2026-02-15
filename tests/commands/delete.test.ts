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
      secrets: { "my-app": { version: 1, file: ".env" } },
    }),
    getConfig: vi.fn().mockReturnValue({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: { "my-app": { version: 1, file: ".env" } },
    }),
    save: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

import { deleteCommand } from "../../src/commands/delete.js";
import { logger } from "../../src/utils/logger.js";
import { confirm } from "@inquirer/prompts";

// ── Tests ────────────────────────────────────────────────────────

describe("deleteCommand", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("should delete a secret with force flag", async () => {
    mockProvider.delete.mockResolvedValueOnce(undefined);

    await deleteCommand("my-app", { force: true });

    expect(mockProvider.delete).toHaveBeenCalledWith("my-app", { force: true });
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Deleted 'my-app'")
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("should ask for confirmation without force flag", async () => {
    mockProvider.delete.mockResolvedValueOnce(undefined);

    await deleteCommand("my-app", {});

    expect(confirm).toHaveBeenCalled();
    expect(mockProvider.delete).toHaveBeenCalled();
  });

  it("should cancel deletion when user declines", async () => {
    (confirm as any).mockResolvedValueOnce(false);

    await deleteCommand("my-app", {});

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Deletion cancelled")
    );
    expect(mockProvider.delete).not.toHaveBeenCalled();
  });

  it("should show an error when deletion fails", async () => {
    mockProvider.delete.mockRejectedValueOnce(new Error("Access denied"));

    await deleteCommand("my-app", { force: true });

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
