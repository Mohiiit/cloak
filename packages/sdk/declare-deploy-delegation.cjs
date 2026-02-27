/**
 * Declare and deploy the CloakDelegation contract on Sepolia.
 *
 * Usage: node declare-deploy-delegation.cjs
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { RpcProvider, Account, json, num } = require("starknet");

const required = ["FUNDER_PK", "FUNDER_ADDRESS"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const RPC_URL =
  process.env.RPC_URL ||
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const DECLARER_PK = process.env.FUNDER_PK;
const DECLARER_ADDRESS = process.env.FUNDER_ADDRESS;

const CONTRACTS_DIR = path.resolve(
  __dirname,
  "../snfoundry/contracts/target/dev"
);

async function main() {
  console.log("=== CloakDelegation Declare + Deploy ===\n");

  const provider = new RpcProvider({ nodeUrl: RPC_URL });

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

  const account = new Account({
    provider,
    address: DECLARER_ADDRESS,
    signer: DECLARER_PK,
  });

  // ─── Step 1: Declare ──────────────────────────────────────────────
  let classHash;

  // Try to compute class hash first
  try {
    const { computeContractClassHash } = require("starknet");
    if (computeContractClassHash) {
      classHash = computeContractClassHash(sierraContract);
      console.log("Computed class hash:", classHash);

      try {
        await provider.getClassByHash(classHash);
        console.log("Class already declared on Sepolia!");
      } catch {
        classHash = null; // Need to declare
      }
    }
  } catch {
    // Proceed to declare
  }

  if (!classHash) {
    console.log("\nDeclaring CloakDelegation...");

    // Try declare, handle CASM hash mismatch
    let declareAttempts = 0;
    let compiledClassHash = undefined;

    while (declareAttempts < 3) {
      declareAttempts++;
      try {
        const opts = {
          contract: sierraContract,
          casm: casmContract,
        };
        if (compiledClassHash) {
          opts.compiledClassHash = compiledClassHash;
        }

        const declareResult = await account.declare(opts);
        classHash = declareResult.class_hash;
        console.log("  Tx hash:", declareResult.transaction_hash);
        console.log("  Class hash:", classHash);
        console.log("  Waiting for confirmation...");
        await provider.waitForTransaction(declareResult.transaction_hash);
        console.log("  Declared!");
        break;
      } catch (err) {
        const msg = err.message || "";
        if (
          msg.includes("already declared") ||
          msg.includes("CLASS_ALREADY_DECLARED")
        ) {
          // Extract class hash from error if possible
          try {
            const { computeContractClassHash } = require("starknet");
            classHash = computeContractClassHash(sierraContract);
            console.log("  Already declared. Class hash:", classHash);
          } catch {
            console.error("  Already declared but could not compute hash.");
            throw err;
          }
          break;
        }

        // CASM hash mismatch — extract expected hash
        const hashMatch = msg.match(/(0x[0-9a-fA-F]{50,})/g);
        if (hashMatch && hashMatch.length >= 2 && !compiledClassHash) {
          compiledClassHash = hashMatch[1];
          console.log("  CASM mismatch, retrying with:", compiledClassHash);
          continue;
        }

        // Fee estimation error — try with explicit resource bounds
        if (msg.includes("estimateFee") || msg.includes("estimate_fee")) {
          console.log("  Fee estimation failed, trying with manual bounds...");
          try {
            const opts = {
              contract: sierraContract,
              casm: casmContract,
            };
            if (compiledClassHash) opts.compiledClassHash = compiledClassHash;

            // Use explicit resource bounds to skip fee estimation
            const nonce = await account.getNonce();
            const declareResult = await account.declare(opts, {
              nonce,
              resourceBounds: {
                l1_gas: { max_amount: 10000n, max_price_per_unit: 100000000000n },
                l2_gas: { max_amount: 2000000n, max_price_per_unit: 100000000000n },
                l1_data_gas: { max_amount: 10000n, max_price_per_unit: 100000000000n },
              },
              tip: 0n,
            });
            classHash = declareResult.class_hash;
            console.log("  Tx hash:", declareResult.transaction_hash);
            console.log("  Class hash:", classHash);
            console.log("  Waiting for confirmation...");
            await provider.waitForTransaction(declareResult.transaction_hash);
            console.log("  Declared!");
            break;
          } catch (innerErr) {
            console.error("  Manual bounds also failed:", innerErr.message?.substring(0, 200));
            throw innerErr;
          }
        }

        throw err;
      }
    }
  }

  if (!classHash) {
    console.error("Failed to get class hash after declaration attempts");
    process.exit(1);
  }

  console.log("\n=== Class Hash ===");
  console.log(classHash);

  // ─── Step 2: Deploy via UDC ───────────────────────────────────────
  console.log("\nDeploying CloakDelegation instance...");

  const salt = BigInt(Date.now());
  const deployResult = await account.deploy({
    classHash,
    constructorCalldata: [],
    salt: "0x" + salt.toString(16),
    unique: true,
  });

  console.log("  Deploy tx:", deployResult.transaction_hash);

  const contractAddress = deployResult.contract_address?.[0];
  if (contractAddress) {
    console.log("  Contract:", contractAddress);
  }

  console.log("  Waiting for confirmation...");
  await provider.waitForTransaction(deployResult.transaction_hash);

  const finalAddress = contractAddress || "(check tx on Voyager)";
  console.log("\n=== Deployment Complete ===");
  console.log("Class Hash:       ", classHash);
  console.log("Contract Address: ", finalAddress);

  // Verify
  if (contractAddress) {
    console.log("\nVerifying...");
    try {
      const result = await provider.callContract({
        contractAddress,
        entrypoint: "get_delegation_count",
        calldata: [],
      });
      console.log("  get_delegation_count() =", result[0], "(expected 0x0)");
      console.log("  Verified!");
    } catch (err) {
      console.error("  Verification failed:", err.message);
    }
  }

  console.log(
    "\nUpdate CLOAK_DELEGATION_CLASS_HASH and CLOAK_DELEGATION_ADDRESS in packages/sdk/src/config.ts"
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message?.substring(0, 500) || err);
  process.exit(1);
});
