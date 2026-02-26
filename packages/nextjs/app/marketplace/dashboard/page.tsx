"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiConfig } from "~~/lib/api-client";

type HireItem = {
  id: string;
  agent_id: string;
  status: "active" | "paused" | "revoked";
  billing_mode: string;
  created_at: string;
};

type RunItem = {
  id: string;
  hire_id: string;
  agent_id: string;
  action: string;
  status: string;
  payment_ref: string | null;
  settlement_tx_hash: string | null;
  created_at: string;
};

export default function MarketplaceDashboardPage() {
  const [hires, setHires] = useState<HireItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(() => {
    return {
      activeHires: hires.filter(h => h.status === "active").length,
      totalHires: hires.length,
      completedRuns: runs.filter(r => r.status === "completed").length,
      failedRuns: runs.filter(r => r.status === "failed").length,
      billableEvidence: runs.filter(r => !!r.payment_ref).length,
    };
  }, [hires, runs]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key. Configure Settings first.");

      const [hiresRes, runsRes] = await Promise.all([
        fetch("/api/v1/marketplace/hires?limit=50&offset=0", {
          headers: { "X-API-Key": key },
        }),
        fetch("/api/v1/marketplace/runs?limit=50&offset=0", {
          headers: { "X-API-Key": key },
        }),
      ]);

      const hiresBody = await hiresRes.json().catch(() => ({}));
      const runsBody = await runsRes.json().catch(() => ({}));

      if (!hiresRes.ok) {
        throw new Error(hiresBody?.error || "Failed to load hires");
      }
      if (!runsRes.ok) {
        throw new Error(runsBody?.error || "Failed to load runs");
      }

      setHires((hiresBody?.hires || []) as HireItem[]);
      setRuns((runsBody?.runs || []) as RunItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operator dashboard");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/marketplace" className="text-xs text-blue-300 hover:underline">
            ← Back to marketplace
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100 mt-2">Operator Dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <MetricCard label="Active hires" value={metrics.activeHires} />
        <MetricCard label="Total hires" value={metrics.totalHires} />
        <MetricCard label="Completed runs" value={metrics.completedRuns} />
        <MetricCard label="Failed runs" value={metrics.failedRuns} />
        <MetricCard label="Paid evidence" value={metrics.billableEvidence} />
      </section>

      {isLoading && <div className="text-sm text-slate-400">Loading dashboard...</div>}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-medium text-slate-200">Hires</h2>
          {hires.length === 0 && !isLoading && (
            <p className="text-xs text-slate-400">No hires yet.</p>
          )}
          <ul className="space-y-2">
            {hires.map(hire => (
              <li key={hire.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-300">{hire.id}</code>
                  <span className="text-[11px] text-slate-400">{hire.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">agent: {hire.agent_id}</p>
                <p className="text-xs text-slate-500 mt-1">billing: {hire.billing_mode}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-medium text-slate-200">Recent runs</h2>
          {runs.length === 0 && !isLoading && (
            <p className="text-xs text-slate-400">No runs yet.</p>
          )}
          <ul className="space-y-2">
            {runs.map(run => (
              <li key={run.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-300">{run.id}</code>
                  <span className="text-[11px] text-slate-400">{run.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{run.agent_id} · {run.action}</p>
                <p className="text-xs text-slate-500 mt-1">hire: {run.hire_id}</p>
                <p className="text-xs text-slate-500 mt-1">payment_ref: {run.payment_ref || "n/a"}</p>
                <p className="text-xs text-slate-500 mt-1 break-all">settlement_tx: {run.settlement_tx_hash || "n/a"}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold text-slate-100 mt-1">{value}</p>
    </div>
  );
}
