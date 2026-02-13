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

const CLOAK_ICON = `data:image/svg+xml;base64,${btoa(`<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="cg" x1="128" y1="48" x2="384" y2="464" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#60A5FA"/><stop offset="50%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient></defs><path d="M256 52C220 52 186 72 164 104L96 208C80 232 72 260 72 290L72 360C72 380 80 398 96 410L144 448C152 454 162 456 172 454L196 444C204 442 210 436 214 428L232 384C240 368 256 360 256 360C256 360 272 368 280 384L298 428C302 436 308 442 316 444L340 454C350 456 360 454 368 448L416 410C432 398 440 380 440 360L440 290C440 260 432 232 416 208L348 104C326 72 292 52 256 52Z" fill="url(#cg)"/><path d="M256 180L296 256L256 340L216 256Z" fill="#0F172A" opacity="0.85"/></svg>`)}`;

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
