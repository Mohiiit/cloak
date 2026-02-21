import { RpcProvider, constants } from "starknet";
import { StarknetIdNavigator } from "starknetid.js";
import { DEFAULT_RPC } from "./config";
import type { Network } from "./types";

export interface StarknetProfile {
  name: string;
  profilePicture?: string;
  twitter?: string;
  github?: string;
  discord?: string;
  proofOfPersonhood?: boolean;
}

export interface StarknetIdClientOptions {
  network?: Network;
  rpcUrl?: string;
  provider?: RpcProvider;
}

export function isStarkName(value: string): boolean {
  return /^[a-z0-9-]+\.stark$/i.test(value.trim());
}

export function normalizeStarkName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return trimmed;
  return trimmed.endsWith(".stark") ? trimmed : `${trimmed}.stark`;
}

function toChainId(network: Network): constants.StarknetChainId {
  return network === "mainnet"
    ? constants.StarknetChainId.SN_MAIN
    : constants.StarknetChainId.SN_SEPOLIA;
}

function normalizeHexAddress(address: string): string {
  const lower = address.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  return `0x${lower.slice(2).padStart(64, "0")}`;
}

export class StarknetIdClient {
  private readonly navigator: StarknetIdNavigator;

  constructor(options: StarknetIdClientOptions = {}) {
    const network = options.network ?? "sepolia";
    const provider =
      options.provider ??
      new RpcProvider({
        nodeUrl: options.rpcUrl ?? DEFAULT_RPC[network],
      });
    this.navigator = new StarknetIdNavigator(provider, toChainId(network));
  }

  async resolveAddress(name: string): Promise<string | null> {
    try {
      const address = await this.navigator.getAddressFromStarkName(
        normalizeStarkName(name),
      );
      if (!address) return null;
      return normalizeHexAddress(address);
    } catch {
      return null;
    }
  }

  async resolveName(address: string): Promise<string | null> {
    try {
      const name = await this.navigator.getStarkName(normalizeHexAddress(address));
      if (!name) return null;
      return normalizeStarkName(name);
    } catch {
      return null;
    }
  }

  async resolveNames(addresses: string[]): Promise<Record<string, string | null>> {
    const names = await this.navigator.getStarkNames(
      addresses.map(normalizeHexAddress),
    );
    return addresses.reduce<Record<string, string | null>>((acc, addr, idx) => {
      const value = names[idx];
      acc[addr] = value ? normalizeStarkName(value) : null;
      return acc;
    }, {});
  }

  async getProfile(address: string): Promise<StarknetProfile | null> {
    try {
      const profile = await this.navigator.getProfileData(normalizeHexAddress(address));
      if (!profile) return null;
      const result: StarknetProfile = {
        name: profile.name ?? "",
        profilePicture: profile.profilePicture ?? undefined,
        twitter: profile.twitter ?? undefined,
        github: profile.github ?? undefined,
        discord: profile.discord ?? undefined,
        proofOfPersonhood: profile.proofOfPersonhood ?? undefined,
      };
      return result.name ? result : null;
    } catch {
      return null;
    }
  }

  async getProfiles(
    addresses: string[],
  ): Promise<Record<string, StarknetProfile | null>> {
    const profiles = await this.navigator.getStarkProfiles(
      addresses.map(normalizeHexAddress),
    );

    return addresses.reduce<Record<string, StarknetProfile | null>>(
      (acc, addr, idx) => {
        const profile = profiles[idx];
        if (!profile || !profile.name) {
          acc[addr] = null;
          return acc;
        }
        acc[addr] = {
          name: profile.name,
          profilePicture: profile.profilePicture ?? undefined,
          twitter: profile.twitter ?? undefined,
          github: profile.github ?? undefined,
          discord: profile.discord ?? undefined,
          proofOfPersonhood: profile.proofOfPersonhood ?? undefined,
        };
        return acc;
      },
      {},
    );
  }
}
