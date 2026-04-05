# envhub cat

Display the full contents of a secret without writing anything to disk. Useful for quickly inspecting what's stored in a secret before pulling.

## Usage

```bash
envhub cat <name> [--masked]
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret to display (e.g. `my-app-dev`) |

## Options

| Option | Description |
| --- | --- |
| `--masked` | Mask values in output (`first 3 chars + "•••"`). |

## Example

```bash
npx envhub cat my-app-dev
```

**Output:**

```
DATABASE_URL=postgres://user:pass@db.example.com:5432/mydb
STRIPE_API_KEY=sk_test_abc123def456
REDIS_URL=redis://cache.example.com:6379
APP_SECRET=my-super-secret-key
```

## Example (masked)

```bash
npx envhub cat my-app-dev --masked
```

**Output:**

```
DATABASE_URL=pos•••
STRIPE_API_KEY=sk_•••
REDIS_URL=red•••
APP_SECRET=my-•••
```

## Notes

- By default, the full content is printed to stdout, unmasked. Be careful when running this in shared environments or screen-sharing sessions.
- Use `--masked` to hide values in output (`first 3 chars + "•••"`; values with 3 or fewer chars become `•••`).
- This command does **not** modify your local `.env` file or update version tracking.
- You can pipe the output to other commands, e.g. `npx envhub cat my-app-dev | grep STRIPE`.
