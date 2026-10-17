-- Newtonite OpsPulse Core Schema
PRAGMA foreign_keys = ON;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  default_sla_hours INTEGER NOT NULL DEFAULT 24
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'LEAD', 'OPERATOR', 'AUDITOR')),
  avatar_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- User-Team Memberships
CREATE TABLE IF NOT EXISTS user_teams (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);

-- Work Items
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  item_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('INCIDENT', 'PAYMENT_INVESTIGATION', 'COMPLIANCE_REVIEW', 'CUSTOMER_ESCALATION', 'OPERATIONAL_APPROVAL')),
  status TEXT NOT NULL CHECK(status IN ('TRIAGE', 'INVESTIGATING', 'AWAITING_APPROVAL', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED')),
  priority TEXT NOT NULL CHECK(priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  team_id TEXT NOT NULL REFERENCES teams(id),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  sla_due_at TEXT NOT NULL,
  sla_status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK(sla_status IN ('HEALTHY', 'WARNING', 'BREACHED')),
  resolution_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Performance Indexes on Work Items
CREATE INDEX IF NOT EXISTS idx_work_items_team ON work_items(team_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
CREATE INDEX IF NOT EXISTS idx_work_items_assigned ON work_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_items_sla ON work_items(sla_due_at, sla_status);
CREATE INDEX IF NOT EXISTS idx_work_items_updated ON work_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_items_cursor ON work_items(created_at DESC, id DESC);

-- Immutable Append-Only Audit Trail
CREATE TABLE IF NOT EXISTS work_item_activities (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  payload_diff TEXT, -- JSON representation of { field: { old, new } }
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_item ON work_item_activities(work_item_id, created_at DESC);

-- Approvals Engine
CREATE TABLE IF NOT EXISTS work_item_approvals (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  approver_role_required TEXT NOT NULL CHECK(approver_role_required IN ('ADMIN', 'MANAGER', 'LEAD')),
  assigned_approver_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decision_reason TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_item ON work_item_approvals(work_item_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON work_item_approvals(status);

-- Distributed Idempotency Registry
CREATE TABLE IF NOT EXISTS idempotency_records (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);

-- Transactional Outbox Queue
CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TEXT NOT NULL,
  error_log TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, next_retry_at);
