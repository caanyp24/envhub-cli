import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { configManager } from "../../src/config/config.js";
import { logger } from "../../src/utils/logger.js";

// ── Hoisted mocks ────────────────────────────────────────────────

const { mockProvider, mockSpinner, mockClackLog, mockClackNote } = vi.hoisted(() => ({
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
  mockClackLog: {
    message: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  mockClackNote: vi.fn(),
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

vi.mock("@clack/prompts", () => ({
  log: mockClackLog,
  note: mockClackNote,
}));

import { pullCommand } from "../../src/commands/pull.js";

async function withTTYOverride(
  stdoutIsTTY: boolean,
  stderrIsTTY: boolean,
  run: () => Promise<void>
): Promise<void> {
  const originalStdoutTTY = process.stdout.isTTY;
  const originalStderrTTY = process.stderr.isTTY;
  Object.defineProperty(process.stdout, "isTTY", {
    value: stdoutIsTTY,
    configurable: true,
  });
  Object.defineProperty(process.stderr, "isTTY", {
    value: stderrIsTTY,
    configurable: true,
  });

  try {
    await run();
  } finally {
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalStdoutTTY,
      configurable: true,
    });
    Object.defineProperty(process.stderr, "isTTY", {
      value: originalStderrTTY,
      configurable: true,
    });
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("pullCommand", () => {
  let tmpDir: string;
  let envFilePath: string;
  const originalExit = process.exit;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envhub-pull-test-"));
    envFilePath = path.join(tmpDir, ".env");
    process.exit = vi.fn() as any;
  });

  afterEach(async () => {
    process.exit = originalExit;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should pull a secret and write it to the file", async () => {
    await fs.writeFile(envFilePath, "PLACEHOLDER=1\n");
    mockProvider.pull.mockResolvedValueOnce({
      content: "DB_HOST=localhost\nDB_PORT=5432\n",
      version: 3,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath);

    const content = await fs.readFile(envFilePath, "utf-8");
    expect(content).toBe(
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\nDB_PORT=5432\n"
    );

    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Pulled 'my-app' (v3)")
    );
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("2 keys")
    );
  });

  it("should show an error when the provider fails", async () => {
    await fs.writeFile(envFilePath, "PLACEHOLDER=1\n");
    mockProvider.pull.mockRejectedValueOnce(
      new Error("Secret not found")
    );

    await pullCommand("nonexistent", envFilePath);

    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to pull")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should overwrite the existing file content", async () => {
    await fs.writeFile(envFilePath, "OLD_KEY=old_value\n");

    mockProvider.pull.mockResolvedValueOnce({
      content: "NEW_KEY=new_value\n",
      version: 2,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath);

    const content = await fs.readFile(envFilePath, "utf-8");
    expect(content).toBe(
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nNEW_KEY=new_value\n"
    );
    expect(content).not.toContain("OLD_KEY");
  });

  it("should create a backup file before overwriting when --backup is enabled", async () => {
    await fs.writeFile(envFilePath, "OLD_KEY=old_value\n");
    mockProvider.pull.mockResolvedValueOnce({
      content: "NEW_KEY=new_value\n",
      version: 6,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath, { backup: true });

    const currentContent = await fs.readFile(envFilePath, "utf-8");
    const backupContent = await fs.readFile(`${envFilePath}.bak`, "utf-8");

    expect(currentContent).toBe(
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nNEW_KEY=new_value\n"
    );
    expect(backupContent).toBe("OLD_KEY=old_value\n");
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining(`[backup: ${envFilePath}.bak]`)
    );
  });

  it("should overwrite an existing backup file when --backup is enabled", async () => {
    await fs.writeFile(envFilePath, "OLD_KEY=old_value\n");
    await fs.writeFile(`${envFilePath}.bak`, "STALE_BACKUP=1\n");
    mockProvider.pull.mockResolvedValueOnce({
      content: "NEW_KEY=new_value\n",
      version: 7,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath, { backup: true });

    const backupContent = await fs.readFile(`${envFilePath}.bak`, "utf-8");
    expect(backupContent).toBe("OLD_KEY=old_value\n");
  });

  it("should fail without overwriting target file when backup creation fails", async () => {
    await fs.writeFile(envFilePath, "OLD_KEY=old_value\n");
    await fs.mkdir(`${envFilePath}.bak`);
    mockProvider.pull.mockResolvedValueOnce({
      content: "NEW_KEY=new_value\n",
      version: 8,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath, { backup: true });

    const currentContent = await fs.readFile(envFilePath, "utf-8");
    expect(currentContent).toBe("OLD_KEY=old_value\n");
    expect(mockSpinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create backup")
    );
    expect(mockSpinner.fail).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to pull")
    );
    expect(logger.error).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(configManager.updateSecret).not.toHaveBeenCalled();
  });

  it("should preserve special characters in pulled values end-to-end", async () => {
    await fs.writeFile(envFilePath, "PLACEHOLDER=1\n");
    mockProvider.pull.mockResolvedValueOnce({
      content: 'MESSAGE="say \\"hello\\" \\\\ world"\n',
      version: 4,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath);

    const content = await fs.readFile(envFilePath, "utf-8");
    expect(content).toBe(
      '# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nMESSAGE="say \\"hello\\" \\\\ world"\n'
    );
  });

  it("should show diff and version check in dry-run without writing file", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\nDB_PORT=5432\n"
    );

    vi.mocked(configManager.getTrackedVersion).mockReturnValueOnce(1);
    mockProvider.pull.mockResolvedValueOnce({
      content: "DB_HOST=localhost\nDB_PORT=6543\nNEW_KEY=new_value\n",
      version: 3,
      name: "my-app",
    });

    await withTTYOverride(true, true, async () => {
      await pullCommand("my-app", envFilePath, { dryRun: true });
    });

    const content = await fs.readFile(envFilePath, "utf-8");
    expect(content).toBe(
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\nDB_PORT=5432\n"
    );

    expect(configManager.updateSecret).not.toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Dry-run pull 'my-app' (v3)")
    );
    expect(mockClackLog.step).toHaveBeenCalledWith(
      "Dry Run Pull Preview",
      expect.objectContaining({ spacing: 0 })
    );
    expect(mockClackLog.message).toHaveBeenCalledWith(
      expect.stringContaining("Environment: "),
      expect.objectContaining({ spacing: 0 })
    );
    expect(mockClackLog.message).toHaveBeenCalledWith(
      expect.stringContaining("Version: local=v1, remote=v3"),
      expect.objectContaining({ spacing: 0 })
    );
    expect(mockClackLog.message).toHaveBeenCalledWith(
      "Changes if pulled:",
      expect.objectContaining({ spacing: 0 })
    );
    expect(mockClackNote).toHaveBeenCalledWith(
      expect.stringContaining("NEW_KEY"),
      expect.stringContaining("ADDED"),
      expect.objectContaining({ format: expect.any(Function) })
    );
    expect(mockClackLog.message).toHaveBeenCalledWith(
      expect.stringContaining("added")
    );
    expect(mockClackLog.info).toHaveBeenCalledWith(
      expect.stringContaining("no changes were applied")
    );
  });

  it("should report no changes in dry-run mode", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\n"
    );

    vi.mocked(configManager.getTrackedVersion).mockReturnValueOnce(2);
    mockProvider.pull.mockResolvedValueOnce({
      content: "DB_HOST=localhost\n",
      version: 2,
      name: "my-app",
    });

    await withTTYOverride(true, true, async () => {
      await pullCommand("my-app", envFilePath, { dryRun: true });
    });

    expect(configManager.updateSecret).not.toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalledWith(
      expect.stringContaining("Dry-run pull 'my-app' (v2)")
    );
    expect(mockClackLog.info).toHaveBeenCalledWith(
      expect.stringContaining("No changes detected")
    );
    expect(mockClackLog.info).toHaveBeenCalledWith(
      expect.stringContaining("no changes were applied")
    );
  });

  it("should fallback to plaintext dry-run output when TTY is unavailable", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\n"
    );

    vi.mocked(configManager.getTrackedVersion).mockReturnValueOnce(1);
    mockProvider.pull.mockResolvedValueOnce({
      content: "DB_HOST=localhost\nDB_PORT=6543\n",
      version: 2,
      name: "my-app",
    });

    await withTTYOverride(false, false, async () => {
      await pullCommand("my-app", envFilePath, { dryRun: true });

      expect(mockClackLog.step).not.toHaveBeenCalled();
      expect(mockClackNote).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith("  Dry Run Pull Preview");
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining("Dry-run only compares")
      );
    });
  });

  it("should fail dry-run when local file does not exist", async () => {
    vi.mocked(configManager.getTrackedVersion).mockReturnValueOnce(0);
    mockProvider.pull.mockResolvedValueOnce({
      content: "DB_HOST=localhost\n",
      version: 1,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath, { dryRun: true });

    expect(mockSpinner.fail).not.toHaveBeenCalled();
    expect(mockProvider.pull).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(configManager.updateSecret).not.toHaveBeenCalled();
  });

  it("should fail dry-run when local header is missing", async () => {
    await fs.writeFile(envFilePath, 'DB_HOST="localhost"\n');

    await pullCommand("my-app", envFilePath, { dryRun: true });

    expect(mockProvider.pull).not.toHaveBeenCalled();
    expect(mockSpinner.fail).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(configManager.updateSecret).not.toHaveBeenCalled();
  });

  it("should fail when both --dry-run and --backup are passed", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\n"
    );
    mockProvider.pull.mockResolvedValueOnce({
      content: "DB_HOST=localhost\nDB_PORT=5432\n",
      version: 9,
      name: "my-app",
    });

    await pullCommand("my-app", envFilePath, { dryRun: true, backup: true });

    expect(mockProvider.pull).not.toHaveBeenCalled();
    expect(mockSpinner.fail).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
    await expect(fs.stat(`${envFilePath}.bak`)).rejects.toThrow();
    const currentContent = await fs.readFile(envFilePath, "utf-8");
    expect(currentContent).toBe(
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nDB_HOST=localhost\n"
    );
  });
});
