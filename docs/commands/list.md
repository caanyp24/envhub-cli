# envhub list

List all secrets managed by envhub that your current cloud provider profile has access to.

## Usage

```bash
envhub list
```

**Alias:**

```bash
envhub ls
```

## Example

```bash
npx envhub list
```

**Output:**

```
Name                            Secrets     Updated                 Message
──────────────────────────────────────────────────────────────────────────────────────────
my-app-dev                      8           15.02.2026, 10:30       Added Redis config
my-app-staging                  6           14.02.2026, 16:45       Initial setup
api-keys-prod                   3           10.02.2026, 09:00       —

  3 secret(s) found.
```

## Columns

| Column | Description |
| --- | --- |
| **Name** | The secret name (without the provider prefix) |
| **Secrets** | Number of key-value pairs in the `.env` content |
| **Updated** | When the secret was last modified |
| **Message** | The message from the last push (if provided with `-m`) |

## Notes

- Only secrets with the configured prefix (default: `envhub-`) are shown. Other secrets in your cloud provider account are ignored.
- The command fetches each secret's content to count the number of keys and read the last message. This may take a moment if you have many secrets.
