import { generateObject } from "ai";
import { minimax } from "vercel-minimax-ai-provider";
import { z } from "zod";
import type { AgentContact, AgentIntent, AgentIntentType, AgentMessage, AgentWard } from "~~/lib/agent/types";

const MODEL = "MiniMax-M2";
const MAX_TOKENS = 512;
const TIMEOUT_MS = 25_000;
const MAX_HISTORY_MESSAGES = 6;

const intentSchema = z.object({
  intent_type: z
    .enum(["send_private", "send_public", "history_query", "ward_query", "start_session", "unknown"])
    .describe("The type of action the user wants to perform."),
  amount: z
    .string()
    .optional()
    .describe("The numeric amount to send (e.g. '10', '0.5'). Omit if not specified."),
  token: z
    .enum(["STRK", "ETH", "USDC"])
    .optional()
    .describe("The token to use. Default to STRK if not specified."),
  recipient_name: z
    .string()
    .optional()
    .describe("The human-readable recipient name (contact nickname, ward name)."),
  recipient_type: z
    .enum(["contact", "ward", "inline_address", "unknown"])
    .optional()
    .describe("How the recipient was resolved."),
  recipient_tongo_address: z
    .string()
    .optional()
    .describe("The resolved Tongo (base58) address for private sends."),
  recipient_starknet_address: z
    .string()
    .optional()
    .describe("The resolved Starknet (0x hex) address for public sends."),
  ward_name: z
    .string()
    .optional()
    .describe("The ward name the user is asking about (for ward_query intent)."),
  ward_query_type: z
    .enum(["info", "activity"])
    .optional()
    .describe("What kind of ward data the user wants: 'info' for status/details, 'activity' for transactions."),
  confidence: z
    .number()
    .describe("How confident you are in this interpretation (0.0 to 1.0)."),
  reason: z
    .string()
    .describe("Brief explanation of how you interpreted the message."),
  reply: z
    .string()
    .describe(
      "A concise, friendly reply to the user. Confirm details when ready, ask for missing info when not. Keep under 2 sentences.",
    ),
});

function buildSystemPrompt(contacts: AgentContact[], wards: AgentWard[]): string {
  const contactList =
    contacts.length > 0
      ? contacts
          .map((c) => {
            const parts = [c.nickname, c.starkName].filter(Boolean);
            const addrs = [];
            if (c.tongoAddress) addrs.push(`tongo=${c.tongoAddress}`);
            if (c.starknetAddress) addrs.push(`starknet=${c.starknetAddress}`);
            return `  - ${parts.join(" / ")} (${addrs.join(", ")})`;
          })
          .join("\n")
      : "  (none)";

  const wardList =
    wards.length > 0
      ? wards.map((w) => `  - ${w.pseudoName || "unnamed"} (address=${w.address})`).join("\n")
      : "  (none)";

  return `You are Cloak's payment assistant. You parse user messages into structured payment intents.

SUPPORTED TOKENS (with Tongo conversion rates):
- STRK: 1 Tongo unit = 0.05 STRK
- ETH: 1 Tongo unit = 0.000003 ETH
- USDC: 1 Tongo unit = 0.01 USDC
Default token is STRK if not specified.

PRIVACY MODES:
- send_private: Shielded transfer via Tongo (requires recipient Tongo address)
- send_public: On-chain ERC-20 transfer (requires recipient Starknet 0x address)
Default is send_private unless the user says "public/onchain/erc20" or the recipient only has a Starknet address.

RECIPIENT RESOLUTION (in priority order):
1. Contacts — match by nickname or starkName (case-insensitive)
2. Wards — match by pseudoName (case-insensitive). Wards only have Starknet addresses, so default to send_public.
3. Inline addresses — if the user provides a 0x hex address (50+ hex chars) or base58 Tongo address (30+ alphanumeric chars)
4. Unknown — ask the user to clarify

USER'S CONTACTS:
${contactList}

USER'S WARDS:
${wardList}

WARD QUERIES:
- "show ward X info" / "what about ward X?" / "ward X status" → ward_query with ward_query_type="info"
- "ward X activity" / "ward X transactions" / "what has ward X done" → ward_query with ward_query_type="activity"
- "board" is a common typo for "ward" — treat it the same way
- Set ward_name to the name after "ward" / "board" keyword

FOLLOW-UP HANDLING:
- If the user says "make it 20 instead", update the amount from the previous intent.
- If the user says "actually send to bob", update the recipient.
- If the user says "do it publicly", change mode to send_public.
- If the user says "never mind" or asks about history, switch intent type accordingly.

REPLY GUIDELINES:
- Be concise (1-2 sentences max).
- When all details are present and ready to execute, confirm: "Ready to send X TOKEN to RECIPIENT privately/publicly."
- When details are missing, ask specifically what's needed.
- For history_query, just acknowledge you'll show their activity.
- For ward_query, acknowledge what you'll look up.
- For start_session, confirm the fresh start.
- For unknown intents: respond helpfully and steer toward capabilities. Say something like "I'm a payment assistant. I can help you send funds (private or public), check your transaction history, or look up ward info. What would you like to do?"
- NEVER attempt to parse random or gibberish messages as real transactions. If the message doesn't clearly indicate a payment or query, return unknown.`;
}

type CoreMessage = { role: "user" | "assistant"; content: string };

function buildMessages(text: string, recentMessages: AgentMessage[]): CoreMessage[] {
  const history: CoreMessage[] = recentMessages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.text,
  }));

  return [...history, { role: "user", content: text }];
}

function mapToIntent(
  obj: z.infer<typeof intentSchema>,
  rawText: string,
): { intent: AgentIntent; reply: string } {
  const intentType = (obj.intent_type as AgentIntentType) || "unknown";
  const reply = obj.reply || "";

  const intent: AgentIntent = {
    type: intentType,
    rawText,
    confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
    reason: obj.reason || "LLM parse",
  };

  if (obj.amount) intent.amount = obj.amount;
  if (obj.token) intent.token = obj.token;
  if (obj.recipient_name) intent.recipientName = obj.recipient_name;
  if (obj.recipient_type) intent.recipientType = obj.recipient_type as AgentIntent["recipientType"];
  if (obj.recipient_tongo_address) intent.recipientTongoAddress = obj.recipient_tongo_address;
  if (obj.recipient_starknet_address) intent.recipientStarknetAddress = obj.recipient_starknet_address;
  if (obj.ward_name) intent.wardName = obj.ward_name;
  if (obj.ward_query_type) intent.wardQueryType = obj.ward_query_type;

  // Default token to STRK for send intents
  if ((intentType === "send_private" || intentType === "send_public") && !intent.token) {
    intent.token = "STRK";
  }

  return { intent, reply };
}

export async function parseIntentWithLLM(
  text: string,
  contacts: AgentContact[],
  wards: AgentWard[],
  recentMessages: AgentMessage[],
): Promise<{ intent: AgentIntent; reply: string }> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY not configured");
  }

  const result = await (generateObject as Function)({
    model: minimax(MODEL),
    schema: intentSchema,
    maxTokens: MAX_TOKENS,
    system: buildSystemPrompt(contacts, wards),
    messages: buildMessages(text, recentMessages),
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });

  return mapToIntent(result.object, text);
}
