import type { AgentType } from "@cloak-wallet/sdk";
import { stakingStewardRuntime } from "./staking-steward";
import { treasuryDispatcherRuntime } from "./treasury-dispatcher";
import { swapRunnerRuntime } from "./swap-runner";
import type {
  AgentRuntimeHandler,
  AgentRuntimeInput,
  AgentRuntimeOutput,
} from "./types";

const handlers: Partial<Record<AgentType, AgentRuntimeHandler>> = {
  staking_steward: stakingStewardRuntime,
  treasury_dispatcher: treasuryDispatcherRuntime,
  swap_runner: swapRunnerRuntime,
};

export function inferAgentType(agentId: string): AgentType | null {
  if (agentId === "staking_steward" || agentId.includes("staking")) {
    return "staking_steward";
  }
  if (agentId === "treasury_dispatcher" || agentId.includes("treasury")) {
    return "treasury_dispatcher";
  }
  if (agentId === "swap_runner" || agentId.includes("swap")) {
    return "swap_runner";
  }
  return null;
}

export async function executeAgentRuntime(
  input: AgentRuntimeInput,
): Promise<AgentRuntimeOutput> {
  const handler = handlers[input.agentType];
  if (!handler) {
    return {
      status: "failed",
      executionTxHashes: null,
      result: {
        error: `No runtime handler for ${input.agentType}`,
      },
    };
  }
  return handler.execute(input);
}
