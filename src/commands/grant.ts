import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { logger } from "../utils/logger.js";

/**
 * The `envhub grant` command.
 * Grants another user access to a secret.
 */
export async function grantCommand(
  secretName: string,
  userIdentifier: string
): Promise<void> {
  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);

  const spinner = logger.spinner(
    `Granting access to '${secretName}' for '${userIdentifier}'...`
  );

  try {
    await provider.grant(secretName, userIdentifier);
    spinner.succeed(
      `Granted '${userIdentifier}' access to '${secretName}'.`
    );
  } catch (error) {
    spinner.fail(`Failed to grant access.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
