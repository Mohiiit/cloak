import {
  fetchWardInfo,
  getProvider,
  truncateAddress,
} from "@cloak-wallet/sdk";
import type { AgentCard, AgentIntent, AgentWard, ActivityCardItem } from "~~/lib/agent/types";
import { listAgentActivity } from "~~/lib/agent/scripts/activity-source";

const MAX_CARD_ITEMS = 5;

function resolveWardAddress(
  intent: AgentIntent,
  wards: AgentWard[],
): AgentWard | undefined {
  const name = intent.wardName?.toLowerCase();
  if (!name) return wards[0]; // default to first ward if no name given

  return wards.find((w) => {
    if (w.pseudoName && w.pseudoName.toLowerCase().includes(name)) return true;
    if (w.address.toLowerCase().includes(name)) return true;
    return false;
  });
}

async function wardInfoCard(
  wardAddress: string,
  wardName?: string,
): Promise<{ cards: AgentCard[]; reply?: string }> {
  try {
    const provider = getProvider("sepolia");
    const info = await fetchWardInfo(provider, wardAddress);
    if (!info) throw new Error("Ward not found");

    return {
      cards: [{
        type: "ward_summary",
        name: wardName || truncateAddress(wardAddress),
        address: wardAddress,
        guardian: info.guardianAddress,
        frozen: info.isFrozen,
      }],
      reply: `Here's the info for ward "${wardName || truncateAddress(wardAddress)}":`,
    };
  } catch (err) {
    console.warn("[agent/ward-query] Failed to fetch ward info:", err);
    return {
      cards: [{ type: "error", title: "Ward lookup failed", message: "Could not fetch ward information from chain." }],
      reply: "Sorry, I couldn't look up that ward's info right now.",
    };
  }
}

async function wardActivityCard(
  wardAddress: string,
  wardName?: string,
): Promise<{ cards: AgentCard[]; reply?: string }> {
  try {
    const { records, total } = await listAgentActivity(
      wardAddress,
      MAX_CARD_ITEMS + 1,
    );

    if (records.length === 0) {
      return {
        cards: [],
        reply: `No activity found for ward "${wardName || truncateAddress(wardAddress)}" yet.`,
      };
    }

    const items: ActivityCardItem[] = records.slice(0, MAX_CARD_ITEMS).map((r) => ({
      txHash: r.tx_hash,
      type: r.type,
      token: r.token,
      amount: r.amount ?? undefined,
      status: r.status,
      timestamp: r.created_at || new Date().toISOString(),
      recipient: r.recipient ?? undefined,
    }));

    return {
      cards: [{ type: "activity_list", items, total }],
      reply: `Recent activity for ward "${wardName || truncateAddress(wardAddress)}":`,
    };
  } catch (err) {
    console.warn("[agent/ward-query] Failed to fetch ward activity:", err);
    return {
      cards: [{ type: "error", title: "Fetch failed", message: "Could not load ward activity." }],
      reply: "Sorry, I couldn't fetch the ward's activity right now.",
    };
  }
}

export async function runWardQueryScript(
  intent: AgentIntent,
  context: { wardConfigs?: AgentWard[] },
): Promise<{ cards: AgentCard[]; reply?: string }> {
  const wards = context.wardConfigs || [];

  if (wards.length === 0) {
    return {
      cards: [],
      reply: "You don't have any ward accounts configured. You can create one from Settings.",
    };
  }

  const ward = resolveWardAddress(intent, wards);
  if (!ward) {
    const names = wards
      .map((w) => w.pseudoName || truncateAddress(w.address))
      .join(", ");
    return {
      cards: [],
      reply: `I couldn't find a ward matching "${intent.wardName}". Your wards: ${names}`,
    };
  }

  const queryType = intent.wardQueryType || "info";
  if (queryType === "activity") {
    return wardActivityCard(ward.address, ward.pseudoName);
  }
  return wardInfoCard(ward.address, ward.pseudoName);
}
