import chalk from "chalk";
import ora, { type Ora } from "ora";

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
