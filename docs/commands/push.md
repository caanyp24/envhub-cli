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
npx envhub push my-app-dev ./.env --force
```

## What Happens

### New Secret (first push)

envhub shows all entries that will be created and asks for confirmation:

```text
  New secret with 4 entries:
    + DATABASE_URL=postgres://user:pass@db.example.com:5432/mydb
    + STRIPE_API_KEY=sk_test_example_key_123
    + REDIS_URL=redis://localhost:6379
    + APP_SECRET=my_super_secret_value

? Create new secret 'my-app-dev'? (Y/n)

✔ Pushed 'my-app-dev' (v1) to aws.
```

### Existing Secret (changes detected)

envhub compares your local file with the remote version and shows a diff:

```text
◇  Changes to push
│  Environment: my-app-dev
│  File: ./.env
│
◇  ADDED (1)
│
│ + SENTRY_DSN
│   local : https://example.ingest.sentry.io/123
│
◇  CHANGED (1)
│
│ ~ DATABASE_URL
│   local : postgres://user:pass@new-host:5432/mydb
│   remote: postgres://user:pass@old-host:5432/mydb
│
◇  REMOVED (1)
│
│ - OLD_KEY
│   remote: legacy-value
│
1 added, 1 changed, 1 removed

? Push these changes? (Y/n)

✔ Pushed 'my-app-dev' (v2) to aws.
  Message: Updated database and added Sentry
```

### Existing Secret (no changes)

If your local file is identical to the remote version:

```text
ℹ No changes detected. Remote is already up to date.
```

## Secret Naming

All secrets are prefixed with the configured prefix (default: `envhub-`) to avoid namespace pollution in your cloud provider. So `my-app-dev` becomes `envhub-my-app-dev` in AWS Secrets Manager, Azure Key Vault and GCP.

## Version Conflict

If someone else has pushed a newer version since your last pull, you'll see:

```text
⚠ Remote version (5) is newer than your local version (3).
  Run 'envhub pull' first to get the latest changes, or use --force to overwrite.
ℹ Push cancelled.
```

See [Version Control](../getting-started/version-control.md) for details.

## Environment Header Safety Check

By default, push expects an envhub-managed header in your local file:

```txt
# 🔐 Managed by envhub-cli
# Environment: <secret-name>
```

Do not manually remove or edit these top header comment lines. They are used by envhub to prevent environment mismatches; without them, safe mismatch detection cannot be guaranteed.

If the header is missing, push is blocked:

```txt
✖ Missing envhub header in local file.
ℹ Run 'envhub pull my-app-dev ./.env' first to regenerate the header, or use --force to override.
```

If the header exists but the environment does not match the target secret, push is blocked for existing secrets:

```txt
✖ Environment mismatch: file header is 'my-app-dev', but you are pushing to 'my-app-prod'.
ℹ Run 'envhub pull my-app-dev ./.env' first, or use --force to override.
```

For a brand-new secret, push proceeds through the normal "Create new secret?" confirmation and then updates the local file header to the pushed environment name.
This helps prevent accidentally pushing the wrong environment file while still allowing intentional creation of new environments.

## Comments in `.env`

Comment lines (such as `# Database`) are stored as part of secret content and are preserved on pull.
Diff detection is key/value-based, so changing only comments may still show "No changes detected."
Use `--force` to push comment-only edits.
