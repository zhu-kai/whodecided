import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { isRecord } from "../validate.js";
import type { SessionEvent } from "./parser.js";

export interface CodexLocateOptions {
  cwds: string[];
  days: number;
  sessions: number;
  sessionsDir?: string;
}

export function isCodexTranscript(text: string): boolean {
  return text.slice(0, 200).includes('"session_meta"');
}

/** Stable short id from rollout-<timestamp>-<uuid>.jsonl (the uuid tail). */
export function codexSessionId(file: string): string {
  const stem = file.split("/").pop()?.replace(/\.jsonl$/, "") ?? file;
  return stem.split("-").pop() ?? stem;
}

/**
 * Codex rollouts live under ~/.codex/sessions/YYYY/MM/DD/ for ALL projects;
 * the audited cwd is only inside each file's session_meta line, so matching
 * reads the first line of every file inside the age window.
 */
export function locateCodexSessions(opts: CodexLocateOptions): string[] {
  const dir = opts.sessionsDir ?? join(homedir(), ".codex", "sessions");
  const cutoff = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  const files: { path: string; mtime: number }[] = [];
  const walk = (d: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(d, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (n.endsWith(".jsonl") && st.mtimeMs >= cutoff) files.push({ path: p, mtime: st.mtimeMs });
    }
  };
  walk(dir, 0);
  const wanted = new Set(opts.cwds.map((c) => resolve(c)));
  return files
    .sort((a, b) => b.mtime - a.mtime)
    .filter((f) => {
      const meta = firstLine(f.path);
      return typeof meta?.cwd === "string" && wanted.has(resolve(meta.cwd));
    })
    .slice(0, opts.sessions)
    .map((f) => f.path);
}

// session_meta embeds base_instructions, so the first line can be hundreds of KB.
function firstLine(path: string): Record<string, unknown> | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const chunk = Buffer.alloc(65536);
    let head = "";
    for (let i = 0; i < 32 && !head.includes("\n"); i++) {
      const n = readSync(fd, chunk, 0, chunk.length, i * chunk.length);
      head += chunk.toString("utf8", 0, n);
      if (n < chunk.length) break;
    }
    const nl = head.indexOf("\n");
    const parsed = JSON.parse(nl >= 0 ? head.slice(0, nl) : head);
    return isRecord(parsed) && isRecord(parsed.payload) ? parsed.payload : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const PATCH_FILE = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm;

/** Parse one Codex rollout (jsonl text) into the shared SessionEvent stream. */
export function parseCodexTranscript(session: string, text: string): SessionEvent[] {
  const events: SessionEvent[] = [];
  let cwd: string | undefined;
  let model: string | undefined;
  text.split("\n").forEach((raw, index) => {
    if (raw.trim() === "") return;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(v) || !isRecord(v.payload)) return;
    const p = v.payload;
    const base = {
      session,
      line: index + 1,
      t: typeof v.timestamp === "string" ? v.timestamp : undefined,
      ...(cwd ? { cwd } : {}),
    };
    if (v.type === "session_meta" || v.type === "turn_context") {
      if (typeof p.cwd === "string") cwd = p.cwd;
      if (typeof p.model === "string") model = p.model;
      return;
    }
    if (v.type !== "response_item") return;
    if (p.type === "message" && Array.isArray(p.content)) {
      const role = p.role;
      if (role !== "user" && role !== "assistant") return; // developer = injected instructions
      const joined = p.content
        .filter((c): c is Record<string, unknown> => isRecord(c) && typeof c.text === "string")
        .map((c) => c.text)
        .join("\n");
      if (!joined.trim()) return;
      events.push(
        role === "user"
          ? { ...base, kind: "user_text", text: joined }
          : { ...base, kind: "assistant_text", text: joined, ...(model ? { model } : {}) },
      );
      return;
    }
    if ((p.type === "function_call" || p.type === "custom_tool_call") && typeof p.name === "string") {
      const input = typeof p.input === "string" ? p.input : typeof p.arguments === "string" ? p.arguments : "";
      if (p.name === "apply_patch") {
        for (const m of input.matchAll(PATCH_FILE)) {
          const f = m[1]!.trim();
          events.push({ ...base, kind: "tool_use", toolName: "apply_patch", text: isAbsolute(f) || !cwd ? f : join(cwd, f) });
        }
      } else {
        events.push({ ...base, kind: "tool_use", toolName: p.name });
      }
    }
  });
  return events;
}
