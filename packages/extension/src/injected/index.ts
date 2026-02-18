/**
 * Injected script — runs in PAGE context.
 * Creates window.starknet_cloak implementing StarknetWindowObject
 * for standard get-starknet wallet discovery.
 */

// ─── Types ───────────────────────────────────────────────────────────

interface RpcCall {
  type: string;
  params?: any;
}

type EventHandler = (...args: any[]) => void;

interface StarknetWindowObject {
  id: string;
  name: string;
  version: string;
  icon: string;
  isConnected: boolean;
  selectedAddress: string;
  chainId: string;
  account: any;
  provider: any;
  request(call: RpcCall): Promise<any>;
  enable(options?: { starknetVersion?: string }): Promise<string[]>;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  isPreauthorized(): Promise<boolean>;
}

// ─── Icon (inline SVG as data URI) ──────────────────────────────────

const CLOAK_ICON = `data:image/svg+xml;base64,${btoa(`<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs><rect width="96" height="96" rx="24" fill="url(#bg)"/><g transform="translate(22,22) scale(2.1667)"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`)}`;

// ─── Message helpers ─────────────────────────────────────────────────

let requestId = 0;
const pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function sendToContentScript(method: string, params?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });
    window.postMessage(
      { source: "cloak-injected", id, method, params },
      "*",
    );

    // Timeout after 2 minutes
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Cloak wallet request timed out: ${method}`));
      }
    }, 120_000);
  });
}

// Listen for responses from content script
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "cloak-content") return;

  const { id, result, error } = event.data;
  const pending = pendingRequests.get(id);
  if (!pending) return;

  pendingRequests.delete(id);
  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(result);
  }
});

// ─── Event emitter ───────────────────────────────────────────────────

const eventListeners: Record<string, Set<EventHandler>> = {
  accountsChanged: new Set(),
  networkChanged: new Set(),
};

function emit(event: string, data: any) {
  eventListeners[event]?.forEach((handler) => {
    try { handler(data); } catch { /* ignore listener errors */ }
  });
}

// ─── StarknetWindowObject ────────────────────────────────────────────

const cloakWallet: StarknetWindowObject = {
  id: "cloak",
  name: "Cloak Wallet",
  version: "0.1.0",
  icon: CLOAK_ICON,
  isConnected: false,
  selectedAddress: "",
  chainId: "SN_SEPOLIA",
  account: undefined,
  provider: undefined,

  async request(call: RpcCall): Promise<any> {
    const { type, params } = call;

    switch (type) {
      // ─── Standard Starknet wallet RPC ────────────────────────
      case "wallet_requestAccounts": {
        const accounts = await sendToContentScript("wallet_requestAccounts");
        if (accounts?.length) {
          cloakWallet.isConnected = true;
          cloakWallet.selectedAddress = accounts[0];
          emit("accountsChanged", accounts);
        }
        return accounts;
      }

      case "wallet_requestChainId":
        return cloakWallet.chainId;

      case "wallet_getPermissions":
        return cloakWallet.isConnected ? ["accounts"] : [];

      case "wallet_supportedSpecs":
        return ["0.7"];

      case "wallet_supportedWalletApi":
        return ["0.7.2"];

      case "wallet_addInvokeTransaction":
        return sendToContentScript("wallet_addInvokeTransaction", params);

      case "wallet_signTypedData":
        return sendToContentScript("wallet_signTypedData", params);

      case "wallet_switchStarknetChain":
        return sendToContentScript("wallet_switchStarknetChain", params);

      case "wallet_watchAsset":
        return sendToContentScript("wallet_watchAsset", params);

      // ─── Custom Cloak privacy RPC ────────────────────────────
      case "cloak_getShieldedState":
        return sendToContentScript("cloak_getShieldedState", params);

      case "cloak_fund":
        return sendToContentScript("cloak_fund", params);

      case "cloak_transfer":
        return sendToContentScript("cloak_transfer", params);

      case "cloak_withdraw":
        return sendToContentScript("cloak_withdraw", params);

      case "cloak_rollover":
        return sendToContentScript("cloak_rollover", params);

      case "cloak_getTongoAddress":
        return sendToContentScript("cloak_getTongoAddress");

      default:
        throw new Error(`Cloak: unsupported RPC method "${type}"`);
    }
  },

  async enable(_options?: { starknetVersion?: string }): Promise<string[]> {
    const accounts = await cloakWallet.request({ type: "wallet_requestAccounts" });
    return accounts;
  },

  on(event: string, handler: EventHandler) {
    if (eventListeners[event]) {
      eventListeners[event].add(handler);
    }
  },

  off(event: string, handler: EventHandler) {
    eventListeners[event]?.delete(handler);
  },

  async isPreauthorized(): Promise<boolean> {
    return cloakWallet.isConnected;
  },
};

// ─── Expose on window ────────────────────────────────────────────────

(window as any).starknet_cloak = cloakWallet;

// ─── Announce for get-starknet discovery ─────────────────────────────

window.dispatchEvent(
  new CustomEvent("wallet:register", {
    detail: {
      id: "cloak",
      name: "Cloak Wallet",
      version: "0.1.0",
      icon: CLOAK_ICON,
    },
  }),
);

// Also handle the requestWallet event from get-starknet
window.addEventListener("wallet:request", () => {
  window.dispatchEvent(
    new CustomEvent("wallet:register", {
      detail: {
        id: "cloak",
        name: "Cloak Wallet",
        version: "0.1.0",
        icon: CLOAK_ICON,
      },
    }),
  );
});

console.log("[Cloak] Wallet provider injected");
