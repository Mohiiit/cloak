const mockX402Fetch = jest.fn();

jest.mock('@cloak-wallet/sdk', () => {
  class TongoEnvelopeProofProvider {
    resolver: any;

    constructor(resolver: any) {
      this.resolver = resolver;
    }

    async createProof(input: any) {
      const replayKey = input?.replayKey || 'rk_test';
      const nonce = input?.nonce || 'nonce_test';
      const envelope = await this.resolver({
        ...input,
        replayKey,
        nonce,
        intentHash: input?.intentHash || 'intent_test',
      });
      return {
        proof: JSON.stringify(envelope),
        replayKey,
        nonce,
        envelope,
      };
    }
  }

  return {
    TongoEnvelopeProofProvider,
    createX402TongoProofEnvelope: (input: any) => ({
      envelopeVersion: '1',
      proofType: 'tongo_attestation_v1',
      intentHash: input?.intentHash || input?.metadata?.intentHash || 'intent',
      settlementTxHash: input?.settlementTxHash,
      tongoProof: input?.tongoProof,
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

  it('surfaces structured 402 errors from facilitator responses', async () => {
    const x402Executor = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        status: 'rejected',
        reasonCode: 'INVALID_TONGO_PROOF',
        details: 'tongo withdraw amount is not parseable',
      }),
    });

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
            key: 'api_key_1',
          }),
          x402Executor: x402Executor as any,
        },
      ),
    ).rejects.toThrow(
      'Marketplace paid run failed (402): rejected · INVALID_TONGO_PROOF · tongo withdraw amount is not parseable',
    );
  });

  it('builds x402 envelope from on-chain payment executor output', async () => {
    const challenge = {
      version: '1',
      scheme: 'cloak-shielded-x402',
      challengeId: 'c_1',
      network: 'sepolia',
      token: 'STRK',
      minAmount: '25',
      recipient: '0xabc',
      contextHash: 'ctx',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      facilitator: 'https://cloak.example/api/v1/marketplace/payments/x402',
    };

    const x402PaymentExecutor = jest.fn().mockResolvedValue({
      settlementTxHash:
        '0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
      tongoProof: {
        operation: 'withdraw',
        inputs: {},
        proof: {},
      },
    });

    const x402Executor = jest.fn().mockImplementation(async (_url, _init, options) => {
      const proofPayload = await options.proofProvider.createProof({
        challenge,
        tongoAddress: 'tongo_abc',
        amount: challenge.minAmount,
        contextHash: challenge.contextHash,
        replayKey: 'rk_1',
        nonce: 'nonce_1',
        intentHash: 'intent_1',
      });
      const parsedProof = JSON.parse(proofPayload.proof);
      expect(parsedProof.settlementTxHash).toBe(
        '0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
      );
      expect(parsedProof.tongoProof.operation).toBe('withdraw');
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'run_1',
          hire_id: 'hire_1',
          agent_id: 'agent_swap',
          action: 'swap',
          status: 'completed',
        }),
      };
    });

    await executeMarketplacePaidRun(
      {
        hireId: 'hire_1',
        agentId: 'agent_swap',
        action: 'swap',
        params: { from: 'USDC', to: 'STRK' },
        payerTongoAddress: 'tongo_abc',
        x402PaymentExecutor,
      },
      {
        getApiConfigFn: async () => ({
          url: 'https://cloak.example',
          key: 'api_key_1',
        }),
        x402Executor: x402Executor as any,
      },
    );

    expect(x402PaymentExecutor).toHaveBeenCalledTimes(1);
  });

  it('throws when x402 proof resolver has no settlement tx hash source', async () => {
    const challenge = {
      version: '1',
      scheme: 'cloak-shielded-x402',
      challengeId: 'c_2',
      network: 'sepolia',
      token: 'STRK',
      minAmount: '25',
      recipient: '0xabc',
      contextHash: 'ctx',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      facilitator: 'https://cloak.example/api/v1/marketplace/payments/x402',
    };

    const x402Executor = jest.fn().mockImplementation(async (_url, _init, options) => {
      await options.proofProvider.createProof({
        challenge,
        tongoAddress: 'tongo_abc',
        amount: challenge.minAmount,
        contextHash: challenge.contextHash,
        replayKey: 'rk_2',
        nonce: 'nonce_2',
        intentHash: 'intent_2',
      });
      return {
        ok: true,
        status: 201,
        json: async () => ({}),
      };
    });

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
            key: 'api_key_1',
          }),
          x402Executor: x402Executor as any,
        },
      ),
    ).rejects.toThrow(
      'Missing x402 settlement tx hash. Provide x402PaymentExecutor or settlementTxHash.',
    );
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
