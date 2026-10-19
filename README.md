# Sales CRM

A CRM and sales pipeline for founders who do their own selling: leads,
companies, deal stages, follow-ups, meeting history, and sales forecasts.
Self-hosted on PocketBase — your data, your server.

## Features

- **Saved views.** The filter combinations you work from every day - "cold
  leads in SaaS", "deals closing this quarter, biggest first" - saved by
  name on Leads, Companies, and the deals list, as a row of chips above the
  filters. One click applies one; one can be the view the page opens with;
  rename, reorder, and delete are in the chip's own menu. A view is a
  filter set, not a snapshot, so it re-runs every time - and a condition
  that no longer exists (a deleted tag, a removed stage) is ignored and
  said out loud rather than quietly emptying the list.
- **Command palette.** `Cmd/Ctrl+K` (or `/`) searches every contact,
  company, deal, follow-up, logged activity, and saved view at once, ranked
  and grouped, with quick actions and full keyboard navigation.

- **Pipeline board.** Deals move through New, Qualified, Proposal,
  Negotiation, Won, and Lost. Drag cards between stages on desktop, or use
  the per-card move menu (works with keyboard and touch, and doubles as the
  accessible path).
- **Board or list.** The same deals as a Kanban board or a sortable table
  (deal, company, stage, value, expected close, last updated), with shared
  filters: text search, stage, and close-date window. On the board, Won and
  Lost collapse to a total while you work the open stages.
- **Your funnel, your stages.** Rename, reorder, add, and remove open stages
  in Settings (up to eight); Won and Lost stay pinned as the terminals.
  Removing a stage that holds deals asks where they should go.
- **Stage history.** Every stage change is recorded, so a deal page shows
  "In Proposal for 12 days" and the journey that got it there. The board
  marks deals that have sat too long (threshold in Settings), the dashboard
  lists the most stalled, and the forecast reports average days per stage.
- **Leads and companies.** People and accounts with detail pages that gather
  every deal, follow-up, and logged interaction in one place.
- **Follow-ups.** Dated reminders tied to a lead or deal, with an optional
  time, grouped into overdue, today, and upcoming. The nav badge shows what
  needs eyes now.
- **Playbooks.** Save the cadence you run every time - recap the same day,
  nudge in three days, check in after two weeks, each step optionally
  carrying an email template - and apply it to a lead or deal in one click.
  A preview shows the dates before it commits, the whole application is one
  Undo, and a playbook can offer itself when a deal reaches a stage (it
  always asks, and only when nothing else is booked).
- **A week you can see.** Follow-ups as a month grid or a week strip
  beside the list: each day holds its items with a count, tinted for
  overdue and today, with open deal close dates riding along as the other
  dated commitment. Drag a follow-up to another day to reschedule it, or
  tap it (the keyboard and touch path) - one Undo either way. The list
  stays the default, and a phone gets the week as a stack of days rather
  than a shrunk month.
- **Reminders that leave the app.** Opt in to browser notifications for a
  daily digest and timed nudges while a tab is open, and export open
  follow-ups (plus deal close dates) as an .ics file for the calendar you
  already check.
- **Going cold.** Last-contact dates are derived from logged activity and
  shown on lead rows, lead pages, and deal pages. A Going cold filter on
  Leads ranks the quietest first, and the dashboard surfaces both drifting
  leads and open deals with no next step, each with one-click actions.
- **Meeting history.** Meetings, calls, emails, and notes logged against
  contacts, companies, and deals.
- **Activity log.** Every touch in one place, newest first, with filters
  for type, date window, and the record it was logged against, plus search
  over what you wrote. Set a weekly touch target in Settings - overall or
  per type ("8 calls, 3 meetings") - the log and the dashboard track
  this week against it, with pace for the day of the week.
- **Win/loss reasons.** Closing a deal asks why (skippable in one click),
  and the Forecast page turns those answers into a report: why deals close,
  win rate by lead source and industry, average won vs lost deal size.
- **The whole buying committee.** A deal links the two to four people who
  actually decide it, each with a role - champion, decision maker,
  influencer, blocker - and its page lists them with their last-contact
  dates. Its timeline gathers what was said to any of them, going-cold
  reads the freshest touch across all of them, and the dashboard chases
  open deals where nobody is named as the person who signs.
- **Custom fields.** Define your own fields per record type in Settings -
  text, number, date, choice, or yes/no - and they appear on the add and
  edit forms and on detail pages. Choice and yes/no fields join the filter
  rows on Leads, Companies, and the deals list, and every field exports as
  its own CSV column and imports back by name. Changing a field's type
  converts what is stored or refuses; it never drops a value.
