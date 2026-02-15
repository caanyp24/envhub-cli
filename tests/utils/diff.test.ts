import { describe, it, expect } from "vitest";
import {
  diffEnvContents,
  formatChanges,
  summarizeChanges,
  type EnvChange,
} from "../../src/utils/diff.js";

// ── diffEnvContents ──────────────────────────────────────────────

describe("diffEnvContents", () => {
  it("should detect added keys", () => {
    const local = "KEY1=value1";
    const remote = "KEY1=value1\nKEY2=value2";
    const changes = diffEnvContents(local, remote);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      key: "KEY2",
      type: "added",
      newValue: "value2",
    });
  });

  it("should detect removed keys", () => {
    const local = "KEY1=value1\nKEY2=value2";
    const remote = "KEY1=value1";
    const changes = diffEnvContents(local, remote);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      key: "KEY2",
      type: "removed",
      oldValue: "value2",
    });
  });

  it("should detect changed values", () => {
    const local = "KEY1=old_value";
    const remote = "KEY1=new_value";
    const changes = diffEnvContents(local, remote);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      key: "KEY1",
      type: "changed",
      oldValue: "old_value",
      newValue: "new_value",
    });
  });

  it("should detect multiple change types at once", () => {
    const local = "KEEP=same\nCHANGED=old\nREMOVED=gone";
    const remote = "KEEP=same\nCHANGED=new\nADDED=fresh";
    const changes = diffEnvContents(local, remote);

    const types = changes.map((c) => c.type).sort();
    expect(types).toEqual(["added", "changed", "removed"]);

    const added = changes.find((c) => c.type === "added");
    expect(added?.key).toBe("ADDED");
    expect(added?.newValue).toBe("fresh");

    const changed = changes.find((c) => c.type === "changed");
    expect(changed?.key).toBe("CHANGED");
    expect(changed?.oldValue).toBe("old");
    expect(changed?.newValue).toBe("new");

    const removed = changes.find((c) => c.type === "removed");
    expect(removed?.key).toBe("REMOVED");
    expect(removed?.oldValue).toBe("gone");
  });

  it("should return an empty array when there are no changes", () => {
    const content = "KEY1=value1\nKEY2=value2";
    const changes = diffEnvContents(content, content);
    expect(changes).toHaveLength(0);
  });

  it("should handle comparing with empty content", () => {
    const content = "KEY1=value1\nKEY2=value2";

    const addedChanges = diffEnvContents("", content);
    expect(addedChanges).toHaveLength(2);
    expect(addedChanges.every((c) => c.type === "added")).toBe(true);

    const removedChanges = diffEnvContents(content, "");
    expect(removedChanges).toHaveLength(2);
    expect(removedChanges.every((c) => c.type === "removed")).toBe(true);
  });

  it("should handle both sides being empty", () => {
    const changes = diffEnvContents("", "");
    expect(changes).toHaveLength(0);
  });
});

// ── formatChanges ────────────────────────────────────────────────

describe("formatChanges", () => {
  it("should return 'No changes detected.' for an empty array", () => {
    const result = formatChanges([]);
    expect(result).toBe("No changes detected.");
  });

  it("should format added entries", () => {
    const changes: EnvChange[] = [
      { key: "NEW_KEY", type: "added", newValue: "secret_value" },
    ];
    const result = formatChanges(changes);

    expect(result).toContain("Added (1)");
    expect(result).toContain("+ NEW_KEY=sec***");
  });

  it("should format removed entries", () => {
    const changes: EnvChange[] = [
      { key: "OLD_KEY", type: "removed", oldValue: "old" },
    ];
    const result = formatChanges(changes);

    expect(result).toContain("Removed (1)");
    expect(result).toContain("- OLD_KEY");
  });

  it("should format changed entries", () => {
    const changes: EnvChange[] = [
      { key: "MOD_KEY", type: "changed", oldValue: "old", newValue: "new" },
    ];
    const result = formatChanges(changes);

    expect(result).toContain("Changed (1)");
    expect(result).toContain("~ MOD_KEY");
  });

  it("should mask short values completely", () => {
    const changes: EnvChange[] = [
      { key: "SHORT", type: "added", newValue: "ab" },
    ];
    const result = formatChanges(changes);

    expect(result).toContain("+ SHORT=***");
  });

  it("should group all change types together", () => {
    const changes: EnvChange[] = [
      { key: "A", type: "added", newValue: "value_a" },
      { key: "B", type: "removed", oldValue: "value_b" },
      { key: "C", type: "changed", oldValue: "old_c", newValue: "new_c" },
    ];
    const result = formatChanges(changes);

    expect(result).toContain("Added (1)");
    expect(result).toContain("Removed (1)");
    expect(result).toContain("Changed (1)");
  });
});

// ── summarizeChanges ─────────────────────────────────────────────

describe("summarizeChanges", () => {
  it("should return 'no changes' for an empty array", () => {
    expect(summarizeChanges([])).toBe("no changes");
  });

  it("should summarize a single type", () => {
    const changes: EnvChange[] = [
      { key: "A", type: "added", newValue: "v" },
      { key: "B", type: "added", newValue: "v" },
    ];
    expect(summarizeChanges(changes)).toBe("2 added");
  });

  it("should summarize multiple types", () => {
    const changes: EnvChange[] = [
      { key: "A", type: "added", newValue: "v" },
      { key: "B", type: "removed", oldValue: "v" },
      { key: "C", type: "changed", oldValue: "old", newValue: "new" },
      { key: "D", type: "changed", oldValue: "old2", newValue: "new2" },
    ];
    expect(summarizeChanges(changes)).toBe("1 added, 1 removed, 2 changed");
  });

  it("should omit zero-count types", () => {
    const changes: EnvChange[] = [
      { key: "A", type: "removed", oldValue: "v" },
    ];
    const result = summarizeChanges(changes);
    expect(result).toBe("1 removed");
    expect(result).not.toContain("added");
    expect(result).not.toContain("changed");
  });
});
