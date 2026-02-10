"use client";
import { useEffect, useMemo, useState } from "react";
import { useConnect, useNetwork } from "@starknet-react/core";
import { Address } from "@starknet-react/chains";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import ConnectModal from "./ConnectModal";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { useAutoConnect } from "~~/hooks/scaffold-stark";
import { useTargetNetwork } from "~~/hooks/scaffold-stark/useTargetNetwork";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-stark";
import { useReadLocalStorage } from "usehooks-ts";

export const CustomConnectButton = () => {
  useAutoConnect();
  const { connector } = useConnect();
  const { targetNetwork } = useTargetNetwork();
  const { chain } = useNetwork();
  const { account, status, address: accountAddress } = useAccount();
  const wasDisconnectedManually = useReadLocalStorage<boolean>(
    "wasDisconnectedManually",
  );
  const [accountChainId, setAccountChainId] = useState<bigint>(0n);

  const blockExplorerAddressLink = useMemo(() => {
    return accountAddress
      ? getBlockExplorerAddressLink(targetNetwork, accountAddress)
      : "";
  }, [accountAddress, targetNetwork]);

  useEffect(() => {
    const getChainId = async () => {
      try {
        if (account?.channel?.getChainId) {
          const chainId = await account.channel.getChainId();
          setAccountChainId(BigInt(chainId));
        } else if (chain?.id) {
          setAccountChainId(BigInt(chain.id));
        }
      } catch (err) {
        console.error("Failed to get chainId:", err);
      }
    };
    getChainId();
  }, [account, status, chain?.id]);

  useEffect(() => {
    const handleChainChange = (event: { chainId?: bigint }) => {
      const { chainId } = event;
      if (chainId && chainId !== accountChainId) {
        setAccountChainId(chainId);
      }
    };
    connector?.on("change", handleChainChange);
    return () => {
      connector?.off("change", handleChainChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector]);

  if (status === "disconnected" || wasDisconnectedManually) {
    return <ConnectModal />;
  }

  const isLoading =
    status === "connected" &&
    (!accountAddress || !chain?.name || accountChainId === 0n);

  if (isLoading) {
    return (
      <button
        type="button"
        disabled
        className="w-20 h-8 rounded-lg bg-slate-700 animate-pulse"
      >
        &nbsp;
      </button>
    );
  }

  if (accountChainId !== targetNetwork.id) {
    return <WrongNetworkDropdown />;
  }

  return (
    <>
      {/* Minimal address chip only — no Balance, no chain name */}
      <AddressInfoDropdown
        address={accountAddress as Address}
        displayName=""
        blockExplorerAddressLink={blockExplorerAddressLink}
      />
      <AddressQRCodeModal
        address={accountAddress as Address}
        modalId="qrcode-modal"
      />
    </>
  );
};
