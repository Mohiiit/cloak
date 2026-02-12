import { CloakClient } from "@cloak/sdk";
import type { MessageRequest, MessageResponse } from "@/shared/messages";

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

// ─── Message handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, _sender, sendResponse) => {
    handleMessage(request)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  },
);

async function handleMessage(request: MessageRequest): Promise<any> {
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
      return c.deployAccount();

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

    default:
      throw new Error(`Unknown message type: ${(request as any).type}`);
  }
}

console.log("[Cloak] Background service worker initialized");
