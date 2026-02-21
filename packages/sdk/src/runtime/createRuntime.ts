import { RpcProvider } from "starknet";
import { DEFAULT_RPC, DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL } from "../config";
import { MemoryStorage } from "../storage/memory";
import { SupabaseLite } from "../supabase";
import { request2FAApproval } from "../two-factor";
import {
  checkIfWardAccount,
  fetchWardApprovalNeeds,
  fetchWardInfo,
  getBlockGasPrices,
  estimateWardInvokeFee,
  requestWardApproval,
} from "../ward";
import {
  saveTransaction,
  updateTransactionStatus,
  getTransactions,
  confirmTransaction,
} from "../transactions";
import type {
  CloakRuntime,
  CloakRuntimeConfig,
  CloakRuntimeDeps,
  RuntimeLogger,
} from "./types";

const NOOP_LOGGER: RuntimeLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function resolveProvider(config: CloakRuntimeConfig): RpcProvider {
  if (config.provider) return config.provider;
  const network = config.network ?? "sepolia";
  const rpcUrl = config.rpcUrl ?? DEFAULT_RPC[network];
  return new RpcProvider({ nodeUrl: rpcUrl });
}

function resolveSupabase(config: CloakRuntimeConfig): SupabaseLite {
  if (config.supabase) return config.supabase;
  const url = config.supabaseUrl ?? DEFAULT_SUPABASE_URL;
  const key = config.supabaseKey ?? DEFAULT_SUPABASE_KEY;
  return new SupabaseLite(url, key);
}

export function createCloakRuntime(config: CloakRuntimeConfig = {}): CloakRuntime {
  const network = config.network ?? "sepolia";

  const deps: CloakRuntimeDeps = Object.freeze({
    provider: resolveProvider(config),
    supabase: resolveSupabase(config),
    storage: config.storage ?? new MemoryStorage(),
    logger: config.logger ?? NOOP_LOGGER,
    now: config.now ?? (() => Date.now()),
  });

  return {
    config: Object.freeze({
      network,
      flags: Object.freeze({ ...(config.flags ?? {}) }),
    }),
    deps,
    policy: {
      getWardApprovalNeeds(wardAddress: string) {
        return fetchWardApprovalNeeds(deps.provider, wardAddress);
      },
      getWardInfo(wardAddress: string) {
        return fetchWardInfo(deps.provider, wardAddress);
      },
    },
    approvals: {
      request2FAApproval(params, onStatusChange, signal) {
        return request2FAApproval(deps.supabase, params, onStatusChange, signal);
      },
      requestWardApproval(params, onStatusChange, signal, options) {
        return requestWardApproval(
          deps.supabase,
          params,
          onStatusChange,
          signal,
          options,
        );
      },
    },
    transactions: {
      save(record) {
        return saveTransaction(record, deps.supabase);
      },
      updateStatus(txHash, status, errorMessage, fee) {
        return updateTransactionStatus(
          txHash,
          status,
          errorMessage,
          fee,
          deps.supabase,
        );
      },
      listByWallet(walletAddress, limit) {
        return getTransactions(walletAddress, limit, deps.supabase);
      },
      confirm(txHash) {
        return confirmTransaction(deps.provider, txHash, deps.supabase);
      },
    },
    ward: {
      checkIfWardAccount(address) {
        return checkIfWardAccount(deps.provider, address);
      },
      fetchApprovalNeeds(wardAddress) {
        return fetchWardApprovalNeeds(deps.provider, wardAddress);
      },
      fetchInfo(wardAddress) {
        return fetchWardInfo(deps.provider, wardAddress);
      },
      getBlockGasPrices() {
        return getBlockGasPrices(deps.provider);
      },
      estimateInvokeFee(senderAddress, calls) {
        return estimateWardInvokeFee(deps.provider, senderAddress, calls);
      },
    },
  };
}
