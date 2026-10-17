# Newtonite OpsPulse: Operations Under Pressure

> **One-Day Full-Stack Engineering Assessment**  
> An enterprise-grade operations coordination platform built for high-concurrency environments, strict auditability, and zero lost work.

---

## Executive Summary & System Overview

When high-growth companies scale beyond a few hundred employees, operational coordination through ad-hoc chat channels, spreadsheets, and emails collapses:
- Urgent customer incidents and fraudulent payment reviews disappear in chat threads.
- Two operators inadvertently work on or claim the same task simultaneously.
- Stale updates overwrite critical decisions made moments earlier.
- Sensitive actions lack verifiable audit trails and manager sign-off gates.

**Newtonite OpsPulse** replaces this disorder with a mission-critical operations coordination engine engineered for high-concurrency correctness, real-time situational awareness, and strict transactional integrity.

---

## System Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                Next.js 15 Client Layer (React 19)                                 |
|  +--------------------+  +----------------------+  +---------------------+  +------------------+  |
|  | Ops Command Center |  | Work Item Detail Hub |  | Kanban Board View   |  | Chaos Playground |  |
|  | (KPIs & Filters)   |  | (Timeline & Diff)    |  | (Drag/Drop States)  |  | (Simulator)      |  |
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
|  - Polls pending outbox_events with exponential backoff & Dead Letter Queue (DLQ)                 |
|  - Calculates SLA threshold warnings & auto-escalates at-risk work items                          |
+---------------------------------------------------------------------------------------------------+
```

---

## 5 Critical Correctness Situations (Beyond Simple CRUD)

| Mechanism | Problem Solved | Implementation Detail |
|---|---|---|
| **1. Atomic Work Claiming** | Two operators attempt to claim the same critical incident simultaneously. | Database-level atomic conditional write (`UPDATE ... WHERE assigned_to IS NULL AND version = ?`). Exactly 1 succeeds; loser receives clean 409 Conflict with winner's identity. |
| **2. Optimistic Concurrency Control (OCC)** | User A modifies an item while User B is viewing an older snapshot, causing lost updates. | Every record has an integer `version`. Mutations require `expected_version`. Stale writes are rejected with 409 Conflict, returning a 3-way diff for human-in-the-loop merge. |
| **3. Request Idempotency** | Network disconnects or rapid double-clicking duplicating high-risk wire freezes. | Client provides `X-Idempotency-Key: <UUID>`. The backend records atomic `PROCESSING` state, caches completed responses, and replays exact responses on duplicate calls with zero side-effects. |
| **4. Guarded State Machine & RBAC** | Operators attempting to resolve sensitive compliance or payment items without approval. | Declarative TypeScript FSM validates state transitions. High-risk items cannot resolve without an approved sign-off from `MANAGER` or `ADMIN`. |
| **5. Transactional Outbox Pattern** | Downstream notification failure or crash causing permanent data inconsistency. | Secondary events are written to `outbox_events` within the same ACID database transaction. Background worker processes events with exponential backoff and DLQ routing. |

---

## Quick Start Guide

The application has been engineered for **zero-friction evaluator startup**. No Docker or external database containers are required.

### 1. Requirements
- Node.js >= 18.x (tested on v24.9.0)
- npm >= 9.x

### 2. Setup & Installation
```bash
# Clone the repository
git clone <repo-url>
cd githubSubmission

# Install dependencies
npm install

# Seed the database with 5 departments, 8 users, and realistic work items
npm run seed

# Start the development server
npm run dev
```

Open [**http://localhost:3000**](http://localhost:3000) in your browser.

---

## Interactive Recruiter & Evaluator Playground

The application includes a built-in **"Chaos & Concurrency Simulator"** accessible directly in the top navigation bar:

1. **Simultaneous Work Claim Race**: Spawns 2 simultaneous parallel HTTP requests attempting to claim the same unclaimed incident at the exact same millisecond. Displays the winner (200 OK) and the loser (409 Conflict with winner metadata).
2. **Idempotency Burst Simulation**: Fires 3 rapid requests with the identical `X-Idempotency-Key`. Proves that only 1 record is created in the database while the 2 duplicates replay cached responses.
3. **Stale State OCC Collision**: Simulates version drift (version 1 -> 2) and attempts a stale update with expected_version: 1, demonstrating 409 rejection and field comparison.
4. **Outbox Retry & Backoff**: Enqueues an asynchronous event with simulated downstream failure, verifying automatic retry scheduling and exponential backoff.

---

## Running Automated Tests

A comprehensive suite of automated tests covers all critical concurrency and business logic edge cases:

```bash
npm test
```

### Test Suite Coverage:
- `tests/concurrency.test.ts`: Verifies atomic conditional claiming races and OCC version mismatch detection.
- `tests/idempotency.test.ts`: Verifies idempotent key caching and replay behavior.
- `tests/state-machine.test.ts`: Verifies transition rules, mandatory reason gates, and role approval requirements.
- `tests/outbox.test.ts`: Verifies transactional outbox processing, exponential backoff, Dead Letter Queue (DLQ), and SLA breach detection.

---

## API Specification Reference

| Endpoint | Method | Description | Concurrency / Safety Header |
|---|---|---|---|
| `/api/work-items` | `GET` | Paginated queue with multi-filter search | `?cursor=<base64>&limit=25` |
| `/api/work-items` | `POST` | Create a new work item | `X-Idempotency-Key: <UUID>` |
| `/api/work-items/:id` | `GET` | Get item details, timeline, approvals, active presence | - |
| `/api/work-items/:id` | `PATCH` | Update item fields | Payload includes `expected_version` |
| `/api/work-items/:id/claim` | `POST` | Atomically claim responsibility | Payload includes `expected_version` |
| `/api/work-items/:id/transition` | `POST` | Guarded FSM status transition | Payload includes `expected_version`, `reason` |
| `/api/work-items/:id/approvals` | `POST` | Request or decide approval sign-off | Enforces role check (Admin/Manager/Lead) |
| `/api/work-items/:id/presence` | `POST / DELETE` | Heartbeat for active viewer presence | 25s auto-prune TTL |
| `/api/events` | `GET` | Real-time Server-Sent Events (SSE) stream | `text/event-stream` |
| `/api/simulator` | `POST` | Trigger concurrency/chaos scenarios | `{ scenario: 'claim_race' }` |

---

## Engineering Decisions & Documentation

See [**`ENGINEERING_DECISIONS.md`**](file:///Users/priyanshusingh/Desktop/frontend%20Practical/githubSubmission/ENGINEERING_DECISIONS.md) for in-depth evaluations of:
1. Optimistic Concurrency Control (OCC) vs. Pessimistic Row Locking
2. Atomic Conditional Writes for Work Claiming vs. Distributed Mutexes
3. Transactional Outbox Pattern vs. Inline Synchronous Notifications
4. Domain-Enforced Finite State Machine & Resource RBAC vs. UI-Only Gating
5. Keyset / Cursor-Based Pagination vs. In-Memory Slicing

---

## Known Limitations & Production Roadmap

1. **Horizontal Worker Clustering**: The background Outbox worker runs in-process with a SQLite lock. In a multi-node Kubernetes deployment, worker execution can be coordinated using advisory locks or distributed queues like SQS/Kafka.
2. **Full-Text Indexing**: Search currently utilizes tokenized indexed queries. For hundreds of millions of historical events, SQLite FTS5 or external Elasticsearch indexing would be integrated.
3. **Webhooks Integration**: Outbox handlers currently dispatch to internal event buses and mock handlers; in enterprise production, webhooks would sign HMAC SHA256 payloads to client endpoints.
