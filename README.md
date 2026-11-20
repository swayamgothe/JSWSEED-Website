# JSW SEED Monthly tracking Dashboard

Light-theme web dashboard (login + dashboard) for monthly CO₂ tracking. Built first for the **Sinter Plants (SP1–SP5)**; designed so other plants can be added later just by adding data.

## Folder structure
```
SEED WEBSITE/
├── assets/jsw-logo.png      <- put your logo here (if missing, a "JSW" badge is shown)
├── css/style.css            <- light theme
├── js/app.js                <- login logic + all dashboard logic
├── dashboard_data.json      <- ALL the numbers (edit/replace this to update the site)
├── index.html               <- dashboard
├── login.html               <- email + password login
└── README.md
```

## How to run (important)
Browsers block `dashboard_data.json` if you just double-click `index.html`. Use a tiny local server:

```bash
cd "SEED WEBSITE"
python -m http.server 8000
```
Then open **http://localhost:8000/login.html**
(or use the VS Code "Live Server" extension). Charts load Chart.js 4.4.1 from the internet (cdnjs).

## Demo login (CHANGE BEFORE SHARING)
- Email: `seed.admin@jsw.in`
- Password: `JSWseed@2026`

### Add / change users
1. Open `login.html`, press **F12 → Console**, run: `makeHash('name@jsw.in','TheirPassword')`
2. Copy the printed hash into the `AUTH.users` list at the top of `js/app.js`.
3. Optional: set `allowedEmailDomain: 'jsw.in'` to accept only company emails.

> ⚠️ This login is **front-end only**. It hides the dashboard from casual visitors, but anyone with access to the files can read the user list and the JSON data. For real security, host the site behind company SSO / a server-side login before using real data publicly.

## What the dashboard shows (same as the Excel version)
Selectors **Year · Plant · Month** (+ KPI picker) → headline cards, CO₂ trend vs target, total CO₂, year-on-year, source split (stacked + doughnut), **gap analysis** (auto "why CO₂ went up/down" sentences, charts, table, plant-team remarks), operating KPI table + trend, and all-plants comparison.

## Updating data
Edit `dashboard_data.json`:
- `years[]` → each year has `months`, and `plants{}`.
- Per plant: `net` (t), `plan` (t), `co2{source: [tCO₂ per month]}`, `kpi{kpi: [values]}`, `targets`, `prevYear`, `history`, `remarks`.
- Use `null` for months without data.
- **New month:** replace the `null`s of that month in `net`, every `co2` array and every `kpi` array.
- **New year:** add another object to `years[]` (the Year selector fills itself).
- **New plant:** add another key under `plants` (e.g. `"BF1"`), same fields. The Plant selector, All-Plants totals and charts pick it up automatically.
- Contributors / KPI definitions live at the top of the JSON (`contributors`, `kpis`).
