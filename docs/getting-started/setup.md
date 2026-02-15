# Setup (envhub init)

The `envhub init` command walks you through an interactive wizard that configures everything you need. This is one of the key improvements over similar tools — no manual config file editing required.

## Prerequisites

Before running the wizard, make sure you have an AWS profile configured. If you don't have one yet, see [Creating an AWS Profile](#creating-an-aws-profile) below.

## Running the Wizard

```bash
npx envhub init
```

The wizard will guide you through the following steps:

### Step 1: Select a Provider

```
? Which cloud provider would you like to use?
> AWS Secrets Manager
  Azure Key Vault (coming soon)
  GCP Secret Manager (coming soon)
```

Currently only AWS Secrets Manager is available. More providers will be added in future releases.

### Step 2: Select Your AWS Profile

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

### Step 3: Select a Region

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
  Provider:    aws
  AWS Profile: my-profile
  AWS Region:  eu-central-1

  Next steps:
    Push a secret:  envhub push <name> <file>
    Pull a secret:  envhub pull <name> <file>
    List secrets:   envhub list
```

## No More `export AWS_PROFILE`

Unlike other tools that require you to run `export AWS_PROFILE=...` in every new terminal session, envhub stores the profile name in `.envhubrc.json` and loads it automatically. One less thing to remember.

## Re-running init

If you already have a `.envhubrc.json`, running `envhub init` again will ask you whether you want to overwrite it. Your secret tracking data (versions) will be lost if you overwrite.

---

## Creating an AWS Profile

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
