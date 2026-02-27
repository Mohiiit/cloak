"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  createX402TongoProofEnvelope,
  encodeX402TongoProofEnvelope,
} from "@cloak-wallet/sdk";
import {
  x402FetchWithProofProvider,
} from "~~/lib/marketplace/x402/client";
import { getApiConfig } from "~~/lib/api-client";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useAccount } from "~~/hooks/useAccount";
import { useTransactionRouter } from "~~/hooks/useTransactionRouter";
import { padAddress } from "~~/lib/address";

type AgentProfileResponse = {
  agent_id: string;
  name: string;
  description: string;
  agent_type: string;
  capabilities: string[];
  endpoints: string[];
  pricing: Record<string, unknown>;
  trust_score: number;
  trust_summary?: Record<string, unknown> | null;
  verified: boolean;
  status?: string;
};

type HireResponse = {
  id: string;
  status: string;
  billing_mode: string;
};

type RunResponse = {
  id: string;
  status: string;
  payment_ref: string | null;
  execution_tx_hashes: string[] | null;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function serializeTongoValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(item => serializeTongoValue(item));
  if (isPlainObject(value)) {
    if (typeof (value as { toAffine?: unknown }).toAffine === "function") {
      const affine = (value as { toAffine: () => { x: bigint; y: bigint } }).toAffine();
      return {
        x: affine.x.toString(),
        y: affine.y.toString(),
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeTongoValue(nested),
      ]),
    );
  }
  return value;
}

function toBigIntChainId(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  throw new Error("Unable to resolve Starknet chainId for x402 proof.");
}

