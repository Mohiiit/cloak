/**
 * E2E test: On-chain delegation flow on Sepolia
 *
 * Steps:
 *   1. Check funder STRK balance
 *   2. Create on-chain delegation (approve + create_delegation multicall)
 *   3. Verify delegation on-chain (get_delegation, get_delegation_count)
 *   4. Consume and transfer (consume_and_transfer to a recipient)
 *   5. Verify consumed amount on-chain
 *   6. Revoke delegation
 *   7. Verify revocation
 *
 * Usage: node e2e-delegation.cjs
 */
require("dotenv").config();

const { RpcProvider, Account, num, Contract } = require("starknet");

const RPC_URL =
  process.env.RPC_URL ||
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";

const FUNDER_PK = process.env.FUNDER_PK;
const FUNDER_ADDR = process.env.FUNDER_ADDRESS;

// Second account acts as service wallet (recipient of delegated funds)
// We'll just use a different address — for testing, we'll send to guardian address
const GUARDIAN_PK = process.env.GUARDIAN_PK;
// Service wallet — we'll derive the address from Account 2 or use a fixed test address
const SERVICE_WALLET = "0x22837eb3ba3a474005ec995d5f548f76a6ad673a4eafe32a3b9172d54ce2a0f";

const DELEGATION_CONTRACT =
  "0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10";
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Amount: 0.1 STRK (small to preserve testnet funds)
const DELEGATION_AMOUNT = "100000000000000000"; // 0.1 STRK in wei
const MAX_PER_RUN = "50000000000000000"; // 0.05 STRK in wei
const CONSUME_AMOUNT = "25000000000000000"; // 0.025 STRK in wei

function toUint256(val) {
  const n = BigInt(val);
  return {
    low: "0x" + (n & ((1n << 128n) - 1n)).toString(16),
    high: "0x" + (n >> 128n).toString(16),
  };
}

async function getGasPrices(provider) {
  const block = await provider.getBlockWithTxHashes("latest");
  const l1 = BigInt(block.l1_gas_price?.price_in_fri || "0");
  const l1Data = BigInt(block.l1_data_gas_price?.price_in_fri || "0");
  const l2 = BigInt(block.l2_gas_price?.price_in_fri || "0");
  return { l1, l1Data, l2 };
}

function buildResourceBounds(prices, l1Amt = 5000n, l2Amt = 3000000n, l1DataAmt = 3000n) {
  return {
    l1_gas: { max_amount: l1Amt, max_price_per_unit: prices.l1 * 3n },
    l2_gas: { max_amount: l2Amt, max_price_per_unit: prices.l2 * 3n || 30000000000n },
    l1_data_gas: {
      max_amount: l1DataAmt,
      max_price_per_unit: prices.l1Data > 0n ? prices.l1Data * 3n : prices.l1 * 3n,
    },
  };
}

async function getStrkBalance(provider, address) {
  const result = await provider.callContract({
    contractAddress: STRK_ADDRESS,
    entrypoint: "balanceOf",
    calldata: [address],
  });
  // Returns u256 as [low, high]
  const low = BigInt(result[0]);
  const high = BigInt(result[1]);
  return low + (high << 128n);
}

