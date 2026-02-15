# envhub delete

Delete a secret from the cloud provider.

## Usage

```bash
envhub delete <name> [options]
```

**Alias:**

```bash
envhub rm <name> [options]
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret to delete (e.g. `my-app-dev`) |

## Options

| Option | Description |
| --- | --- |
| `-f, --force` | Force immediate deletion without a recovery period |

## Examples

### Standard deletion (with confirmation)

```bash
npx envhub delete my-app-dev
```

```
? Are you sure you want to delete 'my-app-dev'? This action cannot be undone. (y/N)
```

### Force deletion

```bash
npx envhub delete my-app-dev --force
```

## Behavior

### Without `--force`

AWS Secrets Manager schedules the secret for deletion with a recovery window (typically 7–30 days). During this period, the secret can still be recovered through the AWS console.

### With `--force`

The secret is deleted immediately with no recovery period. This is irreversible.

## Local Cleanup

After deletion, envhub automatically removes the secret from the `secrets` section in your `.envhubrc.json`. Your local `.env` file is **not** deleted.
