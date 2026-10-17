# Master Implementation Plan: Newtonite OpsPulse (Operations Under Pressure)

## Goal Description
Build an enterprise-grade internal web application for Newtonite to coordinate and resolve mission-critical operational work items (customer escalations, engineering incidents, payment investigations, compliance reviews, and operational approval workflows) under high concurrency and organizational pressure.

The system replaces chaotic chat/spreadsheet/email coordination with a reliable, auditable, and resilient platform featuring:
1. **End-to-End Correctness Under Concurrency**: Demonstrating 5 distinct non-CRUD concurrency and consistency mechanisms (Atomic Work Claiming, Optimistic Concurrency Control with 3-way diff, Request Idempotency via unique idempotency keys, Guarded Workflow State Machine with Role-Based Sign-offs, and an Asynchronous Outbox Worker with exponential backoff).
2. **Real-Time Operational Awareness**: Server-Sent Events (SSE) live updates, active viewer presence detection, and immediate stale-data collision notifications.
3. **High-Performance Scalability**: Server-side cursor/keyset pagination, multi-attribute indexing, full-text token search, and zero in-memory full-dataset bloat.
4. **Professional Recruiter Experience**: Built-in interactive "Concurrency & Chaos Playground" enabling recruiters to trigger live race conditions, duplicate requests, and version conflicts with 1 click; comprehensive automated test suite; seed data spanning 5 departments; and an in-depth `ENGINEERING_DECISIONS.md` document.

---

## User Review Required

> [!IMPORTANT]
> **Key Architectural Decisions for Candidate Evaluation:**
> 1. **Full-Stack Architecture**: Next.js 15 (App Router) + TypeScript + Modern Tailwind CSS / Design System + `better-sqlite3` with WAL (Write-Ahead Logging) mode.
>    - *Rationale*: Zero-friction evaluator setup. A single `npm install && npm run dev` runs both backend API, database, background workers, and frontend without requiring Docker, external databases, or multi-terminal coordination.
> 2. **Embedded "Concurrency & Chaos Playground"**: A dedicated interactive UI panel in the application allowing recruiters to trigger simultaneous multi-user claim races, duplicate submissions with identical idempotency keys, and concurrent editing collisions to visually inspect live recovery mechanisms.
> 3. **Strict Compliance with Candidate Brief**: Deliverables include `plan.md`, `ENGINEERING_DECISIONS.md` (addressing the 5 critical decisions required by page 5 of the prompt), comprehensive automated tests (Vitest), detailed `README.md`, and rich domain seed data.

---

## System Architecture & Domain Modeling

```
+---------------------------------------------------------------------------------------------------+
|                                 Next.js 15 Client Layer (React 19)                                |
|  +--------------------+  +----------------------+  +---------------------+  +------------------+  |
|  | Ops Command Center |  | Work Item Detail Hub |  | Kanban Board View   |  | Concurrency Sim  |  |
|  | (KPIs & Filters)   |  | (Timeline & Diff)    |  | (Drag/Drop States)  |  | (Chaos Testing)  |  |
|  +--------------------+  +----------------------+  +---------------------+  +------------------+  |
|             ^                        ^                        ^                       ^           |
|             |                        |                        |                       |           |
|      SSE Stream (/api/events) + Optimistic React State + Stale Notification Banner                |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                   HTTP / REST API (Zod Validated)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                Next.js Route Handlers / API Layer                                 |
|  +---------------------------+  +-------------------------------+  +---------------------------+  |
|  | Idempotency Middleware    |  | Resource-Level RBAC & Auth    |  | State Machine Engine      |  |
|  | (X-Idempotency-Key Table) |  | (Roles, Teams, Delegations)   |  | (Guarded Transitions)     |  |
|  +---------------------------+  +-------------------------------+  +---------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                    ACID Transactions (WAL Mode)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                SQLite Storage Engine (better-sqlite3)                             |
|  - work_items (OCC version, index on team/status/priority/sla)                                    |
|  - work_item_activities (Immutable append-only audit trail & decision log)                       |
|  - work_item_approvals (Multi-stage sign-offs with role gating)                                   |
|  - idempotency_records (Atomic request hashing & response cache)                                  |
|  - outbox_events (Reliable background event queue with retry counts)                              |
|  - users & teams (RBAC role assignments)                                                          |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                        Asynchronous Outbox & SLA Background Worker                                 |
|  - Polls pending outbox_events every 2s                                                           |
|  - Calculates SLA threshold warnings & auto-escalates at-risk work items                          |
|  - Dispatches mock webhooks & notifications with exponential backoff & dead-letter queue          |
+---------------------------------------------------------------------------------------------------+
```

