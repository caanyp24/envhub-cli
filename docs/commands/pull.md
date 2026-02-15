# envhub pull

Pull the latest version of a secret from the cloud provider and write it to a local `.env` file.

## Usage

```bash
envhub pull <name> <file>
```

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret to pull (e.g. `my-app-dev`) |
| `file` | Path where the `.env` file should be written (e.g. `./.env`) |

## Examples

### Pull a secret

```bash
npx envhub pull my-app-dev ./.env
```

### Switch between environments

```bash
npx envhub pull my-app-dev ./.env     # switch to dev
npx envhub pull my-app-prod ./.env    # switch to prod
npx envhub pull my-app-dev ./.env     # back to dev
```

## Output

```
✔ Pulled 'my-app-dev' (v5) → ./.env (18 keys)
```

One line. Secret name, version, file path, number of keys. That's it.

## Notes

- Pull always overwrites the local file without asking for confirmation. Pulling is a conscious action.
- Use `envhub cat <name>` to inspect a secret before pulling if needed.
