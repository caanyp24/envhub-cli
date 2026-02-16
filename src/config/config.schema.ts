/**
 * Supported provider types.
 * Extend this union type when adding new providers.
 */
export type ProviderType = "aws" | "azure" | "gcp";

/**
 * AWS-specific configuration.
 */
export interface AWSConfig {
  /** AWS CLI profile name (from ~/.aws/credentials) */
  profile: string;
  /** AWS region (e.g. "eu-central-1") */
  region: string;
}

/**
 * Azure Key Vault-specific configuration.
 */
export interface AzureConfig {
  /** Azure Key Vault URL (e.g. "https://my-vault.vault.azure.net") */
  vaultUrl: string;
}

/**
 * Placeholder for future GCP configuration.
 */
export interface GCPConfig {
  /** GCP project ID */
  projectId: string;
}

/**
 * Tracking information for a single secret.
 */
export interface SecretTracking {
  /** Current local version number */
  version: number;
  /** Path to the local .env file associated with this secret */
  file: string;
  /** Timestamp of the last pull operation */
  lastPulled?: string;
}

/**
 * Root configuration schema for .envhubrc.json
 */
export interface EnvhubConfig {
  /** Which cloud provider to use */
  provider: ProviderType;
  /** Prefix for secret names in the cloud provider (default: "envhub-") */
  prefix: string;
  /** AWS-specific configuration (present when provider === "aws") */
  aws?: AWSConfig;
  /** Azure-specific configuration (present when provider === "azure") */
  azure?: AzureConfig;
  /** GCP-specific configuration (present when provider === "gcp") */
  gcp?: GCPConfig;
  /** Tracked secrets with their local version information */
  secrets: Record<string, SecretTracking>;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Partial<EnvhubConfig> = {
  prefix: "envhub-",
  secrets: {},
};

/**
 * Validates the essential fields of an EnvhubConfig object.
 * Returns an array of error messages (empty if valid).
 */
export function validateConfig(config: Partial<EnvhubConfig>): string[] {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push("'provider' is required in configuration.");
  }

  if (config.provider && !["aws", "azure", "gcp"].includes(config.provider)) {
    errors.push(`Unknown provider '${config.provider}'. Supported: aws, azure, gcp`);
  }

  if (config.provider === "aws" && !config.aws) {
    errors.push("AWS configuration ('aws') is required when provider is 'aws'.");
  }

  if (config.provider === "aws" && config.aws) {
    if (!config.aws.profile) {
      errors.push("'aws.profile' is required.");
    }
    if (!config.aws.region) {
      errors.push("'aws.region' is required.");
    }
  }

  if (config.provider === "azure" && !config.azure) {
    errors.push("Azure configuration ('azure') is required when provider is 'azure'.");
  }

  if (config.provider === "azure" && config.azure) {
    if (!config.azure.vaultUrl) {
      errors.push("'azure.vaultUrl' is required.");
    } else {
      try {
        const vaultUrl = new URL(config.azure.vaultUrl);
        if (vaultUrl.protocol !== "https:") {
          errors.push("'azure.vaultUrl' must use HTTPS.");
        }
      } catch {
        errors.push("'azure.vaultUrl' must be a valid URL.");
      }
    }
  }

  return errors;
}
