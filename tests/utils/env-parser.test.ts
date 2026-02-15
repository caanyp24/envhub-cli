import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseEnvContent,
  serializeEnv,
  readEnvFile,
  readEnvFileRaw,
  writeEnvFile,
  writeEnvFileRaw,
  fileExists,
} from "../../src/utils/env-parser.js";

// ── parseEnvContent ──────────────────────────────────────────────

describe("parseEnvContent", () => {
  it("should parse simple key=value pairs", () => {
    const content = "KEY1=value1\nKEY2=value2";
    const result = parseEnvContent(content);

    expect(result.size).toBe(2);
    expect(result.get("KEY1")).toBe("value1");
    expect(result.get("KEY2")).toBe("value2");
  });

  it("should ignore comments", () => {
    const content = "# This is a comment\nKEY=value\n# Another comment";
    const result = parseEnvContent(content);

    expect(result.size).toBe(1);
    expect(result.get("KEY")).toBe("value");
  });

  it("should ignore blank lines", () => {
    const content = "KEY1=value1\n\n\nKEY2=value2\n";
    const result = parseEnvContent(content);

    expect(result.size).toBe(2);
    expect(result.get("KEY1")).toBe("value1");
    expect(result.get("KEY2")).toBe("value2");
  });

  it("should strip double quotes from values", () => {
    const content = 'KEY="some value"';
    const result = parseEnvContent(content);

    expect(result.get("KEY")).toBe("some value");
  });

  it("should strip single quotes from values", () => {
    const content = "KEY='some value'";
    const result = parseEnvContent(content);

    expect(result.get("KEY")).toBe("some value");
  });

  it("should handle values containing equals signs", () => {
    const content = "DATABASE_URL=postgres://user:pass@host:5432/db?opt=true";
    const result = parseEnvContent(content);

    expect(result.get("DATABASE_URL")).toBe(
      "postgres://user:pass@host:5432/db?opt=true"
    );
  });

  it("should skip lines without an equals sign", () => {
    const content = "VALID_KEY=value\nINVALID_LINE\nANOTHER=test";
    const result = parseEnvContent(content);

    expect(result.size).toBe(2);
    expect(result.get("VALID_KEY")).toBe("value");
    expect(result.get("ANOTHER")).toBe("test");
  });

  it("should allow empty values", () => {
    const content = "EMPTY_KEY=";
    const result = parseEnvContent(content);

    expect(result.size).toBe(1);
    expect(result.get("EMPTY_KEY")).toBe("");
  });

  it("should trim whitespace around keys and values", () => {
    const content = "  KEY  =  value  ";
    const result = parseEnvContent(content);

    expect(result.get("KEY")).toBe("value");
  });

  it("should return an empty map for an empty string", () => {
    const result = parseEnvContent("");
    expect(result.size).toBe(0);
  });

  it("should ignore entries with an empty key", () => {
    const content = "=value_without_key";
    const result = parseEnvContent(content);
    expect(result.size).toBe(0);
  });

  it("should not strip mismatched quotes", () => {
    const content = `KEY="value'`;
    const result = parseEnvContent(content);
    expect(result.get("KEY")).toBe(`"value'`);
  });
});

// ── serializeEnv ─────────────────────────────────────────────────

describe("serializeEnv", () => {
  it("should serialize a map to .env format", () => {
    const entries = new Map([
      ["KEY1", "value1"],
      ["KEY2", "value2"],
    ]);
    const result = serializeEnv(entries);
    expect(result).toBe("KEY1=value1\nKEY2=value2\n");
  });

  it("should quote values containing spaces", () => {
    const entries = new Map([["KEY", "value with spaces"]]);
    const result = serializeEnv(entries);
    expect(result).toBe('KEY="value with spaces"\n');
  });

  it("should quote empty values", () => {
    const entries = new Map([["KEY", ""]]);
    const result = serializeEnv(entries);
    expect(result).toBe('KEY=""\n');
  });

  it("should quote values containing #", () => {
    const entries = new Map([["KEY", "value#with#hash"]]);
    const result = serializeEnv(entries);
    expect(result).toBe('KEY="value#with#hash"\n');
  });

  it("should serialize an empty map", () => {
    const entries = new Map<string, string>();
    const result = serializeEnv(entries);
    expect(result).toBe("\n");
  });

  it("should leave plain values unquoted", () => {
    const entries = new Map([["API_KEY", "sk_test_abc123"]]);
    const result = serializeEnv(entries);
    expect(result).toBe("API_KEY=sk_test_abc123\n");
  });
});

// ── File operations ──────────────────────────────────────────────

describe("File operations", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envhub-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("fileExists", () => {
    it("should return true when the file exists", async () => {
      const filePath = path.join(tmpDir, ".env");
      await fs.writeFile(filePath, "KEY=value");
      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false when the file does not exist", async () => {
      const filePath = path.join(tmpDir, ".nonexistent");
      expect(await fileExists(filePath)).toBe(false);
    });
  });

  describe("readEnvFileRaw", () => {
    it("should read the raw content of a file", async () => {
      const filePath = path.join(tmpDir, ".env");
      const content = "KEY1=value1\nKEY2=value2\n";
      await fs.writeFile(filePath, content);

      const result = await readEnvFileRaw(filePath);
      expect(result).toBe(content);
    });
  });

  describe("readEnvFile", () => {
    it("should read and parse an .env file", async () => {
      const filePath = path.join(tmpDir, ".env");
      await fs.writeFile(filePath, "DB_HOST=localhost\nDB_PORT=5432\n");

      const result = await readEnvFile(filePath);
      expect(result.size).toBe(2);
      expect(result.get("DB_HOST")).toBe("localhost");
      expect(result.get("DB_PORT")).toBe("5432");
    });
  });

  describe("writeEnvFileRaw", () => {
    it("should write raw content to a file", async () => {
      const filePath = path.join(tmpDir, ".env");
      const content = "WRITTEN=true\n";

      await writeEnvFileRaw(filePath, content);

      const result = await fs.readFile(filePath, "utf-8");
      expect(result).toBe(content);
    });
  });

  describe("writeEnvFile", () => {
    it("should write a map as an .env file", async () => {
      const filePath = path.join(tmpDir, ".env");
      const entries = new Map([
        ["APP_ENV", "production"],
        ["DEBUG", "false"],
      ]);

      await writeEnvFile(filePath, entries);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("APP_ENV=production");
      expect(content).toContain("DEBUG=false");
    });
  });
});
