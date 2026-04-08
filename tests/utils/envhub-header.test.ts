import { describe, it, expect } from "vitest";
import {
  addEnvhubHeader,
  getEnvhubHeaderEnvironment,
  stripEnvhubHeader,
} from "../../src/utils/envhub-header.js";

describe("envhub-header utils", () => {
  describe("stripEnvhubHeader", () => {
    it("should remove envhub header from the first line", () => {
      const content =
        "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n";
      expect(stripEnvhubHeader(content)).toBe("KEY=value\n");
    });

    it("should keep content unchanged if no envhub header exists", () => {
      const content = "KEY=value\n";
      expect(stripEnvhubHeader(content)).toBe(content);
    });

    it("should remove legacy single-line envhub header", () => {
      const content = "# envhub: secret=my-app\nKEY=value\n";
      expect(stripEnvhubHeader(content)).toBe("KEY=value\n");
    });
  });

  describe("getEnvhubHeaderEnvironment", () => {
    it("should read secret name from the current two-line header", () => {
      const content =
        "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n";
      expect(getEnvhubHeaderEnvironment(content)).toBe("my-app");
    });

    it("should read secret name from legacy single-line header", () => {
      const content = "# envhub: secret=legacy-app\nKEY=value\n";
      expect(getEnvhubHeaderEnvironment(content)).toBe("legacy-app");
    });

    it("should return null when header is not present", () => {
      const content = "KEY=value\n";
      expect(getEnvhubHeaderEnvironment(content)).toBeNull();
    });
  });

  describe("addEnvhubHeader", () => {
    it("should add header to plain env content", () => {
      const content = "KEY=value\n";
      expect(addEnvhubHeader("my-app", content)).toBe(
        "# 🔐 Managed by envhub-cli\n# Environment: my-app\n\nKEY=value\n"
      );
    });

    it("should replace an existing envhub header", () => {
      const content =
        "# 🔐 Managed by envhub-cli\n# Environment: old\n\nKEY=value\n";
      expect(addEnvhubHeader("new-secret", content)).toBe(
        "# 🔐 Managed by envhub-cli\n# Environment: new-secret\n\nKEY=value\n"
      );
    });
  });
});
