// Service worker polyfill — starknet.js accesses `window` which doesn't exist in MV3 workers
if (typeof window === "undefined") (globalThis as any).window = globalThis;

import { CloakClient, DEFAULT_RPC, TOKENS, parseTokenAmount } from "@cloak-wallet/sdk";
import { Account, RpcProvider } from "starknet";
import type { MessageRequest } from "@/shared/messages";
import { check2FAEnabled } from "@/shared/two-factor";
import { checkIfWardAccount, getWardApprovalNeeds } from "@/shared/ward-approval";
import { routeTransaction, routeRawCalls } from "./transaction-router";

// ─── Chrome Storage Adapter ─────────────────────────────────────────

class ExtensionStorageAdapter {
  async get(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}

// ─── Client singleton ───────────────────────────────────────────────

let client: CloakClient | null = null;

async function getClient(): Promise<CloakClient> {
  if (!client) {
    client = new CloakClient({
      network: "sepolia",
      storage: new ExtensionStorageAdapter(),
    });
    await client.init();
  }
  return client;
}

// ─── Transaction approval system ────────────────────────────────────

/** Methods that require user approval before executing */
const APPROVAL_REQUIRED_METHODS = new Set([
  "cloak_fund",
  "cloak_transfer",
  "cloak_withdraw",
  "cloak_rollover",
  "wallet_addInvokeTransaction",
  "wallet_signTypedData",
]);

interface PendingApproval {
  id: string;
  method: string;
  params?: any;
  origin?: string;
  resolve: (approved: boolean) => void;
}

interface ApprovalFlowHints {
  is2FA: boolean;
  isWard: boolean;
  needsWard2FA: boolean;
  needsGuardian: boolean;
  needsGuardian2FA: boolean;
  shouldWaitForExternalApproval: boolean;
}

let approvalCounter = 0;
let pendingApproval: PendingApproval | null = null;
let approvalWindowId: number | null = null;

function requestApproval(
  method: string,
  params?: any,
  origin?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = String(++approvalCounter);
    pendingApproval = { id, method, params, origin, resolve };

    // Open approval popup window
    const popupUrl = chrome.runtime.getURL("src/popup/approve.html");
    chrome.windows.create(
      {
        url: popupUrl,
        type: "popup",
        width: 400,
        height: 560,
        focused: true,
      },
      (win) => {
        approvalWindowId = win?.id ?? null;
      },
    );

    // If the user closes the window without responding, reject
    const onRemoved = (windowId: number) => {
      if (windowId === approvalWindowId && pendingApproval?.id === id) {
        pendingApproval = null;
        approvalWindowId = null;
        chrome.windows.onRemoved.removeListener(onRemoved);
        resolve(false);
      }
    };
    chrome.windows.onRemoved.addListener(onRemoved);
  });
}

// ─── Status update helper for RPC callers ───────────────────────────

function rpcStatusCallback(status: string) {
  chrome.runtime.sendMessage({ type: "2FA_STATUS_UPDATE", status }).catch(() => {});
}

async function getApprovalFlowHints(
  c: CloakClient,
  method: string,
): Promise<ApprovalFlowHints> {
  const hints: ApprovalFlowHints = {
    is2FA: false,
    isWard: false,
    needsWard2FA: false,
    needsGuardian: false,
    needsGuardian2FA: false,
    shouldWaitForExternalApproval: false,
  };

  // Only transaction methods can require post-approval waiting flows.
  if (!APPROVAL_REQUIRED_METHODS.has(method)) return hints;

  // Message signing currently does not run the async ward/2FA approval pipelines.
  if (method === "wallet_signTypedData") return hints;

  const wallet = await c.getWallet();
  if (!wallet) return hints;

  hints.isWard = await checkIfWardAccount(wallet.starkAddress);
  if (hints.isWard) {
    const wardNeeds = await getWardApprovalNeeds(wallet.starkAddress);
    if (!wardNeeds) return hints;
    hints.needsWard2FA = wardNeeds.wardHas2fa;
    hints.needsGuardian = wardNeeds.needsGuardian;
    hints.needsGuardian2FA = wardNeeds.guardianHas2fa;
    hints.shouldWaitForExternalApproval =
      wardNeeds.wardHas2fa || wardNeeds.needsGuardian || wardNeeds.guardianHas2fa;
    return hints;
  }

  hints.is2FA = await check2FAEnabled(wallet.starkAddress);
  hints.shouldWaitForExternalApproval = hints.is2FA;
  return hints;
}

// ─── Message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, sender, sendResponse) => {
    handleMessage(request, sender)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => {
        // Preserve raw RPC details whenever available so debugging in extension is actionable.
        let errorMsg = err?.message || String(err) || "Unknown error";
        if (err?.cause?.message && !errorMsg.includes(err.cause.message)) {
          errorMsg = `${errorMsg}\nCause: ${err.cause.message}`;
        }
        if (errorMsg.includes("is_2fa_enabled") || errorMsg.includes("Contract not found")) {
          errorMsg = "Could not check 2FA status. The account may not be a CloakAccount.";
        }
        if (request.type === "WALLET_RPC" && APPROVAL_REQUIRED_METHODS.has(request.method)) {
          chrome.runtime.sendMessage({
            type: "2FA_COMPLETE",
            approved: false,
            error: errorMsg,
          }).catch(() => {});
        }
        sendResponse({ success: false, error: errorMsg });
      });
    return true; // Keep channel open for async response
  },
);

