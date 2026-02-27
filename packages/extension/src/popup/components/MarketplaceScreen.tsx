import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, Trophy, Users, X } from "lucide-react";
import {
  CLOAK_DELEGATION_ADDRESS,
  STRK_ADDRESS,
  buildCreateDelegationCalls,
  buildRevokeDelegationCall,
} from "@cloak-wallet/sdk";
import { getApiConfig } from "../../shared/api-config";
import { sendMessage } from "../../shared/messages";
import { Header } from "./ShieldForm";

// Token address map for on-chain delegation calls
const TOKEN_ERC20_ADDRESS: Record<string, string> = {
  STRK: STRK_ADDRESS,
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  USDC: "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080",
};

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

type RunCard = {
  id: string;
  status: string;
  payment_ref?: string | null;
  settlement_tx_hash?: string | null;
  execution_tx_hashes?: string[] | null;
};

type DelegationCard = {
  id: string;
  agent_id: string;
  token: string;
  max_per_run: string;
  total_allowance: string;
  consumed_amount: string;
  remaining_allowance: string;
  status: string;
  valid_until: string;
  created_at: string;
};

type LeaderboardEntry = {
  agent_id: string;
  name: string;
  work_score: number;
  successful_runs: number;
  success_rate: number;
  trust_score: number;
};

function durationToMs(d: "1h" | "24h" | "7d" | "30d"): number {
  const map = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
  return map[d];
}

const DURATION_OPTIONS = ["1h", "24h", "7d", "30d"] as const;
const TOKEN_OPTIONS = ["STRK", "ETH", "USDC"] as const;
const LB_PERIODS = ["24h", "7d", "30d"] as const;

const CAPABILITIES = ["", "stake", "dispatch", "swap", "x402_shielded"] as const;

