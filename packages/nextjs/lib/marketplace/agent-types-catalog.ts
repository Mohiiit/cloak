import type { AgentType } from "@cloak-wallet/sdk";
import { getSupabase } from "~~/app/api/v1/_lib/supabase";
import { hasSupabaseEnv } from "./repo-utils";

export interface AgentTypeDefinition {
  value: AgentType;
  label: string;
  description: string;
  default_capabilities: string[];
}

interface AgentTypeCatalogRow {
  agent_type: string;
  label: string | null;
  description: string | null;
  default_capabilities: unknown;
  enabled: boolean | null;
  sort_order: number | null;
}

const DEFAULT_AGENT_TYPE_DEFINITIONS: AgentTypeDefinition[] = [
  {
    value: "staking_steward",
    label: "Staking Steward",
    description: "Policy-scoped staking and unstaking automation.",
    default_capabilities: ["stake", "x402_shielded"],
  },
  {
    value: "treasury_dispatcher",
    label: "Treasury Dispatcher",
    description: "Controlled treasury dispatch and sweep execution.",
    default_capabilities: ["dispatch", "x402_shielded"],
  },
  {
    value: "swap_runner",
    label: "Swap Runner",
    description: "Automated swaps and DCA-like execution paths.",
    default_capabilities: ["swap", "x402_shielded"],
  },
];

const VALID_AGENT_TYPES = new Set<AgentType>(
  DEFAULT_AGENT_TYPE_DEFINITIONS.map(item => item.value),
);

function isAgentType(value: string): value is AgentType {
  return VALID_AGENT_TYPES.has(value as AgentType);
}

function parseCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => String(entry).trim())
    .filter(Boolean);
}

function sortByDefaultOrder(items: AgentTypeDefinition[]): AgentTypeDefinition[] {
  const order = new Map<AgentType, number>(
    DEFAULT_AGENT_TYPE_DEFINITIONS.map((item, index) => [item.value, index]),
  );
  return [...items].sort((a, b) => {
    const left = order.get(a.value) ?? Number.MAX_SAFE_INTEGER;
    const right = order.get(b.value) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

export async function listAgentTypeDefinitions(): Promise<AgentTypeDefinition[]> {
  if (!hasSupabaseEnv()) {
    return DEFAULT_AGENT_TYPE_DEFINITIONS;
  }

  try {
    const sb = getSupabase();
    const rows = await sb.select<AgentTypeCatalogRow>(
      "agent_type_catalog",
      "enabled=eq.true",
      {
        orderBy: "sort_order.asc",
        limit: 50,
      },
    );

    const mapped = rows
      .map((row): AgentTypeDefinition | null => {
        if (!isAgentType(row.agent_type)) return null;
        const parsedDefaults = parseCapabilities(row.default_capabilities);
        const defaults =
          parsedDefaults.length > 0
            ? parsedDefaults
            : DEFAULT_AGENT_TYPE_DEFINITIONS.find(item => item.value === row.agent_type)
                ?.default_capabilities || [];
        return {
          value: row.agent_type,
          label: row.label?.trim() || row.agent_type,
          description: row.description?.trim() || "",
          default_capabilities: defaults,
        };
      })
      .filter((item): item is AgentTypeDefinition => !!item);

    if (mapped.length === 0) return DEFAULT_AGENT_TYPE_DEFINITIONS;
    return sortByDefaultOrder(mapped);
  } catch {
    return DEFAULT_AGENT_TYPE_DEFINITIONS;
  }
}
