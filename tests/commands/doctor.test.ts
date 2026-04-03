import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    stop: vi.fn(),
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
    spinner: vi.fn().mockReturnValue(mockSpinner),
  },
}));

import { doctorCommand, runDoctorChecks } from "../../src/commands/doctor.js";
import { configManager } from "../../src/config/config.js";
import { ProviderFactory } from "../../src/providers/provider.factory.js";
import { logger } from "../../src/utils/logger.js";

describe("doctorCommand", () => {
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as any;
    console.log = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "0.3.1" }),
    }) as any;
    mockProvider.list.mockResolvedValue([]);
    mockProvider.cat.mockResolvedValue("KEY=value");
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalConsoleLog;
    global.fetch = originalFetch;
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
        "Hint (provider.reachability_and_auth, provider.list_rights)"
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

  it("should keep exit code 0 when read rights are partially passed", async () => {
    vi.mocked(configManager.load).mockResolvedValueOnce({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {
        "my-app-dev": { version: 2, file: ".env" },
        "my-app-staging": { version: 1, file: ".env.staging" },
      },
    });

    mockProvider.cat.mockImplementation(async (name: string) => {
      if (name === "my-app-dev") {
        throw new Error("Access denied");
      }
      return "KEY=value";
    });

    await doctorCommand({});

    expect(process.exit).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("provider.read_rights: Read checks partially passed")
    );
  });

  it("should output deterministic JSON with --json", async () => {
    await doctorCommand({ json: true });

    expect(console.log).toHaveBeenCalledTimes(1);
    const [raw] = vi.mocked(console.log).mock.calls[0] as [string];
    const parsed = JSON.parse(raw);

    expect(parsed.summary).toEqual({
      pass: 7,
      warn: 1,
      fail: 0,
    });
    expect(parsed.checks).toHaveLength(8);
    expect(parsed.checks[0].id).toBe("version.check");
  });

  it("should render standard status symbols in human mode", async () => {
    await doctorCommand({});

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("✔ config.load:")
    );
  });
});

describe("runDoctorChecks", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "0.3.1" }),
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should include all expected check ids in order", async () => {
    const report = await runDoctorChecks();
    expect(report.checks.map((c) => c.id)).toEqual([
      "version.check",
      "config.load",
      "prefix",
      "provider.init",
      "provider.identity",
      "provider.reachability_and_auth",
      "provider.list_rights",
      "provider.read_rights",
    ]);
  });

  it("should verify read rights for all tracked secrets from config", async () => {
    vi.mocked(configManager.load).mockResolvedValueOnce({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {
        "my-app-dev": { version: 2, file: ".env" },
        "my-app-staging": { version: 1, file: ".env.staging" },
      },
    });

    const report = await runDoctorChecks();

    expect(mockProvider.cat).toHaveBeenCalledWith("my-app-dev");
    expect(mockProvider.cat).toHaveBeenCalledWith("my-app-staging");
    expect(mockProvider.cat).toHaveBeenCalledTimes(2);
    expect(
      report.checks.find((check) => check.id === "provider.read_rights")?.status
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "provider.read_rights")?.message
    ).toContain("Read checks passed for all tracked secrets (2/2)");
    expect(
      report.checks.find((check) => check.id === "provider.read_rights")?.message
    ).toContain("✔ my-app-dev");
    expect(
      report.checks.find((check) => check.id === "provider.read_rights")?.message
    ).toContain("✔ my-app-staging");
  });

  it("should warn read rights when only some tracked secrets are not readable", async () => {
    vi.mocked(configManager.load).mockResolvedValueOnce({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {
        "my-app-dev": { version: 2, file: ".env" },
        "my-app-staging": { version: 1, file: ".env.staging" },
      },
    });

    mockProvider.cat.mockImplementation(async (name: string) => {
      if (name === "my-app-staging") {
        throw new Error("Access denied");
      }
      return "KEY=value";
    });

    const report = await runDoctorChecks();
    const readCheck = report.checks.find(
      (check) => check.id === "provider.read_rights"
    );

    expect(readCheck?.status).toBe("warn");
    expect(readCheck?.message).toContain("partially passed");
    expect(readCheck?.message).toContain("✔ my-app-dev");
    expect(readCheck?.message).toContain("✖ my-app-staging");
    expect(readCheck?.details).toContain("permission");
  });

  it("should fail read rights when all tracked secrets are not readable", async () => {
    vi.mocked(configManager.load).mockResolvedValueOnce({
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "test", region: "eu-central-1" },
      secrets: {
        "my-app-dev": { version: 2, file: ".env" },
        "my-app-staging": { version: 1, file: ".env.staging" },
      },
    });

    mockProvider.cat.mockRejectedValue(new Error("Access denied"));

    const report = await runDoctorChecks();
    const readCheck = report.checks.find(
      (check) => check.id === "provider.read_rights"
    );

    expect(readCheck?.status).toBe("fail");
    expect(readCheck?.message).toContain("all 2 tracked secrets");
    expect(readCheck?.message).toContain("✖ my-app-dev");
    expect(readCheck?.message).toContain("✖ my-app-staging");
    expect(readCheck?.details).toContain("permission");
  });
});
