/**
 * E2E Test: CloakAccount deployment + 2FA verification on Sepolia
 * v3 — fix dual-sig by extending starknet.js Signer, fresh key each run
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
const required = ["FUNDER_PK", "FUNDER_ADDRESS"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in your values.");
    process.exit(1);
  }
}

const RPC_URL = process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const FUNDER_PK = process.env.FUNDER_PK;
const FUNDER_ADDRESS = process.env.FUNDER_ADDRESS;

const CLOAK_ACCOUNT_CLASS_HASH = "0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00";
const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: RPC_URL });

function padAddress(addr) {
  const hex = addr.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

function log(step, msg) {
  console.log(`\n[=== Step ${step} ${"=".repeat(Math.max(0, 40 - step.toString().length))}]`);
  console.log(msg);
}

async function waitForTx(txHash) {
  console.log(`  Waiting for tx ${txHash.slice(0, 20)}...`);
  await provider.waitForTransaction(txHash);
  console.log(`  Confirmed`);
}

function extractError(err) {
  const msg = err.message || String(err);
  const failIdx = msg.indexOf("Failure reason");
  if (failIdx >= 0) return msg.substring(failIdx, failIdx + 300);
  const errIdx = msg.indexOf("error");
  if (errIdx >= 0 && errIdx < 200) return msg.substring(errIdx, errIdx + 300);
  if (msg.length > 500) return "..." + msg.slice(-300);
  return msg;
}

/**
 * DualSigner — extends starknet.js Signer to sign with two keys.
 * Overrides signRaw() so starknet.js computes the tx hash correctly,
 * then we sign it with both keys → [r1, s1, r2, s2].
 */
class DualSigner extends Signer {
  constructor(pk1, pk2) {
    super(pk1);
    this._pk1 = pk1;
    this._pk2 = pk2;
    this.lastHash = null;
  }

  async signRaw(msgHash) {
    this.lastHash = msgHash;
    const sig1 = ec.starkCurve.sign(msgHash, this._pk1);
    const sig2 = ec.starkCurve.sign(msgHash, this._pk2);
    return [
      num.toHex(sig1.r), num.toHex(sig1.s),
      num.toHex(sig2.r), num.toHex(sig2.s),
    ];
  }
}

/**
 * Pre-computed DualSignSigner — returns pre-computed sigs (like SDK's executeWithDualSignature).
 */
class DualSignSigner {
  constructor(sig) { this.sig = sig; }
  async getPubKey() { return "0x0"; }
  async signMessage() { return this.sig; }
  async signTransaction() { return this.sig; }
  async signDeclareTransaction() { return this.sig; }
  async signDeployAccountTransaction() { return this.sig; }
}

