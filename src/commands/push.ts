import * as path from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { VersionControl } from "../versioning/version-control.js";
import { readEnvFileRaw, fileExists, parseEnvContent } from "../utils/env-parser.js";
import { getEnvhubHeaderEnvironment, stripEnvhubHeader } from "../utils/envhub-header.js";
import { diffEnvContents } from "../utils/diff.js";
import type { EnvChange } from "../utils/diff.js";
import { logger } from "../utils/logger.js";

interface PushCommandOptions {
  message?: string;
  force?: boolean;
}

function truncateCell(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

function formatPushChangesBoxes(changes: EnvChange[]): string {
  if (changes.length === 0) {
    return "  No changes detected.";
  }

  const renderGroup = (
    title: string,
    group: EnvChange[],
    colorize: (text: string) => string,
  ): string[] => {
    if (group.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push(colorize(`  ┌─ ${title} (${group.length})`));
    lines.push(colorize("  │"));

    for (const change of group) {
      const localValue = truncateCell(change.newValue ?? "", 84);
      const remoteValue = truncateCell(change.oldValue ?? "", 84);

      lines.push(colorize(`  │ ${change.key}`));

      if (change.type === "added") {
        lines.push(colorize(`  │   local : ${localValue}`));
      } else if (change.type === "removed") {
        lines.push(colorize(`  │   remote: ${remoteValue}`));
      } else {
        lines.push(colorize(`  │   local : ${localValue}`));
        lines.push(colorize(`  │   remote: ${remoteValue}`));
      }

      lines.push(colorize("  │"));
    }

    lines.push(colorize("  └──"));
    return lines;
  };

  const added = changes.filter((c) => c.type === "added");
  const changed = changes.filter((c) => c.type === "changed");
  const removed = changes.filter((c) => c.type === "removed");

  return [
    ...renderGroup("ADDED", added, chalk.green),
    ...renderGroup("CHANGED", changed, chalk.yellow),
    ...renderGroup("REMOVED", removed, chalk.red),
  ].join("\n");
}

function formatPushPreviewBox(environment: string, filePath: string): string {
  return [
    chalk.bold("  ┌─ Push Preview"),
    `  │ ${chalk.bold("Environment:")} ${chalk.bold(environment)}`,
    `  │ ${chalk.bold("File:")} ${chalk.bold(filePath)}`,
    "  └────",
  ].join("\n");
}

function summarizePushChanges(changes: EnvChange[]): {
  added: number;
  changed: number;
  removed: number;
} {
  return {
    added: changes.filter((c) => c.type === "added").length,
    changed: changes.filter((c) => c.type === "changed").length,
    removed: changes.filter((c) => c.type === "removed").length,
  };
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

  if (!options.force && !headerEnvironment) {
    logger.error("Missing envhub header in local file.");
    logger.info(
      `Run 'envhub pull ${secretName} ${filePath}' first to regenerate the header, or use --force to override.`
    );
    process.exit(1);
    return;
  }

  if (!options.force && headerEnvironment !== secretName) {
    logger.error(
      `Environment mismatch: file header is '${headerEnvironment}', but you are pushing to '${secretName}'.`
    );
    logger.info(
      `Run 'envhub pull ${secretName} ${filePath}' first, or use --force to override.`
    );
    process.exit(1);
    return;
  }

  const localContent = stripEnvhubHeader(rawLocalContent);

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
    const remoteContent = stripEnvhubHeader(await provider.cat(secretName));

    // Secret exists — compare local vs remote
    const changes = diffEnvContents(remoteContent, localContent);

    if (changes.length === 0 && !options.force) {
      logger.info("No changes detected. Remote is already up to date.");
      return;
    }

    if (changes.length > 0) {
      logger.newline();
      logger.log(formatPushPreviewBox(secretName, filePath));
      logger.newline();
      logger.log(chalk.bold("  Changes to push"));
      logger.log(chalk.dim("  local = value from your .env, remote = current cloud value"));
      logger.newline();
      logger.log(formatPushChangesBoxes(changes));
      const summary = summarizePushChanges(changes);
      logger.newline();
      logger.log(chalk.bold("  Summary"));
      logger.log(
        `    ${chalk.green(`${summary.added} added`)}, ` +
        `${chalk.yellow(`${summary.changed} changed`)}, ` +
        `${chalk.red(`${summary.removed} removed`)}`
      );
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
