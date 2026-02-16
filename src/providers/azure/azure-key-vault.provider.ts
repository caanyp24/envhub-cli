import { DefaultAzureCredential } from "@azure/identity";
import {
  SecretClient,
  type SecretProperties,
} from "@azure/keyvault-secrets";
import type { AzureConfig } from "../../config/config.schema.js";
import type {
  SecretProvider,
  PushOptions,
  PushResult,
  PullResult,
  SecretListItem,
  DeleteOptions,
} from "../provider.interface.js";
import { parseEnvContent } from "../../utils/env-parser.js";

interface SecretMetadata {
  version: number;
  message?: string;
  updatedAt: string;
  managedBy: string;
}

interface SecretPayload {
  content: string;
  metadata: SecretMetadata;
}

const AZURE_SECRET_NAME_REGEX = /^[0-9a-zA-Z-]+$/;
const MAX_AZURE_SECRET_NAME_LENGTH = 127;

/**
 * Azure Key Vault implementation of the SecretProvider interface.
 */
export class AzureKeyVaultProvider implements SecretProvider {
  readonly name = "azure";
  private client: SecretClient;
  private prefix: string;

  constructor(config: AzureConfig, prefix: string = "envhub-") {
    this.client = new SecretClient(config.vaultUrl, new DefaultAzureCredential());
    this.prefix = prefix;
  }

  private fullName(secretName: string): string {
    const fullName = `${this.prefix}${secretName}`;

    if (fullName.length > MAX_AZURE_SECRET_NAME_LENGTH) {
      throw new Error(
        `Azure Key Vault secret name is too long (${fullName.length}). ` +
          `Maximum length is ${MAX_AZURE_SECRET_NAME_LENGTH}.`
      );
    }

    if (!AZURE_SECRET_NAME_REGEX.test(fullName)) {
      throw new Error(
        `Invalid secret name '${fullName}'. Azure Key Vault allows only letters, numbers, and dashes.`
      );
    }

    return fullName;
  }

  private stripPrefix(fullName: string): string {
    if (fullName.startsWith(this.prefix)) {
      return fullName.substring(this.prefix.length);
    }
    return fullName;
  }

  private isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const maybeError = error as { statusCode?: number; code?: string };
    return (
      maybeError.statusCode === 404 ||
      maybeError.code === "SecretNotFound" ||
      maybeError.code === "NotFound"
    );
  }

  private parsePayload(secretName: string, value: string): SecretPayload {
    let payload: unknown;
    try {
      payload = JSON.parse(value);
    } catch {
      throw new Error(
        `Secret '${secretName}' is not in envhub format. It may have been created outside envhub.`
      );
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !("content" in payload) ||
      !("metadata" in payload)
    ) {
      throw new Error(
        `Secret '${secretName}' is missing envhub metadata. It may have been created outside envhub.`
      );
    }

    const parsed = payload as SecretPayload;
    if (
      typeof parsed.content !== "string" ||
      typeof parsed.metadata?.version !== "number"
    ) {
      throw new Error(
        `Secret '${secretName}' has an invalid envhub payload format.`
      );
    }

    return parsed;
  }

  private async getPayload(secretName: string): Promise<SecretPayload> {
    const result = await this.client.getSecret(this.fullName(secretName));

    if (!result.value) {
      throw new Error(`Secret '${secretName}' has no string content.`);
    }

    return this.parsePayload(secretName, result.value);
  }

  private async secretExists(secretName: string): Promise<boolean> {
    try {
      await this.client.getSecret(this.fullName(secretName));
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async push(
    secretName: string,
    content: string,
    options?: PushOptions
  ): Promise<PushResult> {
    const exists = await this.secretExists(secretName);
    let newVersion = 1;

    if (exists) {
      const currentPayload = await this.getPayload(secretName);
      newVersion = currentPayload.metadata.version + 1;
    }

    const payload: SecretPayload = {
      content,
      metadata: {
        version: newVersion,
        message: options?.message,
        updatedAt: new Date().toISOString(),
        managedBy: "envhub-cli",
      },
    };

    const tags: Record<string, string> = {
      managedBy: "envhub-cli",
      envhubVersion: String(newVersion),
    };
    if (options?.message) {
      tags.envhubMessage = options.message.slice(0, 256);
    }

    await this.client.setSecret(this.fullName(secretName), JSON.stringify(payload), {
      tags,
    });

    return { version: newVersion, name: secretName };
  }

  async pull(secretName: string): Promise<PullResult> {
    const payload = await this.getPayload(secretName);

    return {
      content: payload.content,
      version: payload.metadata.version,
      name: secretName,
    };
  }

  async cat(secretName: string): Promise<string> {
    const payload = await this.getPayload(secretName);
    return payload.content;
  }

  async list(): Promise<SecretListItem[]> {
    const items: SecretListItem[] = [];

    for await (const secret of this.client.listPropertiesOfSecrets()) {
      if (!secret.name.startsWith(this.prefix)) {
        continue;
      }

      items.push(await this.mapListItem(secret));
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async mapListItem(secret: SecretProperties): Promise<SecretListItem> {
    const secretName = this.stripPrefix(secret.name);
    let secretsCount = 0;
    let lastMessage: string | null = null;

    try {
      const payload = await this.getPayload(secretName);
      const entries = parseEnvContent(payload.content);
      secretsCount = entries.size;
      lastMessage = payload.metadata.message ?? null;
    } catch {
      // If we cannot parse the payload, still show the secret in list output.
    }

    return {
      name: secretName,
      secretsCount,
      updatedAt: secret.updatedOn ?? null,
      lastMessage,
    };
  }

  async delete(secretName: string, options?: DeleteOptions): Promise<void> {
    const fullName = this.fullName(secretName);
    const poller = await this.client.beginDeleteSecret(fullName);
    await poller.pollUntilDone();

    if (options?.force) {
      try {
        await this.client.purgeDeletedSecret(fullName);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error.";
        throw new Error(
          `Failed to force-delete '${secretName}'. Azure Key Vault may block purge (for example due to purge protection). ${reason}`
        );
      }
    }
  }

  async grant(secretName: string, userIdentifier: string): Promise<void> {
    void secretName;
    void userIdentifier;
    throw new Error(
      "Grant is not implemented for Azure Key Vault yet. Use Azure RBAC or access policies in Azure."
    );
  }

  async revoke(secretName: string, userIdentifier: string): Promise<void> {
    void secretName;
    void userIdentifier;
    throw new Error(
      "Revoke is not implemented for Azure Key Vault yet. Use Azure RBAC or access policies in Azure."
    );
  }

  async getVersion(secretName: string): Promise<number> {
    try {
      const payload = await this.getPayload(secretName);
      return payload.metadata.version;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return 0;
      }
      throw error;
    }
  }
}
