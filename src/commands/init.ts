import { select, input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { logger } from "../utils/logger.js";
import { ConfigManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import type { EnvhubConfig, ProviderType } from "../config/config.schema.js";

/**
 * Parsed AWS profile with optional region.
 */
interface AWSProfileInfo {
  name: string;
  region?: string;
}

/**
 * Read available AWS profiles from ~/.aws/credentials and ~/.aws/config.
 * Also extracts the region for each profile from ~/.aws/config.
 */
async function getAWSProfiles(): Promise<AWSProfileInfo[]> {
  const profileNames = new Set<string>();
  const profileRegions = new Map<string, string>();
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";

  // Parse credentials file (only profile names)
  const credentialsPath = path.join(homeDir, ".aws", "credentials");
  try {
    const content = await fs.readFile(credentialsPath, "utf-8");
    const profileRegex = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = profileRegex.exec(content)) !== null) {
      profileNames.add(match[1].trim());
    }
  } catch {
    // File doesn't exist, skip
  }

  // Parse config file (profile names + regions)
  const configPath = path.join(homeDir, ".aws", "config");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const lines = content.split("\n");

    let currentProfile: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match profile header: [profile name] or [default]
      const headerMatch = trimmed.match(/^\[(?:profile\s+)?([^\]]+)\]$/);
      if (headerMatch) {
        currentProfile = headerMatch[1].trim();
        profileNames.add(currentProfile);
        continue;
      }

      // Match region key under current profile
      if (currentProfile) {
        const regionMatch = trimmed.match(/^region\s*=\s*(.+)$/);
        if (regionMatch) {
          profileRegions.set(currentProfile, regionMatch[1].trim());
        }
      }
    }
  } catch {
    // File doesn't exist, skip
  }

  return Array.from(profileNames)
    .sort()
    .map((name) => ({
      name,
      region: profileRegions.get(name),
    }));
}

/**
 * Common AWS regions for the selection prompt.
 */
const AWS_REGIONS = [
  { name: "EU (Frankfurt) - eu-central-1", value: "eu-central-1" },
  { name: "EU (Ireland) - eu-west-1", value: "eu-west-1" },
  { name: "EU (London) - eu-west-2", value: "eu-west-2" },
  { name: "EU (Paris) - eu-west-3", value: "eu-west-3" },
  { name: "EU (Stockholm) - eu-north-1", value: "eu-north-1" },
  { name: "US East (N. Virginia) - us-east-1", value: "us-east-1" },
  { name: "US East (Ohio) - us-east-2", value: "us-east-2" },
  { name: "US West (Oregon) - us-west-2", value: "us-west-2" },
  { name: "Asia Pacific (Tokyo) - ap-northeast-1", value: "ap-northeast-1" },
  { name: "Asia Pacific (Singapore) - ap-southeast-1", value: "ap-southeast-1" },
];

/**
 * Update .gitignore to include .envhubrc.json if not already present.
 */
