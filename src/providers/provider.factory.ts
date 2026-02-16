import { SecretProvider } from "./provider.interface.js";
import { EnvhubConfig, ProviderType } from "../config/config.schema.js";
import { AWSSecretsProvider } from "./aws/aws-secrets.provider.js";
import { AzureKeyVaultProvider } from "./azure/azure-key-vault.provider.js";

/**
 * Factory for creating provider instances based on configuration.
 *
 * To register a new provider:
 * 1. Create a class implementing SecretProvider
 * 2. Add the instantiation logic in the createProvider method
 */
export class ProviderFactory {
  /**
   * Create a SecretProvider instance based on the current configuration.
   */
  static createProvider(config: EnvhubConfig): SecretProvider {
    const providerType = config.provider;

    switch (providerType) {
      case "aws":
        if (!config.aws) {
          throw new Error("AWS configuration is missing. Run 'envhub init' first.");
        }
        return new AWSSecretsProvider(config.aws, config.prefix);

      case "azure":
        if (!config.azure) {
          throw new Error("Azure configuration is missing. Run 'envhub init' first.");
        }
        return new AzureKeyVaultProvider(config.azure, config.prefix);

      case "gcp":
        throw new Error(
          "GCP Secret Manager provider is not yet implemented. Coming soon!"
        );

      default:
        throw new Error(
          `Unknown provider '${providerType satisfies never}'. Supported: aws, azure, gcp`
        );
    }
  }

  /**
   * Get a list of all available provider types.
   */
  static getAvailableProviders(): { type: ProviderType; label: string; available: boolean }[] {
    return [
      { type: "aws", label: "AWS Secrets Manager", available: true },
      { type: "azure", label: "Azure Key Vault", available: true },
      { type: "gcp", label: "GCP Secret Manager", available: false },
    ];
  }
}
