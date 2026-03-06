"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type AgentType, type AgentProfileResponse } from "@cloak-wallet/sdk";
import { getApiConfig } from "~~/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiscoveredAgent = AgentProfileResponse & { discovery_score: number };

type LeaderboardEntry = {
  agent_id: string;
  agent_name: string;
  work_score: number;
  runs: number;
  success_rate: number;
  trust_score: number;
};

type AgentTypeOption = {
  value: AgentType;
  label: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_TYPE_VALUES = [
  "staking_steward",
  "treasury_dispatcher",
  "swap_runner",
] satisfies AgentType[];

function isAgentType(value: unknown): value is AgentType {
  return typeof value === "string" && AGENT_TYPE_VALUES.includes(value as AgentType);
}

function normalizeAgentTypeOptions(raw: unknown): AgentTypeOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): AgentTypeOption | null => {
      if (!item || typeof item !== "object") return null;
      const value = (item as { value?: unknown }).value;
      if (!isAgentType(value)) return null;
      const label = (item as { label?: unknown }).label;
      return {
        value,
        label: typeof label === "string" && label.trim().length > 0 ? label : value,
      };
    })
    .filter((item): item is AgentTypeOption => !!item);
}

const CAPABILITIES = [
  { label: "Any capability", value: "" },
  { label: "stake", value: "stake" },
  { label: "dispatch", value: "dispatch" },
  { label: "swap", value: "swap" },
  { label: "x402_shielded", value: "x402_shielded" },
];

