/**
 * RealtimeContext — Supabase Realtime push subscriptions.
 *
 * Replaces the polling loops in TwoFactorContext and WardContext with
 * WebSocket-based push via Supabase Realtime `postgres_changes`.
 *
 * Three channel subscriptions (replacing three polling loops):
 *   1. approval_requests filtered by wallet_address (for 2FA)
 *   2. ward_approval_requests filtered by ward_address (ward signing)
 *   3. ward_approval_requests filtered by guardian_address (guardian signing)
 *
 * On each INSERT/UPDATE event the state arrays are updated instantly.
 * A full HTTP re-fetch happens on mount and on AppState foreground to
 * reconcile any events missed while the app was backgrounded.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  normalizeAddress,
} from "@cloak-wallet/sdk";
import type { ApprovalRequest } from "./twoFactor";
import type { WardApprovalRequest } from "./wardContext";
import { useWallet } from "./WalletContext";
import { fetchPendingRequests } from "./twoFactor";
import { getApiClient, invalidateApiKey } from "./apiClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RealtimeContextValue {
  /** Pending 2FA approval requests for this wallet. */
  pendingTwoFactor: ApprovalRequest[];
  /** Ward-approval requests awaiting ward signature. */
  pendingWardSigning: WardApprovalRequest[];
  /** Ward-approval requests awaiting guardian signature. */
  pendingGuardianSigning: WardApprovalRequest[];
  /** Manual refresh (initial load + fallback). */
  refresh: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let supabaseInstance: SupabaseClient | null = null;

/**
 * React Native's `URL` polyfill has read-only properties (protocol, pathname, etc.).
 * Supabase JS mutates these properties at runtime, which throws.
 *
 * Fix: Replace globalThis.URL with a thin wrapper that stores the href as a
 * mutable string and re-parses on demand so all property setters work.
 */
(function patchURL() {
  const OrigURL = globalThis.URL;
  if (!OrigURL) return;

  // Quick test: if protocol is already writable, nothing to do
  try {
    const t = new OrigURL("https://x.com/a");
    t.protocol = "wss:";
    t.pathname = "/b";
    if (t.protocol === "wss:" && t.pathname === "/b") return;
  } catch {
    // needs patching
  }

  class MutableURL {
    private _href: string;

    constructor(url: string | URL, base?: string | URL) {
      // Delegate initial parsing to the original URL
      const parsed = base ? new OrigURL(String(url), String(base)) : new OrigURL(String(url));
      this._href = parsed.href;
    }

    // Re-parse from _href each time (cheap — only called by Supabase during init)
    private _parsed(): URL { return new OrigURL(this._href); }

    get href() { return this._href; }
    set href(v: string) { this._href = new OrigURL(v).href; }

    get protocol() { return this._parsed().protocol; }
    set protocol(v: string) {
      const p = v.endsWith(":") ? v : v + ":";
      this._href = this._href.replace(/^[a-z]+:/i, p);
    }

    get hostname() { return this._parsed().hostname; }
    get host() { return this._parsed().host; }
    get port() { return this._parsed().port; }
    get origin() { return this._parsed().origin; }
    get hash() { return this._parsed().hash; }
    get search() { return this._parsed().search; }
    get searchParams() { return this._parsed().searchParams; }
    get username() { return this._parsed().username; }
    get password() { return this._parsed().password; }

    get pathname() { return this._parsed().pathname; }
    set pathname(v: string) {
      const u = this._parsed();
      // Rebuild href with new pathname
      const before = u.origin;
      const after = (u.search || "") + (u.hash || "");
      this._href = before + (v.startsWith("/") ? v : "/" + v) + after;
    }

    toString() { return this._href; }
    toJSON() { return this._href; }
  }

  // Preserve static methods
  (MutableURL as any).createObjectURL = (OrigURL as any).createObjectURL;
  (MutableURL as any).revokeObjectURL = (OrigURL as any).revokeObjectURL;

  globalThis.URL = MutableURL as any;
})();

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }
  return supabaseInstance;
}

