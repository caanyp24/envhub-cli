import * as path from "node:path";
import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import { VersionControl } from "../versioning/version-control.js";
import { writeEnvFileRaw, parseEnvContent } from "../utils/env-parser.js";
import { logger } from "../utils/logger.js";

/**
 * The `envhub pull` command.
 * Pulls the latest version of a secret and writes it to a local .env file.
 */
export async function pullCommand(
  secretName: string,
  filePath: string,
): Promise<void> {
  const resolvedPath = path.resolve(filePath);

  // Load config and create provider
  const config = await configManager.load();
  const provider = ProviderFactory.createProvider(config);
  const versionControl = new VersionControl(configManager, provider);

  // Pull from provider
  const spinner = logger.spinner(`Pulling '${secretName}'...`);

  try {
    const result = await provider.pull(secretName);
    const keyCount = parseEnvContent(result.content).size;

    // Write the file
    await writeEnvFileRaw(resolvedPath, result.content);
    await versionControl.recordPull(secretName, result.version, filePath);

    spinner.succeed(
      `Pulled '${secretName}' (v${result.version}) → ${filePath} (${keyCount} keys)`
    );
  } catch (error) {
    spinner.fail(`Failed to pull '${secretName}'.`);
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
