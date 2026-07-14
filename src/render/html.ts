import type { DecisionEntry } from "../ledger/schema.js";
import type { TraceEvent } from "../trace/schema.js";
import type { GateStatus } from "../checks/gate.js";

export interface WorkbenchEntry extends DecisionEntry {
  verdict?: "accept" | "reject" | undefined;
  ruleNote?: string; // note attached when ruled (supplements the rule)
  pinned?: boolean; // currently saved as a rule
}

export interface RepoView {
  repo: string;
  root: string;
  branch?: string | undefined;
  entries: WorkbenchEntry[];
  traces: TraceEvent[];
  slices: Record<string, string>;
  gate?: GateStatus | undefined;
}

export interface WorkbenchOptions {
  title: string;
  interactive: boolean; // per-repo review: stage rulings; board: read-only overview
  live?: boolean; // served by an ephemeral local server: rulings POST straight to /apply
  memory?: string[]; // configured sync target files, for the "pinned to X" feedback
  repos: RepoView[];
}

/**
 * Single-file page: embedded JSON, vanilla JS. Served live by `wdd review`'s
 * ephemeral local server (rulings POST to /apply and land immediately), or
 * written as a static archive/board snapshot (rulings export as patch.jsonl
 * for `wdd apply`). English chrome; ledger content stays in whatever language
 * it was distilled. Grouped repo -> worktree, decisions and traces on a
 * timeline; a decision opens a right-side detail drawer. Theme follows system.
 */
