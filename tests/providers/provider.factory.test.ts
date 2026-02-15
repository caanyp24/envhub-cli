import { describe, it, expect, vi } from "vitest";
import type { EnvhubConfig } from "../../src/config/config.schema.js";

// Mock the AWS provider with a proper class
vi.mock("../../src/providers/aws/aws-secrets.provider.js", () => ({
  AWSSecretsProvider: class MockAWSSecretsProvider {
    name = "aws";
    constructor() {}
  },
}));

import { ProviderFactory } from "../../src/providers/provider.factory.js";

describe("ProviderFactory", () => {
  describe("createProvider", () => {
    it("should create an AWS provider with valid config", () => {
      const config: EnvhubConfig = {
        provider: "aws",
        prefix: "envhub-",
        aws: { profile: "default", region: "eu-central-1" },
        secrets: {},
      };

      const provider = ProviderFactory.createProvider(config);
      expect(provider.name).toBe("aws");
    });

    it("should throw when AWS config is missing", () => {
      const config: EnvhubConfig = {
        provider: "aws",
        prefix: "envhub-",
        secrets: {},
      };

      expect(() => ProviderFactory.createProvider(config)).toThrow(
        "AWS configuration is missing"
      );
    });

    it("should throw for Azure provider (not yet implemented)", () => {
      const config: EnvhubConfig = {
        provider: "azure",
        prefix: "envhub-",
        secrets: {},
      };

      expect(() => ProviderFactory.createProvider(config)).toThrow(
        "Azure Key Vault provider is not yet implemented"
      );
    });

    it("should throw for GCP provider (not yet implemented)", () => {
      const config: EnvhubConfig = {
        provider: "gcp",
        prefix: "envhub-",
        secrets: {},
      };

      expect(() => ProviderFactory.createProvider(config)).toThrow(
        "GCP Secret Manager provider is not yet implemented"
      );
    });
  });

  describe("getAvailableProviders", () => {
    it("should list all providers with their availability status", () => {
      const providers = ProviderFactory.getAvailableProviders();

      expect(providers).toHaveLength(3);

      const aws = providers.find((p) => p.type === "aws");
      expect(aws).toBeDefined();
      expect(aws!.available).toBe(true);
      expect(aws!.label).toBe("AWS Secrets Manager");

      const azure = providers.find((p) => p.type === "azure");
      expect(azure).toBeDefined();
      expect(azure!.available).toBe(false);

      const gcp = providers.find((p) => p.type === "gcp");
      expect(gcp).toBeDefined();
      expect(gcp!.available).toBe(false);
    });
  });
});