---

## 5 Critical Correctness Scenarios (Exceeding Brief Requirements)

### 1. Atomic Work Item Claiming (Preventing Double-Take Race Conditions)
- **Problem**: When a critical production incident or fraud alert arrives, multiple engineers/analysts often click "Claim Work" simultaneously.
- **Solution**: Atomic conditional write in SQLite:
  ```sql
  UPDATE work_items 
  SET assigned_to = :userId, 
      version = version + 1, 
      updated_at = :now,
      status = CASE WHEN status = 'TRIAGE' THEN 'INVESTIGATING' ELSE status END
  WHERE id = :id AND assigned_to IS NULL AND version = :expectedVersion;
  ```
- **Behavior**: If two requests hit concurrently, exactly one succeeds (rows changed = 1). The second request gets rows changed = 0, triggering an explicit `409 Conflict` response with the identity of the user who won the claim race.

### 2. Optimistic Concurrency Control (OCC) with 3-Way Diff Resolution
- **Problem**: User A views an incident and begins writing an investigation summary. Meanwhile, User B escalates the priority to CRITICAL and reassigns it to SecOps. If User A saves, User B's critical changes are silently wiped out (the classic "lost update" problem).
- **Solution**: Every work item has an integer `version` incremented on every mutating update. Clients include `expected_version` in update payloads (or `If-Match: "version"`).
- **Behavior**: If the database version exceeds `expected_version`, the server rejects the update with `409 Conflict`, returning the current server state, conflicting fields, and delta. The client displays a visual conflict resolution modal with options:
  - "Discard my changes & accept latest"
  - "Overwrite server with my version" (explicit force with audit tag)
  - "Merge non-conflicting fields automatically"

### 3. Full Idempotency Key Pipeline (Eliminating Accidental Duplicate Operations)
- **Problem**: Network timeouts, mobile packet loss, or impatient users rapidly double-clicking "Approve Payment Release" or "Create Escalation" can duplicate high-risk actions.
- **Solution**: Mutating endpoints require `X-Idempotency-Key: <uuid>`.
- **Behavior**:
  - Phase 1: An atomic `INSERT INTO idempotency_records (key, endpoint, request_hash, status, created_at)` is attempted.
  - If a record with status `PROCESSING` exists, the server returns `409 Conflict` ("Request currently processing, please wait").
  - If completed, the cached HTTP status code and response payload are returned immediately with header `X-Cache-Lookup: HIT-IDEMPOTENT`, guaranteeing exactly-once side-effects.

