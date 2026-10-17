# Engineering Decisions & Architectural Trade-offs

This document outlines five pivotal architectural and product decisions made during the design and implementation of **Newtonite OpsPulse**, evaluating alternatives, rationale, trade-offs, and intentional non-goals.

---

## Decision 1: Optimistic Concurrency Control (OCC) with 3-Way Diff vs. Pessimistic Row Locking

### Context & Problem
In a fast-growing operational environment, multiple engineers and operators frequently view and modify the same incident, investigation, or escalation simultaneously. The naive approach (Last-Write-Wins) causes silent data loss: User A loads a ticket, User B updates the priority and notes, and User A saves a minor typo fix, unintentionally overwriting User B's critical operational notes.

### Alternatives Considered
1. **Pessimistic Row Locking (`SELECT ... FOR UPDATE`)**: Lock the row when an operator opens the detail view until they close it or save.
2. **Naive Last-Write-Wins (LWW)**: Unconditionally overwrite existing columns with incoming values.
3. **Optimistic Concurrency Control (OCC) with Version Tokens & 3-Way Diff** (*Selected*).

### Rationale & Trade-offs
- **Why Pessimistic Locking was Rejected**: In human-driven operational workflows, operators open tickets in background tabs, attend standups, or step away from their desks. A pessimistic lock held by an open browser tab prevents all other team members from updating or resolving urgent production incidents, introduces severe deadlock hazards, and degrades read throughput.
- **How OCC was Implemented**: Every `work_items` record includes an integer `version` column, incremented on every mutating update. Clients supply `expected_version` (via payload or `If-Match`). If `current.version !== expected_version`, the server rejects the request with HTTP `409 Conflict`.
- **The Value-Add (3-Way Diff)**: Rather than simply displaying a generic error message, the server returns the server's current snapshot and the exact list of conflicting fields. The UI renders a side-by-side comparison allowing the operator to inspect the remote delta and choose whether to accept server changes or force an intentional overwrite with an audit log record.

---

## Decision 2: Atomic Conditional Writes for Work Claiming vs. Distributed Mutexes

### Context & Problem
When a high-severity production alert or fraudulent wire alert arrives in the triage queue, multiple operators race to "take responsibility" / claim the item simultaneously. Two operators must never both believe they own the work item.

### Alternatives Considered
1. **Distributed Mutex (Redis Redlock / Zookeeper)**: Acquire a distributed lock prior to assignment.
2. **Application Memory Mutex (In-memory lock table)**: Maintain lock state in Node.js process memory.
3. **Database-Level Atomic Conditional Update** (*Selected*).

### Rationale & Trade-offs
- **Why Distributed Mutex was Rejected**: Introducing Redis or distributed consensus services adds infrastructure overhead, deployment friction for evaluation, and failure modes during network partitions (split-brain). Application memory locks fail immediately when the application scales to multiple instances.
- **Why Atomic Conditional Update Won**: By executing:
  ```sql
  UPDATE work_items 
  SET assigned_to = :userId, 
      version = version + 1, 
      updated_at = :now,
      status = CASE WHEN status = 'TRIAGE' THEN 'INVESTIGATING' ELSE status END
  WHERE id = :id AND assigned_to IS NULL AND version = :expectedVersion;
  ```
  The database engine's write transaction enforces mutual exclusivity at the storage layer. If two requests hit concurrently, exactly one caller receives `changes === 1` and claims ownership. The loser receives `changes === 0`, and the service queries the winner's identity to return an immediate, human-readable conflict response: `"Already claimed by Sarah Jenkins 2 seconds ago."`

---

## Decision 3: Transactional Outbox Pattern vs. Synchronous Event Dispatch

### Context & Problem
Mutations to work items often trigger secondary operations: dispatching Slack/email notifications, recalculating SLA warnings, and recording audit metrics. If these operations are executed synchronously within the HTTP handler, transient external network failures cause the primary user action to fail or hang.

### Alternatives Considered
1. **Synchronous Inline Dispatch**: Execute webhook/notification requests directly inside the POST handler before responding.
2. **Fire-and-Forget Promises (`fetch().catch(...)`)**: Launch unawaited background promises in Node.js memory.
3. **Transactional Outbox Pattern with Retry Worker** (*Selected*).

