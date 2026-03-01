import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GCPConfig } from "../../../src/config/config.schema.js";

// ── Mock GCP SDK ──────────────────────────────────────────────────

const mockListSecrets = vi.fn();
const mockAccessSecretVersion = vi.fn();
const mockCreateSecret = vi.fn();
const mockAddSecretVersion = vi.fn();
const mockGetSecret = vi.fn();
const mockDeleteSecret = vi.fn();

vi.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: class MockSecretManagerServiceClient {
    listSecrets = mockListSecrets;
    accessSecretVersion = mockAccessSecretVersion;
    createSecret = mockCreateSecret;
    addSecretVersion = mockAddSecretVersion;
    getSecret = mockGetSecret;
    deleteSecret = mockDeleteSecret;
  },
}));

import { GCPSecretManagerProvider } from "../../../src/providers/gcp/gcp-secret-manager.provider.js";

// ── Helpers ───────────────────────────────────────────────────────

const testConfig: GCPConfig = { projectId: "envhub-project-123" };

function makeVersionResult(content: string, version: number, message?: string) {
  return [
    {
      payload: {
        data: Buffer.from(
          JSON.stringify({
            content,
            metadata: {
              version,
              message,
              updatedAt: "2026-01-01T00:00:00.000Z",
              managedBy: "envhub-cli",
            },
          })
        ),
      },
    },
  ];
}

function makeNotFoundError() {
  return { code: 5, details: "not found" };
}

