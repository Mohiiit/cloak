import fs from "node:fs/promises";
import path from "node:path";
import type { AgentMessage, AgentSession } from "~~/lib/agent/types";

interface AgentStoreFile {
  sessions: AgentSession[];
}

const STORE_PATH = process.env.CLOAK_AGENT_STORE_PATH
  ? path.resolve(process.env.CLOAK_AGENT_STORE_PATH)
  : path.join(process.cwd(), ".agent-data", "sessions.json");
const AGENT_DIR = path.dirname(STORE_PATH);

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(AGENT_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    const initial: AgentStoreFile = { sessions: [] };
    await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readStore(): Promise<AgentStoreFile> {
  await ensureStore();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AgentStoreFile;
    if (!Array.isArray(parsed.sessions)) {
      return { sessions: [] };
    }
    return parsed;
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(store: AgentStoreFile): Promise<void> {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function createMessage(role: AgentMessage["role"], text: string): AgentMessage {
  return {
    id: makeId("msg"),
    role,
    text,
    createdAt: nowIso(),
  };
}

export async function listSessionSummaries(): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
  const store = await readStore();
  return store.sessions
    .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSessionById(id: string): Promise<AgentSession | null> {
  const store = await readStore();
  return store.sessions.find((s) => s.id === id) || null;
}

export async function createSession(title?: string): Promise<AgentSession> {
  const store = await readStore();
  const ts = nowIso();
  const session: AgentSession = {
    id: makeId("session"),
    title: (title || "New agent session").trim() || "New agent session",
    createdAt: ts,
    updatedAt: ts,
    messages: [],
  };
  store.sessions.unshift(session);
  await writeStore(store);
  return session;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const store = await readStore();
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return false;
  store.sessions.splice(idx, 1);
  await writeStore(store);
  return true;
}

export async function appendMessages(
  sessionId: string,
  messages: AgentMessage[],
): Promise<AgentSession | null> {
  if (messages.length === 0) return getSessionById(sessionId);
  const store = await readStore();
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;

  const next = { ...store.sessions[idx] };
  next.messages = [...next.messages, ...messages];
  next.updatedAt = nowIso();
  if (next.title === "New agent session") {
    const firstUserMsg = next.messages.find((m) => m.role === "user");
    if (firstUserMsg) {
      next.title = firstUserMsg.text.slice(0, 48);
    }
  }

  store.sessions[idx] = next;
  await writeStore(store);
  return next;
}
