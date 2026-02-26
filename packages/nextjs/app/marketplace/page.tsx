"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import { getApiConfig } from "~~/lib/api-client";

type DiscoveredAgent = AgentProfileResponse & { discovery_score: number };

const AGENT_TYPES = [
  { label: "All", value: "" },
  { label: "Staking Steward", value: "staking_steward" },
  { label: "Treasury Dispatcher", value: "treasury_dispatcher" },
  { label: "Swap Runner", value: "swap_runner" },
];

const CAPABILITIES = [
  { label: "Any capability", value: "" },
  { label: "stake", value: "stake" },
  { label: "dispatch", value: "dispatch" },
  { label: "swap", value: "swap" },
  { label: "x402_shielded", value: "x402_shielded" },
];

export default function MarketplacePage() {
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentType, setAgentType] = useState("");
  const [capability, setCapability] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const missingApiKey = useMemo(() => !getApiConfig().key, []);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { key } = getApiConfig();
      if (!key) {
        setAgents([]);
        setError("Missing API key. Add it in Settings to use marketplace routes.");
        return;
      }

      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("offset", "0");
      if (agentType) params.set("agent_type", agentType);
      if (capability) params.set("capability", capability);
      if (verifiedOnly) params.set("verified_only", "true");

      const res = await fetch(`/api/v1/marketplace/discover?${params.toString()}`, {
        headers: {
          "X-API-Key": key,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to load marketplace" }));
        throw new Error(body?.error || `Marketplace request failed (${res.status})`);
      }

      const payload = (await res.json()) as {
        agents: DiscoveredAgent[];
      };
      setAgents(payload.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace agents");
    } finally {
      setIsLoading(false);
    }
  }, [agentType, capability, verifiedOnly]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Cloak Marketplace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Discover and evaluate operators before hiring paid agent runs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/marketplace/dashboard"
            className="text-xs px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
          >
            Operator Dashboard
          </Link>
          <button
            type="button"
            onClick={() => void loadAgents()}
            className="text-xs px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
          >
            Refresh
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Agent type</span>
            <select
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
              value={agentType}
              onChange={e => setAgentType(e.target.value)}
            >
              {AGENT_TYPES.map(option => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Capability</span>
            <select
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
              value={capability}
              onChange={e => setCapability(e.target.value)}
            >
              {CAPABILITIES.map(option => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 md:col-span-2 mt-6 md:mt-0">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={e => setVerifiedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-300">Verified agents only</span>
          </label>
        </div>
      </section>

      {missingApiKey && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          API key not found in browser settings. Go to <Link href="/settings" className="underline">Settings</Link> and add your backend API key.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading && (
          <div className="text-sm text-slate-400">Loading agents...</div>
        )}

        {!isLoading && agents.length === 0 && !error && (
          <div className="text-sm text-slate-400">No agents found for current filters.</div>
        )}

        {agents.map(agent => (
          <article
            key={agent.agent_id}
            className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-slate-100">{agent.name}</h2>
                <p className="text-xs text-slate-400">{agent.agent_type}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                score {agent.discovery_score}
              </span>
            </div>

            <p className="text-sm text-slate-300">{agent.description}</p>

            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map(capabilityItem => (
                <span
                  key={`${agent.agent_id}-${capabilityItem}`}
                  className="text-[11px] px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-200"
                >
                  {capabilityItem}
                </span>
              ))}
            </div>

            <div className="text-xs text-slate-400">
              Trust score: <span className="text-slate-200">{agent.trust_score}</span>
              {agent.verified ? " • verified" : " • unverified"}
            </div>

            <Link
              href={`/marketplace/${encodeURIComponent(agent.agent_id)}`}
              className="inline-flex items-center justify-center text-sm px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:border-blue-500/50"
            >
              View profile
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
