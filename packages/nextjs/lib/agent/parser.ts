import type { AgentContact, AgentIntent, AgentWard } from "~~/lib/agent/types";

const TOKEN_RE = /\b(strk|stark|eth|usdc)\b/i;
const AMOUNT_RE = /\b([0-9]+(?:\.[0-9]+)?)\s*(?:strk|stark|eth|usdc)\b/i;
const AMOUNT_AFTER_VERB_RE = /(?:send|pay|transfer)\s+([0-9]+(?:\.[0-9]+)?)/i;
const HISTORY_RE = /\b(previous sessions?|history|what did i do|last session|recent transactions?|my activity|show.*history|my transactions?)\b/i;
const WARD_QUERY_RE = /\b(ward|board)\b/i;
const WARD_ACTIVITY_RE = /\b(activity|transactions?|history|what.*doing|recent)\b/i;
const PRIVATE_RE = /\b(private|shielded|cloak)\b/i;
const PUBLIC_RE = /\b(public|pubic|erc20|onchain)\b/i;
const START_RE = /\b(new session|start session|start over|reset chat)\b/i;
const SEND_VERB_RE = /\b(send|pay|transfer)\b/i;

// Matches hex addresses (0x followed by 50+ hex chars)
const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{50,66}$/;
// Matches base58 Tongo addresses (long alphanumeric, no 0x prefix, 30+ chars)
const BASE58_ADDRESS_RE = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{30,}$/;

// Stop words that terminate recipient extraction after "to"
const STOP_WORDS = /^(private|shielded|cloak|public|pubic|erc20|onchain|strk|stark|eth|usdc|with|using|via)$/i;

function normalizeToken(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t === "stark") return "STRK";
  return t.toUpperCase();
}

function lookupContact(name: string | undefined, contacts: AgentContact[]): AgentContact | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;

  return contacts.find((c) => {
    const keys = [c.nickname, c.starkName, c.tongoAddress, c.starknetAddress]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    return keys.some((key) => key === needle || key.includes(needle));
  });
}

function lookupWard(name: string | undefined, wards: AgentWard[]): AgentWard | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;

  return wards.find((w) => {
    if (w.pseudoName && w.pseudoName.toLowerCase() === needle) return true;
    if (w.address.toLowerCase() === needle) return true;
    return false;
  });
}

/**
 * Extract recipient name from text. Handles:
 * - "to <name>" (stop at keywords/tokens)
 * - "send <name> <amount>" (recipient before amount)
 * - inline hex/base58 addresses after "to"
 */
