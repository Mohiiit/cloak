import {
  TongoEnvelopeProofProvider,
  createX402TongoProofEnvelope,
  x402FetchWithProofProvider,
  type AgentHireResponse,
  type AgentProfileResponse,
  type AgentRunResponse,
  type DelegationResponse,
  type LeaderboardResponse,
  type SpendAuthorization,
  type X402Challenge,
  type X402TongoProofBundle,
} from '@cloak-wallet/sdk';
import { getApiClient, getApiConfig } from './apiClient';

type ApiClientLike = {
  discoverAgents: (query?: {
    capability?: string;
    limit?: number;
    offset?: number;
  }) => Promise<Array<AgentProfileResponse & { discovery_score: number }>>;
  verify: () => Promise<{ wallet_address: string }>;
  createHire: (payload: {
    agent_id: string;
    operator_wallet: string;
    policy_snapshot: Record<string, unknown>;
    billing_mode: 'per_run' | 'subscription';
  }) => Promise<AgentHireResponse>;
  listHires: (params?: {
    agent_id?: string;
    status?: 'active' | 'paused' | 'revoked';
    limit?: number;
    offset?: number;
  }) => Promise<AgentHireResponse[]>;
  listRuns: (params?: {
    hire_id?: string;
    agent_id?: string;
    status?: 'queued' | 'running' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
  }) => Promise<AgentRunResponse[]>;
};

export interface MarketplaceWalletContext {
  walletAddress?: string;
  publicKey?: string;
}

interface MarketplaceApiDeps {
  getApiClientFn?: typeof getApiClient;
  getApiConfigFn?: typeof getApiConfig;
  x402Executor?: typeof x402FetchWithProofProvider;
}

function withDeps(deps?: MarketplaceApiDeps) {
  return {
    getApiClientFn: deps?.getApiClientFn ?? getApiClient,
    getApiConfigFn: deps?.getApiConfigFn ?? getApiConfig,
    x402Executor: deps?.x402Executor ?? x402FetchWithProofProvider,
  };
}

export interface ExecuteMarketplacePaidRunPaymentInput {
  challenge: X402Challenge;
  tongoAddress: string;
  amount: string;
  replayKey: string;
  nonce: string;
  intentHash: string;
}

export interface ExecuteMarketplacePaidRunPaymentOutput {
  settlementTxHash: string;
  tongoProof?: X402TongoProofBundle;
  attestor?: string;
  signature?: string;
  metadata?: Record<string, unknown>;
}

async function createClient(
  wallet: MarketplaceWalletContext | undefined,
  deps?: MarketplaceApiDeps,
): Promise<ApiClientLike> {
  const { getApiClientFn } = withDeps(deps);
  return (await getApiClientFn({
    walletAddress: wallet?.walletAddress,
    publicKey: wallet?.publicKey,
  })) as unknown as ApiClientLike;
}

export async function discoverMarketplaceAgents(
  input?: {
    wallet?: MarketplaceWalletContext;
    capability?: string;
    limit?: number;
    offset?: number;
  },
  deps?: MarketplaceApiDeps,
): Promise<Array<AgentProfileResponse & { discovery_score: number }>> {
  const client = await createClient(input?.wallet, deps);
  return client.discoverAgents({
    capability: input?.capability || undefined,
    limit: input?.limit ?? 50,
    offset: input?.offset ?? 0,
  });
}

export async function hireMarketplaceAgent(
  input: {
    wallet?: MarketplaceWalletContext;
    agentId: string;
    policySnapshot: Record<string, unknown>;
    billingMode?: 'per_run' | 'subscription';
  },
  deps?: MarketplaceApiDeps,
): Promise<AgentHireResponse> {
  const client = await createClient(input.wallet, deps);
  const auth = await client.verify();
  return client.createHire({
    agent_id: input.agentId,
    operator_wallet: auth.wallet_address,
    policy_snapshot: input.policySnapshot,
    billing_mode: input.billingMode ?? 'per_run',
  });
}

export async function listMarketplaceRuns(
  input?: {
    wallet?: MarketplaceWalletContext;
    hireId?: string;
    agentId?: string;
    status?: 'queued' | 'running' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
  },
  deps?: MarketplaceApiDeps,
): Promise<AgentRunResponse[]> {
  const client = await createClient(input?.wallet, deps);
  return client.listRuns({
    hire_id: input?.hireId,
    agent_id: input?.agentId,
    status: input?.status,
    limit: input?.limit ?? 100,
    offset: input?.offset ?? 0,
  });
}

export async function listMarketplaceHires(
  input?: {
    wallet?: MarketplaceWalletContext;
    agentId?: string;
    status?: 'active' | 'paused' | 'revoked';
    limit?: number;
    offset?: number;
  },
  deps?: MarketplaceApiDeps,
): Promise<AgentHireResponse[]> {
  const client = await createClient(input?.wallet, deps);
  return client.listHires({
    agent_id: input?.agentId,
    status: input?.status,
    limit: input?.limit ?? 100,
    offset: input?.offset ?? 0,
  });
}

