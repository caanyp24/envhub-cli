import chalk from "chalk";
import ora, { type Ora } from "ora";

interface TableRenderOptions {
  indent?: string;
  maxSeparatorWidth?: number;
}

function isTableRenderOptions(value: unknown): value is TableRenderOptions {
  if (!value || typeof value !== "object") return false;
  return "indent" in value || "maxSeparatorWidth" in value;
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
  tableHeader(
    ...args: Array<{ label: string; width: number } | TableRenderOptions>
  ): void {
    const maybeOptions = args[args.length - 1];
    const options = isTableRenderOptions(maybeOptions) ? maybeOptions : {};
    const columns = (isTableRenderOptions(maybeOptions) ? args.slice(0, -1) : args) as {
      label: string;
      width: number;
    }[];

    const indent = options.indent ?? "";
    const plainHeader = columns.map((col) => col.label.padEnd(col.width)).join("  ");
    const header = columns
      .map((col) => chalk.bold(col.label.padEnd(col.width)))
      .join("  ");
    const separatorWidth = Math.min(
      plainHeader.length,
      options.maxSeparatorWidth ?? plainHeader.length
    );

    console.log(indent + header);
    console.log(indent + chalk.dim("─".repeat(separatorWidth)));
  },

  /**
   * Print a table row.
   */
  tableRow(
    ...args: Array<{ value: string; width: number } | TableRenderOptions>
  ): void {
    const maybeOptions = args[args.length - 1];
    const options = isTableRenderOptions(maybeOptions) ? maybeOptions : {};
    const cells = (isTableRenderOptions(maybeOptions) ? args.slice(0, -1) : args) as {
      value: string;
      width: number;
    }[];

    const indent = options.indent ?? "";
    const row = cells.map((cell) => cell.value.padEnd(cell.width)).join("  ");
    console.log(indent + row);
  },
};