function extractRecipient(text: string): string | undefined {
  // Pattern 1: "to <recipient>" — multi-word, stop at keywords
  const toMatch = text.match(/\bto\s+(.+)/i);
  if (toMatch) {
    const afterTo = toMatch[1].trim();
    const words = afterTo.split(/\s+/);
    const recipientWords: string[] = [];
    for (const word of words) {
      // Stop at keywords, token names, amounts
      if (STOP_WORDS.test(word)) break;
      if (/^[0-9]+(?:\.[0-9]+)?$/.test(word)) break;
      recipientWords.push(word);
    }
    if (recipientWords.length > 0) {
      return recipientWords.join(" ");
    }
  }

  // Pattern 2: "send/pay/transfer <name> <amount>" — recipient between verb and amount
  const verbNameMatch = text.match(/(?:send|pay|transfer)\s+([a-zA-Z][a-zA-Z0-9_.-]*)\s+[0-9]+(?:\.[0-9]+)?/i);
  if (verbNameMatch) {
    const candidate = verbNameMatch[1];
    // Don't match if it's a token name
    if (!TOKEN_RE.test(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Extract amount from text. Handles:
 * - "send 10 strk to bob"
 * - "10 strk to bob"
 * - "send bob 10 strk"
 * - "pay 10 eth to alice"
 */
function extractAmount(text: string): string | undefined {
  // Pattern 1: "<amount> <token>" anywhere
  const amountTokenMatch = text.match(AMOUNT_RE);
  if (amountTokenMatch) return amountTokenMatch[1];

  // Pattern 2: "send/pay/transfer <amount>"
  const verbAmountMatch = text.match(AMOUNT_AFTER_VERB_RE);
  if (verbAmountMatch) return verbAmountMatch[1];

  // Pattern 3: standalone number (last resort for simple cases like "send 10 to bob")
  const standaloneMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\b/);
  if (standaloneMatch) return standaloneMatch[1];

  return undefined;
}

export function parseAgentIntent(
  text: string,
  contacts: AgentContact[] = [],
  wards: AgentWard[] = [],
): AgentIntent {
  const rawText = text.trim();

  if (!rawText) {
    return {
      type: "unknown",
      rawText,
      confidence: 0,
      reason: "Empty prompt",
    };
  }

  if (START_RE.test(rawText)) {
    return {
      type: "start_session",
      rawText,
      confidence: 0.95,
      reason: "Matched start/reset session keywords",
    };
  }

  if (HISTORY_RE.test(rawText)) {
    return {
      type: "history_query",
      rawText,
      confidence: 0.95,
      reason: "Matched history query keywords",
    };
  }

  if (WARD_QUERY_RE.test(rawText) && !SEND_VERB_RE.test(rawText)) {
    const wardNameMatch = rawText.match(/\b(?:ward|board)\s+(\w+)/i);
    const wardName = wardNameMatch?.[1];
    const isActivityQuery = WARD_ACTIVITY_RE.test(rawText);

    return {
      type: "ward_query",
      wardName,
      wardQueryType: isActivityQuery ? "activity" : "info",
      rawText,
      confidence: 0.85,
      reason: `Matched ward query${wardName ? ` for "${wardName}"` : ""}${isActivityQuery ? " (activity)" : " (info)"}`,
    };
  }

  const hasSendVerb = SEND_VERB_RE.test(rawText);
  // Also match amount-first patterns like "10 strk to bob"
  const hasAmountTokenPattern = AMOUNT_RE.test(rawText);

  if (!hasSendVerb && !hasAmountTokenPattern) {
    return {
      type: "unknown",
      rawText,
      confidence: 0.3,
      reason: "No supported payment verb detected",
    };
  }

  const amount = extractAmount(rawText);
  const token = normalizeToken(rawText.match(TOKEN_RE)?.[1]);
  const recipientRaw = extractRecipient(rawText);

  // Check if recipient is an inline address
  let recipientTongoAddress: string | undefined;
  let recipientStarknetAddress: string | undefined;
  let recipientName: string | undefined = recipientRaw;
  let recipientType: "contact" | "ward" | "inline_address" | "unknown" = "unknown";

  if (recipientRaw && HEX_ADDRESS_RE.test(recipientRaw)) {
    recipientStarknetAddress = recipientRaw;
    recipientType = "inline_address";
  } else if (recipientRaw && BASE58_ADDRESS_RE.test(recipientRaw)) {
    recipientTongoAddress = recipientRaw;
    recipientType = "inline_address";
  } else {
    // Try contact lookup first
    const contact = lookupContact(recipientRaw, contacts);
    if (contact) {
      recipientTongoAddress = contact.tongoAddress;
      recipientStarknetAddress = contact.starknetAddress;
      recipientType = "contact";
    } else {
      // Try ward lookup
      const ward = lookupWard(recipientRaw, wards);
      if (ward) {
        recipientStarknetAddress = ward.address;
        recipientName = ward.pseudoName || recipientRaw;
        recipientType = "ward";
      }
    }
  }

  // Determine mode: explicit > ward default > private default
  let mode: "send_private" | "send_public";
  if (PUBLIC_RE.test(rawText)) {
    mode = "send_public";
  } else if (PRIVATE_RE.test(rawText)) {
    mode = "send_private";
  } else if (recipientType === "ward" || recipientType === "inline_address" && recipientStarknetAddress && !recipientTongoAddress) {
    // Wards only have starknet addresses; default to public
    mode = "send_public";
  } else {
    mode = "send_private";
  }

  const isResolved = recipientType !== "unknown";

  return {
    type: mode,
    amount,
    token: token || "STRK",
    recipientName,
    recipientTongoAddress,
    recipientStarknetAddress,
    recipientType,
    rawText,
    confidence: isResolved && amount ? 0.9 : amount ? 0.75 : 0.55,
    reason: isResolved
      ? `Parsed send intent and matched ${recipientType}`
      : recipientRaw
        ? "Parsed send intent but recipient not found in contacts or wards"
        : "Parsed send intent but no recipient specified",
  };
}
