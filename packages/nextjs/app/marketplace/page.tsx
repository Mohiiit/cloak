"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEndpointOwnershipProof,
  buildCreateDelegationCalls,
  buildRevokeDelegationCall,
  CLOAK_DELEGATION_ADDRESS,
  STRK_ADDRESS,
  TOKENS,
  type AgentProfileResponse,
  type AgentType,
} from "@cloak-wallet/sdk";
import { useAccount } from "@starknet-react/core";
import { getApiConfig } from "~~/lib/api-client";

// ─── Token address resolution ─────────────────────────────────────────────────

const TOKEN_ADDRESS_MAP: Record<string, string> = {
  STRK: STRK_ADDRESS,
  ETH: TOKENS.ETH.erc20Address,
  USDC: TOKENS.USDC.erc20Address,
};

const TOKEN_DECIMALS_MAP: Record<string, number> = {
  STRK: TOKENS.STRK.decimals,
  ETH: TOKENS.ETH.decimals,
  USDC: TOKENS.USDC.decimals,
};

/** Convert a human-readable token amount (e.g. "10") to wei as a decimal string. */
function toWeiString(humanAmount: string, token: string): string {
  const decimals = TOKEN_DECIMALS_MAP[token] ?? 18;
  const parts = humanAmount.split(".");
  const whole = BigInt(parts[0] || "0");
  const frac = (parts[1] ?? "").padEnd(decimals, "0").slice(0, decimals);
  return (whole * 10n ** BigInt(decimals) + BigInt(frac)).toString();
}

/** Encode an ASCII agent ID string as a felt252 hex string (big-endian). */
function agentIdToFelt252(agentId: string): string {
  let hex = "";
  for (let i = 0; i < agentId.length; i++) {
    hex += agentId.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `0x${hex || "0"}`;
}

type DiscoveredAgent = AgentProfileResponse & { discovery_score: number };

type Delegation = {
  id: string;
  agent_id: string;
  token: string;
  max_per_run: string;
  total_allowance: string;
  consumed: string;
  expires_at: string;
  status: string;
};

type LeaderboardEntry = {
  agent_id: string;
  agent_name: string;
  work_score: number;
  runs: number;
  success_rate: number;
  trust_score: number;
};

function durationToMs(d: "1h" | "24h" | "7d" | "30d"): number {
  return { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 }[d];
}

type AgentTypeOption = {
  value: AgentType;
  label: string;
  description?: string;
  default_capabilities?: string[];
};

const AGENT_TYPES_CACHE_KEY = "cloak.marketplace.agent-types.v1";
const AGENT_TYPES_CACHE_TTL_MS = 5 * 60 * 1000;

const AGENT_TYPE_VALUES = [
  "staking_steward",
  "treasury_dispatcher",
  "swap_runner",
] satisfies AgentType[];

const CAPABILITIES = [
  { label: "Any capability", value: "" },
  { label: "stake", value: "stake" },
  { label: "dispatch", value: "dispatch" },
  { label: "swap", value: "swap" },
  { label: "x402_shielded", value: "x402_shielded" },
];

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
      const description = (item as { description?: unknown }).description;
      const defaultCapabilities = (item as { default_capabilities?: unknown }).default_capabilities;
      return {
        value,
        label: typeof label === "string" && label.trim().length > 0 ? label : value,
        description: typeof description === "string" ? description : undefined,
        default_capabilities: Array.isArray(defaultCapabilities)
          ? defaultCapabilities
              .map(entry => String(entry).trim())
              .filter(Boolean)
          : [],
      };
    })
    .filter((item): item is AgentTypeOption => !!item);
}

function parseList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/g)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  );
}