async function postRunWithX402(input: {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  payerTongoAddress: string;
}): Promise<Response> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": input.apiKey,
  };

  const first = await fetch(`${input.baseUrl}/api/v1/marketplace/runs`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(input.body),
  });
  if (first.status !== 402) {
    return first;
  }

  const rawChallenge = first.headers.get("x-x402-challenge");
  if (!rawChallenge) {
    throw new Error("Missing x402 challenge header");
  }
  const challenge = JSON.parse(rawChallenge) as {
    challengeId: string;
    recipient?: string;
    token: string;
    minAmount: string;
    contextHash: string;
    expiresAt: string;
  };
  throw new Error(
    `x402 payment requires a real Tongo proof bundle + settlement tx hash for challenge ${challenge.challengeId}; synthetic extension fallback proofs are disabled`,
  );
}

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
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [runAction, setRunAction] = useState("swap");
  const [runPayerAddress, setRunPayerAddress] = useState("tongo-extension-operator");
  const [runParamsDraft, setRunParamsDraft] = useState(
    JSON.stringify(
      {
        sell_token: "USDC",
        buy_token: "STRK",
        amount: "25",
      },
      null,
      2,
    ),
  );
  const [lastRunByAgent, setLastRunByAgent] = useState<Record<string, RunCard>>({});

  // Delegation state
  const [delegationsOpen, setDelegationsOpen] = useState(false);
  const [delegations, setDelegations] = useState<DelegationCard[]>([]);
  const [dlgAgentId, setDlgAgentId] = useState("");
  const [dlgToken, setDlgToken] = useState<(typeof TOKEN_OPTIONS)[number]>("STRK");
  const [dlgMaxPerRun, setDlgMaxPerRun] = useState("");
  const [dlgTotalAllowance, setDlgTotalAllowance] = useState("");
  const [dlgDuration, setDlgDuration] = useState<(typeof DURATION_OPTIONS)[number]>("24h");
  const [creatingDlg, setCreatingDlg] = useState(false);
  const [loadingDlg, setLoadingDlg] = useState(false);

  // Leaderboard state
  const [lbOpen, setLbOpen] = useState(false);
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState<(typeof LB_PERIODS)[number]>("7d");
  const [loadingLb, setLoadingLb] = useState(false);

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

  const fetchDelegations = useCallback(async () => {
    setLoadingDlg(true);
    try {
      const cfg = await getApiConfig();
      const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/v1/marketplace/delegations`, {
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.key },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load delegations (${res.status})`);
      setDelegations((payload?.delegations || payload || []) as DelegationCard[]);
    } catch (err: any) {
      setDelegations([]);
      setError(err?.message || "Failed to load delegations");
    } finally {
      setLoadingDlg(false);
    }
  }, []);

  const createDelegation = useCallback(async () => {
    if (!dlgAgentId.trim() || !dlgMaxPerRun.trim() || !dlgTotalAllowance.trim()) {
      setError("Fill in agent ID, max per run, and total allowance");
      return;
    }
    setCreatingDlg(true);
    setError(null);
    setStatus(null);
    try {
      const cfg = await getApiConfig();
      const now = new Date();
      const validFrom = Math.floor(now.getTime() / 1000);
      const validUntil = Math.floor((now.getTime() + durationToMs(dlgDuration)) / 1000);

      // Attempt on-chain delegation creation if the contract is deployed
      let onchainTxHash: string | undefined;
      if (CLOAK_DELEGATION_ADDRESS !== "0x0") {
        try {
          const tokenAddress = TOKEN_ERC20_ADDRESS[dlgToken] || STRK_ADDRESS;
          const calls = buildCreateDelegationCalls({
            delegationContract: CLOAK_DELEGATION_ADDRESS,
            tokenAddress,
            totalAllowance: dlgTotalAllowance.trim(),
            operator: dlgAgentId.trim(), // agent's operator address
            agentId: dlgAgentId.trim(),
            maxPerRun: dlgMaxPerRun.trim(),
            validFrom,
            validUntil,
          });
          const result = await sendMessage({
            type: "EXECUTE_DELEGATION_CALLS",
            calls,
            action: "create_delegation",
          });
          onchainTxHash = result?.txHash as string | undefined;
        } catch (onchainErr: any) {
          // On-chain step failed — surface error and abort so we don't create an orphaned DB record
          throw new Error(`On-chain delegation tx failed: ${onchainErr?.message || String(onchainErr)}`);
        }
      }

      const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/v1/marketplace/delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.key },
        body: JSON.stringify({
          agent_id: dlgAgentId.trim(),
          token: dlgToken,
          max_per_run: dlgMaxPerRun.trim(),
          total_allowance: dlgTotalAllowance.trim(),
          valid_from: now.toISOString(),
          valid_until: new Date(validUntil * 1000).toISOString(),
          ...(onchainTxHash ? { onchain_tx_hash: onchainTxHash } : {}),
          ...(CLOAK_DELEGATION_ADDRESS !== "0x0" ? { delegation_contract: CLOAK_DELEGATION_ADDRESS } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to create delegation (${res.status})`);
      setStatus(`Delegation created: ${payload.id || "ok"}`);
      setDlgAgentId("");
      setDlgMaxPerRun("");
      setDlgTotalAllowance("");
      void fetchDelegations();
    } catch (err: any) {
      setError(err?.message || "Failed to create delegation");
    } finally {
      setCreatingDlg(false);
    }
  }, [dlgAgentId, dlgToken, dlgMaxPerRun, dlgTotalAllowance, dlgDuration, fetchDelegations]);

  const revokeDelegation = useCallback(async (id: string) => {
    setError(null);
    setStatus(null);
    try {
      // Attempt on-chain revocation if the contract is deployed
      let onchainTxHash: string | undefined;
      if (CLOAK_DELEGATION_ADDRESS !== "0x0") {
        try {
          const call = buildRevokeDelegationCall(CLOAK_DELEGATION_ADDRESS, id);
          const result = await sendMessage({
            type: "EXECUTE_DELEGATION_CALLS",
            calls: [call],
            action: "revoke_delegation",
          });
          onchainTxHash = result?.txHash as string | undefined;
        } catch (onchainErr: any) {
          // On-chain step failed — surface error and abort so the DB record stays consistent
          throw new Error(`On-chain revoke tx failed: ${onchainErr?.message || String(onchainErr)}`);
        }
      }

      const cfg = await getApiConfig();
      const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/v1/marketplace/delegations/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.key },
        body: JSON.stringify({
          ...(onchainTxHash ? { onchain_tx_hash: onchainTxHash } : {}),
          ...(CLOAK_DELEGATION_ADDRESS !== "0x0" ? { delegation_contract: CLOAK_DELEGATION_ADDRESS } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to revoke delegation (${res.status})`);
      setStatus(`Delegation ${id.slice(0, 8)}... revoked`);
      void fetchDelegations();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke delegation");
    }
  }, [fetchDelegations]);

  const fetchLeaderboard = useCallback(async () => {
    setLoadingLb(true);
    try {
      const cfg = await getApiConfig();
      const params = new URLSearchParams({ period: lbPeriod, limit: "5" });
      const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/v1/marketplace/leaderboard?${params.toString()}`, {
        headers: { "Content-Type": "application/json", "X-API-Key": cfg.key },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load leaderboard (${res.status})`);
      setLbEntries((payload?.entries || payload || []) as LeaderboardEntry[]);
    } catch (err: any) {
      setLbEntries([]);
      setError(err?.message || "Failed to load leaderboard");
    } finally {
      setLoadingLb(false);
    }
  }, [lbPeriod]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (delegationsOpen) void fetchDelegations();
  }, [delegationsOpen, fetchDelegations]);

  useEffect(() => {
    if (lbOpen) void fetchLeaderboard();
  }, [lbOpen, fetchLeaderboard]);

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

  const runPaidExecution = useCallback(
    async (agent: AgentCard) => {
      const hireId = hireIdsByAgent[agent.agent_id];
      if (!hireId) {
        setError("Create a hire before running paid execution");
        return;
      }

      setRunningAgent(agent.agent_id);
      setError(null);
      setStatus(null);
      try {
        let parsedParams: Record<string, unknown> = {};
        try {
          parsedParams = JSON.parse(runParamsDraft) as Record<string, unknown>;
        } catch {
          throw new Error("Run params JSON is invalid");
        }

        const cfg = await getApiConfig();
        const baseUrl = cfg.url.replace(/\/$/, "");
        const response = await postRunWithX402({
          baseUrl,
          apiKey: cfg.key,
          payerTongoAddress: runPayerAddress,
          body: {
            hire_id: hireId,
            agent_id: agent.agent_id,
            action: runAction,
            params: parsedParams,
            billable: true,
            execute: true,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || `Paid run failed (${response.status})`);
        }
        const run = payload as RunCard;
        setLastRunByAgent(prev => ({ ...prev, [agent.agent_id]: run }));
        setStatus(`Paid run completed: ${run.id}`);
      } catch (err: any) {
        setError(err?.message || "Failed to execute paid run");
      } finally {
        setRunningAgent(null);
      }
    },
    [hireIdsByAgent, runAction, runParamsDraft, runPayerAddress],
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

      <div className="rounded-xl border border-cloak-border bg-cloak-card p-3 mb-3">
        <p className="text-[10px] text-cloak-muted uppercase tracking-wider mb-1.5">Paid run (x402)</p>
        <div className="flex flex-col gap-2">
          <input
            value={runAction}
            onChange={(e) => setRunAction(e.target.value)}
            className="w-full h-8 px-2 rounded-lg bg-cloak-input-bg border border-cloak-border text-[11px] text-cloak-text outline-none"
            placeholder="run action"
          />
          <input
            value={runPayerAddress}
            onChange={(e) => setRunPayerAddress(e.target.value)}
            className="w-full h-8 px-2 rounded-lg bg-cloak-input-bg border border-cloak-border text-[11px] text-cloak-text outline-none"
            placeholder="payer tongo address"
          />
          <textarea
            value={runParamsDraft}
            onChange={(e) => setRunParamsDraft(e.target.value)}
            className="w-full h-20 px-2 py-2 rounded-lg bg-cloak-input-bg border border-cloak-border text-[10px] text-cloak-text font-mono resize-none outline-none"
          />
        </div>
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
              <button
                onClick={() => void runPaidExecution(agent)}
                disabled={!hireIdsByAgent[agent.agent_id] || runningAgent === agent.agent_id}
                className="w-full h-8 mt-2 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-[11px] font-medium disabled:opacity-50"
              >
                {runningAgent === agent.agent_id ? "Running..." : "Run paid action"}
              </button>
              {lastRunByAgent[agent.agent_id] && (
                <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-2">
                  <p className="text-[10px] text-violet-200 font-mono">
                    run: {lastRunByAgent[agent.agent_id].id}
                  </p>
                  <p className="text-[10px] text-violet-200">
                    status: {lastRunByAgent[agent.agent_id].status}
                  </p>
                  <p className="text-[10px] text-violet-200 break-all">
                    payment_ref: {lastRunByAgent[agent.agent_id].payment_ref || "n/a"}
                  </p>
                  <p className="text-[10px] text-violet-200 break-all">
                    settlement_tx: {lastRunByAgent[agent.agent_id].settlement_tx_hash || "n/a"}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Delegations Section ── */}
      <div className="rounded-xl border border-cloak-border bg-cloak-card mb-3">
        <button
          onClick={() => setDelegationsOpen(o => !o)}
          className="w-full flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cloak-primary" />
            <p className="text-sm font-semibold text-cloak-text">Delegations</p>
          </div>
          {delegationsOpen
            ? <ChevronDown className="w-4 h-4 text-cloak-muted" />
            : <ChevronRight className="w-4 h-4 text-cloak-muted" />}
        </button>

        {delegationsOpen && (
          <div className="px-3 pb-3">
            {/* Create delegation form */}
            <div className="rounded-lg border border-cloak-border bg-cloak-input-bg p-2.5 mb-2">
              <p className="text-[10px] text-cloak-muted uppercase tracking-wider mb-2">New delegation</p>
              <input
                value={dlgAgentId}
                onChange={e => setDlgAgentId(e.target.value)}
                className="w-full h-7 px-2 mb-1.5 rounded-md bg-cloak-bg border border-cloak-border text-[11px] text-cloak-text outline-none"
                placeholder="Agent ID"
              />
              <div className="flex gap-1.5 mb-1.5">
                {TOKEN_OPTIONS.map(t => {
                  const selected = dlgToken === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setDlgToken(t)}
                      className={`px-2 py-1 rounded-full border text-[10px] ${
                        selected
                          ? "border-cloak-primary text-cloak-primary bg-blue-500/10"
                          : "border-cloak-border text-cloak-muted bg-cloak-bg"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mb-1.5">
                <input
                  value={dlgMaxPerRun}
                  onChange={e => setDlgMaxPerRun(e.target.value)}
                  className="flex-1 h-7 px-2 rounded-md bg-cloak-bg border border-cloak-border text-[11px] text-cloak-text outline-none"
                  placeholder="Max per run"
                />
                <input
                  value={dlgTotalAllowance}
                  onChange={e => setDlgTotalAllowance(e.target.value)}
                  className="flex-1 h-7 px-2 rounded-md bg-cloak-bg border border-cloak-border text-[11px] text-cloak-text outline-none"
                  placeholder="Total allowance"
                />
              </div>
              <div className="flex gap-1.5 mb-2">
                {DURATION_OPTIONS.map(d => {
                  const selected = dlgDuration === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setDlgDuration(d)}
                      className={`px-2 py-1 rounded-full border text-[10px] ${
                        selected
                          ? "border-cloak-primary text-cloak-primary bg-blue-500/10"
                          : "border-cloak-border text-cloak-muted bg-cloak-bg"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => void createDelegation()}
                disabled={creatingDlg}
                className="w-full h-7 rounded-lg bg-cloak-primary hover:bg-cloak-primary-hover text-white text-[11px] font-medium disabled:opacity-50"
              >
                {creatingDlg ? "Creating..." : "Create"}
              </button>
            </div>

            {/* Active delegations list */}
            {loadingDlg ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cloak-primary" />
              </div>
            ) : delegations.length === 0 ? (
              <p className="text-[10px] text-cloak-muted text-center py-3">No delegations yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {delegations.map(dlg => (
                  <div
                    key={dlg.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-cloak-border bg-cloak-input-bg px-2 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-cloak-text font-mono truncate">
                        {dlg.agent_id.length > 16
                          ? `${dlg.agent_id.slice(0, 8)}...${dlg.agent_id.slice(-6)}`
                          : dlg.agent_id}
                      </p>
                      <p className="text-[10px] text-cloak-muted">
                        {dlg.token} &middot; {dlg.consumed_amount}/{dlg.total_allowance}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          dlg.status === "active" ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      <button
                        onClick={() => void revokeDelegation(dlg.id)}
                        className="p-1 rounded-md hover:bg-red-500/20"
                        title="Revoke delegation"
                      >
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Leaderboard Section ── */}
      <div className="rounded-xl border border-cloak-border bg-cloak-card mb-3">
        <button
          onClick={() => setLbOpen(o => !o)}
          className="w-full flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-cloak-text">Leaderboard</p>
          </div>
          {lbOpen
            ? <ChevronDown className="w-4 h-4 text-cloak-muted" />
            : <ChevronRight className="w-4 h-4 text-cloak-muted" />}
        </button>

        {lbOpen && (
          <div className="px-3 pb-3">
            <div className="flex gap-1.5 mb-2">
              {LB_PERIODS.map(p => {
                const selected = lbPeriod === p;
                return (
                  <button
                    key={p}
                    onClick={() => setLbPeriod(p)}
                    className={`px-2 py-1 rounded-full border text-[10px] ${
                      selected
                        ? "border-amber-400 text-amber-400 bg-amber-500/10"
                        : "border-cloak-border text-cloak-muted bg-cloak-input-bg"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {loadingLb ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cloak-primary" />
              </div>
            ) : lbEntries.length === 0 ? (
              <p className="text-[10px] text-cloak-muted text-center py-3">No leaderboard data.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {lbEntries.map((entry, idx) => (
                  <div
                    key={entry.agent_id}
                    className="flex items-center gap-2 rounded-lg border border-cloak-border bg-cloak-input-bg px-2 py-1.5"
                  >
                    <span className="text-[11px] font-bold text-amber-400 w-5 text-center">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-cloak-text font-medium truncate">
                        {entry.name}
                      </p>
                    </div>
                    <span className="text-[10px] text-cloak-muted">
                      {entry.work_score} pts
                    </span>
                    <span className="text-[10px] text-cloak-muted">
                      {entry.successful_runs} runs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
