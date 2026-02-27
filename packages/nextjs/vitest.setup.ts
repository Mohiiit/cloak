import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (!process.env.X402_FACILITATOR_SECRET) {
  process.env.X402_FACILITATOR_SECRET = "x402-test-secret";
}
if (!process.env.X402_VERIFY_ONCHAIN_SETTLEMENT) {
  process.env.X402_VERIFY_ONCHAIN_SETTLEMENT = "false";
}
if (!process.env.X402_MAX_HEADER_BYTES) {
  process.env.X402_MAX_HEADER_BYTES = "2097152";
}
if (!process.env.MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY) {
  process.env.MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY = "false";
}
if (!process.env.ERC8004_WRITE_ENABLED) {
  process.env.ERC8004_WRITE_ENABLED = "false";
}

// Automatically cleanup after each test (skip in node environment)
if (typeof window !== "undefined") {
  afterEach(() => {
    cleanup();
  });
}

// Mock window.matchMedia (guard for node environment tests)
if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
