# envhub cat

Display the full contents of a secret without writing anything to disk. Useful for quickly inspecting what's stored in a secret before pulling.

## Usage

```bash
envhub cat <name>
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret to display (e.g. `my-app-dev`) |

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

## Notes

- The full content is printed to stdout, unmasked. Be careful when running this in shared environments or screen-sharing sessions.
- This command does **not** modify your local `.env` file or update version tracking.
- You can pipe the output to other commands, e.g. `npx envhub cat my-app-dev | grep STRIPE`.
