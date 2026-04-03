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

## What It Checks (v1)

1. **`version.check`**: installed envhub version vs latest npm version
2. **`config.load`**: `.envhubrc.json` exists and is valid
3. **`prefix`**: `prefix` is explicitly present, non-empty, and safe (no whitespace-only value)
4. **`provider.init`**: configured provider can be instantiated
5. **`provider.identity`**: echoes configured provider identity context (e.g. GCP project ID and, when available, project name)
6. **`provider.reachability_and_auth`**: provider is reachable and credentials are usable
7. **`provider.list_rights`**: current identity can list envhub-managed secrets
8. **`provider.read_rights`**: current identity can read all tracked secrets from `.envhubrc.json`

> `provider.read_rights` is skipped with a warning when no tracked secrets are configured yet.
> If tracked secrets exist, doctor checks read access for each tracked secret.
> If only some read checks fail, status is warning. If all read checks fail, status is error.
> In human mode, checks are shown progressively (loading, then result per check).

## Human Output Example

```text
envhub doctor
─────────────
Quick health check for config, provider access, and tracked secret readability.

✔ version.check: Version is up to date (0.3.1).
✔ config.load: Configuration loaded from /project/.envhubrc.json.
✔ prefix: Prefix is valid ('envhub-').
✔ provider.init: Provider 'aws' initialized successfully.
✔ provider.identity: AWS context: profile 'default', region 'eu-central-1'.
✔ provider.reachability_and_auth: Connected to aws and authenticated successfully.
✔ provider.list_rights: Current identity can list envhub-managed secrets.
⚠ provider.read_rights: Skipped because no tracked secrets are configured. Add secrets via push/pull first.

Summary: 7 passed, 1 warning(s), 0 failed
```

## JSON Output Example

```bash
npx envhub doctor --json
```

```json
{
  "summary": {
    "pass": 7,
    "warn": 1,
    "fail": 0
  },
  "checks": [
    {
      "id": "version.check",
      "title": "Version check",
      "status": "pass",
      "message": "Version is up to date (0.3.1)."
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
- Missing required config fields (for example `prefix`) fail config validation and are reported as failed checks.
