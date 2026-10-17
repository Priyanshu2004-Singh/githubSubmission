import React from 'react';
import { WorkItemPriority, WorkItemStatus, WorkItemCategory } from '@/lib/types';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const config: Record<WorkItemStatus, { label: string; bg: string; text: string; border: string; icon: any; dot?: string }> = {
    TRIAGE: { label: 'Triage', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', icon: HelpCircle, dot: 'bg-violet-400' },
    INVESTIGATING: { label: 'Investigating', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Clock, dot: 'bg-blue-400' },
    AWAITING_APPROVAL: { label: 'Awaiting Approval', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle, dot: 'bg-amber-400' },
    IN_PROGRESS: { label: 'In Progress', bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: Sparkles, dot: 'bg-cyan-400' },
    RESOLVED: { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle, dot: 'bg-emerald-400' },
    CLOSED: { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', icon: CheckCircle, dot: 'bg-slate-300' },
    ESCALATED: { label: 'Escalated', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: AlertCircle, dot: 'bg-rose-400' },
  };

  const item = config[status] || { label: status, bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: Clock, dot: 'bg-slate-300' };
  const Icon = item.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${item.bg} ${item.text} ${item.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot || 'bg-slate-300'}`} />
      <span>{item.label}</span>
      <Icon className="w-3 h-3 opacity-60" />
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const config: Record<WorkItemPriority, { label: string; bg: string; text: string; border: string; dot: string; isCritical?: boolean }> = {
    CRITICAL: { label: 'Critical', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500', isCritical: true },
    HIGH: { label: 'High', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
    MEDIUM: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
    LOW: { label: 'Low', bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' },
  };

  const item = config[priority] || { label: priority, bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider border ${item.bg} ${item.text} ${item.border} ${item.isCritical ? 'pulse-critical' : ''}`}>
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
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
      {labels[category] || category}
    </span>
  );
}
