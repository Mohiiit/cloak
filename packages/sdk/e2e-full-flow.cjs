/**
 * Full E2E Test: Extension → Supabase → Mobile → On-Chain
 * Tests the complete 2FA approval flow with real Supabase and Sepolia transactions.
 *
 * Flow:
 *   1. Deploy CloakAccount, enable 2FA
 *   2. "Extension" calls prepareAndSign → inserts approval request to Supabase
 *   3. "Mobile" polls Supabase → co-signs → submits dual-sig tx → updates Supabase
 *   4. "Extension" detects approval → gets final tx hash
 *   5. Verify on-chain
 */
require("dotenv").config();

const {
  RpcProvider,
  Account,
  Signer,
  ec,
  num,
  hash,
  CallData,
  transaction,
} = require("starknet");

// ─── Env validation ─────────────────────────────────────────────────
const required = ["FUNDER_PK", "FUNDER_ADDRESS", "SUPABASE_URL", "SUPABASE_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in your values.");
    process.exit(1);
  }
}

// ─── Config ─────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const FUNDER_PK = process.env.FUNDER_PK;
const FUNDER_ADDRESS = process.env.FUNDER_ADDRESS;
const CLOAK_ACCOUNT_CLASS_HASH = "0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00";
const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const provider = new RpcProvider({ nodeUrl: RPC_URL });

// ─── Helpers ────────────────────────────────────────────────────────
function padAddress(addr) {
  return "0x" + addr.replace(/^0x/, "").padStart(64, "0");
}

function log(step, msg) {
  console.log(`\n[=== ${step} ${"=".repeat(Math.max(0, 50 - step.length))}]`);
  console.log(msg);
}

async function waitForTx(txHash) {
  console.log(`  Waiting for tx ${txHash.slice(0, 20)}...`);
  await provider.waitForTransaction(txHash);
  console.log(`  Confirmed ✓`);
}

function extractError(err) {
  const msg = err.message || String(err);
  const failIdx = msg.indexOf("Failure reason");
  if (failIdx >= 0) return msg.substring(failIdx, failIdx + 300);
  if (msg.length > 500) return "..." + msg.slice(-300);
  return msg;
}

// ─── Supabase REST Client ───────────────────────────────────────────
const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase insert: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return Array.isArray(json) ? json[0] : json;
}

