/**
 * Options for push operations.
 */
export interface PushOptions {
  /** Optional commit-style message describing the change */
  message?: string;
  /** Bypass version conflict checking */
  force?: boolean;
}

/**
 * Result of a push operation.
 */
export interface PushResult {
  /** The new version number after the push */
  version: number;
  /** Name of the secret that was pushed */
  name: string;
}

/**
 * Result of a pull operation.
 */
export interface PullResult {
  /** The raw content of the secret (the .env file content) */
  content: string;
  /** The version number of the pulled secret */
  version: number;
  /** Name of the secret that was pulled */
  name: string;
}

/**
 * Information about a secret in a list response.
 */
export interface SecretListItem {
  /** The secret name (without provider prefix) */
  name: string;
  /** Number of key-value pairs in the secret */
  secretsCount: number;
  /** Last updated timestamp */
  updatedAt: Date | null;
  /** Last push message (if any) */
  lastMessage: string | null;
}

/**
 * Options for delete operations.
 */
export interface DeleteOptions {
  /** Force immediate deletion without scheduling */
  force?: boolean;
}

/**
 * The SecretProvider interface that every backend provider must implement.
 *
 * To add a new provider (e.g. Azure Key Vault, GCP Secret Manager),
 * create a class that implements this interface and register it in
 * the ProviderFactory.
 */
export interface SecretProvider {
  /** Unique identifier for this provider (e.g. "aws", "azure", "gcp") */
  readonly name: string;

  // ── Core Operations ──────────────────────────────────────────────

  /**
   * Push a .env file's content to the cloud provider.
   * Creates the secret if it doesn't exist, updates it otherwise.
   */
  push(secretName: string, content: string, options?: PushOptions): Promise<PushResult>;

  /**
   * Pull the latest version of a secret from the cloud provider.
   */
  pull(secretName: string): Promise<PullResult>;

  /**
   * Read and return the content of a secret without writing to disk.
   */
  cat(secretName: string): Promise<string>;

  /**
   * List all secrets managed by envhub for this provider.
   */
  list(): Promise<SecretListItem[]>;

  /**
   * Delete a secret from the cloud provider.
   */
  delete(secretName: string, options?: DeleteOptions): Promise<void>;

  // ── Access Control ───────────────────────────────────────────────

  /**
   * Grant another user access to a secret.
   * @param userIdentifier - Provider-specific user identifier (e.g. AWS ARN or username)
   */
  grant(secretName: string, userIdentifier: string): Promise<void>;

  /**
   * Revoke a user's access to a secret.
   * @param userIdentifier - Provider-specific user identifier (e.g. AWS ARN or username)
   */
  revoke(secretName: string, userIdentifier: string): Promise<void>;

  // ── Versioning ───────────────────────────────────────────────────

  /**
   * Get the current remote version number of a secret.
   */
  getVersion(secretName: string): Promise<number>;
}
