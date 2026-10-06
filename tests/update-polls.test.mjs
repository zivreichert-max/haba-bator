// node --test   (no dependencies; runs against saved snapshots in tests/fixtures)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseYnet, parseMadad, computeUpdate, renderPolls, loadPolls, loadCandidates, sameData, dmy,
} from "../scripts/update-polls.mjs";

const fx = (f) => fs.readFileSync(new URL("./fixtures/" + f, import.meta.url), "utf8");
const YNET = fx("ynet-2026-10-06.json");
const MADAD = fx("madad-2026-10-06.html");
const MODEL = loadPolls(fx("polls-2026-10-06.js")).SOURCES;          // the approved mockup's data
const CANDIDATES = loadCandidates(fs.readFileSync(new URL("../data/candidates.js", import.meta.url), "utf8"));
const TODAY = "2026-10-06";

const ok = (polls) => ({ polls });
const down = (msg) => ({ polls: null, error: msg });
const run = (o) => computeUpdate({ ynet: ok(parseYnet(YNET)), madad: ok(parseMadad(MADAD)), current: MODEL, candidates: CANDIDATES, today: TODAY, ...o });
const clone = (x) => JSON.parse(JSON.stringify(x));
const byId = (sources, id) => sources.find((s) => s.id === id);

/* A tiny ynet payload: one channel, two polls. */
function ynetPayload(polls) {
  return JSON.stringify({ polls: polls.map((p, i) => ({
    id: p.id ?? i + 1, date: p.date, channel: p.channel ?? "חדשות 12",
    results: Object.fromEntries(Object.entries(p.seats).map(([k, v]) => [k, v === null ? { inPoll: false } : { inPoll: true, mandates: v }])),
  })) });
}
const FULL = { yesh: 23, likud: 21, beyahad: 13, democrats: 9, yb: 9, joint: 8, utj: 8, otzma: 7, shas: 7, rz: 6, raam: 5, miluim: 4, amcha: 0 };

test("ynet snapshot reproduces the mockup's SOURCES exactly", () => {
  const r = run();
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.sources.map((s) => s.id), ["n12", "n13", "kan"]);
  assert.ok(sameData(r.sources, MODEL), "differs from mockup data");
});

test("themadad snapshot alone gives the same seats (it has no vote percentages, and writes 0 for 'not in poll')", () => {
  const r = run({ ynet: down("ynet: HTTP 403") });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes("ynet: HTTP 403")));
  for (const m of MODEL) {
    const s = byId(r.sources, m.id);
    assert.equal(s.date, m.date);
    assert.equal(s.prevDate, m.prevDate);
    const nz = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));
    assert.deepEqual(nz(s.seats), nz(m.seats), m.id + " seats");
    assert.deepEqual(nz(s.prev), nz(m.prev), m.id + " prev");
    assert.deepEqual(s.pct, {});
  }
});

test("both sources down: existing data kept, errors raised", () => {
  const r = run({ ynet: down("ynet: HTTP 403"), madad: down("המדד: HTTP 503") });
  assert.equal(r.errors.length, 3);
  assert.ok(sameData(r.sources, MODEL));
});

test("a CAPTCHA / HTML page instead of JSON is reported, not parsed", () => {
  assert.throws(() => parseYnet("<html><title>Access Denied</title></html>"), /JSON/);
  assert.throws(() => parseMadad("<html>Just a moment...</html>"), /allPolls/);
});

test("sum other than 120 keeps the previous data for that channel only", () => {
  const ynet = ok(parseYnet(ynetPayload([
    { date: "2026-10-06", seats: { ...FULL, yesh: 24 } },
    { date: "2026-10-01", seats: FULL },
  ])));
  const r = run({ ynet });
  assert.ok(r.errors.some((e) => e.startsWith("N12") && e.includes("121")));
  assert.deepEqual(byId(r.sources, "n12"), byId(MODEL, "n12"));
});

