// @vitest-environment node

import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, RpcProvider, ec } from "starknet";
import {
  createX402TongoProofEnvelope,
  normalizeAddress,
  TongoEnvelopeProofProvider,
  x402FetchWithProofProvider,
} from "@cloak-wallet/sdk";
import { describe, expect, it } from "vitest";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";

const TONGO_STRK_CONTRACT =
  "0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed";

const liveEnabled = process.env.X402_8004_LIVE_E2E === "1";
const baseUrl = process.env.X402_8004_LIVE_BASE_URL;
const rpcUrl =
  process.env.CLOAK_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
const signerAddress =
  process.env.X402_8004_LIVE_SIGNER_ADDRESS ||
  process.env.BASIC_PROTOCOL_SIGNER_ADDRESS ||
  process.env.ERC8004_SIGNER_ADDRESS;
const signerPrivateKey =
  process.env.X402_8004_LIVE_SIGNER_PRIVATE_KEY ||
  process.env.BASIC_PROTOCOL_SIGNER_PRIVATE_KEY ||
  process.env.ERC8004_SIGNER_PRIVATE_KEY;
const tongoPrivateKey =
  process.env.X402_8004_LIVE_TONGO_PRIVATE_KEY || signerPrivateKey;
const signerCairoVersion =
  process.env.X402_8004_LIVE_SIGNER_CAIRO_VERSION ||
  process.env.BASIC_PROTOCOL_SIGNER_CAIRO_VERSION ||
  process.env.ERC8004_SIGNER_CAIRO_VERSION ||
  "1";
const agentId = process.env.X402_8004_LIVE_AGENT_ID || "167";
const stakeAmount = process.env.X402_8004_LIVE_STAKE_AMOUNT || "1";
const runLive =
  liveEnabled &&
  !!baseUrl &&
  !!rpcUrl &&
  !!signerAddress &&
  !!signerPrivateKey &&
  !!tongoPrivateKey;
const liveDescribe = runLive ? describe : describe.skip;

type TongoAccountCtor = new (
  privateKey: string,
  contractAddress: string,
  provider: RpcProvider,
) => {
  tongoAddress(): string;
  bit_size(): Promise<number | bigint>;
  rawState(): Promise<Record<string, unknown>>;
  withdraw(input: {
    amount: bigint;
    to: string;
    sender: string;
  }): Promise<Record<string, unknown> & { toCalldata: () => unknown }>;
  Tongo: { address: string };
};

function padAddress(value: string): string {
  const raw = value.replace(/^0x/i, "");
  return `0x${raw.padStart(64, "0")}`;
}

function extractTxHash(
  value: Awaited<ReturnType<Account["execute"]>> | string,
): string {
  if (typeof value === "string") return value;
  const txHash = value.transaction_hash || value.transactionHash;
  if (!txHash) throw new Error("Missing transaction hash from Starknet execute");
  return txHash;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function serializeTongoValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(item => serializeTongoValue(item));
  if (!isRecord(value)) return value;

  if (typeof (value as { toAffine?: () => { x: bigint; y: bigint } }).toAffine === "function") {
    const affine = (
      value as { toAffine: () => { x: bigint; y: bigint; z?: bigint } }
    ).toAffine();
    const serialized: Record<string, string> = {
      x: affine.x.toString(),
      y: affine.y.toString(),
    };
    if (affine.z !== undefined) {
      serialized.z = affine.z.toString();
    }
    return serialized;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, serializeTongoValue(nested)]),
  );
}

async function loadTongoAccountCtor(): Promise<TongoAccountCtor> {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const nextjsRoot = resolve(testDir, "../../../../");
  const shimPath = resolve(
    nextjsRoot,
    "node_modules/@fatsolutions/tongo-sdk/src/utils.js",
  );
  if (!existsSync(shimPath)) {
    writeFileSync(shimPath, "module.exports = require('../dist/utils.js');\n", {
      encoding: "utf-8",
    });
  }
  const mod = await import("@fatsolutions/tongo-sdk");
  return mod.Account as unknown as TongoAccountCtor;
}

