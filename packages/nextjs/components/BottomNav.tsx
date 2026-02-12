"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Send,
  Settings,
} from "lucide-react";
import { CloakIcon } from "~~/components/CloakIcon";

const WalletIcon = ({ className }: { className?: string }) => (
  <span className={className}><CloakIcon size={20} /></span>
);

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/send", icon: Send, label: "Send" },
  { href: "/wallet", icon: WalletIcon, label: "Wallet" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl bg-slate-900/90 border-t border-slate-700/50 md:hidden">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors ${
                isActive
                  ? "text-blue-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
