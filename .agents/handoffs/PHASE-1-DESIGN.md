# Phase 1 design — core CRM data model

Status: agreed plan (lead-claude, 2026-10-01). Decisions D1–D4 in ROADMAP.md apply. Every Phase 1 task links
here; if you need to deviate, post a `QUESTION` to `@lead` first and update this file.

## Naming

| UI word | API | DB table | Notes |
|---|---|---|---|
| Workspace | `/api/projects` | `projects` | "Project" is renamed to "Workspace" in the UI only (T-029) |
| Contact | `/api/contacts` | `leads` (kept!) | Table is **not renamed** — too much code depends on it. Contacts API is the new name. |
| Company | `/api/companies` | `companies` | new |
| Deal | `/api/deals` | `deals` | new |
| Pipeline / stage | `/api/pipelines` | `pipelines`, `pipeline_stages` | new; for deals |
| Outreach status | `/api/stages` | `stages` | existing lead stages stay as the contact's outreach status (D2) |

## Contacts = leads + clients merged (D1) — migration 006 (T-020)

Add to `leads`:
- `lifecycle TEXT NOT NULL DEFAULT 'lead'` — one of `lead | qualified | customer | churned` (`status='dead'` stays
  as-is and is orthogonal: a dead contact is hidden from active lists).
- `owner_id TEXT` (→ accounts.id, nullable), `company_id TEXT` (→ companies.id, nullable),
  `source TEXT DEFAULT ''` (`gmaps`, `csv`, `manual`, `form`, `whatsapp`…), `custom TEXT NOT NULL DEFAULT '{}'`
  (custom field values, JSON), `updated_at INTEGER`.

Data migration of `clients`:
1. Client with `lead_id` that exists → update that lead: `lifecycle='customer'`, fill empty contact fields from the
   client, `owner_id = assigned_to`, append client notes; copy `client_tags` → `lead_tags`.
2. Client without a lead → insert a new `leads` row (same project, `lifecycle='customer'`, `stage_id` = first
   stage of the project, `source = client.source or 'manual'`).
3. Keep a mapping table `client_contact_map(client_id, contact_id)` so `client_activities` can be moved to the
   Phase 2 timeline later. **Do not drop `clients`** in this migration (rollback safety); it becomes read-only.

API: `/api/contacts` (CRUD, list with pagination + filters: lifecycle, owner, company, stage, tag, search,
custom fields later). `/api/leads` keeps working (alias over the same table). `/api/clients` becomes a
compatibility shim that reads contacts with `lifecycle='customer'` and writes through to contacts.

## Companies — migration 007 (T-021)

`companies(id, project_id, name, domain, industry, size, phone, email, website, address, city, country, notes,
owner_id, custom TEXT DEFAULT '{}', created_at, updated_at)`. Index `(project_id, name)`, `(project_id, domain)`.
Contact → company is many-to-one via `leads.company_id`. Google Maps import (gmaps.js) creates/links a company
per place (dedupe by name + phone within project) and a contact for it.

## Pipelines & deals — migration 008 (T-022)

- `pipelines(id, project_id, name, sort_order, created_at)` — every workspace gets a default "Sales" pipeline.
- `pipeline_stages(id, pipeline_id, project_id, name, color, sort_order, probability INTEGER 0–100,
  rot_days INTEGER NULL, kind TEXT DEFAULT 'open')` — `kind` ∈ `open | won | lost`; default stages:
  Qualified 10, Contact made 20, Proposal 50, Negotiation 75, Won (won) 100, Lost (lost) 0.
- `deals(id, project_id, pipeline_id, stage_id, title, value REAL DEFAULT 0, currency TEXT, contact_id,
  company_id, owner_id, expected_close INTEGER, status TEXT DEFAULT 'open' (open|won|lost), lost_reason,
  won_at, lost_at, custom TEXT DEFAULT '{}', created_at, updated_at, stage_changed_at)`.
- `deal_stage_history(id, deal_id, stage_id, at, account_id)`.
- Moving a deal into a `won`/`lost` stage sets `status` + `won_at/lost_at`; moving a contact's deal to won sets
  the contact's lifecycle to `customer` (only upgrades, never downgrades).
- Workspace currency: setting `currency` (default `USD`); `deals.currency` defaults to it.

## Custom fields — migration 009 (T-025)

`custom_fields(id, project_id, entity ('contact'|'company'|'deal'), key, label, type, options TEXT '[]',
required INTEGER, sort_order, created_at)`, unique `(project_id, entity, key)`.
Types: `text, textarea, number, money, date, select, multiselect, checkbox, url, email, phone, user`.
Values live in each entity's `custom` JSON column; the server validates against the definitions on write
(unknown keys dropped, types coerced, required enforced). Filtering: `json_extract(custom, '$.key')`.

## Ownership (T-026)

`owner_id` on contacts, companies, deals. Default owner = creator. Lists accept `owner=me|<id>|none`. Bulk
"assign owner". Owner must be a member of the workspace (check `project_members` or admin).

## Conventions for all Phase 1 endpoints

- Scoping + `ownedIds/isOwned` for every foreign id (add new tables to the `SCOPED` set in `lib/scope.js`,
  to `SCOPED_TABLES` handling and to the project delete cascade).
- Permissions: reuse `leads.*` for contacts & companies for now; add `deals.view|edit|delete` and
  `settings.edit` for pipelines/custom fields. Add new perms to `ALL_PERMISSIONS` and to Accounts.jsx groups.
- Lists paginate with `lib/paginate.js`; enrichment batched with `groupBy`.
- Every task ships tests, including a cross-workspace isolation test.
- `logAudit` on every mutation.
