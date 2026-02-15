import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AWSConfig } from "../../../src/config/config.schema.js";

// ── Mock AWS SDK ─────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-secrets-manager", () => {
  class ResourceNotFoundException extends Error {
    override name = "ResourceNotFoundException";
  }
  return {
    SecretsManagerClient: class {
      send = mockSend;
    },
    CreateSecretCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    GetSecretValueCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    UpdateSecretCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    ListSecretsCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    DeleteSecretCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    DescribeSecretCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    GetResourcePolicyCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    PutResourcePolicyCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
    DeleteResourcePolicyCommand: class {
      _type = "DeletePolicy";
      input: any;
      constructor(input: any) { this.input = input; }
    },
    ResourceNotFoundException,
  };
});

vi.mock("@aws-sdk/client-iam", () => {
  return {
    IAMClient: class {
      send = mockSend;
    },
    GetUserCommand: class {
      input: any;
      constructor(input: any) { this.input = input; }
    },
  };
});

vi.mock("@aws-sdk/credential-providers", () => ({
  fromIni: () => ({}),
}));

// Import after mocks are set up
import { AWSSecretsProvider } from "../../../src/providers/aws/aws-secrets.provider.js";

// ── Helpers ──────────────────────────────────────────────────────

const testConfig: AWSConfig = {
  profile: "test-profile",
  region: "eu-central-1",
};

