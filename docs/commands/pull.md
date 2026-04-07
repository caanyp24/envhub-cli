# envhub pull

Pull the latest version of a secret from the cloud provider and write it to a local `.env` file.

## Usage

```bash
envhub pull <name> <file>
envhub pull <name> <file> --dry-run
envhub pull <name> <file> --backup
```

## Options

| Option | Description |
| --- | --- |
| `--dry-run` | Show local-vs-remote diff and version check without writing the local file |
| `--backup` | Create `<file>.bak` before overwriting the local file |

`--dry-run` and `--backup` are mutually exclusive and cannot be used together.

## Arguments

| Argument | Description |
| --- | --- |
| `name` | The name of the secret to pull (e.g. `my-app-dev`) |
| `file` | Path where the `.env` file should be written (e.g. `./.env`) |

Both `name` and `file` are required for normal pull and for `--dry-run`.

## Examples

### Pull a secret

```bash
npx envhub pull my-app-dev ./.env
```

### Preview before pulling

```bash
npx envhub pull my-app-dev ./.env --dry-run
```

### Pull with automatic backup

```bash
npx envhub pull my-app-dev ./.env --backup
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

### Dry-Run Output

When `--dry-run` is used, envhub renders a preview (no file write):

```text
◇  Dry Run Pull Preview
│  Environment: my-app-dev
│  Version: local=v4, remote=v5 (remote ahead)
│
│  Changes if pulled:
│
◇  ADDED (1)
│  + NEW_KEY
│    local : -
│    remote: some-value
│
1 added, 0 changed, 0 removed
ℹ Dry-run only compares ./.env with remote; no changes were applied.
```

If nothing changed:

```text
ℹ No changes detected. Local file is already up to date.
ℹ Dry-run only compares ./.env with remote; no changes were applied.
```

## Notes

- Pull always overwrites the local file without asking for confirmation. Pulling is a conscious action.
- Use `--backup` if you want automatic protection before overwrite (`<file>.bak`).
- Use `envhub cat <name>` to inspect a secret before pulling if needed.
- Comment lines are pulled together with key/value entries because they are stored as part of the secret content.
- Pulled values are written as stored in the secret (no forced quote normalization).
- `--dry-run` does not modify local files and does not update version tracking.
- `--dry-run` requires an envhub header in the local file to keep environment safety checks intact.
- `--backup` is only applied during a real pull write; with `--dry-run`, no backup file is created.
- Existing backup files are overwritten (for example `./.env.bak`).
- Using `--dry-run` together with `--backup` returns an option conflict error.
