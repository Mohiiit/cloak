import type { TokenKey, WalletInfo, ShieldedState } from "@cloak/sdk";

// ─── Request types (popup → background) ────────────────────────────

export type MessageRequest =
  | { type: "CREATE_WALLET" }
  | { type: "IMPORT_WALLET"; privateKey: string; address?: string }
  | { type: "GET_WALLET" }
  | { type: "HAS_WALLET" }
  | { type: "CLEAR_WALLET" }
  | { type: "DEPLOY_ACCOUNT" }
  | { type: "IS_DEPLOYED" }
  | { type: "GET_TONGO_ADDRESS" }
  | { type: "GET_STATE"; token: TokenKey }
  | { type: "GET_ERC20_BALANCE"; token: TokenKey }
  | { type: "FUND"; token: TokenKey; amount: string }
  | { type: "TRANSFER"; token: TokenKey; to: string; amount: string }
  | { type: "WITHDRAW"; token: TokenKey; amount: string }
  | { type: "ROLLOVER"; token: TokenKey }
  | { type: "PREPARE_AND_SIGN"; token: TokenKey; action: string; amount?: string; recipient?: string }
  | { type: "BUILD_CALLS"; token: TokenKey; action: string; amount?: string; recipient?: string }
  | { type: "GET_TX_HISTORY"; fromNonce: number }
  | { type: "WALLET_RPC"; method: string; params?: any }
  // ─── Approval popup messages ────────────────────────────────────
  | { type: "GET_PENDING_APPROVAL" }
  | { type: "RESOLVE_APPROVAL"; id: string; approved: boolean };

// ─── Response types (background → popup) ────────────────────────────

export type MessageResponse =
  | { success: true; data: any }
  | { success: false; error: string };

// ─── Helper to send messages from popup to background ───────────────

export async function sendMessage(request: MessageRequest): Promise<any> {
  const response: MessageResponse = await chrome.runtime.sendMessage(request);
  if (!response.success) {
    throw new Error(response.error);
  }
  return response.data;
}
