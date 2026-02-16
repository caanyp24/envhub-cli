# Configuration (.envhubrc.json)

envhub uses a JSON configuration file called `.envhubrc.json` in your project root. It is created by `envhub init` and should **not** be committed to version control (it's automatically added to `.gitignore`).

## File Location

envhub searches for the configuration file starting from the current working directory and walking up the directory tree. This means you can run envhub commands from any subdirectory of your project.

The following filenames are recognized:

- `.envhubrc.json` (recommended)
- `.envhubrc`

## Full Schema

```json
{
  "provider": "azure",
  "prefix": "envhub-",
  "azure": {
    "vaultUrl": "https://my-vault.vault.azure.net"
  },
  "secrets": {
    "my-app-dev": {
      "version": 5,
      "file": "./.env",
      "lastPulled": "2026-02-15T10:30:00.000Z"
    },
    "my-app-staging": {
      "version": 2,
      "file": "./.env.staging",
      "lastPulled": "2026-02-14T16:00:00.000Z"
    }
  }
}
```

## Fields

### Root Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | `string` | Yes | Cloud provider to use. Available: `"aws"`, `"azure"`. Planned: `"gcp"` |
| `prefix` | `string` | Yes | Prefix for secret names in the cloud provider. Default: `"envhub-"` |
| `aws` | `object` | When provider is `"aws"` | AWS-specific configuration |
| `azure` | `object` | When provider is `"azure"` | Azure-specific configuration |
| `gcp` | `object` | When provider is `"gcp"` | GCP-specific configuration (future) |
| `secrets` | `object` | Yes | Map of tracked secrets with version info |

### AWS Configuration

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `aws.profile` | `string` | Yes | AWS CLI profile name (from `~/.aws/credentials`) |
| `aws.region` | `string` | Yes | AWS region (e.g. `"eu-central-1"`) |

### Azure Configuration

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `azure.vaultUrl` | `string` | Yes | Azure Key Vault URL (e.g. `"https://my-vault.vault.azure.net"`) |

### Secret Tracking

Each key in the `secrets` object is a secret name. The value contains:

| Field | Type | Description |
| --- | --- | --- |
| `version` | `number` | Last known version number (updated on push/pull) |
| `file` | `string` | Path to the associated local `.env` file |
| `lastPulled` | `string` | ISO 8601 timestamp of the last pull operation |

## Validation

envhub validates the configuration on every command. If the config is invalid, you'll see a clear error message:

```
✖ Invalid configuration in /path/to/.envhubrc.json:
  - 'aws.region' is required.
```

## Why Not Commit This File?

The `.envhubrc.json` file contains:

- Cloud provider metadata (e.g. AWS profile name or Azure vault URL)
- Version tracking data that is specific to your local environment

Each developer should run `envhub init` once to create their own local config. The secrets themselves are shared through the cloud provider, not through the config file.
