#!/usr/bin/env node
/* Fetch the latest N12 / Channel 13 / Kan poll and rewrite data/polls.js when something changed.
 *
 *   node scripts/update-polls.mjs            fetch, validate, write data/polls.js if changed
 *   node scripts/update-polls.mjs --dry-run  same, but never write
 *   node scripts/update-polls.mjs --check    only report whether each source is reachable and parseable
 *   --ynet-file <path> / --madad-file <path> read a saved response instead of fetching (testing)
 *   --today YYYY-MM-DD                       pretend the run happens on this date (testing)
 *
 * Primary source: ynet's poll tracker API. Fallback and cross-check: themadad.com (allPolls embedded in the page).
 * A blocked or failed request is never retried with a disguised client: we move to the fallback, and if that
 * fails too the existing file stays as is.
 *
 * Exit code 1 (so the scheduled run alerts) on: a channel that failed validation, both sources down,
 * or a candidate gap in data/candidates.js. Anything that passed is still written before exiting.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

export const YNET_URL = "https://cz.ynet.co.il/Elections26/api/polls";
export const MADAD_URL = "https://themadad.com/polls26/";
export const TOTAL_SEATS = 120;

/* Output order is fixed: n12, n13, kan. `channel` is the outlet name both sources use. */
export const CHANNELS = [
  { channel: "חדשות 12", id: "n12", name: "N12" },
  { channel: "חדשות 13", id: "n13", name: "חדשות 13" },
  { channel: "כאן חדשות", id: "kan", name: "כאן 11" },
];

/* themadad column -> party id (ynet uses these ids natively). Unmapped columns surface as "madad:<column>". */
export const MADAD_COLUMNS = {
  eisenkot: "yesh", likud: "likud", bennett: "beyahad", avoda: "democrats", israelBeitanu: "yb",
  unifiedArabList: "joint", utj: "utj", otzma: "otzma", shas: "shas", smotrich: "rz", raam: "raam",
  miluimnikim: "miluim", winter: "amcha", bw: "kahol",
};
const MADAD_META = new Set(["pollNumber", "version", "publisher", "pollster", "date", "respondents"]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLLS_FILE = path.join(ROOT, "data", "polls.js");
const CANDIDATES_FILE = path.join(ROOT, "data", "candidates.js");

/* ---------- reading the site's data files (classic scripts declaring top-level consts) ---------- */

export function evalConsts(code, names) {
  return vm.runInNewContext(code + `\n;({ ${names.join(", ")} })`, {}, { timeout: 1000 });
}
export function loadCandidates(code) { return evalConsts(code, ["PARTIES", "THRESHOLD", "ELECTION_DAY"]); }
export function loadPolls(code) { return evalConsts(code, ["SOURCES", "UPDATED"]); }

/* ---------- parsing the two sources into a common shape ----------
   poll = { channel, date, key, results: { partyId: { mandates, pct? } } }   (only parties that were in the poll)
   key orders polls within a date: ynet id / themadad pollNumber. */

export function parseYnet(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error("ynet: התשובה אינה JSON (חסימה או CAPTCHA?)"); }
  if (!j || !Array.isArray(j.polls)) throw new Error("ynet: חסר מערך polls במבנה הנתונים");
  return j.polls.map((p) => {
    if (typeof p.date !== "string" || !p.results || typeof p.results !== "object") throw new Error("ynet: סקר במבנה לא צפוי (id " + p.id + ")");
    const results = {};
    for (const [pid, r] of Object.entries(p.results)) {
      if (!r || r.inPoll !== true) continue;
      results[pid] = { mandates: r.mandates };
      if (r.votePercent != null) results[pid].pct = r.votePercent;
    }
    return { channel: p.channel, date: p.date, key: Number(p.id), results };
  });
}

export function parseMadad(html) {
  const m = /const\s+allPolls\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!m) throw new Error("המדד: לא נמצא allPolls בדף (חסימה או שינוי מבנה?)");
  let rows;
  try { rows = JSON.parse(m[1]); } catch { throw new Error("המדד: allPolls אינו JSON תקין"); }
  return rows
    .filter((r) => !r.version)                       // "b" rows are alternative scenarios of the same poll
    .map((r) => {
      const results = {};
      for (const [col, v] of Object.entries(r)) {
        if (MADAD_META.has(col) || v === null || v === "") continue;
        results[MADAD_COLUMNS[col] || "madad:" + col] = { mandates: Number(v) };
      }
      return { channel: r.publisher, date: r.date, key: Number(r.pollNumber), results };
    });
}

/* Latest and previous poll of one channel: date descending, then id descending. */
export function latestTwo(polls, channel) {
  const list = polls.filter((p) => p.channel === channel)
    .sort((a, b) => b.date.localeCompare(a.date) || b.key - a.key);
  return [list[0] || null, list[1] || null];
}

