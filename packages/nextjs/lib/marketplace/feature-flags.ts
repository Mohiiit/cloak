function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export interface MarketplaceFeatureFlags {
  marketplaceEnabled: boolean;
  webEnabled: boolean;
  mobileEnabled: boolean;
  extensionEnabled: boolean;
  operatorScopedRuns: boolean;
  requireBillableRuns: boolean;
}

export function getMarketplaceFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): MarketplaceFeatureFlags {
  const marketplaceEnabled = parseBoolean(env.CLOAK_MARKETPLACE_ENABLED, true);
  return {
    marketplaceEnabled,
    webEnabled: marketplaceEnabled && parseBoolean(env.CLOAK_MARKETPLACE_WEB_ENABLED, true),
    mobileEnabled:
      marketplaceEnabled && parseBoolean(env.CLOAK_MARKETPLACE_MOBILE_ENABLED, true),
    extensionEnabled:
      marketplaceEnabled && parseBoolean(env.CLOAK_MARKETPLACE_EXTENSION_ENABLED, true),
    operatorScopedRuns:
      marketplaceEnabled &&
      parseBoolean(env.CLOAK_MARKETPLACE_RUNS_OPERATOR_SCOPING, true),
    requireBillableRuns:
      marketplaceEnabled && parseBoolean(env.CLOAK_MARKETPLACE_REQUIRE_BILLABLE, true),
  };
}
