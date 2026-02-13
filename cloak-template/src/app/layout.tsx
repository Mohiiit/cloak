import type { Metadata } from "next";
import { WalletProvider } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buy Me a Coffee — Private Tips with Cloak",
  description:
    "Send private, shielded tips to your favorite creators on Starknet using Cloak Wallet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-cloak-bg text-cloak-text min-h-screen antialiased">
        <WalletProvider>
          <div className="min-h-screen flex flex-col">
            <main className="flex-1">{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