/* ---------- validation ---------- */

export function pollProblems(poll, threshold) {
  const out = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(poll.date)) out.push("תאריך לא תקין: " + poll.date);
  let sum = 0;
  for (const [pid, r] of Object.entries(poll.results)) {
    const n = r.mandates;
    if (!Number.isInteger(n) || n < 0 || (n > 0 && n < threshold)) out.push(`${pid}: ערך לא חוקי (${n})`);
    else sum += n;
  }
  if (sum !== TOTAL_SEATS) out.push(`סכום המנדטים ${sum} ולא ${TOTAL_SEATS}`);
  return out;
}

/* ---------- building one SOURCES entry ---------- */

export function toSource(ch, cur, prev, partyOrder) {
  const known = (pid) => partyOrder.includes(pid);
  const byOrder = (obj) => Object.fromEntries(Object.entries(obj).sort((a, b) => partyOrder.indexOf(a[0]) - partyOrder.indexOf(b[0])));
  const seats = {}, prevSeats = {}, pct = {};
  for (const [pid, r] of Object.entries(cur.results)) {
    if (!known(pid)) continue;
    seats[pid] = r.mandates;
    if (r.mandates === 0 && r.pct != null) pct[pid] = r.pct;
  }
  if (prev) for (const [pid, r] of Object.entries(prev.results)) if (known(pid)) prevSeats[pid] = r.mandates;
  return {
    id: ch.id, name: ch.name, date: cur.date, prevDate: prev ? prev.date : cur.date,
    seats: byOrder(seats), prev: byOrder(prevSeats), pct: byOrder(pct),
  };
}

/* Same mandates for every party? A party missing on one side counts as 0 (themadad writes 0 for "not in poll"). */
export function sameMandates(a, b) {
  const ids = new Set([...Object.keys(a.results), ...Object.keys(b.results)]);
  const diffs = [];
  for (const pid of ids) {
    const x = a.results[pid] ? a.results[pid].mandates : 0, y = b.results[pid] ? b.results[pid].mandates : 0;
    if (x !== y) diffs.push(`${pid} ${x}/${y}`);
  }
  return diffs;
}

/* ---------- the whole update, pure: inputs in, new SOURCES + messages out ---------- */

export function computeUpdate({ ynet, madad, current, candidates, today }) {
  const errors = [], warnings = [], notes = [];
  const { PARTIES, THRESHOLD } = candidates;
  const order = PARTIES.map((p) => p.id);
  const curById = Object.fromEntries((current || []).map((s) => [s.id, s]));
  const unknownSeats = [];                            // [{ id, channel, n }] parties >= threshold not in candidates.js

  if (ynet.error) warnings.push(ynet.error + " — עוברים לגיבוי (המדד)");
  if (madad.error) warnings.push(madad.error);

  const sources = CHANNELS.map((ch) => {
    const old = curById[ch.id] || null;
    const keep = (why) => {
      errors.push(`${ch.name}: ${why} — נשאר הנתון הקודם${old ? " (" + old.date + ")" : ""}`);
      return old;
    };

    const fromYnet = ynet.polls ? latestTwo(ynet.polls, ch.channel) : [null, null];
    const fromMadad = madad.polls ? latestTwo(madad.polls, ch.channel) : [null, null];
    let [cur, prev] = fromYnet, origin = "ynet";
    if (!cur) {
      if (ynet.polls) warnings.push(`${ch.name}: אין סקר ב-ynet — עוברים לגיבוי (המדד)`);
      [cur, prev] = fromMadad; origin = "המדד";
    }
    if (!cur) return keep("אין נתונים זמינים מאף מקור");

    const bad = [...pollProblems(cur, THRESHOLD), ...(prev ? pollProblems(prev, THRESHOLD).map((x) => "בסקר הקודם: " + x) : [])];
    if (cur.date > today) bad.push(`תאריך הסקר ${cur.date} עתידי`);
    if (old && cur.date < old.date) bad.push(`תאריך הסקר ${cur.date} מוקדם מהשמור (${old.date})`);
    if (bad.length) return keep(`${origin}, סקר ${cur.date}: ${bad.join("; ")}`);

    if (origin === "ynet" && madad.polls) {
      const twin = madad.polls.find((p) => p.channel === ch.channel && p.date === cur.date);
      if (twin) {
        const d = sameMandates(cur, twin);
        if (d.length) warnings.push(`${ch.name} ${cur.date}: סתירה בין ynet להמדד (${d.join(", ")}) — נעשה שימוש ב-ynet`);
      }
      if (fromMadad[0] && fromMadad[0].date > cur.date) warnings.push(`${ch.name}: בהמדד יש סקר חדש יותר (${fromMadad[0].date}) מאשר ב-ynet (${cur.date})`);
    }

    for (const [pid, r] of Object.entries(cur.results)) if (!order.includes(pid) && r.mandates >= THRESHOLD) unknownSeats.push({ id: pid, channel: ch.name, n: r.mandates });
    notes.push(`${ch.name}: ${cur.date} (${origin})`);
    return toSource(ch, cur, prev, order);
  });

  /* Candidate coverage: every party that passes needs data, including the candidate at seats + 1. */
  for (const u of unknownSeats) errors.push(`${u.channel}: למפלגה "${u.id}" יש ${u.n} מנדטים ואין לה נתונים ב-candidates.js`);
  for (const s of sources) {
    if (!s) continue;
    for (const [pid, n] of Object.entries(s.seats)) {
      if (n < THRESHOLD) continue;
      const p = PARTIES.find((x) => x.id === pid);
      if (!p.list[n + 1]) errors.push(`${s.name}: ל${p.name} יש ${n} מנדטים וחסר ב-candidates.js המועמד במקום ${n + 1}`);
    }
  }

  return { sources: sources.filter(Boolean), errors, warnings, notes };
}

