import React, { useState } from "react";
import { ArrowLeft, Plus, Trash2, Star, Users } from "lucide-react";
import { useContacts } from "../hooks/useContacts";

interface Props {
  onBack: () => void;
}

export function ContactsScreen({ onBack }: Props) {
  const { contacts, addContact, removeContact, refresh } = useContacts();
  const [showAdd, setShowAdd] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const handleAdd = async () => {
    if (!newAddress.trim()) return;
    await addContact({
      tongoAddress: newAddress.trim(),
      nickname: newNickname.trim() || undefined,
      isFavorite: false,
      lastInteraction: Date.now(),
    });
    setNewNickname("");
    setNewAddress("");
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <button onClick={onBack} className="text-cloak-text-dim hover:text-cloak-text transition-colors">
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>
        <h2 className="text-cloak-text font-semibold flex-1">Contacts</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-cloak-primary hover:text-cloak-text transition-colors"
        >
          <Plus className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        {/* Add form */}
        {showAdd && (
          <div className="bg-cloak-card border border-cloak-border-light rounded-xl p-4 mb-4">
            <div className="mb-3">
              <label className="text-xs text-cloak-text-dim mb-1.5 block">Nickname</label>
              <input
                type="text"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder="Alice"
                className="w-full px-3 py-2 rounded-lg bg-cloak-bg border border-cloak-border text-cloak-text text-sm placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50"
              />
            </div>
            <div className="mb-3">
              <label className="text-xs text-cloak-text-dim mb-1.5 block">Tongo Address</label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Base58 address..."
                className="w-full px-3 py-2 rounded-lg bg-cloak-bg border border-cloak-border text-cloak-text text-sm font-mono placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newAddress.trim()}
              className="w-full py-2 rounded-lg bg-cloak-primary hover:bg-cloak-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Add Contact
            </button>
          </div>
        )}

        {/* Contact list */}
        {contacts.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Users className="w-8 h-8 text-cloak-muted mb-2" />
            <p className="text-cloak-text-dim text-sm">No contacts yet</p>
            <p className="text-cloak-muted text-xs mt-1">Add contacts for quick sending</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light">
              <div className="w-8 h-8 rounded-full bg-cloak-primary/20 flex items-center justify-center shrink-0">
                <span className="text-cloak-primary text-sm font-semibold">
                  {(c.nickname || c.tongoAddress)?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {c.nickname && <p className="text-sm font-medium text-cloak-text">{c.nickname}</p>}
                <p className="text-[11px] text-cloak-text-dim font-mono truncate">{c.tongoAddress}</p>
              </div>
              {c.isFavorite && <Star className="w-[14px] h-[14px] text-yellow-400 fill-yellow-400 shrink-0" />}
              <button
                onClick={() => removeContact(c.id)}
                className="text-cloak-muted hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="w-[14px] h-[14px]" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
