import React from 'react';
import { OCCConflictResponse, WorkItem } from '@/lib/types';
import { AlertTriangle, ArrowRight, Check, X, ShieldAlert } from 'lucide-react';

interface ConflictModalProps {
  conflict: OCCConflictResponse | null;
  proposedUpdates: Partial<WorkItem> | null;
  onDiscard: () => void;
  onForceOverwrite: (newExpectedVersion: number) => void;
  onClose: () => void;
}

export function ConflictResolutionModal({
  conflict,
  proposedUpdates,
  onDiscard,
  onForceOverwrite,
  onClose,
}: ConflictModalProps) {
  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[3px] p-4">
      <div className="w-full max-w-2xl bg-white border border-amber-300 rounded-xl shadow-lift overflow-hidden animate-panel-in">
        {/* Header */}
        <div className="bg-amber-50 p-5 border-b border-amber-200 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-white text-amber-600 border border-amber-300 shadow-sm">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-900">
                Optimistic Concurrency Conflict (409)
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                The item was modified remotely. Blind overwrites are blocked to protect operational integrity.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-white/70 transition focus-ring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <span className="text-slate-400 font-medium">Your Base Version:</span>{' '}
              <span className="font-mono font-bold text-rose-600">v{conflict.expected_version}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div>
              <span className="text-slate-400 font-medium">Current Server Version:</span>{' '}
              <span className="font-mono font-bold text-emerald-600">v{conflict.current_version}</span>
            </div>
          </div>

          <div>
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Conflicting Field Comparison
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 text-xs shadow-sm">
              <div className="grid grid-cols-3 bg-slate-50 p-2.5 font-semibold text-slate-500 text-[10.5px] uppercase tracking-wide">
                <div>Field</div>
                <div className="text-emerald-700">Server Value (v{conflict.current_version})</div>
                <div className="text-amber-700">Your Proposed Value</div>
              </div>

              {conflict.conflicting_fields && conflict.conflicting_fields.length > 0 ? (
                conflict.conflicting_fields.map((field) => (
                  <div key={field} className="grid grid-cols-3 p-3 bg-white items-center">
                    <span className="font-mono text-slate-700 font-semibold">{field}</span>
                    <span className="text-emerald-800 font-medium truncate pr-2 bg-emerald-50 rounded px-2 py-1 mr-1">
                      {String((conflict.current_item as any)[field] ?? 'None')}
                    </span>
                    <span className="text-amber-800 font-medium truncate pr-2 bg-amber-50 rounded px-2 py-1">
                      {String((proposedUpdates as any)?.[field] ?? 'None')}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3.5 text-slate-500 text-center bg-white">
                  Server version changed from v{conflict.expected_version} to v{conflict.current_version} by another user.
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Choose whether to accept the latest server data or explicitly force overwrite with your version. Both decisions will be recorded in the audit log.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 rounded-lg hover:bg-white transition focus-ring"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg transition flex items-center gap-1.5 shadow-sm active:scale-[0.98] focus-ring"
          >
            <Check className="w-4 h-4" />
            <span>Accept Server Version (v{conflict.current_version})</span>
          </button>
          <button
            onClick={() => onForceOverwrite(conflict.current_version)}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition shadow-sm active:scale-[0.98] flex items-center gap-1.5 focus-ring"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Force Overwrite with My Values</span>
          </button>
        </div>
      </div>
    </div>
  );
}
