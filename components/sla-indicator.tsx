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
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
        <span>SLA Breached ({formatted})</span>
      </span>
    );
  }

  if (status === 'WARNING' || (!isPast && absHours < 2)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <span>SLA Warning ({formatted})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium font-mono tabular-nums">
      <Clock className="w-3 h-3 text-emerald-500" />
      <span>{formatted}</span>
    </span>
  );
}
