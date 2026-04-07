# ENVHUB CLI

Share `.env` files in your team without sharing secrets in chat.

`envhub` is a developer-first CLI that syncs environment files through your existing cloud secrets manager (AWS, Azure, or GCP), with version history and safer collaboration flows.

## The Problem

Most teams still pass secrets around in Slack/Teams, copy keys between machines, and overwrite each other’s `.env` files.

This creates:
- Security risk from accidental secret exposure
- Slow onboarding for new developers
- Broken local setups from outdated variables
- No clear audit trail of who changed what

## Why ENVHUB

- Keep secrets in your own cloud provider instead of chat messages
- Push/pull `.env` files in seconds with one CLI workflow
- Use built-in versioning to reduce accidental overwrites
- Onboard teammates faster with the interactive `init` wizard
- Work with AWS Secrets Manager, Azure Key Vault, or GCP Secret Manager

## Who It Is For

- Startup teams shipping fast with multiple environments
- Freelancers/consultants managing many client projects
- Engineering teams that want less `.env` chaos and safer secret handling

## Quick Start

### 1. Install

```bash
npm install --save-dev envhub-cli
```

### 2. Initialize project

```bash
npx envhub init
```

### 3. Push your current environment

```bash
npx envhub push my-app-dev ./.env -m "Initial setup"
```

### 4. Teammate pulls the same env

```bash
npx envhub pull my-app-dev ./.env
```

## Command Overview

| Command | What it does |
| --- | --- |
| [`init`](./docs/getting-started/setup.md) | Interactive setup for provider + project config |
| [`push`](./docs/commands/push.md) | Upload local `.env` to your cloud secret store |
| [`pull`](./docs/commands/pull.md) | Download latest secret and write local `.env` |
| [`cat`](./docs/commands/cat.md) | Inspect a secret’s content |
| [`list`](./docs/commands/list.md) | See all envhub-managed secrets |
| [`delete`](./docs/commands/delete.md) | Remove a secret |
| [`grant`](./docs/commands/grant.md) | Grant user access (AWS only) |
| [`revoke`](./docs/commands/revoke.md) | Revoke user access (AWS only) |
| [`doctor`](./docs/commands/doctor.md) | Validate setup and provider access |

## Documentation

### Getting Started

1. [Installation](./docs/getting-started/installation.md)
2. [Setup (`envhub init`)](./docs/getting-started/setup.md)
3. [First Secret](./docs/getting-started/first-secret.md)
4. [Version Control](./docs/getting-started/version-control.md)

### Architecture

- [Configuration (`.envhubrc.json`)](./docs/architecture/configuration.md)
- [Provider Architecture](./docs/architecture/providers.md)

## Supported Providers

| Provider | Status |
| --- | --- |
| AWS Secrets Manager | Available |
| Azure Key Vault | Available |
| GCP Secret Manager | Available |

## Requirements

- Node.js >= 18
- One configured provider account/CLI:
  - AWS CLI for AWS Secrets Manager
  - Azure CLI for Azure Key Vault
  - Google Cloud CLI for GCP Secret Manager

## License

MIT