async function handleMessage(
  request: MessageRequest,
  sender?: chrome.runtime.MessageSender,
): Promise<any> {
  // ─── Approval popup messages (no client needed) ─────────────
  if (request.type === "GET_PENDING_APPROVAL") {
    if (!pendingApproval) return null;
    return {
      id: pendingApproval.id,
      method: pendingApproval.method,
      params: pendingApproval.params,
      origin: pendingApproval.origin,
    };
  }

  if (request.type === "RESOLVE_APPROVAL") {
    const { id, approved } = request;
    if (pendingApproval && pendingApproval.id === id) {
      const pa = pendingApproval;
      pendingApproval = null;
      approvalWindowId = null;
      pa.resolve(approved);
    }
    return true;
  }

  // ─── All other messages need the client ─────────────────────
  const c = await getClient();

  switch (request.type) {
    case "CREATE_WALLET": {
      const wallet = await c.createWallet();
      await c.init();
      return wallet;
    }

    case "IMPORT_WALLET": {
      const wallet = await c.importWallet(request.privateKey, request.address);
      await c.init();
      return wallet;
    }

    case "GET_WALLET":
      return c.getWallet();

    case "HAS_WALLET":
      return c.hasWallet();

    case "CLEAR_WALLET":
      await c.clearWallet();
      client = null; // Reset singleton
      return true;

    case "DEPLOY_ACCOUNT": {
      // Ward accounts are deployed by their guardian — block self-deploy
      const wallet = await c.getWallet();
      if (wallet) {
        const isWard = await checkIfWardAccount(wallet.starkAddress);
        if (isWard) throw new Error("Ward accounts are deployed by their guardian");
      }
      return c.deployMultiSigAccount();
    }

    case "IS_DEPLOYED":
      return c.isDeployed();

    case "CHECK_WARD": {
      const wallet = await c.getWallet();
      if (!wallet) return false;
      return checkIfWardAccount(wallet.starkAddress);
    }

    case "GET_TONGO_ADDRESS":
      return c.getTongoAddress();

    case "GET_STATE": {
      const acct = c.account(request.token);
      const state = await acct.getState();
      return {
        balance: state.balance.toString(),
        pending: state.pending.toString(),
        nonce: state.nonce.toString(),
      };
    }

    case "GET_ERC20_BALANCE": {
      const acct = c.account(request.token);
      const bal = await acct.getErc20Balance();
      return bal.toString();
    }

    // ─── Transaction handlers — all routed through ward/2FA checks ──
    case "FUND":
      return routeTransaction(c, "fund", request.token, { amount: request.amount });

    case "TRANSFER":
      return routeTransaction(c, "transfer", request.token, { amount: request.amount, recipient: request.to });

    case "WITHDRAW":
      return routeTransaction(c, "withdraw", request.token, { amount: request.amount });

    case "ROLLOVER":
      return routeTransaction(c, "rollover", request.token);

    case "ERC20_TRANSFER": {
      const { token, to, amount } = request;
      const tokenCfg = TOKENS[token];
      const amountWei = parseTokenAmount(amount, tokenCfg.decimals);
      const acct = c.account(token);
      const { calls } = acct.prepareErc20Transfer(to, amountWei);
      const result = await routeRawCalls(c, calls, {
        action: "erc20_transfer",
        token,
        amount,
        recipient: to,
      });
      // saveTransaction + confirmTransaction already handled inside routeRawCalls
      return { txHash: result.transaction_hash };
    }

    case "PREPARE_AND_SIGN": {
      const { token, action, amount, recipient } = request;
      const acct = c.account(token);
      let calls;
      if (action === "fund") {
        calls = (await acct.prepareFund(BigInt(amount!))).calls;
      } else if (action === "transfer") {
        calls = (await acct.prepareTransfer(recipient!, BigInt(amount!))).calls;
      } else if (action === "withdraw") {
        calls = (await acct.prepareWithdraw(BigInt(amount!))).calls;
      } else {
        calls = (await acct.prepareRollover()).calls;
      }
      const result = await acct.prepareAndSign(calls);
      // Serialize calls for message passing (BigInt -> string)
      return {
        calls: result.calls.map((c: any) => ({
          contractAddress: c.contractAddress,
          entrypoint: c.entrypoint,
          calldata: c.calldata?.map((d: any) => d.toString()),
        })),
        txHash: result.txHash,
        sig1: result.sig1,
        nonce: result.nonce,
        resourceBoundsJson: result.resourceBoundsJson,
      };
    }

    case "BUILD_CALLS": {
      const { token, action, amount, recipient } = request;
      const acct = c.account(token);
      let calls;
      if (action === "fund") {
        calls = (await acct.prepareFund(BigInt(amount!))).calls;
      } else if (action === "transfer") {
        calls = (await acct.prepareTransfer(recipient!, BigInt(amount!))).calls;
      } else if (action === "withdraw") {
        calls = (await acct.prepareWithdraw(BigInt(amount!))).calls;
      } else {
        calls = (await acct.prepareRollover()).calls;
      }
      return {
        calls: calls.map((c: any) => ({
          contractAddress: c.contractAddress,
          entrypoint: c.entrypoint,
          calldata: c.calldata?.map((d: any) => d.toString()),
        })),
      };
    }

    case "GET_TX_HISTORY": {
      const acct = c.account("STRK");
      const history = await acct.getTxHistory(request.fromNonce);
      // Serialize BigInt values to strings for message passing
      return (history || []).map((event: any) => ({
        ...event,
        amount: event.amount?.toString(),
      }));
    }

    // ─── Wallet Provider RPC (from injected script via content script) ──
    case "WALLET_RPC": {
      const origin = sender?.tab?.url
        ? new URL(sender.tab.url).origin
        : sender?.origin || "Unknown";
      return handleWalletRpc(c, request.method, request.params, origin);
    }

    default:
      throw new Error(`Unknown message type: ${(request as any).type}`);
  }
}

