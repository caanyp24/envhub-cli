import * as path from "node:path";
import chalk from "chalk";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { VersionControl } from "../versioning/version-control.js";
import {
  readEnvFileRaw,
  writeEnvFileRaw,
  fileExists,
  parseEnvContent,
} from "../utils/env-parser.js";
import {
  addEnvhubHeader,
  getEnvhubHeaderEnvironment,
  stripEnvhubHeader,
} from "../utils/envhub-header.js";
import { diffEnvContents } from "../utils/diff.js";
import { logger } from "../utils/logger.js";
import { renderPushPreview } from "../utils/push-preview-ui.js";

interface PushCommandOptions {
  message?: string;
  force?: boolean;
}

function isSecretNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const err = error as Error & {
    code?: string | number;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };

  const code = String(err.code ?? "").toLowerCase();
  const message = err.message.toLowerCase();
  const status =
    err.statusCode ?? err.status ?? err.response?.status;

  if (status === 404) {
    return true;
  }

  // GCP gRPC NOT_FOUND
  if (code === "5") {
    return true;
  }

  // Common provider-specific not-found identifiers/messages
  const notFoundTokens = [
    "not found",
    "resourcenotfoundexception",
    "secretnotfound",
    "secretnotfound",
  ];

  return (
    notFoundTokens.some((token) => code.includes(token)) ||
    notFoundTokens.some((token) => message.includes(token))
  );
}

async function confirmOrCancel(
  message: string,
  defaultValue: boolean
): Promise<boolean | "cancelled"> {
  const result = await logger.promptConfirm({
    message,
    default: defaultValue,
    cancelMessage: "Push cancelled.",
  });
  if (result === "cancelled") {
    logger.info("Push cancelled.");
    return "cancelled";
  }
  return result;
}

function formatVersionConflictMessage(
  localVersion: number,
  remoteVersion: number
): string {
  return (
    `Remote version (${remoteVersion}) is newer than your local version (${localVersion}).\n` +
    "Run 'envhub pull' first to sync changes, or use --force to overwrite."
  );
}

/**
 * Format all entries of a new secret for display.
 */
function formatNewEntries(content: string): string {
  const entries = parseEnvContent(content);
  if (entries.size === 0) {
    return "  (empty file)";
  }

  const lines: string[] = [`  🆕 New secret with ${entries.size} entries:`];
  for (const [key, value] of entries) {
    lines.push(chalk.green(`     + ${key}=${value}`));
  }
  return lines.join("\n");
}

/**
 * The `envhub push` command.
 * Pushes a local .env file to the configured cloud provider.
 */
export async function pushCommand(
  secretName: string,
  filePath: string,
  options: PushCommandOptions
): Promise<void> {
  const resolvedPath = path.resolve(filePath);

  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);
  const versionControl = new VersionControl(configManager, provider);

  // Check if file exists
  if (!(await fileExists(resolvedPath))) {
    logger.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Read the local .env file
  const rawLocalContent = await readEnvFileRaw(resolvedPath);
  const headerEnvironment = getEnvhubHeaderEnvironment(rawLocalContent);
  const localContent = stripEnvhubHeader(rawLocalContent);

  // Detect whether secret already exists remotely
  let isNewSecret = false;
  let remoteContent = "";

  try {
    remoteContent = stripEnvhubHeader(await provider.cat(secretName));
  } catch (error) {
    if (!isSecretNotFoundError(error)) {
      if (error instanceof Error) {
        logger.error(error.message);
      } else {
        logger.error("Failed to read remote secret.");
      }
      process.exit(1);
      return;
    }

    // Secret doesn't exist yet — show all entries as new
    isNewSecret = true;
  }

  // Require envhub header only when updating an existing secret.
  if (!options.force && !headerEnvironment && !isNewSecret) {
    logger.error("Missing envhub header in local file.");
    logger.info(
      `Run 'envhub pull ${secretName} ${filePath}' first to regenerate the header, or use --force to override.`
    );
    process.exit(1);
    return;
  }

  if (!options.force && headerEnvironment !== secretName && !isNewSecret) {
    logger.error(
      `Environment mismatch: file header is '${headerEnvironment}', but you are pushing to '${secretName}'.`
    );
    logger.info(
      `Run 'envhub pull ${secretName} ${filePath}' first, or use --force to override.`
    );
    process.exit(1);
    return;
  }

  // Version check (unless --force)
  if (!options.force) {
    const versionCheck = await versionControl.checkBeforePush(secretName);

    if (!versionCheck.canPush) {
      logger.warn(
        formatVersionConflictMessage(
          versionCheck.localVersion,
          versionCheck.remoteVersion
        )
      );
      logger.info("Push cancelled.");
      process.exit(1);
      return;
    }
  }

  if (!isNewSecret) {
    // Secret exists — compare local vs remote
    const changes = diffEnvContents(remoteContent, localContent);

    if (changes.length === 0 && !options.force) {
      logger.info("No changes detected. Remote is already up to date.");
      return;
    }

    if (changes.length > 0) {
      logger.newline();
      renderPushPreview({
        environment: secretName,
        filePath,
        changes,
        force: options.force,
      });
      logger.newline();

      if (!options.force) {
        const confirmPush = await confirmOrCancel("Push these changes?", true);

        if (confirmPush === "cancelled") {
          return;
        }

        if (!confirmPush) {
          logger.info("Push cancelled.");
          return;
        }
      }
    }
  } else {
    // Secret doesn't exist yet — show all entries as new
    logger.newline();
    logger.log(formatNewEntries(localContent));
    logger.newline();

    if (!options.force) {
      const confirmPush = await confirmOrCancel(
        `Create new secret '${secretName}'?`,
        true
      );

      if (confirmPush === "cancelled") {
        return;
      }

      if (!confirmPush) {
        logger.info("Push cancelled.");
        return;
      }
    }
  }

  // Push to provider
  const spinner = logger.spinner(
    isNewSecret
      ? `Creating '${secretName}' in ${provider.name}...`
      : `Pushing '${secretName}' to ${provider.name}...`
  );

  try {
    const result = await provider.push(secretName, localContent, {
      message: options.message,
      force: options.force,
    });

    // Update local version tracking
    await versionControl.recordPush(secretName, result.version, filePath);

    // Keep local header aligned with the pushed environment name.
    if (headerEnvironment !== secretName) {
      const headerSyncedContent = addEnvhubHeader(secretName, localContent);
      try {
        await writeEnvFileRaw(resolvedPath, headerSyncedContent);
      } catch {
        logger.warn(
          "Push succeeded, but local file header could not be updated."
        );
      }
    }

    spinner.succeed(
      `Pushed '${secretName}' (v${result.version}) to ${provider.name}.`
    );

    if (options.message) {
      logger.dim(`  Message: ${options.message}`);
    }
  } catch (error) {
    spinner.fail(`Failed to push '${secretName}'.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
