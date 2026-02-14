/**
 * Test: Simulate web app inserting a ward approval request into Supabase.
 * This triggers the mobile approval pipeline:
 *   pending_ward_sig → (ward mobile signs) → pending_guardian → (guardian approves) → approved
 */
require("dotenv").config();

const { RpcProvider } = require("starknet");

// ─── Env validation ─────────────────────────────────────────────────
const required = ["WARD_ADDRESS", "GUARDIAN_ADDRESS", "SUPABASE_URL", "SUPABASE_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in your values.");
    process.exit(1);
  }
}

const RPC_URL = process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const WARD_ADDRESS = process.env.WARD_ADDRESS;
const GUARDIAN_ADDRESS = process.env.GUARDIAN_ADDRESS;

const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const TONGO_CORE = "0x023e4956b1c69f79e6a5e3cc04a8c0f8d4de4d4c1f0abcfb0f7de205d8c6205";

function normalizeAddress(addr) {
  const stripped = addr.toLowerCase().replace(/^0x/, "").replace(/^0+/, "");
  return "0x" + (stripped || "0");
}

async function main() {
  console.log("=== Test Ward Approval Request ===\n");

  // Simulate a simple STRK transfer call (like shielding)
  // For testing, we'll do a simple 0.01 STRK self-transfer
  const calls = [{
    contractAddress: STRK_ADDRESS,
    entrypoint: "transfer",
    calldata: [
      WARD_ADDRESS.replace(/^0x/, "").padStart(64, "0"),
      "0x" + (1n * 10n ** 16n).toString(16), // 0.01 STRK
      "0x0",
    ],
  }];

  const callsJson = JSON.stringify(calls);

  console.log("Inserting ward approval request...");
  console.log("  Ward:     ", normalizeAddress(WARD_ADDRESS));
  console.log("  Guardian: ", normalizeAddress(GUARDIAN_ADDRESS));
  console.log("  Action:   shield");
  console.log("  Status:   pending_ward_sig");

  const body = {
    ward_address: normalizeAddress(WARD_ADDRESS),
    guardian_address: normalizeAddress(GUARDIAN_ADDRESS),
    action: "shield",
    token: "STRK",
    amount: "0.01",
    recipient: null,
    calls_json: callsJson,
    nonce: "",
    resource_bounds_json: "{}",
    tx_hash: "",
    ward_sig_json: null,
    ward_2fa_sig_json: null,
    guardian_sig_json: null,
    guardian_2fa_sig_json: null,
    needs_ward_2fa: false,
    needs_guardian: true,
    needs_guardian_2fa: false,
    status: "pending_ward_sig",
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/ward_approval_requests`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("INSERT failed:", await res.text());
    process.exit(1);
  }

  const rows = await res.json();
  const requestId = rows[0]?.id;
  console.log("\nRequest created! ID:", requestId);
  console.log("\nNow waiting for approval pipeline...");
  console.log("  1. Ward mobile should pick up 'pending_ward_sig'");
  console.log("  2. Ward mobile signs → advances to 'pending_guardian'");
  console.log("  3. Guardian mobile picks up 'pending_guardian'");
  console.log("  4. Guardian signs and submits → 'approved'\n");

  // Poll for completion
  const startTime = Date.now();
  const TIMEOUT = 10 * 60 * 1000;

  const poll = async () => {
    if (Date.now() - startTime > TIMEOUT) {
      console.log("TIMEOUT — request did not complete in 10 minutes");
      process.exit(1);
    }

    const pollRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ward_approval_requests?id=eq.${requestId}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    const pollRows = await pollRes.json();
    const row = pollRows[0];

    if (!row) {
      console.log("Request not found!");
      process.exit(1);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  [${elapsed}s] Status: ${row.status.padEnd(20)}`);

    if (row.status === "approved") {
      console.log(`\n\nSUCCESS! Transaction approved.`);
      console.log("  Final tx hash:", row.final_tx_hash);
      console.log("  Ward sig:     ", row.ward_sig_json ? "present" : "missing");
      console.log("  Guardian sig: ", row.guardian_sig_json ? "present" : "missing");

      if (row.final_tx_hash) {
        console.log(`\n  View on explorer: https://sepolia.starkscan.co/tx/${row.final_tx_hash}`);
      }
      process.exit(0);
    }

    if (row.status === "rejected" || row.status === "failed") {
      console.log(`\n\nFAILED — Status: ${row.status}`);
      if (row.error_message) console.log("  Error:", row.error_message);
      process.exit(1);
    }

    setTimeout(poll, 2000);
  };

  poll();
}

main().catch(err => { console.error("Error:", err.message || err); process.exit(1); });
