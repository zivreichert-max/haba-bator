/* Written by scripts/update-polls.mjs — do not edit by hand.
   Polls: latest poll per outlet, from ynet's poll tracker, cross-checked against themadad.com. */
const UPDATED = "22.10.2026";

const SOURCES = [
  { id: "n12", name: "N12", date: "2026-10-21", prevDate: "2026-10-19",
    seats: { yesh: 23, likud: 19, beyahad: 15, democrats: 9, yb: 8, joint: 9, utj: 7, otzma: 7, shas: 8, rz: 6, raam: 5, miluim: 0, amcha: 4 },
    prev:  { yesh: 24, likud: 21, beyahad: 14, democrats: 9, yb: 8, joint: 9, utj: 7, otzma: 8, shas: 8, rz: 7, raam: 5, miluim: 0, amcha: 0 },
    pct:   { miluim: 2.8 } },
  { id: "n13", name: "חדשות 13", date: "2026-10-21", prevDate: "2026-10-19",
    seats: { yesh: 20, likud: 19, beyahad: 14, democrats: 10, yb: 8, joint: 9, utj: 8, otzma: 7, shas: 7, rz: 8, raam: 6, miluim: 4, amcha: 0 },
    prev:  { yesh: 20, likud: 18, beyahad: 14, democrats: 9, yb: 8, joint: 9, utj: 7, otzma: 7, shas: 7, rz: 7, raam: 6, miluim: 4, amcha: 4 },
    pct:   { amcha: 3.2 } },
  { id: "kan", name: "כאן 11", date: "2026-10-18", prevDate: "2026-10-04",
    seats: { yesh: 23, likud: 21, beyahad: 12, democrats: 9, yb: 8, joint: 8, utj: 7, otzma: 8, shas: 8, rz: 7, raam: 5, miluim: 4 },
    prev:  { yesh: 23, likud: 21, beyahad: 12, democrats: 8, yb: 9, joint: 8, utj: 8, otzma: 8, shas: 8, rz: 6, raam: 5, miluim: 4 },
    pct:   {} }
];