export default function MarketplacePage() {
  const { account } = useAccount();

  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [agentTypeOptions, setAgentTypeOptions] = useState<AgentTypeOption[]>([]);
  const [agentTypeOptionsError, setAgentTypeOptionsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentType, setAgentType] = useState("");
  const [capability, setCapability] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [newAgentType, setNewAgentType] = useState<AgentType>("staking_steward");
  const [newAgentCapabilities, setNewAgentCapabilities] = useState("stake\nx402_shielded");
  const [newAgentEndpoints, setNewAgentEndpoints] = useState("https://agent.example.com/execute");
  const [newAgentAmount, setNewAgentAmount] = useState("25");
  const [newAgentToken, setNewAgentToken] = useState("STRK");
  const [newAgentServiceWallet, setNewAgentServiceWallet] = useState("");

  // --- Delegations ---
  const [delegationsOpen, setDelegationsOpen] = useState(false);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [dlgAgentId, setDlgAgentId] = useState("");
  const [dlgToken, setDlgToken] = useState("STRK");
  const [dlgMaxPerRun, setDlgMaxPerRun] = useState("");
  const [dlgTotalAllowance, setDlgTotalAllowance] = useState("");
  const [dlgDuration, setDlgDuration] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [creatingDlg, setCreatingDlg] = useState(false);
  const [dlgLoading, setDlgLoading] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);

  // --- Leaderboard ---
  const [lbOpen, setLbOpen] = useState(false);
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState<"24h" | "7d" | "30d">("7d");
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);

  const missingApiKey = useMemo(() => !getApiConfig().key, []);

  const loadAgentTypes = useCallback(async () => {
    const { key } = getApiConfig();
    if (!key) {
      setAgentTypeOptions([]);
      setAgentTypeOptionsError("Missing API key. Add it in Settings to load agent types.");
      return;
    }

    try {
      setAgentTypeOptionsError(null);
      if (typeof window !== "undefined") {
        const cachedRaw = window.localStorage.getItem(AGENT_TYPES_CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as {
            expiresAt?: number;
            agent_types?: unknown;
          };
          if (
            typeof cached.expiresAt === "number" &&
            cached.expiresAt > Date.now() &&
            Array.isArray(cached.agent_types)
          ) {
            const normalized = normalizeAgentTypeOptions(cached.agent_types);
            if (normalized.length > 0) {
              setAgentTypeOptions(normalized);
              return;
            }
          }
        }
      }

      const res = await fetch("/api/v1/marketplace/agent-types", {
        headers: {
          "X-API-Key": key,
        },
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        agent_types?: unknown;
      };
      if (!res.ok) {
        throw new Error(payload.error || `Agent type request failed (${res.status})`);
      }
      const normalized = normalizeAgentTypeOptions(payload.agent_types);
      if (normalized.length === 0) {
        throw new Error("No agent types configured on backend.");
      }
      setAgentTypeOptions(normalized);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          AGENT_TYPES_CACHE_KEY,
          JSON.stringify({
            expiresAt: Date.now() + AGENT_TYPES_CACHE_TTL_MS,
            agent_types: normalized,
          }),
        );
      }
    } catch (err) {
      setAgentTypeOptions([]);
      setAgentTypeOptionsError(
        err instanceof Error ? err.message : "Failed to load agent type definitions",
      );
    }
  }, []);

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
    void loadAgentTypes();
  }, [loadAgentTypes]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (agentTypeOptions.length === 0) return;
    if (!agentTypeOptions.some(option => option.value === newAgentType)) {
      setNewAgentType(agentTypeOptions[0].value);
    }
  }, [agentTypeOptions, newAgentType]);

  useEffect(() => {
    if (!agentType || agentTypeOptions.length === 0) return;
    if (!agentTypeOptions.some(option => option.value === agentType)) {
      setAgentType("");
    }
  }, [agentType, agentTypeOptions]);

  // --- Delegation callbacks ---
  const loadDelegations = useCallback(async () => {
    setDlgLoading(true);
    setDlgError(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");
      const res = await fetch("/api/v1/marketplace/delegations", {
        headers: { "X-API-Key": key },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed to load delegations (${res.status})`);
      setDelegations((body.delegations || []) as Delegation[]);
    } catch (err) {
      setDlgError(err instanceof Error ? err.message : "Failed to load delegations");
    } finally {
      setDlgLoading(false);
    }
  }, []);

  const handleCreateDelegation = useCallback(async () => {
    setCreatingDlg(true);
    setDlgError(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");
      if (!dlgAgentId.trim()) throw new Error("Agent ID is required");
      if (!dlgMaxPerRun.trim()) throw new Error("Max per run is required");
      if (!dlgTotalAllowance.trim()) throw new Error("Total allowance is required");

      // ── On-chain delegation creation ──────────────────────────────────────
      let onchainTxHash: string | undefined;
      const delegationAddr = CLOAK_DELEGATION_ADDRESS;
      const durationMs = durationToMs(dlgDuration);
      const validFrom = Math.floor(Date.now() / 1000);
      const validUntil = Math.floor((Date.now() + durationMs) / 1000);

      if (delegationAddr && String(delegationAddr) !== "0x0" && account) {
        const tokenAddress = TOKEN_ADDRESS_MAP[dlgToken] ?? STRK_ADDRESS;
        const totalAllowanceWei = toWeiString(dlgTotalAllowance.trim(), dlgToken);
        const maxPerRunWei = toWeiString(dlgMaxPerRun.trim(), dlgToken);
        const agentIdHex = agentIdToFelt252(dlgAgentId.trim());

        const calls = buildCreateDelegationCalls({
          delegationContract: delegationAddr,
          tokenAddress,
          totalAllowance: totalAllowanceWei,
          operator: account.address,
          agentId: agentIdHex,
          maxPerRun: maxPerRunWei,
          validFrom,
          validUntil,
        });

        const result = await account.execute(calls);
        onchainTxHash = result.transaction_hash;
      }

      // ── API call ──────────────────────────────────────────────────────────
      const apiBody: Record<string, unknown> = {
        agent_id: dlgAgentId.trim(),
        token: dlgToken,
        max_per_run: dlgMaxPerRun.trim(),
        total_allowance: dlgTotalAllowance.trim(),
        duration_ms: durationMs,
      };
      if (onchainTxHash) apiBody.onchain_tx_hash = onchainTxHash;
      if (delegationAddr && String(delegationAddr) !== "0x0") {
        apiBody.delegation_contract = delegationAddr;
      }

      const res = await fetch("/api/v1/marketplace/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify(apiBody),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Delegation creation failed (${res.status})`);
      await loadDelegations();
      setDlgAgentId("");
      setDlgMaxPerRun("");
      setDlgTotalAllowance("");
    } catch (err) {
      setDlgError(err instanceof Error ? err.message : "Failed to create delegation");
    } finally {
      setCreatingDlg(false);
    }
  }, [account, dlgAgentId, dlgToken, dlgMaxPerRun, dlgTotalAllowance, dlgDuration, loadDelegations]);

  const handleRevokeDelegation = useCallback(async (id: string) => {
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");

      // ── On-chain revocation ───────────────────────────────────────────────
      const delegationAddr = CLOAK_DELEGATION_ADDRESS;
      if (delegationAddr && String(delegationAddr) !== "0x0" && account) {
        const call = buildRevokeDelegationCall(delegationAddr, id);
        await account.execute([call]);
      }

      // ── API call ──────────────────────────────────────────────────────────
      const res = await fetch(`/api/v1/marketplace/delegations/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        headers: { "X-API-Key": key },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Revoke failed (${res.status})`);
      await loadDelegations();
    } catch (err) {
      setDlgError(err instanceof Error ? err.message : "Failed to revoke delegation");
    }
  }, [account, loadDelegations]);

  // --- Leaderboard callback ---
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

  useEffect(() => {
    if (delegationsOpen) void loadDelegations();
  }, [delegationsOpen, loadDelegations]);

  useEffect(() => {
    if (lbOpen) void loadLeaderboard();
  }, [lbOpen, loadLeaderboard]);

  const registerAgent = useCallback(async () => {
    setRegistering(true);
    setRegisterError(null);
    setRegisterSuccess(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key. Configure Settings first.");

      const verifyRes = await fetch("/api/v1/auth/verify", {
        headers: { "X-API-Key": key },
      });
      const verifyJson = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyJson.wallet_address) {
        throw new Error("Unable to resolve operator wallet from API key.");
      }
      const operatorWallet = String(verifyJson.wallet_address);
      const serviceWallet = newAgentServiceWallet.trim() || operatorWallet;

      const capabilities = parseList(newAgentCapabilities);
      const endpoints = parseList(newAgentEndpoints);
      if (!newAgentId.trim()) throw new Error("agent_id is required.");
      if (!newAgentName.trim()) throw new Error("name is required.");
      if (!newAgentDescription.trim()) throw new Error("description is required.");
      if (capabilities.length === 0) throw new Error("At least one capability is required.");
      if (endpoints.length === 0) throw new Error("At least one endpoint is required.");
      if (!newAgentAmount.trim()) throw new Error("pricing amount is required.");
      if (!newAgentToken.trim()) throw new Error("pricing token is required.");

      const endpointProofs = endpoints.map((endpoint, index) =>
        createEndpointOwnershipProof({
          endpoint,
          operatorWallet,
          nonce:
            typeof globalThis.crypto !== "undefined" &&
            typeof globalThis.crypto.randomUUID === "function"
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}_${index}`,
        }),
      );

      const res = await fetch("/api/v1/marketplace/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": key,
        },
        body: JSON.stringify({
          agent_id: newAgentId.trim(),
          name: newAgentName.trim(),
          description: newAgentDescription.trim(),
          agent_type: newAgentType,
          capabilities,
          endpoints,
          endpoint_proofs: endpointProofs,
          pricing: {
            mode: "per_run",
            amount: newAgentAmount.trim(),
            token: newAgentToken.trim().toUpperCase(),
          },
          operator_wallet: operatorWallet,
          service_wallet: serviceWallet,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Agent registration failed (${res.status})`);
      }

      setRegisterSuccess(`Agent registered: ${body.agent_id || newAgentId.trim()}`);
      await loadAgents();
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : "Failed to register agent profile",
      );
    } finally {
      setRegistering(false);
    }
  }, [
    loadAgents,
    newAgentAmount,
    newAgentCapabilities,
    newAgentDescription,
    newAgentEndpoints,
    newAgentId,
    newAgentName,
    newAgentServiceWallet,
    newAgentToken,
    newAgentType,
  ]);

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
              <option value="">All</option>
              {agentTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
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

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-slate-100">Create agent profile</h2>
          <p className="text-xs text-slate-400 mt-1">
            Minimal registration flow for third-party operators.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Agent ID</span>
            <input
              value={newAgentId}
              onChange={e => setNewAgentId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
              placeholder="my_swap_runner_v1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Agent type</span>
            <select
              value={newAgentType}
              onChange={e => setNewAgentType(e.target.value as AgentType)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            >
              {agentTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-slate-400">Name</span>
            <input
              value={newAgentName}
              onChange={e => setNewAgentName(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
              placeholder="My Swap Runner"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-slate-400">Description</span>
            <textarea
              value={newAgentDescription}
              onChange={e => setNewAgentDescription(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 h-20"
              placeholder="Executes policy-scoped swaps"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Capabilities (comma/newline)</span>
            <textarea
              value={newAgentCapabilities}
              onChange={e => setNewAgentCapabilities(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono h-24"
              placeholder={"swap\nx402_shielded"}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Endpoints (comma/newline)</span>
            <textarea
              value={newAgentEndpoints}
              onChange={e => setNewAgentEndpoints(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono h-24"
              placeholder="https://agent.example.com/execute"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Pricing amount</span>
            <input
              value={newAgentAmount}
              onChange={e => setNewAgentAmount(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
              placeholder="25"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Pricing token</span>
            <input
              value={newAgentToken}
              onChange={e => setNewAgentToken(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
              placeholder="STRK"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-slate-400">
              Service wallet (optional, defaults to operator wallet)
            </span>
            <input
              value={newAgentServiceWallet}
              onChange={e => setNewAgentServiceWallet(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
              placeholder="0x..."
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void registerAgent()}
            disabled={registering || agentTypeOptions.length === 0}
            className="text-xs px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {registering ? "Registering..." : "Register agent"}
          </button>
          {registerSuccess && <span className="text-xs text-emerald-300">{registerSuccess}</span>}
        </div>

        {registerError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {registerError}
          </div>
        )}
        {agentTypeOptionsError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {agentTypeOptionsError}
          </div>
        )}
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

      {/* ── Delegations ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60">
        <button
          type="button"
          onClick={() => setDelegationsOpen(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <h2 className="text-sm font-medium text-slate-100">Delegations</h2>
          <span className="text-slate-400 text-xs">{delegationsOpen ? "▲" : "▼"}</span>
        </button>

        {delegationsOpen && (
          <div className="px-4 pb-4 space-y-4">
            {/* Create delegation form */}
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-3">
              <h3 className="text-sm font-medium text-slate-200">Create delegation</h3>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Agent ID</span>
                <input
                  value={dlgAgentId}
                  onChange={e => setDlgAgentId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
                  placeholder="agent_id"
                />
              </label>

              <div className="space-y-1">
                <span className="text-xs text-slate-400">Token</span>
                <div className="flex gap-2">
                  {(["STRK", "ETH", "USDC"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDlgToken(t)}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        dlgToken === t
                          ? "border-blue-500 bg-blue-500/20 text-blue-200"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Max per run</span>
                  <input
                    value={dlgMaxPerRun}
                    onChange={e => setDlgMaxPerRun(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                    placeholder="10"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Total allowance</span>
                  <input
                    value={dlgTotalAllowance}
                    onChange={e => setDlgTotalAllowance(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                    placeholder="100"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-400">Duration</span>
                <div className="flex gap-2">
                  {(["1h", "24h", "7d", "30d"] as const).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDlgDuration(d)}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        dlgDuration === d
                          ? "border-blue-500 bg-blue-500/20 text-blue-200"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleCreateDelegation()}
                disabled={creatingDlg}
                className="text-xs px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
              >
                {creatingDlg ? "Creating..." : "Create delegation"}
              </button>
            </div>

            {dlgError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {dlgError}
              </div>
            )}

            {/* Active delegations table */}
            {dlgLoading && <div className="text-xs text-slate-400">Loading delegations...</div>}

            {!dlgLoading && delegations.length === 0 && (
              <div className="text-xs text-slate-400">No delegations found.</div>
            )}

            {!dlgLoading && delegations.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-3">Agent</th>
                      <th className="pb-2 pr-3">Token</th>
                      <th className="pb-2 pr-3">Consumed / Total</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegations.map(dlg => (
                      <tr key={dlg.id} className="border-b border-slate-800">
                        <td className="py-2 pr-3 text-slate-200 font-mono">{dlg.agent_id}</td>
                        <td className="py-2 pr-3 text-slate-300">{dlg.token}</td>
                        <td className="py-2 pr-3 text-slate-300">
                          {dlg.consumed} / {dlg.total_allowance}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              dlg.status === "active"
                                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                                : "bg-red-500/10 border border-red-500/30 text-red-300"
                            }`}
                          >
                            {dlg.status}
                          </span>
                        </td>
                        <td className="py-2">
                          {dlg.status === "active" && (
                            <button
                              type="button"
                              onClick={() => void handleRevokeDelegation(dlg.id)}
                              className="text-[10px] px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Leaderboard ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60">
        <button
          type="button"
          onClick={() => setLbOpen(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <h2 className="text-sm font-medium text-slate-100">Leaderboard</h2>
          <span className="text-slate-400 text-xs">{lbOpen ? "▲" : "▼"}</span>
        </button>

        {lbOpen && (
          <div className="px-4 pb-4 space-y-4">
            <div className="flex gap-2">
              {(["24h", "7d", "30d"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLbPeriod(p)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${
                    lbPeriod === p
                      ? "border-blue-500 bg-blue-500/20 text-blue-200"
                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {lbError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {lbError}
              </div>
            )}

            {lbLoading && <div className="text-xs text-slate-400">Loading leaderboard...</div>}

            {!lbLoading && lbEntries.length === 0 && !lbError && (
              <div className="text-xs text-slate-400">No leaderboard data for this period.</div>
            )}

            {!lbLoading && lbEntries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-3">Rank</th>
                      <th className="pb-2 pr-3">Agent</th>
                      <th className="pb-2 pr-3">Work Score</th>
                      <th className="pb-2 pr-3">Runs</th>
                      <th className="pb-2 pr-3">Success Rate</th>
                      <th className="pb-2">Trust Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbEntries.map((entry, idx) => (
                      <tr key={entry.agent_id} className="border-b border-slate-800">
                        <td className="py-2 pr-3 text-slate-300">{idx + 1}</td>
                        <td className="py-2 pr-3">
                          <Link
                            href={`/marketplace/${encodeURIComponent(entry.agent_id)}`}
                            className="text-blue-300 hover:underline"
                          >
                            {entry.agent_name || entry.agent_id}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-slate-200 font-mono">{entry.work_score}</td>
                        <td className="py-2 pr-3 text-slate-300">{entry.runs}</td>
                        <td className="py-2 pr-3 text-slate-300">
                          {(entry.success_rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 text-slate-300">{entry.trust_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
