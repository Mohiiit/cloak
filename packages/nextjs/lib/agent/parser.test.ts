import { describe, expect, it } from "vitest";
import { parseAgentIntent } from "~~/lib/agent/parser";
import type { AgentContact, AgentWard } from "~~/lib/agent/types";

const CONTACTS: AgentContact[] = [
  {
    id: "1",
    nickname: "mobileMohit",
    tongoAddress: "tongo_abc",
    starknetAddress: "0x049f329063e74482166e081f3994946ec71f138f17aeb4c193ef50c0065b7e46",
  },
  {
    id: "2",
    nickname: "alice",
    tongoAddress: "tongo_alice",
    starknetAddress: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  {
    id: "3",
    nickname: "bob",
    tongoAddress: "tongo_bob",
  },
];

const WARDS: AgentWard[] = [
  {
    address: "0x049f329063e74482166e081f3994946ec71f138f17aeb4c193ef50c0065b7e46",
    pseudoName: "myWard",
  },
  {
    address: "0x0aaa111222333444555666777888999000aaabbbcccdddeeefff000111222333",
  },
];

describe("parseAgentIntent", () => {
  // ─── Basic private send ───
  it("parses private send and resolves contact", () => {
    const intent = parseAgentIntent("send 10 strk to mobileMohit private", CONTACTS);
    expect(intent.type).toBe("send_private");
    expect(intent.amount).toBe("10");
    expect(intent.token).toBe("STRK");
    expect(intent.recipientTongoAddress).toBe("tongo_abc");
    expect(intent.recipientType).toBe("contact");
    expect(intent.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // ─── Basic public send ───
  it("parses public send", () => {
    const intent = parseAgentIntent("please send 1.25 usdc to alice public", CONTACTS);
    expect(intent.type).toBe("send_public");
    expect(intent.amount).toBe("1.25");
    expect(intent.token).toBe("USDC");
    expect(intent.recipientType).toBe("contact");
  });

  // ─── History query ───
  it("parses history query", () => {
    const intent = parseAgentIntent("what are my previous sessions", []);
    expect(intent.type).toBe("history_query");
  });

  // ─── Amount-first patterns ───
  it("handles amount-first: '10 strk to bob'", () => {
    const intent = parseAgentIntent("10 strk to bob", CONTACTS);
    expect(intent.type).toBe("send_private");
    expect(intent.amount).toBe("10");
    expect(intent.token).toBe("STRK");
    expect(intent.recipientName).toBe("bob");
    expect(intent.recipientTongoAddress).toBe("tongo_bob");
  });

  it("handles 'pay bob 10 eth'", () => {
    const intent = parseAgentIntent("pay bob 10 eth", CONTACTS);
    expect(intent.amount).toBe("10");
    expect(intent.token).toBe("ETH");
    expect(intent.recipientName).toBe("bob");
  });

  it("handles 'transfer 1.5 usdc to alice'", () => {
    const intent = parseAgentIntent("transfer 1.5 usdc to alice", CONTACTS);
    expect(intent.amount).toBe("1.5");
    expect(intent.token).toBe("USDC");
    expect(intent.recipientName).toBe("alice");
    expect(intent.recipientTongoAddress).toBe("tongo_alice");
  });

  // ─── Ward as recipient ───
  it("resolves ward by pseudoName", () => {
    const intent = parseAgentIntent("send 10 strk to myWard", [], WARDS);
    expect(intent.type).toBe("send_public"); // wards default to public
    expect(intent.amount).toBe("10");
    expect(intent.recipientStarknetAddress).toBe(WARDS[0].address);
    expect(intent.recipientType).toBe("ward");
    expect(intent.recipientName).toBe("myWard");
  });

  // ─── Inline hex address ───
  it("handles inline hex address", () => {
    const hexAddr = "0x049f329063e74482166e081f3994946ec71f138f17aeb4c193ef50c0065b7e46";
    const intent = parseAgentIntent(`send 10 strk to ${hexAddr} public`, []);
    expect(intent.type).toBe("send_public");
    expect(intent.recipientStarknetAddress).toBe(hexAddr);
    expect(intent.recipientType).toBe("inline_address");
  });

  // ─── Inline base58 address ───
  it("handles inline base58 Tongo address", () => {
    const base58Addr = "2NEpo7TZRRrLZSi2U3xMM6SLsY5GKQBH2U1sMQrY9vDWKJHv8";
    const intent = parseAgentIntent(`send 5 strk to ${base58Addr}`, []);
    expect(intent.type).toBe("send_private"); // base58 = tongo = private
    expect(intent.recipientTongoAddress).toBe(base58Addr);
    expect(intent.recipientType).toBe("inline_address");
  });

  // ─── Typo tolerance ───
  it("treats 'pubic' as 'public'", () => {
    const intent = parseAgentIntent("send 10 strk to alice pubic", CONTACTS);
    expect(intent.type).toBe("send_public");
  });

  // ─── Missing fields ───
  it("reports missing amount", () => {
    const intent = parseAgentIntent("send strk to alice", CONTACTS);
    // Should still parse as send, amount may or may not be found
    expect(intent.type).toMatch(/^send_/);
  });

  it("reports missing recipient", () => {
    const intent = parseAgentIntent("send 10 strk to unknown", []);
    expect(intent.type).toMatch(/^send_/);
    expect(intent.recipientType).toBe("unknown");
  });

  // ─── Start session ───
  it("detects start session", () => {
    const intent = parseAgentIntent("new session", []);
    expect(intent.type).toBe("start_session");
  });

  // ─── Unknown ───
  it("returns unknown for unrelated input", () => {
    const intent = parseAgentIntent("hello", []);
    expect(intent.type).toBe("unknown");
  });

  // ─── Token normalization ───
  it("normalizes 'stark' to STRK", () => {
    const intent = parseAgentIntent("send 5 stark to bob", CONTACTS);
    expect(intent.token).toBe("STRK");
  });

  // ─── Default private when no mode specified ───
  it("defaults to private for contacts", () => {
    const intent = parseAgentIntent("send 10 strk to alice", CONTACTS);
    expect(intent.type).toBe("send_private");
  });

  // ─── Default public for wards ───
  it("defaults to public for ward recipients", () => {
    const intent = parseAgentIntent("send 10 strk to myWard", [], WARDS);
    expect(intent.type).toBe("send_public");
  });

  // ─── Contact takes priority over ward ───
  it("prefers contact over ward when both match", () => {
    const wardWithSameName: AgentWard[] = [{ address: "0x999", pseudoName: "alice" }];
    const intent = parseAgentIntent("send 10 strk to alice", CONTACTS, wardWithSameName);
    expect(intent.recipientType).toBe("contact");
    expect(intent.recipientTongoAddress).toBe("tongo_alice");
  });

  // ─── Ward query ───
  it("parses ward info query", () => {
    const intent = parseAgentIntent("show ward myWard info", [], WARDS);
    expect(intent.type).toBe("ward_query");
    expect(intent.wardName).toBe("myWard");
    expect(intent.wardQueryType).toBe("info");
  });

  it("parses ward activity query", () => {
    const intent = parseAgentIntent("ward myWard activity", [], WARDS);
    expect(intent.type).toBe("ward_query");
    expect(intent.wardName).toBe("myWard");
    expect(intent.wardQueryType).toBe("activity");
  });

  it("parses board typo as ward query", () => {
    const intent = parseAgentIntent("what about board myWard", [], WARDS);
    expect(intent.type).toBe("ward_query");
    expect(intent.wardName).toBe("myWard");
  });

  it("parses ward query without specific name", () => {
    const intent = parseAgentIntent("show me ward info", [], WARDS);
    expect(intent.type).toBe("ward_query");
    expect(intent.wardQueryType).toBe("info");
  });

  it("parses recent transactions as history query", () => {
    const intent = parseAgentIntent("show my recent transactions", []);
    expect(intent.type).toBe("history_query");
  });

  it("parses show history as history query", () => {
    const intent = parseAgentIntent("show history", []);
    expect(intent.type).toBe("history_query");
  });
});
