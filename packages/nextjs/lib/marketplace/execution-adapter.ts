import {
  executeWithBasicProtocols,
  type BasicProtocolExecutionRequest,
  type BasicProtocolExecutionResult,
} from "./basic-protocol-adapter";
import {
  executeWithStarkZap,
  type StarkZapExecutionRequest,
  type StarkZapExecutionResult,
} from "./starkzap-adapter";

export type MarketplaceExecutionInput =
  | BasicProtocolExecutionRequest
  | StarkZapExecutionRequest;

export type MarketplaceExecutionResult =
  | BasicProtocolExecutionResult
  | StarkZapExecutionResult;

type RuntimeProtocolMode = "auto" | "starkzap" | "basic";

function parseMode(raw: string | undefined): RuntimeProtocolMode {
  const normalized = (raw || "basic")
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (normalized === "starkzap") return "starkzap";
  if (normalized === "basic") return "basic";
  return "basic";
}

export async function executeMarketplaceRuntimeAction(
  input: MarketplaceExecutionInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MarketplaceExecutionResult> {
  const mode = parseMode(env.MARKETPLACE_RUNTIME_PROTOCOL);

  if (mode === "starkzap") {
    return executeWithStarkZap(input);
  }

  if (mode === "basic") {
    return executeWithBasicProtocols(input, env);
  }

  return executeWithBasicProtocols(input, env);
}
