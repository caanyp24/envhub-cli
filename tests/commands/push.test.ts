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
    promptConfirm: vi.fn().mockResolvedValue(true),
  },
}));

import { pushCommand } from "../../src/commands/push.js";
import { logger } from "../../src/utils/logger.js";
import { VersionControl } from "../../src/versioning/version-control.js";

// ── Tests ────────────────────────────────────────────────────────

describe("pushCommand", () => {
  let tmpDir: string;
  let envFilePath: string;
  const originalExit = process.exit;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(logger.promptConfirm).mockResolvedValue(true);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envhub-push-test-"));
    envFilePath = path.join(tmpDir, ".env");
    process.exit = vi.fn() as any;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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

  it("should fail when remote read errors are not not-found", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n"
    );

    mockProvider.cat.mockRejectedValueOnce(
      Object.assign(new Error("AccessDeniedException: not authorized"), {
        code: "AccessDeniedException",
        statusCode: 403,
      })
    );

    await pushCommand("my-app", envFilePath, {});

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("AccessDeniedException")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockProvider.push).not.toHaveBeenCalled();

    const loggedStrings = vi.mocked(logger.log).mock.calls
      .map((args) => args[0])
      .filter((value): value is string => typeof value === "string");
    expect(loggedStrings.some((entry) => entry.includes("New secret with"))).toBe(false);
  });

  it("should detect no changes and skip push", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n"
    );

    mockProvider.cat.mockResolvedValueOnce("KEY=value\n");
    mockProvider.getVersion.mockResolvedValueOnce(1);

    await pushCommand("my-app", envFilePath, {});

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("No changes detected")
    );
    expect(mockProvider.push).not.toHaveBeenCalled();
  });

  it("should include a message when provided", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n"
    );

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

  it("should render grouped diff output for changes to push", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nOPENAI_API_KEY=old_key\nAPP_PORT=3000\nREDIS_URL=redis://localhost:6379\n"
    );

    mockProvider.cat.mockResolvedValueOnce(
      "OPENAI_API_KEY=new_key\nAPP_PORT=4000\nFEATURE_FLAG_NEW_DASHBOARD=true\n"
    );
    mockProvider.push.mockResolvedValueOnce({ version: 2, name: "my-app" });
    mockProvider.getVersion.mockResolvedValueOnce(1);

    await pushCommand("my-app", envFilePath, { force: true });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Changes to push")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Environment:")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("File:")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Changes to push")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("ADDED (1)")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("CHANGED (2)")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("REMOVED (1)")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("REDIS_URL")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("FEATURE_FLAG_NEW_DASHBOARD")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("OPENAI_API_KEY")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("local : redis://localhost:6379")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("remote: true")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("1 added")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("2 changed")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("1 removed")
    );

    const loggedStrings = vi.mocked(logger.log).mock.calls
      .map((args) => args[0])
      .filter((value): value is string => typeof value === "string");
    const diffBlock = loggedStrings.join("\n");

    expect(diffBlock).toBeDefined();
    expect(diffBlock).toContain("REDIS_URL");
    expect(diffBlock).toContain("local : redis://localhost:6379");
    expect(diffBlock).toContain("FEATURE_FLAG_NEW_DASHBOARD");
    expect(diffBlock).toContain("remote: true");
  });

  it("should cancel cleanly on Ctrl+C during push confirmation", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nOPENAI_API_KEY=old_key\n"
    );

    mockProvider.cat.mockResolvedValueOnce("OPENAI_API_KEY=new_key\n");
    mockProvider.getVersion.mockResolvedValueOnce(0);
    vi.mocked(logger.promptConfirm).mockResolvedValueOnce("cancelled");

    await pushCommand("my-app", envFilePath, {});

    expect(logger.info).toHaveBeenCalledWith("Push cancelled.");
    expect(mockProvider.push).not.toHaveBeenCalled();

    const loggedStrings = vi.mocked(logger.log).mock.calls
      .map((args) => args[0])
      .filter((value): value is string => typeof value === "string");
    expect(loggedStrings.some((entry) => entry.includes("New secret with"))).toBe(false);
  });

  it("should abort immediately on version conflict without force-push prompt", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n"
    );

    mockProvider.cat.mockResolvedValueOnce("KEY=remote\n");
    const conflictSpy = vi
      .spyOn(VersionControl.prototype, "checkBeforePush")
      .mockResolvedValueOnce({
        canPush: false,
        localVersion: 1,
        remoteVersion: 5,
        reason:
          "Remote version (5) is newer than your local version (1). Run 'envhub pull' first to get the latest changes, or use --force to overwrite.",
      });

    await pushCommand("my-app", envFilePath, {});

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Remote version (5) is newer than your local version (1).")
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("\nRun 'envhub pull' first to sync changes, or use --force to overwrite.")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(logger.promptConfirm).not.toHaveBeenCalled();
    expect(mockProvider.push).not.toHaveBeenCalled();
    conflictSpy.mockRestore();
  });

  it("should block push when envhub header is missing for an existing secret", async () => {
    await fs.writeFile(envFilePath, "KEY=value\n");
    mockProvider.cat.mockResolvedValueOnce("KEY=remote\n");

    await pushCommand("my-app", envFilePath, {});

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Missing envhub header")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockProvider.push).not.toHaveBeenCalled();
  });

  it("should allow first push without envhub header for a new secret", async () => {
    await fs.writeFile(envFilePath, "KEY=value\n");

    mockProvider.cat.mockReset();
    mockProvider.push.mockReset();
    mockProvider.getVersion.mockReset();
    vi.mocked(logger.promptConfirm).mockReset();
    vi.mocked(logger.promptConfirm).mockImplementation(async () => true);
    mockProvider.cat.mockRejectedValueOnce(new Error("Not found"));
    mockProvider.push.mockResolvedValueOnce({ version: 1, name: "my-app-demo" });
    mockProvider.getVersion.mockRejectedValueOnce(new Error("Not found"));

    await pushCommand("my-app-demo", envFilePath, {});

    expect(mockProvider.cat).toHaveBeenCalledWith("my-app-demo");
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining("Push cancelled.")
    );
    expect(process.exit).not.toHaveBeenCalled();
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

  it("should block push when envhub header environment does not match target secret", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app-prod\n\nKEY=value\n"
    );
    mockProvider.cat.mockResolvedValueOnce("KEY=value\n");

    await pushCommand("my-app-dev", envFilePath, {});

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Environment mismatch")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockProvider.push).not.toHaveBeenCalled();
  });

  it("should allow envhub header mismatch when --force is used", async () => {
    await fs.writeFile(
      envFilePath,
      "# 🔐 Managed by envhub-cli\n# Environment: my-app-prod\n\nKEY=value\n"
    );

    mockProvider.cat.mockRejectedValueOnce(new Error("Not found"));
    mockProvider.push.mockResolvedValueOnce({ version: 1, name: "my-app-dev" });
    mockProvider.getVersion.mockRejectedValueOnce(new Error("Not found"));

    await pushCommand("my-app-dev", envFilePath, { force: true });

    expect(mockProvider.push).toHaveBeenCalledWith(
      "my-app-dev",
      "KEY=value\n",
      expect.objectContaining({ force: true })
    );
  });
});