const WARD_FETCH_LIMIT = 25;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();

  const [pendingTwoFactor, setPendingTwoFactor] = useState<ApprovalRequest[]>([]);
  const [pendingWardSigning, setPendingWardSigning] = useState<WardApprovalRequest[]>([]);
  const [pendingGuardianSigning, setPendingGuardianSigning] = useState<WardApprovalRequest[]>([]);

  const channelsRef = useRef<RealtimeChannel[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const walletAddrRef = useRef<string | null>(null);

  // ── Full HTTP re-fetch (initial load + foreground reconciliation) ────────

  const fetchAll = useCallback(async () => {
    if (!wallet.keys?.starkAddress) return;
    const addr = normalizeAddress(wallet.keys.starkAddress);

    // 2FA pending requests
    try {
      const { data } = await fetchPendingRequests(addr);
      if (data) setPendingTwoFactor(data);
    } catch (e) {
      console.warn("[RealtimeContext] 2FA fetch error:", e);
    }

    // Ward approval requests (both ward + guardian)
    try {
      const client = await getApiClient({
        walletAddress: wallet.keys.starkAddress,
        publicKey: wallet.keys.starkPublicKey,
      });

      const now = new Date().toISOString();

      // Ward signing requests
      const wardData = await client.getPendingWardApprovals({
        ward: addr,
        status: "pending_ward_sig",
        limit: WARD_FETCH_LIMIT,
      });
      if (wardData) {
        const filtered = (wardData as any[]).filter(
          (r: any) =>
            r.status === "pending_ward_sig" &&
            (!r.expires_at || r.expires_at > now),
        );
        setPendingWardSigning(filtered);
      }

      // Guardian signing requests
      const guardianData = await client.getPendingWardApprovals({
        guardian: addr,
        status: "pending_guardian",
        limit: WARD_FETCH_LIMIT,
      });
      if (guardianData) {
        const filtered = (guardianData as any[]).filter(
          (r: any) =>
            r.status === "pending_guardian" &&
            (!r.expires_at || r.expires_at > now),
        );
        setPendingGuardianSigning(filtered);
      }
    } catch (e: any) {
      if (e?.statusCode === 401 || e?.code === "UNAUTHORIZED") {
        invalidateApiKey();
      }
      console.warn("[RealtimeContext] Ward fetch error:", e);
    }
  }, [wallet.keys?.starkAddress, wallet.keys?.starkPublicKey]);

  // ── Realtime subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    const addr = wallet.keys?.starkAddress;
    if (!addr) {
      // No wallet — clear state and unsubscribe
      setPendingTwoFactor([]);
      setPendingWardSigning([]);
      setPendingGuardianSigning([]);
      cleanupChannels();
      walletAddrRef.current = null;
      return;
    }

    const normalized = normalizeAddress(addr);

    // If the same wallet is already subscribed, skip
    if (walletAddrRef.current === normalized) return;
    walletAddrRef.current = normalized;

    // Clean up previous subscriptions
    cleanupChannels();

    // Initial HTTP fetch to populate state
    fetchAll();

    // Set up Realtime channels
    const sb = getSupabase();
    const channels: RealtimeChannel[] = [];

    // Channel 1: approval_requests (2FA)
    const twoFactorChannel = sb
      .channel(`2fa:${normalized}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "approval_requests",
          filter: `wallet_address=eq.${normalized}`,
        },
        (payload) => {
          handleTwoFactorEvent(payload);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.warn("[RealtimeContext] 2FA channel subscribed");
        }
      });
    channels.push(twoFactorChannel);

    // Channel 2: ward_approval_requests filtered by ward_address
    const wardChannel = sb
      .channel(`ward:${normalized}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ward_approval_requests",
          filter: `ward_address=eq.${normalized}`,
        },
        (payload) => {
          handleWardEvent(payload, "ward");
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.warn("[RealtimeContext] Ward channel subscribed");
        }
      });
    channels.push(wardChannel);

    // Channel 3: ward_approval_requests filtered by guardian_address
    const guardianChannel = sb
      .channel(`guardian:${normalized}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ward_approval_requests",
          filter: `guardian_address=eq.${normalized}`,
        },
        (payload) => {
          handleGuardianEvent(payload);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.warn("[RealtimeContext] Guardian channel subscribed");
        }
      });
    channels.push(guardianChannel);

    channelsRef.current = channels;

    return () => {
      cleanupChannels();
      walletAddrRef.current = null;
    };
  }, [wallet.keys?.starkAddress, fetchAll]);

  // ── Periodic polling fallback ─────────────────────────────────────────
  // Realtime push is preferred but may not connect reliably on React Native.
  // A lightweight poll every 5s ensures the guardian always picks up new
  // requests even when the WebSocket is down.

  useEffect(() => {
    if (!wallet.keys?.starkAddress) return;
    const id = setInterval(fetchAll, 5_000);
    return () => clearInterval(id);
  }, [wallet.keys?.starkAddress, fetchAll]);

  // ── AppState foreground reconciliation ──────────────────────────────────

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          // Full re-fetch when app comes to foreground
          fetchAll();
        }
        appStateRef.current = nextState;
      },
    );
    return () => subscription.remove();
  }, [fetchAll]);

  // ── Event handlers ─────────────────────────────────────────────────────

  function handleTwoFactorEvent(payload: any) {
    const row = payload.new as ApprovalRequest | undefined;
    if (!row) return;

    setPendingTwoFactor((prev) => {
      if (row.status !== "pending") {
        // No longer pending — remove from list
        return prev.filter((r) => r.id !== row.id);
      }
      // Check if expired
      if (row.expires_at && row.expires_at < new Date().toISOString()) {
        return prev.filter((r) => r.id !== row.id);
      }
      // INSERT or UPDATE to pending — upsert
      const existing = prev.findIndex((r) => r.id === row.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = row;
        return updated;
      }
      return [...prev, row];
    });
  }

  function handleWardEvent(payload: any, _role: "ward") {
    const row = payload.new as WardApprovalRequest | undefined;
    if (!row) return;

    setPendingWardSigning((prev) => {
      if (row.status !== "pending_ward_sig") {
        return prev.filter((r) => r.id !== row.id);
      }
      if (row.expires_at && row.expires_at < new Date().toISOString()) {
        return prev.filter((r) => r.id !== row.id);
      }
      const existing = prev.findIndex((r) => r.id === row.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = row;
        return updated;
      }
      return [...prev, row];
    });
  }

  function handleGuardianEvent(payload: any) {
    const row = payload.new as WardApprovalRequest | undefined;
    if (!row) return;

    setPendingGuardianSigning((prev) => {
      if (row.status !== "pending_guardian") {
        return prev.filter((r) => r.id !== row.id);
      }
      if (row.expires_at && row.expires_at < new Date().toISOString()) {
        return prev.filter((r) => r.id !== row.id);
      }
      const existing = prev.findIndex((r) => r.id === row.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = row;
        return updated;
      }
      return [...prev, row];
    });
  }

  function cleanupChannels() {
    for (const ch of channelsRef.current) {
      try {
        getSupabase().removeChannel(ch);
      } catch (e) {
        console.warn("[RealtimeContext] Channel cleanup error:", e);
      }
    }
    channelsRef.current = [];
  }

  return (
    <RealtimeContext.Provider
      value={{
        pendingTwoFactor,
        pendingWardSigning,
        pendingGuardianSigning,
        refresh: fetchAll,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
