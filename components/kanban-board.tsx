import React from 'react';
import { WorkItem, WorkItemStatus } from '@/lib/types';
import { PriorityBadge } from './status-badge';
import { SLAIndicator } from './sla-indicator';
import { Clock, User, ShieldAlert, ArrowRight } from 'lucide-react';

interface KanbanBoardProps {
  items: WorkItem[];
  onSelectItem: (id: string) => void;
}

const COLUMNS: { id: WorkItemStatus; title: string; color: string }[] = [
  { id: 'TRIAGE', title: 'Triage Queue', color: 'border-purple-600/60 text-purple-300' },
  { id: 'INVESTIGATING', title: 'Investigating', color: 'border-blue-600/60 text-blue-300' },
  { id: 'AWAITING_APPROVAL', title: 'Awaiting Sign-off', color: 'border-amber-600/60 text-amber-300' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: 'border-cyan-600/60 text-cyan-300' },
  { id: 'RESOLVED', title: 'Resolved', color: 'border-emerald-600/60 text-emerald-300' },
  { id: 'CLOSED', title: 'Closed Archive', color: 'border-slate-700/60 text-slate-400' },
];

export function KanbanBoard({ items, onSelectItem }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2">
      {COLUMNS.map((col) => {
        const colItems = items.filter((i) => i.status === col.id);

        return (
          <div
            key={col.id}
            className="w-80 shrink-0 bg-[#0e1626]/90 border border-slate-800/80 rounded-2xl flex flex-col max-h-[calc(100vh-280px)]"
          >
            {/* Column Header */}
            <div className={`p-4 border-b border-slate-800 flex items-center justify-between ${col.color}`}>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider">{col.title}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
                  {colItems.length}
                </span>
              </div>
            </div>

            {/* Cards List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {colItems.length > 0 ? (
                colItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item.id)}
                    className="p-3.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 rounded-xl cursor-pointer transition shadow-md hover:shadow-xl space-y-2.5 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-blue-400 group-hover:text-blue-300">
                        {item.item_code}
                      </span>
                      <PriorityBadge priority={item.priority} />
                    </div>

                    <h4 className="text-xs font-semibold text-slate-200 line-clamp-2 leading-relaxed">
                      {item.title}
                    </h4>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
                      <span className="truncate max-w-[120px] text-slate-300">
                        {item.assignee_name || (
                          <span className="text-amber-400/90 italic">Unassigned</span>
                        )}
                      </span>
                      <SLAIndicator dueAt={item.sla_due_at} status={item.sla_status} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800/60 rounded-xl my-4">
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
