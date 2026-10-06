# הבא בתור

מי נכנס לכנסת אם מפלגה מקבלת עוד מנדט אחד, לפי הסקר האחרון של N12, חדשות 13 וכאן 11.
אתר סטטי: בלי פריימוורק ובלי שלב build. פותחים את `index.html` דרך שרת מקומי (`npm run serve`, ואז http://localhost:3000).

## מבנה

| קובץ | תפקיד |
|---|---|
| `index.html`, `styles.css`, `app.js` | הדגם המאושר, מפוצל לקבצים. |
| `data/candidates.js` | `PARTIES`, `THRESHOLD`, `ELECTION_DAY`. **נערך ידנית בלבד.** |
| `data/polls.js` | `SOURCES`, `UPDATED`. **נכתב רק על ידי `scripts/update-polls.mjs`.** מוגש עם `Cache-Control: no-cache` (`vercel.json`). |
| `fonts/` | Karantina 700 ו-Heebo variable, תת-קבוצות hebrew ו-latin, מהחבילות `@fontsource/karantina` ו-`@fontsource-variable/heebo` (5.3.0). רישיון OFL. |
| `photos/` | תמונות שמותר לארח (אתר הכנסת, ויקימדיה). ראו `PHOTOS.md`. |
| `scripts/update-polls.mjs` | עדכון הסקרים. |
| `scripts/fetch-photos.mjs` | הורדת התמונות המותרות ויצירת `PHOTOS.md`. |
| `scripts/update-local.ps1` | גיבוי לתזמון: עדכון מהמחשב המקומי (לא מופעל כברירת מחדל). |
| `.github/workflows/update-polls.yml` | תזמון: כל 3 שעות, עד 27.10.2026. |
| `tests/` | בדיקות לסקריפט העדכון מול קובצי דוגמה שמורים (`tests/fixtures`). |

## מקורות הנתונים

- **סקרים, מקור ראשי:** ה-API של מעקב הסקרים של ynet, `https://cz.ynet.co.il/Elections26/api/polls`.
  לכל ערוץ נלקחים הסקר האחרון (לפי תאריך, ואז לפי מזהה) והסקר שלפניו.
- **סקרים, גיבוי והצלבה:** `https://themadad.com/polls26/`, מהמשתנה `allPolls` שבתוך הדף.
  שורות עם `version` (למשל `"b"`) הן תרחישים חלופיים של אותו סקר, והן לא נלקחות.
  במדד אין אחוזי הצבעה, ו-0 שם יכול לסמן גם מפלגה שלא נכללה בסקר. לכן כשהנתונים מגיעים מהמדד
  לא יופיע "X% מהקולות", ומפלגה שלא נכללה תוצג כ"מתחת לאחוז החסימה".
- **סדר הרשימות:** כפי שהוגש לוועדת הבחירות המרכזית (כאן חדשות 8.9.2026, קובצי המכון הישראלי לדמוקרטיה).
  ברשימה המשותפת הסדר הוא הסדר הרשמי, ושונה בכוונה מזה שב"בוחרים חכם". לא לשנות.
- **פרטי המועמדים וכתובות התמונות:** votesmart.co.il ("בוחרים חכם"), לא אומתו מול המועמדים.
  **המקומות 11 בש"ס (יוסף אלנתוב) ו-8 בעמך ישראל (דוידי בן ציון) מבוססים על "בוחרים חכם" בלבד וטרם הוצלבו.**
  לא מושכים נתוני מועמדים אוטומטית מ-votesmart.

## עדכון סקרים ידני

```
node scripts/update-polls.mjs            # מושך, בודק, כותב את data/polls.js אם משהו השתנה
node scripts/update-polls.mjs --dry-run  # בלי לכתוב
node scripts/update-polls.mjs --check    # רק בודק שכל מקור זמין וניתן לפענוח
node --test tests/*.test.mjs             # הבדיקות
```

אחרי עדכון ידני: `git add data/polls.js && git commit -m "סקרים: עדכון ידני" && git push`.

מה הסקריפט בודק לפני שהוא כותב (ערוץ שנכשל נשאר עם הנתון הקודם):
- סכום המנדטים בסקר הוא 120.
- כל ערך הוא מספר שלם, 0 או לפחות 4.
- תאריך הסקר אינו עתידי ואינו מוקדם מהתאריך ששמור כבר לאותו ערוץ.

הריצה נכשלת (קוד יציאה 1, ובגיטהאב מגיע מייל) כש:
- ערוץ נכשל בבדיקות, או ששני המקורות לא זמינים;
- למפלגה עם 4 מנדטים ומעלה אין נתונים ב-`candidates.js`;
- למפלגה חסר ב-`candidates.js` המועמד במקום "מנדטים + 1".

הנתונים התקינים נכתבים גם כשהריצה נכשלת. באתר, מקום חסר מוצג כ"הבא בתור: מקום k ברשימה".

אזהרות בלי כישלון: ynet לא זמין ועברנו למדד; סתירה בין ynet למדד בסקר מאותו תאריך (משתמשים ב-ynet);
במדד יש סקר חדש יותר מאשר ב-ynet.

חסימה, CAPTCHA או שגיאת HTTP לא נעקפות: הסקריפט שולח בקשה רגילה, ואם היא נחסמת עובר לגיבוי,
ואם גם הוא נכשל הקובץ הקיים נשאר. (הערה: ynet מחזיר 403 לבקשות עם User-Agent מותאם אישית,
ולכן הסקריפט שולח את ברירת המחדל של Node.)

`UPDATED` הוא תאריך הריצה שבה הנתונים השתנו בפועל (D.M.YYYY, שעון ישראל).

## הוספה או תיקון של מועמד

עורכים את `data/candidates.js` ידנית. כל מפלגה: `{ id, ord, name, leader, list: { <מקום>: מועמד } }`.
המזהה (`id`) חייב להיות זהה למזהה ב-ynet (`yesh`, `likud`, `beyahad`, `democrats`, `yb`, `joint`, `utj`,
`otzma`, `shas`, `rz`, `raam`, `miluim`, `amcha`). `ord` קובע את הסדר בין מפלגות עם אותו מספר מנדטים.

שדות מועמד:

| שדה | | |
|---|---|---|
| `n` | חובה | שם |
| `g` | חובה | `"m"` / `"f"` (קובע ניסוחים: "הבא/הבאה בתור", "נכנס/נכנסת") |
| `t` | חובה | תפקיד, שורה אחת |
| `st` | | `"in"` ח"כ מכהן · `"min"` שר · `"new"` פנים חדשות · `"back"` חוזר לכנסת |
| `age`, `city` | | |
| `was` | | "ברזומה" |
| `fun` | | "שווה לדעת" |
| `img` | | כתובת תמונה, נתיב מקומי (`photos/...`) או `null` לראשי תיבות |
| `imgSource` | | הכתובת המקורית של תמונה שהורדה (ממלא `fetch-photos.mjs`) |

מספיק למלא את המקומות שיכולים להיות רלוונטיים: מ"מנדטים בסקר" ועד כמה מקומות אחריו, או 1–4 למפלגה מתחת לחסימה.
אחרי עריכה: `node scripts/update-polls.mjs --dry-run` כדי לוודא שאין חוסרים, ואם הוספתם תמונה מאתר הכנסת או מוויקימדיה,
`npm install` (פעם אחת) ואז `node scripts/fetch-photos.mjs`.

## תמונות

`node scripts/fetch-photos.mjs` מוריד רק מ-`fs.knesset.gov.il` ומ-`upload.wikimedia.org`, שומר
`photos/<partyId>-<place>.webp` ברוחב עד 640 פיקסלים, ומעדכן את `img` ו-`imgSource` ב-`candidates.js`.
כל שאר התמונות נשארות קישור חיצוני כמו בדגם. הסטטוס של כל תמונה ב-`PHOTOS.md`.

## תזמון

GitHub Actions (`.github/workflows/update-polls.yml`): כל 3 שעות, בדקה 17. מ-28.10.2026 (שעון ישראל) הריצה
נעצרת בצעד הראשון. commit נעשה רק כש-`data/polls.js` השתנה; כל commit כזה מפעיל פריסה ב-Vercel.
הפעלה ידנית: Actions → update-polls → Run workflow. הסימון `check_only` רק בודק שהמקורות נגישים מהשרתים של GitHub.

**גיבוי, אם השרתים של GitHub נחסמים:** כבו את ה-workflow ורשמו משימה מתוזמנת ב-Windows (PowerShell):

```
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\Users\ZivReichert\haba-bator\scripts\update-local.ps1"
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(1) -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration (New-TimeSpan -Days 22)
Register-ScheduledTask -TaskName "haba-bator update-polls" -Action $a -Trigger $t -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
```

היומן נכתב ל-`logs/update-polls.log`. הסרה: `Unregister-ScheduledTask -TaskName "haba-bator update-polls"`.

## אחרי הבחירות

מ-28.10.2026 השעון לבחירות נעלם והשורה האחרונה בתחתית העמוד מתחלפת ל"הבחירות התקיימו ב-27.10.2026.
מוצגים הסקרים האחרונים שפורסמו לפניהן." (לפי התאריך בדפדפן של הגולש).
