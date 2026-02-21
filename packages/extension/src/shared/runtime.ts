import {
  createCloakRuntime,
  SupabaseLite,
  getProvider,
  type CloakRuntime,
} from "@cloak-wallet/sdk";
import { getSupabaseConfig } from "./supabase-config";

export async function getExtensionRuntime(): Promise<CloakRuntime> {
  const { url, key } = await getSupabaseConfig();
  return createCloakRuntime({
    network: "sepolia",
    provider: getProvider("sepolia"),
    supabase: new SupabaseLite(url, key),
  });
}
