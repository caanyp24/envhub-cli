# envhub-cli

Securely share `.env` files between developers using cloud providers.

envhub stores your `.env` files in a cloud secrets manager (AWS Secrets Manager, with Azure Key Vault and GCP Secret Manager coming soon) so your team can safely push and pull environment configurations without sending them over chat messages.

## Features

- **Easy setup** — Interactive `envhub init` wizard configures everything
- **Version control** — Automatic conflict detection prevents overwriting newer changes
- **Provider architecture** — Extensible design for multiple cloud backends
- **Access control** — Grant and revoke access to individual secrets per user
- **Diff preview** — Review changes before overwriting your local `.env` file

## Installation

```bash
# NPM
npm install --save-dev envhub-cli

# Yarn
yarn add -D envhub-cli
```

## Quick Start

### 1. Initialize your project

```bash
npx envhub init
```

The interactive wizard will:
- Ask you to select a cloud provider (AWS Secrets Manager)
- Detect your available AWS profiles from `~/.aws/credentials`
- Configure the AWS region
- Create a `.envhubrc.json` config file
- Add it to `.gitignore`

### 2. Push a secret

```bash
npx envhub push my-project-dev ./.env
```

Optionally add a message:

```bash
npx envhub push my-project-dev ./.env -m "Added Stripe API keys"
```

### 3. Pull a secret

```bash
npx envhub pull my-project-dev ./.env
```

If there are changes, you'll see a diff and be asked to confirm before overwriting.

### 4. Share with your team

```bash
# Grant access to a teammate
npx envhub grant my-project-dev john.doe

# Revoke access
npx envhub revoke my-project-dev john.doe
```

## Commands

| Command | Description |
| --- | --- |
| `envhub init` | Interactive setup wizard |
| `envhub push <name> <file>` | Push a .env file to the cloud |
| `envhub pull <name> <file>` | Pull a .env file from the cloud |
| `envhub cat <name>` | Display secret contents |
| `envhub list` | List all managed secrets |
| `envhub delete <name>` | Delete a secret |
| `envhub grant <name> <user>` | Grant user access to a secret |
| `envhub revoke <name> <user>` | Revoke user access to a secret |

### Push Options

- `-m, --message <msg>` — Attach a message to this version (like a commit message)
- `-f, --force` — Skip version conflict checking

### Pull Options

- `-f, --force` — Overwrite local file without confirmation

### Delete Options

- `-f, --force` — Force immediate deletion (no recovery period)

## Configuration

envhub stores its configuration in `.envhubrc.json` in your project root:

```json
{
  "provider": "aws",
  "prefix": "envhub-",
  "aws": {
    "profile": "my-profile",
    "region": "eu-central-1"
  },
  "secrets": {
    "my-project-dev": {
      "version": 5,
      "file": ".env",
      "lastPulled": "2026-02-15T10:00:00Z"
    }
  }
}
```

The `secrets` section is automatically updated during push/pull operations to track versions locally.

## Version Control

envhub tracks secret versions to prevent accidental overwrites:

- **On push**: Checks if your local version matches the remote version. If someone else pushed a newer version, you'll be warned to pull first.
- **On pull**: Updates the local version number in `.envhubrc.json`.
- **Force flag**: Use `--force` to bypass version checks when you know what you're doing.

## Prerequisites

- **Node.js** >= 18.0.0
- **AWS CLI** configured with at least one profile (`~/.aws/credentials`)
- Appropriate IAM permissions for AWS Secrets Manager

## Supported Providers

| Provider | Status |
| --- | --- |
| AWS Secrets Manager | Available |
| Azure Key Vault | Coming soon |
| GCP Secret Manager | Coming soon |

## License

MIT
