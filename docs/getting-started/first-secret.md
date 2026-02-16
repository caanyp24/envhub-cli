# Your First Secret

After [installing envhub](installation.md) and running [envhub init](setup.md), you're ready to push your first secret to the cloud.

## Example Scenario

Let's say you have a `.env` file in your project:

```ini
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
STRIPE_API_KEY=sk_test_abc123def456
REDIS_URL=redis://localhost:6379
APP_SECRET=my-super-secret-key
```

You want to share this with your team without sending it over Slack or Teams.

## Push the Secret

```bash
npx envhub push my-app-dev ./.env
```

envhub shows you what will be created and asks for confirmation:

```
  New secret with 4 entries:
    + DATABASE_URL=pos***
    + STRIPE_API_KEY=sk_***
    + REDIS_URL=red***
    + APP_SECRET=my-***

? Create new secret 'my-app-dev'? (Y/n)

✔ Pushed 'my-app-dev' (v1) to aws.
```

You can also add a message describing what changed:

```bash
npx envhub push my-app-dev ./.env -m "Added Stripe and Redis config"
```

On subsequent pushes, envhub shows a diff of what changed compared to the remote version:

```bash
npx envhub push my-app-dev ./.env -m "Updated Redis URL"
```

```
Changes to push:
  Changed (1):
    ~ REDIS_URL

? Push these changes? (Y/n)

✔ Pushed 'my-app-dev' (v2) to aws.
  Message: Updated Redis URL
```

If you are using Azure, the provider in the success output will be `azure`.

If nothing changed, envhub lets you know:

```
ℹ No changes detected. Remote is already up to date.
```

## Pull the Secret

Your teammate can now pull the `.env` file:

```bash
npx envhub pull my-app-dev ./.env
```

```
✔ Pulled 'my-app-dev' (v1) → ./.env (4 keys)
```

## Verify the Contents

To quickly check what's stored in a secret without writing to disk:

```bash
npx envhub cat my-app-dev
```

This prints the full `.env` content to the terminal.

## Multiple Environments

You can manage multiple environments by using different secret names:

```bash
# Development
npx envhub push my-app-dev ./.env

# Staging
npx envhub push my-app-staging ./.env.staging

# Production
npx envhub push my-app-prod ./.env.production
```

Each one is tracked independently in your `.envhubrc.json`:

```json
{
  "secrets": {
    "my-app-dev": { "version": 3, "file": "./.env" },
    "my-app-staging": { "version": 1, "file": "./.env.staging" },
    "my-app-prod": { "version": 7, "file": "./.env.production" }
  }
}
```

## What's Next?

- Learn about [Version Control](version-control.md) to understand conflict detection
- See all available [Commands](../commands/push.md)
- [Grant access](../commands/grant.md) to your teammates
