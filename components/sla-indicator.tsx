import React from 'react';
import { SLAStatus } from '@/lib/types';
import { Clock, AlertTriangle, ShieldAlert } from 'lucide-react';

export function SLAIndicator({ dueAt, status }: { dueAt: string; status: SLAStatus }) {
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const diffMs = due - now;
  const isPast = diffMs < 0;
  const absHours = Math.abs(diffMs) / (1000 * 60 * 60);

  let formatted = '';
  if (absHours < 1) {
    const mins = Math.max(1, Math.round(Math.abs(diffMs) / (1000 * 60)));
    formatted = isPast ? `${mins}m overdue` : `${mins}m left`;
  } else if (absHours < 24) {
    const hrs = Math.round(absHours);
    formatted = isPast ? `${hrs}h overdue` : `${hrs}h left`;
  } else {
    const days = Math.round(absHours / 24);
    formatted = isPast ? `${days}d overdue` : `${days}d left`;
  }

  if (status === 'BREACHED' || isPast) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-800/60 px-2 py-0.5 rounded">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        <span>SLA Breached ({formatted})</span>
      </span>
    );
  }

  if (status === 'WARNING' || (!isPast && absHours < 2)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span>SLA Warning ({formatted})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 px-2 py-0.5 rounded font-mono">
      <Clock className="w-3 h-3 text-emerald-500" />
      <span>{formatted}</span>
    </span>
  );
}
