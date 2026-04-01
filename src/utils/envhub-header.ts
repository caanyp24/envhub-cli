const LEGACY_ENVHUB_HEADER_PREFIX = "# envhub: secret=";
const ENVHUB_MANAGED_LINE = "# 🔐 Managed by envhub-cli";
const ENVHUB_ENV_LINE_PREFIX = "# Environment: ";

/**
 * Extract the tracked environment (secret name) from an envhub header, if present.
 */
export function getEnvhubHeaderEnvironment(content: string): string | null {
  const lines = content.split("\n");
  const firstLine = lines[0] ?? "";
  const secondLine = lines[1] ?? "";

  if (
    firstLine === ENVHUB_MANAGED_LINE &&
    secondLine.startsWith(ENVHUB_ENV_LINE_PREFIX)
  ) {
    const secretName = secondLine.substring(ENVHUB_ENV_LINE_PREFIX.length).trim();
    return secretName.length > 0 ? secretName : null;
  }

  if (firstLine.startsWith(LEGACY_ENVHUB_HEADER_PREFIX)) {
    const secretName = firstLine.substring(LEGACY_ENVHUB_HEADER_PREFIX.length).trim();
    return secretName.length > 0 ? secretName : null;
  }

  return null;
}

/**
 * Remove an envhub local header from the beginning of .env content.
 */
export function stripEnvhubHeader(content: string): string {
  const lines = content.split("\n");
  const firstLine = lines[0] ?? "";
  const secondLine = lines[1] ?? "";

  if (
    firstLine === ENVHUB_MANAGED_LINE &&
    secondLine.startsWith(ENVHUB_ENV_LINE_PREFIX)
  ) {
    lines.splice(0, 2);
    if (lines[0] === "") {
      lines.shift();
    }
    return lines.join("\n");
  }

  if (firstLine.startsWith(LEGACY_ENVHUB_HEADER_PREFIX)) {
    lines.shift();
    if (lines[0] === "") {
      lines.shift();
    }
    return lines.join("\n");
  }
  return content;
}

/**
 * Add (or replace) the envhub local header at the top of .env content.
 */
export function addEnvhubHeader(secretName: string, content: string): string {
  const withoutHeader = stripEnvhubHeader(content).replace(/^\n+/, "");
  return `${ENVHUB_MANAGED_LINE}\n${ENVHUB_ENV_LINE_PREFIX}${secretName}\n\n${withoutHeader}`;
}
