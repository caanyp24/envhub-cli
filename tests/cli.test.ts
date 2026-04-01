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
});
