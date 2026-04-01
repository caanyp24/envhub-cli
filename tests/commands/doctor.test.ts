import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockProvider } = vi.hoisted(() => ({
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
}));

vi.mock("../../src/config/config.js", () => ({
  configManager: {
    load: vi.fn().mockResolvedValue({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {},
    }),
    getConfigPath: vi.fn().mockReturnValue("/tmp/.envhubrc.json"),
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
  },
}));

import { doctorCommand, runDoctorChecks } from "../../src/commands/doctor.js";
import { configManager } from "../../src/config/config.js";
import { ProviderFactory } from "../../src/providers/provider.factory.js";
import { logger } from "../../src/utils/logger.js";

describe("doctorCommand", () => {
  const originalExit = process.exit;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
    console.log = vi.fn();
    mockProvider.list.mockResolvedValue([]);
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalConsoleLog;
  });

  it("should complete successfully when all checks pass", async () => {
    await doctorCommand({});

    expect(mockProvider.list).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("Summary:"));
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("should exit with code 1 when config load fails", async () => {
    vi.mocked(configManager.load).mockRejectedValueOnce(
      new Error("No envhub configuration found")
    );

    await doctorCommand({});

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("config.load")
    );
  });

  it("should exit with code 1 when prefix is empty or whitespace", async () => {
    vi.mocked(configManager.load).mockResolvedValueOnce({
      provider: "aws",
      prefix: "   ",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {},
    });

    await doctorCommand({});

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("prefix: Configured prefix is empty")
    );
  });

  it("should exit with code 1 when provider initialization fails", async () => {
    vi.mocked(ProviderFactory.createProvider).mockImplementationOnce(() => {
      throw new Error("bad provider config");
    });

    await doctorCommand({});

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("provider.init")
    );
  });

  it("should exit with code 1 when provider list fails", async () => {
    mockProvider.list.mockRejectedValueOnce(new Error("Access denied"));

    await doctorCommand({});

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("provider.reachability_and_auth")
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Hint (provider.reachability_and_auth, provider.rights)"
      )
    );
  });

  it("should keep exit code 0 on warnings only", async () => {
    vi.mocked(configManager.load).mockResolvedValueOnce({
      provider: "aws",
      prefix: " envhub- ",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {},
    });

    await doctorCommand({});

    expect(process.exit).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("warning(s), 0 failed")
    );
  });

  it("should output deterministic JSON with --json", async () => {
    await doctorCommand({ json: true });

    expect(console.log).toHaveBeenCalledTimes(1);
    const [raw] = vi.mocked(console.log).mock.calls[0] as [string];
    const parsed = JSON.parse(raw);

    expect(parsed.summary).toEqual({
      pass: 5,
      warn: 0,
      fail: 0,
    });
    expect(parsed.checks).toHaveLength(5);
    expect(parsed.checks[0].id).toBe("config.load");
  });

  it("should render emoji status icons in human mode", async () => {
    await doctorCommand({});

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("✅ config.load:")
    );
  });
});

describe("runDoctorChecks", () => {
  it("should include all expected check ids in order", async () => {
    const report = await runDoctorChecks();
    expect(report.checks.map((c) => c.id)).toEqual([
      "config.load",
      "prefix",
      "provider.init",
      "provider.reachability_and_auth",
      "provider.rights",
    ]);
  });
});
