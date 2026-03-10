"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  createEndpointOwnershipProof,
  buildCreateDelegationCalls,
  buildRevokeDelegationCall,
  CLOAK_DELEGATION_ADDRESS,
  STRK_ADDRESS,
  TOKENS,
  type AgentType,
} from "@cloak-wallet/sdk";
import { useAccount } from "@starknet-react/core";
import { getApiConfig } from "~~/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "register" | "delegations";

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

type AgentTypeOption = {
  value: AgentType;
  label: string;
  description?: string;
  default_capabilities?: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

const CAPABILITY_SUGGESTIONS = ["stake", "unstake", "swap", "dispatch", "x402_shielded", "rebalance"];

const AGENT_TYPES_CACHE_KEY = "cloak.marketplace.agent-types.v1";
const AGENT_TYPES_CACHE_TTL_MS = 5 * 60 * 1000;

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
      const description = (item as { description?: unknown }).description;
      const defaultCapabilities = (item as { default_capabilities?: unknown }).default_capabilities;
      return {
        value,
        label: typeof label === "string" && label.trim().length > 0 ? label : value,
        description: typeof description === "string" ? description : undefined,
        default_capabilities: Array.isArray(defaultCapabilities)
          ? defaultCapabilities.map(e => String(e).trim()).filter(Boolean)
          : [],
      };
    })
    .filter((item): item is AgentTypeOption => !!item);
}

function toWeiString(humanAmount: string, token: string): string {
  const decimals = TOKEN_DECIMALS_MAP[token] ?? 18;
  const parts = humanAmount.split(".");
  const whole = BigInt(parts[0] || "0");
  const frac = (parts[1] ?? "").padEnd(decimals, "0").slice(0, decimals);
  return (whole * 10n ** BigInt(decimals) + BigInt(frac)).toString();
}

