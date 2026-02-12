import type { TokenKey, TokenConfig } from "./types";

export const TOKENS: Record<TokenKey, TokenConfig> = {
  STRK: {
    symbol: "STRK",
    name: "Starknet Token",
    decimals: 18,
    erc20Address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    tongoContract: "0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
    rate: 50000000000000000n,
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    erc20Address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    tongoContract: "0x02cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
    rate: 3000000000000n,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    erc20Address: "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080",
    tongoContract: "0x02caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
    rate: 10000n,
  },
} as const;

export const DEFAULT_TOKEN: TokenKey = "STRK";

export function getTokenBySymbol(symbol: TokenKey): TokenConfig {
  return TOKENS[symbol];
}

export function formatTokenAmount(amount: bigint, decimals: number, maxDecimals = 4): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  if (remainder === 0n) return whole.toString();

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.slice(0, maxDecimals).replace(/0+$/, "");
  if (!trimmed) return whole.toString();
  return `${whole}.${trimmed}`;
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  const parts = amount.split(".");
  const whole = BigInt(parts[0] || "0");
  const frac = parts[1] || "";
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return whole * 10n ** BigInt(decimals) + BigInt(paddedFrac);
}
