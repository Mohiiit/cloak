const mockX402Fetch = jest.fn();

jest.mock('@cloak-wallet/sdk', () => {
  class TongoEnvelopeProofProvider {
    resolver: any;

    constructor(resolver: any) {
      this.resolver = resolver;
    }
  }

  return {
    TongoEnvelopeProofProvider,
    createX402TongoProofEnvelope: (input: any) => ({
      envelopeVersion: '1',
      proofType: 'tongo_attestation_v1',
      intentHash: input?.metadata?.intentHash || 'intent',
      settlementTxHash: input?.settlementTxHash,
    }),
    x402FetchWithProofProvider: (...args: any[]) => mockX402Fetch(...args),
  };
});

import {
  discoverMarketplaceAgents,
  executeMarketplacePaidRun,
  hireMarketplaceAgent,
  listMarketplaceHires,
} from './marketplaceApi';

describe('marketplaceApi', () => {
  it('discovers marketplace agents via api client', async () => {
    const discoverAgents = jest.fn().mockResolvedValue([
      {
        agent_id: 'agent_swap',
        name: 'Swap Runner',
        description: 'Runs swaps',
        agent_type: 'swap_runner',
        capabilities: ['swap'],
        endpoints: [],
        pricing: {},
        trust_score: 91,
        verified: true,
        status: 'active',
        discovery_score: 93,
      },
    ]);

    const getApiClientFn = jest.fn().mockResolvedValue({
      discoverAgents,
      verify: jest.fn(),
      createHire: jest.fn(),
      listHires: jest.fn(),
      listRuns: jest.fn(),
    });

    const agents = await discoverMarketplaceAgents(
      {
        wallet: { walletAddress: '0xabc', publicKey: '0xdef' },
        capability: 'swap',
      },
      { getApiClientFn: getApiClientFn as any },
    );

    expect(getApiClientFn).toHaveBeenCalledWith({
      walletAddress: '0xabc',
      publicKey: '0xdef',
    });
    expect(discoverAgents).toHaveBeenCalledWith({
      capability: 'swap',
      limit: 50,
      offset: 0,
    });
    expect(agents).toHaveLength(1);
  });

  it('creates hire bound to authenticated operator wallet', async () => {
    const verify = jest
      .fn()
      .mockResolvedValue({ wallet_address: '0xoperator' });
    const createHire = jest.fn().mockResolvedValue({ id: 'hire_1' });
    const getApiClientFn = jest.fn().mockResolvedValue({
      discoverAgents: jest.fn(),
      verify,
      createHire,
      listHires: jest.fn(),
      listRuns: jest.fn(),
    });

    await hireMarketplaceAgent(
      {
        wallet: { walletAddress: '0xabc', publicKey: '0xdef' },
        agentId: 'agent_swap',
        policySnapshot: { max_usd_per_run: 25 },
      },
      { getApiClientFn: getApiClientFn as any },
    );

    expect(verify).toHaveBeenCalledTimes(1);
    expect(createHire).toHaveBeenCalledWith({
      agent_id: 'agent_swap',
      operator_wallet: '0xoperator',
      policy_snapshot: { max_usd_per_run: 25 },
      billing_mode: 'per_run',
    });
  });

  it('executes paid run using x402 executor', async () => {
    const x402Executor = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'run_1',
        hire_id: 'hire_1',
        agent_id: 'agent_swap',
        action: 'swap',
        status: 'completed',
      }),
    });

    const run = await executeMarketplacePaidRun(
      {
        hireId: 'hire_1',
        agentId: 'agent_swap',
        action: 'swap',
        params: { from: 'USDC', to: 'STRK' },
        payerTongoAddress: 'tongo_abc',
      },
      {
        getApiConfigFn: async () => ({
          url: 'https://cloak.example',
          key: 'api_key_1',
        }),
        x402Executor: x402Executor as any,
      },
    );

    expect(x402Executor).toHaveBeenCalledTimes(1);
    const [url, init, options] = x402Executor.mock.calls[0];
    expect(url).toBe('https://cloak.example/api/v1/marketplace/runs');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe('api_key_1');
    expect(JSON.parse(init.body)).toMatchObject({
      hire_id: 'hire_1',
      agent_id: 'agent_swap',
      action: 'swap',
      billable: true,
      execute: true,
    });
    expect(options.tongoAddress).toBe('tongo_abc');
    expect(run.id).toBe('run_1');
  });

  it('fails paid run when api key is missing', async () => {
    await expect(
      executeMarketplacePaidRun(
        {
          hireId: 'hire_1',
          agentId: 'agent_swap',
          action: 'swap',
          payerTongoAddress: 'tongo_abc',
        },
        {
          getApiConfigFn: async () => ({
            url: 'https://cloak.example',
            key: '',
          }),
        },
      ),
    ).rejects.toThrow('Missing API key for marketplace paid run');
  });

  it('lists marketplace hires for wallet', async () => {
    const listHires = jest
      .fn()
      .mockResolvedValue([
        { id: 'hire_1', agent_id: 'staking_steward', status: 'active' },
      ]);
    const getApiClientFn = jest.fn().mockResolvedValue({
      discoverAgents: jest.fn(),
      verify: jest.fn(),
      createHire: jest.fn(),
      listHires,
      listRuns: jest.fn(),
    });

    const hires = await listMarketplaceHires(
      {
        wallet: { walletAddress: '0xabc', publicKey: '0xdef' },
        status: 'active',
      },
      { getApiClientFn: getApiClientFn as any },
    );

    expect(listHires).toHaveBeenCalledWith({
      agent_id: undefined,
      status: 'active',
      limit: 100,
      offset: 0,
    });
    expect(hires).toHaveLength(1);
    expect(hires[0].id).toBe('hire_1');
  });
});