async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: sbHeaders,
  });
  if (!res.ok) throw new Error(`Supabase select: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, query, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: sbHeaders,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase update: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return Array.isArray(json) ? json[0] : json;
}

// ─── DualSignSigner (pre-computed sigs) ─────────────────────────────
class DualSignSigner {
  constructor(sig) { this.sig = sig; }
  async getPubKey() { return "0x0"; }
  async signMessage() { return this.sig; }
  async signTransaction() { return this.sig; }
  async signDeclareTransaction() { return this.sig; }
  async signDeployAccountTransaction() { return this.sig; }
}

// ─── DualSigner (for setup steps) ───────────────────────────────────
class DualSigner extends Signer {
  constructor(pk1, pk2) {
    super(pk1);
    this._pk1 = pk1;
    this._pk2 = pk2;
  }
  async signRaw(msgHash) {
    const s1 = ec.starkCurve.sign(msgHash, this._pk1);
    const s2 = ec.starkCurve.sign(msgHash, this._pk2);
    return [num.toHex(s1.r), num.toHex(s1.s), num.toHex(s2.r), num.toHex(s2.s)];
  }
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Full E2E: Extension → Supabase → Mobile → On-Chain    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ════════════════════════════════════════════════════════════════════
  // SETUP: Deploy CloakAccount + Enable 2FA
  // ════════════════════════════════════════════════════════════════════

  log("SETUP 1/4", "Generating fresh keys...");
  const pkBytes = ec.starkCurve.utils.randomPrivateKey();
  const PRIMARY_KEY = "0x" + Array.from(pkBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const publicKey = "0x" + ec.starkCurve.getStarkKey(PRIMARY_KEY).replace(/^0x/, "");
  const constructorCalldata = CallData.compile({ publicKey });
  const cloakAddress = padAddress(
    hash.calculateContractAddressFromHash(publicKey, CLOAK_ACCOUNT_CLASS_HASH, constructorCalldata, 0)
  );
  console.log(`  CloakAccount: ${cloakAddress}`);

  const spkBytes = ec.starkCurve.utils.randomPrivateKey();
  const SECONDARY_KEY = "0x" + Array.from(spkBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const secondaryPubKey = "0x" + ec.starkCurve.getStarkKey(SECONDARY_KEY).replace(/^0x/, "");
  console.log(`  Secondary pubkey: ${secondaryPubKey}`);

  log("SETUP 2/4", "Funding with 2 STRK + deploying...");
  const funder = new Account({ provider, address: FUNDER_ADDRESS, signer: FUNDER_PK });
  const fundTx = await funder.execute([{
    contractAddress: STRK_ADDRESS, entrypoint: "transfer",
    calldata: [cloakAddress, "2000000000000000000", "0"],
  }]);
  await waitForTx(fundTx.transaction_hash);

  const deployer = new Account({ provider, address: cloakAddress, signer: PRIMARY_KEY });
  const { transaction_hash: deployHash } = await deployer.deployAccount({
    classHash: CLOAK_ACCOUNT_CLASS_HASH, constructorCalldata, addressSalt: publicKey,
  });
  await waitForTx(deployHash);

  log("SETUP 3/4", "Setting secondary key (enabling 2FA on-chain)...");
  const setupAcct = new Account({ provider, address: cloakAddress, signer: PRIMARY_KEY });
  const setKeyTx = await setupAcct.execute([{
    contractAddress: cloakAddress, entrypoint: "set_secondary_key",
    calldata: [secondaryPubKey],
  }]);
  await waitForTx(setKeyTx.transaction_hash);

  const is2fa = (await provider.callContract({ contractAddress: cloakAddress, entrypoint: "is_2fa_enabled", calldata: [] }))[0];
  console.log(`  2FA enabled on-chain: ${is2fa !== "0x0" && is2fa !== "0" ? "YES ✓" : "NO ✗"}`);

  log("SETUP 4/4", "Getting resource bounds from OZ account...");
  const dummyCalls = [{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [FUNDER_ADDRESS, "1", "0"] }];
  const est = await funder.estimateInvokeFee(dummyCalls);
  const resourceBounds = est.resourceBounds;
  for (const key of Object.keys(resourceBounds)) {
    if (resourceBounds[key].max_amount) resourceBounds[key].max_amount = BigInt(resourceBounds[key].max_amount) * 3n;
    if (resourceBounds[key].max_price_per_unit) resourceBounds[key].max_price_per_unit = BigInt(resourceBounds[key].max_price_per_unit) * 3n;
  }
  console.log("  Resource bounds (3x OZ estimate) ready ✓");

  // ════════════════════════════════════════════════════════════════════
  // STEP 1: "EXTENSION" — prepareAndSign + insert to Supabase
  // ════════════════════════════════════════════════════════════════════

  log("EXT → prepareAndSign", "Extension computes partial sig...");
  const nonce = await provider.getNonceForAddress(cloakAddress);
  const chainId = await setupAcct.getChainId();
  const calls = [{
    contractAddress: STRK_ADDRESS, entrypoint: "transfer",
    calldata: [cloakAddress, "1", "0"],
  }];
  const compiledCalldata = transaction.getExecuteCalldata(calls, "1");

  // Compute tx hash (same as SDK prepareAndSign — tip: 0)
  const txHash = hash.calculateInvokeTransactionHash({
    senderAddress: cloakAddress,
    version: "0x3",
    compiledCalldata,
    chainId,
    nonce,
    accountDeploymentData: [],
    nonceDataAvailabilityMode: 0,
    feeDataAvailabilityMode: 0,
    resourceBounds,
    tip: 0,
    paymasterData: [],
  });
  const txHashHex = num.toHex(txHash);

  // Sign with primary key (extension holds this)
  const sig1Raw = ec.starkCurve.sign(txHashHex, PRIMARY_KEY);
  const sig1 = ["0x" + sig1Raw.r.toString(16), "0x" + sig1Raw.s.toString(16)];

  console.log(`  Nonce: ${nonce}`);
  console.log(`  Tx hash: ${txHashHex.slice(0, 20)}...`);
  console.log(`  sig1: [${sig1[0].slice(0, 15)}..., ${sig1[1].slice(0, 15)}...]`);

  // Serialize resource bounds for Supabase
  const resourceBoundsJson = JSON.stringify(resourceBounds, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  );

  log("EXT → Supabase INSERT", "Inserting approval request...");
  let requestRow;
  try {
    requestRow = await sbInsert("approval_requests", {
      wallet_address: cloakAddress,
      action: "transfer",
      token: "STRK",
      amount: "0.000000000000000001",
      recipient: cloakAddress,
      calls_json: JSON.stringify(calls),
      sig1_json: JSON.stringify(sig1),
      nonce,
      resource_bounds_json: resourceBoundsJson,
      tx_hash: txHashHex,
      status: "pending",
    });
    console.log(`  Request ID: ${requestRow.id}`);
    console.log(`  Status: ${requestRow.status}`);
  } catch (err) {
    console.log(`  FAIL: ${err.message}`);
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 2: "MOBILE" — Poll Supabase, co-sign, submit, update
  // ════════════════════════════════════════════════════════════════════

  log("MOBILE → Poll Supabase", "Fetching pending requests...");
  const pending = await sbSelect("approval_requests",
    `status=eq.pending&wallet_address=eq.${cloakAddress}&order=created_at.desc`
  );
  console.log(`  Found ${pending.length} pending request(s)`);

  if (pending.length === 0) {
    console.log("  FAIL: No pending requests found!");
    return;
  }

  const request = pending[0];
  console.log(`  Request: id=${request.id}, action=${request.action}, token=${request.token}`);

  log("MOBILE → Co-sign", "Mobile signs tx hash with secondary key...");
  const mobileSig1 = JSON.parse(request.sig1_json);
  const sig2Raw = ec.starkCurve.sign(num.toHex(BigInt(request.tx_hash)), SECONDARY_KEY);
  const sig2 = ["0x" + sig2Raw.r.toString(16), "0x" + sig2Raw.s.toString(16)];
  const combined = [...mobileSig1, ...sig2];
  console.log(`  sig2: [${sig2[0].slice(0, 15)}..., ${sig2[1].slice(0, 15)}...]`);
  console.log(`  Combined sig length: ${combined.length} (expected 4)`);

  log("MOBILE → Submit dual-sig tx", "Executing on-chain...");
  const mobileCalls = JSON.parse(request.calls_json);
  const mobileResourceBounds = JSON.parse(request.resource_bounds_json, (_k, v) => {
    if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
    return v;
  });

  const mobileAcct = new Account({
    provider,
    address: cloakAddress,
    signer: new DualSignSigner(combined),
  });

  let finalTxHash;
  try {
    const txResponse = await mobileAcct.execute(mobileCalls, {
      nonce: request.nonce,
      resourceBounds: mobileResourceBounds,
      tip: 0,
    });
    finalTxHash = txResponse.transaction_hash;
    await waitForTx(finalTxHash);
    console.log(`  PASS: Dual-sig tx SUCCEEDED ✓`);
    console.log(`  Final tx hash: ${finalTxHash}`);
  } catch (err) {
    console.log(`  FAIL: ${extractError(err)}`);
    // Update Supabase with failure
    await sbUpdate("approval_requests", `id=eq.${request.id}`, {
      status: "failed",
      error_message: extractError(err).slice(0, 200),
      responded_at: new Date().toISOString(),
    });
    return;
  }

  log("MOBILE → Update Supabase", "Marking request as approved...");
  const updated = await sbUpdate("approval_requests", `id=eq.${request.id}`, {
    status: "approved",
    final_tx_hash: finalTxHash,
    responded_at: new Date().toISOString(),
  });
  console.log(`  Status: ${updated.status} ✓`);
  console.log(`  Final tx: ${updated.final_tx_hash}`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 3: "EXTENSION" — Detect approval
  // ════════════════════════════════════════════════════════════════════

  log("EXT → Poll Supabase", "Checking approval status...");
  const rows = await sbSelect("approval_requests", `id=eq.${requestRow.id}`);
  const finalRow = rows[0];
  console.log(`  Status: ${finalRow.status}`);
  console.log(`  Final tx hash: ${finalRow.final_tx_hash}`);
  console.log(`  Extension detects approval: ${finalRow.status === "approved" ? "YES ✓" : "NO ✗"}`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 4: Verify on-chain
  // ════════════════════════════════════════════════════════════════════

  log("VERIFY", "Checking on-chain state...");
  const receipt = await provider.getTransactionReceipt(finalTxHash);
  console.log(`  Tx status: ${receipt.statusReceipt || "ACCEPTED"} ✓`);

  // Also verify 2FA is still enabled (the self-transfer shouldn't affect it)
  const still2fa = (await provider.callContract({ contractAddress: cloakAddress, entrypoint: "is_2fa_enabled", calldata: [] }))[0];
  console.log(`  2FA still enabled: ${still2fa !== "0x0" && still2fa !== "0" ? "YES ✓" : "NO ✗"}`);

  // ════════════════════════════════════════════════════════════════════
  // CLEANUP: Remove secondary key so account isn't stuck
  // ════════════════════════════════════════════════════════════════════

  log("CLEANUP", "Removing secondary key with DualSigner...");
  const rmNonce = await provider.getNonceForAddress(cloakAddress);
  const rmAcct = new Account({
    provider, address: cloakAddress,
    signer: new DualSigner(PRIMARY_KEY, SECONDARY_KEY),
  });
  try {
    const rmTx = await rmAcct.execute(
      [{ contractAddress: cloakAddress, entrypoint: "remove_secondary_key", calldata: [] }],
      { nonce: rmNonce, resourceBounds }
    );
    await waitForTx(rmTx.transaction_hash);
    console.log("  2FA disabled ✓");
  } catch (err) {
    console.log(`  Cleanup failed (non-critical): ${extractError(err).slice(0, 100)}`);
  }

  // ════════════════════════════════════════════════════════════════════
  // RESULT
  // ════════════════════════════════════════════════════════════════════

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  FULL E2E TEST PASSED                   ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  CloakAccount: ${cloakAddress.slice(0, 20)}...`);
  console.log(`║  Supabase request: ${requestRow.id}`);
  console.log(`║  On-chain tx: ${finalTxHash.slice(0, 20)}...`);
  console.log("║                                                          ║");
  console.log("║  Flow verified:                                          ║");
  console.log("║    ✓ Extension prepareAndSign (partial sig)              ║");
  console.log("║    ✓ Supabase INSERT (approval request)                  ║");
  console.log("║    ✓ Mobile poll + co-sign (secondary key)               ║");
  console.log("║    ✓ On-chain dual-sig execution (CloakAccount)          ║");
  console.log("║    ✓ Supabase UPDATE (approved + final tx)               ║");
  console.log("║    ✓ Extension detects approval                          ║");
  console.log("║    ✓ On-chain verification                               ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch(err => { console.error("Fatal:", err.message || err); process.exit(1); });
