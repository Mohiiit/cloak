/**
 * Centralized configuration constants for the Cloak SDK.
 *
 * All shared constants (RPC URLs, class hashes, token addresses) live here.
 * Frontends should import from the SDK instead of duplicating these values.
 */
import type { Network } from "./types";

// ─── RPC Endpoints ───────────────────────────────────────────────────────────

export const DEFAULT_RPC: Record<Network, string> = {
  sepolia:
    "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8",
  mainnet: "https://starknet-mainnet.public.blastapi.io/rpc/v0_9",
};

// ─── Contract Class Hashes ───────────────────────────────────────────────────

export const CLOAK_WARD_CLASS_HASH =
  "0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132";

// ─── Token Addresses ─────────────────────────────────────────────────────────

export const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// ─── Delegation Class Hash ──────────────────────────────────────────────────

export const CLOAK_DELEGATION_CLASS_HASH =
  "0x6ffc7f7ef8b644f82fbcd0ffca170c84412034bd096a26f8b598007e886f81b";

// ─── Delegation Contract Address ────────────────────────────────────────────

export const CLOAK_DELEGATION_ADDRESS =
  "0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10";
