#!/usr/bin/env node
"use strict";

const { Account, CallData, RpcProvider, cairo } = require("starknet");

const STRK_CONTRACT =
  process.env.STRK_CONTRACT ||
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const RPC_URL =
  process.env.STARKNET_RPC_URL ||
  "https://rpc.starknet-testnet.lava.build";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function toUnits(amount, decimals) {
  const normalized = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const [whole, frac = ""] = normalized.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recipient = args.address || process.env.DEPLOY_ADDRESS;
  const amount = args.amount || process.env.FUND_AMOUNT || "0.8";
  const funderAddress = args.funderAddress || process.env.FUNDER_ADDRESS;
  const funderPrivateKey = args.funderPrivateKey || process.env.FUNDER_PRIVATE_KEY;

  if (!recipient) {
    throw new Error("Missing recipient address. Pass --address 0x...");
  }
  if (!funderAddress || !funderPrivateKey) {
    throw new Error(
      "Missing funder credentials. Set FUNDER_ADDRESS and FUNDER_PRIVATE_KEY.",
    );
  }

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({
    provider,
    address: funderAddress,
    signer: funderPrivateKey,
  });

  const amountWei = toUnits(amount, 18);
  const transferCall = {
    contractAddress: STRK_CONTRACT,
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient,
      amount: cairo.uint256(amountWei),
    }),
  };

  const tx = await account.execute([transferCall]);
  const txHash = tx.transaction_hash;
  await provider.waitForTransaction(txHash);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        recipient,
        amount,
        amountWei: amountWei.toString(),
        txHash,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`[fund-stark-address] ${error?.message || String(error)}\n`);
  process.exit(1);
});
