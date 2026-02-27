/**
 * Declare CloakDelegation with known CASM hash and manual resource bounds.
 * Usage: node declare-v2.cjs
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { RpcProvider, Account, json, hash } = require("starknet");

const RPC_URL =
  process.env.RPC_URL ||
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const PK = process.env.FUNDER_PK;
const ADDR = process.env.FUNDER_ADDRESS;

// CASM hash from sequencer (local scarb CASM doesn't match)
let EXPECTED_CASM_HASH =
  "0x23cc1bd11994e415e364bb44e97368fb38b445bf81f7784c45c79ca99ea11f9";

const CONTRACTS_DIR = path.resolve(
  __dirname,
  "../snfoundry/contracts/target/dev"
);

async function main() {
  console.log("=== CloakDelegation Declare (v2) ===\n");

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const chainId = await provider.getChainId();
  console.log("Chain ID:", chainId);

  const sierraPath = path.join(
    CONTRACTS_DIR,
    "contracts_CloakDelegation.contract_class.json"
  );
  const casmPath = path.join(
    CONTRACTS_DIR,
    "contracts_CloakDelegation.compiled_contract_class.json"
  );

  if (!fs.existsSync(sierraPath) || !fs.existsSync(casmPath)) {
    console.error("Build artifacts not found. Run `scarb build` first.");
    process.exit(1);
  }

  const sierraContract = json.parse(fs.readFileSync(sierraPath, "utf-8"));
  const casmContract = json.parse(fs.readFileSync(casmPath, "utf-8"));
  console.log("Loaded artifacts");

  // Compute class hash
  const classHash = hash.computeContractClassHash(sierraContract);
  console.log("Sierra class hash:", classHash);

  // Check if already declared
  try {
    await provider.getClassByHash(classHash);
    console.log("\nClass already declared on Sepolia!");
    console.log("Class hash:", classHash);
    return classHash;
  } catch {
    console.log("Not yet declared, proceeding...");
  }

  const account = new Account({
    provider,
    address: ADDR,
    signer: PK,
  });

  const nonce = await account.getNonce();
  console.log("Account nonce:", nonce);

  // Get current gas prices from latest block
  const block = await provider.getBlockWithTxHashes("latest");
  const l1Price = BigInt(block.l1_gas_price?.price_in_fri || "0");
  const l1DataPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "0");
  const l2Price = BigInt(block.l2_gas_price?.price_in_fri || "0");
  console.log("Gas prices (fri):");
  console.log("  L1:", l1Price.toString());
  console.log("  L1 data:", l1DataPrice.toString());
  console.log("  L2:", l2Price.toString());

  // Set max price at 2x current price for safety (balance is ~11.88 STRK)
  const l1MaxPrice = l1Price * 2n;
  const l1DataMaxPrice = l1DataPrice > 0n ? l1DataPrice * 2n : l1Price * 2n;
  const l2MaxPrice = l2Price > 0n ? l2Price * 2n : 1000000000n;

  // L2 gas for declare: ~416M actual, set 450M with 2x price
  const rb = {
    l1_gas: { max_amount: 3000n, max_price_per_unit: l1MaxPrice },
    l2_gas: { max_amount: 450000000n, max_price_per_unit: l2MaxPrice },
    l1_data_gas: { max_amount: 3000n, max_price_per_unit: l1DataMaxPrice },
  };

  // Verify total doesn't exceed balance (11.88 STRK)
  const totalMax =
    rb.l1_gas.max_amount * rb.l1_gas.max_price_per_unit +
    rb.l2_gas.max_amount * rb.l2_gas.max_price_per_unit +
    rb.l1_data_gas.max_amount * rb.l1_data_gas.max_price_per_unit;
  console.log("Total max cost:", totalMax.toString(), "fri");
  console.log("  =", (totalMax / 10n ** 18n).toString(), "STRK +", (totalMax % 10n ** 18n).toString(), "fri");

  // Attempt declare — may need to retry with sequencer's expected CASM hash
  let declareResult;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const opts = {
        contract: sierraContract,
        casm: casmContract,
      };
      if (EXPECTED_CASM_HASH) {
        opts.compiledClassHash = EXPECTED_CASM_HASH;
      }
      console.log(`\nDeclare attempt ${attempt + 1}${EXPECTED_CASM_HASH ? ` with CASM hash: ${EXPECTED_CASM_HASH}` : ""}...`);

      declareResult = await account.declare(opts, {
        nonce,
        resourceBounds: rb,
        tip: 0n,
      });
      break; // success
    } catch (err) {
      const msg = err.message || "";

      // Already declared
      if (msg.includes("already declared") || msg.includes("CLASS_ALREADY_DECLARED")) {
        console.log("Already declared! Class hash:", classHash);
        return classHash;
      }

      // CASM hash mismatch — extract expected hash from error
      if (msg.includes("Mismatch compiled class hash")) {
        const hashes = msg.match(/Expected:\s*(0x[0-9a-fA-F]+)/);
        if (hashes) {
          EXPECTED_CASM_HASH = hashes[1];
          console.log("  CASM mismatch, retrying with:", EXPECTED_CASM_HASH);
          continue;
        }
      }

      // Extract error from huge message
      if (err.baseError) {
        const data = err.baseError.data || "";
        if (data.includes("Mismatch compiled class hash")) {
          const hashes = data.match(/Expected:\s*(0x[0-9a-fA-F]+)/);
          if (hashes) {
            EXPECTED_CASM_HASH = hashes[1];
            console.log("  CASM mismatch (from baseError), retrying with:", EXPECTED_CASM_HASH);
            continue;
          }
        }
        console.error("Base error:", JSON.stringify(err.baseError, null, 2).substring(0, 1000));
      }

      // Generic error extraction from long messages
      const tail = msg.substring(Math.max(0, msg.lastIndexOf("}") - 500));
      console.error("Error tail:", tail.substring(tail.length - 300));
      throw err;
    }
  }

  console.log("Tx hash:", declareResult.transaction_hash);
  console.log("Class hash:", declareResult.class_hash);
  console.log("\nWaiting for confirmation...");

  const receipt = await provider.waitForTransaction(
    declareResult.transaction_hash
  );
  console.log("Status:", receipt.execution_status || receipt.status);

  if (
    receipt.execution_status === "REVERTED" ||
    receipt.revert_reason
  ) {
    console.error("REVERTED:", receipt.revert_reason);
    process.exit(1);
  }

  console.log("\n=== Declared Successfully ===");
  console.log("Class hash:", declareResult.class_hash);
  return declareResult.class_hash;
}

main().catch((err) => {
  const msg = err.message || "";
  // Extract error from the end of the message (after the huge contract dump)
  const lastBrace = msg.lastIndexOf("}");
  if (lastBrace > 0) {
    // Find the response part after contract dump
    const tail = msg.substring(Math.max(0, lastBrace - 500));
    console.error("\nError tail:", tail);
  }
  // Also check for specific error patterns
  const errMatch = msg.match(/"error"\s*:\s*\{[^}]*\}/g);
  if (errMatch) {
    errMatch.forEach((e) => console.error("RPC error:", e));
  }
  const codeMatch = msg.match(/code[=:]?\s*(-?\d+)/g);
  const messageMatch = msg.match(/"message"\s*:\s*"([^"]+)"/g);
  if (codeMatch) console.error("Codes:", codeMatch);
  if (messageMatch) console.error("Messages:", messageMatch);

  // Check baseError
  if (err.baseError) {
    console.error("Base error:", JSON.stringify(err.baseError, null, 2).substring(0, 1000));
  }

  process.exit(1);
});
