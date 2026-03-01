import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import type { GCPConfig } from "../../config/config.schema.js";
import type {
  DeleteOptions,
  PullResult,
  PushOptions,
  PushResult,
  SecretListItem,
  SecretProvider,
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

const GCP_SECRET_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const MAX_GCP_SECRET_ID_LENGTH = 255;

export class GCPSecretManagerProvider implements SecretProvider {
  readonly name = "gcp";
  private client: SecretManagerServiceClient;
  private prefix: string;
  private projectId: string;

  constructor(config: GCPConfig, prefix: string = "envhub-") {
    this.client = new SecretManagerServiceClient();
    this.projectId = config.projectId;
    this.prefix = prefix;
  }

  private get projectPath(): string {
    return `projects/${this.projectId}`;
  }

  private fullName(secretName: string): string {
    const fullName = `${this.prefix}${secretName}`;

    if (fullName.length > MAX_GCP_SECRET_ID_LENGTH) {
      throw new Error(
        `GCP Secret Manager secret id is too long (${fullName.length}). ` +
          `Maximum length is ${MAX_GCP_SECRET_ID_LENGTH}.`
      );
    }

    if (!GCP_SECRET_ID_REGEX.test(fullName)) {
      throw new Error(
        `Invalid secret name '${fullName}'. GCP Secret Manager allows only letters, numbers, dashes, and underscores.`
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

  private secretResource(secretName: string): string {
    return `${this.projectPath}/secrets/${this.fullName(secretName)}`;
  }

  private isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const maybeError = error as { code?: number; details?: string };
    return maybeError.code === 5 || maybeError.details?.includes("not found") === true;
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
      throw new Error(`Secret '${secretName}' has an invalid envhub payload format.`);
    }

    return parsed;
  }

  private async secretExists(secretName: string): Promise<boolean> {
    try {
      await this.client.getSecret({ name: this.secretResource(secretName) });
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async getPayload(secretName: string): Promise<SecretPayload> {
    const [result] = await this.client.accessSecretVersion({
      name: `${this.secretResource(secretName)}/versions/latest`,
    });

    const data = result.payload?.data;
    if (!data) {
      throw new Error(`Secret '${secretName}' has no string content.`);
    }

    return this.parsePayload(secretName, data.toString("utf-8"));
  }

  async push(secretName: string, content: string, options?: PushOptions): Promise<PushResult> {
    const exists = await this.secretExists(secretName);
    let newVersion = 1;

    if (!exists) {
      await this.client.createSecret({
        parent: this.projectPath,
        secretId: this.fullName(secretName),
        secret: {
          replication: { automatic: {} },
        },
      });
    } else {
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

    await this.client.addSecretVersion({
      parent: this.secretResource(secretName),
      payload: {
        data: Buffer.from(JSON.stringify(payload), "utf-8"),
      },
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
    const [secrets] = await this.client.listSecrets({ parent: this.projectPath });

    const relevant = secrets
      .map((s) => s.name?.split("/").pop())
      .filter((fullName): fullName is string => !!fullName && fullName.startsWith(this.prefix))
      .map((fullName) => this.stripPrefix(fullName));

    const items = await Promise.all(
      relevant.map(async (secretName): Promise<SecretListItem> => {
        let secretsCount = 0;
        let lastMessage: string | null = null;
        let updatedAt: Date | null = null;

        try {
          const payload = await this.getPayload(secretName);
          const entries = parseEnvContent(payload.content);
          secretsCount = entries.size;
          lastMessage = payload.metadata.message ?? null;
          updatedAt = new Date(payload.metadata.updatedAt);
        } catch {
          // If we cannot parse the payload, still show the secret in list output.
        }

        return { name: secretName, secretsCount, updatedAt, lastMessage };
      })
    );

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(secretName: string, options?: DeleteOptions): Promise<void> {
    void options;
    await this.client.deleteSecret({ name: this.secretResource(secretName) });
  }

  async grant(secretName: string, userIdentifier: string): Promise<void> {
    void secretName;
    void userIdentifier;
    throw new Error(
      "Grant is not implemented for GCP Secret Manager yet. Use IAM bindings in Google Cloud."
    );
  }

  async revoke(secretName: string, userIdentifier: string): Promise<void> {
    void secretName;
    void userIdentifier;
    throw new Error(
      "Revoke is not implemented for GCP Secret Manager yet. Use IAM bindings in Google Cloud."
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
