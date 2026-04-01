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

1. **`config.load`**: `.envhubrc.json` exists and is valid
2. **`prefix`**: `prefix` is explicitly present, non-empty, and safe (no whitespace-only value)
3. **`provider.init`**: configured provider can be instantiated
4. **`provider.reachability_and_auth`**: provider is reachable and credentials are usable
5. **`provider.rights`**: current identity can list envhub-managed secrets

> `provider.rights` is inferred from a successful `list()` call in v1.

## Human Output Example

```text
envhub doctor
─────────────
✅ config.load: Configuration loaded from /project/.envhubrc.json.
✅ prefix: Prefix is valid ('envhub-').
✅ provider.init: Provider 'aws' initialized successfully.
✅ provider.reachability_and_auth: Connected to aws and authenticated successfully.
✅ provider.rights: Current identity can list envhub-managed secrets.

Summary: 5 passed, 0 warning(s), 0 failed
```

## JSON Output Example

```bash
npx envhub doctor --json
```

```json
{
  "summary": {
    "pass": 5,
    "warn": 0,
    "fail": 0
  },
  "checks": [
    {
      "id": "config.load",
      "title": "Config loading",
      "status": "pass",
      "message": "Configuration loaded from /project/.envhubrc.json."
    }
  ]
}
```

## Exit Codes

- `0`: all checks passed, or pass + warnings only
- `1`: at least one check failed

## Notes

- `doctor` is non-mutating and does not write any local or remote secret data.
- v1 intentionally keeps checks fast and does not read secret content (`cat`) or perform deep IAM/RBAC diagnostics.
- Missing required config fields (for example `prefix`) fail config validation and are reported as failed checks.
