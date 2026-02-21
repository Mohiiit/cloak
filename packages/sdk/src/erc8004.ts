import { RpcProvider, num } from "starknet";
import { DEFAULT_RPC } from "./config";
import type { Network } from "./types";

export type ERC8004RegistryType = "identity" | "reputation" | "validation";

export interface ERC8004RegistrySet {
  identity: string;
  reputation: string;
  validation: string;
}

export interface ERC8004ClientOptions {
  network?: Network;
  rpcUrl?: string;
  provider?: RpcProvider;
}

/**
 * Registry addresses sourced from Cloak privacy infra research notes.
 */
export const ERC8004_REGISTRIES: Record<Network, ERC8004RegistrySet> = {
  mainnet: {
    identity:
      "0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595",
    reputation:
      "0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944",
    validation:
      "0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83",
  },
  sepolia: {
    identity:
      "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631",
    reputation:
      "0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e",
    validation:
      "0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f",
  },
};

export function getERC8004Registries(network: Network): ERC8004RegistrySet {
  return ERC8004_REGISTRIES[network];
}

export function getERC8004RegistryAddress(
  network: Network,
  registry: ERC8004RegistryType,
): string {
  return ERC8004_REGISTRIES[network][registry];
}

export class ERC8004Client {
  private readonly provider: RpcProvider;
  private readonly network: Network;

  constructor(options: ERC8004ClientOptions = {}) {
    this.network = options.network ?? "sepolia";
    this.provider =
      options.provider ??
      new RpcProvider({
        nodeUrl: options.rpcUrl ?? DEFAULT_RPC[this.network],
      });
  }

  getRegistryAddress(registry: ERC8004RegistryType): string {
    return getERC8004RegistryAddress(this.network, registry);
  }

  async call(
    registry: ERC8004RegistryType,
    entrypoint: string,
    calldata: Array<string | bigint | number> = [],
  ): Promise<string[]> {
    return this.provider.callContract({
      contractAddress: this.getRegistryAddress(registry),
      entrypoint,
      calldata: calldata.map((value) => num.toHex(value)),
    });
  }

  /**
   * Default Identity Registry wrapper.
   * Override `entrypoint` if your deployed ABI uses a different name.
   */
  async ownerOf(
    agentId: string | bigint | number,
    entrypoint = "owner_of",
  ): Promise<string | null> {
    try {
      const res = await this.call("identity", entrypoint, [agentId]);
      return res[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Default Identity Registry wrapper.
   * Override `entrypoint` if your deployed ABI uses a different name.
   */
  async tokenUri(
    agentId: string | bigint | number,
    entrypoint = "token_uri",
  ): Promise<string | null> {
    try {
      const res = await this.call("identity", entrypoint, [agentId]);
      return res[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Generic summary reader for reputation/validation contracts.
   * Useful while ABI variants are still being finalized across deployments.
   */
  async getSummary(
    registry: "reputation" | "validation",
    agentIdOrAddress: string | bigint | number,
    entrypoint = "get_summary",
  ): Promise<string[] | null> {
    try {
      return await this.call(registry, entrypoint, [agentIdOrAddress]);
    } catch {
      return null;
    }
  }
}
