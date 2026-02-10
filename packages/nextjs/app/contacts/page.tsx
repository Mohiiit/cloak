"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Star,
  Trash2,
  Copy,
  User,
  X,
} from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { useContacts } from "~~/hooks/useContacts";
import { useTongo } from "~~/components/providers/TongoProvider";
import { truncateTongoAddress } from "~~/lib/address";
import toast from "react-hot-toast";

function AddContactModal({
  onAdd,
  onClose,
}: {
  onAdd: (contact: {
    tongoAddress: string;
    nickname?: string;
    starknetAddress?: string;
    isFavorite: boolean;
  }) => void;
  onClose: () => void;
}) {
  const [tongoAddr, setTongoAddr] = useState("");
  const [nickname, setNickname] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-50">
            Add Contact
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Cloak Address (required)
            </label>
            <input
              type="text"
              placeholder="Tongo base58 address..."
              value={tongoAddr}
              onChange={(e) => setTongoAddr(e.target.value)}
              className="w-full bg-slate-900 rounded-xl border border-slate-700/50 px-4 py-3 text-slate-50 outline-none focus:border-blue-500/50 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Nickname
            </label>
            <input
              type="text"
              placeholder="alice.stark"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-slate-900 rounded-xl border border-slate-700/50 px-4 py-3 text-slate-50 outline-none focus:border-blue-500/50 text-sm"
            />
          </div>
        </div>

        <button
          onClick={() => {
            if (!tongoAddr) {
              toast.error("Enter a Cloak address");
              return;
            }
            onAdd({
              tongoAddress: tongoAddr,
              nickname: nickname || undefined,
              isFavorite: false,
            });
            onClose();
          }}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Add Contact
        </button>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const { status } = useAccount();
  const { tongoAddress } = useTongo();
  const {
    contacts,
    addContact,
    removeContact,
    toggleFavorite,
  } = useContacts();
  const [showAddModal, setShowAddModal] = useState(false);

  if (status !== "connected") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Users className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">
          Connect your wallet to manage contacts
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-50">Contacts</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Your address card */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
        <p className="text-xs text-slate-400 mb-1">Your Cloak Address</p>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-200 font-mono truncate mr-2">
            {tongoAddress || "Connect wallet..."}
          </p>
          <button
            onClick={() => {
              if (tongoAddress) {
                navigator.clipboard.writeText(tongoAddress);
                toast.success("Copied!");
              }
            }}
            className="text-slate-400 hover:text-blue-400 shrink-0"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contact list */}
      {contacts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30"
            >
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {contact.nickname || contact.starkName || "Unknown"}
                </p>
                <p className="text-xs text-slate-500 font-mono truncate">
                  {truncateTongoAddress(contact.tongoAddress)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleFavorite(contact.id)}
                  className={
                    contact.isFavorite
                      ? "text-amber-400"
                      : "text-slate-600 hover:text-slate-400"
                  }
                >
                  <Star
                    className="w-4 h-4"
                    fill={contact.isFavorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  onClick={() => {
                    removeContact(contact.id);
                    toast.success("Contact removed");
                  }}
                  className="text-slate-600 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">No contacts yet</p>
          <p className="text-xs mt-1">
            Add friends to send them shielded payments
          </p>
        </div>
      )}

      {showAddModal && (
        <AddContactModal
          onAdd={addContact}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
