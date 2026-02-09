// Stark curve order for key validation
export const CURVE_ORDER =
  3618502788666131213697322783095070105526743751716087489154079457884512865583n;

// localStorage keys
export const STORAGE_KEYS = {
  TONGO_PK: "cloak_tongo_pk",
  CONTACTS: "cloak_contacts",
  TX_NOTES: "cloak_tx_notes",
  REQUESTS: "cloak_requests",
  SETTINGS: "cloak_settings",
} as const;

// Polling intervals
export const BALANCE_POLL_INTERVAL = 15_000; // 15 seconds
