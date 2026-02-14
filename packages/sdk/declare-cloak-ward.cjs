/**
 * Declare the CloakWard contract class on Sepolia.
 *
 * Usage: node declare-cloak-ward.cjs
 *
 * Reads the compiled Sierra + CASM from snfoundry build output,
 * declares via Account.declare(), and prints the class hash.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { RpcProvider, Account, json } = require("starknet");

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
// Use Account 1 to declare (has STRK for gas)
const DECLARER_PK = process.env.FUNDER_PK;
const DECLARER_ADDRESS = process.env.FUNDER_ADDRESS;

const CONTRACTS_DIR = path.resolve(
  __dirname,
  "../snfoundry/contracts/target/dev"
);

async function main() {
  console.log("=== CloakWard Declaration Script ===\n");

  const provider = new RpcProvider({ nodeUrl: RPC_URL });

  // Read compiled artifacts
  const sierraPath = path.join(
    CONTRACTS_DIR,
    "contracts_CloakWard.contract_class.json"
  );
  const casmPath = path.join(
    CONTRACTS_DIR,
    "contracts_CloakWard.compiled_contract_class.json"
  );

  if (!fs.existsSync(sierraPath) || !fs.existsSync(casmPath)) {
    console.error("Build artifacts not found. Run `scarb build` first.");
    process.exit(1);
  }

  const sierraContract = json.parse(fs.readFileSync(sierraPath, "utf-8"));
  const casmContract = json.parse(fs.readFileSync(casmPath, "utf-8"));

  console.log("Loaded Sierra + CASM artifacts");
  console.log(
    "  Sierra size:",
    Math.round(fs.statSync(sierraPath).size / 1024) + "KB"
  );
  console.log(
    "  CASM size:",
    Math.round(fs.statSync(casmPath).size / 1024) + "KB"
  );

  // Create account for declaration
  const account = new Account({
    provider,
    address: DECLARER_ADDRESS,
    signer: DECLARER_PK,
  });

  // Check if already declared
  try {
    // Compute class hash from Sierra
    const { computeContractClassHash, computeCompiledClassHash } =
      require("starknet");

    if (computeContractClassHash) {
      const classHash = computeContractClassHash(sierraContract);
      console.log("\nComputed class hash:", classHash);

      try {
        const existing = await provider.getClassByHash(classHash);
        if (existing) {
          console.log("\nClass already declared on Sepolia!");
          console.log("Class hash:", classHash);
          return;
        }
      } catch {
        // Not declared yet, continue
      }
    }
  } catch {
    // computeContractClassHash not available, continue with declaration
  }

  // Declare
  // CASM hash workaround: local scarb CASM hash doesn't match sequencer's.
  // Use the network's expected hash directly.
  const EXPECTED_COMPILED_CLASS_HASH =
    "0x657bb2d68a7126505cb6ff37bd8ff4622949becdf1b83d41a66c6e445f2c858";

  console.log("\nDeclaring CloakWard on Sepolia...");
  console.log("  Using expected compiled class hash:", EXPECTED_COMPILED_CLASS_HASH);
  try {
    const declareResult = await account.declare({
      contract: sierraContract,
      casm: casmContract,
      compiledClassHash: EXPECTED_COMPILED_CLASS_HASH,
    });

    console.log("  Transaction hash:", declareResult.transaction_hash);
    console.log("  Class hash:", declareResult.class_hash);
    console.log("\n  Waiting for confirmation...");

    await provider.waitForTransaction(declareResult.transaction_hash);
    console.log("  Declared successfully!");

    console.log("\n=== CloakWard Class Hash ===");
    console.log(declareResult.class_hash);
    console.log(
      "\nUpdate CLOAK_WARD_CLASS_HASH in your code with this value."
    );
  } catch (err) {
    // Handle "already declared" error
    if (
      err.message &&
      (err.message.includes("already declared") ||
        err.message.includes("CLASS_ALREADY_DECLARED"))
    ) {
      console.log("\nClass already declared on Sepolia.");
      // Try to extract class hash from error or compute it
      console.log("Error details:", err.message);
    } else if (
      err.message &&
      err.message.includes("is not a EthAddress or EthAddress256")
    ) {
      // CASM hash mismatch — extract the expected hash
      console.log("\nCASM hash mismatch. Try with the expected hash.");
      console.log("Error:", err.message);

      // Parse expected compiled class hash from error if available
      const match = err.message.match(
        /expected compiled_class_hash\s+(0x[0-9a-fA-F]+)/
      );
      if (match) {
        console.log("\nRetrying with expected compiled class hash:", match[1]);
        const retryResult = await account.declare({
          contract: sierraContract,
          casm: casmContract,
          compiledClassHash: match[1],
        });
        console.log("  Transaction hash:", retryResult.transaction_hash);
        console.log("  Class hash:", retryResult.class_hash);
        await provider.waitForTransaction(retryResult.transaction_hash);
        console.log("  Declared successfully!");
        console.log("\n=== CloakWard Class Hash ===");
        console.log(retryResult.class_hash);
      }
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("\nDeclaration failed:", err.message || err);
  if (err.message && err.message.includes("compiled_class_hash")) {
    // Extract the expected hash from Starknet error
    const match = err.message.match(/(0x[0-9a-fA-F]{50,})/g);
    if (match && match.length >= 2) {
      console.log("\nExpected compiled class hash:", match[1]);
      console.log("Retry with: compiledClassHash:", match[1]);
    }
  }
  process.exit(1);
});
