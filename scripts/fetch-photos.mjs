#!/usr/bin/env node
/* Copy the photos we may host into photos/ and write PHOTOS.md.
 *
 *   npm install            (once: installs sharp)
 *   node scripts/fetch-photos.mjs
 *
 * Only images from fs.knesset.gov.il (official Knesset portraits) and upload.wikimedia.org (Wikimedia Commons)
 * are downloaded: saved as photos/<partyId>-<place>.webp, at most 640px wide. In data/candidates.js the
 * candidate's img becomes the local path and the original address moves to imgSource.
 * Every other photo stays an external link, as in the mockup, and is never copied into the project.
 * Safe to re-run: already-local photos are skipped (and re-downloaded from imgSource if the file is missing).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadCandidates } from "./update-polls.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATES_FILE = path.join(ROOT, "data", "candidates.js");
const PHOTOS_DIR = path.join(ROOT, "photos");
const MAX_WIDTH = 640;
// Wikimedia asks automated clients to identify themselves (https://meta.wikimedia.org/wiki/User-Agent_policy).
const UA = "haba-bator-photos/1.0 (https://github.com/zivreichert-max/haba-bator)";

const HOSTABLE = { "fs.knesset.gov.il": "רשמי", "upload.wikimedia.org": "ויקימדיה, נדרש קרדיט" };
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };

let code = fs.readFileSync(CANDIDATES_FILE, "utf8");
const { PARTIES } = loadCandidates(code);
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const rows = [], failures = [];
for (const p of PARTIES) {
  for (const place of Object.keys(p.list).map(Number).sort((a, b) => a - b)) {
    const c = p.list[place];
    const source = c.imgSource || c.img || null;
    const host = source ? hostOf(source) : null;
    const status = !source ? "אין תמונה" : HOSTABLE[host] || "דורש החלטה על זכויות";
    const row = { party: p.name, pid: p.id, place, name: c.n, host: host || "—", status, source, credit: "" };
    rows.push(row);
    if (!HOSTABLE[host]) continue;

    const rel = `photos/${p.id}-${place}.webp`, file = path.join(ROOT, rel);
    if (host === "upload.wikimedia.org") row.credit = await commonsCredit(source).catch(() => "לא נמצא — לבדוק ידנית");
    if (c.img === rel && fs.existsSync(file)) continue;
    try {
      const r = await fetch(source, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      await sharp(buf).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toFile(file);
    } catch (e) {
      failures.push(`${p.id}-${place} (${c.n}): ${e.message}`);
      continue;
    }
    if (c.img !== rel) {
      const from = `img: ${JSON.stringify(c.img)}`;
      const hits = code.split(from).length - 1;
      if (hits !== 1) { failures.push(`${p.id}-${place}: נמצאו ${hits} מופעים של כתובת התמונה ב-candidates.js, לא עודכן`); continue; }
      code = code.replace(from, `img: ${JSON.stringify(rel)}, imgSource: ${JSON.stringify(c.img)}`);
    }
    console.log("✓", rel);
  }
}
fs.writeFileSync(CANDIDATES_FILE, code);

/* Author and licence from the Commons file page, for the credit line. */
async function commonsCredit(url) {
  const m = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(url);
  if (!m) throw new Error("no file name");
  const title = "File:" + decodeURIComponent(m[1]);
  const api = "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata&format=json&titles=" + encodeURIComponent(title);
  const j = await (await fetch(api, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) })).json();
  const meta = Object.values(j.query.pages)[0].imageinfo[0].extmetadata;
  const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return `${strip(meta.Artist && meta.Artist.value)}, ${strip(meta.LicenseShortName && meta.LicenseShortName.value)} — https://commons.wikimedia.org/wiki/${encodeURI(title.replace(/ /g, "_"))}`;
}

/* PHOTOS.md */
const count = (s) => rows.filter((r) => r.status === s).length;
const esc = (s) => String(s).replace(/\|/g, "\\|");
const md = `# תמונות המועמדים

נוצר על ידי \`scripts/fetch-photos.mjs\` — לא לערוך ידנית (הרצה חוזרת דורסת את הקובץ).

| סטטוס | משמעות | מספר |
|---|---|---|
| רשמי | דיוקן רשמי מאתר הכנסת (fs.knesset.gov.il). מוגש מקומית מ-\`photos/\`. | ${count("רשמי")} |
| ויקימדיה, נדרש קרדיט | ויקימדיה קומונס. מוגש מקומית; הרישיון מחייב קרדיט לצלם (פרטים בעמודת הקרדיט). | ${count("ויקימדיה, נדרש קרדיט")} |
| דורש החלטה על זכויות | אתר אחר (עיתונות, אתרי מפלגות, תוצאות חיפוש). נשאר קישור חיצוני כמו בדגם, לא הועתק לפרויקט. | ${count("דורש החלטה על זכויות")} |
| אין תמונה | מוצגים ראשי התיבות. | ${count("אין תמונה")} |

| מפלגה | מקום | מועמד/ת | דומיין המקור | סטטוס | קרדיט |
|---|---|---|---|---|---|
${rows.map((r) => `| ${esc(r.party)} | ${r.place} | ${esc(r.name)} | ${r.host} | ${r.status} | ${esc(r.credit)} |`).join("\n")}
`;
fs.writeFileSync(path.join(ROOT, "PHOTOS.md"), md);

console.log(`\n${rows.length} מועמדים: ${count("רשמי")} רשמי, ${count("ויקימדיה, נדרש קרדיט")} ויקימדיה, ${count("דורש החלטה על זכויות")} דורש החלטה, ${count("אין תמונה")} בלי תמונה.`);
if (failures.length) { console.error("\nנכשלו:\n" + failures.join("\n")); process.exitCode = 1; }
