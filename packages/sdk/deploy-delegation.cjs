/**
 * Deploy CloakDelegation instance via UDC on Sepolia.
 * Usage: node deploy-delegation.cjs
 */
require("dotenv").config();

const { RpcProvider, Account } = require("starknet");

const RPC_URL =
  process.env.RPC_URL ||
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";
const PK = process.env.FUNDER_PK;
const ADDR = process.env.FUNDER_ADDRESS;

const CLASS_HASH =
  "0x6ffc7f7ef8b644f82fbcd0ffca170c84412034bd096a26f8b598007e886f81b";

async function main() {
  console.log("=== CloakDelegation Deploy ===\n");

  const provider = new RpcProvider({ nodeUrl: RPC_URL });

  const account = new Account({
    provider,
    address: ADDR,
    signer: PK,
  });

  // Get current gas prices
  const block = await provider.getBlockWithTxHashes("latest");
  const l1Price = BigInt(block.l1_gas_price?.price_in_fri || "0");
  const l2Price = BigInt(block.l2_gas_price?.price_in_fri || "0");
  console.log("Gas prices - L1:", l1Price.toString(), "L2:", l2Price.toString());

  const salt = BigInt(Date.now());
  console.log("Salt:", "0x" + salt.toString(16));
  console.log("Deploying...");

  const deployResult = await account.deploy(
    {
      classHash: CLASS_HASH,
      constructorCalldata: [],
      salt: "0x" + salt.toString(16),
      unique: true,
    },
    {
      resourceBounds: {
        l1_gas: { max_amount: 5000n, max_price_per_unit: l1Price * 3n },
        l2_gas: { max_amount: 5000000n, max_price_per_unit: l2Price * 3n },
        l1_data_gas: {
          max_amount: 3000n,
          max_price_per_unit:
            BigInt(block.l1_data_gas_price?.price_in_fri || "0") * 3n ||
            l1Price * 3n,
        },
      },
      tip: 0n,
    }
  );

  console.log("Deploy tx:", deployResult.transaction_hash);

  const contractAddress = deployResult.contract_address?.[0];
  if (contractAddress) {
    console.log("Contract address:", contractAddress);
  }

  console.log("Waiting for confirmation...");
  const receipt = await provider.waitForTransaction(
    deployResult.transaction_hash
  );
  console.log("Status:", receipt.execution_status || receipt.status);

  if (receipt.execution_status === "REVERTED") {
    console.error("REVERTED:", receipt.revert_reason);
    process.exit(1);
  }

  const finalAddress = contractAddress || "(check tx on Voyager)";
  console.log("\n=== Deployment Complete ===");
  console.log("Class Hash:       ", CLASS_HASH);
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
      console.error("  Verification failed:", err.message?.substring(0, 200));
    }
  }

  console.log(
    "\nUpdate CLOAK_DELEGATION_ADDRESS in packages/sdk/src/config.ts to:",
    finalAddress
  );
}

main().catch((err) => {
  const msg = err.message || "";
  if (msg.length > 500) {
    const tail = msg.substring(Math.max(0, msg.lastIndexOf("}") - 500));
    console.error("\nError tail:", tail);
  } else {
    console.error("\nFailed:", msg);
  }
  if (err.baseError) {
    console.error(
      "Base error:",
      JSON.stringify(err.baseError, null, 2).substring(0, 1000)
    );
  }
  process.exit(1);
});