function makePayload(content: string, version: number, message?: string) {
  return JSON.stringify({
    content,
    metadata: {
      version,
      message,
      updatedAt: "2025-01-01T00:00:00.000Z",
      managedBy: "envhub-cli",
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("AWSSecretsProvider", () => {
  let provider: AWSSecretsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AWSSecretsProvider(testConfig, "envhub-");
  });

  // ── push ─────────────────────────────────────────────────────

  describe("push", () => {
    it("should create a new secret when it does not exist", async () => {
      const { ResourceNotFoundException } = await import(
        "@aws-sdk/client-secrets-manager"
      );
      mockSend
        .mockRejectedValueOnce(new ResourceNotFoundException("not found"))
        .mockResolvedValueOnce({}); // CreateSecret

      const result = await provider.push("my-app", "KEY=value");

      expect(result.version).toBe(1);
      expect(result.name).toBe("my-app");
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should update an existing secret and increment version", async () => {
      mockSend
        .mockResolvedValueOnce({}) // DescribeSecret
        .mockResolvedValueOnce({ SecretString: makePayload("OLD=val", 2) }) // GetSecretValue
        .mockResolvedValueOnce({}); // UpdateSecret

      const result = await provider.push("my-app", "NEW=value");

      expect(result.version).toBe(3);
      expect(result.name).toBe("my-app");
    });

    it("should include a message in the metadata when provided", async () => {
      const { ResourceNotFoundException } = await import(
        "@aws-sdk/client-secrets-manager"
      );
      mockSend
        .mockRejectedValueOnce(new ResourceNotFoundException("not found"))
        .mockResolvedValueOnce({});

      const result = await provider.push("my-app", "KEY=val", {
        message: "Initial push",
      });

      expect(result.version).toBe(1);
      // Verify the CreateSecretCommand was called with correct SecretString
      const createCall = mockSend.mock.calls[1][0];
      const payload = JSON.parse(createCall.input.SecretString);
      expect(payload.metadata.message).toBe("Initial push");
    });
  });

  // ── pull ─────────────────────────────────────────────────────

  describe("pull", () => {
    it("should return secret content and version", async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: makePayload("DB_HOST=localhost\nDB_PORT=5432", 3),
      });

      const result = await provider.pull("my-app");

      expect(result.content).toBe("DB_HOST=localhost\nDB_PORT=5432");
      expect(result.version).toBe(3);
      expect(result.name).toBe("my-app");
    });

    it("should throw when secret has no string content", async () => {
      mockSend.mockResolvedValueOnce({ SecretString: undefined });

      await expect(provider.pull("my-app")).rejects.toThrow(
        "no string content"
      );
    });
  });

  // ── cat ──────────────────────────────────────────────────────

  describe("cat", () => {
    it("should return the raw .env content", async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: makePayload("API_KEY=secret123", 1),
      });

      const content = await provider.cat("my-app");
      expect(content).toBe("API_KEY=secret123");
    });
  });

  // ── list ─────────────────────────────────────────────────────

  describe("list", () => {
    it("should return a list of secrets with the correct prefix", async () => {
      mockSend
        .mockResolvedValueOnce({
          SecretList: [
            {
              Name: "envhub-app-dev",
              LastChangedDate: new Date("2025-01-15"),
            },
            {
              Name: "envhub-app-prod",
              LastChangedDate: new Date("2025-02-01"),
            },
            {
              Name: "other-secret",
              LastChangedDate: new Date("2025-01-01"),
            },
          ],
          NextToken: undefined,
        })
        .mockResolvedValueOnce({
          SecretString: makePayload("KEY1=v1\nKEY2=v2", 1, "first push"),
        })
        .mockResolvedValueOnce({
          SecretString: makePayload("PROD_KEY=v", 2),
        });

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
      mockSend.mockResolvedValueOnce({
        SecretList: [],
        NextToken: undefined,
      });

      const items = await provider.list();
      expect(items).toHaveLength(0);
    });

    it("should handle pagination with NextToken", async () => {
      mockSend
        .mockResolvedValueOnce({
          SecretList: [{ Name: "envhub-page1", LastChangedDate: null }],
          NextToken: "token123",
        })
        .mockResolvedValueOnce({
          SecretString: makePayload("K=v", 1),
        })
        .mockResolvedValueOnce({
          SecretList: [{ Name: "envhub-page2", LastChangedDate: null }],
          NextToken: undefined,
        })
        .mockResolvedValueOnce({
          SecretString: makePayload("K2=v2", 2),
        });

      const items = await provider.list();
      expect(items).toHaveLength(2);
      expect(items[0].name).toBe("page1");
      expect(items[1].name).toBe("page2");
    });
  });

  // ── delete ───────────────────────────────────────────────────

  describe("delete", () => {
    it("should delete a secret without force by default", async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.delete("my-app");

      const call = mockSend.mock.calls[0][0];
      expect(call.input.SecretId).toBe("envhub-my-app");
      expect(call.input.ForceDeleteWithoutRecovery).toBe(false);
    });

    it("should force-delete when option is set", async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.delete("my-app", { force: true });

      const call = mockSend.mock.calls[0][0];
      expect(call.input.ForceDeleteWithoutRecovery).toBe(true);
    });
  });

  // ── grant ────────────────────────────────────────────────────

  describe("grant", () => {
    it("should create a new policy when none exists", async () => {
      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({
          ARN: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app-abc123",
        })
        .mockResolvedValueOnce({ ResourcePolicy: null })
        .mockResolvedValueOnce({});

      await provider.grant("my-app", "bob");

      expect(mockSend).toHaveBeenCalledTimes(4);
      const putCall = mockSend.mock.calls[3][0];
      const policy = JSON.parse(putCall.input.ResourcePolicy);
      expect(policy.Statement).toHaveLength(1);
      expect(policy.Statement[0].Principal.AWS).toContain(
        "arn:aws:iam::123456:user/bob"
      );
    });

    it("should add a user to an existing policy", async () => {
      const existingPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "EnvhubAccess",
            Effect: "Allow",
            Principal: { AWS: ["arn:aws:iam::123456:user/alice"] },
            Action: ["secretsmanager:GetSecretValue"],
            Resource: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app-abc123",
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({
          ARN: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app-abc123",
        })
        .mockResolvedValueOnce({
          ResourcePolicy: JSON.stringify(existingPolicy),
        })
        .mockResolvedValueOnce({});

      await provider.grant("my-app", "bob");

      const putCall = mockSend.mock.calls[3][0];
      const policy = JSON.parse(putCall.input.ResourcePolicy);
      expect(policy.Statement[0].Principal.AWS).toHaveLength(2);
      expect(policy.Statement[0].Principal.AWS).toContain(
        "arn:aws:iam::123456:user/alice"
      );
      expect(policy.Statement[0].Principal.AWS).toContain(
        "arn:aws:iam::123456:user/bob"
      );
    });

    it("should not duplicate a user who already has access", async () => {
      const existingPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "EnvhubAccess",
            Effect: "Allow",
            Principal: { AWS: ["arn:aws:iam::123456:user/bob"] },
            Action: ["secretsmanager:GetSecretValue"],
            Resource: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app-abc123",
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({
          ARN: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app-abc123",
        })
        .mockResolvedValueOnce({
          ResourcePolicy: JSON.stringify(existingPolicy),
        })
        .mockResolvedValueOnce({});

      await provider.grant("my-app", "bob");

      const putCall = mockSend.mock.calls[3][0];
      const policy = JSON.parse(putCall.input.ResourcePolicy);
      expect(policy.Statement[0].Principal.AWS).toHaveLength(1);
    });

    it("should accept a full ARN directly without IAM lookup", async () => {
      const arn = "arn:aws:iam::123456:user/charlie";

      mockSend
        .mockResolvedValueOnce({
          ARN: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app-abc123",
        })
        .mockResolvedValueOnce({ ResourcePolicy: null })
        .mockResolvedValueOnce({});

      await provider.grant("my-app", arn);

      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  // ── revoke ───────────────────────────────────────────────────

  describe("revoke", () => {
    it("should remove a user from a multi-user policy", async () => {
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "EnvhubAccess",
            Effect: "Allow",
            Principal: {
              AWS: [
                "arn:aws:iam::123456:user/alice",
                "arn:aws:iam::123456:user/bob",
              ],
            },
            Action: ["secretsmanager:GetSecretValue"],
            Resource: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app",
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({ ResourcePolicy: JSON.stringify(policy) })
        .mockResolvedValueOnce({}); // PutResourcePolicy

      await provider.revoke("my-app", "bob");

      const putCall = mockSend.mock.calls[2][0];
      const updatedPolicy = JSON.parse(putCall.input.ResourcePolicy);
      expect(updatedPolicy.Statement[0].Principal.AWS).toEqual([
        "arn:aws:iam::123456:user/alice",
      ]);
    });

    it("should delete the entire policy when revoking the last user", async () => {
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "EnvhubAccess",
            Effect: "Allow",
            Principal: { AWS: ["arn:aws:iam::123456:user/bob"] },
            Action: ["secretsmanager:GetSecretValue"],
            Resource: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app",
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({ ResourcePolicy: JSON.stringify(policy) })
        .mockResolvedValueOnce({}); // DeleteResourcePolicy

      await provider.revoke("my-app", "bob");

      // The third call should be DeleteResourcePolicyCommand
      const deleteCall = mockSend.mock.calls[2][0];
      expect(deleteCall).toHaveProperty("_type", "DeletePolicy");
    });

    it("should throw when the user does not have access", async () => {
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "EnvhubAccess",
            Effect: "Allow",
            Principal: { AWS: ["arn:aws:iam::123456:user/alice"] },
            Action: ["secretsmanager:GetSecretValue"],
            Resource: "arn:aws:secretsmanager:eu-central-1:123456:secret:envhub-my-app",
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({ ResourcePolicy: JSON.stringify(policy) });

      await expect(provider.revoke("my-app", "bob")).rejects.toThrow(
        "does not have access"
      );
    });

    it("should throw when no policy exists", async () => {
      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({ ResourcePolicy: null });

      await expect(provider.revoke("my-app", "bob")).rejects.toThrow(
        "No access policy found"
      );
    });

    it("should throw when no EnvhubAccess statement exists", async () => {
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "SomeOtherPolicy",
            Effect: "Allow",
            Principal: { AWS: ["arn:aws:iam::123456:user/bob"] },
            Action: ["secretsmanager:GetSecretValue"],
            Resource: "arn",
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          User: { Arn: "arn:aws:iam::123456:user/bob" },
        })
        .mockResolvedValueOnce({ ResourcePolicy: JSON.stringify(policy) });

      await expect(provider.revoke("my-app", "bob")).rejects.toThrow(
        "No envhub access policy found"
      );
    });
  });

  // ── getVersion ───────────────────────────────────────────────

  describe("getVersion", () => {
    it("should return the version from the payload", async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: makePayload("K=V", 7),
      });

      const version = await provider.getVersion("my-app");
      expect(version).toBe(7);
    });

    it("should return 0 when the secret does not exist", async () => {
      const { ResourceNotFoundException } = await import(
        "@aws-sdk/client-secrets-manager"
      );
      mockSend.mockRejectedValueOnce(
        new ResourceNotFoundException("not found")
      );

      const version = await provider.getVersion("nonexistent");
      expect(version).toBe(0);
    });
  });
});
