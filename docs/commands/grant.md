# envhub grant

> AWS-only: `grant` currently works with AWS Secrets Manager resource policies.

Grant another IAM user access to a specific secret. The user will be able to pull the secret using `envhub pull`.

## Usage

```bash
envhub grant <name> <user>
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret (e.g. `my-app-dev`) |
| `user` | IAM username or full ARN of the user to grant access to |

## Examples

### Grant by username

```bash
npx envhub grant my-app-dev jane.doe
```

### Grant by ARN

```bash
npx envhub grant my-app-dev arn:aws:iam::123456789012:user/jane.doe
```

## How It Works

envhub uses AWS Secrets Manager **resource-based policies** to control access. When you grant a user access:

1. envhub resolves the username to a full IAM ARN (if a username was provided)
2. It reads the current resource policy on the secret (or creates a new one)
3. It adds the user's ARN to the `EnvhubAccess` policy statement
4. The policy is saved back to the secret

The granted user receives `secretsmanager:GetSecretValue` permission on the specific secret.

## Requirements

- You must have permission to modify the resource policy on the secret (typically the creator has this)
- The user must be in the **same AWS account**
- Users with higher IAM privileges (e.g. administrators) may already have access regardless of this policy

## See Also

- [revoke](revoke.md) — Revoke a user's access