export function renderWorkbench(opts: WorkbenchOptions): string {
  const json = JSON.stringify({
    title: opts.title,
    interactive: opts.interactive,
    live: opts.live ?? false,
    memory: opts.memory ?? [],
    repos: opts.repos,
  }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>wdd · ${escapeHtml(opts.title)}</title>
<style>
  :root {
    --bg: #fbfbfa; --card: #ffffff; --ink: #1c1c1e; --muted: #6e6e76; --faint: #9a9aa2;
    --line: #e7e7e4; --line2: #efefec; --accent: #2f6df6;
    --red: #d1453b; --red-bg: #fbeceb; --amber: #b26a00; --amber-bg: #fbf1df;
    --green: #1f9254; --green-bg: #e6f5ec; --shadow: 0 8px 40px rgba(0,0,0,.14);
  }
  :root[data-theme="dark"] {
    --bg: #101012; --card: #1a1a1d; --ink: #ececef; --muted: #9a9aa3; --faint: #6a6a72;
    --line: #2a2a2e; --line2: #232327; --accent: #6a9bff;
    --red: #e77066; --red-bg: #2a1917; --amber: #d29a4a; --amber-bg: #251d10;
    --green: #56bd83; --green-bg: #14231a; --shadow: 0 8px 40px rgba(0,0,0,.5);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #101012; --card: #1a1a1d; --ink: #ececef; --muted: #9a9aa3; --faint: #6a6a72;
      --line: #2a2a2e; --line2: #232327; --accent: #6a9bff;
      --red: #e77066; --red-bg: #2a1917; --amber: #d29a4a; --amber-bg: #251d10;
      --green: #56bd83; --green-bg: #14231a; --shadow: 0 8px 40px rgba(0,0,0,.5);
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 14px/1.55 -apple-system, "SF Pro Text", system-ui, "Segoe UI", sans-serif;
         -webkit-font-smoothing: antialiased; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  main { max-width: 720px; margin: 0 auto; padding: 30px 20px 80px; }

  header .top { display: flex; align-items: center; gap: 10px; }
  header h1 { margin: 0; font-size: 16px; font-weight: 640; letter-spacing: -0.01em; }
  .chip { font: 500 11.5px/1 ui-monospace, monospace; border: 1px solid var(--line); background: var(--card);
          color: var(--muted); border-radius: 6px; padding: 4px 7px; }
  #theme { margin-left: auto; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 8px;
           background: var(--card); color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; }
  #theme:hover { color: var(--ink); }
  #brief { color: var(--muted); font-size: 13px; margin: 12px 0 0; max-width: 60ch; }
  #brief b { color: var(--ink); font-weight: 600; }
  #brief code { font-family: ui-monospace, monospace; font-size: 12px; }
  #stats { display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0 0; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 9px 13px;
          font-size: 12px; color: var(--muted); min-width: 74px; }
  .stat b { display: block; font-size: 17px; font-weight: 660; color: var(--ink); letter-spacing: -0.01em; }
  .stat.warn b { color: var(--red); }

  .repo { margin-top: 34px; }
  .repo-h { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; padding-bottom: 9px;
            border-bottom: 1px solid var(--line); }
  .repo-h .name { font-size: 14.5px; font-weight: 640; }
  .gate { font: 600 11px/1 inherit; border-radius: 99px; padding: 3px 9px; }
  .gate.green { background: var(--green-bg); color: var(--green); }
  .gate.red { background: var(--red-bg); color: var(--red); }
  .repo-h .mini { font-size: 12px; color: var(--faint); margin-left: auto; }

  .wt { margin-top: 14px; }
  .wt-h { font-size: 11.5px; color: var(--faint); letter-spacing: 0.05em; text-transform: uppercase;
          font-weight: 600; margin-bottom: 2px; }
  .wt-h .path { text-transform: none; letter-spacing: 0; font-family: ui-monospace, monospace; }

  .tl { position: relative; margin: 6px 0 0; padding: 0; list-style: none; }
  .tl::before { content: ""; position: absolute; left: 58px; top: 10px; bottom: 10px; width: 1px; background: var(--line); }
  .day { position: relative; margin: 16px 0 4px; padding-left: 74px; font: 600 11px/1.8 ui-monospace, monospace; color: var(--faint); }
  .item { position: relative; padding-left: 74px; margin: 2px 0; }
  .item .t { position: absolute; left: 0; top: 9px; width: 42px; text-align: right; font: 11px/1.4 ui-monospace, monospace; color: var(--faint); }
  .item .dot { position: absolute; left: 54px; top: 12px; width: 9px; height: 9px; border-radius: 50%; background: var(--muted); outline: 3px solid var(--bg); }
  .item.silent .dot { background: var(--red); }
  .item.reflex .dot { background: var(--amber); }
  .item.aware .dot { background: var(--green); }
  .item.trace .dot { width: 7px; height: 7px; left: 55px; background: var(--card); border: 1.5px solid var(--line); }

  .trow { display: flex; gap: 8px; align-items: baseline; padding: 5px 2px; font-size: 12.5px; color: var(--muted); }
  .trow .ok { color: var(--green); } .trow .bad { color: var(--red); }
  .trow .cmd { font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--faint);
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .drow { width: 100%; text-align: left; background: var(--card); border: 1px solid var(--line);
          border-radius: 10px; padding: 10px 12px; display: flex; gap: 9px; align-items: center;
          cursor: pointer; font: inherit; color: inherit; transition: border-color .12s, background .12s; }
  .drow:hover { border-color: var(--muted); }
  .drow .id { font: 600 11px/1 ui-monospace, monospace; color: var(--faint); flex: none; }
  .drow .what { flex: 1; font-weight: 400; min-width: 0; }
  .drow .chev { color: var(--faint); flex: none; font-size: 15px; }

  /* refined category tag: dot + label, quiet fill */
  .tag { flex: none; display: inline-flex; align-items: center; gap: 5px; font: 600 11px/1 inherit;
         border-radius: 99px; padding: 4px 9px 4px 8px; white-space: nowrap; }
  .tag i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .9; }
  .tag.silent { background: var(--red-bg); color: var(--red); }
  .tag.reflex { background: var(--amber-bg); color: var(--amber); }
  .tag.aware  { background: var(--green-bg); color: var(--green); }
  .v { flex: none; font: 600 11px/1 inherit; border-radius: 99px; padding: 4px 9px; }
  .v.accept { background: var(--green-bg); color: var(--green); }
  .v.reject { background: var(--red-bg); color: var(--red); }
  .v.pending { border: 1px dashed var(--line); color: var(--faint); }
  .drow.reject .what { text-decoration: line-through; color: var(--muted); }

  /* drawer */
  #scrim { position: fixed; inset: 0; background: rgba(0,0,0,.32); opacity: 0; pointer-events: none;
           transition: opacity .18s; z-index: 40; }
  #scrim.open { opacity: 1; pointer-events: auto; }
  #drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(480px, 100%); background: var(--card);
            border-left: 1px solid var(--line); box-shadow: var(--shadow); transform: translateX(100%);
            transition: transform .22s cubic-bezier(.4,0,.2,1); z-index: 41; display: flex; flex-direction: column; }
  #drawer.open { transform: translateX(0); }
  .dh { display: flex; align-items: flex-start; gap: 10px; padding: 18px 20px 14px; border-bottom: 1px solid var(--line); }
  .dh .id { font: 600 12px/1.6 ui-monospace, monospace; color: var(--faint); }
  .dh h2 { margin: 4px 0 0; font-size: 16px; font-weight: 640; line-height: 1.35; }
  .dh .x { margin-left: auto; flex: none; border: 0; background: none; color: var(--muted); font-size: 22px;
           line-height: 1; cursor: pointer; padding: 0 2px; }
  .dbody { padding: 16px 20px; overflow: auto; flex: 1; }
  .sec { margin: 0 0 16px; }
  .lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--faint); margin-bottom: 5px; }
  .alts { display: flex; flex-wrap: wrap; gap: 6px; }
  .alts span { border: 1px solid var(--line); border-radius: 7px; padding: 3px 9px; font-size: 13px; }
  .files { display: flex; flex-direction: column; gap: 4px; }
  .files code { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--accent);
                background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; }
  .quad b.bad { color: var(--red); font-weight: 600; } .quad b.ok { color: var(--green); font-weight: 600; }
  .excerpt { background: var(--bg); border: 1px solid var(--line); border-radius: 9px; padding: 11px 13px;
             font: 11.5px/1.65 ui-monospace, monospace; white-space: pre-wrap; word-break: break-word;
             max-height: 300px; overflow: auto; color: var(--muted); }
  .excerpt .u { color: var(--ink); font-weight: 600; }
  .refline { font: 11px/1.6 ui-monospace, monospace; color: var(--faint); margin-top: 5px; }
  .df { border-top: 1px solid var(--line); padding: 14px 20px; }
  .btns { display: flex; gap: 8px; }
  .btns button { flex: 1; font: 640 13px/1 inherit; cursor: pointer; border-radius: 9px; padding: 11px;
                 border: 1px solid var(--line); background: var(--card); color: var(--ink); transition: all .12s; }
  .btns .ok:hover, .btns .ok.on { background: var(--green); border-color: var(--green); color: #fff; }
  .btns .no:hover, .btns .no.on { background: var(--red); border-color: var(--red); color: #fff; }
  .note { width: 100%; margin-top: 9px; font: 13px/1.5 inherit; padding: 9px 11px; border: 1px solid var(--line);
          border-radius: 9px; background: var(--bg); color: var(--ink); resize: vertical; min-height: 38px; }
  .next { font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.5; }
  .next b { color: var(--ink); font-weight: 600; }
  .ruleswitch { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 550; cursor: pointer; }
  .ruleswitch input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
  .rulehint { font-size: 12px; color: var(--accent); margin: 5px 0 0; min-height: 0; }
  .v.rule { background: var(--accent); color: #fff; }
  @media (prefers-color-scheme: dark) { .v.rule { color: #0f0f10; } }
  #modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 60; display: none;
           align-items: center; justify-content: center; padding: 20px; }
  #modal.show { display: flex; }
  .mbox { background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow);
          max-width: 420px; width: 100%; padding: 18px; }
  .mmsg { font-size: 14px; line-height: 1.5; }
  .mmsg .cq { margin-top: 8px; padding: 8px 10px; background: var(--bg); border: 1px solid var(--line);
              border-radius: 8px; font-size: 13px; }
  .mbtns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .mbtns button { font: 600 13px/1 inherit; cursor: pointer; border-radius: 8px; padding: 9px 16px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
  .mbtns .mok { background: var(--accent); border-color: var(--accent); color: #fff; }
  .ro { font-size: 12px; color: var(--muted); margin-top: 8px; }
  .ro code { font-family: ui-monospace, monospace; font-size: 11.5px; }

  #bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--line);
         padding: 10px 20px; z-index: 30; }
  #bar .inner { max-width: 720px; margin: 0 auto; display: flex; gap: 12px; align-items: center; }
  #staged { font-size: 13px; color: var(--muted); }
  #staged.hot { color: var(--ink); font-weight: 600; }
  #how { font: 11px/1.4 ui-monospace, monospace; color: var(--faint); margin-left: auto; }
  #export { font: 640 13px/1 inherit; background: var(--accent); color: #fff; border: 0; border-radius: 9px;
            padding: 10px 16px; cursor: pointer; }
  #export:disabled { opacity: .4; cursor: default; }
  .empty { color: var(--faint); text-align: center; padding: 30px 0; font-size: 13px; }
  #banner { position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%) translateY(12px);
            max-width: 560px; width: calc(100% - 40px); border-radius: 10px; padding: 0; z-index: 50;
            display: none; box-shadow: var(--shadow); border: 1px solid var(--line); }
  #banner.show { display: block; animation: bpop .18s ease; }
  @keyframes bpop { from { transform: translateX(-50%) translateY(12px); opacity: 0; } }
  #banner.ok { background: var(--green-bg); border-color: var(--green); }
  #banner.warn { background: var(--amber-bg); border-color: var(--amber); }
  #banner.err { background: var(--red-bg); border-color: var(--red); }
  #banner .bx { padding: 12px 40px 12px 14px; font-size: 13px; line-height: 1.5; color: var(--ink); }
  #banner .bx b { font-weight: 650; }
  #banner .bpin { margin-top: 6px; color: var(--muted); }
  #banner .bpin ul { margin: 4px 0 0; padding-left: 18px; }
  #banner .bpin li { margin: 2px 0; }
  #banner .bxc { position: absolute; top: 8px; right: 8px; border: 0; background: none; font-size: 18px;
                 line-height: 1; color: var(--muted); cursor: pointer; }
</style>
<body>
<main>
  <header>
    <div class="top">
      <h1 id="title"></h1>
      <button id="theme" title="theme">◐</button>
    </div>
    <p id="brief"></p>
    <div id="stats"></div>
  </header>
  <div id="repos"></div>
</main>
<div id="scrim"></div>
<aside id="drawer" aria-hidden="true"></aside>
<div id="bar" style="display:none"><div class="inner">
  <span id="staged"></span><span id="how"></span><button id="export" style="display:none"></button>
</div></div>
<div id="banner"></div>
<div id="modal"></div>
<script type="application/json" id="data">${json}</script>
<script>
const state = JSON.parse(document.getElementById("data").textContent);

const T = {
  brief: (s) => "Decisions made inside AI sessions, on a timeline. <b>" + s + "</b> were never shown to you. " +
    (state.interactive
      ? "Open one to review — <b>Approve</b> to keep it, <b>Reject</b> if it was wrong. Rulings save straight to the ledger."
      : "Read-only snapshot; run <code>wdd review</code> to make rulings, or download this as Markdown."),
  decisions: "decisions", pending: "to review", tests: "tests", silent: "AI decided", repos: "repos",
  tag: { silent: "AI decided", reflex: "You didn't read", aware: "You decided" },
  stampedFast: (s) => "You clicked in " + s + "s",
  affirm: "Approve", overturn: "Reject",
  explain: "<b>Approve</b> — AI will follow this next time. <b>Reject</b> — AI will avoid it. Either way your code isn't changed here.",
  affirmed: "Approved", overturned: "Rejected", already: (v) => "Already " + (v === "accept" ? "approved" : "rejected"),
  hard: "hard to change", why: "Why", alts: "Other options", files: "Files touched", attrs: "About", excerpt: "From the session",
  noExcerpt: "session is too old to quote; the ref still points to it in the transcript",
  byAgent: "AI decided", byUser: "you decided", awareNo: "you didn't confirm it", awareYes: "you confirmed it",
  rev: { low: "hard to change", medium: "medium to change", high: "easy to change" },
  note: "Add a note (optional)…",
  nextAffirm: "AI will follow this from now on. Your code isn't changed.",
  nextOverturn: "AI won't do this again. Your code isn't changed — note the fix and do it yourself.",
  remember: "Save this as a rule for agents",
  ruleOnHint: (where) => "On approve/reject, this becomes a rule in " + where + " (with your note).",
  confirmRule: (v, where, what, note) =>
    "Add a rule to <b>" + esc(where) + "</b> that agents will follow:<div class='cq'>" +
    (v === "reject" ? "DON'T " : "DO ") + esc(what) + (note ? " — " + esc(note) : "") + "</div>",
  cancel: "Cancel", confirm: "Add the rule",
  pinNoTarget: "Saved the ruling, but no memory file is configured — the rule wasn't written. Run  wdd sync  to pick one.",
  earlier: "earlier", today: "today", yesterday: "yesterday",
  howLive: "Open a decision · Approve / Reject saves it straight to the ledger",
  howStatic: "This is a read-only snapshot. Run wdd review to make rulings.",
  download: "Download as Markdown",
  saveFail: (e) => "Save failed: " + e,
  savedN: (n) => "Saved " + n + " decision" + (n === 1 ? "" : "s"),
  pinnedTo: (where) => "Saved as a rule in " + where + ":",
  uncommitted: "Saved to .wdd/ledger.jsonl on disk — but git can't track it because .wdd is gitignored. Remove the .wdd line from .gitignore to version it, or run <b>wdd share local</b> to keep it local-only.",
  empty: "no decisions in this scope",
  testLine: (k, p, f) => k + " · " + (p ?? 0) + " passed" + (f ? " · " + f + " failed" : ""),
  ruleHere: (root) => 'Read-only. Rule inside the repo: <code>cd ' + root + ' && wdd review</code>',
};

const cat = (e) => (e.aware ? "aware" : e.by === "agent" ? "silent" : "reflex");
const allEntries = () => state.repos.flatMap((r, ri) => r.entries.map((e) => ({ ...e, _ri: ri })));
const flatIndex = {}; // "ri:id" -> {entry, repo}
state.repos.forEach((r, ri) => r.entries.forEach((e) => (flatIndex[ri + ":" + e.id] = { e, r })));

/* theme */
const themeBtn = document.getElementById("theme");
function applyTheme() {
  const saved = localStorage.getItem("wdd:theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  else document.documentElement.removeAttribute("data-theme");
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  themeBtn.textContent = dark ? "☀" : "☾";
}
themeBtn.onclick = () => {
  const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!localStorage.getItem("wdd:theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  localStorage.setItem("wdd:theme", dark ? "light" : "dark");
  applyTheme();
};
applyTheme();

function updateBar() {
  const ex = document.getElementById("export");
  if (state.live) {
    // Rulings save immediately from the drawer; the bar just shows progress.
    const all = allEntries();
    const ruled = all.filter((e) => e.verdict).length;
    document.getElementById("staged").textContent = ruled + " / " + all.length + " reviewed";
    document.getElementById("staged").className = "";
    document.getElementById("how").textContent = T.howLive;
    ex.style.display = "none";
  } else {
    document.getElementById("staged").textContent = "";
    ex.style.display = "";
    ex.textContent = T.download; ex.disabled = false;
    document.getElementById("how").textContent = T.howStatic;
  }
}

function render() {
  document.getElementById("bar").style.display = "";
  document.getElementById("title").textContent = state.title;
  const entries = allEntries();
  const silent = entries.filter((e) => cat(e) === "silent").length;
  const pend = entries.filter((e) => !verdictOf(e)).length;
  const pass = state.repos.flatMap((r) => r.traces).reduce((s, x) => s + (x.pass || 0), 0);
  const fail = state.repos.flatMap((r) => r.traces).reduce((s, x) => s + (x.fail || 0), 0);
  document.getElementById("brief").innerHTML = T.brief(silent);
  document.getElementById("stats").innerHTML =
    (state.repos.length > 1 ? stat(state.repos.length, T.repos) : "") +
    stat(entries.length, T.decisions) +
    stat(pend, T.pending, pend > 0) +
    stat(silent, T.silent, silent > 0 && pend > 0) +
    (pass + fail ? stat(pass + " ✓" + (fail ? " " + fail + " ✗" : ""), T.tests, fail > 0) : "");

  const root = document.getElementById("repos");
  root.textContent = "";
  state.repos.forEach((r, ri) => root.appendChild(repoSection(r, ri)));
  updateBar();
}

function verdictOf(e) { return e.verdict; }
function stat(v, label, warn) { return '<div class="stat' + (warn ? " warn" : "") + '"><b>' + v + "</b>" + esc(label) + "</div>"; }

function repoSection(r, ri) {
  const sec = document.createElement("section");
  sec.className = "repo";
  if (state.repos.length > 1 || r.gate) {
    const pend = r.entries.filter((e) => !verdictOf({ ...e, _ri: ri })).length;
    sec.innerHTML = '<div class="repo-h"><span class="name">' + esc(r.repo) + "</span>" +
      (r.branch ? '<span class="chip">' + esc(r.branch) + "</span>" : "") +
      (r.gate ? '<span class="gate ' + (r.gate.green ? "green" : "red") + '">' + (r.gate.green ? "gate green" : "gate red") + "</span>" : "") +
      '<span class="mini">' + pend + " / " + r.entries.length + " pending</span></div>";
  }
  const items = [
    ...r.entries.map((e) => ({ type: "d", t: e.t, cwd: e.cwd, e: { ...e, _ri: ri } })),
    ...r.traces.map((tr) => ({ type: "t", t: tr.t, cwd: tr.cwd, tr })),
  ];
  if (!items.length) { sec.insertAdjacentHTML("beforeend", '<div class="empty">' + T.empty + "</div>"); return sec; }
  const cwds = [...new Set(items.map((i) => i.cwd || r.root))].sort((a, b) => (a === r.root ? -1 : b === r.root ? 1 : a < b ? -1 : 1));
  for (const cwd of cwds) {
    const group = items.filter((i) => (i.cwd || r.root) === cwd).sort((a, b) => ((a.t || "") < (b.t || "") ? -1 : 1));
    const wt = document.createElement("div");
    wt.className = "wt";
    if (cwds.length > 1) wt.innerHTML = '<div class="wt-h">worktree <span class="path">' + esc(wtLabel(r, cwd)) + "</span></div>";
    const ol = document.createElement("ol");
    ol.className = "tl";
    let day = null;
    for (const it of group) {
      const d = localDay(it.t);
      if (d !== day) { day = d; const dh = document.createElement("div"); dh.className = "day"; dh.textContent = dayLabel(it.t); ol.appendChild(dh); }
      ol.appendChild(it.type === "d" ? decisionRow(it) : traceRow(it));
    }
    wt.appendChild(ol);
    sec.appendChild(wt);
  }
  if (!state.interactive) sec.insertAdjacentHTML("beforeend", '<div class="ro">' + T.ruleHere(esc(r.root)) + "</div>");
  return sec;
}

function wtLabel(r, cwd) {
  if (!cwd || cwd === r.root) return r.repo;
  return cwd.startsWith(r.root) ? r.repo + cwd.slice(r.root.length) : cwd;
}

function traceRow(it) {
  const li = document.createElement("li");
  li.className = "item trace";
  const ok = it.tr.exit === 0;
  li.innerHTML = '<span class="t" title="' + esc(fullTime(it.t)) + '">' + hhmm(it.t) + '</span><span class="dot"></span>' +
    '<div class="trow"><span class="' + (ok ? "ok" : "bad") + '">' + (ok ? "✓" : "✗") + "</span><span>" +
    esc(T.testLine(it.tr.kind, it.tr.pass, it.tr.fail)) + '</span><span class="cmd">' + esc(it.tr.cmd) + "</span></div>";
  return li;
}

function decisionRow(it) {
  const e = it.e;
  const c = cat(e);
  const verdict = verdictOf(e);
  const li = document.createElement("li");
  li.className = "item " + c;
  const btn = document.createElement("button");
  btn.className = "drow" + (verdict === "reject" ? " reject" : "");
  btn.innerHTML =
    '<span class="id">' + esc(e.id) + "</span>" +
    '<span class="tag ' + c + '"><i></i>' + esc(tagLabel(e, c)) + "</span>" +
    '<span class="what">' + esc(e.what) + "</span>" +
    (e.pinned ? '<span class="v rule">rule</span>' : "") +
    (verdict ? '<span class="v ' + verdict + '">' + esc(T[verdict === "accept" ? "affirmed" : "overturned"]) + "</span>" : "") +
    '<span class="chev">›</span>';
  btn.onclick = () => openDrawer(e._ri + ":" + e.id);
  li.innerHTML = '<span class="t" title="' + esc(fullTime(it.t)) + '">' + hhmm(it.t) + '</span><span class="dot"></span>';
  li.appendChild(btn);
  return li;
}

function tagLabel(e, c) {
  if (c === "reflex" && e.latencyMs != null && e.latencyMs < 10000) return T.stampedFast((e.latencyMs / 1000).toFixed(1));
  return T.tag[c];
}

/* drawer */
const scrim = document.getElementById("scrim");
const drawer = document.getElementById("drawer");
let openKey = null;
function openDrawer(key) {
  openKey = key;
  drawer.innerHTML = drawerHtml(key);
  wireDrawer(key);
  scrim.classList.add("open");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  openKey = null;
  scrim.classList.remove("open");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}
scrim.onclick = closeDrawer;
addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeDrawer(); });

function drawerHtml(key) {
  const { e, r } = flatIndex[key];
  const verdict = e.verdict;
  let body = "";
  if (e.why) body += sec(T.why, esc(e.why));
  if (e.alternatives && e.alternatives.length)
    body += sec(T.alts, '<div class="alts">' + e.alternatives.map((a) => "<span>" + esc(a) + "</span>").join("") + "</div>");
  if (e.files && e.files.length)
    body += sec(T.files, '<div class="files">' + e.files.map((f) => '<code>' + esc(relPath(f, r.root)) + "</code>").join("") + "</div>");
  body += sec(T.attrs, '<span class="quad">' +
    "<b class=" + (e.by === "agent" ? "bad" : "ok") + ">" + esc(e.by === "agent" ? T.byAgent : T.byUser) + "</b> · " +
    "<b class=" + (e.aware ? "ok" : "bad") + ">" + esc(e.aware ? T.awareYes : T.awareNo) + "</b>" +
    (e.model ? ' · <span class="mono">' + esc(e.model) + "</span>" : "") +
    (e.reversibility ? " · " + esc(T.rev[e.reversibility]) : "") + "</span>");
  const slice = r.slices[e.ref];
  body += sec(T.excerpt,
    (slice ? '<div class="excerpt">' + excerptHtml(slice) + "</div>" : '<span style="color:var(--muted);font-size:12.5px">' + esc(T.noExcerpt) + "</span>") +
    '<div class="refline">' + esc(e.ref) + (e.branch ? " · " + esc(e.branch) : "") + "</div>");

  let footer = "";
  if (!state.interactive) {
    footer = '<div class="ro">' + T.ruleHere(esc(r.root)) + "</div>";
  } else {
    // Order (bottom-up): rule switch, then note, then the ruling buttons.
    // Clicking Approve/Reject IS the save (immediate). No separate Save step.
    footer =
      '<label class="ruleswitch"><input type="checkbox" id="ruleSw"' + (e.pinned ? " checked" : "") + ">" +
      "<span>" + T.remember + "</span></label>" +
      '<div class="rulehint" id="ruleHint">' + (e.pinned ? T.ruleOnHint(memoryLabel()) : "") + "</div>" +
      '<textarea class="note" placeholder="' + esc(T.note) + '">' + esc(e.ruleNote || "") + "</textarea>" +
      '<div class="next">' + T.explain + "</div>" +
      '<div class="btns"><button class="ok' + (verdict === "accept" ? " on" : "") + '" data-v="accept">' + T.affirm + "</button>" +
      '<button class="no' + (verdict === "reject" ? " on" : "") + '" data-v="reject">' + T.overturn + "</button></div>";
  }
  const c = cat(e);
  return (
    '<div class="dh"><div><div class="id">' + esc(e.id) + " · " +
    '<span class="tag ' + c + '" style="padding:2px 7px"><i></i>' + esc(tagLabel(e, c)) + "</span></div>" +
    "<h2>" + esc(e.what) + '</h2></div><button class="x" title="close">×</button></div>' +
    '<div class="dbody">' + body + "</div>" +
    '<div class="df">' + footer + "</div>"
  );
}

function memoryLabel() {
  return state.memory && state.memory.length ? state.memory.join(", ") : "your agent memory file";
}

function wireDrawer(key) {
  drawer.querySelector(".x").onclick = closeDrawer;
  const noteEl = drawer.querySelector(".note");
  const sw = drawer.querySelector("#ruleSw");
  if (sw) sw.onchange = () => {
    const h = drawer.querySelector("#ruleHint");
    if (h) h.innerHTML = sw.checked ? T.ruleOnHint(memoryLabel()) : "";
  };
  drawer.querySelectorAll(".btns button").forEach((b) => (b.onclick = () => rule(key, b.dataset.v)));
}

/** A ruling is immediate: Approve/Reject POSTs straight to the ledger.
 *  If "save as a rule" is on, confirm first (it writes to agent memory). */
async function rule(key, verdict) {
  const { e } = flatIndex[key];
  const noteEl = drawer.querySelector(".note");
  const sw = drawer.querySelector("#ruleSw");
  const note = (noteEl && noteEl.value.trim()) || undefined;
  const pin = !!(sw && sw.checked);
  if (pin && !(await confirmModal(T.confirmRule(verdict, memoryLabel(), e.what, note)))) return;
  const op = { op: "ratify", target: key.split(":")[1], verdict, ...(note ? { note } : {}), ...(pin ? { pin: true } : {}) };
  try {
    const res = await fetch("/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([op]) });
    const r = await res.json();
    if (r.error) return banner(esc(T.saveFail(r.error)), "err");
    e.verdict = verdict; e.ruleNote = note; e.pinned = pin;
    drawer.innerHTML = drawerHtml(key); wireDrawer(key);
    render();
    if (r.uncommitted) return banner(T.uncommitted, "warn");
    // Report the SERVER's truth: which files it actually wrote.
    const wrote = (r.synced || []).filter((f) => !f.startsWith(".wdd"));
    let msg = "<b>" + esc(e.id + " " + (verdict === "accept" ? T.affirmed : T.overturned)) + "</b>";
    if (pin && wrote.length) {
      msg += "<div class=\\"bpin\\">" + esc(T.pinnedTo(wrote.join(", "))) + "<ul><li>" +
        (verdict === "reject" ? "DON'T " : "DO ") + esc(e.what) + (note ? " — " + esc(note) : "") + "</li></ul></div>";
    } else if (pin) {
      // Asked to save as a rule, but no memory file was written.
      return banner(esc(T.pinNoTarget), "warn");
    }
    banner(msg, "ok");
  } catch (err) {
    banner(esc(T.saveFail(err)), "err");
  }
}

/* time — ledger stores UTC; render in the viewer's local zone via Date */
function hhmm(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function localDay(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayLabel(iso) {
  const day = localDay(iso); if (!day) return T.earlier;
  const today = localDay(new Date().toISOString()), yst = localDay(new Date(Date.now() - 86400000).toISOString());
  return day + (day === today ? " · " + T.today : day === yst ? " · " + T.yesterday : "");
}
function fullTime(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "long" }); }

// In-page banner (no system alert). kind: ok | warn | err. HTML content allowed.
let bannerTimer;
function banner(html, kind) {
  const el = document.getElementById("banner");
  el.className = "show " + (kind || "ok");
  el.innerHTML = '<div class="bx">' + html + '</div><button class="bxc">×</button>';
  el.querySelector(".bxc").onclick = () => el.classList.remove("show");
  clearTimeout(bannerTimer);
  if (kind === "ok") bannerTimer = setTimeout(() => el.classList.remove("show"), 5000);
}

function relPath(f, root) { return root && f.indexOf(root) === 0 ? f.slice(root.length).replace(/^[/]/, "") : f; }
function sec(label, body) { return '<div class="sec"><div class="lbl">' + esc(label) + "</div>" + body + "</div>"; }
function excerptHtml(slice) { return slice.split("\\n").map((l) => (/\\] (USER|USER-[A-Z-]+):/.test(l) ? '<span class="u">' + esc(l) + "</span>" : esc(l))).join("\\n"); }

// Static snapshot: the only footer action is downloading a readable record.
document.getElementById("export").onclick = () => downloadMarkdown();

/** In-page confirm (no system dialog). Returns a Promise<boolean>. */
function confirmModal(msg) {
  return new Promise((resolve) => {
    const m = document.getElementById("modal");
    m.innerHTML =
      '<div class="mbox"><div class="mmsg">' + msg + "</div>" +
      '<div class="mbtns"><button class="mc">' + T.cancel + '</button><button class="mok">' + T.confirm + "</button></div></div>";
    m.className = "show";
    const done = (v) => { m.className = ""; resolve(v); };
    m.querySelector(".mc").onclick = () => done(false);
    m.querySelector(".mok").onclick = () => done(true);
    m.onclick = (ev) => { if (ev.target === m) done(false); };
  });
}

/** Read-only snapshot download: a plain, human-readable Markdown record. */
function downloadMarkdown() {
  const md = ["# " + state.title, "", "Decision audit from whodecided.", ""];
  for (const r of state.repos) {
    if (state.repos.length > 1) md.push("## " + r.repo + (r.branch ? " · " + r.branch : ""), "");
    const line = (e) => {
      const v = e.verdict;
      const mark = v === "accept" ? "[approved]" : v === "reject" ? "[rejected]" : "[to review]";
      const who = e.aware ? "you decided" : e.by === "agent" ? "AI decided" : "you didn't read";
      const alt = e.alternatives && e.alternatives.length ? "  \\n  vs " + e.alternatives.join(", ") : "";
      const why = e.why ? "  \\n  why: " + e.why : "";
      return "- " + mark + " (" + who + ") " + e.what + alt + why;
    };
    for (const e of r.entries) md.push(line(e));
    md.push("");
  }
  const blob = new Blob([md.join("\\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.title.replace(/[^a-zA-Z0-9]+/g, "-") + ".md";
  a.click();
}

function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
render();
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
