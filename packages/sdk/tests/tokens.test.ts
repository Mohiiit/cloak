import { describe, it, expect } from "vitest";
import { TOKENS, formatTokenAmount, parseTokenAmount, getTokenBySymbol } from "../src/tokens";

describe("tokens", () => {
  it("has all three tokens defined", () => {
    expect(TOKENS.STRK).toBeDefined();
    expect(TOKENS.ETH).toBeDefined();
    expect(TOKENS.USDC).toBeDefined();
  });

  it("getTokenBySymbol returns correct token", () => {
    const strk = getTokenBySymbol("STRK");
    expect(strk.symbol).toBe("STRK");
    expect(strk.decimals).toBe(18);
  });

  describe("formatTokenAmount", () => {
    it("formats whole numbers", () => {
      expect(formatTokenAmount(1000000000000000000n, 18)).toBe("1");
      expect(formatTokenAmount(5000000n, 6)).toBe("5");
    });

    it("formats fractional amounts", () => {
      expect(formatTokenAmount(1500000000000000000n, 18)).toBe("1.5");
      expect(formatTokenAmount(1050000n, 6)).toBe("1.05");
    });

    it("formats zero", () => {
      expect(formatTokenAmount(0n, 18)).toBe("0");
    });

    it("respects maxDecimals", () => {
      expect(formatTokenAmount(1123456789012345678n, 18, 2)).toBe("1.12");
    });
  });

  describe("parseTokenAmount", () => {
    it("parses whole numbers", () => {
      expect(parseTokenAmount("1", 18)).toBe(1000000000000000000n);
      expect(parseTokenAmount("5", 6)).toBe(5000000n);
    });

    it("parses decimals", () => {
      expect(parseTokenAmount("1.5", 18)).toBe(1500000000000000000n);
      expect(parseTokenAmount("0.05", 18)).toBe(50000000000000000n);
    });

    it("round-trips with format", () => {
      const amount = 2500000000000000000n;
      const formatted = formatTokenAmount(amount, 18);
      const parsed = parseTokenAmount(formatted, 18);
      expect(parsed).toBe(amount);
    });
  });
});
