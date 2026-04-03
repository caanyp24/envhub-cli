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

export interface FormatChangesOptions {
  /** Whether values should be masked in output. */
  maskValues?: boolean;
  /** Prefix added to each rendered line (for indentation). */
  indent?: string;
  /** Show old and new values for changed keys. */
  showChangedValues?: boolean;
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
export function formatChanges(
  changes: EnvChange[],
  options: FormatChangesOptions = {}
): string {
  if (changes.length === 0) {
    return "No changes detected.";
  }

  const maskValues = options.maskValues ?? true;
  const indent = options.indent ?? "";
  const showChangedValues = options.showChangedValues ?? false;
  const lines: string[] = [];

  const added = changes.filter((c) => c.type === "added");
  const removed = changes.filter((c) => c.type === "removed");
  const changed = changes.filter((c) => c.type === "changed");

  if (added.length > 0) {
    lines.push(`${indent}🟢 Added (${added.length}):`);
    for (const c of added) {
      const value = c.newValue ?? "";
      const renderedValue = maskValues ? maskValue(value) : value;
      lines.push(chalk.green(`${indent}  + ${c.key}=${renderedValue}`));
    }
  }

  if (removed.length > 0) {
    lines.push(`${indent}🔴 Removed (${removed.length}):`);
    for (const c of removed) {
      lines.push(chalk.red(`${indent}  - ${c.key}`));
    }
  }

  if (changed.length > 0) {
    lines.push(`${indent}🟡 Changed (${changed.length}):`);
    for (const c of changed) {
      if (showChangedValues) {
        const oldValue = c.oldValue ?? "";
        const newValue = c.newValue ?? "";
        const renderedOld = maskValues ? maskValue(oldValue) : oldValue;
        const renderedNew = maskValues ? maskValue(newValue) : newValue;
        lines.push(
          chalk.yellow(`${indent}  ~ ${c.key}: ${renderedOld} -> ${renderedNew}`)
        );
      } else {
        lines.push(chalk.yellow(`${indent}  ~ ${c.key}`));
      }
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
