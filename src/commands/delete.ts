import { confirm } from "@inquirer/prompts";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { logger } from "../utils/logger.js";

interface DeleteCommandOptions {
  force?: boolean;
}

/**
 * The `envhub delete` command.
 * Deletes a secret from the cloud provider.
 */
export async function deleteCommand(
  secretName: string,
  options: DeleteCommandOptions
): Promise<void> {
  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);

  // Confirm deletion
  if (!options.force) {
    const confirmed = await confirm({
      message: `Are you sure you want to delete '${secretName}'? This action cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      logger.info("Deletion cancelled.");
      return;
    }
  }

  const spinner = logger.spinner(`Deleting '${secretName}'...`);

  try {
    await provider.delete(secretName, { force: options.force });

    // Remove from local tracking
    const cfg = configManager.getConfig();
    if (cfg.secrets[secretName]) {
      delete cfg.secrets[secretName];
      await configManager.save(cfg);
    }

    spinner.succeed(`Deleted '${secretName}'.`);

    if (!options.force) {
      logger.dim(
        "  Note: The secret is scheduled for deletion. Use --force for immediate deletion."
      );
    }
  } catch (error) {
    spinner.fail(`Failed to delete '${secretName}'.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