/* ---------- writing data/polls.js ---------- */

const fmtObj = (o) => {
  const e = Object.entries(o);
  return e.length ? "{ " + e.map(([k, v]) => `${/^[a-z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)}: ${v}`).join(", ") + " }" : "{}";
};
export function renderPolls(sources, updated) {
  const body = sources.map((s) =>
    `  { id: ${JSON.stringify(s.id)}, name: ${JSON.stringify(s.name)}, date: ${JSON.stringify(s.date)}, prevDate: ${JSON.stringify(s.prevDate)},\n` +
    `    seats: ${fmtObj(s.seats)},\n` +
    `    prev:  ${fmtObj(s.prev)},\n` +
    `    pct:   ${fmtObj(s.pct)} }`).join(",\n");
  return `/* Written by scripts/update-polls.mjs — do not edit by hand.
   Polls: latest poll per outlet, from ynet's poll tracker, cross-checked against themadad.com. */
const UPDATED = ${JSON.stringify(updated)};

const SOURCES = [
${body}
];
`;
}

/* Deep equality that ignores key order. */
export function sameData(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameData(a[k], b[k]));
}

export function israelToday(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const dmy = (iso) => iso.split("-").map(Number).reverse().join(".");

/* ---------- fetching ---------- */

async function getText(url) {
  // Plain request, no disguised headers. A block (403, CAPTCHA page) is reported, not worked around.
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
async function loadSource(name, url, file, parse) {
  try {
    const text = file ? fs.readFileSync(file, "utf8") : await getText(url);
    return { polls: parse(text) };
  } catch (e) {
    const msg = e.message.startsWith(name) ? e.message : `${name}: ${e.name === "TimeoutError" ? "תם הזמן" : e.message}`;
    return { polls: null, error: msg };
  }
}

/* ---------- CLI ---------- */

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const GH = !!process.env.GITHUB_ACTIONS;
const say = (kind, msg) => console.log(GH && kind !== "notice" ? `::${kind}::${msg}` : `[${kind}] ${msg}`);

async function main() {
  const today = arg("--today") || israelToday();
  const [ynet, madad] = await Promise.all([
    loadSource("ynet", YNET_URL, arg("--ynet-file"), parseYnet),
    loadSource("המדד", MADAD_URL, arg("--madad-file"), parseMadad),
  ]);

  if (process.argv.includes("--check")) {
    for (const [n, s] of [["ynet", ynet], ["המדד", madad]]) console.log(`${n}: ${s.polls ? "OK, " + s.polls.length + " סקרים" : "נכשל — " + s.error}`);
    process.exitCode = ynet.polls && madad.polls ? 0 : 1;
    return;
  }

  const candidates = loadCandidates(fs.readFileSync(CANDIDATES_FILE, "utf8"));
  const current = loadPolls(fs.readFileSync(POLLS_FILE, "utf8"));
  const res = computeUpdate({ ynet, madad, current: current.SOURCES, candidates, today });

  res.notes.forEach((m) => say("notice", m));
  res.warnings.forEach((m) => say("warning", m));
  res.errors.forEach((m) => say("error", m));

  if (sameData(res.sources, current.SOURCES)) say("notice", "אין שינוי בסקרים — data/polls.js לא נכתב");
  else if (process.argv.includes("--dry-run")) say("notice", "יש שינוי (dry run, לא נכתב)");
  else {
    fs.writeFileSync(POLLS_FILE, renderPolls(res.sources, dmy(today)));
    say("notice", `data/polls.js עודכן (UPDATED = ${dmy(today)})`);
  }
  process.exitCode = res.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
