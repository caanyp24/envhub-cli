import chalk from "chalk";
import ora, { type Ora } from "ora";

/**
 * Return a human-readable relative time string.
 */
export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 30)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (d > 0) return `${d} day${d > 1 ? "s" : ""} ago`;
  if (h > 0) return `${h} hour${h > 1 ? "s" : ""} ago`;
  if (m > 0) return `${m} minute${m > 1 ? "s" : ""} ago`;
  return "just now";
}

/**
 * Centralized logger for consistent CLI output formatting.
 */
export const logger = {
  /**
   * Print a success message with a green checkmark.
   */
  success(message: string): void {
    console.log(chalk.green("✔") + " " + message);
  },

  /**
   * Print an error message with a red cross.
   */
  error(message: string): void {
    console.error(chalk.red("✖") + " " + chalk.red(message));
  },

  /**
   * Print a warning message with a yellow exclamation mark.
   */
  warn(message: string): void {
    console.warn(chalk.yellow("⚠") + " " + chalk.yellow(message));
  },

  /**
   * Print an informational message.
   */
  info(message: string): void {
    console.log(chalk.blue("ℹ") + " " + message);
  },

  /**
   * Print a plain message without any prefix.
   */
  log(message: string): void {
    console.log(message);
  },

  /**
   * Print a dimmed/subtle message.
   */
  dim(message: string): void {
    console.log(chalk.dim(message));
  },

  /**
   * Print a dim gray context/metadata line (provider, region, count summaries).
   */
  context(message: string): void {
    console.log(chalk.dim("  " + message));
  },

  /**
   * Print a key-value pair with formatting.
   */
  keyValue(key: string, value: string): void {
    console.log(`  ${chalk.bold(key)}: ${value}`);
  },

  /**
   * Print a blank line.
   */
  newline(): void {
    console.log();
  },

  /**
   * Create and start a spinner for async operations.
   */
  spinner(text: string): Ora {
    return ora({
      text,
      color: "cyan",
    }).start();
  },

  /**
   * Print a table header.
   */
  tableHeader(...columns: { label: string; width: number }[]): void {
    const header = columns
      .map((col) => chalk.bold(col.label.padEnd(col.width)))
      .join("  ");
    console.log(header);
    console.log(chalk.dim("─".repeat(header.length)));
  },

  /**
   * Print a table row.
   */
  tableRow(...cells: { value: string; width: number }[]): void {
    const row = cells.map((cell) => cell.value.padEnd(cell.width)).join("  ");
    console.log(row);
  },
};
