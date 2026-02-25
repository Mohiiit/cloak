import type { AgentCard, ActivityCardItem } from "~~/lib/agent/types";
import { listAgentActivity } from "~~/lib/agent/scripts/activity-source";

const MAX_CARD_ITEMS = 5;

export async function runHistoryScript(
  walletAddress?: string,
): Promise<{ cards: AgentCard[]; reply?: string }> {
  if (!walletAddress) {
    return {
      cards: [{ type: "error", title: "No wallet", message: "Connect your wallet to view activity." }],
      reply: "I need your wallet address to look up activity. Make sure your wallet is connected.",
    };
  }

  try {
    const { records, total } = await listAgentActivity(
      walletAddress,
      MAX_CARD_ITEMS + 1,
    );

    if (records.length === 0) {
      return {
        cards: [],
        reply: "No transaction history found for your wallet yet. Try shielding some funds first!",
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
      reply: `Here's your recent activity (${items.length} of ${total} transactions):`,
    };
  } catch (err) {
    console.warn("[agent/history] Failed to fetch activity:", err);
    return {
      cards: [{ type: "error", title: "Fetch failed", message: "Could not load transaction history." }],
      reply: "Sorry, I couldn't fetch your transaction history right now. Please try again later.",
    };
  }
}
