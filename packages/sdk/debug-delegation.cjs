/**
 * Debug: Check allowance and delegation state after create
 */
require("dotenv").config();

const { RpcProvider } = require("starknet");

const RPC_URL = process.env.RPC_URL;
const FUNDER_ADDR = process.env.FUNDER_ADDRESS;
const DELEGATION_CONTRACT = "0x409860e9e0070d962010ce99cbba05bc5ac03edfdffd729dddb63c43936ae5";
const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });

  // Check STRK allowance: owner=funder, spender=delegation_contract
  console.log("Checking STRK allowance...");
  const allowance = await provider.callContract({
    contractAddress: STRK_ADDRESS,
    entrypoint: "allowance",
    calldata: [FUNDER_ADDR, DELEGATION_CONTRACT],
  });
  const allowanceLow = BigInt(allowance[0]);
  const allowanceHigh = BigInt(allowance[1]);
  const totalAllowance = allowanceLow + (allowanceHigh << 128n);
  console.log("  Allowance:", totalAllowance.toString(), `(${Number(totalAllowance) / 1e18} STRK)`);

  // Check delegation state
  console.log("\nChecking delegation #1...");
  const d = await provider.callContract({
    contractAddress: DELEGATION_CONTRACT,
    entrypoint: "get_delegation",
    calldata: ["0x1"],
  });
  console.log("  Raw response:", d);
  console.log("  operator:", d[0]);
  console.log("  agent_id:", d[1]);
  console.log("  token:", d[2]);
  console.log("  max_per_run:", d[3], "=", BigInt(d[3]).toString());
  console.log("  total_allowance:", d[4], "=", BigInt(d[4]).toString());
  console.log("  consumed:", d[5], "=", BigInt(d[5]).toString());
  console.log("  valid_from:", d[6]);
  console.log("  valid_until:", d[7]);
  console.log("  status:", d[8]);
  console.log("  nonce:", d[9]);

  // Check the selector for transfer_from
  // Standard OZ STRK uses: transfer_from with selector
  // Let me also try the camelCase selector
  console.log("\nTrying direct transferFrom simulation via starknet_simulateTransactions or callContract...");

  // Check if we can call transfer_from on STRK with these params
  // The delegation contract should be approved as spender
  console.log("  Delegation contract is the spender:", DELEGATION_CONTRACT);
  console.log("  Funder (owner who approved):", FUNDER_ADDR);
}

main().catch(err => {
  console.error("Error:", err.message?.substring(0, 500));
});