export default function AgentProfilePage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params?.agentId || "";
  const { tongoAccount, tongoAddress, isInitialized } = useTongo();
  const { address, chainId } = useAccount();
  const { executeOrRoute } = useTransactionRouter();

  const [profile, setProfile] = useState<AgentProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [policyDraft, setPolicyDraft] = useState(
    JSON.stringify(
      {
        max_usd_per_run: 25,
        allowed_actions: ["stake", "unstake", "rebalance", "swap", "dispatch"],
      },
      null,
      2,
    ),
  );
  const [isHiring, setIsHiring] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);
  const [hireResult, setHireResult] = useState<HireResponse | null>(null);

  const [hireIdInput, setHireIdInput] = useState("");
  const [runAction, setRunAction] = useState("stake");
  const [runParamsDraft, setRunParamsDraft] = useState(
    JSON.stringify(
      {
        calls: [
          {
            contractAddress: "0x1",
            entrypoint: "stake",
            calldata: ["0x64"],
          },
        ],
      },
      null,
      2,
    ),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);

  // --- Delegation for this agent ---
  const [dlgToken, setDlgToken] = useState("STRK");
  const [dlgMaxPerRun, setDlgMaxPerRun] = useState("");
  const [dlgTotalAllowance, setDlgTotalAllowance] = useState("");
  const [dlgDuration, setDlgDuration] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [creatingDlg, setCreatingDlg] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);
  const [dlgSuccess, setDlgSuccess] = useState<string | null>(null);

  // --- Leaderboard metrics for this agent ---
  const [agentMetrics, setAgentMetrics] = useState<LeaderboardEntry | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { key } = getApiConfig();
      if (!key) {
        setError("Missing API key. Add it in Settings first.");
        setProfile(null);
        return;
      }

      const res = await fetch(
        `/api/v1/marketplace/agents/${encodeURIComponent(agentId)}?refresh_onchain=true`,
        {
          headers: {
            "X-API-Key": key,
          },
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to fetch agent" }));
        throw new Error(body?.error || `Agent fetch failed (${res.status})`);
      }

      const data = (await res.json()) as AgentProfileResponse;
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent profile");
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  const loadAgentMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const { key } = getApiConfig();
      if (!key) return;
      const res = await fetch(`/api/v1/marketplace/leaderboard?period=7d`, {
        headers: { "X-API-Key": key },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const entries = (body.entries || []) as LeaderboardEntry[];
      const match = entries.find(e => e.agent_id === agentId);
      setAgentMetrics(match || null);
    } catch {
      // Non-critical — silently skip
    } finally {
      setMetricsLoading(false);
    }
  }, [agentId]);

  const handleCreateDelegation = useCallback(async () => {
    setCreatingDlg(true);
    setDlgError(null);
    setDlgSuccess(null);
    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");
      if (!dlgMaxPerRun.trim()) throw new Error("Max per run is required");
      if (!dlgTotalAllowance.trim()) throw new Error("Total allowance is required");

      const res = await fetch("/api/v1/marketplace/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify({
          agent_id: agentId,
          token: dlgToken,
          max_per_run: dlgMaxPerRun.trim(),
          total_allowance: dlgTotalAllowance.trim(),
          duration_ms: durationToMs(dlgDuration),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Delegation creation failed (${res.status})`);
      setDlgSuccess(`Delegation created: ${body.id || "OK"}`);
      setDlgMaxPerRun("");
      setDlgTotalAllowance("");
    } catch (err) {
      setDlgError(err instanceof Error ? err.message : "Failed to create delegation");
    } finally {
      setCreatingDlg(false);
    }
  }, [agentId, dlgToken, dlgMaxPerRun, dlgTotalAllowance, dlgDuration]);

  useEffect(() => {
    if (!agentId) return;
    void loadProfile();
    void loadAgentMetrics();
  }, [agentId, loadProfile, loadAgentMetrics]);

  const hireAgent = useCallback(async () => {
    if (!profile) return;
    setIsHiring(true);
    setHireError(null);
    setHireResult(null);

    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");

      const verifyRes = await fetch("/api/v1/auth/verify", {
        headers: { "X-API-Key": key },
      });
      if (!verifyRes.ok) throw new Error("Unable to resolve operator wallet for hire");
      const verifyBody = (await verifyRes.json()) as { wallet_address: string };

      let policySnapshot: Record<string, unknown> = {};
      try {
        policySnapshot = JSON.parse(policyDraft) as Record<string, unknown>;
      } catch {
        throw new Error("Policy JSON is invalid");
      }

      const hireRes = await fetch("/api/v1/marketplace/hires", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": key,
        },
        body: JSON.stringify({
          agent_id: profile.agent_id,
          operator_wallet: verifyBody.wallet_address,
          policy_snapshot: policySnapshot,
          billing_mode: "per_run",
        }),
      });
      const hireJson = await hireRes.json().catch(() => ({}));
      if (!hireRes.ok) {
        throw new Error(hireJson?.error || `Hire creation failed (${hireRes.status})`);
      }
      const created = hireJson as HireResponse;
      setHireResult(created);
      setHireIdInput(created.id);
    } catch (err) {
      setHireError(err instanceof Error ? err.message : "Failed to hire agent");
    } finally {
      setIsHiring(false);
    }
  }, [policyDraft, profile]);

  const runAgent = useCallback(async () => {
    if (!profile) return;
    setIsRunning(true);
    setRunError(null);
    setRunResult(null);

    try {
      const { key } = getApiConfig();
      if (!key) throw new Error("Missing API key");
      if (!hireIdInput.trim()) throw new Error("Hire ID is required");
      if (!address) throw new Error("Connect wallet to run paid actions.");
      if (!isInitialized || !tongoAccount || !tongoAddress) {
        throw new Error("Tongo account not initialized. Connect wallet first.");
      }

      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(runParamsDraft) as Record<string, unknown>;
      } catch {
        throw new Error("Run params JSON is invalid");
      }

      const response = await x402FetchWithProofProvider(
        "/api/v1/marketplace/runs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": key,
          },
          body: JSON.stringify({
            hire_id: hireIdInput.trim(),
            agent_id: profile.agent_id,
            action: runAction,
            params,
            billable: true,
            execute: true,
          }),
        },
        {
          tongoAddress,
          proofProvider: {
            async createProof(input) {
              if (!input.replayKey || !input.nonce) {
                throw new Error("x402 replay metadata missing from challenge flow.");
              }

              const normalizedSender = padAddress(address);
              const normalizedRecipient = padAddress(input.challenge.recipient);
              let withdrawAmount: bigint;
              try {
                withdrawAmount = BigInt(input.amount);
              } catch {
                throw new Error(`x402 amount is not an integer: ${input.amount}`);
              }

              const bitSizeFn = (tongoAccount as any).bit_size;
              const rawStateFn = (tongoAccount as any).rawState;
              if (
                typeof bitSizeFn !== "function" ||
                typeof rawStateFn !== "function"
              ) {
                throw new Error("Tongo account does not expose proof primitives.");
              }

              const bitSize = await bitSizeFn.call(tongoAccount);
              const preState = await rawStateFn.call(tongoAccount);

              const withdrawOp = await tongoAccount.withdraw({
                amount: withdrawAmount,
                to: normalizedRecipient,
                sender: normalizedSender,
              });
              if (!withdrawOp?.toCalldata) {
                throw new Error("Tongo withdraw returned no calldata.");
              }

              const settlementTxHash = await executeOrRoute(
                [withdrawOp.toCalldata()],
                {
                  action: "withdraw",
                  token: input.challenge.token,
                  amount: input.amount,
                  recipient: normalizedRecipient,
                },
              );

              const tongoContractAddress = (tongoAccount as any)?.Tongo?.address;
              if (!tongoContractAddress) {
                throw new Error("Missing Tongo contract address for proof bundle.");
              }

              const proofInputs = {
                y: withdrawOp.from,
                nonce: preState.nonce,
                to: withdrawOp.to,
                amount: withdrawOp.amount,
                currentBalance: preState.balance,
                auxiliarCipher: withdrawOp.auxiliarCipher,
                bit_size: bitSize,
                prefix_data: {
                  chain_id: toBigIntChainId(chainId),
                  tongo_address: BigInt(tongoContractAddress),
                  sender_address: BigInt(normalizedSender),
                },
              };

              const envelope = createX402TongoProofEnvelope({
                challenge: input.challenge,
                tongoAddress: input.tongoAddress,
                amount: input.amount,
                replayKey: input.replayKey,
                nonce: input.nonce,
                settlementTxHash,
                attestor: "cloak-web-marketplace",
                tongoProof: {
                  operation: "withdraw",
                  inputs: serializeTongoValue(proofInputs),
                  proof: serializeTongoValue(withdrawOp.proof),
                },
              });

              return {
                proof: encodeX402TongoProofEnvelope(envelope),
                replayKey: input.replayKey,
                nonce: input.nonce,
              };
            },
          },
        },
      );

      const runJson = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(runJson?.error || `Run failed (${response.status})`);
      }
      setRunResult(runJson as RunResponse);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to execute run");
    } finally {
      setIsRunning(false);
    }
  }, [
    address,
    chainId,
    executeOrRoute,
    hireIdInput,
    isInitialized,
    profile,
    runAction,
    runParamsDraft,
    tongoAccount,
    tongoAddress,
  ]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/marketplace" className="text-xs text-blue-300 hover:underline">
            ← Back to marketplace
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100 mt-2">Agent Profile</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadProfile()}
          className="text-xs px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
        >
          Refresh
        </button>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading profile...</div>}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {profile && (
        <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-slate-100">{profile.name}</h2>
            <p className="text-xs text-slate-400">{profile.agent_id}</p>
            <p className="text-sm text-slate-300 mt-2">{profile.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <h3 className="text-sm font-medium text-slate-200">Identity</h3>
              <p className="text-xs text-slate-400">Type: {profile.agent_type}</p>
              <p className="text-xs text-slate-400">Status: {profile.status || "active"}</p>
              <p className="text-xs text-slate-400">Verified: {profile.verified ? "yes" : "no"}</p>
              <p className="text-xs text-slate-400">Trust score: {profile.trust_score}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <h3 className="text-sm font-medium text-slate-200">Pricing</h3>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                {JSON.stringify(profile.pricing, null, 2)}
              </pre>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-200">Capabilities</h3>
            <div className="flex flex-wrap gap-2">
              {profile.capabilities.map(capabilityItem => (
                <span
                  key={`${profile.agent_id}-${capabilityItem}`}
                  className="text-[11px] px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-200"
                >
                  {capabilityItem}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-200">Endpoints</h3>
            <ul className="space-y-1">
              {profile.endpoints.map(endpoint => (
                <li key={endpoint}>
                  <code className="text-xs text-slate-300 break-all">{endpoint}</code>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-1">
            <h3 className="text-sm font-medium text-slate-200">Trust snapshot</h3>
            <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">
              {JSON.stringify(profile.trust_summary || {}, null, 2)}
            </pre>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-200">Hire this agent</h3>
            <p className="text-xs text-slate-400">
              Define your policy snapshot, then create a hire contract linked to your API key wallet.
            </p>
            <textarea
              value={policyDraft}
              onChange={e => setPolicyDraft(e.target.value)}
              className="w-full h-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 font-mono"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => void hireAgent()}
              disabled={isHiring}
              className="text-sm px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {isHiring ? "Creating hire..." : "Create hire"}
            </button>
            {hireError && <p className="text-xs text-red-300">{hireError}</p>}
            {hireResult && (
              <div className="text-xs text-emerald-300">
                Hire created: <code>{hireResult.id}</code> ({hireResult.status})
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-200">Run paid execution (x402)</h3>
            <p className="text-xs text-slate-400">
              Submit a billable run. Client retries automatically on `402` by attaching x402 payment headers.
            </p>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Hire ID</span>
              <input
                value={hireIdInput}
                onChange={e => setHireIdInput(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 font-mono"
                placeholder="hire_xxx"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Action</span>
              <input
                value={runAction}
                onChange={e => setRunAction(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Run params JSON</span>
              <textarea
                value={runParamsDraft}
                onChange={e => setRunParamsDraft(e.target.value)}
                className="w-full h-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 font-mono"
                spellCheck={false}
              />
            </label>

            <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
              <p className="text-[11px] text-slate-400">Connected payer (Tongo)</p>
              <code className="text-xs text-slate-200 break-all">
                {tongoAddress || "Connect wallet to resolve payer address"}
              </code>
            </div>

            <button
              type="button"
              onClick={() => void runAgent()}
              disabled={isRunning}
              className="text-sm px-3 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
            >
              {isRunning ? "Running..." : "Execute paid run"}
            </button>

            {runError && <p className="text-xs text-red-300">{runError}</p>}
            {runResult && (
              <div className="text-xs text-emerald-300 space-y-1">
                <div>
                  Run ID: <code>{runResult.id}</code>
                </div>
                <div>Status: {runResult.status}</div>
                <div>Payment ref: {runResult.payment_ref || "n/a"}</div>
                <div>
                  Execution tx hashes: {runResult.execution_tx_hashes?.join(", ") || "none"}
                </div>
              </div>
            )}
          </div>

          {/* ── Leaderboard Metrics ── */}
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-2">
            <h3 className="text-sm font-medium text-slate-200">Leaderboard metrics (7d)</h3>
            {metricsLoading && <p className="text-xs text-slate-400">Loading...</p>}
            {!metricsLoading && !agentMetrics && (
              <p className="text-xs text-slate-400">No leaderboard data available for this agent.</p>
            )}
            {!metricsLoading && agentMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-[10px] text-slate-400">Work Score</p>
                  <p className="text-lg font-semibold text-slate-100">{agentMetrics.work_score}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-[10px] text-slate-400">Runs</p>
                  <p className="text-lg font-semibold text-slate-100">{agentMetrics.runs}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-[10px] text-slate-400">Success Rate</p>
                  <p className="text-lg font-semibold text-slate-100">
                    {(agentMetrics.success_rate * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-[10px] text-slate-400">Trust Score</p>
                  <p className="text-lg font-semibold text-slate-100">{agentMetrics.trust_score}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Create Delegation ── */}
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-200">Create delegation</h3>
            <p className="text-xs text-slate-400">
              Grant this agent a spending allowance scoped by token, amount, and duration.
            </p>

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
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  placeholder="10"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Total allowance</span>
                <input
                  value={dlgTotalAllowance}
                  onChange={e => setDlgTotalAllowance(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
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
              className="text-sm px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
            >
              {creatingDlg ? "Creating..." : "Create delegation"}
            </button>

            {dlgError && <p className="text-xs text-red-300">{dlgError}</p>}
            {dlgSuccess && <p className="text-xs text-emerald-300">{dlgSuccess}</p>}
          </div>
        </section>
      )}
    </main>
  );
}
