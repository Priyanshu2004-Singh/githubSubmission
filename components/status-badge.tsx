import React from 'react';
import { WorkItemPriority, WorkItemStatus, WorkItemCategory } from '@/lib/types';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const config: Record<WorkItemStatus, { label: string; bg: string; text: string; border: string; icon: any }> = {
    TRIAGE: { label: 'Triage', bg: 'bg-purple-950/60', text: 'text-purple-300', border: 'border-purple-800/60', icon: HelpCircle },
    INVESTIGATING: { label: 'Investigating', bg: 'bg-blue-950/60', text: 'text-blue-300', border: 'border-blue-800/60', icon: Clock },
    AWAITING_APPROVAL: { label: 'Awaiting Approval', bg: 'bg-amber-950/60', text: 'text-amber-300', border: 'border-amber-800/60', icon: AlertTriangle },
    IN_PROGRESS: { label: 'In Progress', bg: 'bg-cyan-950/60', text: 'text-cyan-300', border: 'border-cyan-800/60', icon: Sparkles },
    RESOLVED: { label: 'Resolved', bg: 'bg-emerald-950/60', text: 'text-emerald-300', border: 'border-emerald-800/60', icon: CheckCircle },
    CLOSED: { label: 'Closed', bg: 'bg-slate-900', text: 'text-slate-400', border: 'border-slate-800', icon: CheckCircle },
    ESCALATED: { label: 'Escalated', bg: 'bg-rose-950/70', text: 'text-rose-300', border: 'border-rose-800/60', icon: AlertCircle },
  };

  const item = config[status] || { label: status, bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700', icon: Clock };
  const Icon = item.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.bg} ${item.text} ${item.border}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{item.label}</span>
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const config: Record<WorkItemPriority, { label: string; bg: string; text: string; border: string; dot: string; isCritical?: boolean }> = {
    CRITICAL: { label: 'Critical', bg: 'bg-rose-950/70', text: 'text-rose-300', border: 'border-rose-800', dot: 'bg-rose-500', isCritical: true },
    HIGH: { label: 'High', bg: 'bg-orange-950/60', text: 'text-orange-300', border: 'border-orange-800/60', dot: 'bg-orange-500' },
    MEDIUM: { label: 'Medium', bg: 'bg-amber-950/50', text: 'text-amber-300', border: 'border-amber-800/50', dot: 'bg-amber-500' },
    LOW: { label: 'Low', bg: 'bg-slate-900', text: 'text-slate-400', border: 'border-slate-800', dot: 'bg-slate-500' },
  };

  const item = config[priority] || { label: priority, bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700', dot: 'bg-slate-500' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider border ${item.bg} ${item.text} ${item.border} ${item.isCritical ? 'pulse-critical' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
      <span>{item.label}</span>
    </span>
  );
}

export function CategoryBadge({ category }: { category: WorkItemCategory }) {
  const labels: Record<WorkItemCategory, string> = {
    INCIDENT: 'Incident',
    PAYMENT_INVESTIGATION: 'Payment Investigation',
    COMPLIANCE_REVIEW: 'Compliance Review',
    CUSTOMER_ESCALATION: 'Customer Escalation',
    OPERATIONAL_APPROVAL: 'Operational Approval',
  };

  return (
    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60">
      {labels[category] || category}
    </span>
  );
}
