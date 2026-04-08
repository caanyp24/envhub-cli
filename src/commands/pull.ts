import * as path from "node:path";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { VersionControl } from "../versioning/version-control.js";
import {
  writeEnvFileRaw,
  readEnvFileRaw,
  fileExists,
  parseEnvContent,
} from "../utils/env-parser.js";
import { addEnvhubHeader, getEnvhubHeaderEnvironment } from "../utils/envhub-header.js";
import { diffEnvContents } from "../utils/diff.js";
import { logger } from "../utils/logger.js";
import { renderPullDryRunResult } from "../utils/pull-dry-run-ui.js";

interface PullCommandOptions {
  dryRun?: boolean;
  backup?: boolean;
}

/**
 * The `envhub pull` command.
 * Pulls the latest version of a secret and writes it to a local .env file.
 */
export async function pullCommand(
  secretName: string,
  filePath: string,
  options: PullCommandOptions = {}
): Promise<void> {
  const displayPath = filePath;
  const resolvedPath = path.resolve(displayPath);
  const effectiveSecretName = secretName.trim();

  if (!effectiveSecretName) {
    logger.error("Usage: envhub pull <name> <file> [--dry-run] [--backup]");
    process.exit(1);
    return;
  }

  if (options.dryRun && options.backup) {
    logger.error("Options conflict: use either --dry-run or --backup, not both.");
    process.exit(1);
    return;
  }

  if (!(await fileExists(resolvedPath))) {
    const mode = options.dryRun ? "dry-run" : "pull";
    logger.error(`File not found for ${mode}: ${resolvedPath}`);
    process.exit(1);
    return;
  }

  const localFileContent = await readEnvFileRaw(resolvedPath);

  if (options.dryRun) {
    const headerEnvironment = getEnvhubHeaderEnvironment(localFileContent);
    if (!headerEnvironment) {
      logger.error(
        "Missing envhub header in local file. Cannot verify environment safety for dry-run."
      );
      logger.info("Run a normal pull first to regenerate the header.");
      process.exit(1);
      return;
    }
  }

  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);
  const versionControl = new VersionControl(configManager, provider);

  // Pull from provider
  const spinner = logger.spinner(`Pulling '${effectiveSecretName}'...`);

  try {
    const result = await provider.pull(effectiveSecretName);
    const parsedEntries = parseEnvContent(result.content);
    const keyCount = parsedEntries.size;
    const wouldWriteContent = addEnvhubHeader(effectiveSecretName, result.content);
    const localVersion = configManager.getTrackedVersion(effectiveSecretName);

    if (options.dryRun) {
      const changes = diffEnvContents(localFileContent, wouldWriteContent);

      spinner.succeed(
        `Dry-run pull '${effectiveSecretName}' (v${result.version}) → ${displayPath} (${keyCount} keys)`
      );
      logger.newline();
      renderPullDryRunResult({
        environment: effectiveSecretName,
        displayPath,
        localVersion,
        remoteVersion: result.version,
        changes,
      });
      return;
    }

    let backupPath: string | undefined;
    if (options.backup) {
      backupPath = `${displayPath}.bak`;
      const resolvedBackupPath = path.resolve(backupPath);
      try {
        await writeEnvFileRaw(resolvedBackupPath, localFileContent);
      } catch (error) {
        spinner.fail(`Failed to create backup '${backupPath}'.`);
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
        return;
      }
    }

    // Write the file
    await writeEnvFileRaw(resolvedPath, wouldWriteContent);
    await versionControl.recordPull(effectiveSecretName, result.version, displayPath);

    const successMessage =
      `Pulled '${effectiveSecretName}' (v${result.version}) → ${displayPath} (${keyCount} keys)` +
      (backupPath ? ` [backup: ${backupPath}]` : "");
    spinner.succeed(successMessage);
  } catch (error) {
    spinner.fail(`Failed to pull '${effectiveSecretName}'.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