const AGENT_TYPES_CACHE_KEY = "cloak.marketplace.agent-types.v1";
const AGENT_TYPES_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [agentTypeOptions, setAgentTypeOptions] = useState<AgentTypeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentType, setAgentType] = useState("");
  const [capability, setCapability] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [lbPeriod, setLbPeriod] = useState<"24h" | "7d" | "30d">("7d");
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);

  const loadAgentTypes = useCallback(async () => {
    const { key } = getApiConfig();
    if (!key) return;
    try {
      const cachedRaw = typeof window !== "undefined" ? window.localStorage.getItem(AGENT_TYPES_CACHE_KEY) : null;
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { expiresAt?: number; agent_types?: unknown };
        if (typeof cached.expiresAt === "number" && cached.expiresAt > Date.now()) {
          const normalized = normalizeAgentTypeOptions(cached.agent_types);
          if (normalized.length > 0) {
            setAgentTypeOptions(normalized);
            return;
          }
        }
      }
      const res = await fetch("/api/v1/marketplace/agent-types", { headers: { "X-API-Key": key } });
      const payload = (await res.json().catch(() => ({}))) as { agent_types?: unknown };
      if (res.ok) {
        const normalized = normalizeAgentTypeOptions(payload.agent_types);
        setAgentTypeOptions(normalized);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            AGENT_TYPES_CACHE_KEY,
            JSON.stringify({ expiresAt: Date.now() + AGENT_TYPES_CACHE_TTL_MS, agent_types: normalized }),
          );
        }
      }
    } catch {
      // Non-critical — filter just works without type options
    }
  }, []);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { key } = getApiConfig();
      if (!key) {
        setAgents([]);
        setIsLoading(false);
        return;
      }
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (agentType) params.set("agent_type", agentType);
      if (capability) params.set("capability", capability);
      if (verifiedOnly) params.set("verified_only", "true");
      const res = await fetch(`/api/v1/marketplace/discover?${params.toString()}`, {
        headers: { "X-API-Key": key },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Marketplace request failed (${res.status})`);
      }
      const payload = (await res.json()) as { agents: DiscoveredAgent[] };
      setAgents(payload.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace agents");
    } finally {
      setIsLoading(false);
    }
  }, [agentType, capability, verifiedOnly]);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    setLbError(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");
      const res = await fetch(`/api/v1/marketplace/leaderboard?period=${lbPeriod}`, {
        headers: { "X-API-Key": key },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed to load leaderboard (${res.status})`);
      setLbEntries((body.entries || []) as LeaderboardEntry[]);
    } catch (err) {
      setLbError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setLbLoading(false);
    }
  }, [lbPeriod]);

  useEffect(() => { void loadAgentTypes(); }, [loadAgentTypes]);
  useEffect(() => { void loadAgents(); }, [loadAgents]);
  useEffect(() => { void loadLeaderboard(); }, [loadLeaderboard]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Agent Marketplace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Discover and hire verified AI agents for your Starknet operations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/marketplace/dashboard"
            className="text-sm px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            Register your agent →
          </Link>
          <button
            type="button"
            onClick={() => void loadAgents()}
            className="text-xs px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <label className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-xs text-slate-400">Agent type</span>
          <select
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            value={agentType}
            onChange={e => setAgentType(e.target.value)}
          >
            <option value="">All types</option>
            {agentTypeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 min-w-[160px]">
          <span className="text-xs text-slate-400">Capability</span>
          <select
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            value={capability}
            onChange={e => setCapability(e.target.value)}
          >
            {CAPABILITIES.map(opt => (
              <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={e => setVerifiedOnly(e.target.checked)}
            className="h-4 w-4 rounded accent-blue-500"
          />
          <span className="text-sm text-slate-300 select-none">Verified only</span>
        </label>
      </section>

      {/* ── Load error ── */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Agent grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading && (
          <>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-slate-700" />
                    <div className="h-3 w-20 rounded bg-slate-800" />
                  </div>
                  <div className="h-6 w-10 rounded-full bg-slate-800" />
                </div>
                <div className="h-8 w-full rounded bg-slate-800" />
                <div className="flex gap-2">
                  <div className="h-5 w-14 rounded-full bg-slate-800" />
                  <div className="h-5 w-20 rounded-full bg-slate-800" />
                </div>
              </div>
            ))}
          </>
        )}

        {!isLoading && agents.length === 0 && !error && (
          <div className="col-span-2 flex flex-col items-center py-16 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">
              🤖
            </div>
            <p className="text-slate-200 font-medium">No agents found</p>
            <p className="text-sm text-slate-500">Try adjusting your filters, or be the first to register one</p>
            <Link
              href="/marketplace/dashboard"
              className="mt-1 text-sm px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              Register your agent →
            </Link>
          </div>
        )}

        {agents.map(agent => (
          <article
            key={agent.agent_id}
            className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-3 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-medium text-slate-100 truncate">{agent.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{agent.agent_type}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {agent.verified && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    verified
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 tabular-nums">
                  {agent.discovery_score}
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">{agent.description}</p>

            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map(cap => (
                <span
                  key={`${agent.agent_id}-${cap}`}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300"
                >
                  {cap}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between mt-auto pt-1">
              <span className="text-xs text-slate-500">
                Trust: <span className="text-slate-300 font-medium">{agent.trust_score}</span>
              </span>
              <Link
                href={`/marketplace/${encodeURIComponent(agent.agent_id)}`}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-300 hover:border-blue-500/50 hover:text-blue-300 transition-colors"
              >
                View &amp; hire →
              </Link>
            </div>
          </article>
        ))}
      </section>

      {/* ── Leaderboard ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Leaderboard</h2>
            <div className="flex gap-1.5">
              {(["24h", "7d", "30d"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLbPeriod(p)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    lbPeriod === p
                      ? "border-blue-500 bg-blue-500/20 text-blue-200"
                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {lbError && (
            <p className="text-xs text-red-300">{lbError}</p>
          )}

          {lbLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-8 rounded bg-slate-800 animate-pulse" />
              ))}
            </div>
          )}

          {!lbLoading && lbEntries.length === 0 && !lbError && (
            <p className="text-xs text-slate-500 py-2">No leaderboard data for this period.</p>
          )}

          {!lbLoading && lbEntries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-800">
                    <th className="pb-2 pr-3 font-medium w-8">#</th>
                    <th className="pb-2 pr-3 font-medium">Agent</th>
                    <th className="pb-2 pr-3 font-medium text-right">Score</th>
                    <th className="pb-2 pr-3 font-medium text-right">Runs</th>
                    <th className="pb-2 pr-3 font-medium text-right">Success</th>
                    <th className="pb-2 font-medium text-right">Trust</th>
                  </tr>
                </thead>
                <tbody>
                  {lbEntries.map((entry, idx) => (
                    <tr key={entry.agent_id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="py-2 pr-3 text-slate-500 tabular-nums">{idx + 1}</td>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/marketplace/${encodeURIComponent(entry.agent_id)}`}
                          className="text-blue-300 hover:underline"
                        >
                          {entry.agent_name || entry.agent_id}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-200 font-mono text-right tabular-nums">{entry.work_score}</td>
                      <td className="py-2 pr-3 text-slate-400 text-right tabular-nums">{entry.runs}</td>
                      <td className="py-2 pr-3 text-slate-400 text-right tabular-nums">
                        {(entry.success_rate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 text-slate-400 text-right tabular-nums">{entry.trust_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </main>
  );
}
