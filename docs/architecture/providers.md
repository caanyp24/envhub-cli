# Provider Architecture

envhub is designed with a pluggable provider architecture. Each cloud backend is implemented as a separate provider class that conforms to a shared interface. This makes it straightforward to add support for new cloud services.

## Overview

```
                   ┌─────────────────────┐
                   │    CLI Commands     │
                   │  (push, pull, etc.) │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │  SecretProvider     │
                   │    (Interface)      │
                   └──────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌──────────▼─────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │ AWS Secrets    │ │ Azure Key   │ │ GCP Secret  │
    │ Manager        │ │ Vault       │ │ Manager     │
    │ (implemented)  │ │             │ │ (planned)   │
    └────────────────┘ └─────────────┘ └─────────────┘
```

All commands interact with the `SecretProvider` interface, never directly with a specific cloud SDK. The `ProviderFactory` creates the correct provider instance based on the configuration.

## The SecretProvider Interface

Every provider must implement these methods:

```typescript
interface SecretProvider {
  readonly name: string;

  // Core operations
  push(secretName: string, content: string, options?: PushOptions): Promise<PushResult>;
  pull(secretName: string): Promise<PullResult>;
  cat(secretName: string): Promise<string>;
  list(): Promise<SecretListItem[]>;
  delete(secretName: string, options?: DeleteOptions): Promise<void>;

  // Access control
  grant(secretName: string, userIdentifier: string): Promise<void>;
  revoke(secretName: string, userIdentifier: string): Promise<void>;

  // Versioning
  getVersion(secretName: string): Promise<number>;
}
```

### Data Types

**PushOptions**

```typescript
interface PushOptions {
  message?: string;   // Commit-style message
  force?: boolean;     // Bypass version checking
}
```

**PushResult**

```typescript
interface PushResult {
  version: number;     // New version number
  name: string;        // Secret name
}
```

**PullResult**

```typescript
interface PullResult {
  content: string;     // The .env file content
  version: number;     // Version number
  name: string;        // Secret name
}
```

**SecretListItem**

```typescript
interface SecretListItem {
  name: string;            // Secret name (without prefix)
  secretsCount: number;    // Number of key-value pairs
  updatedAt: Date | null;  // Last modified timestamp
  lastMessage: string | null; // Last push message
}
```

## AWS Secrets Manager Provider

The current implementation (`src/providers/aws/aws-secrets.provider.ts`) stores each secret as a JSON payload in AWS Secrets Manager:

```json
{
  "content": "DATABASE_URL=postgres://...\nAPI_KEY=abc123\n",
  "metadata": {
    "version": 5,
    "message": "Added Redis config",
    "updatedAt": "2026-02-15T10:30:00.000Z",
    "managedBy": "envhub-cli"
  }
}
```

The `content` field holds the raw `.env` file text. The `metadata` field stores version information and the optional push message.

### Secret Naming

All secrets are prefixed to avoid collisions with other secrets in the same AWS account:

```
envhub-my-app-dev       ← stored in AWS
       └── my-app-dev   ← what you see in envhub
```

### Access Control

The AWS provider uses **resource-based policies** on secrets to control access. Each secret can have a policy with an `EnvhubAccess` statement listing the IAM ARNs that are allowed to read the secret.

## Azure Key Vault Provider

The Azure implementation (`src/providers/azure/azure-key-vault.provider.ts`) stores the same envhub JSON payload format used by AWS.

Authentication is handled through `DefaultAzureCredential`, so local development works well with `az login` or `AZURE_*` environment variables.

### Secret Naming

Azure Key Vault restricts secret names to letters, numbers, and `-` (max length 127). envhub validates the prefixed secret name before writing.

### Deletion Behavior

`envhub delete` performs a standard Key Vault delete.  
`envhub delete --force` also attempts a purge; this can fail if purge protection is enabled.

### Access Control Note

`grant` and `revoke` are currently implemented for AWS only.  
For Azure, manage permissions via Azure RBAC / access policies.

## Adding a New Provider

To add support for a new cloud provider (e.g. Azure Key Vault):

### Step 1: Create the Provider Class

Create a new file for the provider implementation:

```typescript
import type { SecretProvider, PushOptions, PushResult, PullResult, SecretListItem, DeleteOptions } from "../provider.interface.js";
import type { AzureConfig } from "../../config/config.schema.js";

export class AzureKeyVaultProvider implements SecretProvider {
  readonly name = "azure";

  constructor(config: AzureConfig, prefix: string) {
    // Initialize Azure SDK client
  }

  async push(secretName: string, content: string, options?: PushOptions): Promise<PushResult> {
    // Implementation
  }

  async pull(secretName: string): Promise<PullResult> {
    // Implementation
  }

  // ... implement all other interface methods
}
```

### Step 2: Register in the Factory

Add the new provider in `src/providers/provider.factory.ts`:

```typescript
case "azure":
  if (!config.azure) {
    throw new Error("Azure configuration is missing. Run 'envhub init' first.");
  }
  return new AzureKeyVaultProvider(config.azure, config.prefix);
```

Update the available providers list:

```typescript
{ type: "azure", label: "Azure Key Vault", available: true },
```

### Step 3: Add Config Schema

Add the Azure-specific config fields in `src/config/config.schema.ts` (the interface already exists as a placeholder):

```typescript
export interface AzureConfig {
  vaultUrl: string;
  // Add more fields as needed
}
```

### Step 4: Update the Init Wizard

Add Azure-specific prompts in `src/commands/init.ts` for the setup wizard.

### Step 5: Install Dependencies

Add the Azure SDK to `package.json`:

```bash
npm install @azure/keyvault-secrets @azure/identity
```

That's it. All commands (push, pull, cat, list, etc.) will work automatically with the new provider because they use the `SecretProvider` interface.

## File Structure

```
src/providers/
  provider.interface.ts         ← Shared interface + data types
  provider.factory.ts           ← Creates provider instances
  aws/
    aws-secrets.provider.ts     ← AWS implementation
  azure/
    azure-key-vault.provider.ts ← Azure implementation
  gcp/                          ← (future)
    gcp-secrets.provider.ts
```
