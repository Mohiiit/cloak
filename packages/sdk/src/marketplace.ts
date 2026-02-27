import type {
  AgentHireResponse,
  AgentProfileResponse,
  AgentProfileStatus,
  CreateAgentHireRequest,
  CreateAgentRunRequest,
  CreateDelegationRequest,
  DelegationResponse,
  DiscoverAgentsQuery,
  LeaderboardResponse,
  RegisterAgentRequest,
  AgentRunResponse,
} from "./types/api";

type FetchLike = typeof fetch;

// ─── u256 split for ERC-20 calldata ──────────────────────────────────────────

const UINT128_MAX = (1n << 128n) - 1n;

function toUint256Calldata(amount: bigint): [string, string] {
  const low = amount & UINT128_MAX;
  const high = amount >> 128n;
  return [`0x${low.toString(16)}`, `0x${high.toString(16)}`];
}

// ─── On-chain delegation call builders ───────────────────────────────────────

export interface DelegationCallInput {
  delegationContract: string;
  tokenAddress: string;
  totalAllowance: string;
  operator: string;
  agentId: string;
  maxPerRun: string;
  validFrom: number;
  validUntil: number;
}

export interface DelegationCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

/**
 * Build the 2-call multicall for creating an on-chain delegation:
 * 1. ERC-20 approve(delegationContract, totalAllowance)
 * 2. CloakDelegation.create_delegation(operator, agentId, token, maxPerRun, totalAllowance, validFrom, validUntil)
 */
export function buildCreateDelegationCalls(input: DelegationCallInput): DelegationCall[] {
  const totalBig = BigInt(input.totalAllowance);
  const maxPerRunBig = BigInt(input.maxPerRun);
  const [totalLow, totalHigh] = toUint256Calldata(totalBig);
  const [maxLow, maxHigh] = toUint256Calldata(maxPerRunBig);

  return [
    {
      contractAddress: input.tokenAddress,
      entrypoint: "approve",
      calldata: [input.delegationContract, totalLow, totalHigh],
    },
    {
      contractAddress: input.delegationContract,
      entrypoint: "create_delegation",
      calldata: [
        input.operator,
        input.agentId,
        input.tokenAddress,
        maxLow,
        maxHigh,
        totalLow,
        totalHigh,
        `0x${input.validFrom.toString(16)}`,
        `0x${input.validUntil.toString(16)}`,
      ],
    },
  ];
}

/**
 * Build a single call to revoke an on-chain delegation.
 */
export function buildRevokeDelegationCall(
  delegationContract: string,
  delegationId: string,
): DelegationCall {
  return {
    contractAddress: delegationContract,
    entrypoint: "revoke_delegation",
    calldata: [delegationId],
  };
}

export interface MarketplaceClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}

export interface UpdateAgentProfileInput {
  status?: AgentProfileStatus;
  verified?: boolean;
  trust_score?: number;
  metadata_uri?: string | null;
}

export interface UpdateHireInput {
  status: "active" | "paused" | "revoked";
}

function buildQuery(query?: DiscoverAgentsQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.capability) params.set("capability", query.capability);
  if (query.agent_type) params.set("agent_type", query.agent_type);
  if (query.verified_only !== undefined) {
    params.set("verified_only", query.verified_only ? "true" : "false");
  }
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Marketplace request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export class MarketplaceClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: MarketplaceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra || {});
    headers.set("X-API-Key", this.apiKey);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return headers;
  }

  async registerAgent(input: RegisterAgentRequest): Promise<AgentProfileResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/agents`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    return parseJson<AgentProfileResponse>(res);
  }

  async listAgents(query?: DiscoverAgentsQuery): Promise<AgentProfileResponse[]> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/marketplace/agents${buildQuery(query)}`,
      {
        method: "GET",
        headers: this.headers({ "Content-Type": "application/json" }),
      },
    );
    const payload = await parseJson<{ agents: AgentProfileResponse[] }>(res);
    return payload.agents;
  }

  async discoverAgents(
    query?: DiscoverAgentsQuery,
  ): Promise<Array<AgentProfileResponse & { discovery_score: number }>> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/marketplace/discover${buildQuery(query)}`,
      {
        method: "GET",
        headers: this.headers({ "Content-Type": "application/json" }),
      },
    );
    const payload = await parseJson<{
      agents: Array<AgentProfileResponse & { discovery_score: number }>;
    }>(res);
    return payload.agents;
  }

  async getAgent(agentId: string): Promise<AgentProfileResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/agents/${agentId}`, {
      method: "GET",
      headers: this.headers({ "Content-Type": "application/json" }),
    });
    return parseJson<AgentProfileResponse>(res);
  }

  async updateAgent(
    agentId: string,
    patch: UpdateAgentProfileInput,
  ): Promise<AgentProfileResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/agents/${agentId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(patch),
    });
    return parseJson<AgentProfileResponse>(res);
  }

  async createHire(input: CreateAgentHireRequest): Promise<AgentHireResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/hires`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    return parseJson<AgentHireResponse>(res);
  }

  async listHires(params?: { agent_id?: string }): Promise<AgentHireResponse[]> {
    const query = params?.agent_id ? `?agent_id=${encodeURIComponent(params.agent_id)}` : "";
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/hires${query}`, {
      method: "GET",
      headers: this.headers({ "Content-Type": "application/json" }),
    });
    const payload = await parseJson<{ hires: AgentHireResponse[] }>(res);
    return payload.hires;
  }

  async updateHire(hireId: string, patch: UpdateHireInput): Promise<AgentHireResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/hires/${hireId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(patch),
    });
    return parseJson<AgentHireResponse>(res);
  }

  async createRun(input: CreateAgentRunRequest & { agent_id: string }): Promise<AgentRunResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/runs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    return parseJson<AgentRunResponse>(res);
  }

  async listRuns(): Promise<AgentRunResponse[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/runs`, {
      method: "GET",
      headers: this.headers({ "Content-Type": "application/json" }),
    });
    const payload = await parseJson<{ runs: AgentRunResponse[] }>(res);
    return payload.runs;
  }

  // ─── Delegations ──────────────────────────────────────────────────────────

  async createDelegation(input: CreateDelegationRequest): Promise<DelegationResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/marketplace/delegations`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    return parseJson<DelegationResponse>(res);
  }

  async listDelegations(params?: {
    agent_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<DelegationResponse[]> {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set("agent_id", params.agent_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await this.fetchImpl(
      `${this.baseUrl}/marketplace/delegations${suffix}`,
      {
        method: "GET",
        headers: this.headers({ "Content-Type": "application/json" }),
      },
    );
    const payload = await parseJson<{ delegations: DelegationResponse[] }>(res);
    return payload.delegations;
  }

  async revokeDelegation(delegationId: string): Promise<DelegationResponse> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/marketplace/delegations/${delegationId}/revoke`,
      {
        method: "POST",
        headers: this.headers(),
      },
    );
    return parseJson<DelegationResponse>(res);
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  async getLeaderboard(params?: {
    period?: string;
    agent_type?: string;
    limit?: number;
  }): Promise<LeaderboardResponse> {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    if (params?.agent_type) qs.set("agent_type", params.agent_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await this.fetchImpl(
      `${this.baseUrl}/marketplace/leaderboard${suffix}`,
      {
        method: "GET",
        headers: this.headers({ "Content-Type": "application/json" }),
      },
    );
    return parseJson<LeaderboardResponse>(res);
  }
}

export function createMarketplaceClient(
  options: MarketplaceClientOptions,
): MarketplaceClient {
  return new MarketplaceClient(options);
}
