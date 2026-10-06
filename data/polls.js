/* Written by scripts/update-polls.mjs — do not edit by hand.
   Polls: latest poll per outlet, from ynet's poll tracker, cross-checked against themadad.com. */
const UPDATED = "6.10.2026";

const SOURCES = [
  { id: "n12", name: "N12", date: "2026-10-05", prevDate: "2026-09-22",
    seats: { yesh: 23, likud: 21, beyahad: 13, democrats: 9, yb: 9, joint: 8, utj: 8, otzma: 7, shas: 7, rz: 6, raam: 5, miluim: 4, amcha: 0 },
    prev:  { yesh: 23, likud: 20, beyahad: 13, democrats: 9, yb: 9, joint: 7, utj: 8, otzma: 6, shas: 7, rz: 5, raam: 5, miluim: 4, amcha: 4 },
    pct:   { amcha: 1.5 } },
  { id: "n13", name: "חדשות 13", date: "2026-09-30", prevDate: "2026-09-23",
    seats: { yesh: 21, likud: 19, beyahad: 11, democrats: 11, yb: 9, joint: 9, utj: 8, otzma: 8, shas: 7, rz: 7, raam: 5, miluim: 0, amcha: 5 },
    prev:  { yesh: 22, likud: 18, beyahad: 11, democrats: 11, yb: 8, joint: 8, utj: 8, otzma: 7, shas: 7, rz: 6, raam: 5, miluim: 4, amcha: 5 },
    pct:   { miluim: 2.6 } },
  { id: "kan", name: "כאן 11", date: "2026-10-04", prevDate: "2026-09-27",
    seats: { yesh: 23, likud: 21, beyahad: 12, democrats: 8, yb: 9, joint: 8, utj: 8, otzma: 8, shas: 8, rz: 6, raam: 5, miluim: 4 },
    prev:  { yesh: 23, likud: 21, beyahad: 11, democrats: 9, yb: 9, joint: 7, utj: 7, otzma: 7, shas: 7, rz: 6, raam: 5, miluim: 4, amcha: 4 },
    pct:   {} }
];
