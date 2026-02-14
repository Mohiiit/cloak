/**
 * E2E Test: CloakAccount deployment + 2FA verification on Sepolia
 *
 * Tests:
 * 1. Compute CloakAccount address for Account 1
 * 2. Fund CloakAccount address from OZ Account 1
 * 3. Deploy CloakAccount on-chain
 * 4. Verify deployment (get_public_key, is_2fa_enabled = false)
 * 5. Set secondary key → is_2fa_enabled = true
 * 6. Execute tx with dual-sig → SUCCESS
 * 7. Execute tx with single-sig → FAIL (on-chain rejection)
 * 8. Remove secondary key (dual-sig) → is_2fa_enabled = false
 */

import "dotenv/config";

// We run from packages/sdk so we can require starknet
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
  RpcProvider,
  Account,
  ec,
  num,
  hash,
  CallData,
  transaction,
} = require("starknet");

// ─── Env validation ──────────────────────────────────────────────────────
const required = ["FUNDER_PK", "FUNDER_ADDRESS"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy packages/sdk/.env.example to packages/sdk/.env and fill in your values.");
    process.exit(1);
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const PRIVATE_KEY = process.env.FUNDER_PK;
const OZ_ADDRESS = process.env.FUNDER_ADDRESS;

const CLOAK_ACCOUNT_CLASS_HASH = "0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00";
const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: RPC_URL });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function padAddress(addr) {
  const hex = addr.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

function log(step, msg) {
  console.log(`\n[${"=".repeat(3)} Step ${step} ${"=".repeat(40 - step.toString().length)}]`);
  console.log(msg);
}

async function waitForTx(txHash) {
  console.log(`  Waiting for tx ${txHash.slice(0, 16)}...`);
  await provider.waitForTransaction(txHash);
  console.log(`  Confirmed`);
}

// ─── DualSignSigner ──────────────────────────────────────────────────────────

class DualSignSigner {
  constructor(sig) { this.sig = sig; }
  async getPubKey() { return "0x0"; }
  async signMessage() { return this.sig; }
  async signTransaction() { return this.sig; }
  async signDeclareTransaction() { return this.sig; }
  async signDeployAccountTransaction() { return this.sig; }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("CloakAccount E2E Test on Sepolia\n");

  // ─── Step 1: Compute CloakAccount address ───────────────────────────
  log(1, "Computing CloakAccount address...");
  const publicKey = "0x" + ec.starkCurve.getStarkKey(PRIVATE_KEY).replace(/^0x/, "");
  console.log(`  Public key: ${publicKey}`);

  const constructorCalldata = CallData.compile({ publicKey });
  const cloakAddress = padAddress(
    hash.calculateContractAddressFromHash(
      publicKey,
      CLOAK_ACCOUNT_CLASS_HASH,
      constructorCalldata,
      0,
    )
  );
  console.log(`  CloakAccount address: ${cloakAddress}`);
  console.log(`  OZ Account address:   ${OZ_ADDRESS}`);

  // ─── Step 2: Check if already deployed ──────────────────────────────
  log(2, "Checking if CloakAccount is already deployed...");
  let alreadyDeployed = false;
  try {
    const nonce = await provider.getNonceForAddress(cloakAddress);
    console.log(`  Already deployed! Nonce: ${nonce}`);
    alreadyDeployed = true;
  } catch {
    console.log(`  Not deployed yet. Will fund and deploy.`);
  }

  if (!alreadyDeployed) {
    // ─── Step 2a: Fund CloakAccount from OZ account ─────────────────
    log("2a", "Funding CloakAccount with 5 STRK from OZ account...");
    const ozAccount = new Account({ provider, address: OZ_ADDRESS, signer: PRIVATE_KEY });

    // Transfer 5 STRK (5 * 10^18)
    const fundAmount = "5000000000000000000";
    const fundTx = await ozAccount.execute([{
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [cloakAddress, fundAmount, "0"],
    }]);
    await waitForTx(fundTx.transaction_hash);

    // Check balance
    const balResult = await provider.callContract({
      contractAddress: STRK_ADDRESS,
      entrypoint: "balanceOf",
      calldata: [cloakAddress],
    });
    console.log(`  CloakAccount STRK balance: ${BigInt(balResult[0])} (raw)`);

    // ─── Step 2b: Deploy CloakAccount ─────────────────────────────────
    log("2b", "Deploying CloakAccount...");
    const deployAccount = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
    const { transaction_hash: deployTxHash } = await deployAccount.deployAccount({
      classHash: CLOAK_ACCOUNT_CLASS_HASH,
      constructorCalldata,
      addressSalt: publicKey,
    });
    await waitForTx(deployTxHash);
    console.log(`  Deploy tx: ${deployTxHash}`);
  }

  // ─── Step 3: Verify deployment ────────────────────────────────────
  log(3, "Verifying CloakAccount deployment...");
  const cloakAccount = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });

  const pubKeyResult = await provider.callContract({
    contractAddress: cloakAddress,
    entrypoint: "get_public_key",
    calldata: [],
  });
  console.log(`  get_public_key: ${pubKeyResult[0]}`);
  console.log(`  Expected:       ${publicKey}`);
  console.log(`  Match: ${pubKeyResult[0] === publicKey ? "YES" : "NO"}`);

  const is2faResult = await provider.callContract({
    contractAddress: cloakAddress,
    entrypoint: "is_2fa_enabled",
    calldata: [],
  });
  const is2faEnabled = is2faResult[0] !== "0x0" && is2faResult[0] !== "0";
  console.log(`  is_2fa_enabled: ${is2faEnabled} ${!is2faEnabled ? "(correct)" : "(unexpected)"}`);

  // ─── Step 4: Generate secondary key and set on-chain ──────────────
  log(4, "Setting secondary key (enable 2FA)...");
  const secondaryPkBytes = ec.starkCurve.utils.randomPrivateKey();
  const secondaryPk = "0x" + Array.from(secondaryPkBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const secondaryPubKey = "0x" + ec.starkCurve.getStarkKey(secondaryPk).replace(/^0x/, "");
  console.log(`  Secondary public key: ${secondaryPubKey}`);

  const setKeyTx = await cloakAccount.execute([{
    contractAddress: cloakAddress,
    entrypoint: "set_secondary_key",
    calldata: [secondaryPubKey],
  }]);
  await waitForTx(setKeyTx.transaction_hash);

  // Verify
  const is2faAfter = await provider.callContract({
    contractAddress: cloakAddress,
    entrypoint: "is_2fa_enabled",
    calldata: [],
  });
  const enabled = is2faAfter[0] !== "0x0" && is2faAfter[0] !== "0";
  console.log(`  is_2fa_enabled after set: ${enabled} ${enabled ? "(correct)" : "(unexpected)"}`);

  const secKeyResult = await provider.callContract({
    contractAddress: cloakAddress,
    entrypoint: "get_secondary_key",
    calldata: [],
  });
  console.log(`  get_secondary_key: ${secKeyResult[0]}`);
  console.log(`  Expected:          ${secondaryPubKey}`);
  console.log(`  Match: ${secKeyResult[0] === secondaryPubKey ? "YES" : "NO"}`);

  // ─── Step 5: Test single-sig tx → MUST FAIL ───────────────────────
  log(5, "Testing single-sig transaction (should FAIL)...");
  try {
    // Try a simple STRK self-transfer with only primary key
    const singleSigTx = await cloakAccount.execute([{
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [cloakAddress, "1", "0"], // 1 wei to self
    }]);
    await waitForTx(singleSigTx.transaction_hash);
    console.log(`  UNEXPECTED: Single-sig tx succeeded! 2FA not enforced.`);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("2FA") || msg.includes("signature") || msg.includes("REJECTED") || msg.includes("reverted")) {
      console.log(`  PASS: Single-sig correctly REJECTED: ${msg.slice(0, 120)}`);
    } else {
      console.log(`  Single-sig failed (maybe for other reason): ${msg.slice(0, 200)}`);
    }
  }

  // ─── Step 6: Test dual-sig tx → MUST SUCCEED ──────────────────────
  log(6, "Testing dual-sig transaction (should SUCCEED)...");

  const calls = [{
    contractAddress: STRK_ADDRESS,
    entrypoint: "transfer",
    calldata: [cloakAddress, "1", "0"], // 1 wei to self
  }];

  // Get nonce and estimate fee
  const nonce = await cloakAccount.getNonce();
  const feeEstimate = await cloakAccount.estimateInvokeFee(calls, { nonce });
  const chainId = await cloakAccount.getChainId();

  // Compute tx hash
  const compiledCalldata = transaction.getExecuteCalldata(calls, "1");
  const txHash = hash.calculateInvokeTransactionHash({
    senderAddress: cloakAddress,
    version: "0x3",
    compiledCalldata,
    chainId,
    nonce,
    accountDeploymentData: [],
    nonceDataAvailabilityMode: 0,
    feeDataAvailabilityMode: 0,
    resourceBounds: feeEstimate.resourceBounds,
    tip: 0,
    paymasterData: [],
  });
  const txHashHex = num.toHex(txHash);
  console.log(`  Tx hash: ${txHashHex.slice(0, 20)}...`);

  // Sign with primary key (sig1)
  const sig1Raw = ec.starkCurve.sign(txHashHex, PRIVATE_KEY);
  const sig1 = ["0x" + sig1Raw.r.toString(16), "0x" + sig1Raw.s.toString(16)];

  // Sign with secondary key (sig2)
  const sig2Raw = ec.starkCurve.sign(txHashHex, secondaryPk);
  const sig2 = ["0x" + sig2Raw.r.toString(16), "0x" + sig2Raw.s.toString(16)];

  // Combined signature: [r1, s1, r2, s2]
  const combined = [...sig1, ...sig2];
  console.log(`  Combined sig length: ${combined.length} (expected 4)`);

  // Execute with dual-sig
  const dualSigner = new DualSignSigner(combined);
  const dualAccount = new Account({
    provider,
    address: cloakAddress,
    signer: dualSigner,
  });

  try {
    const dualTx = await dualAccount.execute(calls, {
      nonce,
      resourceBounds: feeEstimate.resourceBounds,
    });
    await waitForTx(dualTx.transaction_hash);
    console.log(`  PASS: Dual-sig tx SUCCEEDED: ${dualTx.transaction_hash.slice(0, 20)}...`);
  } catch (err) {
    console.log(`  FAIL: Dual-sig tx FAILED: ${(err.message || err).slice(0, 200)}`);
  }

  // ─── Step 7: Remove secondary key (disable 2FA) ───────────────────
  log(7, "Removing secondary key (disable 2FA) with dual-sig...");

  const removeCalls = [{
    contractAddress: cloakAddress,
    entrypoint: "remove_secondary_key",
    calldata: [],
  }];

  const removeNonce = await provider.getNonceForAddress(cloakAddress);
  // We need a fresh account for fee estimation (with a real signer)
  const freshAccount = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
  // Fee estimation with single sig will fail because 2FA is enabled.
  // Use the last fee estimate as a rough bound instead.
  let removeFeeEstimate;
  try {
    removeFeeEstimate = await freshAccount.estimateInvokeFee(removeCalls, { nonce: removeNonce });
  } catch {
    // If estimation fails (single-sig rejected), use generous bounds
    removeFeeEstimate = feeEstimate; // reuse previous estimate
    console.log("  (Fee estimation failed with single-sig, reusing previous estimate)");
  }

  const removeCompiled = transaction.getExecuteCalldata(removeCalls, "1");
  const removeTxHash = hash.calculateInvokeTransactionHash({
    senderAddress: cloakAddress,
    version: "0x3",
    compiledCalldata: removeCompiled,
    chainId,
    nonce: removeNonce,
    accountDeploymentData: [],
    nonceDataAvailabilityMode: 0,
    feeDataAvailabilityMode: 0,
    resourceBounds: removeFeeEstimate.resourceBounds,
    tip: 0,
    paymasterData: [],
  });
  const removeTxHashHex = num.toHex(removeTxHash);

  const rSig1 = ec.starkCurve.sign(removeTxHashHex, PRIVATE_KEY);
  const rSig2 = ec.starkCurve.sign(removeTxHashHex, secondaryPk);
  const removeCombined = [
    "0x" + rSig1.r.toString(16), "0x" + rSig1.s.toString(16),
    "0x" + rSig2.r.toString(16), "0x" + rSig2.s.toString(16),
  ];

  const removeDualAccount = new Account({
    provider,
    address: cloakAddress,
    signer: new DualSignSigner(removeCombined),
  });

  try {
    const removeTx = await removeDualAccount.execute(removeCalls, {
      nonce: removeNonce,
      resourceBounds: removeFeeEstimate.resourceBounds,
    });
    await waitForTx(removeTx.transaction_hash);
    console.log(`  PASS: remove_secondary_key tx SUCCEEDED`);
  } catch (err) {
    console.log(`  FAIL: remove_secondary_key FAILED: ${(err.message || err).slice(0, 200)}`);
  }

  // Verify 2FA is disabled
  const is2faFinal = await provider.callContract({
    contractAddress: cloakAddress,
    entrypoint: "is_2fa_enabled",
    calldata: [],
  });
  const finalEnabled = is2faFinal[0] !== "0x0" && is2faFinal[0] !== "0";
  console.log(`  is_2fa_enabled after remove: ${finalEnabled} ${!finalEnabled ? "(correct)" : "(unexpected)"}`);

  // ─── Step 8: Single-sig should work again ─────────────────────────
  log(8, "Testing single-sig after 2FA disabled (should SUCCEED)...");
  const postRemoveAccount = new Account({ provider, address: cloakAddress, signer: PRIVATE_KEY });
  try {
    const postTx = await postRemoveAccount.execute([{
      contractAddress: STRK_ADDRESS,
      entrypoint: "transfer",
      calldata: [cloakAddress, "1", "0"],
    }]);
    await waitForTx(postTx.transaction_hash);
    console.log(`  PASS: Single-sig tx SUCCEEDED after 2FA disabled`);
  } catch (err) {
    console.log(`  FAIL: Single-sig tx FAILED: ${(err.message || err).slice(0, 200)}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("E2E TEST COMPLETE");
  console.log(`CloakAccount address: ${cloakAddress}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
