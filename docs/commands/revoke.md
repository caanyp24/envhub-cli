# envhub revoke

Revoke a user's access to a specific secret. The user will no longer be able to pull or read the secret.

## Usage

```bash
envhub revoke <name> <user>
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret (e.g. `my-app-dev`) |
| `user` | IAM username or full ARN of the user to revoke access from |

## Examples

### Revoke by username

```bash
npx envhub revoke my-app-dev jane.doe
```

### Revoke by ARN

```bash
npx envhub revoke my-app-dev arn:aws:iam::123456789012:user/jane.doe
```

## How It Works

1. envhub resolves the username to a full IAM ARN (if a username was provided)
2. It reads the current resource policy on the secret
3. It removes the user's ARN from the `EnvhubAccess` policy statement
4. If no users remain in the statement, the entire statement is removed
5. The updated policy is saved back to the secret

## Error Cases

| Scenario | Error |
| --- | --- |
| No policy exists on the secret | `No access policy found for secret` |
| User doesn't have access | `User does not have access to secret` |
| User can't be resolved | `Failed to resolve user` |

## Important

Users with higher IAM privileges (e.g. AWS administrators) may still be able to access the secret even after their envhub access is revoked. This only controls the resource-based policy managed by envhub.

## See Also

- [grant](grant.md) — Grant a user access