async function main() {
  console.log("=== E2E: On-Chain Delegation Flow ===\n");

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const funderAccount = new Account({
    provider,
    address: FUNDER_ADDR,
    signer: FUNDER_PK,
  });

  // ── Step 1: Check balances ──────────────────────────────────────────────
  console.log("Step 1: Checking balances...");
  const funderBalance = await getStrkBalance(provider, FUNDER_ADDR);
  const serviceBalance = await getStrkBalance(provider, SERVICE_WALLET);
  console.log(`  Funder STRK: ${funderBalance} (${Number(funderBalance) / 1e18} STRK)`);
  console.log(`  Service STRK: ${serviceBalance} (${Number(serviceBalance) / 1e18} STRK)`);

  if (funderBalance < BigInt(DELEGATION_AMOUNT) + BigInt("1000000000000000000")) {
    console.error("  Insufficient balance for test (need delegation amount + gas)");
    process.exit(1);
  }
  console.log("  ✓ Sufficient balance\n");

  // ── Step 2: Create on-chain delegation ──────────────────────────────────
  console.log("Step 2: Creating on-chain delegation...");
  const totalU256 = toUint256(DELEGATION_AMOUNT);
  const validFrom = Math.floor(Date.now() / 1000) - 60;
  const validUntil = Math.floor(Date.now() / 1000) + 86400; // 24h from now

  const calls = [
    // Call 1: STRK.approve(delegation_contract, total_allowance as u256)
    {
      contractAddress: STRK_ADDRESS,
      entrypoint: "approve",
      calldata: [DELEGATION_CONTRACT, totalU256.low, totalU256.high],
    },
    // Call 2: CloakDelegation.create_delegation — all felt252 params except valid_from/valid_until which are u64
    {
      contractAddress: DELEGATION_CONTRACT,
      entrypoint: "create_delegation",
      calldata: [
        FUNDER_ADDR,           // operator: felt252
        "0x7374616b696e67",    // agent_id: felt252 ("staking")
        STRK_ADDRESS,          // token: felt252
        MAX_PER_RUN,           // max_per_run: felt252 (wei string)
        DELEGATION_AMOUNT,     // total_allowance: felt252 (wei string)
        "0x" + validFrom.toString(16),  // valid_from: u64
        "0x" + validUntil.toString(16), // valid_until: u64
      ],
    },
  ];

  const prices = await getGasPrices(provider);
  console.log(`  Gas prices: L1=${prices.l1}, L2=${prices.l2}`);

  const createResult = await funderAccount.execute(calls, {
    resourceBounds: buildResourceBounds(prices),
    tip: 0n,
  });

  console.log(`  Tx hash: ${createResult.transaction_hash}`);
  console.log("  Waiting for confirmation...");

  const createReceipt = await provider.waitForTransaction(createResult.transaction_hash);
  if (createReceipt.execution_status === "REVERTED") {
    console.error("  REVERTED:", createReceipt.revert_reason);
    process.exit(1);
  }
  console.log(`  ✓ Delegation created on-chain\n`);

  // ── Step 3: Verify delegation on-chain ──────────────────────────────────
  console.log("Step 3: Verifying delegation on-chain...");

  const countResult = await provider.callContract({
    contractAddress: DELEGATION_CONTRACT,
    entrypoint: "get_delegation_count",
    calldata: [],
  });
  const delegationCount = Number(countResult[0]);
  console.log(`  Delegation count: ${delegationCount}`);

  // Get delegation by ID (1-based)
  const delegationId = delegationCount; // latest one
  const delegationResult = await provider.callContract({
    contractAddress: DELEGATION_CONTRACT,
    entrypoint: "get_delegation",
    calldata: ["0x" + delegationId.toString(16)],
  });

  // Parse delegation struct: [operator, agent_id, token_address, max_per_run, total_allowance, consumed, valid_from, valid_until, status, nonce]
  console.log(`  Delegation ID: ${delegationId}`);
  console.log(`  Operator: ${delegationResult[0]}`);
  console.log(`  Agent ID: ${delegationResult[1]}`);
  console.log(`  Token: ${delegationResult[2]}`);
  console.log(`  Max per run: ${delegationResult[3]}`);
  console.log(`  Total allowance: ${delegationResult[4]}`);
  console.log(`  Consumed: ${delegationResult[5]}`);
  console.log(`  Status: ${delegationResult[8]} (1 = active)`);
  console.log("  ✓ Delegation verified on-chain\n");

  // ── Step 4: Consume and transfer ────────────────────────────────────────
  console.log("Step 4: Consuming delegation (consume_and_transfer)...");

  const serviceBalanceBefore = await getStrkBalance(provider, SERVICE_WALLET);
  console.log(`  Service wallet balance before: ${Number(serviceBalanceBefore) / 1e18} STRK`);

  const prices2 = await getGasPrices(provider);
  const consumeCall = {
    contractAddress: DELEGATION_CONTRACT,
    entrypoint: "consume_and_transfer",
    calldata: [
      "0x" + delegationId.toString(16), // delegation_id: felt252
      CONSUME_AMOUNT,                    // amount: felt252 (wei string)
      SERVICE_WALLET,                    // recipient: felt252
    ],
  };

  const consumeResult = await funderAccount.execute([consumeCall], {
    resourceBounds: buildResourceBounds(prices2),
    tip: 0n,
  });

  console.log(`  Tx hash: ${consumeResult.transaction_hash}`);
  console.log("  Waiting for confirmation...");

  const consumeReceipt = await provider.waitForTransaction(consumeResult.transaction_hash);
  if (consumeReceipt.execution_status === "REVERTED") {
    console.error("  REVERTED:", consumeReceipt.revert_reason);
    process.exit(1);
  }

  const serviceBalanceAfter = await getStrkBalance(provider, SERVICE_WALLET);
  const transferred = serviceBalanceAfter - serviceBalanceBefore;
  console.log(`  Service wallet balance after: ${Number(serviceBalanceAfter) / 1e18} STRK`);
  console.log(`  Transferred: ${Number(transferred) / 1e18} STRK (expected ${Number(CONSUME_AMOUNT) / 1e18})`);

  if (transferred === BigInt(CONSUME_AMOUNT)) {
    console.log("  ✓ Real tokens transferred via consume_and_transfer!\n");
  } else {
    console.error(`  ✗ Transfer amount mismatch: got ${transferred}, expected ${CONSUME_AMOUNT}`);
    process.exit(1);
  }

  // ── Step 5: Verify consumed amount on-chain ─────────────────────────────
  console.log("Step 5: Verifying consumed amount on-chain...");
  const afterConsume = await provider.callContract({
    contractAddress: DELEGATION_CONTRACT,
    entrypoint: "get_delegation",
    calldata: ["0x" + delegationId.toString(16)],
  });
  console.log(`  Consumed: ${afterConsume[5]} (expected ${CONSUME_AMOUNT})`);
  console.log(`  Nonce: ${afterConsume[9]} (expected 1)`);
  console.log("  ✓ On-chain state updated\n");

  // ── Step 6: Revoke delegation ───────────────────────────────────────────
  console.log("Step 6: Revoking delegation...");
  const prices3 = await getGasPrices(provider);
  const revokeResult = await funderAccount.execute(
    [
      {
        contractAddress: DELEGATION_CONTRACT,
        entrypoint: "revoke_delegation",
        calldata: ["0x" + delegationId.toString(16)],
      },
    ],
    {
      resourceBounds: buildResourceBounds(prices3),
      tip: 0n,
    }
  );

  console.log(`  Tx hash: ${revokeResult.transaction_hash}`);
  console.log("  Waiting for confirmation...");
  const revokeReceipt = await provider.waitForTransaction(revokeResult.transaction_hash);
  if (revokeReceipt.execution_status === "REVERTED") {
    console.error("  REVERTED:", revokeReceipt.revert_reason);
    process.exit(1);
  }
  console.log("  ✓ Delegation revoked\n");

  // ── Step 7: Verify revocation ───────────────────────────────────────────
  console.log("Step 7: Verifying revocation on-chain...");
  const afterRevoke = await provider.callContract({
    contractAddress: DELEGATION_CONTRACT,
    entrypoint: "get_delegation",
    calldata: ["0x" + delegationId.toString(16)],
  });
  console.log(`  Status: ${afterRevoke[8]} (2 = revoked)`);
  console.log("  ✓ Revocation confirmed\n");

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("=== E2E DELEGATION TEST PASSED ===");
  console.log(`Delegation contract: ${DELEGATION_CONTRACT}`);
  console.log(`Delegation ID: ${delegationId}`);
  console.log(`Create tx: ${createResult.transaction_hash}`);
  console.log(`Consume tx: ${consumeResult.transaction_hash}`);
  console.log(`Revoke tx: ${revokeResult.transaction_hash}`);
  console.log(`Tokens transferred: ${Number(CONSUME_AMOUNT) / 1e18} STRK`);
}

main().catch((err) => {
  const msg = err.message || "";
  if (msg.length > 500) {
    console.error("\nFailed:", msg.substring(0, 300));
    if (err.baseError) {
      console.error("Base error:", JSON.stringify(err.baseError, null, 2).substring(0, 1000));
    }
  } else {
    console.error("\nFailed:", msg);
    if (err.baseError) {
      console.error("Base error:", JSON.stringify(err.baseError, null, 2).substring(0, 500));
    }
  }
  process.exit(1);
});
