import { cosmiconfig } from "cosmiconfig";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  EnvhubConfig,
  DEFAULT_CONFIG,
  validateConfig,
} from "./config.schema.js";

const MODULE_NAME = "envhub";
const CONFIG_FILENAME = ".envhubrc.json";

/**
 * Manages loading, saving, and validating the envhub configuration file.
 */
export class ConfigManager {
  private config: EnvhubConfig | null = null;
  private configPath: string | null = null;

  /**
   * Load the configuration from the nearest .envhubrc.json file.
   * Searches upward from the current working directory.
   */
  async load(): Promise<EnvhubConfig> {
    const explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: [
        CONFIG_FILENAME,
        `.${MODULE_NAME}rc`,
        `.${MODULE_NAME}rc.json`,
      ],
    });

    const result = await explorer.search();

    if (!result || result.isEmpty) {
      throw new Error(
        "No envhub configuration found. Run 'envhub init' to set up your project."
      );
    }

    const config = { ...DEFAULT_CONFIG, ...result.config } as EnvhubConfig;
    const errors = validateConfig(config);

    if (errors.length > 0) {
      throw new Error(
        `Invalid configuration in ${result.filepath}:\n  - ${errors.join("\n  - ")}`
      );
    }

    this.config = config;
    this.configPath = result.filepath;

    return config;
  }

  /**
   * Get the currently loaded configuration.
   * Throws if config hasn't been loaded yet.
   */
  getConfig(): EnvhubConfig {
    if (!this.config) {
      throw new Error(
        "Configuration not loaded. Call load() first or run 'envhub init'."
      );
    }
    return this.config;
  }

  /**
   * Get the path to the configuration file.
   */
  getConfigPath(): string {
    if (!this.configPath) {
      return path.join(process.cwd(), CONFIG_FILENAME);
    }
    return this.configPath;
  }

  /**
   * Save the current configuration to disk.
   */
  async save(config?: EnvhubConfig): Promise<void> {
    const configToSave = config ?? this.config;
    if (!configToSave) {
      throw new Error("No configuration to save.");
    }

    const filePath = this.configPath ?? path.join(process.cwd(), CONFIG_FILENAME);
    await fs.writeFile(filePath, JSON.stringify(configToSave, null, 2) + "\n", "utf-8");

    this.config = configToSave;
    this.configPath = filePath;
  }

  /**
   * Create a fresh configuration file at the given path.
   */
  async create(config: EnvhubConfig, targetDir?: string): Promise<string> {
    const dir = targetDir ?? process.cwd();
    const filePath = path.join(dir, CONFIG_FILENAME);

    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(
        `Invalid configuration:\n  - ${errors.join("\n  - ")}`
      );
    }

    await fs.writeFile(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    this.config = config;
    this.configPath = filePath;

    return filePath;
  }

  /**
   * Update the secret tracking info (e.g. after a push or pull).
   */
  async updateSecret(
    secretName: string,
    data: { version?: number; file?: string; lastPulled?: string }
  ): Promise<void> {
    const config = this.getConfig();

    if (!config.secrets[secretName]) {
      config.secrets[secretName] = {
        version: data.version ?? 0,
        file: data.file ?? "",
        lastPulled: data.lastPulled,
      };
    } else {
      if (data.version !== undefined) {
        config.secrets[secretName].version = data.version;
      }
      if (data.file !== undefined) {
        config.secrets[secretName].file = data.file;
      }
      if (data.lastPulled !== undefined) {
        config.secrets[secretName].lastPulled = data.lastPulled;
      }
    }

    await this.save(config);
  }

  /**
   * Get the tracked version for a specific secret.
   * Returns 0 if the secret hasn't been tracked yet.
   */
  getTrackedVersion(secretName: string): number {
    const config = this.getConfig();
    return config.secrets[secretName]?.version ?? 0;
  }

  /**
   * Check if a configuration file exists in the current directory.
   */
  static async exists(dir?: string): Promise<boolean> {
    const filePath = path.join(dir ?? process.cwd(), CONFIG_FILENAME);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton config manager instance used throughout the application.
 */
export const configManager = new ConfigManager();
