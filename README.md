# Newtonite OpsPulse — Operations Under Pressure

> **Frontend Practical Assignment — Full-Stack Engineering Assessment**
> Next.js 15 · React 19 · TypeScript · SQLite (better-sqlite3) · Tailwind CSS · Vitest

---

## Live Preview (GitHub Codespaces)

A GitHub Codespace for this repository is already provisioned and the Next.js server runs inside it:

- **Codespace used:** `opspulse-live-preview-jj7prxrgrr7whj7p4`
- **Open it here (requires signing in as the repository owner):**
Preview is running fine
  [https://github.com/codespaces/opspulse-live-preview-jj7prxrgrr7whj7p4](https://github.com/codespaces/opspulse-live-preview-jj7prxrgrr7whj7p4)
- **Port to forward:** `3000` (labels as *OpsPulse Web App*)
- **Visibility:** Private by default — only you can open the preview while you are signed in to GitHub.

How to get the preview URL (the browser link is generated when the Codespace is opened in an editor, so it must be copied once):

1. Go to **github.com/codespaces**, open the Codespace above (button: **Open in browser** or **Open in Visual Studio Code**).
2. Wait until the terminal shows the server is running. If it is not running, run `npm run dev` in the workspace folder.
3. Open the **Ports** tab in the editor. Port `3000` appears as *OpsPulse Web App* (forwarded from `.devcontainer/devcontainer.json`).
4. Right-click / hover the port → **Forwarded Address** → copy the URL. It looks like `https://<codespace>-3000.app.github.dev`.
5. That is the live preview link. It works while the Codespace is running. To share it with someone, set the port visibility to **Public** (Ports tab → Port Visibility), and switch it back or stop the Codespace to cut access.

Notes worth knowing before sharing:

- The Codespace stops automatically after ~30 minutes of inactivity; resume/restart with `gh codespace start -c opspulse-live-preview-jj7prxrgrr7whj7p4`, then run `npm run dev` again inside it (or ask the shell to do it via `gh codespace ssh`).
- Dependencies are installed and the demo database is seeded automatically on Codespace creation (`postCreateCommand`: `npm ci && npm run seed`).
- Making a port Public lets anyone with the link open your running app — disable it again when you are done showing.

---

## What this project is

Newtonite OpsPulse is an internal operations coordination app built for the assignment brief: mission-critical work items (production incidents, customer escalations, payment investigations, compliance reviews) that would otherwise get lost across chat threads, spreadsheets, and email.

The centre of the project is not CRUD. The interesting part is correctness under pressure — five specific failures that plague real ops tools, each handled at the database and service level, and each provable with a one-click Chaos & Concurrency Simulator built into the UI.

## The five correctness mechanisms

**1. Atomic work claiming.** Two engineers clicking "Claim" on the same critical incident at the same millisecond must never both own it. The claim is a single conditional SQL statement: `UPDATE ... WHERE id = ? AND assigned_to IS NULL AND version = ?`. The database decides the winner; the loser gets an immediate `409 Conflict` that names who won. There is no application-level check that could race.

**2. Optimistic concurrency control (OCC).** Every work item carries a `version` integer. Any mutation must send the `expected_version` the client believes is current. If the row has moved on, the update is rejected with `409 Conflict`, and the response includes the server's current state plus the list of fields that actually conflict. The UI turns that into a three-way diff modal, so the loss of an update is a human decision, never a silent overwrite.

**3. Request idempotency.** Mutating requests take an `X-Idempotency-Key` header. The key is inserted into an `idempotency_records` table atomically. If the same key arrives again after the first request completed, the exact cached response is replayed with an `X-Cache-Lookup: HIT-IDEMPOTENT` header — no duplicate rows. If a duplicate arrives *while* the first request is still processing, it is rejected with `409 CONCURRENT_DUPLICATE_REQUEST` rather than being left to race. Either way, a double-click can only ever cause exactly-once side effects.

**4. Guarded state machine and RBAC.** Status changes are validated server-side against a declarative transition graph. Illegal jumps (for example `TRIAGE → RESOLVED`) are refused with `400`. Layered guards enforce the sensitive business rules: reopening a `CLOSED` item requires `ADMIN`/`MANAGER` plus a written justification (min. 5 chars); moving out of `AWAITING_APPROVAL` requires an approved sign-off; and high-priority `PAYMENT_INVESTIGATION` or `COMPLIANCE_REVIEW` items cannot be resolved without an approved approval record. Role checks live in the domain service, so calling the API with `curl` or Postman cannot cheat the UI rules.

**5. Transactional outbox with retries.** Side events (notifications, status history) are written into an `outbox_events` table in the same ACID transaction as the work item change, so the two can never disagree. The worker processes events with exponential backoff (`2^attempts` seconds) and, after 5 failed attempts, marks the event `FAILED` — a dead-letter queue with error logs for manual replay. An SLA check runs alongside it and flags items that are near breach (WARNING, 1 hour) or past due (BREACHED). See "Known limitations" for the one honest caveat about how the worker is started.

Every mutation writes an entry into an immutable `work_item_activities` audit trail with a structured field diff (e.g. `priority: MEDIUM → CRITICAL`), rendered as the timeline in the item drawer.

---

## Assignment objective / the problems it addresses

The brief: build an enterprise-grade coordination platform for operational work under high concurrency, where correctness failures cost real money:

| Real-world failure | Handling in this project |
|---|---|
| Two operators claim the same incident | Atomic conditional `UPDATE ... WHERE assigned_to IS NULL` |
| A stale browser tab silently overwrites fresh data | OCC version counters + 3-way diff conflict UI |
| Double-click / retry duplicates a wire freeze | `X-Idempotency-Key` replay table (exactly-once) |
| Sensitive item resolved without sign-off | Server-side FSM guards + approval workflow |
| Notification lost during a crash | Transactional outbox + backoff + DLQ |

## Tech stack

- **Next.js 15.5 (App Router) + React 19 + TypeScript** — frontend, API routes, and background jobs in one Node process.
- **SQLite via better-sqlite3**, WAL mode — an embedded database, so the entire system runs with one `npm run dev`. All five mechanisms use portable SQL (conditional writes, transactions, upserts); swapping to Postgres is a driver change, not a rewrite.
- **Tailwind CSS 3** for the UI, **zod** for API validation, **lucide-react** icons.
- **Vitest** for automated tests (9 tests across 4 suites).
- Node.js ≥ 18.18 (developed and verified on Node 22/24; the Codespace image uses 22).

## Architecture overview

```
Browser (React 19, Command Center)      SSE + optimistic UI state
        │  REST (Zod-validated)         ▲
        ▼                               │  /api/events (text/event-stream)
Next.js route handlers ─ domain services (idempotency, FSM, audit, outbox)
        │  ACID transactions (WAL)
        ▼
SQLite (.data/opspulse.db)
work_items · work_item_activities · work_item_approvals
idempotency_records · outbox_events · users · teams · user_teams
```

The important engineering decisions (OCC vs pessimistic locking, atomic-claim vs distributed mutex, outbox vs inline dispatch, domain-enforced FSM vs UI gating, keyset pagination vs in-memory slicing) are documented with alternatives and trade-offs in `ENGINEERING_DECISIONS.md`. `plan.md` holds the original implementation plan from before any code was written.

Key structure:

```
lib/db/               SQLite connection (WAL, busy_timeout 5s), schema.sql, seed
lib/services/         domain logic: work-item.service, state-machine,
                      audit.service, idempotency.service, outbox.worker, event-bus
app/api/...           REST endpoints (see table below)
components/           kanban board, detail drawer, conflict modal,
                      concurrency simulator, badges, SLA indicator
tests/                vitest suites per mechanism
```

## Running locally

```bash
npm install          # or: npm ci
npm run seed         # creates .data/opspulse.db with 5 teams, 8 users, 10 work items
npm run dev          # http://localhost:3000
```

Tables of note:

- `npm run seed` **wipes and rebuilds** the demo data (it is a fixed seed, not a migration), which is what you want for demos: three intentionally unclaimed items (OPS-1003, OPS-1006, OPS-1008) exist specifically for claim-race testing.
- The server binds all interfaces (visible as the `Network:` address in the dev output), so it works unchanged in Codespaces or on a LAN — no hostname flag needed.

## GitHub Codespaces

Everything needed lives in `.devcontainer/devcontainer.json`: Node 22 Debian image, `forwardPorts: [3000]` with the auto-open preview label, `postCreateCommand` that runs `npm ci && npm run seed`, and the `sshd` feature so the built-in terminal/SSH tooling works from any editor. There are no environment variables and no external services to configure — the database is file-based and local to the workspace.

## Database setup and seeding

- Schema: `lib/db/schema.sql` — 8 tables with FKs, CHECK constraints, and indexes on the standard query paths (status, priority, team, assignee, cursor, outbox state).
- The connection in `lib/db/index.ts` enables `journal_mode = WAL` and `busy_timeout = 5000`, so concurrent readers don't block writers mid-demo.
- `npm run seed` rebuilds everything deterministically (teams, users, cross-team memberships, work items in every lifecycle phase, pending approvals, breached/healthy SLAs).
- Tests use a separate throwaway database (`resetTestDb()`), so running the suite never touches the demo data.

## Automated tests — verified status

```bash
npm test
```

Passed on **18 October 2026** on this machine and inside the Codespace-equivalent stack:

| Suite | Tests | Covers |
|---|---|---|
| `concurrency.test.ts` | 2 | parallel claim race ends 1 winner + 1×`ALREADY_CLAIMED`; stale OCC update rejected |
| `idempotency.test.ts` | 1 | same key twice → operation executes once, second call replays cache |
| `state-machine.test.ts` | 3 | illegal transitions rejected; approval gates hold |
| `outbox.test.ts` | 3 | transactional enqueue; exponential backoff; DLQ after max attempts |

**9/9 passing.** These are the actual runs — the count matches the suites committed in `tests/`.

## API overview

All mutating endpoints expect an actor via `X-User-Id` (the UI's persona switcher supplies it) and `X-Idempotency-Key` on creates. Concurrency-protected mutations include `version`/`expected_version`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/work-items` | GET | list with filters, cursor pagination, live metrics |
| `/api/work-items` | POST | create (idempotent) |
| `/api/work-items/:id` | GET | item + timeline + approvals + presence |
| `/api/work-items/:id` | PATCH | OCC-guarded field updates |
| `/api/work-items/:id/claim` | POST | atomic claim |
| `/api/work-items/:id/transition` | POST | FSM-guarded status change |
| `/api/work-items/:id/approvals` | POST | request / decide sign-offs (role-checked) |
| `/api/work-items/:id/presence` | POST/DELETE | viewer heartbeat (25 s TTL) |
| `/api/events` | GET | SSE stream of domain events |
| `/api/simulator` | POST | one-click race/idempotency/OCC/outbox scenarios |
| `/api/users`, `/api/teams` | GET | personas and teams for the switcher |
| `/api/outbox/process` | GET/POST | outbox stats / force a processing tick |

## Chaos & Concurrency Simulator

Open the app, switch to the **Concurrency & Chaos Simulator** tab (or call `POST /api/simulator` with `{"scenario": ...}` directly):

1. **Claim Race** (`claim_race`) — creates a fresh unclaimed incident and fires two simultaneous claims. Expect exactly one `200` winner and one `409` loser that names the winner. Repeatable; each run makes a new item.
2. **Idempotency Burst** (`idempotency_burst`) — three rapid requests sharing one key against the create endpoint. Exactly one write, duplicates rejected/replayed — check the `idempotency_records` row and item count afterwards.
3. **OCC Collision** (`occ_collision`) — update 1 bumps the version, update 2 arrives with the stale `expected_version`. Expect a clean `OCC_VERSION_CONFLICT` payload.
4. **Outbox Chaos** (`outbox_chaos`) — forces a delivery failure and shows the event stuck in `PENDING` with `attempts: 1` and a scheduled `next_retry_at` (exponential backoff), routed to the DLQ after 5 failures.

## Known limitations (honest)

1. **Approval actor, not a real login.** There is no auth system; the request identity is a seeded user passed via headers (makes RBAC and personas clearly visible for evaluation). Production would need real sessions and per-token claims.
2. **Outbox worker mode.** The outbox and SLA engine run on demand (`POST /api/outbox/process`, also one tap from the Simulator). A headless poller exists in code (`startOutboxWorker()` in `lib/services/outbox.worker.ts`) but is not wired into the dev server, so events do not process themselves continuously in dev mode. Wiring it via an instrumentation hook would be the next step.
3. **Single node.** The outbox worker and event bus assume one process; horizontal scaling would need coordinating the poller (advisory locks / external queue).
4. **Production build not validated.** The app is designed for `npm run dev`; a `next build` run was not part of this verification cycle.
5. **Search** uses indexed `LIKE` queries, which is fine for the demo scale (SQLite FTS5 would be next for large history).

## Verification summary (18 October 2026)

- `npm test` — 9/9 pass.
- Dev server boots clean (`npm run dev`, ~1.5 s start); `/`, `/api/teams`, `/api/users`, `/api/work-items`, `/api/outbox/process`, `/api/events` all respond `200` with seeded data, locally and in the Codespace.
- Server binds `*:3000` (all interfaces) — confirmed via socket listing.
- Claim race, OCC collision and outbox backoff behaviour confirmed through the simulator's own scenario runners in earlier runs.

## Quick reference

| Command | Purpose |
|---|---|
| `npm install` / `npm ci` | install from lockfile |
| `npm run seed` | rebuild demo data |
| `npm run dev` | start server (port 3000) |
| `npm test` | Vitest suite (9 tests) |
| `npm run build` | production build (not part of verification cycle) |
