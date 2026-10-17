import React from 'react';
import { WorkItem, WorkItemStatus } from '@/lib/types';
import { PriorityBadge } from './status-badge';
import { SLAIndicator } from './sla-indicator';
import { Clock, User, ShieldAlert, ArrowRight } from 'lucide-react';

interface KanbanBoardProps {
  items: WorkItem[];
  onSelectItem: (id: string) => void;
}

const COLUMNS: { id: WorkItemStatus; title: string; header: string; dot: string }[] = [
  { id: 'TRIAGE', title: 'Triage Queue', header: 'text-violet-700', dot: 'bg-violet-500' },
  { id: 'INVESTIGATING', title: 'Investigating', header: 'text-blue-700', dot: 'bg-blue-500' },
  { id: 'AWAITING_APPROVAL', title: 'Awaiting Sign-off', header: 'text-amber-700', dot: 'bg-amber-500' },
  { id: 'IN_PROGRESS', title: 'In Progress', header: 'text-cyan-700', dot: 'bg-cyan-500' },
  { id: 'RESOLVED', title: 'Resolved', header: 'text-emerald-700', dot: 'bg-emerald-500' },
  { id: 'CLOSED', title: 'Closed Archive', header: 'text-slate-500', dot: 'bg-slate-400' },
];

export function KanbanBoard({ items, onSelectItem }: KanbanBoardProps) {
  return (
    <div className="flex gap-3.5 overflow-x-auto pb-6 pt-1">
      {COLUMNS.map((col) => {
        const colItems = items.filter((i) => i.status === col.id);

        return (
          <div
            key={col.id}
            className="w-80 shrink-0 bg-slate-100/70 border border-slate-200 rounded-xl flex flex-col max-h-[calc(100vh-280px)]"
          >
            {/* Column Header */}
            <div className="p-3.5 border-b border-slate-200/80 flex items-center justify-between bg-white/60 rounded-t-xl">
              <div className={`flex items-center gap-2 ${col.header}`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="font-bold text-[11px] uppercase tracking-wider">{col.title}</span>
                <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500 font-semibold tabular-nums shadow-sm">
                  {colItems.length}
                </span>
              </div>
            </div>

            {/* Cards List */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {colItems.length > 0 ? (
                colItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item.id)}
                    className="p-3.5 bg-white hover:bg-white border border-slate-200 hover:border-blue-300 rounded-lg cursor-pointer transition-all shadow-soft hover:shadow-lift hover:-translate-y-[1px] space-y-2.5 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-blue-600 group-hover:text-blue-700">
                        {item.item_code}
                      </span>
                      <PriorityBadge priority={item.priority} />
                    </div>

                    <h4 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-relaxed">
                      {item.title}
                    </h4>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <span className="truncate max-w-[120px] text-slate-600 font-medium">
                        {item.assignee_name || (
                          <span className="text-amber-600 italic font-medium">Unassigned</span>
                        )}
                      </span>
                      <SLAIndicator dueAt={item.sla_due_at} status={item.sla_status} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-5 text-center text-[11px] text-slate-400 border border-dashed border-slate-300/70 rounded-lg my-3 bg-white/50">
                  <span className="block text-sm mb-0.5 text-slate-300">▢</span>
                  No items in this state
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
