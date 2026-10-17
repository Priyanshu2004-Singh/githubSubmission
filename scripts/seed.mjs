import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dataDir = path.join(rootDir, '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'opspulse.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Apply schema
const schemaPath = path.join(rootDir, 'lib', 'db', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);

console.log('🌱 Seeding Newtonite OpsPulse database...');

// Clean existing data
db.exec(`
  DELETE FROM outbox_events;
  DELETE FROM idempotency_records;
  DELETE FROM work_item_approvals;
  DELETE FROM work_item_activities;
  DELETE FROM work_items;
  DELETE FROM user_teams;
  DELETE FROM users;
  DELETE FROM teams;
`);

// 1. Teams
const teams = [
  { id: 'team_infra', slug: 'core-infrastructure', name: 'Core Infrastructure & SRE', description: 'Production systems, Kubernetes clusters, database reliability and network operations.', default_sla_hours: 2 },
  { id: 'team_secops', slug: 'secops', name: 'Security Operations (SecOps)', description: 'Threat detection, access management, zero-day vulnerabilities, and security incident response.', default_sla_hours: 4 },
  { id: 'team_support', slug: 'customer-escalations', name: 'Customer Escalations', description: 'High-severity customer outages, VIP support escalations, and SLA contractual breaches.', default_sla_hours: 8 },
  { id: 'team_payments', slug: 'payments-risk', name: 'Payments & Risk Intelligence', description: 'Fraud rings, wire anomalies, AML alerts, payment gateway failures, and ledger discrepancies.', default_sla_hours: 12 },
  { id: 'team_compliance', slug: 'compliance', name: 'Legal & Regulatory Compliance', description: 'GDPR/CCPA requests, SOC2 audit certifications, sanctions screening, and legal holds.', default_sla_hours: 48 },
];

const insertTeam = db.prepare('INSERT INTO teams (id, slug, name, description, default_sla_hours) VALUES (?, ?, ?, ?, ?)');
for (const t of teams) {
  insertTeam.run(t.id, t.slug, t.name, t.description, t.default_sla_hours);
}

// 2. Users
const now = new Date().toISOString();
const users = [
  { id: 'user_alex', name: 'Alex Rivera', email: 'alex.rivera@newtonite.internal', role: 'ADMIN', avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_sarah', name: 'Sarah Jenkins', email: 'sarah.jenkins@newtonite.internal', role: 'MANAGER', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_elena', name: 'Elena Rostova', email: 'elena.rostova@newtonite.internal', role: 'LEAD', avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_priya', name: 'Priya Sharma', email: 'priya.sharma@newtonite.internal', role: 'LEAD', avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_marcus', name: 'Marcus Vance', email: 'marcus.vance@newtonite.internal', role: 'OPERATOR', avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_david', name: 'David Chen', email: 'david.chen@newtonite.internal', role: 'OPERATOR', avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_amara', name: 'Amara Okafor', email: 'amara.okafor@newtonite.internal', role: 'MANAGER', avatar_url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=128&h=128&fit=crop&crop=faces' },
  { id: 'user_liam', name: 'Liam O\'Connor', email: 'liam.oconnor@newtonite.internal', role: 'AUDITOR', avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=128&h=128&fit=crop&crop=faces' },
];

const insertUser = db.prepare('INSERT INTO users (id, name, email, role, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)');
for (const u of users) {
  insertUser.run(u.id, u.name, u.email, u.role, u.avatar_url, now);
}

// 3. User-Team Memberships
const userTeams = [
  { user_id: 'user_alex', team_id: 'team_infra' },
  { user_id: 'user_alex', team_id: 'team_secops' },
  { user_id: 'user_sarah', team_id: 'team_payments' },
  { user_id: 'user_elena', team_id: 'team_secops' },
  { user_id: 'user_priya', team_id: 'team_infra' },
  { user_id: 'user_marcus', team_id: 'team_infra' },
  { user_id: 'user_david', team_id: 'team_support' },
  { user_id: 'user_amara', team_id: 'team_compliance' },
  { user_id: 'user_liam', team_id: 'team_compliance' },
  { user_id: 'user_liam', team_id: 'team_payments' },
];

const insertUserTeam = db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)');
for (const ut of userTeams) {
  insertUserTeam.run(ut.user_id, ut.team_id);
}

// 4. Realistic Work Items
const workItems = [
  {
    id: 'item_1001',
    item_code: 'OPS-1001',
    title: 'EU Payment Gateway Circuit Breaker Tripped',
    description: 'Stripe webhook reporting 42% spike in 504 Gateway Timeouts for SEPA direct debit processing. Automated circuit breaker isolated partition eu-central-1.',
    category: 'INCIDENT',
    status: 'INVESTIGATING',
    priority: 'CRITICAL',
    team_id: 'team_infra',
    assigned_to: 'user_marcus',
    created_by: 'user_alex',
    version: 2,
    hours_offset_sla: 1, // 1 hour left
    sla_status: 'WARNING',
  },
  {
    id: 'item_1002',
    item_code: 'OPS-1002',
    title: 'Suspicious $84,000 Outbound Wire - Account #4491-NL',
    description: 'Risk engine detected anomalous IP geolocation mismatch (Lagos, NG proxy to Amsterdam domicile). Beneficiary bank added to watch list 14 hours ago.',
    category: 'PAYMENT_INVESTIGATION',
    status: 'AWAITING_APPROVAL',
    priority: 'CRITICAL',
    team_id: 'team_payments',
    assigned_to: 'user_sarah',
    created_by: 'user_david',
    version: 3,
    hours_offset_sla: 4,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1003',
    item_code: 'OPS-1003',
    title: 'Unclaimed: AWS IAM Role Privileged Escalation Alert',
    description: 'GuardDuty flagged unexpected sts:AssumeRole for role Production-Deployer originating from unverified GitHub Actions runner IP.',
    category: 'INCIDENT',
    status: 'TRIAGE',
    priority: 'CRITICAL',
    team_id: 'team_secops',
    assigned_to: null, // Ready for claim race testing!
    created_by: 'user_elena',
    version: 1,
    hours_offset_sla: 2,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1004',
    item_code: 'OPS-1004',
    title: 'Enterprise VIP (AcmeCorp) API Rate Limit Lockout',
    description: 'AcmeCorp CTO escalated that their production webhook receivers are being throttled with 429 Too Many Requests following the v2.4 API rollout.',
    category: 'CUSTOMER_ESCALATION',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    team_id: 'team_support',
    assigned_to: 'user_david',
    created_by: 'user_alex',
    version: 2,
    hours_offset_sla: 6,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1005',
    item_code: 'OPS-1005',
    title: 'GDPR Article 17 Erasure Notice - User UID-88390',
    description: 'Legal counsel served formal 30-day notice to purge all PII, audit logs older than 7 years, and transactional data from analytical data lakes.',
    category: 'COMPLIANCE_REVIEW',
    status: 'AWAITING_APPROVAL',
    priority: 'MEDIUM',
    team_id: 'team_compliance',
    assigned_to: 'user_amara',
    created_by: 'user_liam',
    version: 2,
    hours_offset_sla: 36,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1006',
    item_code: 'OPS-1006',
    title: 'Unclaimed: PostgreSQL Primary Node High Memory Thrashing',
    description: 'Worker pool connection saturation at 94%. Query latency for /v1/transactions exceeded 850ms. Vacuum worker stuck on table idempotency_records.',
    category: 'INCIDENT',
    status: 'TRIAGE',
    priority: 'HIGH',
    team_id: 'team_infra',
    assigned_to: null, // Ready for claim race testing!
    created_by: 'user_priya',
    version: 1,
    hours_offset_sla: 0.5,
    sla_status: 'WARNING',
  },
  {
    id: 'item_1007',
    item_code: 'OPS-1007',
    title: 'Zero-Day Vulnerability Patching in OpenSSL 3.0.x',
    description: 'National Cyber Security Centre issued critical advisory CVE-2026-1189. All public-facing edge Envoy proxies require hot-reloading with patched libssl.',
    category: 'INCIDENT',
    status: 'RESOLVED',
    priority: 'CRITICAL',
    team_id: 'team_secops',
    assigned_to: 'user_elena',
    created_by: 'user_alex',
    version: 4,
    hours_offset_sla: -2,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1008',
    item_code: 'OPS-1008',
    title: 'Unclaimed: Merchant Chargeback Ratio Exceeding 1.8%',
    description: 'Visa alert received for merchant ID M-9938 (Apex Tech). Chargeback velocity exceeds Visa Fraud Monitoring Program threshold. Automatic reserve hold required.',
    category: 'PAYMENT_INVESTIGATION',
    status: 'TRIAGE',
    priority: 'HIGH',
    team_id: 'team_payments',
    assigned_to: null, // Ready for claim race testing!
    created_by: 'user_david',
    version: 1,
    hours_offset_sla: 10,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1009',
    item_code: 'OPS-1009',
    title: 'Production Database Zero-Downtime Migration Approval',
    description: 'Requesting permission to run non-blocking index additions on table transactions (18M rows). Expected read I/O increase: 12% during build.',
    category: 'OPERATIONAL_APPROVAL',
    status: 'AWAITING_APPROVAL',
    priority: 'MEDIUM',
    team_id: 'team_infra',
    assigned_to: 'user_priya',
    created_by: 'user_marcus',
    version: 2,
    hours_offset_sla: 18,
    sla_status: 'HEALTHY',
  },
  {
    id: 'item_1010',
    item_code: 'OPS-1010',
    title: 'SOC2 Type II Annual Evidence Collection Sign-Off',
    description: 'External auditor Ernst & Young requested verified access review extracts for all production AWS accounts and GitHub organization owners.',
    category: 'COMPLIANCE_REVIEW',
    status: 'INVESTIGATING',
    priority: 'LOW',
    team_id: 'team_compliance',
    assigned_to: 'user_liam',
    created_by: 'user_amara',
    version: 1,
    hours_offset_sla: -1, // Breached SLA demo!
    sla_status: 'BREACHED',
  },
];

const insertWorkItem = db.prepare(`
  INSERT INTO work_items (
    id, item_code, title, description, category, status, priority,
    team_id, assigned_to, created_by, version, sla_due_at, sla_status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const item of workItems) {
  const itemCreated = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const slaDue = new Date(Date.now() + item.hours_offset_sla * 60 * 60 * 1000).toISOString();

  insertWorkItem.run(
    item.id,
    item.item_code,
    item.title,
    item.description,
    item.category,
    item.status,
    item.priority,
    item.team_id,
    item.assigned_to,
    item.created_by,
    item.version,
    slaDue,
    item.sla_status,
    itemCreated,
    now
  );

  // Initial creation activity
  db.prepare(`
    INSERT INTO work_item_activities (id, work_item_id, actor_id, event_type, comment, created_at)
    VALUES (?, ?, ?, 'CREATED', ?, ?)
  `).run(
    `act_create_${item.id}`,
    item.id,
    item.created_by,
    `Work item created and entered ${item.status} phase.`,
    itemCreated
  );

  // If assigned, add claimed activity
  if (item.assigned_to) {
    db.prepare(`
      INSERT INTO work_item_activities (id, work_item_id, actor_id, event_type, comment, created_at)
      VALUES (?, ?, ?, 'CLAIMED', ?, ?)
    `).run(
      `act_claim_${item.id}`,
      item.id,
      item.assigned_to,
      `Assigned responsibility for investigation.`,
      now
    );
  }
}

// 5. Approvals for items awaiting approval
db.prepare(`
  INSERT INTO work_item_approvals (id, work_item_id, requested_by, approver_role_required, status, decision_reason, created_at)
  VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
`).run(
  'appr_1002',
  'item_1002',
  'user_david',
  'MANAGER',
  'Wire amount ($84,000) exceeds operator threshold ($25,000). Manager sign-off required to freeze account and notify Interpol AML desk.',
  now
);

db.prepare(`
  INSERT INTO work_item_approvals (id, work_item_id, requested_by, approver_role_required, status, decision_reason, created_at)
  VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
`).run(
  'appr_1005',
  'item_1005',
  'user_liam',
  'MANAGER',
  'Right to Be Forgotten purge approval requested. Impact analysis verified 0 pending regulatory investigations.',
  now
);

db.prepare(`
  INSERT INTO work_item_approvals (id, work_item_id, requested_by, approver_role_required, status, decision_reason, created_at)
  VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
`).run(
  'appr_1009',
  'item_1009',
  'user_marcus',
  'LEAD',
  'Schema migration review requested by Staff SRE. Query planner verified zero exclusive table locks.',
  now
);

console.log('✅ Seed completed successfully: 5 teams, 8 users, 10 rich work items with audit histories & approvals.');
db.close();
