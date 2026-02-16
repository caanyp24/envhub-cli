import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AzureConfig } from "../../../src/config/config.schema.js";

const mockGetSecret = vi.fn();
const mockSetSecret = vi.fn();
const mockBeginDeleteSecret = vi.fn();
const mockPurgeDeletedSecret = vi.fn();
const mockListPropertiesOfSecrets = vi.fn();

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class MockDefaultAzureCredential {},
}));

vi.mock("@azure/keyvault-secrets", () => ({
  SecretClient: class MockSecretClient {
    getSecret = mockGetSecret;
    setSecret = mockSetSecret;
    beginDeleteSecret = mockBeginDeleteSecret;
    purgeDeletedSecret = mockPurgeDeletedSecret;
    listPropertiesOfSecrets = mockListPropertiesOfSecrets;
  },
}));

import { AzureKeyVaultProvider } from "../../../src/providers/azure/azure-key-vault.provider.js";

const testConfig: AzureConfig = {
  vaultUrl: "https://my-vault.vault.azure.net",
};

function makePayload(content: string, version: number, message?: string): string {
  return JSON.stringify({
    content,
    metadata: {
      version,
      message,
      updatedAt: "2026-01-01T00:00:00.000Z",
      managedBy: "envhub-cli",
    },
  });
}

function makeNotFoundError() {
  return { statusCode: 404, code: "SecretNotFound" };
}

function asyncSecretList(secrets: { name: string; updatedOn: Date | null }[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const secret of secrets) {
        yield secret;
      }
    },
  };
}

describe("AzureKeyVaultProvider", () => {
  let provider: AzureKeyVaultProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AzureKeyVaultProvider(testConfig, "envhub-");
  });

  describe("push", () => {
    it("should create a new secret when it does not exist", async () => {
      mockGetSecret.mockRejectedValueOnce(makeNotFoundError());
      mockSetSecret.mockResolvedValueOnce({});

      const result = await provider.push("my-app", "KEY=value");

      expect(result).toEqual({ version: 1, name: "my-app" });
      expect(mockSetSecret).toHaveBeenCalledTimes(1);

      const [name, payload, options] = mockSetSecret.mock.calls[0];
      expect(name).toBe("envhub-my-app");
      expect(JSON.parse(payload).metadata.version).toBe(1);
      expect(options.tags.managedBy).toBe("envhub-cli");
      expect(options.tags.envhubVersion).toBe("1");
    });

    it("should update an existing secret and increment version", async () => {
      mockGetSecret
        .mockResolvedValueOnce({ value: makePayload("OLD=1", 2) })
        .mockResolvedValueOnce({ value: makePayload("OLD=1", 2) });
      mockSetSecret.mockResolvedValueOnce({});

      const result = await provider.push("my-app", "NEW=2");

      expect(result.version).toBe(3);
      expect(result.name).toBe("my-app");
      expect(JSON.parse(mockSetSecret.mock.calls[0][1]).metadata.version).toBe(3);
    });

    it("should include envhubMessage tag when message is provided", async () => {
      mockGetSecret.mockRejectedValueOnce(makeNotFoundError());
      mockSetSecret.mockResolvedValueOnce({});

      await provider.push("my-app", "KEY=value", { message: "Initial setup" });

      const options = mockSetSecret.mock.calls[0][2];
      expect(options.tags.envhubMessage).toBe("Initial setup");
    });

    it("should reject invalid prefixed secret names", async () => {
      await expect(provider.push("my_app", "A=1")).rejects.toThrow(
        "Azure Key Vault allows only letters, numbers, and dashes"
      );
    });
  });

  describe("pull", () => {
    it("should return content and version", async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: makePayload("DB=postgres\nKEY=value", 4),
      });

      const result = await provider.pull("my-app");

      expect(result.content).toBe("DB=postgres\nKEY=value");
      expect(result.version).toBe(4);
      expect(result.name).toBe("my-app");
    });

    it("should throw when payload is not valid envhub JSON", async () => {
      mockGetSecret.mockResolvedValueOnce({ value: "{\"foo\":\"bar\"}" });

      await expect(provider.pull("my-app")).rejects.toThrow(
        "missing envhub metadata"
      );
    });
  });

  describe("cat", () => {
    it("should return raw env content", async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: makePayload("API_KEY=abc123", 1),
      });

      const content = await provider.cat("my-app");
      expect(content).toBe("API_KEY=abc123");
    });
  });

  describe("list", () => {
    it("should list only prefixed secrets and parse metadata", async () => {
      mockListPropertiesOfSecrets.mockReturnValueOnce(
        asyncSecretList([
          { name: "envhub-app-dev", updatedOn: new Date("2026-01-01") },
          { name: "other-secret", updatedOn: new Date("2026-01-01") },
        ])
      );
      mockGetSecret.mockResolvedValueOnce({
        value: makePayload("A=1\nB=2", 3, "update"),
      });

      const items = await provider.list();

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("app-dev");
      expect(items[0].secretsCount).toBe(2);
      expect(items[0].lastMessage).toBe("update");
      expect(items[0].updatedAt).toEqual(new Date("2026-01-01"));
    });

    it("should keep listing even if payload parsing fails", async () => {
      mockListPropertiesOfSecrets.mockReturnValueOnce(
        asyncSecretList([{ name: "envhub-app-dev", updatedOn: null }])
      );
      mockGetSecret.mockResolvedValueOnce({ value: "invalid-json" });

      const items = await provider.list();

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("app-dev");
      expect(items[0].secretsCount).toBe(0);
      expect(items[0].lastMessage).toBeNull();
      expect(items[0].updatedAt).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete without purge by default", async () => {
      const mockPollUntilDone = vi.fn().mockResolvedValue(undefined);
      mockBeginDeleteSecret.mockResolvedValueOnce({ pollUntilDone: mockPollUntilDone });

      await provider.delete("my-app");

      expect(mockBeginDeleteSecret).toHaveBeenCalledWith("envhub-my-app");
      expect(mockPollUntilDone).toHaveBeenCalledTimes(1);
      expect(mockPurgeDeletedSecret).not.toHaveBeenCalled();
    });

    it("should purge when force option is enabled", async () => {
      const mockPollUntilDone = vi.fn().mockResolvedValue(undefined);
      mockBeginDeleteSecret.mockResolvedValueOnce({ pollUntilDone: mockPollUntilDone });
      mockPurgeDeletedSecret.mockResolvedValueOnce(undefined);

      await provider.delete("my-app", { force: true });

      expect(mockPurgeDeletedSecret).toHaveBeenCalledWith("envhub-my-app");
    });
  });

  describe("getVersion", () => {
    it("should return payload version", async () => {
      mockGetSecret.mockResolvedValueOnce({ value: makePayload("A=1", 7) });

      const version = await provider.getVersion("my-app");
      expect(version).toBe(7);
    });

    it("should return 0 for missing secrets", async () => {
      mockGetSecret.mockRejectedValueOnce(makeNotFoundError());

      const version = await provider.getVersion("my-app");
      expect(version).toBe(0);
    });
  });

  describe("grant / revoke", () => {
    it("should throw for grant on Azure", async () => {
      await expect(provider.grant("my-app", "alice")).rejects.toThrow(
        "Grant is not implemented for Azure Key Vault yet"
      );
    });

    it("should throw for revoke on Azure", async () => {
      await expect(provider.revoke("my-app", "alice")).rejects.toThrow(
        "Revoke is not implemented for Azure Key Vault yet"
      );
    });
  });
});
