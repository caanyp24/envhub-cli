import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { logger } from "../utils/logger.js";

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

    logger.newline();
    logger.tableHeader(
      { label: "Name", width: 30 },
      { label: "Secrets", width: 10 },
      { label: "Updated", width: 22 },
      { label: "Message", width: 30 }
    );

    for (const secret of secrets) {
      const updatedAt = secret.updatedAt
        ? secret.updatedAt.toLocaleDateString("de-DE", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

      logger.tableRow(
        { value: secret.name, width: 30 },
        { value: String(secret.secretsCount), width: 10 },
        { value: updatedAt, width: 22 },
        { value: secret.lastMessage ?? "—", width: 30 }
      );
    }

    logger.newline();
    logger.dim(`  ${secrets.length} secret(s) found.`);
    logger.newline();
  } catch (error) {
    spinner.fail("Failed to list secrets.");
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
