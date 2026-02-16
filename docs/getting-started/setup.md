# Setup (envhub init)

The `envhub init` command walks you through an interactive wizard that configures everything you need — no manual config file editing required.

## Prerequisites

Before running the wizard, prepare the provider you want to use:

- AWS: See [AWS Prerequisites](#aws-prerequisites)
- Azure: See [Azure Prerequisites](#azure-prerequisites)

## Running the Wizard

```bash
npx envhub init
```

The wizard will guide you through the following steps:

### Step 1: Select a Provider

```
? Which cloud provider would you like to use?
> AWS Secrets Manager
  Azure Key Vault
  GCP Secret Manager (coming soon)
```

AWS and Azure are available. GCP is planned.

### Step 2: Provider-Specific Configuration

#### AWS Flow: Select Your AWS Profile

envhub automatically detects all AWS profiles from your `~/.aws/credentials` and `~/.aws/config` files:

```
? Select your AWS profile:
> default (eu-central-1)
  staging (eu-west-1)
  production
  Enter a different profile name...
```

Profiles with a region configured in `~/.aws/config` show the region in parentheses.

If no profiles are found, you can enter a profile name manually.

#### AWS Flow: Select a Region

If the selected profile has a region configured in `~/.aws/config`, envhub will suggest using it:

```
? Use region 'eu-central-1' from your AWS profile? (Y/n)
```

If you accept, that region is used — no further selection needed.

If you decline (or the profile has no region configured), you can pick from a list:

```
? Select a different AWS region:
  EU (Frankfurt) - eu-central-1
> EU (Ireland) - eu-west-1
  EU (London) - eu-west-2
  US East (N. Virginia) - us-east-1
  ...
  Enter a custom region...
```

#### Azure Flow: Enter Your Key Vault URL

If you choose Azure, envhub asks for your Key Vault URL:

```
? Enter your Azure Key Vault URL: (https://my-vault.vault.azure.net)
```

Use your vault URI in this format:

`https://<vault-name>.vault.azure.net`

envhub validates the URL and stores it in `.envhubrc.json`.

### Step 4: Configure Prefix

All secrets in the cloud provider are prefixed to avoid namespace collisions. The default prefix is `envhub-`.

```
? Use default secret prefix "envhub-"? (Y/n)
```

### Result

After completing the wizard, envhub will:

1. Create a `.envhubrc.json` configuration file in your project root
2. Add `.envhubrc.json` to your `.gitignore` (if it exists)

```
✔ Configuration created.
✔ Added .envhubrc.json to .gitignore

✔ envhub is ready to use!

  Config file: /path/to/your/project/.envhubrc.json
  Provider:    azure
  Vault URL:   https://my-vault.vault.azure.net

  Next steps:
    Push a secret:  envhub push <name> <file>
    Pull a secret:  envhub pull <name> <file>
    List secrets:   envhub list
```

## Re-running init

If you already have a `.envhubrc.json`, running `envhub init` again will ask you whether you want to overwrite it. Your secret tracking data (versions) will be lost if you overwrite.

---

## AWS Prerequisites

If you don't have an AWS profile yet, follow these steps:

### 1. Install the AWS CLI

Follow the [official AWS CLI install instructions](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) for your operating system.

### 2. Create the Config Files

In your home directory, find or create the `~/.aws` folder with two files:

**~/.aws/config**

```ini
[profile my-profile]
region=eu-central-1
```

**~/.aws/credentials**

```ini
[my-profile]
aws_access_key_id=YOUR_ACCESS_KEY
aws_secret_access_key=YOUR_SECRET_KEY
```

### 3. Get Your Access Keys

1. Log into the [AWS Console](https://console.aws.amazon.com/)
2. Click your username in the top right corner
3. Choose **Security credentials**
4. Under **Access keys**, click **Create access key**
5. Select **Command Line Interface (CLI)**
6. Save both the **Access key** and **Secret access key**

### 4. Done

The `envhub init` wizard will now detect your profile automatically.

---

## Azure Prerequisites

To use Azure Key Vault with envhub, configure these items once.

### 1. Install and Sign In to Azure CLI

Install Azure CLI:

https://learn.microsoft.com/cli/azure/install-azure-cli

Sign in:

```bash
az login
az account show
```

### 2. Create a Resource Group and Key Vault

Example:

```bash
az group create -n rg-envhub-dev -l westeurope

az keyvault create \
  -n myapp-prod \
  -g rg-envhub-dev \
  -l westeurope \
  --enable-rbac-authorization true
```

Get your vault URL:

```bash
az keyvault show -n myapp-prod -g rg-envhub-dev --query properties.vaultUri -o tsv
```

### 3. Grant Yourself Key Vault Permissions (RBAC)

In the Azure portal:

1. Open your Key Vault
2. Go to **Access control (IAM)**
3. **Add** -> **Add role assignment**
4. Select role **Key Vault Administrator**
5. Assign it to your user

Wait a few minutes for role propagation.

### 4. Run envhub init With Azure

```bash
npx envhub init
```

Choose **Azure Key Vault** and paste the vault URL from step 2.
