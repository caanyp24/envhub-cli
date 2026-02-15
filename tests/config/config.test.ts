import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigManager } from "../../src/config/config.js";
import type { EnvhubConfig } from "../../src/config/config.schema.js";

describe("ConfigManager", () => {
  let tmpDir: string;
  let originalCwd: string;

  const validConfig: EnvhubConfig = {
    provider: "aws",
    prefix: "envhub-",
    aws: { profile: "test-profile", region: "eu-central-1" },
    secrets: {},
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envhub-cfg-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("should create a config file in the target directory", async () => {
      const manager = new ConfigManager();
      const filePath = await manager.create(validConfig, tmpDir);

      expect(filePath).toBe(path.join(tmpDir, ".envhubrc.json"));

      const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(content.provider).toBe("aws");
      expect(content.aws.profile).toBe("test-profile");
    });

    it("should reject an invalid config", async () => {
      const manager = new ConfigManager();
      const invalidConfig = { prefix: "test-", secrets: {} } as any;

      await expect(manager.create(invalidConfig, tmpDir)).rejects.toThrow(
        "Invalid configuration"
      );
    });
  });

  describe("load", () => {
    it("should load a valid config from the current directory", async () => {
      // Write config file to tmpDir
      await fs.writeFile(
        path.join(tmpDir, ".envhubrc.json"),
        JSON.stringify(validConfig, null, 2)
      );

      const manager = new ConfigManager();
      const config = await manager.load();

      expect(config.provider).toBe("aws");
      expect(config.aws?.profile).toBe("test-profile");
      expect(config.prefix).toBe("envhub-");
    });

    it("should throw when no config file is found", async () => {
      const manager = new ConfigManager();
      await expect(manager.load()).rejects.toThrow(
        "No envhub configuration found"
      );
    });

    it("should throw on invalid config content", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".envhubrc.json"),
        JSON.stringify({ prefix: "test-", secrets: {} })
      );

      const manager = new ConfigManager();
      await expect(manager.load()).rejects.toThrow("Invalid configuration");
    });

    it("should merge with DEFAULT_CONFIG values", async () => {
      const minimalConfig = {
        provider: "aws",
        aws: { profile: "dev", region: "us-east-1" },
      };
      await fs.writeFile(
        path.join(tmpDir, ".envhubrc.json"),
        JSON.stringify(minimalConfig)
      );

      const manager = new ConfigManager();
      const config = await manager.load();

      expect(config.prefix).toBe("envhub-");
      expect(config.secrets).toEqual({});
    });
  });

  describe("getConfig", () => {
    it("should throw if config has not been loaded", () => {
      const manager = new ConfigManager();
      expect(() => manager.getConfig()).toThrow("Configuration not loaded");
    });

    it("should return the loaded config", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".envhubrc.json"),
        JSON.stringify(validConfig)
      );

      const manager = new ConfigManager();
      await manager.load();

      const config = manager.getConfig();
      expect(config.provider).toBe("aws");
    });
  });

  describe("save", () => {
    it("should persist config changes to disk", async () => {
      const manager = new ConfigManager();
      await manager.create(validConfig, tmpDir);

      const config = manager.getConfig();
      config.secrets["my-secret"] = {
        version: 3,
        file: ".env",
        lastPulled: "2025-01-01T00:00:00.000Z",
      };
      await manager.save(config);

      const raw = JSON.parse(
        await fs.readFile(path.join(tmpDir, ".envhubrc.json"), "utf-8")
      );
      expect(raw.secrets["my-secret"].version).toBe(3);
    });

    it("should throw when there is no config to save", async () => {
      const manager = new ConfigManager();
      await expect(manager.save()).rejects.toThrow("No configuration to save");
    });
  });

  describe("updateSecret", () => {
    it("should create a new secret tracking entry", async () => {
      const manager = new ConfigManager();
      await manager.create(validConfig, tmpDir);

      await manager.updateSecret("app-dev", { version: 1, file: ".env" });

      const config = manager.getConfig();
      expect(config.secrets["app-dev"]).toEqual({
        version: 1,
        file: ".env",
        lastPulled: undefined,
      });
    });

    it("should update an existing secret tracking entry", async () => {
      const manager = new ConfigManager();
      await manager.create(
        { ...validConfig, secrets: { "app-dev": { version: 1, file: ".env" } } },
        tmpDir
      );

      await manager.updateSecret("app-dev", { version: 2 });

      const config = manager.getConfig();
      expect(config.secrets["app-dev"].version).toBe(2);
      expect(config.secrets["app-dev"].file).toBe(".env");
    });

    it("should set lastPulled timestamp", async () => {
      const manager = new ConfigManager();
      await manager.create(validConfig, tmpDir);

      const timestamp = "2025-06-15T12:00:00.000Z";
      await manager.updateSecret("app-dev", {
        version: 1,
        file: ".env",
        lastPulled: timestamp,
      });

      const config = manager.getConfig();
      expect(config.secrets["app-dev"].lastPulled).toBe(timestamp);
    });
  });

  describe("getTrackedVersion", () => {
    it("should return 0 for an untracked secret", async () => {
      const manager = new ConfigManager();
      await manager.create(validConfig, tmpDir);

      expect(manager.getTrackedVersion("unknown-secret")).toBe(0);
    });

    it("should return the tracked version for a known secret", async () => {
      const manager = new ConfigManager();
      await manager.create(
        {
          ...validConfig,
          secrets: { "my-app": { version: 5, file: ".env" } },
        },
        tmpDir
      );

      expect(manager.getTrackedVersion("my-app")).toBe(5);
    });
  });

  describe("exists", () => {
    it("should return true when config exists in the directory", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".envhubrc.json"),
        JSON.stringify(validConfig)
      );
      expect(await ConfigManager.exists(tmpDir)).toBe(true);
    });

    it("should return false when config does not exist", async () => {
      expect(await ConfigManager.exists(tmpDir)).toBe(false);
    });
  });
});
