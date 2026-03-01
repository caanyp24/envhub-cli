import chalk from "chalk";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { parseEnvContent } from "../utils/env-parser.js";
import { logger } from "../utils/logger.js";

/**
 * Format .env content into a styled, readable table.
 */
function formatEnvTable(content: string): string {
  const entries = parseEnvContent(content);

  if (entries.size === 0) {
    return chalk.dim("  (empty)");
  }

  // Find the longest key for alignment
  let maxKeyLen = 0;
  for (const key of entries.keys()) {
    if (key.length > maxKeyLen) maxKeyLen = key.length;
  }

  const lines: string[] = [];
  const contentWidth = maxKeyLen + 2 + Math.max(...[...entries.values()].map((v) => v.length), 0);
  const separator = chalk.dim("─".repeat(Math.min(contentWidth, 60)));

  lines.push(separator);

  for (const [key, value] of entries) {
    const paddedKey = key.padEnd(maxKeyLen + 2);
    lines.push(`  ${chalk.bold.cyan(paddedKey)}${value}`);
  }

  lines.push(separator);

  return lines.join("\n");
}

/**
 * The `envhub cat` command.
 * Outputs the contents of a secret without writing to disk.
 */
export async function catCommand(secretName: string): Promise<void> {
  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);

  const spinner = logger.spinner(`Reading '${secretName}'...`);

  try {
    const content = await provider.cat(secretName);
    const entries = parseEnvContent(content);
    spinner.succeed(`${chalk.bold(secretName)} ${chalk.dim(`(${entries.size} keys)`)}`);

    logger.newline();
    logger.log(formatEnvTable(content));
    logger.newline();
  } catch (error) {
    spinner.fail(`Failed to read '${secretName}'.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