test("a value between 1 and 3, or a non-integer, fails validation", () => {
  for (const bad of [{ miluim: 3, amcha: 1 }, { miluim: 4.5, amcha: -0.5 }]) {
    const ynet = ok(parseYnet(ynetPayload([{ date: "2026-10-06", seats: { ...FULL, ...bad } }, { date: "2026-10-01", seats: FULL }])));
    const r = run({ ynet });
    assert.ok(r.errors.some((e) => e.startsWith("N12") && e.includes("ערך לא חוקי")), JSON.stringify(bad));
    assert.deepEqual(byId(r.sources, "n12"), byId(MODEL, "n12"));
  }
});

test("future date, or a date older than the stored one, fails validation", () => {
  for (const date of ["2026-10-07", "2026-10-01"]) {
    const ynet = ok(parseYnet(ynetPayload([{ date, seats: FULL }, { date: "2026-09-01", seats: FULL }])));
    const r = run({ ynet });
    assert.ok(r.errors.some((e) => e.startsWith("N12") && e.includes(date)), date);
    assert.deepEqual(byId(r.sources, "n12"), byId(MODEL, "n12"));
  }
});

test("latest = date descending, then id descending; prev is the next one", () => {
  const ynet = ok(parseYnet(ynetPayload([
    { id: 5, date: "2026-10-06", seats: { ...FULL, yesh: 22, likud: 22 } },
    { id: 9, date: "2026-10-06", seats: { ...FULL, yesh: 21, likud: 23 } },
    { id: 7, date: "2026-10-05", seats: FULL },
  ])));
  const s = byId(run({ ynet }).sources, "n12");
  assert.equal(s.seats.likud, 23);
  assert.equal(s.prev.likud, 22);
  assert.equal(s.prevDate, "2026-10-06");
});

test("a channel missing from ynet falls back to themadad", () => {
  const ynet = ok(parseYnet(YNET).filter((p) => p.channel !== "כאן חדשות"));
  const r = run({ ynet });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.startsWith("כאן 11")));
  assert.equal(byId(r.sources, "kan").date, "2026-10-04");
});

test("contradiction on the same date: ynet wins, warning raised", () => {
  const madadPolls = parseMadad(MADAD);
  const twin = madadPolls.find((p) => p.channel === "חדשות 12" && p.date === "2026-10-05");
  twin.results.likud.mandates = 22; twin.results.yesh.mandates = 22;
  const r = run({ madad: ok(madadPolls) });
  assert.ok(r.warnings.some((w) => w.includes("סתירה") && w.includes("likud 21/22")));
  assert.equal(byId(r.sources, "n12").seats.likud, 21);
});

test("party with 4+ seats and no entry in candidates.js fails the run", () => {
  const ynet = ok(parseYnet(ynetPayload([
    { date: "2026-10-06", seats: { ...FULL, raam: 0, kahol: 5 } },
    { date: "2026-10-01", seats: FULL },
  ])));
  const r = run({ ynet });
  assert.ok(r.errors.some((e) => e.includes('"kahol"') && e.includes("candidates.js")));
  assert.equal(byId(r.sources, "n12").seats.kahol, undefined, "unknown parties never reach the site data");
});

test("missing candidate at seats + 1 fails the run (data is still published)", () => {
  const cand = clone(CANDIDATES);
  delete cand.PARTIES.find((p) => p.id === "likud").list[22];
  const r = run({ candidates: cand });
  assert.ok(r.errors.some((e) => e.includes("הליכוד") && e.includes("במקום 22")));
  assert.ok(sameData(r.sources, MODEL));
});

test("rendered polls.js round-trips and only changes when the data does", () => {
  const text = renderPolls(MODEL, "6.10.2026");
  const back = loadPolls(text);
  assert.equal(back.UPDATED, "6.10.2026");
  assert.ok(sameData(back.SOURCES, MODEL));
  const changed = clone(MODEL); changed[0].seats.likud = 22;
  assert.ok(!sameData(changed, MODEL));
  assert.equal(dmy("2026-10-07"), "7.10.2026");
});