function agentIdToFelt252(agentId: string): string {
  let hex = "";
  for (let i = 0; i < agentId.length; i++) {
    hex += agentId.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `0x${hex || "0"}`;
}

function durationToMs(d: "1h" | "24h" | "7d" | "30d"): number {
  return { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 }[d];
}

// ─── TagInput ─────────────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  suggestions,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) {
      onChange([...tags, clean]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]!);
    }
  };

  const visibleSuggestions = (suggestions ?? []).filter(s => !tags.includes(s));

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-1.5 p-2 min-h-[2.75rem] rounded-lg border border-slate-700 bg-slate-950 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-300"
          >
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag); }}
              className="leading-none text-blue-400 hover:text-white ml-0.5"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          className="flex-1 min-w-[8rem] bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
          placeholder={tags.length === 0 ? (placeholder ?? "Type and press Enter…") : ""}
        />
      </div>
      {visibleSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleSuggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="text-[11px] px-2 py-0.5 rounded-full border border-slate-700 text-slate-500 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EndpointList ─────────────────────────────────────────────────────────────

function EndpointList({
  endpoints,
  onChange,
}: {
  endpoints: string[];
  onChange: (endpoints: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addEndpoint = () => {
    const clean = input.trim();
    if (clean && !endpoints.includes(clean)) {
      onChange([...endpoints, clean]);
    }
    setInput("");
  };

  const removeEndpoint = (url: string) => {
    onChange(endpoints.filter(e => e !== url));
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {endpoints.map(url => (
          <div key={url} className="flex items-center gap-2">
            <code className="flex-1 text-xs text-slate-300 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 truncate">
              {url}
            </code>
            <button
              type="button"
              onClick={() => removeEndpoint(url)}
              className="flex-shrink-0 text-xs px-2 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Remove endpoint"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEndpoint(); } }}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-600"
          placeholder="https://agent.example.com/execute"
        />
        <button
          type="button"
          onClick={addEndpoint}
          className="flex-shrink-0 text-xs px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold text-slate-100 mt-1 tabular-nums">{value}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketplaceDashboardPage() {
  const { account } = useAccount();
  const [tab, setTab] = useState<Tab>("overview");

  // ── Overview state ──
  const [hires, setHires] = useState<HireItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // ── Register agent state ──
  const [agentTypeOptions, setAgentTypeOptions] = useState<AgentTypeOption[]>([]);
  const [agentTypeOptionsError, setAgentTypeOptionsError] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentType, setNewAgentType] = useState<AgentType>("staking_steward");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [newAgentCapabilities, setNewAgentCapabilities] = useState<string[]>(["stake", "x402_shielded"]);
  const [newAgentEndpoints, setNewAgentEndpoints] = useState<string[]>([]);
  const [newAgentAmount, setNewAgentAmount] = useState("25");
  const [newAgentToken, setNewAgentToken] = useState("STRK");
  const [newAgentServiceWallet, setNewAgentServiceWallet] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // ── Delegation state ──
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [dlgAgentId, setDlgAgentId] = useState("");
  const [dlgToken, setDlgToken] = useState("STRK");
  const [dlgMaxPerRun, setDlgMaxPerRun] = useState("");
  const [dlgTotalAllowance, setDlgTotalAllowance] = useState("");
  const [dlgDuration, setDlgDuration] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [creatingDlg, setCreatingDlg] = useState(false);
  const [dlgLoading, setDlgLoading] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);

  const missingApiKey = useMemo(() => !getApiConfig().key, []);

  const selectedAgentTypeOption = agentTypeOptions.find(o => o.value === newAgentType);

  // ── Overview ──
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key. Configure Settings first.");
      const [hiresRes, runsRes] = await Promise.all([
        fetch("/api/v1/marketplace/hires?limit=50&offset=0", { headers: { "X-API-Key": key } }),
        fetch("/api/v1/marketplace/runs?limit=50&offset=0", { headers: { "X-API-Key": key } }),
      ]);
      const hiresBody = await hiresRes.json().catch(() => ({}));
      const runsBody = await runsRes.json().catch(() => ({}));
      // 401 = no valid API key yet; show empty state silently
      if (hiresRes.status === 401 || runsRes.status === 401) {
        setHires([]); setRuns([]); return;
      }
      if (!hiresRes.ok) throw new Error(hiresBody?.error || "Failed to load hires");
      if (!runsRes.ok) throw new Error(runsBody?.error || "Failed to load runs");
      setHires((hiresBody?.hires || []) as HireItem[]);
      setRuns((runsBody?.runs || []) as RunItem[]);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : "Failed to load operator dashboard");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // ── Agent types ──
  const loadAgentTypes = useCallback(async () => {
    const { key } = getApiConfig();
    if (!key) {
      setAgentTypeOptionsError("Missing API key. Add it in Settings to load agent types.");
      return;
    }
    try {
      setAgentTypeOptionsError(null);
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
      const payload = (await res.json().catch(() => ({}))) as { error?: string; agent_types?: unknown };
      if (!res.ok) throw new Error(payload.error || `Agent type request failed (${res.status})`);
      const normalized = normalizeAgentTypeOptions(payload.agent_types);
      if (normalized.length === 0) throw new Error("No agent types configured on backend.");
      setAgentTypeOptions(normalized);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          AGENT_TYPES_CACHE_KEY,
          JSON.stringify({ expiresAt: Date.now() + AGENT_TYPES_CACHE_TTL_MS, agent_types: normalized }),
        );
      }
    } catch (err) {
      setAgentTypeOptionsError(err instanceof Error ? err.message : "Failed to load agent types");
    }
  }, []);

  // ── Delegations ──
  const loadDelegations = useCallback(async () => {
    setDlgLoading(true);
    setDlgError(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");
      const res = await fetch("/api/v1/marketplace/delegations", { headers: { "X-API-Key": key } });
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
        headers: { "Content-Type": "application/json", "X-API-Key": getApiConfig().key! },
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
      const delegationAddr = CLOAK_DELEGATION_ADDRESS;
      if (delegationAddr && String(delegationAddr) !== "0x0" && account) {
        const call = buildRevokeDelegationCall(delegationAddr, id);
        await account.execute([call]);
      }
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

  // ── Register agent ──
  const registerAgent = useCallback(async () => {
    setRegistering(true);
    setRegisterError(null);
    setRegisterSuccess(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key. Configure Settings first.");

      if (!newAgentId.trim()) throw new Error("Agent ID is required.");
      if (!newAgentName.trim()) throw new Error("Name is required.");
      if (!newAgentDescription.trim()) throw new Error("Description is required.");
      if (newAgentCapabilities.length === 0) throw new Error("At least one capability is required.");
      if (newAgentEndpoints.length === 0) throw new Error("At least one endpoint is required.");
      if (!newAgentAmount.trim()) throw new Error("Pricing amount is required.");

      const isHexAddress = (s: unknown): s is string =>
        typeof s === "string" && /^0x[0-9a-fA-F]+$/.test(s);

      // Get the connected wallet address
      const connectedWallet = typeof window !== "undefined"
        ? localStorage.getItem("cloak_active_address")
        : null;
      if (!isHexAddress(connectedWallet)) {
        throw new Error("Connect your Cloak wallet first.");
      }

      // Register/rotate an API key tied to the connected wallet, then use it
      const regRes = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: connectedWallet }),
      });
      const regJson = await regRes.json().catch(() => ({}));
      if (!regRes.ok || !regJson.api_key) {
        throw new Error("Failed to provision API key for your wallet.");
      }
      const freshKey = String(regJson.api_key);
      localStorage.setItem("cloak_api_key", freshKey);

      const operatorWallet = connectedWallet;
      const serviceWallet = isHexAddress(newAgentServiceWallet.trim())
        ? newAgentServiceWallet.trim()
        : operatorWallet;

      const endpointProofs = newAgentEndpoints.map((endpoint, index) =>
        createEndpointOwnershipProof({
          endpoint,
          operatorWallet,
          nonce:
            typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}_${index}`,
        }),
      );

      const res = await fetch("/api/v1/marketplace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": freshKey },
        body: JSON.stringify({
          agent_id: newAgentId.trim(),
          name: newAgentName.trim(),
          description: newAgentDescription.trim(),
          agent_type: newAgentType,
          capabilities: newAgentCapabilities,
          endpoints: newAgentEndpoints,
          endpoint_proofs: endpointProofs,
          pricing: {
            mode: "per_run",
            amount: newAgentAmount.trim(),
            token: newAgentToken.toUpperCase(),
          },
          operator_wallet: operatorWallet,
          service_wallet: serviceWallet,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Agent registration failed (${res.status})`);
      setRegisterSuccess(`Agent "${newAgentName.trim()}" registered successfully (ID: ${body.agent_id || newAgentId.trim()})`);
      setNewAgentId("");
      setNewAgentName("");
      setNewAgentDescription("");
      setNewAgentCapabilities([]);
      setNewAgentEndpoints([]);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Failed to register agent profile");
    } finally {
      setRegistering(false);
    }
  }, [
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

  // ── Effects ──
  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadAgentTypes(); }, [loadAgentTypes]);

  useEffect(() => {
    if (agentTypeOptions.length > 0 && !agentTypeOptions.some(o => o.value === newAgentType)) {
      setNewAgentType(agentTypeOptions[0]!.value);
    }
  }, [agentTypeOptions, newAgentType]);

  useEffect(() => {
    if (tab === "delegations") void loadDelegations();
  }, [tab, loadDelegations]);

  const metrics = useMemo(() => ({
    activeHires: hires.filter(h => h.status === "active").length,
    totalHires: hires.length,
    completedRuns: runs.filter(r => r.status === "completed").length,
    failedRuns: runs.filter(r => r.status === "failed").length,
    billableEvidence: runs.filter(r => !!r.payment_ref).length,
  }), [hires, runs]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 py-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/marketplace" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Marketplace
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100 mt-2">Operator Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your listed agents, hires, and spending delegations.</p>
        </div>
      </div>

      {/* ── API key banner ── */}
      {missingApiKey && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 gap-3">
          <p className="text-sm text-amber-200">Add your API key to use the operator tools.</p>
          <Link
            href="/settings"
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            Configure Settings →
          </Link>
        </div>
      )}

      {/* ── Tab nav ── */}
      <div className="flex border-b border-slate-800 gap-1">
        {(["overview", "register", "delegations"] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "overview" ? "Overview" : t === "register" ? "Register Agent" : "Delegations"}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── Tab: Overview ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-6">
          {overviewError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {overviewError}
            </div>
          )}

          {/* Metrics */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Active hires" value={metrics.activeHires} />
            <MetricCard label="Total hires" value={metrics.totalHires} />
            <MetricCard label="Completed runs" value={metrics.completedRuns} />
            <MetricCard label="Failed runs" value={metrics.failedRuns} />
            <MetricCard label="Paid evidence" value={metrics.billableEvidence} />
          </section>

          {overviewLoading && (
            <div className="space-y-3">
              {[0, 1].map(i => (
                <div key={i} className="h-24 rounded-xl bg-slate-900/60 border border-slate-700 animate-pulse" />
              ))}
            </div>
          )}

          {!overviewLoading && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Hires */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                <h2 className="text-sm font-medium text-slate-200">Hires</h2>
                {hires.length === 0 ? (
                  <p className="text-xs text-slate-500">No hires yet. Hire an agent from the marketplace.</p>
                ) : (
                  <ul className="space-y-2">
                    {hires.map(hire => (
                      <li key={hire.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-xs text-slate-300 truncate">{hire.id}</code>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            hire.status === "active"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}>
                            {hire.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">agent: {hire.agent_id}</p>
                        <p className="text-xs text-slate-500">billing: {hire.billing_mode}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Runs */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                <h2 className="text-sm font-medium text-slate-200">Recent runs</h2>
                {runs.length === 0 ? (
                  <p className="text-xs text-slate-500">No runs yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {runs.map(run => (
                      <li key={run.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-xs text-slate-300 truncate">{run.id}</code>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            run.status === "completed"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : run.status === "failed"
                              ? "bg-red-500/10 border-red-500/30 text-red-300"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}>
                            {run.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{run.agent_id} · {run.action}</p>
                        {run.settlement_tx_hash && (
                          <p className="text-xs text-slate-500 break-all">tx: {run.settlement_tx_hash}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── Tab: Register Agent ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "register" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-400">
            List your agent in the Cloak Marketplace so users can discover and hire it.
          </p>

          {agentTypeOptionsError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              {agentTypeOptionsError}
            </div>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-5">

            {/* Row 1: Agent ID + Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-300">Agent ID <span className="text-red-400">*</span></span>
                <input
                  value={newAgentId}
                  onChange={e => setNewAgentId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                  placeholder="my_swap_runner_v1"
                  spellCheck={false}
                />
                <span className="text-[11px] text-slate-500">Unique identifier — lowercase, underscores OK</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-300">Agent type <span className="text-red-400">*</span></span>
                <select
                  value={newAgentType}
                  onChange={e => setNewAgentType(e.target.value as AgentType)}
                  disabled={agentTypeOptions.length === 0}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60 disabled:opacity-50"
                >
                  {agentTypeOptions.length === 0 ? (
                    <option>Loading types…</option>
                  ) : (
                    agentTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))
                  )}
                </select>
                {selectedAgentTypeOption?.description && (
                  <span className="text-[11px] text-slate-500">{selectedAgentTypeOption.description}</span>
                )}
              </label>
            </div>

            {/* Name */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Display name <span className="text-red-400">*</span></span>
              <input
                value={newAgentName}
                onChange={e => setNewAgentName(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                placeholder="My Swap Runner"
              />
            </label>

            {/* Description */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Description <span className="text-red-400">*</span></span>
              <textarea
                value={newAgentDescription}
                onChange={e => setNewAgentDescription(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 h-20 resize-none placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                placeholder="Executes policy-scoped swaps on Starknet DEXes with configurable slippage limits."
              />
            </label>

            {/* Capabilities */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Capabilities <span className="text-red-400">*</span></span>
              <TagInput
                tags={newAgentCapabilities}
                onChange={setNewAgentCapabilities}
                suggestions={CAPABILITY_SUGGESTIONS}
                placeholder="Type a capability and press Enter…"
              />
            </div>

            {/* Endpoints */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Endpoints <span className="text-red-400">*</span></span>
              <EndpointList endpoints={newAgentEndpoints} onChange={setNewAgentEndpoints} />
              <span className="text-[11px] text-slate-500">HTTPS URLs where your agent accepts job requests</span>
            </div>

            {/* Pricing */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Pricing</span>
              <div className="flex gap-3">
                <input
                  value={newAgentAmount}
                  onChange={e => setNewAgentAmount(e.target.value)}
                  className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                  placeholder="25"
                  type="number"
                  min="0"
                />
                <select
                  value={newAgentToken}
                  onChange={e => setNewAgentToken(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60"
                >
                  <option value="STRK">STRK</option>
                  <option value="ETH">ETH</option>
                  <option value="USDC">USDC</option>
                </select>
                <span className="self-center text-xs text-slate-500">per run</span>
              </div>
            </div>

            {/* Service wallet */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Service wallet <span className="text-slate-500 font-normal">(optional)</span></span>
              <input
                value={newAgentServiceWallet}
                onChange={e => setNewAgentServiceWallet(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                placeholder="0x… (defaults to your operator wallet)"
                spellCheck={false}
              />
            </label>

            {/* Submit */}
            <div className="flex items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => void registerAgent()}
                disabled={registering || agentTypeOptions.length === 0 || missingApiKey}
                className="px-5 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-sm text-emerald-300 font-medium hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={missingApiKey ? "Add API key in Settings first" : agentTypeOptions.length === 0 ? "Agent types not loaded" : undefined}
              >
                {registering ? "Registering…" : "Register agent"}
              </button>
              {registerSuccess && (
                <p className="text-sm text-emerald-300">{registerSuccess}</p>
              )}
            </div>

            {registerError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {registerError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── Tab: Delegations ── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "delegations" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-400">
            Grant agents a capped spending allowance, enforced on-chain via the Cloak Delegation contract.
          </p>

          {/* Create delegation form */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100">Create delegation</h2>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Agent ID <span className="text-red-400">*</span></span>
              <input
                value={dlgAgentId}
                onChange={e => setDlgAgentId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                placeholder="agent_id"
                spellCheck={false}
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-300">Token</span>
              <div className="flex gap-2">
                {(["STRK", "ETH", "USDC"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDlgToken(t)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
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

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-300">Max per run</span>
                <input
                  value={dlgMaxPerRun}
                  onChange={e => setDlgMaxPerRun(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                  placeholder="10"
                  type="number"
                  min="0"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-300">Total allowance</span>
                <input
                  value={dlgTotalAllowance}
                  onChange={e => setDlgTotalAllowance(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                  placeholder="100"
                  type="number"
                  min="0"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-300">Duration</span>
              <div className="flex gap-2">
                {(["1h", "24h", "7d", "30d"] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDlgDuration(d)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      dlgDuration === d
                        ? "border-blue-500 bg-blue-500/20 text-blue-200"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">How long the delegation remains valid on-chain</p>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateDelegation()}
              disabled={creatingDlg || missingApiKey}
              className="px-5 py-2.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-sm text-blue-300 font-medium hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {creatingDlg ? "Creating…" : "Create delegation"}
            </button>

            {dlgError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {dlgError}
              </div>
            )}
          </div>

          {/* Active delegations */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Active delegations</h2>
              <button
                type="button"
                onClick={() => void loadDelegations()}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Refresh
              </button>
            </div>

            {dlgLoading && (
              <div className="space-y-2">
                {[0, 1].map(i => <div key={i} className="h-10 rounded-lg bg-slate-800 animate-pulse" />)}
              </div>
            )}

            {!dlgLoading && delegations.length === 0 && (
              <p className="text-xs text-slate-500 py-2">No active delegations.</p>
            )}

            {!dlgLoading && delegations.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-800">
                      <th className="pb-2 pr-3 font-medium">Agent</th>
                      <th className="pb-2 pr-3 font-medium">Token</th>
                      <th className="pb-2 pr-3 font-medium">Used / Total</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {delegations.map(dlg => (
                      <tr key={dlg.id} className="border-b border-slate-800/50">
                        <td className="py-2 pr-3 text-slate-300 font-mono">{dlg.agent_id}</td>
                        <td className="py-2 pr-3 text-slate-400">{dlg.token}</td>
                        <td className="py-2 pr-3 text-slate-400 tabular-nums">
                          {dlg.consumed} / {dlg.total_allowance}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${
                            dlg.status === "active"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : "bg-red-500/10 border-red-500/30 text-red-300"
                          }`}>
                            {dlg.status}
                          </span>
                        </td>
                        <td className="py-2">
                          {dlg.status === "active" && (
                            <button
                              type="button"
                              onClick={() => void handleRevokeDelegation(dlg.id)}
                              className="text-[10px] px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
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
        </div>
      )}
    </div>
  );
}