### 4. Guarded Finite State Machine (FSM) & Resource-Level Authorization
- **Problem**: Operational items must follow strict workflow policies. An engineer cannot resolve a high-value fraud review without manager sign-off. A user cannot jump from `TRIAGE` straight to `CLOSED` without an investigation.
- **Solution**: A declarative FSM engine in TypeScript validates all transitions against defined state graphs and actor permissions:
  ```typescript
  const WORKFLOW_RULES = {
    TRIAGE: { allowed: ['INVESTIGATING', 'AWAITING_APPROVAL', 'CLOSED'], requiresReason: false },
    INVESTIGATING: { allowed: ['AWAITING_APPROVAL', 'IN_PROGRESS', 'ESCALATED', 'CLOSED'] },
    AWAITING_APPROVAL: { 
      allowed: ['IN_PROGRESS', 'RESOLVED', 'INVESTIGATING'], 
      guard: (item, user) => item.approvals.some(a => a.status === 'APPROVED' && a.approverRole === 'MANAGER') 
    },
    IN_PROGRESS: { allowed: ['RESOLVED', 'ESCALATED', 'AWAITING_APPROVAL'] },
    RESOLVED: { allowed: ['CLOSED', 'INVESTIGATING'] }, // Re-opening allowed with audit justification
    CLOSED: { allowed: ['INVESTIGATING'] } // Only admins can reopen closed items
  };
  ```

### 5. Asynchronous Outbox Worker with Failure Recovery & SLA Monitoring
- **Problem**: Synchronous notification dispatch (Slack, Webhooks, Emails) slows down response times, creates external failure points, and risks lost events during server crashes.
- **Solution**: Outbox pattern. Mutating operations write an `outbox_events` record within the same ACID database transaction as the work item update.
- **Behavior**:
  - A background worker polls the outbox table for `PENDING` events.
  - Upon processing, events are dispatched to registered handlers. If an error occurs, `attempts` increments, and exponential backoff (`next_retry_at = now + 2^attempts * 1000ms`) is scheduled.
  - Events exceeding max attempts (5) transition to `FAILED` (Dead Letter Queue) with full error logs for manual operator replay.
  - The worker concurrently checks for work items approaching SLA breach (e.g., within 15 minutes of deadline) and creates automated `SLA_BREACH_WARNING` audit events.

---

## Detailed Component & File Plan

### 1. Database & Core Services (`/lib/db/` & `/lib/services/`)
- [NEW] `lib/db/index.ts`: SQLite database connection using `better-sqlite3`, WAL mode enabled, pragmas for foreign keys and synchronous normal.
- [NEW] `lib/db/schema.sql`: DDL for tables: `users`, `teams`, `user_teams`, `work_items`, `work_item_activities`, `work_item_approvals`, `idempotency_records`, `outbox_events`.
- [NEW] `lib/db/seed.ts`: Comprehensive seed script creating:
  - 5 teams (SecOps, Customer Escalations, Core Infrastructure, Payments & Risk, Compliance).
  - 8 distinct users across multiple roles (Admin, Lead, Manager, Operator, Auditor) with cross-team memberships.
  - 40+ realistic work items across all status phases, with rich activity logs, conflicting draft states, pending approvals, and urgent SLA deadlines.
- [NEW] `lib/services/work-item.service.ts`: Core transactional business logic:
  - `createWorkItem(data, actor, idempotencyKey)`
  - `claimWorkItem(id, actor, expectedVersion)`
  - `updateWorkItem(id, updates, actor, expectedVersion)`
  - `transitionStatus(id, newStatus, reason, actor, expectedVersion)`
  - `requestApproval(id, approverRole, reason, actor)`
  - `decideApproval(id, approvalId, decision, comments, actor)`
  - `listWorkItems(filters, pagination, sort)` with cursor pagination and search.
- [NEW] `lib/services/idempotency.service.ts`: Idempotency wrapper with atomic locks and response storage.
- [NEW] `lib/services/state-machine.ts`: FSM graph, transition rules, role validators.
- [NEW] `lib/services/audit.service.ts`: Append-only activity logging with JSON field diff generation.
- [NEW] `lib/services/outbox.worker.ts`: Background polling daemon for async event processing and SLA monitoring.
- [NEW] `lib/services/event-bus.ts`: In-memory broadcast bus connected to SSE route for live client updates.

