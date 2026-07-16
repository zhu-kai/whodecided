import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("masks common secret shapes", () => {
    expect(redact("token is npm_" + "x".repeat(36) + " ok")).toContain("[redacted-token]");
    expect(redact("ghp_" + "a".repeat(36))).toContain("[redacted-token]");
    expect(redact("Authorization: Bearer sk-abcdefghij0123456789")).toMatch(/redacted/);
    expect(redact('password = "hunter2secret"')).toContain("[redacted]");
    expect(redact("-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----")).toBe("[redacted-private-key]");
  });

  it("leaves ordinary code alone", () => {
    const code = "const pageSize = 20; useHasFeature('buy'); // token refresh later";
    expect(redact(code)).toBe(code);
  });
});
