"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getContacts,
  saveContacts,
  type Contact,
} from "~~/lib/storage";

interface UseContactsReturn {
  contacts: Contact[];
  addContact: (contact: Omit<Contact, "id">) => void;
  removeContact: (id: string) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  toggleFavorite: (id: string) => void;
  getContactByTongoAddress: (tongoAddress: string) => Contact | undefined;
  refresh: () => void;
}

export function useContacts(): UseContactsReturn {
  const [contacts, setContacts] = useState<Contact[]>([]);

  const refresh = useCallback(() => {
    const stored = getContacts();
    // Sort: favorites first, then by recency
    stored.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite)
        return a.isFavorite ? -1 : 1;
      return (b.lastInteraction || 0) - (a.lastInteraction || 0);
    });
    setContacts(stored);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    (contact: Omit<Contact, "id">) => {
      const newContact: Contact = {
        ...contact,
        id: crypto.randomUUID(),
      };
      const updated = [...getContacts(), newContact];
      saveContacts(updated);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    (id: string) => {
      const updated = getContacts().filter((c) => c.id !== id);
      saveContacts(updated);
      refresh();
    },
    [refresh],
  );

  const update = useCallback(
    (id: string, updates: Partial<Contact>) => {
      const updated = getContacts().map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      );
      saveContacts(updated);
      refresh();
    },
    [refresh],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const contact = getContacts().find((c) => c.id === id);
      if (contact) {
        update(id, { isFavorite: !contact.isFavorite });
      }
    },
    [update],
  );

  const getContactByTongoAddress = useCallback(
    (tongoAddress: string) => {
      return contacts.find((c) => c.tongoAddress === tongoAddress);
    },
    [contacts],
  );

  return {
    contacts,
    addContact: add,
    removeContact: remove,
    updateContact: update,
    toggleFavorite,
    getContactByTongoAddress,
    refresh,
  };
}
