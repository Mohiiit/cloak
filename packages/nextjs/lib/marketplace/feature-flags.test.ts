import { describe, expect, it } from "vitest";
import { getMarketplaceFeatureFlags } from "./feature-flags";

describe("marketplace feature flags", () => {
  it("defaults all marketplace surfaces to enabled", () => {
    const flags = getMarketplaceFeatureFlags({} as NodeJS.ProcessEnv);
    expect(flags).toEqual({
      marketplaceEnabled: true,
      webEnabled: true,
      mobileEnabled: true,
      extensionEnabled: true,
      operatorScopedRuns: true,
      requireBillableRuns: true,
    });
  });

  it("supports disabling marketplace globally", () => {
    const flags = getMarketplaceFeatureFlags({
      CLOAK_MARKETPLACE_ENABLED: "false",
      CLOAK_MARKETPLACE_WEB_ENABLED: "true",
      CLOAK_MARKETPLACE_MOBILE_ENABLED: "true",
      CLOAK_MARKETPLACE_EXTENSION_ENABLED: "true",
      CLOAK_MARKETPLACE_RUNS_OPERATOR_SCOPING: "true",
      CLOAK_MARKETPLACE_REQUIRE_BILLABLE: "true",
    } as NodeJS.ProcessEnv);
    expect(flags).toEqual({
      marketplaceEnabled: false,
      webEnabled: false,
      mobileEnabled: false,
      extensionEnabled: false,
      operatorScopedRuns: false,
      requireBillableRuns: false,
    });
  });

  it("supports per-surface overrides", () => {
    const flags = getMarketplaceFeatureFlags({
      CLOAK_MARKETPLACE_WEB_ENABLED: "false",
      CLOAK_MARKETPLACE_MOBILE_ENABLED: "no",
      CLOAK_MARKETPLACE_EXTENSION_ENABLED: "0",
      CLOAK_MARKETPLACE_RUNS_OPERATOR_SCOPING: "true",
      CLOAK_MARKETPLACE_REQUIRE_BILLABLE: "off",
    } as NodeJS.ProcessEnv);

    expect(flags).toEqual({
      marketplaceEnabled: true,
      webEnabled: false,
      mobileEnabled: false,
      extensionEnabled: false,
      operatorScopedRuns: true,
      requireBillableRuns: false,
    });
  });
});
