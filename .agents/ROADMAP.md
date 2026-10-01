# LeadDesk roadmap — from outreach tool to full CRM

**Goal:** a self-hosted CRM good enough that a small/medium business can cancel HubSpot / Pipedrive / Zoho /
Kommo subscriptions. It must keep its current strengths (Google Maps lead gen, WhatsApp outreach, one-box
self-hosting with SQLite) and add everything a sales team uses every day.

Written 2026-10-01. Docker work is parked by @human. Phases are ordered by dependency; inside a phase, epics
can run in parallel. Each epic is broken into board tasks (`.agents/BOARD.md`) when its phase starts.

---

## 0. Where we are vs. a real CRM

| Capability | Paid CRMs | LeadDesk today |
|---|---|---|
| Contacts & companies | separate linked records | `leads` + `clients` (duplicated tables, no companies) |
| Deals / opportunities | value, currency, close date, probability, multiple pipelines | ✗ (stages are on leads, no money) |
| Kanban pipeline | ✓ | ✗ (table only) |
| Custom fields | ✓ | ✗ (fixed columns) |
| Record owner / assignment | ✓ | `clients.assigned_to` only, unused |
| Tasks, reminders, calendar | ✓ | ✗ |
| Notes / activity timeline | ✓ | `client_activities` (clients only), `stage_history` |
| WhatsApp two-way inbox | Kommo, Respond.io | outbound only; inbound messages are **dropped** |
| Email send / receive / tracking | ✓ | UI + tables, **no sending at all** |
| Sequences & automations | ✓ | fixed broadcast runner only |
| Web forms / lead capture | ✓ | CSV + Google Maps only |
| Reports & forecasting | ✓ | counts dashboard |
| Quotes / invoices / products | ✓ (paid tiers) | ✗ |
| API, webhooks, integrations | ✓ | ✗ |
| Per-user data visibility | ✓ | every user sees every project |
| Scale (10k+ records) | ✓ | leads list loads everything, 3 queries per lead |
| Lead generation (Maps scraping) | ✗ / paid add-on | ✓ **our edge** |

---

## Phase 0 — Foundation (must come first)

Everything later depends on this. No new features until done.

- **E0.1 Commit & stabilise the multi-project refactor** (T-001).
- **E0.2 Security fixes**: project ownership checks (T-004), permissions on every route (T-005), Socket.IO
  auth (T-007), SQL in backup restore (T-008).
- **E0.3 Versioned migrations**: replace ad-hoc `try { ALTER }` with `server/migrations/NNN-name.js` +
  a `schema_migrations` table. Every later phase adds tables — this has to exist first.
- **E0.4 Test harness**: `node --test` + supertest on a temp DB (`DB_PATH` env). Tests for auth, scoping, CRUD.
  Every later task must add tests for its endpoints.
- **E0.5 Scale**: server-side pagination/sorting/filtering for leads & clients (`?page&limit`, return `total`),
  batch the per-lead campaign/tag/history queries, indexes on hot columns.
- **E0.6 Background worker**: a DB-backed job queue (`jobs_queue` table + one worker loop, retries, run_at).
  Reminders, email sending, sequences, automations and scraping all run on it. Keep it in-process — no
  Redis, so self-hosting stays one process.
- **E0.7 Project membership**: `project_members(project_id, account_id, role)`; `resolveProject` checks
  membership; admins see all.

## Phase 1 — Core CRM data model

- **E1.1 Contacts (merge leads + clients)**: one `contacts` table with `lifecycle_stage`
  (`lead → qualified → customer → churned`, plus `dead`). Migrate `leads` and `clients` into it, keep ids.
  "Convert to client" becomes a lifecycle change. Old endpoints stay as thin aliases for one release.
  → *Decision D1 below.*
- **E1.2 Companies**: `companies` (name, domain, industry, size, address, phone, website, socials).
  Contacts ↔ company (many-to-one). Google Maps imports create a company + a contact.
- **E1.3 Deals & pipelines**: `pipelines`, `pipeline_stages` (with win probability, rotting days),
  `deals` (title, value, currency, contact, company, owner, stage, expected_close, status open/won/lost,
  lost_reason). Stage history for deals.
- **E1.4 Kanban board**: drag-and-drop deals across stages, totals per column, filters by owner/pipeline.
  Also a kanban view for contact lifecycle / outreach stages.
- **E1.5 Custom fields**: `custom_fields(entity, key, label, type, options, required)` + values stored as JSON
  column on each entity. Types: text, number, money, date, select, multi-select, checkbox, url, phone, user.
  Shown in forms, filters, table columns, import mapping, export.
- **E1.6 Ownership**: `owner_id` on contacts, companies, deals; "my records" filters; reassign in bulk.
- **E1.7 Record pages**: full-page contact / company / deal view (not just modals) with details panel,
  related records and the timeline (Phase 2).
- **E1.8 Saved views & global search**: save filter+column sets per user; one search box across contacts,
  companies, deals (SQLite FTS5).
- **E1.9 Dedupe & merge**: detect duplicates by phone/email/domain, merge two records keeping history.

## Phase 2 — Activities & productivity

- **E2.1 Unified timeline**: `activities(entity_type, entity_id, type, body, meta, account_id, created_at)` —
  notes, calls (with outcome & duration), meetings, stage changes, messages, emails, system events.
  Replaces `client_activities` and feeds every record page.
