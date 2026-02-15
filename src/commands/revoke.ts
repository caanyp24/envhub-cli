import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { logger } from "../utils/logger.js";

/**
 * The `envhub revoke` command.
 * Revokes a user's access to a secret.
 */
export async function revokeCommand(
  secretName: string,
  userIdentifier: string
): Promise<void> {
  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);

  const spinner = logger.spinner(
    `Revoking access to '${secretName}' for '${userIdentifier}'...`
  );

  try {
    await provider.revoke(secretName, userIdentifier);
    spinner.succeed(
      `Revoked '${userIdentifier}' access to '${secretName}'.`
    );
  } catch (error) {
    spinner.fail(`Failed to revoke access.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
