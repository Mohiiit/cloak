import { CloakApiClient } from "./api-client";
import {
  createMarketplaceClient,
  type MarketplaceClient,
} from "./marketplace";
import {
  createShieldedFacilitatorClient,
  type X402FacilitatorClient,
} from "./x402";

export interface MarketplaceSessionOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface MarketplaceSession {
  apiClient: CloakApiClient;
  marketplace: MarketplaceClient;
  x402: X402FacilitatorClient;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function createMarketplaceSession(
  options: MarketplaceSessionOptions,
): MarketplaceSession {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const apiClient = new CloakApiClient(baseUrl, options.apiKey);
  const marketplace = createMarketplaceClient({
    baseUrl: `${baseUrl}/api/v1`,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  });
  const x402 = createShieldedFacilitatorClient({
    baseUrl: `${baseUrl}/api/v1/marketplace/payments/x402`,
    fetchImpl: options.fetchImpl,
  });

  return {
    apiClient,
    marketplace,
    x402,
  };
}

export function createMarketplaceSessionFromApiClient(
  apiClient: CloakApiClient,
  options?: { fetchImpl?: typeof fetch },
): MarketplaceSession {
  const config = apiClient.getConfig();
  return createMarketplaceSession({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    fetchImpl: options?.fetchImpl,
  });
}
