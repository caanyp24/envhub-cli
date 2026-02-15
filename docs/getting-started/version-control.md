# Version Control

envhub includes a built-in version control system that prevents developers from accidentally overwriting each other's changes. Every push increments the version number, and envhub checks for conflicts before allowing a push.

## How It Works

The version control system operates on two levels:

1. **Remote versioning** — Each secret in the cloud provider has a version number stored in its metadata
2. **Local tracking** — The `.envhubrc.json` file tracks the last known version for each secret

### Version Flow

```
Developer A                    AWS Secrets Manager               Developer B
     |                              |                                 |
     |-- push (v1) --------------->|                                 |
     |   local: v1                 | stored: v1                      |
     |                              |                                 |
     |                              |<------------- pull (v1) --------|
     |                              |                   local: v1     |
     |                              |                                 |
     |                              |<------------- push (v2) --------|
     |                              | stored: v2        local: v2     |
     |                              |                                 |
     |-- push (v2?) ----X          |                                 |
     |   CONFLICT!                 |                                 |
     |   local=v1, remote=v2       |                                 |
     |                              |                                 |
     |-- pull (v2) --------------->|                                 |
     |   local: v2                 |                                 |
     |                              |                                 |
     |-- push (v3) --------------->|                                 |
     |   local: v3                 | stored: v3                      |
```

## Push Conflict Detection

Before every push, envhub compares your local version with the remote version:

| Local Version | Remote Version | Result |
| --- | --- | --- |
| 0 (new) | 0 (doesn't exist) | Push allowed — creates new secret |
| 5 | 5 | Push allowed — versions match |
| 5 | 7 | **Conflict** — someone pushed v6 and v7 since your last pull |
| 5 | 0 (doesn't exist) | Push allowed — secret was deleted, creates new |

### When a Conflict Is Detected

```bash
$ npx envhub push my-app-dev ./.env
```

```
⚠ Remote version (7) is newer than your local version (5).
  Run 'envhub pull' first to get the latest changes, or use --force to overwrite.

? Do you want to force push anyway? (y/N)
```

You have two options:

**Option 1: Pull first (recommended)**

```bash
npx envhub pull my-app-dev ./.env
# Review the changes, then push
npx envhub push my-app-dev ./.env
```

**Option 2: Force push**

```bash
npx envhub push my-app-dev ./.env --force
```

> **Warning:** Force pushing skips the version check entirely. The remote content will be overwritten regardless of what version is stored there.

## Pull Behavior

Pulling always overwrites the local file immediately — no confirmation needed. This keeps environment switching fast and frictionless.

```
✔ Pulled 'my-app-dev' (v5) → ./.env (18 keys)
```

Use `envhub cat <name>` to inspect a secret before pulling if needed.

## Local Tracking in .envhubrc.json

Version information is stored in the `secrets` section of `.envhubrc.json`:

```json
{
  "secrets": {
    "my-app-dev": {
      "version": 5,
      "file": "./.env",
      "lastPulled": "2026-02-15T10:30:00.000Z"
    }
  }
}
```

| Field | Description |
| --- | --- |
| `version` | Last known version number (updated on push and pull) |
| `file` | Path to the associated local .env file |
| `lastPulled` | Timestamp of the last pull operation |

> **Important:** Don't manually edit the version numbers in `.envhubrc.json`. Let envhub manage them through push and pull operations.

## Best Practices

1. **Always pull before pushing** — This ensures you have the latest changes and avoids conflicts
2. **Use messages on push** — `envhub push my-app -m "Added Redis config"` helps teammates understand what changed
3. **Don't commit `.envhubrc.json`** — It's automatically added to `.gitignore` by `envhub init`, but double-check that it's there
4. **Avoid `--force` unless necessary** — It exists for edge cases, not for regular workflow
