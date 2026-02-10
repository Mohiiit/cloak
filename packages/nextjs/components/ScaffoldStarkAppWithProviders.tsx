"use client";

import React, { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { StarknetConfig, starkscan } from "@starknet-react/core";
import { Header } from "~~/components/Header";
import { BottomNav } from "~~/components/BottomNav";
import { TongoProvider } from "~~/components/providers/TongoProvider";
import { appChains, connectors } from "~~/services/web3/connectors";
import provider from "~~/services/web3/provider";
import { useNativeCurrencyPrice } from "~~/hooks/scaffold-stark/useNativeCurrencyPrice";
import { TestAutoConnect } from "~~/components/TestAutoConnect";

const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

const ScaffoldStarkApp = ({ children }: { children: React.ReactNode }) => {
  useNativeCurrencyPrice();

  return (
    <>
      <div className="flex relative flex-col min-h-screen bg-slate-900">
        <Header />
        <main className="relative flex flex-col flex-1 pb-20 md:pb-0">
          <div className="max-w-lg mx-auto w-full px-4 py-4 flex-1">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#1e293b",
            color: "#f8fafc",
            border: "1px solid #334155",
          },
        }}
      />
    </>
  );
};

export const ScaffoldStarkAppWithProviders = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      connectors={connectors}
      explorer={starkscan}
    >
      <TongoProvider>
        {isTestMode && <TestAutoConnect />}
        <ScaffoldStarkApp>{children}</ScaffoldStarkApp>
      </TongoProvider>
    </StarknetConfig>
  );
};
