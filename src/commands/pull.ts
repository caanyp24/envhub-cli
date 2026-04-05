import * as path from "node:path";
import chalk from "chalk";
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
import type { EnvChange } from "../utils/diff.js";
import { logger } from "../utils/logger.js";

interface PullCommandOptions {
  dryRun?: boolean;
  backup?: boolean;
}

function formatVersionStatus(localVersion: number, remoteVersion: number): string {
  if (localVersion === remoteVersion) {
    return chalk.green("equal");
  }

  if (localVersion === 0 && remoteVersion > 0) {
    return chalk.yellow("untracked");
  }

  if (localVersion < remoteVersion) {
    return chalk.yellow("remote ahead");
  }

  return chalk.cyan("local ahead");
}

function truncateCell(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

function formatDryRunChangesBoxes(changes: EnvChange[]): string {
  if (changes.length === 0) {
    return "  No changes detected.";
  }

  const groupMeta: Record<EnvChange["type"], { label: string; emoji: string }> = {
    added: { label: "ADDED", emoji: "🟢" },
    changed: { label: "CHANGED", emoji: "🟡" },
    removed: { label: "REMOVED", emoji: "🔴" },
  };

  const renderGroup = (
    type: EnvChange["type"],
    group: EnvChange[],
    colorize: (text: string) => string,
  ): string[] => {
    if (group.length === 0) {
      return [];
    }

    const { label, emoji } = groupMeta[type];
    const lines: string[] = [];
    lines.push(colorize(`  ┌─ ${chalk.bold(`${emoji} ${label} (${group.length})`)}`));
    lines.push(colorize("  │"));

    for (const change of group) {
      const localValue = truncateCell(change.oldValue ?? "-", 84);
      const remoteValue = truncateCell(change.newValue ?? "-", 84);

      lines.push(`${colorize("  │ ")}${change.key}`);
      lines.push(
        `${colorize("  │ ")}  local : ${change.type === "added" ? "-" : localValue}`
      );
      lines.push(
        `${colorize("  │ ")}  remote: ${change.type === "removed" ? "-" : remoteValue}`
      );
      lines.push(colorize("  │"));
    }

    lines.push(colorize("  └──"));
    return lines;
  };

  const added = changes.filter((c) => c.type === "added");
  const changed = changes.filter((c) => c.type === "changed");
  const removed = changes.filter((c) => c.type === "removed");

  const lines: string[] = [
    ...renderGroup("added", added, chalk.greenBright),
    ...renderGroup("changed", changed, chalk.yellowBright),
    ...renderGroup("removed", removed, chalk.redBright),
  ];

  return lines.join("\n");
}

function formatDryRunMetaBox(
  environment: string,
  localVersion: number,
  remoteVersion: number
): string {
  const versionText =
    `local=v${localVersion}, remote=v${remoteVersion} ` +
    `(${formatVersionStatus(localVersion, remoteVersion)})`;
  return [
    chalk.bold("  ┌─ Dry Run Pull Preview"),
    `  │ ${chalk.bold("Environment:")} ${chalk.bold(environment)}`,
    `  │ ${chalk.bold("Version:")} ${chalk.bold(versionText)}`,
    "  └────",
  ].join("\n");
}

function summarizeDryRunChanges(changes: EnvChange[]): {
  added: number;
  removed: number;
  changed: number;
} {
  return {
    added: changes.filter((c) => c.type === "added").length,
    removed: changes.filter((c) => c.type === "removed").length,
    changed: changes.filter((c) => c.type === "changed").length,
  };
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
      logger.log(
        formatDryRunMetaBox(effectiveSecretName, localVersion, result.version)
      );
      logger.newline();
      if (changes.length === 0) {
        logger.log(
          `  ${chalk.blue("ℹ")} No changes detected. Local file is already up to date.`
        );
        logger.log(
          `  ${chalk.blue("ℹ")} Dry-run only compares ${displayPath} with remote; no changes were applied.`
        );
      } else {
        logger.log(chalk.bold("  Changes if pulled"));
        logger.newline();
        logger.log(formatDryRunChangesBoxes(changes));
        const summary = summarizeDryRunChanges(changes);
        logger.newline();
        logger.log(chalk.bold("  Summary"));
        logger.log(
          `    ${chalk.green(`${summary.added} added`)}, ` +
          `${chalk.yellow(`${summary.changed} changed`)}, ` +
          `${chalk.red(`${summary.removed} removed`)}`
        );
        logger.log(
          `  ${chalk.blue("ℹ")} Dry-run only compares ${displayPath} with remote; no changes were applied.`
        );
      }
      return;
    }

    let backupPath: string | undefined;
    if (options.backup) {
      backupPath = `${displayPath}.bak`;
      const resolvedBackupPath = path.resolve(backupPath);
      await writeEnvFileRaw(resolvedBackupPath, localFileContent);
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
