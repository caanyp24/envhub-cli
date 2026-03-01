import chalk from "chalk";
import { parseEnvContent } from "./env-parser.js";

/**
 * Represents a single change between two .env versions.
 */
export interface EnvChange {
  key: string;
  type: "added" | "removed" | "changed";
  oldValue?: string;
  newValue?: string;
}

/**
 * Compare two .env contents and return the differences.
 *
 * @param localContent - The current local .env content
 * @param remoteContent - The remote/new .env content
 * @returns Array of changes detected
 */
export function diffEnvContents(
  localContent: string,
  remoteContent: string
): EnvChange[] {
  const local = parseEnvContent(localContent);
  const remote = parseEnvContent(remoteContent);
  const changes: EnvChange[] = [];

  // Check for added and changed keys
  for (const [key, remoteValue] of remote) {
    const localValue = local.get(key);

    if (localValue === undefined) {
      changes.push({
        key,
        type: "added",
        newValue: remoteValue,
      });
    } else if (localValue !== remoteValue) {
      changes.push({
        key,
        type: "changed",
        oldValue: localValue,
        newValue: remoteValue,
      });
    }
  }

  // Check for removed keys
  for (const [key, localValue] of local) {
    if (!remote.has(key)) {
      changes.push({
        key,
        type: "removed",
        oldValue: localValue,
      });
    }
  }

  return changes;
}

/**
 * Format changes into a human-readable string for terminal display.
 */
export function formatChanges(changes: EnvChange[]): string {
  if (changes.length === 0) {
    return "No changes detected.";
  }

  const added = changes.filter((c) => c.type === "added");
  const changed = changes.filter((c) => c.type === "changed");
  const removed = changes.filter((c) => c.type === "removed");

  // Sort: added first, then changed, then removed
  const sorted = [...added, ...changed, ...removed];

  const maxKeyLen = Math.max(...sorted.map((c) => c.key.length));

  const lines = sorted.map((c) => {
    const paddedKey = c.key.padEnd(maxKeyLen);
    if (c.type === "added") {
      const masked = chalk.dim(maskValue(c.newValue ?? "").padEnd(10));
      return chalk.green(`  + ${paddedKey}  ${masked}`) + chalk.dim("  added");
    }
    if (c.type === "changed") {
      const masked = chalk.dim(maskValue(c.newValue ?? "").padEnd(10));
      return chalk.yellow(`  ~ ${paddedKey}  ${masked}`) + chalk.dim("  changed");
    }
    // removed
    return chalk.red(`  − ${paddedKey}`) + chalk.dim("  " + " ".repeat(10) + "  removed");
  });

  return lines.join("\n");
}

/**
 * Format changes into a compact one-line summary.
 * Example: "3 added, 1 removed, 12 changed"
 */
export function summarizeChanges(changes: EnvChange[]): string {
  if (changes.length === 0) {
    return "no changes";
  }

  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const changed = changes.filter((c) => c.type === "changed").length;

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (changed > 0) parts.push(`${changed} changed`);

  return parts.join(" · ");
}

/**
 * Mask a value for safe display (show first 3 chars, mask the rest).
 */
function maskValue(value: string): string {
  if (value.length <= 3) {
    return "***";
  }
  return value.substring(0, 3) + "***";
}
