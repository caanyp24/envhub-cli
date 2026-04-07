# envhub doctor

Run read-only health checks for your local envhub setup and provider access.

## Usage

```bash
envhub doctor [options]
```

## Options

| Option | Description |
| --- | --- |
| `--json` | Output a deterministic JSON report for CI parsing |

## What It Checks (v1.1)

1. **`version.check`**: installed envhub version vs latest npm version
2. **`config.load`**: `.envhubrc.json` exists and is valid
3. **`prefix`**: `prefix` is explicitly present, non-empty, and safe (no whitespace-only value)
4. **`provider.init`**: configured provider can be instantiated
5. **`provider.identity`**: echoes configured provider identity context (e.g. GCP project ID and, when available, project name)
6. **`provider.identity_verified`**: verifies provider identity for the active configured provider
7. **`provider.reachability_and_auth`**: provider is reachable and credentials are usable
8. **`provider.list_rights`**: current identity can list envhub-managed secrets
9. **`provider.read_rights`**: current identity can read all tracked secrets from `.envhubrc.json`

> `provider.read_rights` is skipped with a warning when no tracked secrets are configured yet.
> If tracked secrets exist, doctor checks read access for each tracked secret.
> If only some read checks fail, status is warning. If all read checks fail, status is error.
> Only the provider configured in `.envhubrc.json` is identity-verified.
> In TTY human mode, a spinner updates per check while running; non-TTY runs (for example CI or redirected output) fall back to plain log lines. Results are then printed in grouped sections.
> Timeout cases are reported as warnings with explicit `timed out after 10s` messages.

## Human Output Example

```text
◇  envhub doctor
│  Quick health check for version, config, provider identity/access,
│  and tracked secret readability.

◇  Version
  ✔ version.check: Version is up to date (0.3.1).

◇  Configuration
  ✔ config.load: Configuration loaded from /project/.envhubrc.json.
  ✔ prefix: Prefix is valid ('envhub-').

◇  Provider
  ✔ provider.init: Provider 'aws' initialized successfully.
  ✔ provider.identity: AWS context: profile 'default', region 'eu-central-1'.
  ✔ provider.identity_verified: Verified AWS identity: arn:aws:iam::123456789012:user/jane.doe (account 123456789012).
  ✔ provider.reachability_and_auth: Connected to aws and authenticated successfully.

◇  Permissions
  ✔ provider.list_rights: Current identity can list envhub-managed secrets.
  ⚠ provider.read_rights: Skipped because no tracked secrets are configured. Add secrets via push/pull first.

8 passed, 1 warning(s), 0 failed
```

Example spinner progression while checks run:

```text
◒  Checking version.check...
◐  Checking config.load...
◑  Checking provider.init...
```

## JSON Output Example

```bash
npx envhub doctor --json
```

```json
{
  "summary": {
    "pass": 8,
    "warn": 1,
    "fail": 0
  },
  "checks": [
    {
      "id": "version.check",
      "title": "Version check",
      "status": "pass",
      "message": "Version is up to date (0.3.1)."
    },
    {
      "id": "provider.identity_verified",
      "title": "Provider identity verified",
      "status": "pass",
      "message": "Verified AWS identity: arn:aws:iam::123456789012:user/jane.doe (account 123456789012)."
    }
  ]
}
```

## Exit Codes

- `0`: all checks passed, or pass + warnings only
- `1`: at least one check failed

## Notes

- `doctor` is non-mutating and does not write any local or remote secret data.
- `doctor` performs read checks with `cat` for tracked secrets listed in `.envhubrc.json`.
- `doctor` does not run write checks by default to avoid side effects (for example new secret versions, audit noise, and policy/cost impact).
- v1 intentionally keeps checks fast and does not perform deep IAM/RBAC diagnostics.
- provider CLI calls (`gcloud`, `az`) and key network checks use a 10-second timeout budget and surface timeout warnings.
- Missing required config fields (for example `prefix`) fail config validation and are reported as failed checks.
