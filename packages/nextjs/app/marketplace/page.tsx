"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type AgentType, type AgentProfileResponse } from "@cloak-wallet/sdk";
import { getApiConfig } from "~~/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

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
      // Non-critical
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
    <div className="space-y-8">

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Hero Section ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-blue-500/10 via-slate-900 to-purple-500/10 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Agent Marketplace
            </h1>
            <p className="text-sm md:text-base text-slate-400 max-w-xl leading-relaxed">
              Discover, evaluate, and hire verified AI agents for your Starknet operations.
              Every agent is backed by on-chain delegation and real-time reputation scoring.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/marketplace/dashboard"
              className="text-sm px-5 py-2.5 rounded-xl font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors whitespace-nowrap"
            >
              Register your agent
            </Link>
            <button
              type="button"
              onClick={() => void loadAgents()}
              className="text-sm px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700/50">
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">{agents.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Agents Listed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">
              {agents.filter(a => a.verified).length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Verified</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">{lbEntries.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active on Leaderboard</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Filter Bar ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="flex flex-wrap items-center gap-3">
        <select
          className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          value={agentType}
          onChange={e => setAgentType(e.target.value)}
        >
          <option value="">All types</option>
          {agentTypeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          value={capability}
          onChange={e => setCapability(e.target.value)}
        >
          {CAPABILITIES.map(opt => (
            <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:border-slate-600 transition-colors">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={e => setVerifiedOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-blue-500"
          />
          <span className="text-sm text-slate-300">Verified only</span>
        </label>

        {(agentType || capability || verifiedOnly) && (
          <button
            type="button"
            onClick={() => { setAgentType(""); setCapability(""); setVerifiedOnly(false); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-2"
          >
            Clear filters
          </button>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Error ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Agent Grid ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading && (
          <>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5 animate-pulse space-y-4">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-36 rounded-lg bg-slate-700/60" />
                    <div className="h-3 w-24 rounded bg-slate-700/40" />
                  </div>
                  <div className="h-7 w-12 rounded-full bg-slate-700/40" />
                </div>
                <div className="h-10 w-full rounded-lg bg-slate-700/30" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-slate-700/30" />
                  <div className="h-5 w-24 rounded-full bg-slate-700/30" />
                </div>
              </div>
            ))}
          </>
        )}

        {!isLoading && agents.length === 0 && !error && (
          <div className="col-span-full flex flex-col items-center py-20 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl">
              &#x1F916;
            </div>
            <div>
              <p className="text-slate-200 font-semibold text-lg">No agents found</p>
              <p className="text-sm text-slate-500 mt-1">Try adjusting your filters, or be the first to register one.</p>
            </div>
            <Link
              href="/marketplace/dashboard"
              className="mt-2 text-sm px-5 py-2.5 rounded-xl font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              Register your agent
            </Link>
          </div>
        )}

        {agents.map(agent => (
          <article
            key={agent.agent_id}
            className="group rounded-xl border border-slate-700/50 bg-slate-800/30 p-5 flex flex-col gap-4 hover:border-blue-500/30 hover:bg-slate-800/50 transition-all duration-200"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-white truncate group-hover:text-blue-200 transition-colors">
                  {agent.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{agent.agent_type}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {agent.verified && (
                  <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
                    Verified
                  </span>
                )}
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 tabular-nums">
                  {agent.discovery_score}
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">{agent.description}</p>

            {/* Capabilities */}
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map(cap => (
                <span
                  key={`${agent.agent_id}-${cap}`}
                  className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-700/50 border border-slate-600/50 text-slate-300"
                >
                  {cap}
                </span>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-700/30">
              <span className="text-xs text-slate-500">
                Trust <span className="text-slate-300 font-semibold">{agent.trust_score}</span>
              </span>
              <Link
                href={`/marketplace/${encodeURIComponent(agent.agent_id)}`}
                className="text-xs font-medium px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/40 transition-colors"
              >
                View &amp; hire
              </Link>
            </div>
          </article>
        ))}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Leaderboard ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-base font-semibold text-white">Leaderboard</h2>
          <div className="flex gap-1">
            {(["24h", "7d", "30d"] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setLbPeriod(p)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  lbPeriod === p
                    ? "bg-blue-500/20 text-blue-200 border border-blue-500/30"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          {lbError && (
            <p className="text-xs text-red-300 mb-3">{lbError}</p>
          )}

          {lbLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 rounded-lg bg-slate-700/30 animate-pulse" />
              ))}
            </div>
          )}

          {!lbLoading && lbEntries.length === 0 && !lbError && (
            <p className="text-sm text-slate-500 py-6 text-center">No leaderboard data for this period.</p>
          )}

          {!lbLoading && lbEntries.length > 0 && (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-700/50">
                    <th className="pb-3 pl-5 pr-3 font-medium w-12">#</th>
                    <th className="pb-3 pr-4 font-medium">Agent</th>
                    <th className="pb-3 pr-4 font-medium text-right">Score</th>
                    <th className="pb-3 pr-4 font-medium text-right">Runs</th>
                    <th className="pb-3 pr-4 font-medium text-right">Success</th>
                    <th className="pb-3 pr-5 font-medium text-right">Trust</th>
                  </tr>
                </thead>
                <tbody>
                  {lbEntries.map((entry, idx) => (
                    <tr
                      key={entry.agent_id}
                      className="border-b border-slate-700/30 last:border-b-0 hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-3 text-slate-500 tabular-nums font-medium">{idx + 1}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/marketplace/${encodeURIComponent(entry.agent_id)}`}
                          className="text-blue-300 hover:text-blue-200 hover:underline font-medium transition-colors"
                        >
                          {entry.agent_name || entry.agent_id}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-white font-mono text-right tabular-nums font-medium">
                        {entry.work_score}
                      </td>
                      <td className="py-3 pr-4 text-slate-400 text-right tabular-nums">{entry.runs}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        <span className={
                          entry.success_rate >= 0.9 ? "text-emerald-400" :
                          entry.success_rate >= 0.7 ? "text-amber-400" :
                          "text-red-400"
                        }>
                          {(entry.success_rate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 pr-5 text-slate-400 text-right tabular-nums">{entry.trust_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
