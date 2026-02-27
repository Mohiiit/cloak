import {
  buildRunParams,
  createInitialRunActionValues,
  getRunActionDefinition,
  getRunActionDefinitions,
  validateRunActionInput,
} from './marketplaceRunConfig';

describe('marketplaceRunConfig', () => {
  it('returns configured actions for each agent type', () => {
    expect(getRunActionDefinitions('staking_steward').map(item => item.action)).toEqual([
      'stake',
      'unstake',
      'rebalance',
      'compound',
    ]);
    expect(getRunActionDefinitions('treasury_dispatcher').map(item => item.action)).toEqual([
      'dispatch_batch',
      'sweep_idle',
    ]);
    expect(getRunActionDefinitions('swap_runner').map(item => item.action)).toEqual([
      'swap',
      'dca_tick',
    ]);
  });

  it('validates required fields and numeric values', () => {
    const swapDefinition = getRunActionDefinition('swap_runner', 'swap');
    expect(swapDefinition).not.toBeNull();
    if (!swapDefinition) return;

    expect(
      validateRunActionInput(swapDefinition, {
        from_token: '',
        to_token: 'STRK',
        amount: '25',
      }),
    ).toBe('From Token is required');

    expect(
      validateRunActionInput(swapDefinition, {
        from_token: 'USDC',
        to_token: 'STRK',
        amount: '-1',
      }),
    ).toBe('Amount must be greater than zero');
  });

  it('builds dispatch_batch params from form values', () => {
    const definition = getRunActionDefinition(
      'treasury_dispatcher',
      'dispatch_batch',
    );
    expect(definition).not.toBeNull();
    if (!definition) return;

    const params = buildRunParams(definition, {
      recipient: '0xabc',
      token: 'USDC',
      amount: '5',
    });

    expect(params).toEqual({
      transfers: [
        {
          recipient: '0xabc',
          token: 'USDC',
          amount: '5',
        },
      ],
    });
  });

  it('hydrates form defaults per selected action', () => {
    const definition = getRunActionDefinition('staking_steward', 'stake');
    expect(definition).not.toBeNull();
    if (!definition) return;

    expect(createInitialRunActionValues(definition)).toEqual({
      amount: '25',
    });
  });

  it('builds staking params in STRK units', () => {
    const definition = getRunActionDefinition('staking_steward', 'stake');
    expect(definition).not.toBeNull();
    if (!definition) return;

    const params = buildRunParams(definition, {
      amount: '10',
    });

    expect(params).toEqual({
      amount: '10',
      amount_unit: 'strk',
      token: 'STRK',
    });
  });
});
