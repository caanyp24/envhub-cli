import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  UpdateSecretCommand,
  ListSecretsCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetResourcePolicyCommand,
  PutResourcePolicyCommand,
  DeleteResourcePolicyCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-secrets-manager";
import {
  IAMClient,
  GetUserCommand,
} from "@aws-sdk/client-iam";
import { fromIni } from "@aws-sdk/credential-providers";
import type { AWSConfig } from "../../config/config.schema.js";
import type {
  SecretProvider,
  PushOptions,
  PushResult,
  PullResult,
  SecretListItem,
  DeleteOptions,
} from "../provider.interface.js";
import { parseEnvContent } from "../../utils/env-parser.js";

/**
 * Metadata stored alongside the secret content in AWS.
 */
interface SecretMetadata {
  version: number;
  message?: string;
  updatedAt: string;
  managedBy: string;
}

/**
 * The complete payload stored in AWS Secrets Manager.
 */
interface SecretPayload {
  content: string;
  metadata: SecretMetadata;
}

/**
 * AWS Secrets Manager implementation of the SecretProvider interface.
 *
 * Stores .env file contents as JSON payloads in AWS Secrets Manager,
 * prefixed with a configurable namespace (default: "envhub-").
 */
export class AWSSecretsProvider implements SecretProvider {
  readonly name = "aws";
  private client: SecretsManagerClient;
  private iamClient: IAMClient;
  private prefix: string;

  constructor(config: AWSConfig, prefix: string = "envhub-") {
    const credentials = fromIni({ profile: config.profile });

    this.client = new SecretsManagerClient({
      region: config.region,
      credentials,
    });

    this.iamClient = new IAMClient({
      region: config.region,
      credentials,
    });

    this.prefix = prefix;
  }

  /**
   * Get the full secret name with prefix.
   */
  private fullName(secretName: string): string {
    return `${this.prefix}${secretName}`;
  }

  /**
   * Strip the prefix from a full secret name.
   */
  private stripPrefix(fullName: string): string {
    if (fullName.startsWith(this.prefix)) {
      return fullName.substring(this.prefix.length);
    }
    return fullName;
  }

