# MarketerPro Lead Desk

Interactive prototype of a lead desk: auto-assignment instead of cherry-picking, spam review queue with return, priorities, time in status, team metrics, product metrics and an agent workspace.

- Languages: English, Українська, Deutsch, Français
- Light and dark theme, Montserrat font
- Responsive from 320 px phones to 4K screens, touch-friendly controls
- Product metrics: budget waiting, pipeline by source/industry/segment, KPI against a target, AI spam precision from your own review decisions, data quality, and a list of metrics that need more data
- Plain HTML, CSS and JavaScript. No build step, no dependencies, no server.

## Files

```
index.html          page markup
css/styles.css      all styles (light and dark theme, breakpoints)
js/app.js           application logic, charts, CSV import, storage layer
js/i18n.js          interface translations (en, uk, de, fr)
js/data.js          demo data (replaced by your own CSV imports)
data/*.csv          the same demo data as CSV, handy for trying the import
```

## Publish on GitHub Pages

1. Create a repository and upload everything from this folder, keeping the folder structure.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the page is live at `https://<your-username>.github.io/<repository>/`.

The page also works by opening `index.html` directly in a browser.

## Database

GitHub Pages serves static files only, so there is no server database. Data lives in two places:

- **In the repository:** `js/data.js` (demo data) and `data/*.csv`. Edit or replace these to change what visitors see first.
- **In each visitor's browser:** IndexedDB, a real database built into the browser. It keeps imported CSV data, spam review decisions, "done" marks and added or removed agents. Language and theme use local storage. Data from an earlier local-storage version is migrated automatically. If IndexedDB is unavailable, the page falls back to local storage.

Data saved this way is private to one browser on one device. To share data between people or devices you need a server database such as Supabase, Firebase or your own API. The storage layer is a small object named `db` near the top of `js/app.js` with `open()`, `get(key)` and `set(key, value)`, so it can be swapped for a server-backed version without touching the rest of the code.

## Use your own data (CSV)

Open **Team → Import your data (CSV)**. Each file is optional, and every row is checked before anything is replaced. Templates can be downloaded from the same panel.

| File | Required columns | Optional columns |
|---|---|---|
| Agent daily statistics | `date` (YYYY-MM-DD), `agent`, `capacity`, `done`, `lead_time_h`, `cycle_time_h` | `assigned`, `critical_total`, `critical_in_sla` |
| Leads | `id`, `name`, `status` | `request`, `segment`, `industry`, `source`, `priority`, `qual`, `agent`, `age_h`, `status_since_h`, `repeats`, `paid`, `budget`, `dup_of`, `spam_reason`, `conf` |
| Daily inflow | `date`, `new_leads` | |

Allowed values: `status` is New, In Progress, Waiting for Brief, Proposal or Won; `priority` is Critical, High, Normal or Low; `qual` is Warm, Cold, Spam or Duplicate; `spam_reason` is nocontact, repeat, domain, gibberish or offtopic. Agent names in the leads file should match the agent statistics file. Comma, semicolon and tab separators are detected automatically.

Files never leave the browser. The **Back to demo data** button clears imported data.

## Notes

- Montserrat loads from Google Fonts. Without internet the page falls back to the system sans-serif font.
- Lead names, budgets and statistics are generated for the demo.
- Link - https://annatsygichko-fe.github.io/leaddesk/
