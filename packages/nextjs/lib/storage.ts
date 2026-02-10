import { STORAGE_KEYS } from "./constants";

export interface Contact {
  id: string;
  tongoAddress: string;
  starknetAddress?: string;
  starkName?: string;
  nickname?: string;
  profilePicture?: string;
  lastInteraction?: number;
  isFavorite: boolean;
}

export interface TxMetadata {
  txHash: string;
  recipient?: string;
  recipientStarkAddress?: string;
  recipientName?: string;
  sender?: string;
  senderName?: string;
  note?: string;
  privacyLevel: "public" | "friends" | "private";
  timestamp: number;
  type: "send" | "receive" | "fund" | "withdraw" | "rollover";
  token: string;
  amount?: string;
}

export interface PaymentRequest {
  id: string;
  requesterTongoAddress: string;
  requesterName?: string;
  amount: string;
  token: string;
  note: string;
  status: "pending" | "paid" | "declined";
  createdAt: number;
}

export interface UserSettings {
  defaultPrivacy: "public" | "friends" | "private";
  defaultToken: string;
}

// --- Generic typed localStorage helpers ---

function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// --- Contacts ---

export function getContacts(): Contact[] {
  return getItem<Contact[]>(STORAGE_KEYS.CONTACTS, []);
}

export function saveContacts(contacts: Contact[]): void {
  setItem(STORAGE_KEYS.CONTACTS, contacts);
}

export function addContact(contact: Contact): void {
  const contacts = getContacts();
  contacts.push(contact);
  saveContacts(contacts);
}

export function removeContact(id: string): void {
  const contacts = getContacts().filter((c) => c.id !== id);
  saveContacts(contacts);
}

export function updateContact(id: string, updates: Partial<Contact>): void {
  const contacts = getContacts().map((c) =>
    c.id === id ? { ...c, ...updates } : c,
  );
  saveContacts(contacts);
}

// --- Transaction Notes ---

export function getTxNotes(): Record<string, TxMetadata> {
  return getItem<Record<string, TxMetadata>>(STORAGE_KEYS.TX_NOTES, {});
}

export function saveTxNote(txHash: string, metadata: TxMetadata): void {
  const notes = getTxNotes();
  notes[txHash] = metadata;
  setItem(STORAGE_KEYS.TX_NOTES, notes);
}

// --- Payment Requests ---

export function getPaymentRequests(): PaymentRequest[] {
  return getItem<PaymentRequest[]>(STORAGE_KEYS.REQUESTS, []);
}

export function savePaymentRequests(requests: PaymentRequest[]): void {
  setItem(STORAGE_KEYS.REQUESTS, requests);
}

export function addPaymentRequest(request: PaymentRequest): void {
  const requests = getPaymentRequests();
  requests.push(request);
  savePaymentRequests(requests);
}

export function updatePaymentRequest(
  id: string,
  updates: Partial<PaymentRequest>,
): void {
  const requests = getPaymentRequests().map((r) =>
    r.id === id ? { ...r, ...updates } : r,
  );
  savePaymentRequests(requests);
}

// --- Settings ---

export function getSettings(): UserSettings {
  return getItem<UserSettings>(STORAGE_KEYS.SETTINGS, {
    defaultPrivacy: "public",
    defaultToken: "STRK",
  });
}

export function saveSettings(settings: UserSettings): void {
  setItem(STORAGE_KEYS.SETTINGS, settings);
}

// --- Clear all ---

export function clearAllData(): void {
  if (typeof window === "undefined") return;
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}
