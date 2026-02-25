import {
  createCloakRuntime,
  getProvider,
  type CloakRuntime,
} from "@cloak-wallet/sdk";
import { getApiClient } from "./api-config";

export async function getExtensionRuntime(): Promise<CloakRuntime> {
  return createCloakRuntime({
    network: "sepolia",
    provider: getProvider("sepolia"),
    apiClient: await getApiClient(),
  });
}
