# envhub push

Push the contents of a local `.env` file to the cloud provider.

## Usage

```bash
envhub push <name> <file> [options]
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | A unique name for the secret (e.g. `my-app-dev`, `api-keys-prod`) |
| `file` | Path to the `.env` file to push (e.g. `./.env`, `./config/.env.local`) |

## Options

| Option | Description |
| --- | --- |
| `-m, --message <msg>` | Attach a message describing what changed (like a commit message) |
| `-f, --force` | Bypass version conflict checking and diff confirmation |

## Examples

### Basic push

```bash
npx envhub push my-app-dev ./.env
```

### Push with a message

```bash
npx envhub push my-app-dev ./.env -m "Added Stripe config"
```

### Force push (skip all checks and confirmations)

```bash
npx envhub push my-app-dev --force
```

## What Happens

### New Secret (first push)

envhub shows all entries that will be created and asks for confirmation:

```
  New secret with 4 entries:
    + DATABASE_URL=pos***
    + STRIPE_API_KEY=sk_***
    + REDIS_URL=red***
    + APP_SECRET=my-***

? Create new secret 'my-app-dev'? (Y/n)

✔ Pushed 'my-app-dev' (v1) to aws.
```

### Existing Secret (changes detected)

envhub compares your local file with the remote version and shows a diff:

```
Changes to push:
  Added (1):
    + SENTRY_DSN=htt***
  Removed (1):
    - OLD_KEY
  Changed (1):
    ~ DATABASE_URL

? Push these changes? (Y/n)

✔ Pushed 'my-app-dev' (v2) to aws.
  Message: Updated database and added Sentry
```

### Existing Secret (no changes)

If your local file is identical to the remote version:

```
ℹ No changes detected. Remote is already up to date.
```

## Secret Naming

All secrets are prefixed with the configured prefix (default: `envhub-`) to avoid namespace pollution in your cloud provider. So `my-app-dev` becomes `envhub-my-app-dev` in AWS Secrets Manager.

## Version Conflict

If someone else has pushed a newer version since your last pull, you'll see:

```
⚠ Remote version (5) is newer than your local version (3).
  Run 'envhub pull' first to get the latest changes, or use --force to overwrite.

? Do you want to force push anyway? (y/N)
```

See [Version Control](../getting-started/version-control.md) for details.
