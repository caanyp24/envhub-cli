import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { catCommand } from "./commands/cat.js";
import { listCommand } from "./commands/list.js";
import { deleteCommand } from "./commands/delete.js";
import { grantCommand } from "./commands/grant.js";
import { revokeCommand } from "./commands/revoke.js";

/**
 * Create and configure the CLI program with all commands.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("envhub")
    .description(
      "Securely share .env files between developers using cloud providers."
    )
    .version("0.1.0");

  // ── init ────────────────────────────────────────────────────────

  program
    .command("init")
    .description("Set up envhub for your project (interactive wizard)")
    .action(async () => {
      await initCommand();
    });

  // ── push ────────────────────────────────────────────────────────

  program
    .command("push")
    .description("Push a local .env file to the cloud provider")
    .argument("<name>", "Name for the secret")
    .argument("<file>", "Path to the .env file")
    .option("-m, --message <message>", "A message describing this version")
    .option("-f, --force", "Bypass version conflict checking", false)
    .action(async (name: string, file: string, options) => {
      await pushCommand(name, file, options);
    });

  // ── pull ────────────────────────────────────────────────────────

  program
    .command("pull")
    .description("Pull the latest .env file from the cloud provider")
    .argument("<name>", "Name of the secret to pull")
    .argument("<file>", "Path to write the .env file to")
    .action(async (name: string, file: string) => {
      await pullCommand(name, file);
    });

  // ── cat ─────────────────────────────────────────────────────────

  program
    .command("cat")
    .description("Display the contents of a secret")
    .argument("<name>", "Name of the secret to display")
    .action(async (name: string) => {
      await catCommand(name);
    });

  // ── list ────────────────────────────────────────────────────────

  program
    .command("list")
    .alias("ls")
    .description("List all secrets managed by envhub")
    .action(async () => {
      await listCommand();
    });

  // ── delete ──────────────────────────────────────────────────────

  program
    .command("delete")
    .alias("rm")
    .description("Delete a secret from the cloud provider")
    .argument("<name>", "Name of the secret to delete")
    .option("-f, --force", "Force immediate deletion", false)
    .action(async (name: string, options) => {
      await deleteCommand(name, options);
    });

  // ── grant ───────────────────────────────────────────────────────

  program
    .command("grant")
    .description("Grant another user access to a secret")
    .argument("<name>", "Name of the secret")
    .argument("<user>", "IAM username or ARN of the user to grant access")
    .action(async (name: string, user: string) => {
      await grantCommand(name, user);
    });

  // ── revoke ──────────────────────────────────────────────────────

  program
    .command("revoke")
    .description("Revoke a user's access to a secret")
    .argument("<name>", "Name of the secret")
    .argument("<user>", "IAM username or ARN of the user to revoke access")
    .action(async (name: string, user: string) => {
      await revokeCommand(name, user);
    });

  return program;
}
