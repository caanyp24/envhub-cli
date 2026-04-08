import chalk from "chalk";
import {
  confirm as clackConfirm,
  text as clackText,
  select as clackSelect,
  spinner as clackSpinner,
  log as clackLog,
  isCancel,
} from "@clack/prompts";
import type { Option as ClackOption } from "@clack/prompts";

interface TableRenderOptions {
  indent?: string;
  maxSeparatorWidth?: number;
}

interface SpinnerLike {
  start(text?: string): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
  stop(text?: string): SpinnerLike;
  clear?(): SpinnerLike;
}

interface PromptConfirmOptions {
  message: string;
  default?: boolean;
  cancelMessage?: string;
}

interface PromptInputOptions {
  message: string;
  default?: string;
  validate?: (value: string) => true | string;
  cancelMessage?: string;
}

interface PromptSelectChoice<T> {
  value: T;
  name?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

interface PromptSelectOptions<T> {
  message: string;
  choices: PromptSelectChoice<T>[];
  default?: T;
  cancelMessage?: string;
}

function isTableRenderOptions(value: unknown): value is TableRenderOptions {
  if (!value || typeof value !== "object") return false;
  return "indent" in value || "maxSeparatorWidth" in value;
}

function shouldUseClack(): boolean {
  return Boolean(process.stdout.isTTY && process.stderr.isTTY);
}

function shouldUseInteractivePrompts(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY);
}

function printLine(message: string): void {
  if (shouldUseClack()) {
    clackLog.message(message, { spacing: 0 });
    return;
  }
  console.log(message);
}

function mapValidationResult(value: true | string): string | undefined {
  return value === true ? undefined : value;
}

function createPlainSpinner(text: string): SpinnerLike {
  let currentText = text;
  let started = false;

  const wrapped: SpinnerLike = {
    start(nextText?: string): SpinnerLike {
      if (nextText) {
        currentText = nextText;
      }
      if (!started) {
        console.log(`- ${currentText}`);
        started = true;
      }
      return wrapped;
    },
    succeed(nextText?: string): SpinnerLike {
      console.log(`${chalk.green("✔")} ${nextText ?? currentText}`);
      return wrapped;
    },
    fail(nextText?: string): SpinnerLike {
      console.log(`${chalk.red("✖")} ${nextText ?? currentText}`);
      return wrapped;
    },
    stop(nextText?: string): SpinnerLike {
      if (nextText) {
        console.log(nextText);
      }
      return wrapped;
    },
    clear(): SpinnerLike {
      return wrapped;
    },
  };

  wrapped.start(text);
  return wrapped;
}

function createClackSpinner(text: string): SpinnerLike {
  const spinnerInstance = clackSpinner();
  spinnerInstance.start(text);

  const wrapped: SpinnerLike = {
    start(nextText?: string): SpinnerLike {
      spinnerInstance.start(nextText ?? text);
      return wrapped;
    },
    succeed(nextText?: string): SpinnerLike {
      spinnerInstance.stop(nextText ?? text);
      return wrapped;
    },
    fail(nextText?: string): SpinnerLike {
      spinnerInstance.error(nextText ?? text);
      return wrapped;
    },
    stop(nextText?: string): SpinnerLike {
      spinnerInstance.stop(nextText);
      return wrapped;
    },
    clear(): SpinnerLike {
      spinnerInstance.clear();
      return wrapped;
    },
  };

  return wrapped;
}

/**
 * Centralized logger for consistent CLI output formatting.
 */
export const logger = {
  success(message: string): void {
    if (shouldUseClack()) {
      clackLog.success(message, { spacing: 0 });
      return;
    }
    console.log(chalk.green("✔") + " " + message);
  },

  error(message: string): void {
    if (shouldUseClack()) {
      clackLog.error(message, { spacing: 0 });
      return;
    }
    console.error(chalk.red("✖") + " " + chalk.red(message));
  },

  warn(message: string): void {
    if (shouldUseClack()) {
      clackLog.warn(message, { spacing: 0 });
      return;
    }
    console.warn(chalk.yellow("⚠") + " " + chalk.yellow(message));
  },

  info(message: string): void {
    if (shouldUseClack()) {
      clackLog.info(message, { spacing: 0 });
      return;
    }
    console.log(chalk.blue("ℹ") + " " + message);
  },

  log(message: string): void {
    printLine(message);
  },

  dim(message: string): void {
    printLine(chalk.dim(message));
  },

  keyValue(key: string, value: string): void {
    printLine(`  ${chalk.bold(key)}: ${value}`);
  },

  newline(): void {
    if (shouldUseClack()) {
      clackLog.message("", { spacing: 0 });
      return;
    }
    console.log();
  },

  spinner(text: string): SpinnerLike {
    return shouldUseClack() ? createClackSpinner(text) : createPlainSpinner(text);
  },

  async promptConfirm(options: PromptConfirmOptions): Promise<boolean | "cancelled"> {
    if (!shouldUseInteractivePrompts()) {
      return "cancelled";
    }

    const result = await clackConfirm({
      message: options.message,
      initialValue: options.default,
    });

    if (isCancel(result)) {
      return "cancelled";
    }

    return result;
  },

  async promptInput(options: PromptInputOptions): Promise<string | "cancelled"> {
    if (!shouldUseInteractivePrompts()) {
      return "cancelled";
    }

    const validate = options.validate;
    const result = await clackText({
      message: options.message,
      defaultValue: options.default,
      validate: validate
        ? (value) => mapValidationResult(validate(value ?? ""))
        : undefined,
    });

    if (isCancel(result)) {
      return "cancelled";
    }

    return result;
  },

  async promptSelect<T extends string | number | boolean>(
    options: PromptSelectOptions<T>
  ): Promise<T | "cancelled"> {
    if (!shouldUseInteractivePrompts()) {
      return "cancelled";
    }

    const result = await clackSelect<T>({
      message: options.message,
      initialValue: options.default,
      options: options.choices.map((choice) => ({
        value: choice.value,
        label: choice.label ?? choice.name ?? String(choice.value),
        hint: choice.hint,
        disabled: choice.disabled,
      })) as ClackOption<T>[],
    });

    if (isCancel(result)) {
      return "cancelled";
    }

    return result;
  },

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

    printLine(indent + header);
    printLine(indent + chalk.dim("─".repeat(separatorWidth)));
  },

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
    printLine(indent + row);
  },
};

export type { SpinnerLike, PromptSelectChoice };
