import * as path from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { VersionControl } from "../versioning/version-control.js";
import { readEnvFileRaw, fileExists, parseEnvContent } from "../utils/env-parser.js";
import { diffEnvContents, formatChanges } from "../utils/diff.js";
import { logger } from "../utils/logger.js";

interface PushCommandOptions {
  message?: string;
  force?: boolean;
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
    const masked = value.length <= 3 ? "***" : value.substring(0, 3) + "***";
    lines.push(chalk.green(`     + ${key}=${masked}`));
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
  const localContent = await readEnvFileRaw(resolvedPath);

  // Version check (unless --force)
  if (!options.force) {
    const versionCheck = await versionControl.checkBeforePush(secretName);

    if (!versionCheck.canPush) {
      logger.warn(versionCheck.reason ?? "Version conflict detected.");
      logger.newline();

      const forcePush = await confirm({
        message: "Do you want to force push anyway?",
        default: false,
      });

      if (!forcePush) {
        logger.info("Push cancelled. Run 'envhub pull' first.");
        return;
      }
    }
  }

  // Show diff: compare local file with remote content
  let isNewSecret = false;

  try {
    const remoteContent = await provider.cat(secretName);

    // Secret exists — compare local vs remote
    const changes = diffEnvContents(remoteContent, localContent);

    if (changes.length === 0 && !options.force) {
      logger.info("No changes detected. Remote is already up to date.");
      return;
    }

    if (changes.length > 0) {
      logger.newline();
      logger.log("Changes to push:");
      logger.log(formatChanges(changes));
      logger.newline();

      if (!options.force) {
        const confirmPush = await confirm({
          message: "Push these changes?",
          default: true,
        });

        if (!confirmPush) {
          logger.info("Push cancelled.");
          return;
        }
      }
    }
  } catch {
    // Secret doesn't exist yet — show all entries as new
    isNewSecret = true;
    logger.newline();
    logger.log(formatNewEntries(localContent));
    logger.newline();

    if (!options.force) {
      const confirmPush = await confirm({
        message: `Create new secret '${secretName}'?`,
        default: true,
      });

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
