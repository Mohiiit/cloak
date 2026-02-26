import {
  StaticX402ProofProvider,
  x402FetchWithProofProvider,
  type AgentHireResponse,
  type AgentProfileResponse,
  type AgentRunResponse,
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
  },
  deps?: MarketplaceApiDeps,
): Promise<AgentRunResponse> {
  const { getApiConfigFn, x402Executor } = withDeps(deps);
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
      }),
    },
    {
      tongoAddress: input.payerTongoAddress,
      proofProvider: new StaticX402ProofProvider(
        input.proof || 'proof-mobile-demo',
      ),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `Marketplace paid run failed (${response.status})`,
    );
  }

  return payload as AgentRunResponse;
}