// ─── Wallet RPC handler for dApp integration ─────────────────────────

async function handleWalletRpc(
  c: CloakClient,
  method: string,
  params?: any,
  origin?: string,
): Promise<any> {
  // ─── Check if this method needs user approval ────────────────
  if (APPROVAL_REQUIRED_METHODS.has(method)) {
    let hints: ApprovalFlowHints = {
      is2FA: false,
      isWard: false,
      needsWard2FA: false,
      needsGuardian: false,
      needsGuardian2FA: false,
      shouldWaitForExternalApproval: false,
    };
    try {
      hints = await getApprovalFlowHints(c, method);
    } catch {}

    const approvalParams = {
      ...(params && typeof params === "object" ? params : { value: params }),
      _approvalFlow: hints,
      // legacy flag kept for compatibility with existing popup code paths
      _is2FA: hints.is2FA,
      _isWard: hints.isWard,
      _needsWard2FA: hints.needsWard2FA,
      _needsGuardian: hints.needsGuardian,
      _needsGuardian2FA: hints.needsGuardian2FA,
      _postApproveWait: hints.shouldWaitForExternalApproval,
    };

    const approved = await requestApproval(method, approvalParams, origin);
    if (!approved) {
      throw new Error("Transaction rejected by user");
    }
  }

  switch (method) {
    // ─── Standard Starknet wallet methods ──────────────────────
    case "wallet_requestAccounts": {
      const wallet = await c.getWallet();
      if (!wallet) return [];
      return [wallet.starkAddress];
    }

    case "wallet_requestChainId":
      return "SN_SEPOLIA";

    case "wallet_getPermissions": {
      const hasWallet = await c.hasWallet();
      return hasWallet ? ["accounts"] : [];
    }

    case "wallet_supportedSpecs":
      return ["0.7"];

    case "wallet_supportedWalletApi":
      return ["0.7.2"];

    case "wallet_addInvokeTransaction": {
      const { calls } = params;
      if (!calls?.length) throw new Error("No calls provided");
      return routeRawCalls(c, calls, { onStatusChange: rpcStatusCallback });
    }

    case "wallet_signTypedData": {
      const wallet = await c.getWallet();
      if (!wallet) throw new Error("No wallet connected");

      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const account = new Account({
        provider,
        address: wallet.starkAddress,
        signer: wallet.privateKey,
      });
      const signature = await account.signMessage(params);
      return signature;
    }

    // ─── Custom Cloak privacy methods ──────────────────────────
    case "cloak_getShieldedState": {
      const { token } = params;
      const acct = c.account(token || "STRK");
      const state = await acct.getState();
      return {
        balance: state.balance.toString(),
        pending: state.pending.toString(),
        nonce: state.nonce.toString(),
      };
    }

    case "cloak_fund": {
      const { token, amount } = params;
      return routeTransaction(c, "fund", token || "STRK", {
        amount,
        onStatusChange: rpcStatusCallback,
      });
    }

    case "cloak_transfer": {
      const { token, to, amount } = params;
      return routeTransaction(c, "transfer", token || "STRK", {
        amount,
        recipient: to,
        onStatusChange: rpcStatusCallback,
      });
    }

    case "cloak_withdraw": {
      const { token, amount } = params;
      return routeTransaction(c, "withdraw", token || "STRK", {
        amount,
        onStatusChange: rpcStatusCallback,
      });
    }

    case "cloak_rollover": {
      const { token } = params;
      return routeTransaction(c, "rollover", token || "STRK", {
        onStatusChange: rpcStatusCallback,
      });
    }

    case "cloak_getTongoAddress": {
      return c.getTongoAddress();
    }

    default:
      throw new Error(`Unsupported wallet RPC method: ${method}`);
  }
}

console.log("[Cloak] Background service worker initialized");
