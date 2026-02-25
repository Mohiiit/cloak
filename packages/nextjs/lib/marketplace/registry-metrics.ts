import type { AgentProfileResponse } from "@cloak-wallet/sdk";

type RegistryMetricName =
  | "profiles_registered"
  | "profiles_updated"
  | "discovery_queries"
  | "onchain_refreshes";

const counters: Record<RegistryMetricName, number> = {
  profiles_registered: 0,
  profiles_updated: 0,
  discovery_queries: 0,
  onchain_refreshes: 0,
};

export function incrementRegistryMetric(name: RegistryMetricName): void {
  counters[name] = (counters[name] || 0) + 1;
}

export function getRegistryMetricsSnapshot(): Record<RegistryMetricName, number> {
  return { ...counters };
}

export function computeFreshnessSnapshot(profiles: AgentProfileResponse[]): {
  staleProfiles: number;
  maxAgeSeconds: number;
  avgAgeSeconds: number;
  totalProfiles: number;
} {
  if (profiles.length === 0) {
    return {
      staleProfiles: 0,
      maxAgeSeconds: 0,
      avgAgeSeconds: 0,
      totalProfiles: 0,
    };
  }

  const now = Date.now();
  const ages = profiles.map((profile) => {
    if (!profile.last_indexed_at) return 0;
    return Math.max(0, Math.floor((now - Date.parse(profile.last_indexed_at)) / 1000));
  });
  const staleProfiles = ages.filter((age) => age > 600).length;
  const maxAgeSeconds = Math.max(...ages);
  const avgAgeSeconds = Math.floor(ages.reduce((sum, age) => sum + age, 0) / ages.length);

  return {
    staleProfiles,
    maxAgeSeconds,
    avgAgeSeconds,
    totalProfiles: profiles.length,
  };
}

export function resetRegistryMetrics(): void {
  for (const key of Object.keys(counters) as RegistryMetricName[]) {
    counters[key] = 0;
  }
}

