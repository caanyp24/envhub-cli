import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import type { EnvhubConfig } from "../config/config.schema.js";
import { logger } from "../utils/logger.js";

type DoctorCheckStatus = "pass" | "warn" | "fail";

interface DoctorCheckResult {
  id: "config.load" | "prefix" | "provider.init" | "provider.reachability_and_auth" | "provider.rights";
  title: string;
  status: DoctorCheckStatus;
  message: string;
  details?: string;
}

interface DoctorSummary {
  pass: number;
  warn: number;
  fail: number;
}

interface DoctorReport {
  summary: DoctorSummary;
  checks: DoctorCheckResult[];
}

interface DoctorCommandOptions {
  json?: boolean;
}

function iconForStatus(status: DoctorCheckStatus): string {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function summarizeChecks(checks: DoctorCheckResult[]): DoctorSummary {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
}

function classifyProviderFailure(providerName: string, errorMessage: string): {
  message: string;
  details: string;
} {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes("access denied") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("not authorized") ||
    normalized.includes("rbac")
  ) {
    return {
      message: `${providerName} is reachable, but access is denied.`,
      details:
        "Verify your cloud role/policy has permission to list secrets for this project/account.",
    };
  }

  if (
    normalized.includes("credential") ||
    normalized.includes("token") ||
    normalized.includes("profile") ||
    normalized.includes("az login") ||
    normalized.includes("gcloud auth") ||
    normalized.includes("expired")
  ) {
    return {
      message: `${providerName} credentials are missing or invalid.`,
      details:
        "Re-authenticate with your provider CLI and confirm the configured profile/project/account.",
    };
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("eai_again") ||
    normalized.includes("network") ||
    normalized.includes("dns")
  ) {
    return {
      message: `Could not reach ${providerName}.`,
      details:
        "Check internet connectivity, DNS, firewall/proxy settings, and provider endpoint availability.",
    };
  }

  return {
    message: `Failed to verify ${providerName} connectivity and access.`,
    details: "Check provider credentials, account permissions, and network connectivity.",
  };
}

function renderHumanReport(report: DoctorReport): void {
  logger.newline();
  logger.log("envhub doctor");
  logger.log("─────────────");

  for (const check of report.checks) {
    logger.log(`${iconForStatus(check.status)} ${check.id}: ${check.message}`);
  }

  logger.newline();
  logger.log(
    `Summary: ${report.summary.pass} passed, ${report.summary.warn} warning(s), ${report.summary.fail} failed`
  );

  const failedChecks = report.checks.filter((check) => check.status === "fail" && check.details);
  if (failedChecks.length > 0) {
    logger.newline();
    const groupedHints = new Map<string, string[]>();
    for (const check of failedChecks) {
      const detail = check.details as string;
      const existing = groupedHints.get(detail) ?? [];
      existing.push(check.id);
      groupedHints.set(detail, existing);
    }

    for (const [detail, checkIds] of groupedHints) {
      logger.log(`Hint (${checkIds.join(", ")}): ${detail}`);
    }
  }

  logger.newline();
}

function validatePrefix(config: EnvhubConfig): DoctorCheckResult {
  const prefix = config.prefix;
  const trimmed = prefix.trim();

  if (!trimmed) {
    return {
      id: "prefix",
      title: "Prefix validation",
      status: "fail",
      message: "Configured prefix is empty or whitespace only.",
      details: "Set a non-empty 'prefix' in .envhubrc.json (for example: 'envhub-').",
    };
  }

  if (prefix !== trimmed) {
    return {
      id: "prefix",
      title: "Prefix validation",
      status: "warn",
      message: `Configured prefix has surrounding whitespace: '${prefix}'.`,
      details: "Trim the prefix in .envhubrc.json to avoid naming surprises.",
    };
  }

  return {
    id: "prefix",
    title: "Prefix validation",
    status: "pass",
    message: `Prefix is valid ('${prefix}').`,
  };
}

async function runDoctorChecks(): Promise<DoctorReport> {
  const checks: DoctorCheckResult[] = [];
  let config: EnvhubConfig | null = null;

  try {
    config = await configManager.load();
    checks.push({
      id: "config.load",
      title: "Config loading",
      status: "pass",
      message: `Configuration loaded from ${configManager.getConfigPath()}.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown configuration error.";
    checks.push({
      id: "config.load",
      title: "Config loading",
      status: "fail",
      message: "Failed to load envhub configuration.",
      details: `${message} Run 'envhub init' to create or repair configuration.`,
    });

    checks.push({
      id: "prefix",
      title: "Prefix validation",
      status: "warn",
      message: "Skipped because configuration could not be loaded.",
    });
    checks.push({
      id: "provider.init",
      title: "Provider initialization",
      status: "warn",
      message: "Skipped because configuration could not be loaded.",
    });
    checks.push({
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    });
    checks.push({
      id: "provider.rights",
      title: "Provider list rights",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    });

    return {
      checks,
      summary: summarizeChecks(checks),
    };
  }

  checks.push(validatePrefix(config));

  let provider: ReturnType<typeof ProviderFactory.createProvider> | null = null;
  try {
    provider = ProviderFactory.createProvider(config);
    checks.push({
      id: "provider.init",
      title: "Provider initialization",
      status: "pass",
      message: `Provider '${provider.name}' initialized successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error.";
    checks.push({
      id: "provider.init",
      title: "Provider initialization",
      status: "fail",
      message: "Failed to initialize provider from configuration.",
      details: `${message} Check provider-specific fields in .envhubrc.json.`,
    });
    checks.push({
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    });
    checks.push({
      id: "provider.rights",
      title: "Provider list rights",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    });

    return {
      checks,
      summary: summarizeChecks(checks),
    };
  }

  try {
    await provider.list();
    checks.push({
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "pass",
      message: `Connected to ${provider.name} and authenticated successfully.`,
    });
    checks.push({
      id: "provider.rights",
      title: "Provider list rights",
      status: "pass",
      message: "Current identity can list envhub-managed secrets.",
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown provider error.";
    const classification = classifyProviderFailure(provider.name, rawMessage);
    checks.push({
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "fail",
      message: classification.message,
      details: classification.details,
    });
    checks.push({
      id: "provider.rights",
      title: "Provider list rights",
      status: "fail",
      message: "Could not verify permission to list envhub-managed secrets.",
      details: classification.details,
    });
  }

  return {
    checks,
    summary: summarizeChecks(checks),
  };
}

/**
 * The `envhub doctor` command.
 * Runs read-only health checks for local config and provider connectivity.
 */
export async function doctorCommand(options: DoctorCommandOptions): Promise<void> {
  const report = await runDoctorChecks();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderHumanReport(report);
  }

  if (report.summary.fail > 0) {
    process.exit(1);
  }
}

export type { DoctorCheckResult, DoctorCheckStatus, DoctorReport };
export { runDoctorChecks };