### 2. API Routes (`/app/api/`)
- [NEW] `app/api/work-items/route.ts`: `GET` (paginated, filtered, indexed search) and `POST` (create with idempotency).
- [NEW] `app/api/work-items/[id]/route.ts`: `GET` (item details, timeline, approvals, active presence) and `PATCH` (OCC update with version checking).
- [NEW] `app/api/work-items/[id]/claim/route.ts`: `POST` atomic claim endpoint.
- [NEW] `app/api/work-items/[id]/transition/route.ts`: `POST` guarded state transition endpoint.
- [NEW] `app/api/work-items/[id]/approvals/route.ts`: `POST` request or decide approval.
- [NEW] `app/api/work-items/[id]/presence/route.ts`: `POST` heartbeat to register viewing/editing user; `DELETE` on unload.
- [NEW] `app/api/events/route.ts`: Server-Sent Events (SSE) streaming endpoint for live updates and broadcast events.
- [NEW] `app/api/simulator/route.ts`: Chaos endpoint to programmatically execute concurrency tests (e.g., 2 simultaneous claims, duplicate idempotency replay, version conflict generator) from the UI.
- [NEW] `app/api/users/route.ts`: User switcher endpoint for instant role/identity testing in evaluation.

### 3. Frontend Architecture & User Interface (`/app/` & `/components/`)
- [NEW] `app/layout.tsx`: Root layout with font imports, theme provider, and global SSE event listener provider.
- [NEW] `app/page.tsx`: Operations Command Center:
  - Header: Active user switcher (switch between Admin, SecOps Lead, Finance Manager, Support Operator to test permissions instantly), System Status indicator, Live SSE heartbeat badge.
  - KPI Dashboard: Critical Incidents Count, At-Risk SLA Count, Pending Approvals, Unclaimed Triage Queue.
  - Multi-view Switcher: "Operations Queue (Table View)" vs "Workflow Board (Kanban)" vs "Concurrency & Chaos Simulator".
  - Filter Bar: Fast search input, Team filter, Status filter, Priority filter, SLA filter, "Assigned to Me" quick toggle.
  - Keyset-paginated Table with sortable headers, status badges, and SLA countdowns.
- [NEW] `components/work-item-detail-modal.tsx`: Comprehensive slide-over or modal drawer:
  - Header: Item ID badge (e.g. `OPS-104`), category tag, priority selector, status badge.
  - Presence Banner: "👁️ Sarah Jenkins (SecOps) is currently viewing this item".
  - Conflict Warning Banner (if remote update detected): Displays remote diff and resolution action buttons.
  - Action Toolbar: Context-aware actions (Claim Work, Transition Status, Request Approval, Assign, Close).
  - Main Body: Title, Description, Metadata (Team, Assignee, SLA, Version counter).
  - Approvals Card: Active approval requirements, sign-off status, approve/reject buttons with reason input.
  - Activity Timeline: Immutable chronological audit history showing who did what, exact field diffs (e.g. `priority: MEDIUM -> CRITICAL`), and timestamp.
  - Discussion & Notes: Add internal note / decision rationale.
- [NEW] `components/conflict-resolution-modal.tsx`: Interactive 3-way diff comparison UI when a 409 OCC Conflict occurs.
- [NEW] `components/concurrency-simulator.tsx`: Interactive Recruiter Test Sandbox:
  - 1-Click "Run Claim Race Condition": Spawns 2 simultaneous parallel HTTP requests claiming the same unassigned item, rendering the winner (200 OK) and the loser (409 Conflict with detailed audit info).
  - 1-Click "Run Idempotent Duplicate Replay": Fires 3 rapid requests with the same `Idempotency-Key` and demonstrates that only 1 execution occurred while returning the cached response.
  - 1-Click "Run Stale Data Collision": Triggers an out-of-order update to demonstrate OCC detection and diff resolution.
  - 1-Click "Run Outbox Failure & Retry": Forces a transient outbox failure to show exponential backoff and DLQ routing.
- [NEW] `components/kanban-board.tsx`: Visual workflow board with columns matching lifecycle states and guarded drag-and-drop transitions.

