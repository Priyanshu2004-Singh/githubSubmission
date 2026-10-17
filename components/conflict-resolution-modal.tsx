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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#141d2e] border border-amber-500/40 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950/80 to-slate-900 p-5 border-b border-amber-900/40 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-amber-200">
                Optimistic Concurrency Conflict (409)
              </h3>
              <p className="text-xs text-amber-300/80 mt-0.5">
                The item was modified remotely. Blind overwrites are blocked to protect operational integrity.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 text-xs text-slate-300 flex items-center justify-between">
            <div>
              <span className="text-slate-400">Your Base Version:</span>{' '}
              <span className="font-mono font-semibold text-rose-400">v{conflict.expected_version}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <div>
              <span className="text-slate-400">Current Server Version:</span>{' '}
              <span className="font-mono font-semibold text-emerald-400">v{conflict.current_version}</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Conflicting Field Comparison
            </h4>
            <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800/80 text-xs">
              <div className="grid grid-cols-3 bg-slate-900/60 p-2.5 font-semibold text-slate-400">
                <div>Field</div>
                <div className="text-emerald-400">Server Value (v{conflict.current_version})</div>
                <div className="text-amber-400">Your Proposed Value</div>
              </div>

              {conflict.conflicting_fields && conflict.conflicting_fields.length > 0 ? (
                conflict.conflicting_fields.map((field) => (
                  <div key={field} className="grid grid-cols-3 p-3 bg-slate-950/40 items-center">
                    <span className="font-mono text-slate-300 font-semibold">{field}</span>
                    <span className="text-emerald-300 font-medium truncate pr-2">
                      {String((conflict.current_item as any)[field] ?? 'None')}
                    </span>
                    <span className="text-amber-300 font-medium truncate pr-2">
                      {String((proposedUpdates as any)?.[field] ?? 'None')}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-slate-400 text-center">
                  Server version changed from v{conflict.expected_version} to v{conflict.current_version} by another user.
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Choose whether to accept the latest server data or explicitly force overwrite with your version. Both decisions will be recorded in the audit log.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-900/90 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/60 rounded-lg transition flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Accept Server Version (v{conflict.current_version})</span>
          </button>
          <button
            onClick={() => onForceOverwrite(conflict.current_version)}
            className="px-4 py-2 text-xs font-semibold text-amber-200 bg-amber-600 hover:bg-amber-500 rounded-lg transition shadow-lg shadow-amber-900/30 flex items-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Force Overwrite with My Values</span>
          </button>
        </div>
      </div>
    </div>
  );
}
