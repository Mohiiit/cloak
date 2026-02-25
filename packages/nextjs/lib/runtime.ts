import {
  createCloakRuntime,
  getProvider,
  type CloakRuntime,
} from "@cloak-wallet/sdk";
import { getClient } from "~~/lib/api-client";

export function getWebRuntime(): CloakRuntime {
  return createCloakRuntime({
    network: "sepolia",
    provider: getProvider("sepolia"),
    apiClient: getClient(),
  });
}