### 4. Automated Tests (`/tests/`)
- [NEW] `tests/concurrency.test.ts`:
  - 2 parallel requests attempting to claim the same work item; assert exactly 1 succeeds and 1 receives 409.
  - 5 concurrent updates to the same work item; assert optimistic concurrency rejects stale versions without corrupted states.
- [NEW] `tests/idempotency.test.ts`:
  - Multiple identical requests with the same idempotency key; assert operation executes once, activity created once, and cached response returned.
- [NEW] `tests/state-machine.test.ts`:
  - Enforce state machine transitions; assert invalid jumps (e.g. TRIAGE -> RESOLVED) are rejected with 400.
  - Assert items requiring approval cannot transition to RESOLVED without valid manager approval.
- [NEW] `tests/authorization.test.ts`:
  - Operator attempting manager approval is rejected with 403 Forbidden.
  - User modifying an item outside their authorized team scope is rejected.
- [NEW] `tests/outbox.test.ts`:
  - Outbox event created within transaction; worker processes event, records attempts, and routes failed events to DLQ after max retries.

### 5. Documentation Deliverables
- [NEW] `ENGINEERING_DECISIONS.md`: The 5 core architectural trade-offs:
  1. *Optimistic Concurrency Control (OCC) vs. Pessimistic Row Locking* (why OCC with 3-way diff scales better for human operational workflows without blocking reads or risking deadlocks).
  2. *Idempotency Architecture & Distributed Deduplication* (how `X-Idempotency-Key` and atomic status states protect against duplicate financial/incident actions).
  3. *Resource-Level Authorization & Explicit Role Delegation* (why role checks must reside in domain services rather than UI routing alone).
  4. *Transactional Outbox Pattern vs. Synchronous Event Dispatch* (ensuring dual-write consistency between relational state and notification/SLA engines).
  5. *Indexed Keyset Pagination vs. In-Memory Slicing* (guaranteeing sub-10ms response times on datasets scaling into tens of thousands of items).
- [NEW] `README.md`: Professional repository presentation, visual architecture diagrams, setup instructions (`npm install && npm run dev`), test execution (`npm test`), seed data walkthrough, and evaluation checklist for the recruiter.
- [NEW] `plan.md`: Mirror of this comprehensive plan stored in the root directory as explicitly requested by the user.

---

## Verification Plan

### Automated Tests
```bash
# Run full suite of automated unit, integration, and concurrency tests
npm run test
```
- Tests must pass 100% with clear diagnostic logging showing race conditions handled deterministically.

### Manual Verification Flows
1. **Interactive Concurrency Simulator**:
   - Navigate to `/` -> Switch to the "Chaos & Concurrency Simulator" tab.
   - Click "Simulate Simultaneous Claim Race" -> observe 2 real parallel HTTP requests executed; inspect visual output showing User A winning and User B receiving a clean 409 Conflict with details.
   - Click "Simulate Idempotent Double Submit" -> observe request 1 executed and request 2 returning `X-Cache-Lookup: HIT-IDEMPOTENT` without duplicate audit log entries.
2. **Real-Time Multi-User Collaboration**:
   - Open two browser tabs side-by-side (Tab 1 as Alice - SecOps Lead, Tab 2 as Bob - Finance Manager).
   - In Tab 1, open item `OPS-101`. Tab 2 immediately displays "Alice is viewing this item".
   - In Tab 2, change the priority to `CRITICAL`. Tab 1 immediately displays a live collision banner: "Item modified remotely. Click to inspect changes."
3. **Guarded State Transition & Approval Flow**:
   - As an Operator, attempt to move a `PaymentInvestigation` item to `RESOLVED` -> observe validation message: "Requires Manager approval".
   - Request approval -> switch user to Finance Manager -> click "Approve" with reason -> observe status transition unlocked and recorded in immutable audit log.
4. **Performance & Pagination**:
   - Test search with multi-word terms, filter combinations (Team = SecOps, Priority = Critical, Status = Triage), and pagination; verify instant response (<15ms).
