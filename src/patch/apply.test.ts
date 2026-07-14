import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { appendLedgerLines, ledgerPath, readLedger, verdictOf } from "../ledger/io.js";
import { applyOps } from "./apply.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "wdd-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  // Persistent local identity so applyOps's own commit works on CI (no global config there).
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: repo });
  appendLedgerLines(ledgerPath(repo), [
    { id: "D1", what: "x", by: "agent", aware: false, ref: "tx:s:1" },
  ]);
});

describe("applyOps", () => {
  it("always writes the ratify line; does not commit by default (commit: off)", () => {
    const result = applyOps(repo, [{ op: "ratify", target: "D1", verdict: "accept" }]);
    expect(result).toMatchObject({ applied: 1, skipped: 0 });
    expect(readFileSync(ledgerPath(repo), "utf8")).toContain('"type":"ratify"');
    // Default is not to touch git history.
    expect(execFileSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8" })).not.toContain("wdd ratify");
  });

  it("commits when commit: on", () => {
    writeFileSync(join(repo, ".wdd", "config.yaml"), "commit: on\n");
    const result = applyOps(repo, [{ op: "ratify", target: "D1", verdict: "accept" }]);
    expect(result).toMatchObject({ applied: 1 });
    expect(execFileSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8" })).toContain("wdd ratify: 1 accept, 0 reject");
  });

  it("is idempotent for an unchanged ruling, but allows changing your mind (latest wins)", () => {
    applyOps(repo, [{ op: "ratify", target: "D1", verdict: "accept" }]);
    expect(applyOps(repo, [{ op: "ratify", target: "D1", verdict: "accept" }])).toMatchObject({ applied: 0, skipped: 1 });
    // Overrule appends a new line; verdictOf returns the latest.
    expect(applyOps(repo, [{ op: "ratify", target: "D1", verdict: "reject" }])).toMatchObject({ applied: 1 });
    const { ratifies } = readLedger(ledgerPath(repo));
    expect(verdictOf(ratifies, "D1")).toBe("reject");
  });

  it("rejects unknown targets with zero writes", () => {
    const before = readFileSync(ledgerPath(repo), "utf8");
    expect(applyOps(repo, [{ op: "ratify", target: "D9", verdict: "accept" }])).toMatch(/unknown decision id/);
    expect(readFileSync(ledgerPath(repo), "utf8")).toBe(before);
  });
});
