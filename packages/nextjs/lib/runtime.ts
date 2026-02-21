import {
  createCloakRuntime,
  SupabaseLite,
  getProvider,
  type CloakRuntime,
} from "@cloak-wallet/sdk";
import { getSupabaseConfig } from "~~/lib/two-factor";

export function getWebRuntime(): CloakRuntime {
  const { url, key } = getSupabaseConfig();
  return createCloakRuntime({
    network: "sepolia",
    provider: getProvider("sepolia"),
    supabase: new SupabaseLite(url, key),
  });
}
