export type RuntimeMode = "prod" | "e2e-mock" | "e2e-live";
export type NetworkMode = "mock" | "live";

const DEFAULT_MODE: RuntimeMode = "prod";
const VALID_MODES: RuntimeMode[] = ["prod", "e2e-mock", "e2e-live"];
const DEFAULT_NETWORK_MODE: NetworkMode = "live";
const VALID_NETWORK_MODES: NetworkMode[] = ["mock", "live"];

declare global {
  var __CLOAK_RUNTIME_MODE__: RuntimeMode | string | undefined;
  var __CLOAK_NETWORK_MODE__: NetworkMode | string | undefined;
}

let cachedMode: RuntimeMode | null = null;
let cachedNetworkMode: NetworkMode | null = null;

type NativeRuntimeConfig = {
  applicationId?: string;
  runtimeMode?: string;
  networkMode?: string;
};

function readNativeRuntimeConfig(): NativeRuntimeConfig {
  try {
    const reactNative = require("react-native");
    const nativeModules = reactNative?.NativeModules ?? {};
    const cfg = nativeModules?.CloakRuntimeConfig;
    if (cfg && typeof cfg === "object") {
      return {
        applicationId:
          typeof cfg.applicationId === "string" ? cfg.applicationId : undefined,
        runtimeMode:
          typeof cfg.runtimeMode === "string" ? cfg.runtimeMode : undefined,
        networkMode:
          typeof cfg.networkMode === "string" ? cfg.networkMode : undefined,
      };
    }
  } catch {
    // Ignore and fall through to defaults.
  }
  return {};
}

function readNativeBundleIdentifier(): string | undefined {
  try {
    const reactNative = require("react-native");
    const nativeModules = reactNative?.NativeModules ?? {};
    const nativeConfig = readNativeRuntimeConfig();
    if (nativeConfig.applicationId) return nativeConfig.applicationId;
    return (
      nativeModules?.PlatformConstants?.BundleIdentifier ||
      nativeModules?.PlatformConstants?.bundleIdentifier ||
      nativeModules?.PlatformConstants?.applicationId ||
      nativeModules?.AppInfo?.bundleId ||
      nativeModules?.AppInfo?.packageName
    );
  } catch {
    return undefined;
  }
}

function normalizeMode(value?: string | null): RuntimeMode {
  if (!value) return DEFAULT_MODE;
  const normalized = value.trim().toLowerCase() as RuntimeMode;
  if (VALID_MODES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_MODE;
}

function readRuntimeMode(): RuntimeMode {
  const globalMode =
    typeof globalThis !== "undefined"
      ? globalThis.__CLOAK_RUNTIME_MODE__
      : undefined;

  if (globalMode) {
    return normalizeMode(String(globalMode));
  }

  const nativeMode = readNativeRuntimeConfig().runtimeMode;
  if (nativeMode) {
    return normalizeMode(nativeMode);
  }

  const env = (globalThis as any)?.process?.env as
    | Record<string, string | undefined>
    | undefined;
  const envMode =
    env?.CLOAK_RUNTIME_MODE ||
    env?.CLOAK_MOBILE_RUNTIME_MODE ||
    env?.EXPO_PUBLIC_CLOAK_RUNTIME_MODE;
  if (envMode) return normalizeMode(envMode);

  const bundleId = readNativeBundleIdentifier();
  if (bundleId?.endsWith(".e2e")) {
    return "e2e-mock";
  }

  return DEFAULT_MODE;
}

function normalizeNetworkMode(value?: string | null): NetworkMode {
  if (!value) return DEFAULT_NETWORK_MODE;
  const normalized = value.trim().toLowerCase() as NetworkMode;
  if (VALID_NETWORK_MODES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_NETWORK_MODE;
}

function readNetworkMode(): NetworkMode {
  const globalMode =
    typeof globalThis !== "undefined"
      ? globalThis.__CLOAK_NETWORK_MODE__
      : undefined;
  if (globalMode) {
    return normalizeNetworkMode(String(globalMode));
  }

  const nativeMode = readNativeRuntimeConfig().networkMode;
  if (nativeMode) {
    return normalizeNetworkMode(nativeMode);
  }

  const env = (globalThis as any)?.process?.env as
    | Record<string, string | undefined>
    | undefined;

  const envMode =
    env?.CLOAK_NETWORK_MODE || env?.CLOAK_MOBILE_NETWORK_MODE;
  if (envMode) return normalizeNetworkMode(envMode);

  const bundleId = readNativeBundleIdentifier();
  if (bundleId?.endsWith(".e2e")) {
    return "mock";
  }

  return getRuntimeMode() === "e2e-mock" ? "mock" : "live";
}

export function getRuntimeMode(): RuntimeMode {
  if (!cachedMode) {
    cachedMode = readRuntimeMode();
  }
  return cachedMode;
}

export function getNetworkMode(): NetworkMode {
  if (!cachedNetworkMode) {
    cachedNetworkMode = readNetworkMode();
  }
  return cachedNetworkMode;
}

export function isE2E(): boolean {
  return getRuntimeMode() !== "prod";
}

export function isMockMode(): boolean {
  return getNetworkMode() === "mock";
}

export function isLiveMode(): boolean {
  return getNetworkMode() === "live";
}

// Useful for tests that need to switch mode during one process.
export function setRuntimeModeForTesting(mode: RuntimeMode | null): void {
  cachedMode = mode;
  cachedNetworkMode = null;
}

export function setNetworkModeForTesting(mode: NetworkMode | null): void {
  cachedNetworkMode = mode;
}
