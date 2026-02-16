import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ── Hoisted mocks (available inside vi.mock factories) ───────────

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
    getConfig: vi.fn().mockReturnValue({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {},
    }),
    getTrackedVersion: vi.fn().mockReturnValue(0),
    updateSecret: vi.fn().mockResolvedValue(undefined),
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

import { pushCommand } from "../../src/commands/push.js";
import { logger } from "../../src/utils/logger.js";

// ── Tests ────────────────────────────────────────────────────────

describe("pushCommand", () => {
  let tmpDir: string;
  let envFilePath: string;
  const originalExit = process.exit;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envhub-push-test-"));
    envFilePath = path.join(tmpDir, ".env");
    process.exit = vi.fn() as any;
  });

  afterEach(async () => {
    process.exit = originalExit;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should show an error when the file does not exist", async () => {
    // process.exit is mocked and doesn't halt execution, so readEnvFileRaw
    // will throw after the error is logged. We catch that to verify the behavior.
    try {
      await pushCommand("my-app", path.join(tmpDir, "nonexistent"), {});
    } catch {
      // Expected: readEnvFileRaw throws because process.exit didn't halt
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("File not found")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should push a new secret successfully", async () => {
    await fs.writeFile(envFilePath, "KEY=value\n");

    mockProvider.cat.mockRejectedValueOnce(new Error("Not found"));
    mockProvider.push.mockResolvedValueOnce({ version: 1, name: "my-app" });
    mockProvider.getVersion.mockRejectedValueOnce(new Error("Not found"));

    await pushCommand("my-app", envFilePath, { force: true });

    expect(mockProvider.push).toHaveBeenCalledWith(
      "my-app",
      "KEY=value\n",
      expect.objectContaining({ force: true })
    );
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Pushed 'my-app' (v1)")
    );
  });

  it("should detect no changes and skip push", async () => {
    await fs.writeFile(envFilePath, "KEY=value\n");

    mockProvider.cat.mockResolvedValueOnce("KEY=value\n");
    mockProvider.getVersion.mockResolvedValueOnce(1);

    await pushCommand("my-app", envFilePath, {});

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("No changes detected")
    );
    expect(mockProvider.push).not.toHaveBeenCalled();
  });

  it("should include a message when provided", async () => {
    await fs.writeFile(envFilePath, "KEY=value\n");

    mockProvider.cat.mockRejectedValueOnce(new Error("Not found"));
    mockProvider.push.mockResolvedValueOnce({ version: 1, name: "my-app" });
    mockProvider.getVersion.mockRejectedValueOnce(new Error("Not found"));

    await pushCommand("my-app", envFilePath, {
      message: "Initial push",
      force: true,
    });

    expect(mockProvider.push).toHaveBeenCalledWith(
      "my-app",
      "KEY=value\n",
      expect.objectContaining({ message: "Initial push" })
    );
    expect(logger.dim).toHaveBeenCalledWith(
      expect.stringContaining("Initial push")
    );
  });

  it("should strip envhub header before push", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n"
    );

    mockProvider.cat.mockRejectedValueOnce(new Error("Not found"));
    mockProvider.push.mockResolvedValueOnce({ version: 1, name: "my-app" });
    mockProvider.getVersion.mockRejectedValueOnce(new Error("Not found"));

    await pushCommand("my-app", envFilePath, { force: true });

    expect(mockProvider.push).toHaveBeenCalledWith(
      "my-app",
      "KEY=value\n",
      expect.objectContaining({ force: true })
    );
  });
});
