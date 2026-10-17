export type Role = 'ADMIN' | 'MANAGER' | 'LEAD' | 'OPERATOR' | 'AUDITOR';

export type WorkItemCategory = 
  | 'INCIDENT' 
  | 'PAYMENT_INVESTIGATION' 
  | 'COMPLIANCE_REVIEW' 
  | 'CUSTOMER_ESCALATION' 
  | 'OPERATIONAL_APPROVAL';

export type WorkItemStatus = 
  | 'TRIAGE' 
  | 'INVESTIGATING' 
  | 'AWAITING_APPROVAL' 
  | 'IN_PROGRESS' 
  | 'RESOLVED' 
  | 'CLOSED' 
  | 'ESCALATED';

export type WorkItemPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SLAStatus = 'HEALTHY' | 'WARNING' | 'BREACHED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar_url: string;
  teams?: string[]; // team slugs/names
  created_at: string;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  description: string;
  default_sla_hours: number;
}

export interface WorkItem {
  id: string;
  item_code: string; // e.g. "OPS-1001"
  title: string;
  description: string;
  category: WorkItemCategory;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  team_id: string;
  assigned_to: string | null;
  created_by: string;
  version: number;
  sla_due_at: string;
  sla_status: SLAStatus;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields
  team_name?: string;
  team_slug?: string;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
  creator_name?: string;
  approvals_count?: number;
  has_pending_approval?: boolean;
}

export type ActivityEventType =
  | 'CREATED'
  | 'CLAIMED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'UPDATED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_DECIDED'
  | 'NOTE_ADDED'
  | 'SLA_WARNING'
  | 'SLA_BREACHED';

export interface WorkItemActivity {
  id: string;
  work_item_id: string;
  actor_id: string;
  event_type: ActivityEventType;
  payload_diff: Record<string, { old: any; new: any }> | null;
  comment: string | null;
  created_at: string;

  actor_name?: string;
  actor_role?: Role;
  actor_avatar?: string;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface WorkItemApproval {
  id: string;
  work_item_id: string;
  requested_by: string;
  approver_role_required: Role;
  assigned_approver_id: string | null;
  status: ApprovalStatus;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;

  requester_name?: string;
  decider_name?: string | null;
}

export interface IdempotencyRecord {
  key: string;
  endpoint: string;
  request_hash: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  response_status: number | null;
  response_body: string | null;
  created_at: string;
  expires_at: string;
}

export interface OutboxEvent {
  id: string;
  event_type: string;
  payload: string; // JSON
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  error_log: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface ActivePresence {
  user_id: string;
  user_name: string;
  user_avatar: string;
  last_heartbeat: number;
  is_editing: boolean;
}

export interface WorkItemListResponse {
  items: WorkItem[];
  next_cursor: string | null;
  total_count: number;
  metrics: {
    critical_count: number;
    unassigned_count: number;
    pending_approvals_count: number;
    sla_warning_count: number;
    sla_breached_count: number;
  };
}

export interface OCCConflictResponse {
  error: 'OCC_VERSION_CONFLICT';
  message: string;
  expected_version: number;
  current_version: number;
  current_item: WorkItem;
  conflicting_fields: string[];
}