- **E2.2 Tasks & reminders**: `tasks(title, due_at, priority, assignee, related entity, done_at)`.
  "My tasks today / overdue" page, reminders via the worker.
- **E2.3 Notifications**: in-app bell (task due, deal assigned, new inbound message, @mention), optional
  email/WhatsApp-to-self.
- **E2.4 Calendar**: month/week view of tasks & meetings; ICS feed per user (Google/Outlook can subscribe).
- **E2.5 Attachments**: file uploads on any record (`server/uploads/`, size limits, type checks).
- **E2.6 Click-to-call / click-to-WhatsApp** buttons that log an activity.

## Phase 3 — Communication hub

- **E3.1 WhatsApp inbox**: store every inbound/outbound message (`messages` table: channel, direction,
  contact, body, media, status/acks). Conversation list + chat view, reply from the CRM, unknown numbers
  create a contact. Delivery/read ticks from `messages.update`. This is the #1 reason people pay for Kommo.
- **E3.2 Email sending**: SMTP per project (settings), send one-off emails from a record, make
  `email_campaigns` actually send via the worker with throttling, unsubscribe link + suppression list.
- **E3.3 Email receiving**: IMAP sync of the connected mailbox, match to contacts by address, show on timeline.
- **E3.4 Tracking**: open pixel + click redirect for emails; campaign stats.
- **E3.5 Unified inbox**: one screen for WhatsApp + email conversations, assign conversation to user,
  open/closed status.
- **E3.6 Templates everywhere**: shared template library for WA & email with variables from contact,
  company, deal and custom fields.

## Phase 4 — Automation

- **E4.1 Workflow engine**: triggers (record created, field changed, stage changed, tag added, inbound
  message, form submitted, date reached, no activity for N days) → conditions → actions (send WA/email,
  create task, assign owner, change stage, add tag, wait, webhook). Stored as JSON, executed by the worker,
  every run logged.
- **E4.2 Sequences / drip campaigns**: multi-step WA + email sequences per contact, auto-stop on reply.
  Generalises the current broadcast runner (keep its anti-ban pacing).
- **E4.3 Assignment rules**: round-robin / by territory / by source.
- **E4.4 Lead scoring**: rule-based points (has email, replied, opened, industry…), shown as a column.
- **E4.5 Web forms**: form builder → embeddable HTML/JS snippet + hosted page; submissions create contacts
  and fire workflows. Spam protection (honeypot + rate limit).

## Phase 5 — Reporting

- **E5.1 Sales reports**: pipeline value by stage, weighted forecast, win rate, avg deal size, sales cycle
  length, lost reasons.
- **E5.2 Activity reports**: calls/messages/emails/tasks per user per period; leaderboard.
- **E5.3 Marketing reports**: source → contact → deal → won funnel; campaign/sequence performance;
  Google Maps query ROI.
- **E5.4 Custom dashboard**: extend the existing configurable dashboard with these widgets, date ranges,
  per-user / per-team filters.
- **E5.5 Scheduled reports**: weekly email summary.

## Phase 6 — Sales documents

- **E6.1 Products & price list** (name, SKU, price, tax, currency).
- **E6.2 Deal line items** → deal value computed from products.
- **E6.3 Quotes**: generate PDF from deal, send by email/WhatsApp, public accept link.
- **E6.4 Invoices & payments**: numbered invoices, statuses (draft/sent/paid/overdue), payment records,
  reminders for overdue.

## Phase 7 — Platform & polish

- **E7.1 Public REST API** with per-project API keys + docs page.
- **E7.2 Outgoing webhooks** for record events (lets people plug in n8n/Zapier/Make).
- **E7.3 Import/export for every entity** with field mapping (incl. custom fields), and a
  "import from HubSpot/Pipedrive CSV" preset — critical for people switching.
- **E7.4 Backup/restore** of the full DB from the UI, scheduled backups.
- **E7.5 Mobile**: responsive pass on all pages + PWA (installable, push notifications).
- **E7.6 i18n** (English + Arabic with RTL) and multi-currency.
- **E7.7 AI assistant (optional)**: summarise a contact's history, draft WA/email replies, suggest next
  step. Off by default, user supplies their own API key.

---

## Suggested first milestone (MVP "can replace Pipedrive for a small team")

Phase 0 + E1.1–E1.4, E1.6, E1.7 + E2.1, E2.2 + E3.1 + E3.2.
Result: contacts & companies, deals with a kanban pipeline, owners, timeline, tasks, WhatsApp two-way inbox,
email sending — plus the Google Maps + WhatsApp outreach we already have.

## Open decisions for @human

- **D1 Leads vs clients**: merge into one `contacts` table with a lifecycle stage (recommended — one place
  for history, how HubSpot works), or keep them separate?
- **D2 Current stages**: keep existing lead stages as the *contact outreach status*, and give deals their own
  pipelines (recommended), or move everything onto deals?
- **D3 Target users**: single company self-hosting (current), or one install serving several client
  businesses (agency / SaaS mode → needs stronger tenant isolation, billing, signup)?
- **D4 Database**: stay on SQLite (recommended up to ~a few hundred thousand records and ~20 users), or plan
  for Postgres now?
- **D5 WhatsApp**: stay on Baileys (free, unofficial, ban risk) or also support the official WhatsApp Cloud
  API (paid per conversation, no ban risk, needs Meta business verification)?
- **D6 Language**: is Arabic/RTL needed in the first milestone?
