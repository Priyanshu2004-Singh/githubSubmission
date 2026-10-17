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
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Intro banner */}
      <div className="p-5 bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-800/40 rounded-2xl shadow-xl flex items-start gap-4">
        <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30 shrink-0">
          <Zap className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">
            Operational Concurrency & Correctness Playground
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mt-1">
            This interactive sandbox lets recruiters and reviewers directly trigger, observe, and verify the platform's distributed correctness mechanisms under live race conditions and network pressure.
          </p>
        </div>
      </div>

      {/* Grid of 4 simulations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Scenario 1: Claim Race */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                SCENARIO 1
              </span>
              <span className="text-[11px] text-slate-400">Atomic Claiming</span>
            </div>
            <h4 className="text-sm font-bold text-white">Simultaneous Work Claim Race</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Two operators simultaneously attempt to claim responsibility for the same urgent incident at the exact same millisecond. Tests SQLite atomic conditional update to guarantee zero double-assignment.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
            <button
              onClick={() => runScenario('claim_race')}
              disabled={running === 'claim_race'}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/40"
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
              <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{results.claim_race.outcome}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block">{results.claim_race.user_a_result?.user}:</span>
                    <span className={results.claim_race.user_a_result?.success ? 'text-emerald-400' : 'text-rose-400'}>
                      {results.claim_race.user_a_result?.success ? '200 OK (Claimed!)' : '409 Conflict (Lost race)'}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block">{results.claim_race.user_b_result?.user}:</span>
                    <span className={results.claim_race.user_b_result?.success ? 'text-emerald-400' : 'text-rose-400'}>
                      {results.claim_race.user_b_result?.success ? '200 OK (Claimed!)' : '409 Conflict (Lost race)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scenario 2: Idempotency Burst */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                SCENARIO 2
              </span>
              <span className="text-[11px] text-slate-400">X-Idempotency-Key</span>
            </div>
            <h4 className="text-sm font-bold text-white">Rapid Network Retry / Double Submit</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fires 3 concurrent requests carrying the identical Idempotency Key (simulating rapid button mashing or packet retry). Verifies that exactly 1 database write occurs and duplicates replay cached responses.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
            <button
              onClick={() => runScenario('idempotency_burst')}
              disabled={running === 'idempotency_burst'}
              className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-900/40"
            >
              {running === 'idempotency_burst' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Idempotent Burst Simulation</span>
            </button>

            {results.idempotency_burst && (
              <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{results.idempotency_burst.outcome}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono bg-slate-900 p-2 rounded border border-slate-800">
                  <span>Fresh Executions: <strong className="text-emerald-400">{results.idempotency_burst.fresh_executions}</strong></span>
                  <span>Cached Replays: <strong className="text-amber-400">{results.idempotency_burst.cached_replays}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scenario 3: OCC Collision */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                SCENARIO 3
              </span>
              <span className="text-[11px] text-slate-400">OCC Version Checking</span>
            </div>
            <h4 className="text-sm font-bold text-white">Stale State Collision (409 Conflict)</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              User A modifies an item from version 1 to 2. User B simultaneously submits an update carrying stale expected_version: 1. Demonstrates 409 rejection and field-level diff detection.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
            <button
              onClick={() => runScenario('occ_collision')}
              disabled={running === 'occ_collision'}
              className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-900/40"
            >
              {running === 'occ_collision' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Stale OCC Collision</span>
            </button>

            {results.occ_collision && (
              <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{results.occ_collision.outcome}</span>
                </div>
                <div className="text-[11px] font-mono bg-slate-900 p-2 rounded border border-slate-800 text-slate-300">
                  <span>Rejected with: </span>
                  <span className="text-rose-400 font-bold">409 Conflict</span>
                  <span className="block text-slate-400 mt-1">
                    Conflicting fields: {results.occ_collision.update_2?.conflict?.conflicting_fields?.join(', ') || 'Version drift'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scenario 4: Outbox Worker & Backoff */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                SCENARIO 4
              </span>
              <span className="text-[11px] text-slate-400">Reliable Outbox & DLQ</span>
            </div>
            <h4 className="text-sm font-bold text-white">Transient Failure & Exponential Backoff</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enqueues an asynchronous notification event with simulated downstream webhook failure. Verifies automatic retry scheduling with exponential backoff and Dead Letter Queue routing.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
            <button
              onClick={() => runScenario('outbox_chaos')}
              disabled={running === 'outbox_chaos'}
              className="w-full py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/40"
            >
              {running === 'outbox_chaos' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run Outbox Retry & Backoff</span>
            </button>

            {results.outbox_chaos && (
              <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{results.outbox_chaos.outcome}</span>
                </div>
                <div className="text-[11px] font-mono bg-slate-900 p-2 rounded border border-slate-800 text-slate-300 space-y-0.5">
                  <div>Status: <span className="text-amber-400 font-bold">{results.outbox_chaos.event_state?.status}</span></div>
                  <div>Attempts: <span className="text-white">{results.outbox_chaos.event_state?.attempts} / 5</span></div>
                  <div className="truncate text-rose-300">Error: {results.outbox_chaos.event_state?.error_log}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
