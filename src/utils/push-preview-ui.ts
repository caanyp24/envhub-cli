import { log, note } from "@clack/prompts";
import chalk from "chalk";
import type { EnvChange } from "./diff.js";
import { logger } from "./logger.js";

interface PushPreviewContext {
  environment: string;
  filePath: string;
  changes: EnvChange[];
  force?: boolean;
}

function truncateCell(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

function groupChanges(changes: EnvChange[]): Record<EnvChange["type"], EnvChange[]> {
  return {
    added: changes.filter((change) => change.type === "added"),
    changed: changes.filter((change) => change.type === "changed"),
    removed: changes.filter((change) => change.type === "removed"),
  };
}

function summarize(changes: EnvChange[]): { added: number; changed: number; removed: number } {
  const grouped = groupChanges(changes);
  return {
    added: grouped.added.length,
    changed: grouped.changed.length,
    removed: grouped.removed.length,
  };
}

function renderClack(context: PushPreviewContext): void {
  const { environment, filePath, changes } = context;
  const heading = "Changes to push";

  log.step(heading, { spacing: 0 });
  log.message(`Environment: ${chalk.bold(environment)}\nFile: ${chalk.bold(filePath)}`, {
    spacing: 0,
  });
  log.message("", { spacing: 0 });

  const grouped = groupChanges(changes);
  const groupMeta: Record<
    EnvChange["type"],
    {
      label: string;
      symbol: string;
      headingColor: (text: string) => string;
      keyColor: (text: string) => string;
      valueColor: (text: string) => string;
    }
  > = {
    added: {
      label: "ADDED",
      symbol: "+",
      headingColor: chalk.greenBright,
      keyColor: chalk.greenBright,
      valueColor: chalk.greenBright,
    },
    changed: {
      label: "CHANGED",
      symbol: "~",
      headingColor: chalk.yellowBright,
      keyColor: chalk.yellowBright,
      valueColor: chalk.yellowBright,
    },
    removed: {
      label: "REMOVED",
      symbol: "-",
      headingColor: chalk.redBright,
      keyColor: chalk.redBright,
      valueColor: chalk.redBright,
    },
  };

  (["added", "changed", "removed"] as const).forEach((type) => {
    const group = grouped[type];
    if (group.length === 0) {
      return;
    }

    const meta = groupMeta[type];
    const lines: string[] = [];

    group.forEach((change) => {
      const localValue = truncateCell(change.newValue ?? "-", 84);
      const remoteValue = truncateCell(change.oldValue ?? "-", 84);

      lines.push(`  ${meta.symbol} ${meta.keyColor(change.key)}`);

      if (change.type === "added") {
        lines.push(`    local : ${meta.valueColor(localValue)}`);
      } else if (change.type === "removed") {
        lines.push(`    remote: ${meta.valueColor(remoteValue)}`);
      } else {
        lines.push(`    local : ${meta.valueColor(localValue)}`);
        lines.push(`    remote: ${meta.valueColor(remoteValue)}`);
      }
    });

    note(lines.join("\n"), meta.headingColor(`${meta.label} (${group.length})`), {
      format: (text) => text,
    });
  });

  const summary = summarize(changes);
  log.message(
    `${chalk.green(`${summary.added} added`)}, ${chalk.yellow(`${summary.changed} changed`)}, ${chalk.red(`${summary.removed} removed`)}`
  );
}

function renderPlaintext(context: PushPreviewContext): void {
  const { environment, filePath, changes } = context;
  const heading = "Changes to push";
  logger.log(`  ${heading}`);
  logger.log(`  Environment: ${environment}`);
  logger.log(`  File: ${filePath}`);
  logger.newline();
  logger.newline();

  const grouped = groupChanges(changes);
  const labels: Record<EnvChange["type"], string> = {
    added: "ADDED",
    changed: "CHANGED",
    removed: "REMOVED",
  };

  (["added", "changed", "removed"] as const).forEach((type) => {
    const group = grouped[type];
    if (group.length === 0) {
      return;
    }

    logger.log(`  ${labels[type]} (${group.length})`);
    group.forEach((change) => {
      const localValue = truncateCell(change.newValue ?? "-", 84);
      const remoteValue = truncateCell(change.oldValue ?? "-", 84);
      logger.log(`    ${change.key}`);
      if (change.type === "added") {
        logger.log(`      local : ${localValue}`);
      } else if (change.type === "removed") {
        logger.log(`      remote: ${remoteValue}`);
      } else {
        logger.log(`      local : ${localValue}`);
        logger.log(`      remote: ${remoteValue}`);
      }
    });
    logger.newline();
  });

  const summary = summarize(changes);
  logger.log(
    `  ${summary.added} added, ${summary.changed} changed, ${summary.removed} removed`
  );
}

export function renderPushPreview(context: PushPreviewContext): void {
  const useClack = Boolean(process.stdout.isTTY && process.stderr.isTTY);
  if (useClack) {
    renderClack(context);
    return;
  }
  renderPlaintext(context);
}
