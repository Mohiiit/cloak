import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { getApiConfig } from "../../shared/api-config";
import { Header } from "./ShieldForm";

interface Props {
  onBack: () => void;
}

type AgentCard = {
  agent_id: string;
  name: string;
  description: string;
  agent_type: string;
  capabilities: string[];
  trust_score: number;
  verified: boolean;
  discovery_score?: number;
};

const CAPABILITIES = ["", "stake", "dispatch", "swap", "x402_shielded"] as const;

export function MarketplaceScreen({ onBack }: Props) {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [searchText, setSearchText] = useState("");
  const [capability, setCapability] = useState<(typeof CAPABILITIES)[number]>("");
  const [policyDraft, setPolicyDraft] = useState(
    JSON.stringify(
      {
        max_usd_per_run: 25,
        allowed_actions: ["stake", "dispatch", "swap"],
      },
      null,
      2,
    ),
  );
  const [loading, setLoading] = useState(true);
  const [hiringAgent, setHiringAgent] = useState<string | null>(null);
  const [hireIdsByAgent, setHireIdsByAgent] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter(agent => {
      const haystack = `${agent.name} ${agent.description} ${agent.agent_type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [agents, searchText]);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getApiConfig();
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("offset", "0");
      if (capability) params.set("capability", capability);
      const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/v1/marketplace/discover?${params.toString()}`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": cfg.key,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Failed to discover agents (${res.status})`);
      }
      setAgents((payload?.agents || []) as AgentCard[]);
    } catch (err: any) {
      setAgents([]);
      setError(err?.message || "Failed to load marketplace agents");
    } finally {
      setLoading(false);
    }
  }, [capability]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const createHire = useCallback(
    async (agent: AgentCard) => {
      setHiringAgent(agent.agent_id);
      setError(null);
      setStatus(null);
      try {
        let policySnapshot: Record<string, unknown> = {};
        try {
          policySnapshot = JSON.parse(policyDraft) as Record<string, unknown>;
        } catch {
          throw new Error("Policy JSON is invalid");
        }
        const cfg = await getApiConfig();
        const baseUrl = cfg.url.replace(/\/$/, "");
        const headers = {
          "Content-Type": "application/json",
          "X-API-Key": cfg.key,
        };
        const verifyRes = await fetch(`${baseUrl}/api/v1/auth/verify`, { headers });
        const verifyJson = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok || !verifyJson?.wallet_address) {
          throw new Error(verifyJson?.error || "Unable to resolve operator wallet");
        }
        const hireRes = await fetch(`${baseUrl}/api/v1/marketplace/hires`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            agent_id: agent.agent_id,
            operator_wallet: verifyJson.wallet_address,
            policy_snapshot: policySnapshot,
            billing_mode: "per_run",
          }),
        });
        const hire = await hireRes.json().catch(() => ({}));
        if (!hireRes.ok) {
          throw new Error(hire?.error || `Failed to create hire (${hireRes.status})`);
        }

        setHireIdsByAgent(prev => ({ ...prev, [agent.agent_id]: hire.id }));
        setStatus(`Hire created for ${agent.name}: ${hire.id}`);
      } catch (err: any) {
        setError(err?.message || "Failed to create hire");
      } finally {
        setHiringAgent(null);
      }
    },
    [policyDraft],
  );

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in overflow-y-auto">
      <Header title="Agent Marketplace" onBack={onBack} />

      <div className="rounded-xl border border-cloak-border bg-cloak-card p-3 mb-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cloak-primary" />
            <p className="text-sm font-semibold text-cloak-text">Discover and hire agents</p>
          </div>
          <button
            onClick={() => void loadAgents()}
            className="h-7 px-2 rounded-md border border-cloak-border bg-cloak-input-bg hover:border-cloak-primary/50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cloak-muted" />
          </button>
        </div>
        <div className="flex items-center gap-2 border border-cloak-border rounded-lg bg-cloak-input-bg px-2 h-8">
          <Search className="w-3.5 h-3.5 text-cloak-muted" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 bg-transparent outline-none text-xs text-cloak-text placeholder:text-cloak-muted"
            placeholder="Search agents"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {CAPABILITIES.map(option => {
            const selected = capability === option;
            const label = option || "all";
            return (
              <button
                key={label}
                onClick={() => setCapability(option)}
                className={`px-2 py-1 rounded-full border text-[10px] ${
                  selected
                    ? "border-cloak-primary text-cloak-primary bg-blue-500/10"
                    : "border-cloak-border text-cloak-muted bg-cloak-input-bg"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-cloak-border bg-cloak-card p-3 mb-3">
        <p className="text-[10px] text-cloak-muted uppercase tracking-wider mb-1.5">Hire policy JSON</p>
        <textarea
          value={policyDraft}
          onChange={(e) => setPolicyDraft(e.target.value)}
          className="w-full h-24 px-2 py-2 rounded-lg bg-cloak-input-bg border border-cloak-border text-[10px] text-cloak-text font-mono resize-none outline-none"
        />
      </div>

      {error && (
        <div className="mb-2 px-2 py-2 rounded-lg border border-red-800/50 bg-red-900/20 text-[11px] text-red-400">
          {error}
        </div>
      )}
      {status && (
        <div className="mb-2 px-2 py-2 rounded-lg border border-emerald-800/40 bg-emerald-900/20 text-[11px] text-emerald-400">
          {status}
        </div>
      )}

      <div className="flex flex-col gap-2 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-cloak-primary" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-[11px] text-cloak-muted text-center py-6">No agents found.</div>
        ) : (
          filteredAgents.map(agent => (
            <div key={agent.agent_id} className="rounded-xl border border-cloak-border bg-cloak-card p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="text-sm font-semibold text-cloak-text">{agent.name}</p>
                  <p className="text-[10px] text-cloak-muted">{agent.agent_type}</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full border border-cloak-border bg-cloak-input-bg text-cloak-muted">
                  score {agent.discovery_score ?? agent.trust_score}
                </span>
              </div>
              <p className="text-[11px] text-cloak-text-dim leading-relaxed mb-2">{agent.description}</p>
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck className={`w-3.5 h-3.5 ${agent.verified ? "text-emerald-400" : "text-amber-400"}`} />
                <span className="text-[10px] text-cloak-muted">
                  {agent.verified ? "verified" : "unverified"} · trust {agent.trust_score}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {agent.capabilities.slice(0, 6).map((cap: string) => (
                  <span
                    key={`${agent.agent_id}-${cap}`}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300"
                  >
                    {cap}
                  </span>
                ))}
              </div>
              <button
                onClick={() => void createHire(agent)}
                disabled={hiringAgent === agent.agent_id}
                className="w-full h-8 rounded-lg bg-cloak-primary hover:bg-cloak-primary-hover text-white text-[11px] font-medium disabled:opacity-50"
              >
                {hiringAgent === agent.agent_id
                  ? "Creating hire..."
                  : hireIdsByAgent[agent.agent_id]
                  ? "Hire active"
                  : "Hire agent"}
              </button>
              {hireIdsByAgent[agent.agent_id] && (
                <p className="text-[10px] text-emerald-400 mt-1.5 font-mono">hire: {hireIdsByAgent[agent.agent_id]}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
