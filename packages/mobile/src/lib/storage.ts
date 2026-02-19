import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Contact {
  id: string;
  tongoAddress: string;
  starknetAddress?: string;
  nickname?: string;
  isFavorite: boolean;
  lastInteraction?: number;
}

export interface TxMetadata {
  txHash: string;
  recipient?: string;
  recipientName?: string;
  note?: string;
  privacyLevel: "public" | "friends" | "private";
  timestamp: number;
  type: "send" | "receive" | "fund" | "withdraw" | "rollover" | "erc20_transfer" | "deploy_ward" | "fund_ward" | "configure_ward";
  token: string;
  amount?: string;
}

const KEYS = {
  CONTACTS: "cloak_contacts",
  TX_NOTES: "cloak_tx_notes",
};

async function getItem<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function setItem<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// Contacts
export async function getContacts(): Promise<Contact[]> {
  return getItem<Contact[]>(KEYS.CONTACTS, []);
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  return setItem(KEYS.CONTACTS, contacts);
}

export async function addContact(contact: Contact): Promise<void> {
  const contacts = await getContacts();
  contacts.push(contact);
  await saveContacts(contacts);
}

export async function removeContact(id: string): Promise<void> {
  const contacts = (await getContacts()).filter((c) => c.id !== id);
  await saveContacts(contacts);
}

// Tx Notes
export async function getTxNotes(): Promise<Record<string, TxMetadata>> {
  return getItem<Record<string, TxMetadata>>(KEYS.TX_NOTES, {});
}

export async function saveTxNote(txHash: string, metadata: TxMetadata): Promise<void> {
  const notes = await getTxNotes();
  notes[txHash] = metadata;
  await setItem(KEYS.TX_NOTES, notes);
}