async function updateGitignore(dir: string): Promise<boolean> {
  const gitignorePath = path.join(dir, ".gitignore");
  const entry = ".envhubrc.json";

  try {
    let content = "";
    try {
      content = await fs.readFile(gitignorePath, "utf-8");
    } catch {
      // .gitignore doesn't exist, we'll create it
    }

    if (content.includes(entry)) {
      return false; // Already in .gitignore
    }

    const newContent = content
      ? content.trimEnd() + "\n\n# envhub config (contains AWS profile info)\n" + entry + "\n"
      : "# envhub config (contains AWS profile info)\n" + entry + "\n";

    await fs.writeFile(gitignorePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * The `envhub init` command.
 * Interactive wizard that creates the project configuration.
 */
export async function initCommand(): Promise<void> {
  logger.log("");
  logger.log(chalk.cyan("  ███████╗███╗   ██╗██╗   ██╗██╗  ██╗██╗   ██╗██████╗ "));
  logger.log(chalk.cyan("  ██╔════╝████╗  ██║██║   ██║██║  ██║██║   ██║██╔══██╗"));
  logger.log(chalk.cyan("  █████╗  ██╔██╗ ██║██║   ██║███████║██║   ██║██████╔╝"));
  logger.log(chalk.cyan("  ██╔══╝  ██║╚██╗██║╚██╗ ██╔╝██╔══██║██║   ██║██╔══██╗"));
  logger.log(chalk.cyan("  ███████╗██║ ╚████║ ╚████╔╝ ██║  ██║╚██████╔╝██████╔╝"));
  logger.log(chalk.cyan("  ╚══════╝╚═╝  ╚═══╝  ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ "));
  logger.log("");
  logger.log(chalk.dim("  Securely share .env files between developers."));
  logger.log("");

  // Check if config already exists
  const exists = await ConfigManager.exists();
  if (exists) {
    const overwrite = await confirm({
      message: "An .envhubrc.json already exists. Overwrite?",
      default: false,
    });

    if (!overwrite) {
      logger.info("Setup cancelled.");
      return;
    }
  }

  // Step 1: Select provider
  const providers = ProviderFactory.getAvailableProviders();

  const provider = await select<ProviderType>({
    message: "Which cloud provider would you like to use?",
    choices: providers.map((p) => ({
      name: p.available ? p.label : `${p.label} (coming soon)`,
      value: p.type,
      disabled: !p.available,
    })),
  });

  // Step 2: Provider-specific configuration
  const config: EnvhubConfig = {
    provider,
    prefix: "envhub-",
    secrets: {},
  };

  if (provider === "aws") {
    // Detect available AWS profiles
    const profiles = await getAWSProfiles();

    let profileName: string;
    let detectedRegion: string | undefined;

    if (profiles.length > 0) {
      profileName = await select({
        message: "Select your AWS profile:",
        choices: [
          ...profiles.map((p) => ({
            name: p.region ? `${p.name} (${p.region})` : p.name,
            value: p.name,
          })),
          { name: "Enter a different profile name...", value: "__custom__" },
        ],
      });

      if (profileName === "__custom__") {
        profileName = await input({
          message: "Enter your AWS profile name:",
          validate: (val) => (val.trim() ? true : "Profile name is required."),
        });
      } else {
        // Get the region from the selected profile
        detectedRegion = profiles.find((p) => p.name === profileName)?.region;
      }
    } else {
      logger.warn("No AWS profiles found in ~/.aws/credentials or ~/.aws/config.");
      logger.dim("  Create one first: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html");
      logger.log("");

      profileName = await input({
        message: "Enter your AWS profile name:",
        validate: (val) => (val.trim() ? true : "Profile name is required."),
      });
    }

    // Select region — use detected region from profile if available
    let finalRegion: string;

    if (detectedRegion) {
      const useDetected = await confirm({
        message: `Use region '${detectedRegion}' from your AWS profile?`,
        default: true,
      });

      if (useDetected) {
        finalRegion = detectedRegion;
      } else {
        finalRegion = await select({
          message: "Select a different AWS region:",
          choices: [
            ...AWS_REGIONS,
            { name: "Enter a custom region...", value: "__custom__" },
          ],
        });

        if (finalRegion === "__custom__") {
          finalRegion = await input({
            message: "Enter the AWS region (e.g. eu-central-1):",
            validate: (val) => (val.trim() ? true : "Region is required."),
          });
        }
      }
    } else {
      finalRegion = await select({
        message: "Select your AWS region:",
        choices: [
          ...AWS_REGIONS,
          { name: "Enter a custom region...", value: "__custom__" },
        ],
        default: "eu-central-1",
      });

      if (finalRegion === "__custom__") {
        finalRegion = await input({
          message: "Enter the AWS region (e.g. eu-central-1):",
          validate: (val) => (val.trim() ? true : "Region is required."),
        });
      }
    }

    config.aws = {
      profile: profileName,
      region: finalRegion,
    };
  }

  // Step 3: Configure prefix
  const customPrefix = await confirm({
    message: `Use default secret prefix "${config.prefix}"?`,
    default: true,
  });

  if (!customPrefix) {
    config.prefix = await input({
      message: "Enter a custom prefix for your secrets:",
      default: "envhub-",
      validate: (val) => (val.trim() ? true : "Prefix is required."),
    });
  }

  // Step 4: Save configuration
  const spinner = logger.spinner("Creating configuration...");

  try {
    const configManager = new ConfigManager();
    const filePath = await configManager.create(config);
    spinner.succeed("Configuration created.");

    // Step 5: Update .gitignore
    const gitignoreUpdated = await updateGitignore(process.cwd());
    if (gitignoreUpdated) {
      logger.success("Added .envhubrc.json to .gitignore");
    }

    logger.newline();
    logger.success("envhub is ready to use!");
    logger.newline();
    logger.dim(`  Config file: ${filePath}`);
    logger.dim(`  Provider:    ${config.provider}`);
    if (config.aws) {
      logger.dim(`  AWS Profile: ${config.aws.profile}`);
      logger.dim(`  AWS Region:  ${config.aws.region}`);
    }
    logger.newline();
    logger.log("  Next steps:");
    logger.log("    Push a secret:  envhub push <name> <file>");
    logger.log("    Pull a secret:  envhub pull <name> <file>");
    logger.log("    List secrets:   envhub list");
    logger.newline();
  } catch (error) {
    spinner.fail("Failed to create configuration.");
    throw error;
  }
}
