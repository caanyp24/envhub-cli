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
  quoteAllEnvValues,
} from "../utils/env-parser.js";
import { addEnvhubHeader, getEnvhubHeaderEnvironment } from "../utils/envhub-header.js";
import { diffEnvContents } from "../utils/diff.js";
import type { EnvChange } from "../utils/diff.js";
import { logger } from "../utils/logger.js";

interface PullCommandOptions {
  dryRun?: boolean;
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
  secretName?: string,
  filePath?: string,
  options: PullCommandOptions = {}
): Promise<void> {
  const displayPath = filePath ?? "./.env";
  const resolvedPath = path.resolve(displayPath);
  let effectiveSecretName = secretName?.trim() ?? "";
  let dryRunLocalContent: string | null = null;

  if (options.dryRun) {
    if (!(await fileExists(resolvedPath))) {
      logger.error(`File not found for dry-run: ${resolvedPath}`);
      process.exit(1);
      return;
    }

    dryRunLocalContent = await readEnvFileRaw(resolvedPath);
    if (!effectiveSecretName) {
      const headerEnvironment = getEnvhubHeaderEnvironment(dryRunLocalContent);
      if (!headerEnvironment) {
        logger.error(
          "Missing envhub header in local file. Cannot infer environment for dry-run."
        );
        logger.info("Run a normal pull once or pass the secret name explicitly.");
        process.exit(1);
        return;
      }
      effectiveSecretName = headerEnvironment;
    }
  } else if (!effectiveSecretName || !filePath) {
    logger.error("Usage: envhub pull <name> <file> (or envhub pull --dry-run)");
    process.exit(1);
    return;
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
    const normalizedContent = quoteAllEnvValues(result.content);
    const wouldWriteContent = addEnvhubHeader(effectiveSecretName, normalizedContent);
    const localVersion = configManager.getTrackedVersion(effectiveSecretName);

    if (options.dryRun) {
      const currentLocalContent = dryRunLocalContent ?? await readEnvFileRaw(resolvedPath);
      const changes = diffEnvContents(currentLocalContent, wouldWriteContent);

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
          `  ${chalk.blue("ℹ")} Dry-run only compares local .env with remote; no changes were applied.`
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
          `  ${chalk.blue("ℹ")} Dry-run only compares local .env with remote; no changes were applied.`
        );
      }
      return;
    }

    // Write the file
    await writeEnvFileRaw(resolvedPath, wouldWriteContent);
    await versionControl.recordPull(effectiveSecretName, result.version, displayPath);

    spinner.succeed(
      `Pulled '${effectiveSecretName}' (v${result.version}) → ${displayPath} (${keyCount} keys)`
    );
  } catch (error) {
    spinner.fail(`Failed to pull '${effectiveSecretName}'.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
