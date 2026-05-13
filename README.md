# SickFit Nexus

SickFit Nexus is an Operational Command Center that turns messy PO CSVs into clean inventory intelligence, vendor visibility, forecasting alerts, and executive-ready reports.

## Stack

- React + TypeScript + Vite
- Supabase Postgres
- Recharts
- PapaParse

## What is included

- CSV import workflow with drag-and-drop upload, preview, header mapping, preset saving, validation, duplicate detection, import history, and failed-row review
- Purchase order tracking with filters, detail pages, line items, comments, and activity feed
- Inventory tracking with manual adjustments, inventory events, low-stock indicators, and rule-based forecasting calculations
- Alerts, vendor scorecards, executive reporting, SOP library, wins board, people directory, training modules, and branding settings
- Supabase SQL schema, seed data, and sample CSV import file

## Setup

1. Install dependencies:

```bash
npm install --include=dev
```

2. Copy `.env.example` to `.env` and fill in:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. In Supabase SQL editor, run:

- [src/db/migrations/001_init.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/001_init.sql)
- [src/db/migrations/002_public_mvp_policies.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/002_public_mvp_policies.sql)
- [src/db/seed.sql](/c:/Users/Vinbi/SickFitNexus/src/db/seed.sql)

4. Start the app:

```bash
npm run dev
```

5. Import the sample file from:

- [public/sample-po-import.csv](/c:/Users/Vinbi/SickFitNexus/public/sample-po-import.csv)

## Notes

- This MVP intentionally does not implement Supabase Auth, login, signup, or sessions.
- Supabase is used strictly as the database/backend layer.
- `002_public_mvp_policies.sql` creates wide-open RLS policies for a no-auth MVP. This is appropriate for development/demo use, but should be tightened before production.
- Business logic is kept in `src/services` and `src/utils`, with UI kept in `src/components`, `src/features`, and `src/pages`.
- If Supabase env vars are missing, the UI will still load but data-backed actions will prompt for configuration.
