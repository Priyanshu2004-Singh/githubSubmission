import { WorkItem, WorkItemStatus, Role, WorkItemApproval } from '../types';

export interface TransitionValidationResult {
  allowed: boolean;
  error?: string;
  requiresReason?: boolean;
  requiresApproval?: boolean;
}

export const VALID_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  TRIAGE: ['INVESTIGATING', 'AWAITING_APPROVAL', 'CLOSED'],
  INVESTIGATING: ['IN_PROGRESS', 'AWAITING_APPROVAL', 'ESCALATED', 'CLOSED'],
  AWAITING_APPROVAL: ['IN_PROGRESS', 'RESOLVED', 'INVESTIGATING'],
  IN_PROGRESS: ['RESOLVED', 'ESCALATED', 'AWAITING_APPROVAL'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: ['INVESTIGATING'],
  ESCALATED: ['INVESTIGATING', 'IN_PROGRESS', 'AWAITING_APPROVAL'],
};

export class StateMachineEngine {
  /**
   * Validates whether a given actor can transition a work item from its current status to a target status.
   */
  static validateTransition(
    item: WorkItem,
    targetStatus: WorkItemStatus,
    actorRole: Role,
    reason?: string | null,
    approvals: WorkItemApproval[] = []
  ): TransitionValidationResult {
    // 1. Check if same status
    if (item.status === targetStatus) {
      return { allowed: false, error: `Work item is already in status '${targetStatus}'` };
    }

    // 2. Check if transition path exists in graph
    const allowedTargets = VALID_TRANSITIONS[item.status] || [];
    if (!allowedTargets.includes(targetStatus)) {
      return {
        allowed: false,
        error: `Invalid workflow transition: cannot move from '${item.status}' to '${targetStatus}'. Allowed transitions: ${allowedTargets.join(', ')}`,
      };
    }

    // 3. Reopening a closed item requires ADMIN or MANAGER
    if (item.status === 'CLOSED' && targetStatus === 'INVESTIGATING') {
      if (actorRole !== 'ADMIN' && actorRole !== 'MANAGER') {
        return {
          allowed: false,
          error: 'Only ADMIN or MANAGER roles have authorization to reopen a CLOSED work item.',
        };
      }
      if (!reason || reason.trim().length < 5) {
        return {
          allowed: false,
          error: 'A detailed justification reason is mandatory to reopen a closed work item.',
          requiresReason: true,
        };
      }
    }

    // 4. Closing directly from TRIAGE requires a reason
    if (item.status === 'TRIAGE' && targetStatus === 'CLOSED') {
      if (!reason || reason.trim().length < 5) {
        return {
          allowed: false,
          error: 'A reason (e.g. duplicate, invalid, or obsolete) is required when closing directly from TRIAGE.',
          requiresReason: true,
        };
      }
    }

    // 5. Guard for AWAITING_APPROVAL -> RESOLVED or IN_PROGRESS
    if (item.status === 'AWAITING_APPROVAL' && (targetStatus === 'RESOLVED' || targetStatus === 'IN_PROGRESS')) {
      const hasApprovedSignoff = approvals.some(
        (a) => a.status === 'APPROVED' && ['ADMIN', 'MANAGER', 'LEAD'].includes(a.approver_role_required)
      );
      if (!hasApprovedSignoff) {
        return {
          allowed: false,
          error: `Work item is awaiting approval. A manager or lead must approve the request before progressing to ${targetStatus}.`,
          requiresApproval: true,
        };
      }
    }

    // 6. Category-specific compliance and payment investigation guards
    if (targetStatus === 'RESOLVED') {
      const isHighValuePayment = item.category === 'PAYMENT_INVESTIGATION' && (item.priority === 'CRITICAL' || item.priority === 'HIGH');
      const isComplianceReview = item.category === 'COMPLIANCE_REVIEW';

      if (isHighValuePayment || isComplianceReview) {
        const approvedRecord = approvals.find((a) => a.status === 'APPROVED');
        if (!approvedRecord) {
          return {
            allowed: false,
            error: `Resolution Blocked: High-priority ${item.category.replace('_', ' ')} work items require an approved sign-off before resolution.`,
            requiresApproval: true,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Determine available next transitions for the UI
   */
  static getAvailableTransitions(item: WorkItem, actorRole: Role): WorkItemStatus[] {
    const rawTargets = VALID_TRANSITIONS[item.status] || [];
    return rawTargets.filter((target) => {
      if (item.status === 'CLOSED' && target === 'INVESTIGATING') {
        return actorRole === 'ADMIN' || actorRole === 'MANAGER';
      }
      return true;
    });
  }
}
