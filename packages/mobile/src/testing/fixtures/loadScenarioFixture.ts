type FixtureDomain = "bridgeClient" | "approvalBackend";

type FixtureBundle = {
  bridgeClient: unknown;
  approvalBackend: unknown;
};

const defaultBundle: FixtureBundle = {
  bridgeClient: require("./bridgeClient.json"),
  approvalBackend: require("./approvalBackend.json"),
};

const scenarioRegistry: Record<string, FixtureBundle> = {
  default: defaultBundle,
};

declare global {
  var __CLOAK_E2E_SCENARIO__: string | undefined;
}

let overrideScenario: string | null = null;

function resolveScenarioName(name?: string): string {
  if (name?.trim()) return name.trim();
  if (overrideScenario) return overrideScenario;
  if (globalThis.__CLOAK_E2E_SCENARIO__) return globalThis.__CLOAK_E2E_SCENARIO__;

  const env = (globalThis as any)?.process?.env as
    | Record<string, string | undefined>
    | undefined;
  const envName = env?.CLOAK_E2E_SCENARIO || env?.CLOAK_MOBILE_E2E_SCENARIO;
  if (envName?.trim()) return envName.trim();

  return "default";
}

function getBundle(scenarioName?: string): FixtureBundle {
  const resolved = resolveScenarioName(scenarioName);
  return scenarioRegistry[resolved] || scenarioRegistry.default;
}

export function loadScenarioFixture<T = unknown>(
  name: string,
  domain?: FixtureDomain,
): T {
  const bundle = getBundle(name);
  if (!domain) return bundle as T;
  return bundle[domain] as T;
}

export function loadActiveScenarioFixture<T = unknown>(domain: FixtureDomain): T {
  const bundle = getBundle();
  return bundle[domain] as T;
}

export function setScenarioFixtureForTesting(name: string | null): void {
  overrideScenario = name;
}

