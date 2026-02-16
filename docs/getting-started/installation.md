# Installation

## Requirements

- **Node.js** >= 18.0.0
- One supported cloud provider configured:
  - **AWS Secrets Manager**: AWS CLI + configured profile
  - **Azure Key Vault**: Azure CLI + signed-in account

## Install via npm

```bash
npm install --save-dev envhub-cli
```

## Install via Yarn

```bash
yarn add -D envhub-cli
```

## Global Installation

If you want to use envhub across multiple projects without installing it per project:

```bash
npm install -g envhub-cli
```

After a global install you can run `envhub` directly instead of `npx envhub`.

## Verify Installation

```bash
npx envhub --version
```

This should output the current version number (e.g. `0.1.0`).

## What's Next?

After installing envhub, run the interactive setup wizard to configure your project:

```bash
npx envhub init
```

See the [Setup Guide](setup.md) for provider-specific steps (AWS and Azure).
