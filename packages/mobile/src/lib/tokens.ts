/**
 * Token configuration for Sepolia.
 */

export type TokenKey = "STRK" | "ETH" | "USDC";

export type TokenConfig = {
  symbol: TokenKey;
  name: string;
  decimals: number;
  tongoContract: string;
  erc20Contract: string;
  rate: bigint;
  icon: string;
};

export const TOKENS: Record<TokenKey, TokenConfig> = {
  STRK: {
    symbol: "STRK",
    name: "Starknet Token",
    decimals: 18,
    tongoContract: "0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
    erc20Contract: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    rate: 50000000000000000n,
    icon: "S",
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    tongoContract: "0x02cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
    erc20Contract: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    rate: 3000000000000n,
    icon: "E",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    tongoContract: "0x02caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
    erc20Contract: "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080",
    rate: 10000n,
    icon: "U",
  },
};

/** Convert Tongo units to display amount */
export function tongoToDisplay(tongoUnits: string | bigint, token: TokenKey): string {
  const units = BigInt(tongoUnits);
  const rate = TOKENS[token].rate;
  const decimals = TOKENS[token].decimals;
  const erc20Amount = units * rate;
  const divisor = 10n ** BigInt(decimals);
  const whole = erc20Amount / divisor;
  const fraction = erc20Amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  if (whole === 0n && fraction === 0n) return "0";
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fractionStr}`.replace(/0+$/, "").replace(/\.$/, "");
}

/** Convert raw ERC20 wei string to human-readable display */
export function erc20ToDisplay(rawBalance: string | bigint, token: TokenKey): string {
  const balance = BigInt(rawBalance);
  const decimals = TOKENS[token].decimals;
  const divisor = 10n ** BigInt(decimals);
  const whole = balance / divisor;
  const fraction = balance % divisor;
  if (whole === 0n && fraction === 0n) return "0";
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fractionStr}`.replace(/0+$/, "").replace(/\.$/, "");
}

/** Format with token symbol */
export function formatBalance(tongoUnits: string | bigint, token: TokenKey): string {
  return `${tongoToDisplay(tongoUnits, token)} ${token}`;
}

/** Pluralize "unit" / "units" based on count */
export function unitLabel(n: string | number): string {
  const s = String(n).replace(/\D/g, "");
  return s === "1" ? "1 unit" : `${n} units`;
}

/** Convert Tongo units to ERC20 display string with symbol, e.g. "1" STRK → "0.05 STRK" */
export function tongoUnitToErc20Display(units: string, token: TokenKey): string {
  return `${tongoToDisplay(units, token)} ${token}`;
}
