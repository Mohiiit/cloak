"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  x402FetchWithProofProvider,
} from "~~/lib/marketplace/x402/client";
import { getApiConfig } from "~~/lib/api-client";

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

function hashHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x27d4eb2d);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}${part1}${part2}${part1}${part2}${part1}${part2}`;
}

function fallbackSettlementTxHash(seed: string): string {
  return `0x${hashHex(seed).slice(0, 62)}`;
}

export default function AgentProfilePage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params?.agentId || "";

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
        pool: "0xpool",
        amount: "100",
      },
      null,
      2,
    ),
  );
  const [runPayerAddress, setRunPayerAddress] = useState("tongo-web-operator");
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);

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

  useEffect(() => {
    if (!agentId) return;
    void loadProfile();
  }, [agentId, loadProfile]);

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
          tongoAddress: runPayerAddress,
          proofProvider: {
            createProof(input) {
              const intentHash =
                input.intentHash ||
                hashHex(
                  JSON.stringify({
                    amount: input.amount,
                    challengeId: input.challenge.challengeId,
                    contextHash: input.challenge.contextHash,
                    expiresAt: input.challenge.expiresAt,
                    nonce: input.nonce || "nonce",
                    recipient: input.challenge.recipient.toLowerCase(),
                    replayKey: input.replayKey || "rk",
                    tongoAddress: input.tongoAddress,
                    token: input.challenge.token,
                  }),
                );
              return {
                proof: JSON.stringify({
                  envelopeVersion: "1",
                  proofType: "tongo_attestation_v1",
                  intentHash,
                  settlementTxHash: fallbackSettlementTxHash(
                    `${intentHash}:${input.replayKey || "rk"}`,
                  ),
                  attestor: "cloak-web",
                  issuedAt: new Date().toISOString(),
                }),
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
  }, [hireIdInput, profile, runAction, runParamsDraft, runPayerAddress]);

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

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Payer Tongo address</span>
              <input
                value={runPayerAddress}
                onChange={e => setRunPayerAddress(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 font-mono"
              />
            </label>

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
        </section>
      )}
    </main>
  );
}
