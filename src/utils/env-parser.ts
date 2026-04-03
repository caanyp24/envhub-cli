import * as fs from "node:fs/promises";

/**
 * A single key-value pair from an .env file.
 */
export interface EnvEntry {
  key: string;
  value: string;
  /** Original line (preserving comments, quotes, etc.) */
  raw: string;
}

/**
 * Parsed representation of an .env file.
 */
export interface ParsedEnv {
  /** Key-value entries */
  entries: EnvEntry[];
  /** Lines that are comments or blank (preserved for round-tripping) */
  lines: string[];
}

export interface SerializeEnvOptions {
  /** Quote all values, even plain ones. */
  quoteAllValues?: boolean;
}

/**
 * Parse .env file content into structured entries.
 * Handles comments, blank lines, quoted values, and multi-line values.
 */
export function parseEnvContent(content: string): Map<string, string> {
  const result = new Map<string, string>();

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Find the first = sign
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      result.set(key, value);
    }
  }

  return result;
}

/**
 * Serialize a Map of key-value pairs back to .env format.
 */
export function serializeEnv(
  entries: Map<string, string>,
  options: SerializeEnvOptions = {}
): string {
  const lines: string[] = [];
  const quoteAllValues = options.quoteAllValues ?? false;

  for (const [key, value] of entries) {
    // Quote values that contain spaces, #, or special characters,
    // or when quoteAllValues is requested.
    const needsQuoting = quoteAllValues || /[\s#"'\\]/.test(value) || value === "";
    const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const formattedValue = needsQuoting ? `"${escapedValue}"` : value;
    lines.push(`${key}=${formattedValue}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Quote all env values in raw content while preserving comments and blank lines.
 */
export function quoteAllEnvValues(content: string): string {
  const lines = content.split("\n");

  const quotedLines = lines.map((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return line;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      return line;
    }

    const key = line.slice(0, eqIndex).trim();
    if (!key) {
      return line;
    }

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `${key}="${escapedValue}"`;
  });

  return quotedLines.join("\n");
}

/**
 * Read and parse an .env file from disk.
 */
export async function readEnvFile(filePath: string): Promise<Map<string, string>> {
  const content = await fs.readFile(filePath, "utf-8");
  return parseEnvContent(content);
}

/**
 * Read the raw content of an .env file.
 */
export async function readEnvFileRaw(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/**
 * Write an .env file to disk.
 */
export async function writeEnvFile(
  filePath: string,
  entries: Map<string, string>
): Promise<void> {
  const content = serializeEnv(entries);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Write raw content to an .env file.
 */
export async function writeEnvFileRaw(
  filePath: string,
  content: string
): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
