# envhub Documentation

**envhub** is a CLI tool that makes sharing `.env` files between developers easy and secure. Instead of sending secrets over chat messages, envhub stores them in a cloud secrets manager and lets your team push and pull environment configurations safely.

## Why envhub?

- No more sending API keys over Teams or Slack
- Built-in version control prevents accidental overwrites
- Easy interactive setup — no manual config files needed
- Extensible provider architecture (AWS today, Azure & GCP coming soon)

## Table of Contents

### Getting Started

1. [Installation](getting-started/installation.md)
2. [Setup (envhub init)](getting-started/setup.md)
3. [Your First Secret](getting-started/first-secret.md)
4. [Version Control](getting-started/version-control.md)

### Commands

| Command | Description |
| --- | --- |
| [push](commands/push.md) | Push a local .env file to the cloud |
| [pull](commands/pull.md) | Pull the latest .env file from the cloud |
| [cat](commands/cat.md) | Display the contents of a secret |
| [list](commands/list.md) | List all managed secrets |
| [delete](commands/delete.md) | Delete a secret |
| [grant](commands/grant.md) | Grant a user access to a secret |
| [revoke](commands/revoke.md) | Revoke a user's access to a secret |

### Architecture

- [Configuration (.envhubrc.json)](architecture/configuration.md)
- [Provider Architecture](architecture/providers.md)

## Quick Example

```bash
# 1. Set up your project
npx envhub init

# 2. Push your .env file
npx envhub push my-app-dev ./.env -m "Initial setup"

# 3. Your teammate pulls it
npx envhub pull my-app-dev ./.env

# 4. Grant access to another developer
npx envhub grant my-app-dev jane.doe
```

## Supported Providers

| Provider | Status |
| --- | --- |
| AWS Secrets Manager | Available |
| Azure Key Vault | Planned |
| GCP Secret Manager | Planned |