- **Subscriptions, priced properly.** A deal bills one-time, monthly, or
  annually over a contract term, and MRR, ARR, and total contract value are
  derived from that - never stored twice. The pipeline values a $2k/mo deal
  at its whole contract, the forecast spreads it across the months it
  actually bills instead of spiking the close month, and the monthly goal
  counts what billed in that month.
- **Where deals leak.** A conversion funnel on the Forecast page, derived
  from stage history: per stage, how many deals ever reached it, how many
  advanced, how many died there and what share of all losses that is, plus
  entry-to-won overall. Read it for all time, this quarter, last quarter,
  or the year. Deals that closed before stage tracking are excluded and
  counted, never passed off as instant conversions.
- **Forecast.** A month-by-month chart of weighted pipeline (deal value times
  stage probability) against best case, with won revenue alongside. Stage
  weights are tunable in Settings as real conversion rates emerge.
- **Monthly revenue goal.** Set the number you sell against in Settings and
  the dashboard turns won revenue into progress against it, with pace for
  the day of the month. The forecast draws the goal across the months ahead
  and reports pipeline coverage.
- **Dashboard.** Open pipeline, MRR, weighted forecast, won this month, win
  rate, what needs attention today, and recent activity.
- Light, dark, and system themes (system is the default). Responsive,
  app-like layout: sidebar on desktop, tab bar and floating action button on
  mobile.
- **AI assist** (optional). Three buttons: paste a signature/scribbles into
  a new lead or company and have fields extracted, draft an email from a
  template, or summarize a long history. Every result lands in an editable
  field — nothing is saved automatically.
- **CSV in and out.** Import leads, companies, or deals from a spreadsheet
  with auto-detected column mapping, a preview, and merge-by-email (or by
  name) so a re-import updates instead of duplicating. Deal billing and
  contract term ride along, and a file without those columns imports as
  one-time. Export any record type as CSV alongside the full JSON export.
- First-run onboarding with optional sample data, JSON export/import, and a
  guided empty state on every view.

- **Works with no connection.** A service worker caches the app shell, so
  an installed copy launches offline instead of showing nothing, and every
  collection keeps a durable local copy in IndexedDB - so a cold start with
  no network opens your own data. A write the server won't take is queued
  and replayed when it answers: the shell says "waiting to sync", Settings
  lists what is still on its way, and a save that landed locally says so
  rather than claiming more. If another device changed the same collection
  meanwhile, the queued write is held back and you choose which version
  stands - it is never decided quietly.
- **Forgiving deletes.** Every delete offers Undo and lands in Recently
  deleted (Settings) for 30 days, restoring its links on the way back.
  Import, sample-data load, and erase take a one-slot snapshot first, so a
  bad bulk operation is one click from being reversed.

## Collaboration

- **Teams & roles.** Create teams, invite members with roles (owner, admin,
  member, viewer). All data is scoped to the active team.
- **Real-time presence.** See who's viewing a deal or contact in real time.
- **Comments & mentions.** Threaded comments on deals and activities with
  @mention autocomplete for team members.
- **Live updates.** Changes sync instantly across team members via
  PocketBase realtime subscriptions.

## Stack

- [Vite](https://vite.dev) for dev server and build
- [PocketBase](https://pocketbase.io) for auth, database, file storage, realtime
- [Lucide](https://lucide.dev) for icons
- [Vitest](https://vitest.dev) for tests
- No frontend framework

## Development

```sh
npm install
npm run dev:pb     # dev server with PocketBase proxy
npm test           # run the test suite
npm run build:pb   # production build to dist/
```

Or with Docker:

```sh
docker-compose up -d --build
# Open http://localhost/
```

## Deployment

Self-host on any VPS with Docker. Caddy handles HTTPS automatically.

```sh
docker-compose up -d
```

Point your domain to the VPS IP — Caddy provisions Let's Encrypt certificates.

## Storage

Everything lives in PocketBase (SQLite), one table per collection:
`crm_settings`, `crm_companies`, `crm_contacts`, `crm_deals`,
`crm_activities`, `crm_tasks`, `crm_templates`, `crm_attachments`,
`crm_trash`, `crm_backup`, `crm_kv`, plus `crm_teams`,
`crm_team_members`, `crm_comments`.

Each collection is also mirrored to IndexedDB (`src/lib/outbox.js`):
that copy is what an offline cold start reads, and the queue beside it
holds any write the server hasn't taken yet, with the value the server
last had so a replay can tell "nothing changed" from "another device
wrote".

## License

MIT
