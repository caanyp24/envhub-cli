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

  const lines: string[] = [];

  const added = changes.filter((c) => c.type === "added");
  const removed = changes.filter((c) => c.type === "removed");
  const changed = changes.filter((c) => c.type === "changed");

  if (added.length > 0) {
    lines.push(`  🟢 Added (${added.length}):`);
    for (const c of added) {
      lines.push(chalk.green(`     + ${c.key}=${maskValue(c.newValue ?? "")}`));
    }
  }

  if (removed.length > 0) {
    lines.push(`  🔴 Removed (${removed.length}):`);
    for (const c of removed) {
      lines.push(chalk.red(`     - ${c.key}`));
    }
  }

  if (changed.length > 0) {
    lines.push(`  🟡 Changed (${changed.length}):`);
    for (const c of changed) {
      lines.push(chalk.yellow(`     ~ ${c.key}`));
    }
  }

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

  return parts.join(", ");
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
