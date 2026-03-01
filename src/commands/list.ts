import chalk from "chalk";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { logger, relativeTime } from "../utils/logger.js";

/**
 * The `envhub list` command.
 * Lists all secrets managed by envhub for the current provider.
 */
export async function listCommand(): Promise<void> {
  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);

  const spinner = logger.spinner("Fetching secrets...");

  try {
    const secrets = await provider.list();
    spinner.stop();

    if (secrets.length === 0) {
      logger.info("No secrets found. Push your first secret with 'envhub push <name> <file>'.");
      return;
    }

    const NAME_W = 20;
    const KEYS_W = 10;
    const DATE_W = 16;

    logger.newline();

    for (const secret of secrets) {
      const name = secret.name.padEnd(NAME_W);
      const keysStr = `${secret.secretsCount} keys`.padEnd(KEYS_W);
      const date = secret.updatedAt ? relativeTime(secret.updatedAt).padEnd(DATE_W) : "—".padEnd(DATE_W);
      const msg = secret.lastMessage ?? "—";

      logger.log(
        `  ${chalk.cyan("●")} ${chalk.bold(name)}  ${chalk.dim(keysStr)}  ${chalk.dim(date)}  ${chalk.dim(msg)}`
      );
    }

    // Build provider context string
    let providerContext = config.provider;
    if (config.provider === "aws" && config.aws?.region) {
      providerContext += ` · ${config.aws.region}`;
    } else if (config.provider === "azure" && config.azure?.vaultUrl) {
      providerContext += ` · ${config.azure.vaultUrl}`;
    } else if (config.provider === "gcp" && config.gcp?.projectId) {
      providerContext += ` · ${config.gcp.projectId}`;
    }

    logger.newline();
    logger.dim(`  ${secrets.length} secret${secrets.length !== 1 ? "s" : ""} · ${providerContext}`);
    logger.newline();
  } catch (error) {
    spinner.fail("Failed to list secrets.");
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