export async function executeMarketplacePaidRun(
  input: {
    hireId: string;
    agentId: string;
    action: string;
    params?: Record<string, unknown>;
    payerTongoAddress: string;
    token?: string;
    minAmount?: string;
    execute?: boolean;
    proof?: string;
    settlementTxHash?: string;
    tongoProof?: X402TongoProofBundle;
    spend_authorization?: SpendAuthorization;
    x402PaymentExecutor?: (
      input: ExecuteMarketplacePaidRunPaymentInput,
    ) => Promise<ExecuteMarketplacePaidRunPaymentOutput>;
  },
  deps?: MarketplaceApiDeps,
): Promise<AgentRunResponse> {
  const { getApiClientFn, getApiConfigFn, x402Executor } = withDeps(deps);
  // Ensure API key is validated (and rotated if needed) before the paid run.
  await getApiClientFn();
  const config = await getApiConfigFn();
  const baseUrl = config.url.replace(/\/$/, '');
  if (!config.key) {
    throw new Error('Missing API key for marketplace paid run');
  }

  const response = await x402Executor(
    `${baseUrl}/api/v1/marketplace/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.key,
      },
      body: JSON.stringify({
        hire_id: input.hireId,
        agent_id: input.agentId,
        action: input.action,
        params: input.params || {},
        billable: true,
        execute: input.execute ?? true,
        token: input.token,
        minAmount: input.minAmount,
        ...(input.spend_authorization
          ? { spend_authorization: input.spend_authorization }
          : {}),
      }),
    },
    {
      tongoAddress: input.payerTongoAddress,
      proofProvider: new TongoEnvelopeProofProvider(
        async ({ challenge, tongoAddress, amount, replayKey, nonce, intentHash }) => {
          const paymentExecution = input.x402PaymentExecutor
            ? await input.x402PaymentExecutor({
                challenge,
                tongoAddress,
                amount,
                replayKey,
                nonce,
                intentHash,
              })
            : null;

          const settlementTxHash =
            paymentExecution?.settlementTxHash || input.settlementTxHash;
          if (!settlementTxHash) {
            throw new Error(
              'Missing x402 settlement tx hash. Provide x402PaymentExecutor or settlementTxHash.',
            );
          }

          return createX402TongoProofEnvelope({
            challenge,
            tongoAddress,
            amount,
            replayKey,
            nonce,
            settlementTxHash,
            attestor: paymentExecution?.attestor || 'cloak-mobile',
            signature: paymentExecution?.signature || input.proof,
            tongoProof: paymentExecution?.tongoProof || input.tongoProof,
            metadata: {
              source: 'mobile-marketplace',
              ...(paymentExecution?.metadata || {}),
            },
          });
        },
      ),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reasonCode =
      typeof payload?.reasonCode === 'string'
        ? payload.reasonCode
        : typeof payload?.code === 'string'
          ? payload.code
          : null;
    const status =
      typeof payload?.status === 'string' ? payload.status : null;
    const details =
      typeof payload?.details === 'string' ? payload.details : null;
    const structuredMessage =
      [status, reasonCode, details].filter(Boolean).join(' · ') || null;
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : structuredMessage
          ? `Marketplace paid run failed (${response.status}): ${structuredMessage}`
        : `Marketplace paid run failed (${response.status})`,
    );
  }

  return payload as AgentRunResponse;
}

export async function createMarketplaceDelegation(
  input: {
    agent_id: string;
    agent_type: string;
    allowed_actions: string[];
    token: string;
    max_per_run: string;
    total_allowance: string;
    valid_from: string;
    valid_until: string;
    onchain_tx_hash?: string;
    onchain_delegation_id?: string;
    delegation_contract?: string;
  },
  deps?: MarketplaceApiDeps,
): Promise<DelegationResponse> {
  const { getApiConfigFn } = withDeps(deps);
  const config = await getApiConfigFn();
  const baseUrl = config.url.replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/api/v1/marketplace/delegations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.key },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createDelegation ${res.status}`);
  return res.json();
}

export async function listMarketplaceDelegations(
  params?: { agent_id?: string },
  deps?: MarketplaceApiDeps,
): Promise<DelegationResponse[]> {
  const { getApiConfigFn } = withDeps(deps);
  const config = await getApiConfigFn();
  const baseUrl = config.url.replace(/\/$/, '');
  const qs = params?.agent_id ? `?agent_id=${params.agent_id}` : '';
  const res = await fetch(`${baseUrl}/api/v1/marketplace/delegations${qs}`, {
    headers: { 'X-API-Key': config.key },
  });
  if (!res.ok) throw new Error(`listDelegations ${res.status}`);
  const body = await res.json();
  return body.delegations ?? body;
}

export async function revokeMarketplaceDelegation(
  delegationId: string,
  deps?: MarketplaceApiDeps,
): Promise<DelegationResponse> {
  const { getApiConfigFn } = withDeps(deps);
  const config = await getApiConfigFn();
  const baseUrl = config.url.replace(/\/$/, '');
  const res = await fetch(
    `${baseUrl}/api/v1/marketplace/delegations/${delegationId}/revoke`,
    {
      method: 'POST',
      headers: { 'X-API-Key': config.key },
    },
  );
  if (!res.ok) throw new Error(`revokeDelegation ${res.status}`);
  return res.json();
}

export async function getMarketplaceLeaderboard(
  params?: { period?: string; agent_type?: string; limit?: number },
  deps?: MarketplaceApiDeps,
): Promise<LeaderboardResponse> {
  const { getApiConfigFn } = withDeps(deps);
  const config = await getApiConfigFn();
  const baseUrl = config.url.replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params?.period) qs.set('period', params.period);
  if (params?.agent_type) qs.set('agent_type', params.agent_type);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${baseUrl}/api/v1/marketplace/leaderboard${suffix}`, {
    headers: { 'X-API-Key': config.key },
  });
  if (!res.ok) throw new Error(`getLeaderboard ${res.status}`);
  return res.json();
}
