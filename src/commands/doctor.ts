import { configManager } from "../config/config.js";
import { ProviderFactory } from "../providers/provider.factory.js";
import type { EnvhubConfig } from "../config/config.schema.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";
import chalk from "chalk";
import type { Ora } from "ora";
import { logger } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string; name: string };
const CHECK_TIMEOUT_MS = 10_000;

type DoctorCheckStatus = "pass" | "warn" | "fail";

interface DoctorCheckResult {
  id:
    | "version.check"
    | "config.load"
    | "prefix"
    | "provider.init"
    | "provider.identity"
    | "provider.identity_verified"
    | "provider.reachability_and_auth"
    | "provider.list_rights"
    | "provider.read_rights";
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

const execFileAsync = promisify(execFile);
type DoctorCheckId = DoctorCheckResult["id"];
type DoctorProgressEvent =
  | { phase: "start"; id: DoctorCheckId; title: string }
  | { phase: "end"; check: DoctorCheckResult };
type DoctorProgressHandler = (event: DoctorProgressEvent) => void;

type DoctorCheckGroup = "Version" | "Configuration" | "Provider" | "Permissions";

class OperationTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${Math.floor(timeoutMs / 1000)}s.`);
    this.name = "OperationTimeoutError";
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "OperationTimeoutError" ||
    message.includes("timed out") ||
    message.includes("etimedout")
  );
}

async function withTimeout<T>(
  operation: string,
  task: Promise<T>,
  timeoutMs: number = CHECK_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new OperationTimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function iconForStatus(status: DoctorCheckStatus): string {
  if (status === "pass") return chalk.green("✔");
  if (status === "warn") return chalk.yellow("⚠");
  return chalk.red("✖");
}

function groupForCheck(id: DoctorCheckId): DoctorCheckGroup {
  if (id === "version.check") return "Version";
  if (id === "config.load" || id === "prefix") return "Configuration";
  if (
    id === "provider.init" ||
    id === "provider.identity" ||
    id === "provider.identity_verified" ||
    id === "provider.reachability_and_auth"
  ) {
    return "Provider";
  }
  return "Permissions";
}

function renderGroupHeader(group: DoctorCheckGroup): void {
  logger.log(chalk.bold.cyan(`  ${group}`));
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

async function resolveGcpProjectName(projectId: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("gcloud", [
      "projects",
      "describe",
      projectId,
      "--format=value(name)",
    ], {
      timeout: CHECK_TIMEOUT_MS,
    });

    const name = stdout.trim();
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

async function getGcloudActiveAccount(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("gcloud", [
      "auth",
      "list",
      "--filter=status:ACTIVE",
      "--format=value(account)",
    ], { timeout: CHECK_TIMEOUT_MS });
    const account = stdout.trim();
    return account.length > 0 ? account : null;
  } catch {
    return null;
  }
}

async function getGcloudActiveProject(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("gcloud", [
      "config",
      "get-value",
      "project",
    ], { timeout: CHECK_TIMEOUT_MS });
    const project = stdout.trim();
    if (!project || project === "(unset)") return null;
    return project;
  } catch {
    return null;
  }
}

async function verifyAwsIdentity(config: EnvhubConfig): Promise<DoctorCheckResult> {
  if (!config.aws) {
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Skipped because AWS configuration is incomplete.",
      details: "Ensure 'aws.profile' and 'aws.region' are configured.",
    };
  }

  try {
    const client = new STSClient({
      region: config.aws.region,
      credentials: fromIni({ profile: config.aws.profile }),
    });
    const result = await withTimeout(
      "AWS identity verification",
      client.send(new GetCallerIdentityCommand({}))
    );
    if (!result.Account || !result.Arn) {
      return {
        id: "provider.identity_verified",
        title: "Provider identity verified",
        status: "warn",
        message: "Could not fully verify AWS identity.",
        details: "Run 'aws sts get-caller-identity' and verify your profile credentials.",
      };
    }

    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "pass",
      message: `Verified AWS identity: ${result.Arn} (account ${result.Account}).`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AWS identity error.";
    if (isTimeoutError(error)) {
      return {
        id: "provider.identity_verified",
        title: "Provider identity verified",
        status: "warn",
        message: "Could not verify AWS identity (timed out after 10s).",
        details:
          "Timeout while verifying AWS identity. Check network/proxy/VPN and AWS endpoint reachability.",
      };
    }
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Could not verify AWS identity.",
      details:
        `${message} Re-authenticate or verify profile '${config.aws.profile}' ` +
        `(e.g. 'aws sts get-caller-identity --profile ${config.aws.profile}').`,
    };
  }
}

async function verifyGcpIdentity(config: EnvhubConfig): Promise<DoctorCheckResult> {
  if (!config.gcp) {
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Skipped because GCP configuration is incomplete.",
      details: "Ensure 'gcp.projectId' is configured.",
    };
  }

  const [activeAccount, activeProject] = await Promise.all([
    getGcloudActiveAccount(),
    getGcloudActiveProject(),
  ]);

  if (!activeAccount || !activeProject) {
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Could not verify GCP identity.",
      details:
        "Run 'gcloud auth login' and ensure an active project is set " +
        "('gcloud config set project <PROJECT_ID>').",
    };
  }

  if (activeProject !== config.gcp.projectId) {
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "fail",
      message:
        `GCP context mismatch: active project '${activeProject}' does not match configured project '${config.gcp.projectId}'.`,
      details: "Switch gcloud project or update '.envhubrc.json' to the intended project.",
    };
  }

  return {
    id: "provider.identity_verified",
    title: "Provider identity verified",
    status: "pass",
    message: `Verified GCP identity: ${activeAccount} (project ${activeProject}).`,
  };
}

async function verifyAzureIdentity(): Promise<DoctorCheckResult> {
  try {
    const { stdout } = await execFileAsync("az", ["account", "show", "--output", "json"], {
      timeout: CHECK_TIMEOUT_MS,
    });
    const payload = JSON.parse(stdout) as {
      id?: string;
      tenantId?: string;
      user?: { name?: string };
    };

    if (!payload.id || !payload.tenantId) {
      return {
        id: "provider.identity_verified",
        title: "Provider identity verified",
        status: "warn",
        message: "Could not fully verify Azure identity.",
        details: "Run 'az account show' and verify account context.",
      };
    }

    const userName = payload.user?.name ?? "unknown-user";
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "pass",
      message:
        `Verified Azure identity: ${userName} (tenant ${payload.tenantId}, subscription ${payload.id}).`,
    };
  } catch {
    return {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Could not verify Azure identity (timed out or unavailable).",
      details:
        "Run 'az login' and verify tenant/subscription context with 'az account show'.",
    };
  }
}

async function verifyProviderIdentity(config: EnvhubConfig): Promise<DoctorCheckResult> {
  if (config.provider === "aws") {
    return verifyAwsIdentity(config);
  }
  if (config.provider === "gcp") {
    return verifyGcpIdentity(config);
  }
  if (config.provider === "azure") {
    return verifyAzureIdentity();
  }

  return {
    id: "provider.identity_verified",
    title: "Provider identity verified",
    status: "warn",
    message: "Provider identity verification is not available for this provider.",
  };
}

function parseSemver(version: string): [number, number, number] | null {
  const core = version.trim().replace(/^v/, "").split("-")[0];
  const parts = core.split(".");
  if (parts.length < 3) return null;

  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);

  if ([major, minor, patch].some((n) => Number.isNaN(n))) {
    return null;
  }

  return [major, minor, patch];
}

function isVersionOlder(localVersion: string, latestVersion: string): boolean {
  const local = parseSemver(localVersion);
  const latest = parseSemver(latestVersion);

  if (!local || !latest) {
    return localVersion !== latestVersion;
  }

  if (local[0] !== latest[0]) return local[0] < latest[0];
  if (local[1] !== latest[1]) return local[1] < latest[1];
  return local[2] < latest[2];
}

async function runVersionCheck(): Promise<DoctorCheckResult> {
  const localVersion = pkg.version;
  const packageName = pkg.name;

  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!response.ok) {
      return {
        id: "version.check",
        title: "Version check",
        status: "warn",
        message: `Installed envhub version: ${localVersion} (latest version could not be verified).`,
      };
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version;

    if (!latestVersion) {
      return {
        id: "version.check",
        title: "Version check",
        status: "warn",
        message: `Installed envhub version: ${localVersion} (latest version could not be verified).`,
      };
    }

    if (isVersionOlder(localVersion, latestVersion)) {
      return {
        id: "version.check",
        title: "Version check",
        status: "warn",
        message:
          `Update available: ${localVersion} --> ${latestVersion}\n` +
          "  Update (project): npm install --save-dev envhub-cli@latest\n" +
          "  Update (global): npm install -g envhub-cli@latest\n" +
          "  Stay current: run 'npx envhub doctor' regularly."
      };
    }

    return {
      id: "version.check",
      title: "Version check",
      status: "pass",
      message: `Version is up to date (${localVersion}).`,
    };
  } catch {
    return {
      id: "version.check",
      title: "Version check",
      status: "warn",
      message: `Installed envhub version: ${localVersion} (latest version check skipped: network unavailable).`,
    };
  }
}

function formatCheckMessage(check: DoctorCheckResult): string {
  let message = check.message;
  if (check.id === "version.check") {
    const [firstLine, ...restLines] = message.split("\n");
    const match = firstLine.match(/^Update available: (.+) --> (.+)$/);
    if (match) {
      const localVersion = chalk.yellow(match[1]);
      const latestVersion = chalk.green(match[2]);
      const coloredFirstLine = `Update available: ${localVersion} --> ${latestVersion}`;
      message = [coloredFirstLine, ...restLines].join("\n");
    }
  }
  if (check.id === "provider.read_rights") {
    const lines = message.split("\n");
    const firstLine = lines[0] ?? "";
    const match = firstLine.match(/^(.+?)(\d+\/\d+)(.*)$/);
    if (match) {
      const [, before, ratio, after] = match;
      const coloredRatio = check.status === "pass"
        ? chalk.green(ratio)
        : check.status === "warn"
          ? chalk.yellow(ratio)
          : ratio;
      lines[0] = `${before}${coloredRatio}${after}`;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const passMatch = line.match(/^(\s*)✔\s(.+)$/);
      if (passMatch) {
        lines[i] = `${passMatch[1]}${chalk.green("✔")} ${chalk.green(passMatch[2])}`;
        continue;
      }
      const failMatch = line.match(/^(\s*)✖\s(.+)$/);
      if (failMatch) {
        lines[i] = `${failMatch[1]}${chalk.red("✖")} ${chalk.red(failMatch[2])}`;
      }
    }

    message = lines.join("\n");
  }
  return message;
}

function logCheckLine(check: DoctorCheckResult): void {
  const formatted = formatCheckMessage(check);
  const lines = formatted.split("\n");
  const firstLine = lines[0] ?? "";
  logger.log(`  ${iconForStatus(check.status)} ${check.id}: ${firstLine}`);

  for (let i = 1; i < lines.length; i++) {
    logger.log(`  ${lines[i]}`);
  }
}

function renderHumanHeader(): void {
  const title = "envhub doctor";
  logger.newline();
  logger.log(chalk.bold.cyan(`  ${title}`));
  logger.log(chalk.dim(`  ${"─".repeat(title.length)}`));
  logger.dim(
    "  Quick health check for version, config, provider identity/access, and tracked secret readability."
  );
  logger.newline();
}

function renderHumanSummary(report: DoctorReport): void {
  logger.newline();
  logger.log(chalk.bold("  Summary"));
  logger.log(
    `    ${chalk.green(`${report.summary.pass} passed`)}, ` +
      `${chalk.yellow(`${report.summary.warn} warning(s)`)}, ` +
      `${chalk.red(`${report.summary.fail} failed`)}`
  );

  const hintedChecks = report.checks.filter(
    (check) =>
      !!check.details && check.status !== "pass"
  );
  if (hintedChecks.length > 0) {
    logger.newline();
    logger.log(chalk.bold.yellow("  Hints"));
    const groupedHints = new Map<string, string[]>();
    for (const check of hintedChecks) {
      const detail = check.details as string;
      const existing = groupedHints.get(detail) ?? [];
      existing.push(check.id);
      groupedHints.set(detail, existing);
    }

    for (const [detail, checkIds] of groupedHints) {
      logger.log(`    ${chalk.yellow("⚠")} (${checkIds.join(", ")}): ${detail}`);
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

async function runDoctorChecks(progress?: DoctorProgressHandler): Promise<DoctorReport> {
  const checks: DoctorCheckResult[] = [];
  let config: EnvhubConfig | null = null;

  progress?.({ phase: "start", id: "version.check", title: "Version check" });
  const versionCheck = await runVersionCheck();
  checks.push(versionCheck);
  progress?.({
    phase: "end",
    check: versionCheck,
  });

  try {
    progress?.({ phase: "start", id: "config.load", title: "Config loading" });
    config = await configManager.load();
    const configCheck: DoctorCheckResult = {
      id: "config.load",
      title: "Config loading",
      status: "pass",
      message: `Configuration loaded from ${configManager.getConfigPath()}.`,
    };
    checks.push(configCheck);
    progress?.({
      phase: "end",
      check: configCheck,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown configuration error.";
    const configCheck: DoctorCheckResult = {
      id: "config.load",
      title: "Config loading",
      status: "fail",
      message: "Failed to load envhub configuration.",
      details: `${message} Run 'envhub init' to create or repair configuration.`,
    };
    checks.push(configCheck);
    progress?.({
      phase: "end",
      check: configCheck,
    });

    const prefixCheck: DoctorCheckResult = {
      id: "prefix",
      title: "Prefix validation",
      status: "warn",
      message: "Skipped because configuration could not be loaded.",
    };
    checks.push(prefixCheck);
    progress?.({ phase: "end", check: prefixCheck });

    const providerInitCheck: DoctorCheckResult = {
      id: "provider.init",
      title: "Provider initialization",
      status: "warn",
      message: "Skipped because configuration could not be loaded.",
    };
    checks.push(providerInitCheck);
    progress?.({ phase: "end", check: providerInitCheck });

    const providerIdentityCheck: DoctorCheckResult = {
      id: "provider.identity",
      title: "Provider identity",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(providerIdentityCheck);
    progress?.({ phase: "end", check: providerIdentityCheck });

    const providerIdentityVerifiedCheck: DoctorCheckResult = {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(providerIdentityVerifiedCheck);
    progress?.({ phase: "end", check: providerIdentityVerifiedCheck });

    const reachabilityCheck: DoctorCheckResult = {
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(reachabilityCheck);
    progress?.({ phase: "end", check: reachabilityCheck });

    const listRightsCheck: DoctorCheckResult = {
      id: "provider.list_rights",
      title: "Provider list rights",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(listRightsCheck);
    progress?.({ phase: "end", check: listRightsCheck });

    const readRightsCheck: DoctorCheckResult = {
      id: "provider.read_rights",
      title: "Provider read rights",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(readRightsCheck);
    progress?.({ phase: "end", check: readRightsCheck });

    return {
      checks,
      summary: summarizeChecks(checks),
    };
  }

  progress?.({ phase: "start", id: "prefix", title: "Prefix validation" });
  const prefixCheck = validatePrefix(config);
  checks.push(prefixCheck);
  progress?.({
    phase: "end",
    check: prefixCheck,
  });

  let provider: ReturnType<typeof ProviderFactory.createProvider> | null = null;
  try {
    progress?.({ phase: "start", id: "provider.init", title: "Provider initialization" });
    provider = ProviderFactory.createProvider(config);
    const initCheck: DoctorCheckResult = {
      id: "provider.init",
      title: "Provider initialization",
      status: "pass",
      message: `Provider '${provider.name}' initialized successfully.`,
    };
    checks.push(initCheck);
    progress?.({
      phase: "end",
      check: initCheck,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error.";
    const initCheck: DoctorCheckResult = {
      id: "provider.init",
      title: "Provider initialization",
      status: "fail",
      message: "Failed to initialize provider from configuration.",
      details: `${message} Check provider-specific fields in .envhubrc.json.`,
    };
    checks.push(initCheck);
    progress?.({
      phase: "end",
      check: initCheck,
    });
    const providerIdentityCheck: DoctorCheckResult = {
      id: "provider.identity",
      title: "Provider identity",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(providerIdentityCheck);
    progress?.({ phase: "end", check: providerIdentityCheck });

    const providerIdentityVerifiedCheck: DoctorCheckResult = {
      id: "provider.identity_verified",
      title: "Provider identity verified",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(providerIdentityVerifiedCheck);
    progress?.({ phase: "end", check: providerIdentityVerifiedCheck });

    const reachabilityCheck: DoctorCheckResult = {
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(reachabilityCheck);
    progress?.({ phase: "end", check: reachabilityCheck });

    const listRightsCheck: DoctorCheckResult = {
      id: "provider.list_rights",
      title: "Provider list rights",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(listRightsCheck);
    progress?.({ phase: "end", check: listRightsCheck });

    const readRightsCheck: DoctorCheckResult = {
      id: "provider.read_rights",
      title: "Provider read rights",
      status: "warn",
      message: "Skipped because provider could not be initialized.",
    };
    checks.push(readRightsCheck);
    progress?.({ phase: "end", check: readRightsCheck });

    return {
      checks,
      summary: summarizeChecks(checks),
    };
  }

  progress?.({ phase: "start", id: "provider.identity", title: "Provider identity" });
  if (config.provider === "aws" && config.aws) {
    const identityCheck: DoctorCheckResult = {
      id: "provider.identity",
      title: "Provider identity",
      status: "pass",
      message: `AWS context: profile '${config.aws.profile}', region '${config.aws.region}'.`,
    };
    checks.push(identityCheck);
    progress?.({
      phase: "end",
      check: identityCheck,
    });
  } else if (config.provider === "gcp" && config.gcp) {
    const projectName = await resolveGcpProjectName(config.gcp.projectId);
    const identityCheck: DoctorCheckResult = {
      id: "provider.identity",
      title: "Provider identity",
      status: "pass",
      message: projectName
        ? `GCP context: project '${config.gcp.projectId}' (${projectName}).`
        : `GCP context: project '${config.gcp.projectId}'.`,
    };
    checks.push(identityCheck);
    progress?.({
      phase: "end",
      check: identityCheck,
    });
  } else if (config.provider === "azure" && config.azure) {
    const identityCheck: DoctorCheckResult = {
      id: "provider.identity",
      title: "Provider identity",
      status: "pass",
      message: `Azure context: vault '${config.azure.vaultUrl}'.`,
    };
    checks.push(identityCheck);
    progress?.({
      phase: "end",
      check: identityCheck,
    });
  } else {
    const identityCheck: DoctorCheckResult = {
      id: "provider.identity",
      title: "Provider identity",
      status: "warn",
      message: "Provider identity context is not available in configuration.",
    };
    checks.push(identityCheck);
    progress?.({
      phase: "end",
      check: identityCheck,
    });
  }

  progress?.({
    phase: "start",
    id: "provider.identity_verified",
    title: "Provider identity verified",
  });
  const identityVerifiedCheck = await verifyProviderIdentity(config);
  checks.push(identityVerifiedCheck);
  progress?.({
    phase: "end",
    check: identityVerifiedCheck,
  });

  try {
    progress?.({
      phase: "start",
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
    });
    await withTimeout("Provider list check", provider.list());
    const reachabilityCheck: DoctorCheckResult = {
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "pass",
      message: `Connected to ${provider.name} and authenticated successfully.`,
    };
    checks.push(reachabilityCheck);
    progress?.({
      phase: "end",
      check: reachabilityCheck,
    });

    progress?.({
      phase: "start",
      id: "provider.list_rights",
      title: "Provider list rights",
    });
    const listRightsCheck: DoctorCheckResult = {
      id: "provider.list_rights",
      title: "Provider list rights",
      status: "pass",
      message: "Current identity can list envhub-managed secrets.",
    };
    checks.push(listRightsCheck);
    progress?.({
      phase: "end",
      check: listRightsCheck,
    });

    const trackedSecretNames = Object.keys(config.secrets).sort((a, b) =>
      a.localeCompare(b)
    );

    progress?.({
      phase: "start",
      id: "provider.read_rights",
      title: "Provider read rights",
    });
    if (trackedSecretNames.length === 0) {
      const readCheck: DoctorCheckResult = {
        id: "provider.read_rights",
        title: "Provider read rights",
        status: "warn",
        message:
          "Skipped because no tracked secrets are configured. Add secrets via push/pull first.",
      };
      checks.push(readCheck);
      progress?.({
        phase: "end",
        check: readCheck,
      });
    } else {
      const passedSecrets: string[] = [];
      const failedSecrets: string[] = [];
      let firstFailureMessage = "";
      for (const secretName of trackedSecretNames) {
        try {
          await withTimeout(
            `Provider read check for '${secretName}'`,
            provider.cat(secretName)
          );
          passedSecrets.push(secretName);
        } catch (error) {
          failedSecrets.push(secretName);
          if (!firstFailureMessage) {
            firstFailureMessage =
              error instanceof Error ? error.message : "Unknown provider error.";
          }
        }
      }

      if (failedSecrets.length === 0) {
        const passedLines = trackedSecretNames.map((name) => `    ✔ ${name}`);
        const readCheck: DoctorCheckResult = {
          id: "provider.read_rights",
          title: "Provider read rights",
          status: "pass",
          message:
            `Read checks passed for all tracked secrets (${trackedSecretNames.length}/${trackedSecretNames.length}).\n` +
            passedLines.join("\n"),
        };
        checks.push(readCheck);
        progress?.({
          phase: "end",
          check: readCheck,
        });
      } else {
        const classification = classifyProviderFailure(provider.name, firstFailureMessage);
        if (failedSecrets.length === trackedSecretNames.length) {
          const failedLines = failedSecrets.map((name) => `    ✖ ${name}`);
          const allFailedDueToTimeout = isTimeoutError(
            firstFailureMessage ? new Error(firstFailureMessage) : null
          );
          const readCheck: DoctorCheckResult = {
            id: "provider.read_rights",
            title: "Provider read rights",
            status: allFailedDueToTimeout ? "warn" : "fail",
            message:
              `${allFailedDueToTimeout ? "Read checks timed out for all" : "Read checks failed for all"} ` +
              `${trackedSecretNames.length} tracked secrets.\n` +
              failedLines.join("\n"),
            details: classification.details,
          };
          checks.push(readCheck);
          progress?.({
            phase: "end",
            check: readCheck,
          });
        } else {
          const passedLines = passedSecrets.map((name) => `    ✔ ${name}`);
          const failedLines = failedSecrets.map((name) => `    ✖ ${name}`);
          const readCheck: DoctorCheckResult = {
            id: "provider.read_rights",
            title: "Provider read rights",
            status: "warn",
            message:
              `Read checks partially passed (${passedSecrets.length}/${trackedSecretNames.length}).\n` +
              passedLines.join("\n") +
              "\n" +
              failedLines.join("\n"),
            details: classification.details,
          };
          checks.push(readCheck);
          progress?.({
            phase: "end",
            check: readCheck,
          });
        }
      }
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown provider error.";
    if (isTimeoutError(error)) {
      const reachabilityTimeoutCheck: DoctorCheckResult = {
        id: "provider.reachability_and_auth",
        title: "Provider reachability/auth",
        status: "warn",
        message: "Provider reachability/auth check timed out after 10s.",
        details:
          "Timeout while contacting provider. Check network/proxy/VPN and retry.",
      };
      checks.push(reachabilityTimeoutCheck);
      progress?.({
        phase: "end",
        check: reachabilityTimeoutCheck,
      });

      progress?.({
        phase: "start",
        id: "provider.list_rights",
        title: "Provider list rights",
      });
      const listTimeoutCheck: DoctorCheckResult = {
        id: "provider.list_rights",
        title: "Provider list rights",
        status: "warn",
        message: "Skipped because list check timed out after 10s.",
        details: "Retry when provider connectivity is stable.",
      };
      checks.push(listTimeoutCheck);
      progress?.({
        phase: "end",
        check: listTimeoutCheck,
      });

      progress?.({
        phase: "start",
        id: "provider.read_rights",
        title: "Provider read rights",
      });
      const readTimeoutCheck: DoctorCheckResult = {
        id: "provider.read_rights",
        title: "Provider read rights",
        status: "warn",
        message: "Skipped because provider list check timed out after 10s.",
        details: "Retry when provider connectivity is stable.",
      };
      checks.push(readTimeoutCheck);
      progress?.({
        phase: "end",
        check: readTimeoutCheck,
      });
      return {
        checks,
        summary: summarizeChecks(checks),
      };
    }
    const classification = classifyProviderFailure(provider.name, rawMessage);
    const reachabilityCheck: DoctorCheckResult = {
      id: "provider.reachability_and_auth",
      title: "Provider reachability/auth",
      status: "fail",
      message: classification.message,
      details: classification.details,
    };
    checks.push(reachabilityCheck);
    progress?.({
      phase: "end",
      check: reachabilityCheck,
    });

    progress?.({
      phase: "start",
      id: "provider.list_rights",
      title: "Provider list rights",
    });
    const listRightsCheck: DoctorCheckResult = {
      id: "provider.list_rights",
      title: "Provider list rights",
      status: "fail",
      message: "Could not verify permission to list envhub-managed secrets.",
      details: classification.details,
    };
    checks.push(listRightsCheck);
    progress?.({
      phase: "end",
      check: listRightsCheck,
    });

    progress?.({
      phase: "start",
      id: "provider.read_rights",
      title: "Provider read rights",
    });
    const readCheck: DoctorCheckResult = {
      id: "provider.read_rights",
      title: "Provider read rights",
      status: "warn",
      message: "Skipped because list permission check failed.",
    };
    checks.push(readCheck);
    progress?.({
      phase: "end",
      check: readCheck,
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
  let currentSpinner: Ora | null = null;
  let currentGroup: DoctorCheckGroup | null = null;
  if (!options.json) {
    renderHumanHeader();
  }
  const progress: DoctorProgressHandler | undefined = options.json
    ? undefined
    : (event) => {
      if (event.phase === "start") {
        currentSpinner = logger.spinner(`Checking ${event.id}...`);
        return;
      }
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }
      const group = groupForCheck(event.check.id);
      if (group !== currentGroup) {
        if (currentGroup !== null) {
          logger.newline();
        }
        renderGroupHeader(group);
        currentGroup = group;
      }
      logCheckLine(event.check);
    };

  const report = await runDoctorChecks(progress);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderHumanSummary(report);
  }

  if (report.summary.fail > 0) {
    process.exit(1);
  }
}

export type { DoctorCheckResult, DoctorCheckStatus, DoctorReport };
export { runDoctorChecks };
