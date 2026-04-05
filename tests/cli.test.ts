import { describe, it, expect } from "vitest";
import { createProgram } from "../src/cli.js";

describe("CLI", () => {
  it("should register the doctor command", () => {
    const program = createProgram();
    const doctor = program.commands.find((cmd) => cmd.name() === "doctor");

    expect(doctor).toBeDefined();
    expect(doctor?.description()).toContain("health checks");
  });

  it("should register --json option for doctor", () => {
    const program = createProgram();
    const doctor = program.commands.find((cmd) => cmd.name() === "doctor");

    const hasJsonOption =
      doctor?.options.some((option) => option.long === "--json") ?? false;

    expect(hasJsonOption).toBe(true);
  });

  it("should register --dry-run option for pull", () => {
    const program = createProgram();
    const pull = program.commands.find((cmd) => cmd.name() === "pull");

    const hasDryRunOption =
      pull?.options.some((option) => option.long === "--dry-run") ?? false;

    expect(hasDryRunOption).toBe(true);
  });

  it("should register --backup option for pull", () => {
    const program = createProgram();
    const pull = program.commands.find((cmd) => cmd.name() === "pull");

    const hasBackupOption =
      pull?.options.some((option) => option.long === "--backup") ?? false;

    expect(hasBackupOption).toBe(true);
  });

  it("should require name/file arguments for pull", () => {
    const program = createProgram();
    const pull = program.commands.find((cmd) => cmd.name() === "pull");

    const requiredFlags = pull?.registeredArguments.map((arg) => arg.required) ?? [];
    expect(requiredFlags).toEqual([true, true]);
  });
});
