// Mask high-confidence secret shapes before a transcript excerpt is sent to the
// distiller or persisted as evidence. Deliberately conservative: only patterns
// that are almost certainly secrets, so we don't corrupt ordinary code.
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted-private-key]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-jwt]"],
  [/\b(?:npm_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|gh[osru]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g, "[redacted-token]"],
  // key: value / KEY=value where the key name screams secret
  [/\b(authorization|api[_-]?key|secret|token|password|passwd|access[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"';,]{6,}/gi, "$1$2[redacted]"],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}
