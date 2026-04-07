import { log, note } from "@clack/prompts";
import chalk from "chalk";
import type { EnvChange } from "./diff.js";
import { logger } from "./logger.js";

interface DryRunRenderContext {
  environment: string;
  displayPath: string;
  localVersion: number;
  remoteVersion: number;
  changes: EnvChange[];
}

interface RenderedChangeValues {
  localValue: string;
  remoteValue: string;
}

function versionStatusText(localVersion: number, remoteVersion: number): string {
  if (localVersion === remoteVersion) {
    return "equal";
  }

  if (localVersion === 0 && remoteVersion > 0) {
    return "untracked";
  }

  if (localVersion < remoteVersion) {
    return "remote ahead";
  }

  return "local ahead";
}

function colorVersionStatus(localVersion: number, remoteVersion: number): string {
  const status = versionStatusText(localVersion, remoteVersion);
  if (status === "equal") return chalk.green(status);
  if (status === "untracked" || status === "remote ahead") return chalk.yellow(status);
  return chalk.cyan(status);
}

function truncateCell(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

function formatChangeValues(change: EnvChange): RenderedChangeValues {
  const localValue = truncateCell(change.oldValue ?? "-", 84);
  const remoteValue = truncateCell(change.newValue ?? "-", 84);
  return {
    localValue: change.type === "added" ? "-" : localValue,
    remoteValue: change.type === "removed" ? "-" : remoteValue,
  };
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

function renderClack(context: DryRunRenderContext): void {
  const { environment, displayPath, localVersion, remoteVersion, changes } = context;
  const versionText = `local=v${localVersion}, remote=v${remoteVersion} (${colorVersionStatus(localVersion, remoteVersion)})`;

  log.step("Dry Run Pull Preview", { spacing: 0 });
  log.message(`Environment: ${chalk.bold(environment)}\nVersion: ${versionText}`, {
    spacing: 0,
  });

  if (changes.length === 0) {
    log.message("", { spacing: 0 });
    log.info("No changes detected. Local file is already up to date.");
    log.info(`Dry-run only compares ${displayPath} with remote; no changes were applied.`);
    return;
  }

  log.message("", { spacing: 0 });
  log.message(chalk.bold("Changes if pulled:"), { spacing: 0 });
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
      const { localValue, remoteValue } = formatChangeValues(change);

      lines.push(`  ${meta.symbol} ${meta.keyColor(change.key)}`);
      lines.push(`    local : ${meta.valueColor(localValue)}`);
      lines.push(`    remote: ${meta.valueColor(remoteValue)}`);
    });
    note(lines.join("\n"), meta.headingColor(`${meta.label} (${group.length})`), {
      format: (text) => text,
    });
  });

  const summary = summarize(changes);
  log.message(
    `${chalk.green(`${summary.added} added`)}, ${chalk.yellow(`${summary.changed} changed`)}, ${chalk.red(`${summary.removed} removed`)}`
  );
  log.info(`Dry-run only compares ${displayPath} with remote; no changes were applied.`);
}

function renderPlaintext(context: DryRunRenderContext): void {
  const { environment, displayPath, localVersion, remoteVersion, changes } = context;

  logger.log("  Dry Run Pull Preview");
  logger.log(`  Environment: ${environment}`);
  logger.log(
    `  Version: local=v${localVersion}, remote=v${remoteVersion} (${versionStatusText(localVersion, remoteVersion)})`
  );

  if (changes.length === 0) {
    logger.newline();
    logger.log("  No changes detected. Local file is already up to date.");
    logger.log(
      `  Dry-run only compares ${displayPath} with remote; no changes were applied.`
    );
    return;
  }

  logger.log(`  ${chalk.bold("Changes if pulled:")}`);
  logger.newline();
  const grouped = groupChanges(changes);
  const groupLabels: Record<EnvChange["type"], string> = {
    added: "ADDED",
    changed: "CHANGED",
    removed: "REMOVED",
  };

  (["added", "changed", "removed"] as const).forEach((type) => {
    const group = grouped[type];
    if (group.length === 0) {
      return;
    }

    logger.log(`  ${groupLabels[type]} (${group.length})`);
    group.forEach((change) => {
      const { localValue, remoteValue } = formatChangeValues(change);
      logger.log(`    ${change.key}`);
      logger.log(`      local : ${localValue}`);
      logger.log(`      remote: ${remoteValue}`);
    });
  });

  const summary = summarize(changes);
  logger.log(
    `  ${summary.added} added, ${summary.changed} changed, ${summary.removed} removed`
  );
  logger.log(`  Dry-run only compares ${displayPath} with remote; no changes were applied.`);
}

export function renderPullDryRunResult(context: DryRunRenderContext): void {
  const useClack = Boolean(process.stdout.isTTY && process.stderr.isTTY);
  if (useClack) {
    renderClack(context);
    return;
  }

  renderPlaintext(context);
}