async function registerApiKey(
  url: string,
  walletAddress: string,
  privateKey: string,
): Promise<string> {
  const publicKey = ec.starkCurve.getStarkKey(privateKey).toString();
  const res = await fetch(`${url}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet_address: normalizeAddress(walletAddress),
      public_key: publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`,
    }),
  });
  expect(res.ok).toBe(true);
  const json = (await res.json()) as { api_key?: string };
  expect(typeof json.api_key).toBe("string");
  return json.api_key as string;
}

async function ensureLiveAgentProfile(input: {
  url: string;
  apiKey: string;
  wallet: string;
  agentId: string;
}): Promise<void> {
  const endpoint = `${input.url}/api/v1/marketplace/live-staking/${input.agentId}`;
  const nonce = `nonce_live_${Date.now().toString(16)}`;
  const digest = buildEndpointOwnershipDigest({
    endpoint,
    operatorWallet: input.wallet,
    nonce,
  });

  const res = await fetch(`${input.url}/api/v1/marketplace/agents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": input.apiKey,
    },
    body: JSON.stringify({
      agent_id: input.agentId,
      name: "Live Staking Steward",
      description: "Live on-chain paid-run verification agent",
      agent_type: "staking_steward",
      capabilities: ["stake", "unstake", "rebalance", "x402_shielded"],
      endpoints: [endpoint],
      endpoint_proofs: [
        {
          endpoint,
          nonce,
          digest,
        },
      ],
      pricing: {
        mode: "per_run",
        amount: "1000000000000000",
        token: "STRK",
      },
      operator_wallet: input.wallet,
      service_wallet: input.wallet,
      status: "active",
      verified: true,
      trust_score: 95,
    }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(
      `Agent registration failed (${res.status}): ${JSON.stringify(json)}`,
    );
  }
}

async function createHire(input: {
  url: string;
  apiKey: string;
  wallet: string;
  agentId: string;
}): Promise<string> {
  const res = await fetch(`${input.url}/api/v1/marketplace/hires`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": input.apiKey,
    },
    body: JSON.stringify({
      agent_id: input.agentId,
      operator_wallet: input.wallet,
      policy_snapshot: {
        strategy: "live_stake",
        max_amount_strk: "5",
      },
      billing_mode: "per_run",
    }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(`Hire creation failed (${res.status}): ${JSON.stringify(json)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new Error("Hire creation response is missing id");
  }
  return json.id;
}

liveDescribe("marketplace live x402 <> erc8004 stake e2e (Sepolia)", () => {
  it(
    "executes real billable staking run with x402 settlement and on-chain execution",
    async () => {
      const normalizedBaseUrl = baseUrl!.replace(/\/$/, "");
      const normalizedWallet = normalizeAddress(signerAddress!);
      const provider = new RpcProvider({ nodeUrl: rpcUrl! });
      const TongoAccount = await loadTongoAccountCtor();
      const tongoAccount = new TongoAccount(
        tongoPrivateKey!,
        padAddress(TONGO_STRK_CONTRACT),
        provider,
      );
      const starkAccount = new Account({
        provider,
        address: normalizedWallet,
        signer: signerPrivateKey!,
        cairoVersion: signerCairoVersion === "0" ? "0" : "1",
      });

      const apiKey = await registerApiKey(
        normalizedBaseUrl,
        normalizedWallet,
        signerPrivateKey!,
      );
      await ensureLiveAgentProfile({
        url: normalizedBaseUrl,
        apiKey,
        wallet: normalizedWallet,
        agentId,
      });
      const hireId = await createHire({
        url: normalizedBaseUrl,
        apiKey,
        wallet: normalizedWallet,
        agentId,
      });

      const payerTongoAddress = tongoAccount.tongoAddress();

      const response = await x402FetchWithProofProvider(
        `${normalizedBaseUrl}/api/v1/marketplace/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            hire_id: hireId,
            agent_id: agentId,
            action: "stake",
            params: {
              amount: stakeAmount,
              amount_unit: "strk",
              token: "STRK",
            },
            billable: true,
            execute: true,
          }),
        },
        {
          tongoAddress: payerTongoAddress,
          proofProvider: new TongoEnvelopeProofProvider(async input => {
            const amount = BigInt(input.amount);
            const sender = padAddress(normalizedWallet);
            const recipient = padAddress(input.challenge.recipient);
            const bitSize = await (
              tongoAccount as unknown as { bit_size: () => Promise<bigint> }
            ).bit_size();
            const preState = await (
              tongoAccount as unknown as { rawState: () => Promise<Record<string, bigint>> }
            ).rawState();

            const withdrawOp = await tongoAccount.withdraw({
              amount,
              to: recipient,
              sender,
            });

            const txNonce = await provider.getNonceForAddress(normalizedWallet);
            const settlementTxHash = extractTxHash(
              await starkAccount.execute([withdrawOp.toCalldata()], {
                nonce: txNonce,
              }),
            );
            const chainId = BigInt(await provider.getChainId());
            const proofInputs = {
              y: (withdrawOp as { from: unknown }).from,
              nonce: preState.nonce,
              to: (withdrawOp as { to: unknown }).to,
              amount: (withdrawOp as { amount: unknown }).amount,
              currentBalance: preState.balance,
              auxiliarCipher: (withdrawOp as { auxiliarCipher: unknown }).auxiliarCipher,
              bit_size: bitSize,
              prefix_data: {
                chain_id: chainId,
                tongo_address: BigInt(
                  (tongoAccount as unknown as { Tongo: { address: string } }).Tongo.address,
                ),
                sender_address: BigInt(sender),
              },
            };

            return createX402TongoProofEnvelope({
              challenge: input.challenge,
              tongoAddress: input.tongoAddress,
              amount: input.amount,
              replayKey: input.replayKey,
              nonce: input.nonce,
              settlementTxHash,
              attestor: "cloak-nextjs-live-test",
              tongoProof: {
                operation: "withdraw",
                inputs: serializeTongoValue(proofInputs) as Record<string, unknown>,
                proof: serializeTongoValue(
                  (withdrawOp as { proof: unknown }).proof,
                ) as Record<string, unknown>,
              },
            });
          }),
        },
      );

      expect(response.status).toBe(201);
      const run = (await response.json()) as Record<string, unknown>;

      expect(run.billable).toBe(true);
      expect(run.agent_id).toBe(agentId);
      if (run.status !== "completed") {
        throw new Error(`Live run did not complete: ${JSON.stringify(run)}`);
      }

      const paymentEvidence = isRecord(run.payment_evidence)
        ? run.payment_evidence
        : null;
      expect(paymentEvidence).toBeTruthy();

      const settlementTxHash = paymentEvidence?.settlement_tx_hash;
      expect(typeof settlementTxHash).toBe("string");
      expect(settlementTxHash).toMatch(/^0x[0-9a-fA-F]+$/);
      console.info("[live-e2e] settlement_tx_hash", settlementTxHash);

      const executionTxHashes = Array.isArray(run.execution_tx_hashes)
        ? run.execution_tx_hashes
        : [];
      expect(executionTxHashes.length).toBeGreaterThan(0);
      expect(typeof executionTxHashes[0]).toBe("string");
      console.info("[live-e2e] execution_tx_hash", executionTxHashes[0]);

      await provider.waitForTransaction(settlementTxHash as string);
      await provider.waitForTransaction(executionTxHashes[0] as string);
      const executionReceipt = await provider.getTransactionReceipt(
        executionTxHashes[0] as string,
      );
      const executionStatus =
        (executionReceipt as { execution_status?: unknown; executionStatus?: unknown })
          .execution_status ??
        (executionReceipt as { execution_status?: unknown; executionStatus?: unknown })
          .executionStatus;
      const finalityStatus =
        (executionReceipt as { finality_status?: unknown; finalityStatus?: unknown })
          .finality_status ??
        (executionReceipt as { finality_status?: unknown; finalityStatus?: unknown })
          .finalityStatus;

      expect(executionStatus).toBe("SUCCEEDED");
      expect(typeof finalityStatus).toBe("string");
      expect(String(finalityStatus)).toMatch(/^ACCEPTED_ON_(L2|L1)$/);
    },
    600_000,
  );
});
