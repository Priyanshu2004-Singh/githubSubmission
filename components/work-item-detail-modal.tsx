import React, { useState, useEffect } from 'react';
import { WorkItem, User, WorkItemStatus, Role, WorkItemPriority } from '@/lib/types';
import { StatusBadge, PriorityBadge, CategoryBadge } from './status-badge';
import { SLAIndicator } from './sla-indicator';
import { 
  X, Check, AlertTriangle, UserCheck, Shield, Clock, MessageSquare, 
  RefreshCw, Send, CheckCircle2, XCircle, Eye, ArrowRight, Lock
} from 'lucide-react';

interface WorkItemDetailModalProps {
  itemId: string | null;
  currentUser: User;
  onClose: () => void;
  onItemUpdated: () => void;
}

export function WorkItemDetailModal({
  itemId,
  currentUser,
  onClose,
  onItemUpdated,
}: WorkItemDetailModalProps) {
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'approvals'>('details');
  const [staleWarning, setStaleWarning] = useState<boolean>(false);
  const [remoteVersion, setRemoteVersion] = useState<number | null>(null);

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<WorkItemPriority>('MEDIUM');
  const [editNotes, setEditNotes] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Approval modal states
  const [showApprovalPrompt, setShowApprovalPrompt] = useState(false);
  const [approvalRole, setApprovalRole] = useState<Role>('MANAGER');
  const [approvalReason, setApprovalReason] = useState('');

  // Fetch item details
  const fetchItem = async () => {
    if (!itemId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/work-items/${itemId}`, {
        headers: { 'x-user-id': currentUser.id },
      });
      const data = await res.json();
      if (data.item) {
        setItem(data.item);
        setEditTitle(data.item.title);
        setEditDesc(data.item.description);
        setEditPriority(data.item.priority);
        setEditNotes(data.item.resolution_notes || '');
        setStaleWarning(false);
        setRemoteVersion(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItem();

    // Register active viewer presence
    if (itemId) {
      fetch(`/api/work-items/${itemId}/presence`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_editing: false }),
      });
    }

    return () => {
      // Unregister presence
      if (itemId) {
        fetch(`/api/work-items/${itemId}/presence`, {
          method: 'DELETE',
          headers: { 'x-user-id': currentUser.id },
        });
      }
    };
  }, [itemId, currentUser.id]);

  // Listen to SSE broadcast for live changes
  useEffect(() => {
    if (!itemId) return;

    const handleEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.eventType === 'WORK_ITEM_UPDATED' && payload.data?.id === itemId) {
          if (item && payload.data.version > item.version) {
            setStaleWarning(true);
            setRemoteVersion(payload.data.version);
          }
        } else if (payload.eventType === 'PRESENCE_UPDATED' && payload.data?.item_id === itemId) {
          setItem((prev: any) => prev ? { ...prev, active_presence: payload.data.active_users } : prev);
        }
      } catch (e) {
        // ignore
      }
    };

    const sse = new EventSource('/api/events');
    sse.onmessage = handleEvent;

    return () => {
      sse.close();
    };
  }, [itemId, item?.version]);

  if (!itemId) return null;

  // Actions
  const handleClaim = async () => {
    if (!item) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/work-items/${item.id}/claim`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_version: item.version }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.message || data.error || 'Failed to claim work item');
      } else {
        setItem(data.item);
        onItemUpdated();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!item) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/work-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'x-user-id': currentUser.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_version: item.version,
          title: editTitle,
          description: editDesc,
          priority: editPriority,
          resolution_notes: editNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setStaleWarning(true);
          setRemoteVersion(data.current_version);
          setActionError(data.message);
        } else {
          setActionError(data.error || 'Update failed');
        }
      } else {
        setItem(data.item);
        setIsEditing(false);
        onItemUpdated();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransition = async (targetStatus: WorkItemStatus) => {
    if (!item) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/work-items/${item.id}/transition`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_status: targetStatus,
          expected_version: item.version,
          reason: transitionReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || data.message || 'Transition rejected');
      } else {
        setItem(data.item);
        setTransitionReason('');
        onItemUpdated();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestApproval = async () => {
    if (!item || !approvalReason.trim()) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/work-items/${item.id}/approvals`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REQUEST',
          approver_role_required: approvalRole,
          reason: approvalReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to request approval');
      } else {
        setShowApprovalPrompt(false);
        setApprovalReason('');
        fetchItem();
        onItemUpdated();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecideApproval = async (approvalId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!item) return;
    const reason = prompt(`Enter reason for ${decision}:`);
    if (!reason) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/work-items/${item.id}/approvals`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DECIDE',
          approval_id: approvalId,
          decision,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || `Failed to ${decision.toLowerCase()} approval`);
      } else {
        fetchItem();
        onItemUpdated();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#0f172a] border-l border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <div className="bg-[#111c33] p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-blue-400 bg-blue-950/80 px-2.5 py-1 rounded border border-blue-800/80">
              {item?.item_code || '...'}
            </span>
            {item && <CategoryBadge category={item.category} />}
            {item && <PriorityBadge priority={item.priority} />}
            {item && <StatusBadge status={item.status} />}
          </div>

          <div className="flex items-center gap-3">
            {/* Live active presence indicator */}
            {item?.active_presence && item.active_presence.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-700/60 rounded-full px-2.5 py-1 text-xs text-slate-300">
                <Eye className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span className="text-[11px] font-medium">{item.active_presence.length} viewing</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Stale Warning Banner (Collision Detection) */}
        {staleWarning && (
          <div className="bg-amber-950/90 border-b border-amber-600/60 px-5 py-3 flex items-center justify-between animate-in slide-in-from-top">
            <div className="flex items-center gap-2.5 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Remote Update Alert:</strong> Another team member updated this ticket to version {remoteVersion}. Your local view is out of date.
              </span>
            </div>
            <button
              onClick={fetchItem}
              className="px-3 py-1 text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded transition flex items-center gap-1.5 shadow"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Now</span>
            </button>
          </div>
        )}

        {/* Action Error Banner */}
        {actionError && (
          <div className="bg-rose-950/90 border-b border-rose-600/60 px-5 py-2.5 flex items-center justify-between text-xs text-rose-200">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-500" />
            Loading work item details...
          </div>
        ) : item ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab navigation */}
            <div className="flex border-b border-slate-800 bg-slate-900/40 px-6 pt-2">
              <button
                onClick={() => setActiveTab('details')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
                  activeTab === 'details'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Overview & Operations
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'timeline'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Audit Timeline</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full font-mono">
                  {item.activities?.length || 0}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('approvals')}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'approvals'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Approvals</span>
                {item.has_pending_approval && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'details' && (
                <>
                  {/* Title & Metadata Header */}
                  <div>
                    {isEditing ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white font-semibold focus:outline-none focus:border-blue-500"
                        />
                        <div className="flex items-center gap-3">
                          <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
                          >
                            <option value="CRITICAL">Critical</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                          </select>
                          <button
                            onClick={handleSaveEdit}
                            disabled={isSubmitting}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <h2 className="text-xl font-bold text-white leading-tight">
                          {item.title}
                        </h2>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Department Team</span>
                      <span className="font-semibold text-slate-200 mt-0.5 block">{item.team_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Assigned Owner</span>
                      <span className="font-semibold text-slate-200 mt-0.5 block">
                        {item.assignee_name || (
                          <span className="text-amber-400 font-medium">Unassigned</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">SLA Target</span>
                      <div className="mt-1">
                        <SLAIndicator dueAt={item.sla_due_at} status={item.sla_status} />
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">OCC Version</span>
                      <span className="font-mono font-bold text-blue-400 mt-0.5 block">
                        v{item.version}
                      </span>
                    </div>
                  </div>

                  {/* Operational Action Bar (Claim, Transition, Request Approval) */}
                  <div className="p-4 bg-slate-900/90 border border-blue-900/40 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Operational Controls</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        Acting as: <strong className="text-slate-300">{currentUser.name}</strong> ({currentUser.role})
                      </span>
                    </h4>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Atomic Claim Work Button */}
                      {!item.assigned_to && (
                        <button
                          onClick={handleClaim}
                          disabled={isSubmitting}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-blue-900/40"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Claim Work (Take Responsibility)</span>
                        </button>
                      )}

                      {/* State Transitions */}
                      {item.status === 'TRIAGE' && (
                        <button
                          onClick={() => handleTransition('INVESTIGATING')}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
                        >
                          Move to Investigating
                        </button>
                      )}

                      {item.status === 'INVESTIGATING' && (
                        <button
                          onClick={() => handleTransition('IN_PROGRESS')}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-medium transition"
                        >
                          Start Progress
                        </button>
                      )}

                      {/* Request Approval Sign-off */}
                      {item.status !== 'RESOLVED' && item.status !== 'CLOSED' && (
                        <button
                          onClick={() => setShowApprovalPrompt(true)}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 bg-amber-900/50 hover:bg-amber-800/60 border border-amber-700/60 text-amber-200 rounded-lg text-xs font-medium transition flex items-center gap-1"
                        >
                          <Shield className="w-3.5 h-3.5 text-amber-400" />
                          <span>Request Sign-off</span>
                        </button>
                      )}

                      {/* Resolve Work Item */}
                      {['INVESTIGATING', 'IN_PROGRESS', 'AWAITING_APPROVAL'].includes(item.status) && (
                        <button
                          onClick={() => {
                            const reason = prompt('Resolution summary / fix applied:');
                            if (reason) {
                              setTransitionReason(reason);
                              handleTransition('RESOLVED');
                            }
                          }}
                          disabled={isSubmitting}
                          className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-lg shadow-emerald-950/40"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Resolve Item</span>
                        </button>
                      )}

                      {/* Close directly */}
                      {item.status === 'TRIAGE' && (
                        <button
                          onClick={() => {
                            const reason = prompt('Reason for closing out (e.g. duplicate, obsolete):');
                            if (reason) {
                              setTransitionReason(reason);
                              handleTransition('CLOSED');
                            }
                          }}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition"
                        >
                          Close Out
                        </button>
                      )}

                      {/* Reopen Closed */}
                      {item.status === 'CLOSED' && (
                        <button
                          onClick={() => {
                            const reason = prompt('Mandatory justification to reopen closed item:');
                            if (reason) {
                              setTransitionReason(reason);
                              handleTransition('INVESTIGATING');
                            }
                          }}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 bg-purple-900/60 hover:bg-purple-800/60 border border-purple-700/60 text-purple-200 rounded-lg text-xs font-semibold transition"
                        >
                          Reopen Item (Admin/Manager)
                        </button>
                      )}
                    </div>

                    {/* Approval Request Form Modal if triggered */}
                    {showApprovalPrompt && (
                      <div className="p-3 bg-slate-950 border border-amber-600/40 rounded-lg space-y-2 mt-2">
                        <span className="text-xs font-bold text-amber-300 block">
                          Request Authorization Sign-off
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-slate-400 block mb-1">Required Role</label>
                            <select
                              value={approvalRole}
                              onChange={(e) => setApprovalRole(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                            >
                              <option value="MANAGER">Manager</option>
                              <option value="LEAD">Lead</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-slate-400 block mb-1">Justification Reason</label>
                            <input
                              type="text"
                              placeholder="e.g. Wire exceeds $25,000 threshold"
                              value={approvalReason}
                              onChange={(e) => setApprovalReason(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            onClick={() => setShowApprovalPrompt(false)}
                            className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRequestApproval}
                            disabled={!approvalReason.trim() || isSubmitting}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
                          >
                            Submit Request
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Description & Incident Context
                    </h4>
                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                      {item.description}
                    </div>
                  </div>

                  {/* Resolution Notes if any */}
                  {item.resolution_notes && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Resolution Notes
                      </h4>
                      <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-emerald-200 text-sm leading-relaxed">
                        {item.resolution_notes}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Tab 2: Activity Audit Timeline */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Immutable Audit Trail & Decision Log
                  </h4>
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {item.activities && item.activities.length > 0 ? (
                      item.activities.map((act: any) => (
                        <div key={act.id} className="relative group">
                          {/* Timeline dot */}
                          <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-slate-900" />
                          <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                                <span>{act.actor_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">({act.actor_role})</span>
                              </span>
                              <span className="text-slate-400 font-mono text-[11px]">
                                {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>

                            <div className="text-xs text-slate-300">
                              {act.comment}
                            </div>

                            {/* Field-level diff */}
                            {act.payload_diff && (
                              <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] font-mono space-y-1">
                                {Object.entries(act.payload_diff).map(([field, delta]: any) => (
                                  <div key={field} className="flex items-center gap-2 text-slate-400">
                                    <span className="text-slate-300">{field}:</span>
                                    <span className="text-rose-400 line-through">{String(delta.old)}</span>
                                    <ArrowRight className="w-3 h-3 text-slate-600" />
                                    <span className="text-emerald-400">{String(delta.new)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500">No activity recorded yet.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Approvals */}
              {activeTab === 'approvals' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Authorization Gates & Sign-Offs
                    </h4>
                    <button
                      onClick={() => setShowApprovalPrompt(true)}
                      className="text-xs font-semibold text-amber-400 hover:text-amber-300"
                    >
                      + Request Sign-off
                    </button>
                  </div>

                  {item.approvals && item.approvals.length > 0 ? (
                    <div className="space-y-3">
                      {item.approvals.map((appr: any) => {
                        const canDecide = ['ADMIN', appr.approver_role_required].includes(currentUser.role) ||
                          (appr.approver_role_required === 'LEAD' && currentUser.role === 'MANAGER');

                        return (
                          <div
                            key={appr.id}
                            className={`p-4 rounded-xl border ${
                              appr.status === 'APPROVED'
                                ? 'bg-emerald-950/20 border-emerald-800/40'
                                : appr.status === 'REJECTED'
                                ? 'bg-rose-950/20 border-rose-800/40'
                                : 'bg-amber-950/20 border-amber-800/40'
                            }`}
                          >
                            <div className="flex items-start justify-between text-xs">
                              <div>
                                <span className="font-semibold text-slate-200">
                                  Role Required: {appr.approver_role_required}
                                </span>
                                <p className="text-slate-300 mt-1">{appr.decision_reason}</p>
                                <span className="text-[11px] text-slate-400 block mt-2 font-mono">
                                  Requested by: {appr.requester_name}
                                </span>
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                                  appr.status === 'APPROVED'
                                    ? 'bg-emerald-900/60 text-emerald-300'
                                    : appr.status === 'REJECTED'
                                    ? 'bg-rose-900/60 text-rose-300'
                                    : 'bg-amber-900/60 text-amber-300'
                                }`}
                              >
                                {appr.status}
                              </span>
                            </div>

                            {/* Decision controls if pending */}
                            {appr.status === 'PENDING' && (
                              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                                <span className="text-[11px] text-slate-400">
                                  {canDecide
                                    ? 'You have permission to decide this request.'
                                    : `Requires ${appr.approver_role_required} role (You are ${currentUser.role})`}
                                </span>
                                {canDecide && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleDecideApproval(appr.id, 'REJECTED')}
                                      className="px-3 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 rounded text-xs font-semibold"
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => handleDecideApproval(appr.id, 'APPROVED')}
                                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                                    >
                                      Approve Sign-off
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 p-4 border border-dashed border-slate-800 rounded-xl text-center">
                      No sign-offs required for this item yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
