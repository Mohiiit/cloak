import { CloakClient } from "@cloak/sdk";
import type { MessageRequest, MessageResponse } from "@/shared/messages";
import { check2FAEnabled, request2FAApproval, normalizeAddress } from "@/shared/two-factor";

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

// ─── Message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, sender, sendResponse) => {
    handleMessage(request, sender)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => {
        // Format user-friendly error messages for common failures
        let errorMsg = err.message || "Unknown error";
        if (errorMsg.includes("starknet_addInvokeTransaction") || errorMsg.includes("TRANSACTION_EXECUTION_ERROR")) {
          errorMsg = "Transaction failed on-chain. If 2FA is enabled, please approve from your mobile device.";
        } else if (errorMsg.includes("is_2fa_enabled") || errorMsg.includes("Contract not found")) {
          errorMsg = "Could not check 2FA status. The account may not be a CloakAccount.";
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

    case "DEPLOY_ACCOUNT":
      return c.deployMultiSigAccount();

    case "IS_DEPLOYED":
      return c.isDeployed();

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

    case "FUND": {
      const acct = c.account(request.token);
      return acct.fund(BigInt(request.amount));
    }

    case "TRANSFER": {
      const acct = c.account(request.token);
      return acct.transfer(request.to, BigInt(request.amount));
    }

    case "WITHDRAW": {
      const acct = c.account(request.token);
      return acct.withdraw(BigInt(request.amount));
    }

    case "ROLLOVER": {
      const acct = c.account(request.token);
      return acct.rollover();
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
    // Pre-check 2FA so the approval popup can show waiting UI
    let is2FA = false;
    try {
      const wallet = await c.getWallet();
      if (wallet) is2FA = await check2FAEnabled(wallet.starkAddress);
    } catch {}

    const approved = await requestApproval(method, { ...params, _is2FA: is2FA }, origin);
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
      const wallet = await c.getWallet();
      if (!wallet) throw new Error("No wallet connected");

      const { calls } = params;
      if (!calls?.length) throw new Error("No calls provided");

      // Check if 2FA is enabled — if so, route through mobile approval
      const is2FA = await check2FAEnabled(wallet.starkAddress);
      if (is2FA) {
        const result = await request2FAApproval({
          walletAddress: wallet.starkAddress,
          action: "invoke",
          token: "STRK",
          amount: null,
          recipient: null,
          callsJson: JSON.stringify(calls.map((c: any) => ({
            contractAddress: c.contractAddress || c.contract_address,
            entrypoint: c.entrypoint || c.entry_point,
            calldata: (c.calldata || []).map((d: any) => d.toString()),
          }))),
          sig1Json: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          onStatusChange: (status) => {
            chrome.runtime.sendMessage({ type: "2FA_STATUS_UPDATE", status }).catch(() => {});
          },
        });
        chrome.runtime.sendMessage({
          type: "2FA_COMPLETE",
          approved: result.approved,
          txHash: result.txHash,
        }).catch(() => {});
        if (result.approved && result.txHash) {
          return { transaction_hash: result.txHash };
        }
        throw new Error(result.error || "Transaction not approved");
      }

      const { Account, RpcProvider } = await import("starknet");
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8",
      });
      const account = new Account({
        provider,
        address: wallet.starkAddress,
        signer: wallet.privateKey,
      });
      const result = await account.execute(calls);
      return { transaction_hash: result.transaction_hash };
    }

    case "wallet_signTypedData": {
      const wallet = await c.getWallet();
      if (!wallet) throw new Error("No wallet connected");

      const { Account, RpcProvider } = await import("starknet");
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8",
      });
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
      const tokenKey = token || "STRK";
      const acct = c.account(tokenKey);

      // Check 2FA — if enabled, build calls + route through mobile approval
      const wallet = await c.getWallet();
      if (wallet && await check2FAEnabled(wallet.starkAddress)) {
        const prepResult = (await acct.prepareFund(BigInt(amount))).calls;
        const serializedCalls = prepResult.map((cl: any) => ({
          contractAddress: cl.contractAddress,
          entrypoint: cl.entrypoint,
          calldata: cl.calldata?.map((d: any) => d.toString()),
        }));
        const result = await request2FAApproval({
          walletAddress: wallet.starkAddress,
          action: "fund",
          token: tokenKey,
          amount: amount?.toString() || null,
          recipient: null,
          callsJson: JSON.stringify(serializedCalls),
          sig1Json: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          onStatusChange: (status) => {
            chrome.runtime.sendMessage({ type: "2FA_STATUS_UPDATE", status }).catch(() => {});
          },
        });
        chrome.runtime.sendMessage({
          type: "2FA_COMPLETE",
          approved: result.approved,
          txHash: result.txHash,
        }).catch(() => {});
        if (result.approved && result.txHash) {
          return { txHash: result.txHash };
        }
        throw new Error(result.error || "Transaction not approved");
      }

      return acct.fund(BigInt(amount));
    }

    case "cloak_transfer": {
      const { token, to, amount } = params;
      const tokenKey = token || "STRK";
      const acct = c.account(tokenKey);

      const wallet = await c.getWallet();
      if (wallet && await check2FAEnabled(wallet.starkAddress)) {
        const prepResult = (await acct.prepareTransfer(to, BigInt(amount))).calls;
        const serializedCalls = prepResult.map((cl: any) => ({
          contractAddress: cl.contractAddress,
          entrypoint: cl.entrypoint,
          calldata: cl.calldata?.map((d: any) => d.toString()),
        }));
        const result = await request2FAApproval({
          walletAddress: wallet.starkAddress,
          action: "transfer",
          token: tokenKey,
          amount: amount?.toString() || null,
          recipient: to,
          callsJson: JSON.stringify(serializedCalls),
          sig1Json: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          onStatusChange: (status) => {
            chrome.runtime.sendMessage({ type: "2FA_STATUS_UPDATE", status }).catch(() => {});
          },
        });
        chrome.runtime.sendMessage({
          type: "2FA_COMPLETE",
          approved: result.approved,
          txHash: result.txHash,
        }).catch(() => {});
        if (result.approved && result.txHash) {
          return { txHash: result.txHash };
        }
        throw new Error(result.error || "Transaction not approved");
      }

      return acct.transfer(to, BigInt(amount));
    }

    case "cloak_withdraw": {
      const { token, amount } = params;
      const tokenKey = token || "STRK";
      const acct = c.account(tokenKey);

      const wallet = await c.getWallet();
      if (wallet && await check2FAEnabled(wallet.starkAddress)) {
        const prepResult = (await acct.prepareWithdraw(BigInt(amount))).calls;
        const serializedCalls = prepResult.map((cl: any) => ({
          contractAddress: cl.contractAddress,
          entrypoint: cl.entrypoint,
          calldata: cl.calldata?.map((d: any) => d.toString()),
        }));
        const result = await request2FAApproval({
          walletAddress: wallet.starkAddress,
          action: "withdraw",
          token: tokenKey,
          amount: amount?.toString() || null,
          recipient: null,
          callsJson: JSON.stringify(serializedCalls),
          sig1Json: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          onStatusChange: (status) => {
            chrome.runtime.sendMessage({ type: "2FA_STATUS_UPDATE", status }).catch(() => {});
          },
        });
        chrome.runtime.sendMessage({
          type: "2FA_COMPLETE",
          approved: result.approved,
          txHash: result.txHash,
        }).catch(() => {});
        if (result.approved && result.txHash) {
          return { txHash: result.txHash };
        }
        throw new Error(result.error || "Transaction not approved");
      }

      return acct.withdraw(BigInt(amount));
    }

    case "cloak_rollover": {
      const { token } = params;
      const tokenKey = token || "STRK";
      const acct = c.account(tokenKey);

      const wallet = await c.getWallet();
      if (wallet && await check2FAEnabled(wallet.starkAddress)) {
        const prepResult = (await acct.prepareRollover()).calls;
        const serializedCalls = prepResult.map((cl: any) => ({
          contractAddress: cl.contractAddress,
          entrypoint: cl.entrypoint,
          calldata: cl.calldata?.map((d: any) => d.toString()),
        }));
        const result = await request2FAApproval({
          walletAddress: wallet.starkAddress,
          action: "rollover",
          token: tokenKey,
          amount: null,
          recipient: null,
          callsJson: JSON.stringify(serializedCalls),
          sig1Json: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          onStatusChange: (status) => {
            chrome.runtime.sendMessage({ type: "2FA_STATUS_UPDATE", status }).catch(() => {});
          },
        });
        chrome.runtime.sendMessage({
          type: "2FA_COMPLETE",
          approved: result.approved,
          txHash: result.txHash,
        }).catch(() => {});
        if (result.approved && result.txHash) {
          return { txHash: result.txHash };
        }
        throw new Error(result.error || "Transaction not approved");
      }

      return acct.rollover();
    }

    case "cloak_getTongoAddress": {
      return c.getTongoAddress();
    }

    default:
      throw new Error(`Unsupported wallet RPC method: ${method}`);
  }
}

console.log("[Cloak] Background service worker initialized");