function makeSecretResource(name: string) {
  return `projects/envhub-project-123/secrets/${name}`;
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GCPSecretManagerProvider", () => {
  let provider: GCPSecretManagerProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GCPSecretManagerProvider(testConfig, "envhub-");
  });

  // ── push ───────────────────────────────────────────────────────

  describe("push", () => {
    it("should create a new secret when it does not exist", async () => {
      mockGetSecret.mockRejectedValueOnce(makeNotFoundError());
      mockCreateSecret.mockResolvedValueOnce({});
      mockAddSecretVersion.mockResolvedValueOnce({});

      const result = await provider.push("my-app", "KEY=value");

      expect(result).toEqual({ version: 1, name: "my-app" });
      expect(mockCreateSecret).toHaveBeenCalledTimes(1);
      expect(mockCreateSecret).toHaveBeenCalledWith({
        parent: "projects/envhub-project-123",
        secretId: "envhub-my-app",
        secret: { replication: { automatic: {} } },
      });
    });

    it("should update an existing secret and increment version", async () => {
      mockGetSecret.mockResolvedValueOnce({});
      mockAccessSecretVersion.mockResolvedValueOnce(
        makeVersionResult("OLD=val", 2)
      );
      mockAddSecretVersion.mockResolvedValueOnce({});

      const result = await provider.push("my-app", "NEW=value");

      expect(result.version).toBe(3);
      expect(result.name).toBe("my-app");
      expect(mockCreateSecret).not.toHaveBeenCalled();
    });

    it("should include a message in the metadata when provided", async () => {
      mockGetSecret.mockRejectedValueOnce(makeNotFoundError());
      mockCreateSecret.mockResolvedValueOnce({});
      mockAddSecretVersion.mockResolvedValueOnce({});

      await provider.push("my-app", "KEY=val", { message: "Initial push" });

      const call = mockAddSecretVersion.mock.calls[0][0];
      const payload = JSON.parse(call.payload.data.toString("utf-8"));
      expect(payload.metadata.message).toBe("Initial push");
    });

    it("should reject invalid secret names", async () => {
      await expect(provider.push("my app!", "A=1")).rejects.toThrow(
        "Invalid secret name"
      );
    });

    it("should reject names that are too long", async () => {
      const longName = "a".repeat(260);
      await expect(provider.push(longName, "A=1")).rejects.toThrow(
        "too long"
      );
    });
  });

  // ── pull ───────────────────────────────────────────────────────

  describe("pull", () => {
    it("should return secret content and version", async () => {
      mockAccessSecretVersion.mockResolvedValueOnce(
        makeVersionResult("DB_HOST=localhost\nDB_PORT=5432", 3)
      );

      const result = await provider.pull("my-app");

      expect(result.content).toBe("DB_HOST=localhost\nDB_PORT=5432");
      expect(result.version).toBe(3);
      expect(result.name).toBe("my-app");
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: `${makeSecretResource("envhub-my-app")}/versions/latest`,
      });
    });

    it("should throw when payload is not valid envhub JSON", async () => {
      mockAccessSecretVersion.mockResolvedValueOnce([
        { payload: { data: Buffer.from('{"foo":"bar"}') } },
      ]);

      await expect(provider.pull("my-app")).rejects.toThrow(
        "missing envhub metadata"
      );
    });

    it("should throw when payload is not JSON at all", async () => {
      mockAccessSecretVersion.mockResolvedValueOnce([
        { payload: { data: Buffer.from("not-json") } },
      ]);

      await expect(provider.pull("my-app")).rejects.toThrow(
        "not in envhub format"
      );
    });

    it("should throw when payload data is missing", async () => {
      mockAccessSecretVersion.mockResolvedValueOnce([
        { payload: { data: null } },
      ]);

      await expect(provider.pull("my-app")).rejects.toThrow(
        "no string content"
      );
    });
  });

  // ── cat ────────────────────────────────────────────────────────

  describe("cat", () => {
    it("should return the raw .env content", async () => {
      mockAccessSecretVersion.mockResolvedValueOnce(
        makeVersionResult("API_KEY=secret123", 1)
      );

      const content = await provider.cat("my-app");
      expect(content).toBe("API_KEY=secret123");
    });
  });

  // ── list ───────────────────────────────────────────────────────

  describe("list", () => {
    it("should return only secrets with the envhub prefix", async () => {
      mockListSecrets.mockResolvedValueOnce([
        [
          { name: makeSecretResource("envhub-app-dev") },
          { name: makeSecretResource("envhub-app-prod") },
          { name: makeSecretResource("other-secret") },
        ],
      ]);
      mockAccessSecretVersion
        .mockResolvedValueOnce(makeVersionResult("KEY1=v1\nKEY2=v2", 1, "first push"))
        .mockResolvedValueOnce(makeVersionResult("PROD=v", 2));

      const items = await provider.list();

      expect(items).toHaveLength(2);
      expect(items[0].name).toBe("app-dev");
      expect(items[0].secretsCount).toBe(2);
      expect(items[0].lastMessage).toBe("first push");
      expect(items[1].name).toBe("app-prod");
      expect(items[1].secretsCount).toBe(1);
      expect(items[1].lastMessage).toBeNull();
    });

    it("should return an empty list when no secrets exist", async () => {
      mockListSecrets.mockResolvedValueOnce([[]]);

      const items = await provider.list();
      expect(items).toHaveLength(0);
    });

    it("should still include a secret even if payload parsing fails", async () => {
      mockListSecrets.mockResolvedValueOnce([
        [{ name: makeSecretResource("envhub-my-app") }],
      ]);
      mockAccessSecretVersion.mockResolvedValueOnce([
        { payload: { data: Buffer.from("invalid-json") } },
      ]);

      const items = await provider.list();

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("my-app");
      expect(items[0].secretsCount).toBe(0);
      expect(items[0].lastMessage).toBeNull();
      expect(items[0].updatedAt).toBeNull();
    });

    it("should fetch all secrets in parallel", async () => {
      mockListSecrets.mockResolvedValueOnce([
        [
          { name: makeSecretResource("envhub-a") },
          { name: makeSecretResource("envhub-b") },
          { name: makeSecretResource("envhub-c") },
        ],
      ]);
      mockAccessSecretVersion
        .mockResolvedValue(makeVersionResult("K=v", 1));

      await provider.list();

      expect(mockAccessSecretVersion).toHaveBeenCalledTimes(3);
    });

    it("should return secrets sorted alphabetically", async () => {
      mockListSecrets.mockResolvedValueOnce([
        [
          { name: makeSecretResource("envhub-zebra") },
          { name: makeSecretResource("envhub-alpha") },
        ],
      ]);
      mockAccessSecretVersion
        .mockResolvedValue(makeVersionResult("K=v", 1));

      const items = await provider.list();

      expect(items[0].name).toBe("alpha");
      expect(items[1].name).toBe("zebra");
    });
  });

  // ── delete ─────────────────────────────────────────────────────

  describe("delete", () => {
    it("should delete the secret", async () => {
      mockDeleteSecret.mockResolvedValueOnce({});

      await provider.delete("my-app");

      expect(mockDeleteSecret).toHaveBeenCalledWith({
        name: makeSecretResource("envhub-my-app"),
      });
    });
  });

  // ── grant / revoke ─────────────────────────────────────────────

  describe("grant / revoke", () => {
    it("should throw for grant on GCP", async () => {
      await expect(provider.grant("my-app", "alice")).rejects.toThrow(
        "Grant is not implemented for GCP Secret Manager yet"
      );
    });

    it("should throw for revoke on GCP", async () => {
      await expect(provider.revoke("my-app", "alice")).rejects.toThrow(
        "Revoke is not implemented for GCP Secret Manager yet"
      );
    });
  });

  // ── getVersion ─────────────────────────────────────────────────

  describe("getVersion", () => {
    it("should return the version from the payload", async () => {
      mockAccessSecretVersion.mockResolvedValueOnce(
        makeVersionResult("K=V", 7)
      );

      const version = await provider.getVersion("my-app");
      expect(version).toBe(7);
    });

    it("should return 0 when the secret does not exist", async () => {
      mockAccessSecretVersion.mockRejectedValueOnce(makeNotFoundError());

      const version = await provider.getVersion("nonexistent");
      expect(version).toBe(0);
    });
  });
});
