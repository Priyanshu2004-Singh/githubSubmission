import React, { useState } from 'react';
import { ShieldCheck, Zap, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Play, Info } from 'lucide-react';

export function ConcurrencySimulator() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});

  const runScenario = async (scenario: string) => {
    setRunning(scenario);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [scenario]: data }));
    } catch (e: any) {
      setResults((prev) => ({ ...prev, [scenario]: { error: e.message } }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto py-2">
      {/* Intro banner */}
      <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-2xl shadow-lift text-white flex items-start gap-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_right,rgba(255,255,255,0.14),transparent)]" />
        <div className="p-2.5 bg-white/15 rounded-lg border border-white/20 shrink-0 relative backdrop-blur-sm">
          <Zap className="w-6 h-6" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold">
              Operational Concurrency & Correctness Playground
            </h3>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/15 border border-white/20 uppercase tracking-wider">Live Provable</span>
          </div>
          <p className="text-xs text-blue-100 leading-relaxed mt-1">
            This interactive sandbox lets recruiters and reviewers directly trigger, observe, and verify the platform's distributed correctness mechanisms under live race conditions and network pressure — with real database side-effects, not mocked outputs.
          </p>
        </div>
      </div>

      {/* Grid of 4 simulations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Scenario 1: Claim Race */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-card hover:shadow-lift transition-shadow">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 uppercase tracking-wider">
                Scenario 1
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Atomic Claiming</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Simultaneous Work Claim Race</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Two operators simultaneously attempt to claim responsibility for the same urgent incident at the exact same millisecond. Tests SQLite atomic conditional update to guarantee zero double-assignment.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <button
              onClick={() => runScenario('claim_race')}
              disabled={running === 'claim_race'}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-1.5 shadow-sm focus-ring"
            >
              {running === 'claim_race' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Simultaneous Claim Race</span>
            </button>

            {/* Results display */}
            {results.claim_race && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 animate-panel-in">
                <div className="font-semibold text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{results.claim_race.outcome}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                  <div className="bg-white p-2 rounded-md border border-slate-200 shadow-sm">
                    <span className="text-slate-400 block">{results.claim_race.user_a_result?.user}:</span>
                    <span className={results.claim_race.user_a_result?.success ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {results.claim_race.user_a_result?.success ? '200 OK (Claimed!)' : '409 Conflict (Lost race)'}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-md border border-slate-200 shadow-sm">
                    <span className="text-slate-400 block">{results.claim_race.user_b_result?.user}:</span>
                    <span className={results.claim_race.user_b_result?.success ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {results.claim_race.user_b_result?.success ? '200 OK (Claimed!)' : '409 Conflict (Lost race)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scenario 2: Idempotency Burst */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-card hover:shadow-lift transition-shadow">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 uppercase tracking-wider">
                Scenario 2
              </span>
              <span className="text-[11px] text-slate-400 font-medium">X-Idempotency-Key</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Rapid Network Retry / Double Submit</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Fires 3 concurrent requests carrying the identical Idempotency Key (simulating rapid button mashing or packet retry). Verifies that exactly 1 database write occurs and duplicates replay cached responses.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <button
              onClick={() => runScenario('idempotency_burst')}
              disabled={running === 'idempotency_burst'}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-wait text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-1.5 shadow-sm focus-ring"
            >
              {running === 'idempotency_burst' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Idempotent Burst Simulation</span>
            </button>

            {results.idempotency_burst && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 animate-panel-in">
                <div className="font-semibold text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{results.idempotency_burst.outcome}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono bg-white p-2.5 rounded-md border border-slate-200 shadow-sm">
                  <span className="text-slate-500">Fresh Executions: <strong className="text-emerald-600 text-sm">{results.idempotency_burst.fresh_executions}</strong></span>
                  <span className="text-slate-500">Cached Replays: <strong className="text-amber-600 text-sm">{results.idempotency_burst.cached_replays}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scenario 3: OCC Collision */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-card hover:shadow-lift transition-shadow">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200 uppercase tracking-wider">
                Scenario 3
              </span>
              <span className="text-[11px] text-slate-400 font-medium">OCC Version Checking</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Stale State Collision (409 Conflict)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              User A modifies an item from version 1 to 2. User B simultaneously submits an update carrying stale expected_version: 1. Demonstrates 409 rejection and field-level diff detection.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <button
              onClick={() => runScenario('occ_collision')}
              disabled={running === 'occ_collision'}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-wait text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-1.5 shadow-sm focus-ring"
            >
              {running === 'occ_collision' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Stale OCC Collision</span>
            </button>

            {results.occ_collision && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 animate-panel-in">
                <div className="font-semibold text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{results.occ_collision.outcome}</span>
                </div>
                <div className="text-[11px] font-mono bg-white p-2.5 rounded-md border border-slate-200 shadow-sm text-slate-600">
                  <span>Rejected with: </span>
                  <span className="text-rose-600 font-bold">409 Conflict</span>
                  <span className="block text-slate-400 mt-1">
                    Conflicting fields: {results.occ_collision.update_2?.conflict?.conflicting_fields?.join(', ') || 'Version drift'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scenario 4: Outbox Worker & Backoff */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-card hover:shadow-lift transition-shadow">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200 uppercase tracking-wider">
                Scenario 4
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Reliable Outbox & DLQ</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">Transient Failure & Exponential Backoff</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enqueues an asynchronous notification event with simulated downstream webhook failure. Verifies automatic retry scheduling with exponential backoff and Dead Letter Queue routing.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <button
              onClick={() => runScenario('outbox_chaos')}
              disabled={running === 'outbox_chaos'}
              className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-wait text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-1.5 shadow-sm focus-ring"
            >
              {running === 'outbox_chaos' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Outbox Retry & Backoff</span>
            </button>

            {results.outbox_chaos && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 animate-panel-in">
                <div className="font-semibold text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{results.outbox_chaos.outcome}</span>
                </div>
                <div className="text-[11px] font-mono bg-white p-2.5 rounded-md border border-slate-200 shadow-sm text-slate-600 space-y-0.5">
                  <div>Status: <span className="text-amber-600 font-bold">{results.outbox_chaos.event_state?.status}</span></div>
                  <div>Attempts: <span className="text-slate-900">{results.outbox_chaos.event_state?.attempts} / 5</span></div>
                  <div className="truncate text-rose-500">Error: {results.outbox_chaos.event_state?.error_log}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