  /**
   * Check if a secret exists.
   */
  private async secretExists(secretName: string): Promise<boolean> {
    try {
      await this.client.send(
        new DescribeSecretCommand({ SecretId: this.fullName(secretName) })
      );
      return true;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Read the current payload from a secret.
   */
  private async getPayload(secretName: string): Promise<SecretPayload> {
    const result = await this.client.send(
      new GetSecretValueCommand({ SecretId: this.fullName(secretName) })
    );

    if (!result.SecretString) {
      throw new Error(`Secret '${secretName}' has no string content.`);
    }

    return JSON.parse(result.SecretString) as SecretPayload;
  }

  // ── Core Operations ──────────────────────────────────────────────

  async push(
    secretName: string,
    content: string,
    options?: PushOptions
  ): Promise<PushResult> {
    const exists = await this.secretExists(secretName);
    let newVersion: number;

    if (exists) {
      // Get current version
      const currentPayload = await this.getPayload(secretName);
      newVersion = currentPayload.metadata.version + 1;

      const payload: SecretPayload = {
        content,
        metadata: {
          version: newVersion,
          message: options?.message,
          updatedAt: new Date().toISOString(),
          managedBy: "envhub-cli",
        },
      };

      await this.client.send(
        new UpdateSecretCommand({
          SecretId: this.fullName(secretName),
          SecretString: JSON.stringify(payload),
        })
      );
    } else {
      // Create new secret
      newVersion = 1;

      const payload: SecretPayload = {
        content,
        metadata: {
          version: newVersion,
          message: options?.message,
          updatedAt: new Date().toISOString(),
          managedBy: "envhub-cli",
        },
      };

      await this.client.send(
        new CreateSecretCommand({
          Name: this.fullName(secretName),
          SecretString: JSON.stringify(payload),
          Description: `Managed by envhub-cli`,
        })
      );
    }

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
    let nextToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListSecretsCommand({
          NextToken: nextToken,
          Filters: [
            {
              Key: "name",
              Values: [this.prefix],
            },
          ],
        })
      );

      if (result.SecretList) {
        for (const secret of result.SecretList) {
          if (!secret.Name?.startsWith(this.prefix)) {
            continue;
          }

          // Try to get the secret content for additional info
          let secretsCount = 0;
          let lastMessage: string | null = null;

          try {
            const payload = await this.getPayload(this.stripPrefix(secret.Name));
            const entries = parseEnvContent(payload.content);
            secretsCount = entries.size;
            lastMessage = payload.metadata.message ?? null;
          } catch {
            // If we can't read the secret, just show basic info
          }

          items.push({
            name: this.stripPrefix(secret.Name),
            secretsCount,
            updatedAt: secret.LastChangedDate ?? null,
            lastMessage,
          });
        }
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return items;
  }

  async delete(secretName: string, options?: DeleteOptions): Promise<void> {
    await this.client.send(
      new DeleteSecretCommand({
        SecretId: this.fullName(secretName),
        ForceDeleteWithoutRecovery: options?.force ?? false,
      })
    );
  }

  // ── Access Control ───────────────────────────────────────────────

  async grant(secretName: string, userIdentifier: string): Promise<void> {
    const userArn = await this.resolveUserArn(userIdentifier);
    const fullSecretName = this.fullName(secretName);

    // Get the secret ARN
    const describeResult = await this.client.send(
      new DescribeSecretCommand({ SecretId: fullSecretName })
    );
    const secretArn = describeResult.ARN;

    if (!secretArn) {
      throw new Error(`Could not determine ARN for secret '${secretName}'.`);
    }

    // Get existing policy or create a new one
    let policy: ResourcePolicy;
    try {
      const policyResult = await this.client.send(
        new GetResourcePolicyCommand({ SecretId: fullSecretName })
      );
      policy = policyResult.ResourcePolicy
        ? (JSON.parse(policyResult.ResourcePolicy) as ResourcePolicy)
        : createEmptyPolicy();
    } catch {
      policy = createEmptyPolicy();
    }

    // Add the user to the policy
    const existingStatement = policy.Statement.find(
      (s) => s.Sid === "EnvhubAccess"
    );

    if (existingStatement) {
      const principals = Array.isArray(existingStatement.Principal.AWS)
        ? existingStatement.Principal.AWS
        : [existingStatement.Principal.AWS];

      if (!principals.includes(userArn)) {
        principals.push(userArn);
      }
      existingStatement.Principal.AWS = principals;
    } else {
      policy.Statement.push({
        Sid: "EnvhubAccess",
        Effect: "Allow",
        Principal: { AWS: [userArn] },
        Action: ["secretsmanager:GetSecretValue"],
        Resource: secretArn,
      });
    }

    await this.client.send(
      new PutResourcePolicyCommand({
        SecretId: fullSecretName,
        ResourcePolicy: JSON.stringify(policy),
      })
    );
  }

  async revoke(secretName: string, userIdentifier: string): Promise<void> {
    const userArn = await this.resolveUserArn(userIdentifier);
    const fullSecretName = this.fullName(secretName);

    // Get existing policy
    let policy: ResourcePolicy;
    try {
      const policyResult = await this.client.send(
        new GetResourcePolicyCommand({ SecretId: fullSecretName })
      );
      if (!policyResult.ResourcePolicy) {
        throw new Error(`No access policy found for secret '${secretName}'.`);
      }
      policy = JSON.parse(policyResult.ResourcePolicy) as ResourcePolicy;
    } catch (error) {
      if (error instanceof Error && error.message.includes("No access policy")) {
        throw error;
      }
      throw new Error(`Failed to retrieve policy for secret '${secretName}'.`);
    }

    // Remove the user from the policy
    const statement = policy.Statement.find((s) => s.Sid === "EnvhubAccess");

    if (!statement) {
      throw new Error(`No envhub access policy found for secret '${secretName}'.`);
    }

    const principals = Array.isArray(statement.Principal.AWS)
      ? statement.Principal.AWS
      : [statement.Principal.AWS];

    const filtered = principals.filter((arn) => arn !== userArn);

    if (filtered.length === principals.length) {
      throw new Error(
        `User '${userIdentifier}' does not have access to secret '${secretName}'.`
      );
    }

    if (filtered.length === 0) {
      // Remove the entire statement
      policy.Statement = policy.Statement.filter((s) => s.Sid !== "EnvhubAccess");
    } else {
      statement.Principal.AWS = filtered;
    }

    if (policy.Statement.length === 0) {
      // No statements left — delete the entire policy
      await this.client.send(
        new DeleteResourcePolicyCommand({ SecretId: fullSecretName })
      );
    } else {
      await this.client.send(
        new PutResourcePolicyCommand({
          SecretId: fullSecretName,
          ResourcePolicy: JSON.stringify(policy),
        })
      );
    }
  }

  // ── Versioning ───────────────────────────────────────────────────

  async getVersion(secretName: string): Promise<number> {
    try {
      const payload = await this.getPayload(secretName);
      return payload.metadata.version;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return 0;
      }
      throw error;
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Resolve a user identifier (username or ARN) to a full ARN.
   */
  private async resolveUserArn(userIdentifier: string): Promise<string> {
    // If it's already an ARN, return it directly
    if (userIdentifier.startsWith("arn:aws:")) {
      return userIdentifier;
    }

    // Otherwise, look up the user by username
    try {
      const result = await this.iamClient.send(
        new GetUserCommand({ UserName: userIdentifier })
      );

      if (!result.User?.Arn) {
        throw new Error(`Could not resolve ARN for user '${userIdentifier}'.`);
      }

      return result.User.Arn;
    } catch {
      throw new Error(
        `Failed to resolve user '${userIdentifier}'. ` +
          `Provide either a valid IAM username or a full ARN.`
      );
    }
  }
}

// ── Resource Policy Types ────────────────────────────────────────────

interface PolicyStatement {
  Sid: string;
  Effect: string;
  Principal: { AWS: string | string[] };
  Action: string[];
  Resource: string;
}

interface ResourcePolicy {
  Version: string;
  Statement: PolicyStatement[];
}

function createEmptyPolicy(): ResourcePolicy {
  return {
    Version: "2012-10-17",
    Statement: [],
  };
}
