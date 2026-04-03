# envhub pull

Pull the latest version of a secret from the cloud provider and write it to a local `.env` file.

## Usage

```bash
envhub pull <name> <file>
envhub pull <name> [file] --dry-run
envhub pull --dry-run
```

## Options

| Option | Description |
| --- | --- |
| `--dry-run` | Show local-vs-remote diff and version check without writing the local file |

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret to pull (e.g. `my-app-dev`) |
| `file` | Path where the `.env` file should be written (e.g. `./.env`) |

For normal pull, both `name` and `file` are required.
For `--dry-run`, `file` defaults to `./.env`, and `name` can be inferred from the local envhub header.

## Examples

### Pull a secret

```bash
npx envhub pull my-app-dev ./.env
```

### Preview before pulling

```bash
npx envhub pull my-app-dev ./.env --dry-run
```

### Preview using local header (no args)

```bash
npx envhub pull --dry-run
```

This reads `./.env`, extracts `# Environment: ...` from the envhub header, and compares local vs remote for that environment.

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
- Comment lines are pulled together with key/value entries because they are stored as part of the secret content.
- Pulled values are written with double quotes (for example `KEY="value"`).
- `--dry-run` does not modify local files and does not update version tracking.
- `--dry-run` prints the resolved environment name in the `Preview` section.
