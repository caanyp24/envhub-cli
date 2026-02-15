import { ConfigManager } from "../config/config.js";
import type { SecretProvider } from "../providers/provider.interface.js";

/**
 * Result of a version check before a push operation.
 */
export interface VersionCheckResult {
  /** Whether it's safe to push */
  canPush: boolean;
  /** The current local version */
  localVersion: number;
  /** The current remote version */
  remoteVersion: number;
  /** Human-readable reason if push is not safe */
  reason?: string;
}

/**
 * Manages version tracking and conflict detection for secrets.
 *
 * Workflow:
 * - Before push: check if local version matches remote (conflict detection)
 * - After push: update local version in .envhubrc.json
 * - After pull: update local version in .envhubrc.json
 */
export class VersionControl {
  constructor(
    private configManager: ConfigManager,
    private provider: SecretProvider
  ) {}

  /**
   * Check if a push is safe by comparing local and remote versions.
   *
   * Returns a conflict if the remote version is ahead of the local version,
   * meaning someone else has pushed a newer version.
   */
  async checkBeforePush(secretName: string): Promise<VersionCheckResult> {
    const localVersion = this.configManager.getTrackedVersion(secretName);
    let remoteVersion: number;

    try {
      remoteVersion = await this.provider.getVersion(secretName);
    } catch {
      // Secret doesn't exist yet, safe to push
      return {
        canPush: true,
        localVersion,
        remoteVersion: 0,
      };
    }

    // If remote version is 0, the secret doesn't exist yet
    if (remoteVersion === 0) {
      return {
        canPush: true,
        localVersion,
        remoteVersion: 0,
      };
    }

    // If local version matches remote, safe to push
    if (localVersion >= remoteVersion) {
      return {
        canPush: true,
        localVersion,
        remoteVersion,
      };
    }

    // Remote is ahead – conflict detected
    return {
      canPush: false,
      localVersion,
      remoteVersion,
      reason:
        `Remote version (${remoteVersion}) is newer than your local version (${localVersion}). ` +
        `Run 'envhub pull' first to get the latest changes, or use --force to overwrite.`,
    };
  }

  /**
   * Update the local version tracking after a successful push.
   */
  async recordPush(secretName: string, newVersion: number, file: string): Promise<void> {
    await this.configManager.updateSecret(secretName, {
      version: newVersion,
      file,
    });
  }

  /**
   * Update the local version tracking after a successful pull.
   */
  async recordPull(secretName: string, version: number, file: string): Promise<void> {
    await this.configManager.updateSecret(secretName, {
      version,
      file,
      lastPulled: new Date().toISOString(),
    });
  }
}
