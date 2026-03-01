import { describe, it, expect } from "vitest";
import {
  validateConfig,
  DEFAULT_CONFIG,
  type EnvhubConfig,
} from "../../src/config/config.schema.js";

describe("validateConfig", () => {
  it("should return no errors for a valid AWS config", () => {
    const config: EnvhubConfig = {
      provider: "aws",
      prefix: "envhub-",
      aws: { profile: "default", region: "eu-central-1" },
      secrets: {},
    };
    const errors = validateConfig(config);
    expect(errors).toHaveLength(0);
  });

  it("should require a provider", () => {
    const errors = validateConfig({ secrets: {} });
    expect(errors).toContain("'provider' is required in configuration.");
  });

  it("should reject an unknown provider", () => {
    const errors = validateConfig({ provider: "firebase" as any, secrets: {} });
    expect(errors.some((e) => e.includes("Unknown provider"))).toBe(true);
  });

  it("should require AWS config when provider is aws", () => {
    const errors = validateConfig({ provider: "aws", secrets: {} });
    expect(
      errors.some((e) => e.includes("AWS configuration ('aws') is required"))
    ).toBe(true);
  });

  it("should require aws.profile", () => {
    const errors = validateConfig({
      provider: "aws",
      aws: { profile: "", region: "eu-central-1" },
      secrets: {},
    });
    expect(errors.some((e) => e.includes("aws.profile"))).toBe(true);
  });

  it("should require aws.region", () => {
    const errors = validateConfig({
      provider: "aws",
      aws: { profile: "default", region: "" },
      secrets: {},
    });
    expect(errors.some((e) => e.includes("aws.region"))).toBe(true);
  });

  it("should not require AWS config for non-aws providers", () => {
    const errors = validateConfig({ provider: "azure", secrets: {} });
    expect(
      errors.some((e) => e.includes("AWS configuration"))
    ).toBe(false);
  });

  it("should require GCP config when provider is gcp", () => {
    const errors = validateConfig({ provider: "gcp", secrets: {} });
    expect(
      errors.some((e) => e.includes("GCP configuration ('gcp') is required"))
    ).toBe(true);
  });

  it("should require gcp.projectId", () => {
    const errors = validateConfig({
      provider: "gcp",
      gcp: { projectId: "" },
      secrets: {},
    });
    expect(errors.some((e) => e.includes("gcp.projectId"))).toBe(true);
  });

  it("should return no errors for a valid GCP config", () => {
    const errors = validateConfig({
      provider: "gcp",
      gcp: { projectId: "envhub-project-123" },
      secrets: {},
    });
    expect(errors).toHaveLength(0);
  });

  it("should accept all valid provider types", () => {
    const awsErrors = validateConfig({
      provider: "aws",
      aws: { profile: "default", region: "eu-central-1" },
      secrets: {},
    });
    expect(awsErrors.some((e) => e.includes("Unknown provider"))).toBe(false);

    const azureErrors = validateConfig({
      provider: "azure",
      azure: { vaultUrl: "https://my-vault.vault.azure.net" },
      secrets: {},
    });
    expect(azureErrors.some((e) => e.includes("Unknown provider"))).toBe(false);

    const gcpErrors = validateConfig({
      provider: "gcp",
      gcp: { projectId: "envhub-project-123" },
      secrets: {},
    });
    expect(gcpErrors.some((e) => e.includes("Unknown provider"))).toBe(false);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("should have a default prefix of 'envhub-'", () => {
    expect(DEFAULT_CONFIG.prefix).toBe("envhub-");
  });

  it("should have an empty secrets object", () => {
    expect(DEFAULT_CONFIG.secrets).toEqual({});
  });
});
