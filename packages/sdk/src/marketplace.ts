import type {
  AgentHireResponse,
  AgentProfileResponse,
  AgentProfileStatus,
  CreateAgentHireRequest,
  CreateAgentRunRequest,
  DiscoverAgentsQuery,
  RegisterAgentRequest,
  AgentRunResponse,
} from "./types/api";

type FetchLike = typeof fetch;

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
}

export function createMarketplaceClient(
  options: MarketplaceClientOptions,
): MarketplaceClient {
  return new MarketplaceClient(options);
}
