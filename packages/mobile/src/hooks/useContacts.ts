import { useState, useCallback, useEffect } from "react";
import { getContacts, saveContacts, type Contact } from "../lib/storage";

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);

  const refresh = useCallback(async () => {
    const stored = await getContacts();
    stored.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return (b.lastInteraction || 0) - (a.lastInteraction || 0);
    });
    setContacts(stored);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addContact = useCallback(async (contact: Omit<Contact, "id">) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const newContact: Contact = { ...contact, id };
    const updated = [...(await getContacts()), newContact];
    await saveContacts(updated);
    await refresh();
  }, [refresh]);

  const removeContact = useCallback(async (id: string) => {
    const updated = (await getContacts()).filter((c) => c.id !== id);
    await saveContacts(updated);
    await refresh();
  }, [refresh]);

  const getContactByAddress = useCallback(
    (tongoAddress: string) => contacts.find((c) => c.tongoAddress === tongoAddress),
    [contacts],
  );

  return { contacts, addContact, removeContact, getContactByAddress, refresh };
}