### Rationale & Trade-offs
- **The Dual-Write Hazard**: Synchronous dispatch blocks user responsiveness (turning 10ms database writes into 800ms HTTP waits) and couples relational transaction success to third-party uptime. Fire-and-forget promises in memory are lost if the Node.js process crashes or restarts before completion.
- **The Outbox Solution**: Secondary events are written to an `outbox_events` table within the **same ACID transaction** as the work item update. A background polling worker picks up `PENDING` events, attempts dispatch, applies exponential backoff on transient errors (`next_retry_at = now + 2^attempts seconds`), and routes exhausted events to a Dead Letter Queue (DLQ) after 5 attempts. This guarantees at-least-once delivery with zero risk of database-event inconsistency.

---

## Decision 4: Domain-Enforced Finite State Machine & Resource-Level Authorization vs. UI Gating

### Context & Problem
Operational requests span multiple sensitive domains: compliance purges (GDPR), payments above authorization thresholds, and production outages. A user must not be able to bypass business rules by calling the REST API directly with curl or Postman.

### Alternatives Considered
1. **UI-Level Button Disabling**: Hiding buttons based on client-side role state.
2. **Open CRUD Endpoints**: Allowing clients to set any status or priority directly.
3. **Server-Side Declarative Finite State Machine (FSM) & Resource Authorization** (*Selected*).

### Rationale & Trade-offs
- **Why UI-Only Gating is Inadequate**: UI controls are cosmetic. In an enterprise system, client tampering or automated scripts can send arbitrary PATCH requests.
- **How FSM & Resource RBAC were Implemented**:
  - Valid transitions are strictly defined (`TRIAGE -> INVESTIGATING`, `INVESTIGATING -> IN_PROGRESS`, etc.). Illegal jumps (e.g. `TRIAGE -> RESOLVED`) fail with HTTP 400.
  - Special high-risk category guards: High-priority `PAYMENT_INVESTIGATION` and `COMPLIANCE_REVIEW` items cannot transition to `RESOLVED` unless an approved `work_item_approvals` record signed by a `MANAGER` or `ADMIN` exists.
  - Reopening a `CLOSED` item requires an `ADMIN` or `MANAGER` role with a mandatory textual justification.

---

## Decision 5: Keyset / Cursor-Based Pagination with Multi-Attribute Indexing vs. In-Memory Slicing

### Context & Problem
The system expects thousands of users and tens of thousands of active work items with continuously growing audit histories. Loading all items into browser memory or server memory degrades performance and causes browser tab freezes.

### Alternatives Considered
1. **Client-Side In-Memory Filtering**: Returning the full dataset to the browser and filtering with JavaScript `.filter()`.
2. **Traditional SQL Offset Pagination (`OFFSET 10000 LIMIT 25`)**: Standard offset-based queries.
3. **Indexed Keyset / Cursor Pagination (`WHERE created_at < :cursor`)** (*Selected*).

### Rationale & Trade-offs
- **Why In-Memory Filtering Fails**: With 50,000 work items, transferring 80MB of JSON over the network kills mobile clients and consumes hundreds of megabytes of browser RAM.
- **Why Keyset Cursor Pagination Wins**: Traditional `OFFSET N` forces the database engine to scan and discard `N` rows, resulting in $O(N)$ query degradation as users browse deeper into the queue. Keyset cursor pagination uses the compound index `idx_work_items_cursor (created_at DESC, id DESC)`. The database jumps directly to the indexed cursor position in $O(\log N)$ time, ensuring sub-10ms query execution regardless of whether the table contains 500 or 500,000 records.

---

## Intentional Non-Goals (What We Chose Not to Build)

1. **Full Distributed Microservice Mesh**: We deliberately avoided splitting into 5 microservices (Auth service, Ticket service, Outbox service, Notification service). A modular monolith with clear domain boundaries provides identical concurrency guarantees, ACID transactions, and zero deployment friction for evaluators.
2. **Heavyweight SSO / OAuth Provider Setup**: We chose a realistic local multi-persona switcher over external OAuth (e.g. Okta or Google SSO). This allows reviewers to instantly switch between Admin, Finance Manager, and Operator without configuring third-party OAuth client IDs.
3. **Complex Rich-Text WYSIWYG Editor**: We opted for clean Markdown and structured text with field-level diffs, prioritizing speed, audit clarity, and exact change detection over decorative text styling.
