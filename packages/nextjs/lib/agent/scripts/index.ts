import type { AgentCard, AgentIntent, AgentWard } from "~~/lib/agent/types";
import { runHistoryScript } from "./history";
import { runWardQueryScript } from "./ward-query";

export interface ScriptContext {
  walletAddress?: string;
  wardConfigs?: AgentWard[];
}

export async function runScript(
  intent: AgentIntent,
  context: ScriptContext,
): Promise<{ cards: AgentCard[]; reply?: string }> {
  switch (intent.type) {
    case "history_query":
      return runHistoryScript(context.walletAddress);
    case "ward_query":
      return runWardQueryScript(intent, context);
    default:
      return { cards: [] };
  }
}
