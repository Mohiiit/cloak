import { RpcProvider } from "starknet";
import { DEFAULT_RPC, DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL } from "../config";
import { MemoryStorage } from "../storage/memory";
import { SupabaseLite } from "../supabase";
import { convertAmount } from "../token-convert";
import {
  checkIfWardAccount,
  fetchWardApprovalNeeds,
  fetchWardInfo,
  getBlockGasPrices,
  estimateWardInvokeFee,
} from "../ward";
import {
  fetchWardPolicySnapshot,
  evaluateWardExecutionPolicy,
  orchestrateExecution,
} from "../router";
import {
  saveTransaction,
} from "../transactions";
import {
  ApprovalsRepository,
  SwapsRepository,
  TransactionsRepository,
} from "../repositories";
import {
  createAvnuSwapAdapter,
  createSwapModule,
  executeComposedShieldedSwap,
  executeShieldedSwap,
} from "../swaps";
import type {
  CloakRuntime,
  CloakRuntimeConfig,
  CloakRuntimeDeps,
  RuntimeLogger,
  CloakRuntimeSwapsModule,
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
  const approvalsRepo = new ApprovalsRepository(deps.supabase);
  const transactionsRepo = new TransactionsRepository(
    deps.supabase,
    deps.provider,
  );
  const swapsRepo = new SwapsRepository(deps.supabase);
  const avnuAdapter = createAvnuSwapAdapter({ network });
  const runtimeSwapAdapter = config.swapsAdapter ?? {
    quote: avnuAdapter.quote,
    build: avnuAdapter.build,
    execute: (input: Parameters<typeof executeShieldedSwap>[1]) =>
      executeShieldedSwap(
        {
          getWardPolicySnapshot: (wardAddress) => policyModule.getWardPolicySnapshot(wardAddress),
          evaluateWardExecutionPolicy: (wardAddress, calls) =>
            policyModule.evaluateWardExecutionPolicy(wardAddress, calls),
          saveTransaction: (record) => transactionsRepo.save(record),
          confirmTransaction: (txHash) => transactionsRepo.confirm(txHash),
          network,
        },
        input,
      ).then(async (result) => {
        const sellAmountWei = convertAmount(
          {
            value: input.plan.sellAmount.value,
            unit: input.plan.sellAmount.unit,
            token: input.plan.pair.sellToken,
          },
          "erc20_wei",
        );
        await swapsRepo.save({
          wallet_address: input.walletAddress,
          ward_address: input.wardAddress || null,
          tx_hash: result.txHash,
          provider: input.plan.provider,
          sell_token: input.plan.pair.sellToken,
          buy_token: input.plan.pair.buyToken,
          sell_amount_wei: sellAmountWei,
          estimated_buy_amount_wei: input.plan.estimatedBuyAmountWei,
          min_buy_amount_wei: input.plan.minBuyAmountWei,
          buy_actual_amount_wei: null,
          status: "pending",
          error_message: null,
        });
        return result;
      }),
  };
  const baseSwapsModule = createSwapModule(runtimeSwapAdapter);
  const swapsModule: CloakRuntimeSwapsModule = {
    quote(params) {
      return baseSwapsModule.quote(params);
    },
    build(params) {
      return baseSwapsModule.build(params);
    },
    execute(params) {
      return baseSwapsModule.execute(params);
    },
    executeComposed(params) {
      return executeComposedShieldedSwap(baseSwapsModule, params);
    },
  };
  const policyModule = {
    getWardPolicySnapshot(wardAddress: string) {
      return fetchWardPolicySnapshot(deps.provider, wardAddress);
    },
    async evaluateWardExecutionPolicy(wardAddress: string, calls: any[]) {
      const snapshot = await fetchWardPolicySnapshot(deps.provider, wardAddress);
      if (!snapshot) return null;
      return evaluateWardExecutionPolicy(snapshot, calls);
    },
    getWardApprovalNeeds(wardAddress: string) {
      return fetchWardApprovalNeeds(deps.provider, wardAddress);
    },
    getWardInfo(wardAddress: string) {
      return fetchWardInfo(deps.provider, wardAddress);
    },
  };

  return {
    config: Object.freeze({
      network,
      flags: Object.freeze({ ...(config.flags ?? {}) }),
    }),
    deps,
    repositories: {
      approvals: approvalsRepo,
      transactions: transactionsRepo,
      swaps: swapsRepo,
    },
    router: {
      execute(input) {
        return orchestrateExecution(
          {
            getWardPolicySnapshot: policyModule.getWardPolicySnapshot,
            evaluateWardExecutionPolicy: policyModule.evaluateWardExecutionPolicy,
            saveTransaction: (record) => transactionsRepo.save(record),
            confirmTransaction: (txHash) => transactionsRepo.confirm(txHash),
          },
          input,
        );
      },
    },
    policy: policyModule,
    approvals: {
      request2FAApproval(params, onStatusChange, signal) {
        return approvalsRepo.requestTwoFactor(params, {
          onStatusChange,
          signal,
        });
      },
      requestWardApproval(params, onStatusChange, signal, options) {
        return approvalsRepo.requestWard(params, {
          onStatusChange,
          signal,
          requestOptions: options,
        });
      },
    },
    transactions: {
      save(record) {
        return transactionsRepo.save(record);
      },
      saveLegacy(record) {
        return saveTransaction(record, deps.supabase);
      },
      updateStatus(txHash, status, errorMessage, fee) {
        return transactionsRepo.updateStatus(txHash, status, errorMessage, fee);
      },
      listByWallet(walletAddress, limit) {
        return transactionsRepo.listByWallet(walletAddress, limit);
      },
      confirm(txHash) {
        return transactionsRepo.confirm(txHash);
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
    swaps: swapsModule,
  };
}
