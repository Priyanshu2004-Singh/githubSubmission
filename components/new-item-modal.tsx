import React, { useState } from 'react';
import { User, Team, WorkItemCategory, WorkItemPriority } from '@/lib/types';
import { X, Plus, Sparkles, Shield } from 'lucide-react';

interface NewItemModalProps {
  currentUser: User;
  teams: Team[];
  onClose: () => void;
  onCreated: () => void;
}

export function NewItemModal({
  currentUser,
  teams,
  onClose,
  onCreated,
}: NewItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<WorkItemCategory>('INCIDENT');
  const [priority, setPriority] = useState<WorkItemPriority>('HIGH');
  const [teamId, setTeamId] = useState(teams[0]?.id || 'team_infra');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Generate unique Idempotency Key
    const idempotencyKey = `create-item-${crypto.randomUUID()}`;

    try {
      const res = await fetch('/api/work-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          title,
          description,
          category,
          priority,
          teamId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create work item');
      } else {
        onCreated();
        onClose();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[3px] p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-lift overflow-hidden animate-panel-in">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">Create Operational Work Item</h3>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                Idempotency-protected submission
                <span className="font-mono text-[9px] px-1 py-px rounded bg-slate-100 border border-slate-200 text-slate-500">X-Idempotency-Key</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition focus-ring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 text-xs text-rose-700 font-medium animate-panel-in">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="text-slate-700 font-semibold block mb-1.5">Item Title</label>
            <input
              type="text"
              placeholder="e.g. EU Direct Debit Gateway Latency Spike"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 text-sm placeholder-slate-300 transition"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 font-semibold block mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 cursor-pointer transition"
              >
                <option value="INCIDENT">Incident</option>
                <option value="PAYMENT_INVESTIGATION">Payment Investigation</option>
                <option value="COMPLIANCE_REVIEW">Compliance Review</option>
                <option value="CUSTOMER_ESCALATION">Customer Escalation</option>
                <option value="OPERATIONAL_APPROVAL">Operational Approval</option>
              </select>
            </div>

            <div>
              <label className="text-slate-700 font-semibold block mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 cursor-pointer transition"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-700 font-semibold block mb-1.5">Assigned Department</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 cursor-pointer transition"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (SLA: {t.default_sla_hours}h)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-700 font-semibold block mb-1.5">Investigation Summary & Scope</label>
            <textarea
              rows={4}
              placeholder="Describe what occurred, impacted services, and reason for urgency..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 text-xs leading-relaxed placeholder-slate-300 transition resize-none"
              required
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-500 hover:text-slate-800 rounded-lg transition font-medium hover:bg-slate-50 focus-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg transition shadow-sm hover:shadow-md active:scale-[0.98] flex items-center gap-1.5 focus-ring"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating...' : 'Create Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
