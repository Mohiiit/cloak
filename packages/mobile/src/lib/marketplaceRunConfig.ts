import type { AgentType } from '@cloak-wallet/sdk';

export interface MarketplaceRunFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
  helperText?: string;
  defaultValue?: string;
  required?: boolean;
  keyboardType?: 'default' | 'numeric';
}

export interface MarketplaceRunActionDefinition {
  action: string;
  label: string;
  description: string;
  fields: MarketplaceRunFieldDefinition[];
  buildParams: (values: Record<string, string>) => Record<string, unknown>;
}

const ACTION_DEFINITIONS_BY_AGENT_TYPE: Record<
  AgentType,
  MarketplaceRunActionDefinition[]
> = {
  staking_steward: [
    {
      action: 'stake',
      label: 'Stake',
      description: 'Stake tokens into a selected pool.',
      fields: [
        {
          key: 'amount',
          label: 'Amount',
          placeholder: '25',
          defaultValue: '25',
          required: true,
          keyboardType: 'numeric',
        },
      ],
      buildParams: values => {
        const amount = values.amount.trim();
        return {
          amount,
          amount_unit: 'strk',
          token: 'STRK',
        };
      },
    },
    {
      action: 'unstake',
      label: 'Unstake',
      description: 'Unstake tokens from a selected pool.',
      fields: [],
      buildParams: () => ({}),
    },
    {
      action: 'rebalance',
      label: 'Rebalance',
      description: 'Move stake between pools.',
      fields: [
        {
          key: 'from_pool',
          label: 'From Pool',
          placeholder: 'strk_core_pool',
          defaultValue: 'strk_core_pool',
          required: true,
        },
        {
          key: 'to_pool',
          label: 'To Pool',
          placeholder: 'strk_liquid_pool',
          defaultValue: 'strk_liquid_pool',
          required: true,
        },
        {
          key: 'amount',
          label: 'Amount (optional)',
          placeholder: '5',
          keyboardType: 'numeric',
        },
      ],
      buildParams: values => {
        const fromPool = values.from_pool.trim();
        const toPool = values.to_pool.trim();
        const amount = values.amount.trim();
        return {
          from_pool: fromPool,
          to_pool: toPool,
          ...(amount ? { amount } : {}),
        };
      },
    },
    {
      action: 'compound',
      label: 'Compound Rewards',
      description:
        'Claim unclaimed staking rewards and re-stake them automatically.',
      fields: [
        {
          key: 'amount',
          label: 'Service Fee (STRK)',
          placeholder: '1',
          defaultValue: '1',
          helperText: 'Agent service fee. The compound itself costs no extra tokens.',
          required: true,
          keyboardType: 'numeric',
        },
      ],
      buildParams: values => ({
        amount: values.amount.trim() || '1',
        amount_unit: 'strk',
        token: 'STRK',
      }),
    },
  ],
  treasury_dispatcher: [
    {
      action: 'dispatch_batch',
      label: 'Dispatch Batch',
      description: 'Dispatch a treasury transfer batch.',
      fields: [
        {
          key: 'recipient',
          label: 'Recipient',
          placeholder: '0xabc...',
          required: true,
        },
        {
          key: 'token',
          label: 'Token',
          placeholder: 'USDC',
          defaultValue: 'USDC',
          required: true,
        },
        {
          key: 'amount',
          label: 'Amount',
          placeholder: '10',
          defaultValue: '10',
          required: true,
          keyboardType: 'numeric',
        },
      ],
      buildParams: values => {
        const recipient = values.recipient.trim();
        const token = values.token.trim();
        const amount = values.amount.trim();
        return {
          transfers: [
            {
              recipient,
              token,
              amount,
            },
          ],
        };
      },
    },
    {
      action: 'sweep_idle',
      label: 'Sweep Idle',
      description: 'Sweep idle treasury balance into a target vault.',
      fields: [
        {
          key: 'target_vault',
          label: 'Target Vault',
          placeholder: 'vault_main_treasury',
          defaultValue: 'vault_main_treasury',
          required: true,
        },
        {
          key: 'token',
          label: 'Token (optional)',
          placeholder: 'STRK',
          defaultValue: 'STRK',
        },
      ],
      buildParams: values => {
        const targetVault = values.target_vault.trim();
        const token = values.token.trim();
        return {
          target_vault: targetVault,
          ...(token ? { token } : {}),
        };
      },
    },
  ],
  swap_runner: [
    {
      action: 'swap',
      label: 'Swap',
      description: 'Swap one token for another.',
      fields: [
        {
          key: 'from_token',
          label: 'From Token',
          placeholder: 'USDC',
          defaultValue: 'USDC',
          required: true,
        },
        {
          key: 'to_token',
          label: 'To Token',
          placeholder: 'STRK',
          defaultValue: 'STRK',
          required: true,
        },
        {
          key: 'amount',
          label: 'Amount',
          placeholder: '25',
          defaultValue: '25',
          required: true,
          keyboardType: 'numeric',
        },
      ],
      buildParams: values => {
        const fromToken = values.from_token.trim();
        const toToken = values.to_token.trim();
        const amount = values.amount.trim();
        return {
          from_token: fromToken,
          to_token: toToken,
          amount,
        };
      },
    },
    {
      action: 'dca_tick',
      label: 'DCA Tick',
      description: 'Trigger one interval for a DCA strategy.',
      fields: [
        {
          key: 'strategy_id',
          label: 'Strategy ID',
          placeholder: 'dca_strategy_1',
          required: true,
        },
      ],
      buildParams: values => ({
        strategy_id: values.strategy_id.trim(),
      }),
    },
  ],
};

export function getRunActionDefinitions(
  agentType: AgentType,
): MarketplaceRunActionDefinition[] {
  return ACTION_DEFINITIONS_BY_AGENT_TYPE[agentType] || [];
}

export function getRunActionDefinition(
  agentType: AgentType,
  action: string,
): MarketplaceRunActionDefinition | null {
  const normalizedAction = action.trim().toLowerCase();
  if (!normalizedAction) return null;
  const definition = getRunActionDefinitions(agentType).find(
    item => item.action === normalizedAction,
  );
  return definition ?? null;
}

export function createInitialRunActionValues(
  definition: MarketplaceRunActionDefinition,
): Record<string, string> {
  return definition.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.defaultValue || '';
    return acc;
  }, {});
}

export function validateRunActionInput(
  definition: MarketplaceRunActionDefinition,
  values: Record<string, string>,
): string | null {
  for (const field of definition.fields) {
    const rawValue = values[field.key] ?? '';
    const value = rawValue.trim();
    if (field.required && value.length === 0) {
      return `${field.label} is required`;
    }
    if (field.keyboardType === 'numeric' && value.length > 0) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return `${field.label} must be greater than zero`;
      }
    }
  }
  return null;
}

export function buildRunParams(
  definition: MarketplaceRunActionDefinition,
  values: Record<string, string>,
): Record<string, unknown> {
  return definition.buildParams(values);
}