async function main() {
  console.log("CloakAccount E2E Test v3 on Sepolia\n");

  // ─── Step 1: Generate fresh keys & compute address ─────────────────
  log(1, "Generating fresh primary key & computing CloakAccount address...");
  const pkBytes = ec.starkCurve.utils.randomPrivateKey();
  const PRIVATE_KEY = "0x" + Array.from(pkBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const publicKey = "0x" + ec.starkCurve.getStarkKey(PRIVATE_KEY).replace(/^0x/, "");
  const constructorCalldata = CallData.compile({ publicKey });
  const cloakAddress = padAddress(
    hash.calculateContractAddressFromHash(publicKey, CLOAK_ACCOUNT_CLASS_HASH, constructorCalldata, 0)
  );
  console.log(`  Primary key: ${PRIVATE_KEY.slice(0, 20)}...`);
  console.log(`  Public key:  ${publicKey}`);
  console.log(`  CloakAccount: ${cloakAddress}`);

  // ─── Step 2: Fund & deploy ────────────────────────────────────────
  log(2, "Funding with 2 STRK from Account 1...");
  const funder = new Account({ provider, address: FUNDER_ADDRESS, signer: FUNDER_PK });
  const fundTx = await funder.execute([{
    contractAddress: STRK_ADDRESS,
    entrypoint: "transfer",
    calldata: [cloakAddress, "2000000000000000000", "0"],
  }]);
  await waitForTx(fundTx.transaction_hash);

  log("2b", "Deploying CloakAccount...");
  const deployer = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
  const { transaction_hash: deployHash } = await deployer.deployAccount({
    classHash: CLOAK_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    addressSalt: publicKey,
  });
  await waitForTx(deployHash);

  // ─── Step 3: Verify deployment ─────────────────────────────────────
  log(3, "Verifying deployment...");
  const onChainPk = (await provider.callContract({ contractAddress: cloakAddress, entrypoint: "get_public_key", calldata: [] }))[0];
  console.log(`  Public key match: ${onChainPk === publicKey ? "YES" : "NO"}`);
  const is2fa = (await provider.callContract({ contractAddress: cloakAddress, entrypoint: "is_2fa_enabled", calldata: [] }))[0];
  console.log(`  2FA enabled: ${is2fa !== "0x0" && is2fa !== "0"} (expected: false)`);

  // ─── Step 4: Set secondary key (enable 2FA) ───────────────────────
  log(4, "Setting secondary key...");
  const cloakAcct = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
  const spkBytes = ec.starkCurve.utils.randomPrivateKey();
  const secondaryPk = "0x" + Array.from(spkBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const secondaryPubKey = "0x" + ec.starkCurve.getStarkKey(secondaryPk).replace(/^0x/, "");
  console.log(`  Secondary pk:     ${secondaryPk.slice(0, 20)}...`);
  console.log(`  Secondary pubkey: ${secondaryPubKey}`);

  const setKeyTx = await cloakAcct.execute([{
    contractAddress: cloakAddress,
    entrypoint: "set_secondary_key",
    calldata: [secondaryPubKey],
  }]);
  await waitForTx(setKeyTx.transaction_hash);

  const afterSet = (await provider.callContract({ contractAddress: cloakAddress, entrypoint: "is_2fa_enabled", calldata: [] }))[0];
  console.log(`  2FA enabled: ${afterSet !== "0x0" && afterSet !== "0" ? "YES" : "NO"}`);

  // ─── Step 5: Single-sig should FAIL ───────────────────────────────
  log(5, "Testing single-sig (should FAIL)...");
  const singleSigAcct = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
  try {
    const tx = await singleSigAcct.execute([{
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [cloakAddress, "1", "0"],
    }]);
    await waitForTx(tx.transaction_hash);
    console.log("  FAIL: Single-sig should have been rejected!");
  } catch (err) {
    console.log(`  PASS: Single-sig rejected`);
    console.log(`  Reason: ${extractError(err).slice(0, 150)}`);
  }

  // ─── Step 6: Dual-sig should SUCCEED ──────────────────────────────
  log(6, "Testing dual-sig (should SUCCEED)...");

  // Get resource bounds from funder (OZ account) for a similar call
  const dummyCalls = [{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [FUNDER_ADDRESS, "1", "0"] }];
  let resourceBounds;
  try {
    const est = await funder.estimateInvokeFee(dummyCalls);
    resourceBounds = est.resourceBounds;
    // 3x safety margin
    for (const key of Object.keys(resourceBounds)) {
      if (resourceBounds[key].max_amount) {
        resourceBounds[key].max_amount = BigInt(resourceBounds[key].max_amount) * 3n;
      }
      if (resourceBounds[key].max_price_per_unit) {
        resourceBounds[key].max_price_per_unit = BigInt(resourceBounds[key].max_price_per_unit) * 3n;
      }
    }
    console.log("  Got resource bounds from OZ fee estimate (3x)");
  } catch (e) {
    console.log(`  Fee estimation failed: ${e.message?.slice(0, 200)}`);
    return;
  }

  // Create Account with DualSigner — starknet.js computes the hash, we sign with both keys
  const dualSigner = new DualSigner(PRIVATE_KEY, secondaryPk);
  const dualAccount = new Account({ provider, address: cloakAddress, signer: dualSigner });
  const nonce = await provider.getNonceForAddress(cloakAddress);
  console.log(`  Nonce: ${nonce}`);

  const calls = [{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [cloakAddress, "1", "0"] }];
  try {
    const dualTx = await dualAccount.execute(calls, { nonce, resourceBounds });
    await waitForTx(dualTx.transaction_hash);
    console.log(`  PASS: Dual-sig SUCCEEDED: ${dualTx.transaction_hash}`);
  } catch (err) {
    console.log(`  FAIL: Dual-sig failed`);
    console.log(`  Error: ${extractError(err)}`);
  }

  // ─── Step 6b: Test pre-computed sigs with tip:0 fix ──────────────
  log("6b", "Testing pre-computed sigs with tip:0 (SDK's executeWithDualSignature)...");

  const step6bNonce = await provider.getNonceForAddress(cloakAddress);
  const chainId = await dualAccount.getChainId();
  const step6bCalls = [{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [cloakAddress, "1", "0"] }];
  const compiledCalldata = transaction.getExecuteCalldata(step6bCalls, "1");

  // Manual hash (same as SDK's prepareAndSign — tip: 0)
  const manualHash = hash.calculateInvokeTransactionHash({
    senderAddress: cloakAddress,
    version: "0x3",
    compiledCalldata,
    chainId,
    nonce: step6bNonce,
    accountDeploymentData: [],
    nonceDataAvailabilityMode: 0,
    feeDataAvailabilityMode: 0,
    resourceBounds,
    tip: 0,
    paymasterData: [],
  });
  const manualHashHex = num.toHex(manualHash);

  // Sign with both keys using the manual hash
  const ms1 = ec.starkCurve.sign(manualHashHex, PRIVATE_KEY);
  const ms2 = ec.starkCurve.sign(manualHashHex, secondaryPk);
  const preComputedSig = [
    num.toHex(ms1.r), num.toHex(ms1.s),
    num.toHex(ms2.r), num.toHex(ms2.s),
  ];

  // Submit with pre-computed sigs AND tip: 0 (like fixed SDK does)
  const preAcct = new Account({
    provider, address: cloakAddress,
    signer: new DualSignSigner(preComputedSig),
  });

  try {
    const preTx = await preAcct.execute(step6bCalls, { nonce: step6bNonce, resourceBounds, tip: 0 });
    await waitForTx(preTx.transaction_hash);
    console.log(`  PASS: Pre-computed sigs SUCCEEDED: ${preTx.transaction_hash}`);
  } catch (err) {
    console.log(`  FAIL: Pre-computed sigs failed`);
    console.log(`  Manual hash: ${manualHashHex}`);
    console.log(`  Error: ${extractError(err)}`);
  }

  // ─── Step 7: Remove secondary key (dual-sig) ─────────────────────
  log(7, "Removing secondary key (dual-sig)...");
  const removeNonce = await provider.getNonceForAddress(cloakAddress);
  const removeCalls = [{ contractAddress: cloakAddress, entrypoint: "remove_secondary_key", calldata: [] }];

  const rmDualAccount = new Account({ provider, address: cloakAddress, signer: new DualSigner(PRIVATE_KEY, secondaryPk) });
  try {
    const rmTx = await rmDualAccount.execute(removeCalls, { nonce: removeNonce, resourceBounds });
    await waitForTx(rmTx.transaction_hash);
    console.log(`  PASS: Removed secondary key`);
  } catch (err) {
    console.log(`  FAIL: ${extractError(err)}`);
  }

  const finalCheck = (await provider.callContract({ contractAddress: cloakAddress, entrypoint: "is_2fa_enabled", calldata: [] }))[0];
  console.log(`  2FA enabled: ${finalCheck !== "0x0" && finalCheck !== "0" ? "YES" : "NO"} (expected: NO)`);

  // ─── Step 8: Single-sig after 2FA disabled ────────────────────────
  log(8, "Single-sig after 2FA disabled...");
  const finalAcct = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
  try {
    const tx = await finalAcct.execute([{
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [cloakAddress, "1", "0"],
    }]);
    await waitForTx(tx.transaction_hash);
    console.log(`  PASS: Single-sig works after 2FA disabled`);
  } catch (err) {
    console.log(`  FAIL: ${extractError(err)}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("E2E TEST COMPLETE");
  console.log(`CloakAccount: ${cloakAddress}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(err => { console.error("Fatal:", err.message || err); process.exit(1); });
