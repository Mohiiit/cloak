# Cloak — Deployment Reference

## Network

All Cloak contracts are deployed on **Starknet Sepolia testnet**.
No mainnet deployment yet.

---

## Cloak Smart Contracts

### CloakAccount

Account abstraction contract with optional dual-key two-factor authentication.

| Field | Value |
|-------|-------|
| **Network** | Starknet Sepolia |
| **Sierra class hash** | `0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00` |
| **Voyager** | https://sepolia.voyager.online/class/0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00 |

---

### CloakWard

Guardian-controlled sub-account contract.

| Field | Value |
|-------|-------|
| **Network** | Starknet Sepolia |
| **Sierra class hash** | `0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132` |
| **CASM class hash** | `0x657bb2d68a7126505cb6ff37bd8ff4622949becdf1b83d41a66c6e445f2c858` |
| **Voyager** | https://sepolia.voyager.online/class/0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132 |

---

### CloakDelegation

On-chain spending cap enforcement for agent runs. This is the deployed singleton instance used by the marketplace.

| Field | Value |
|-------|-------|
| **Network** | Starknet Sepolia |
| **Sierra class hash** | `0x6ffc7f7ef8b644f82fbcd0ffca170c84412034bd096a26f8b598007e886f81b` |
| **CASM class hash** | `0x23cc1bd11994e415e364bb44e97368fb38b445bf81f7784c45c79ca99ea11f9` |
| **Contract address** | `0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10` |
| **Voyager** | https://sepolia.voyager.online/contract/0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10 |

---

## Cloak Service Accounts (Sepolia)

| Account | Address | Purpose |
|---------|---------|---------|
| **ERC-8004 Signer** | `0x7f7d57934a34ee9357857488cc69a08af7976533874c4fea5a6dd433647d7b6` | Signs on-chain agent registrations on behalf of operators |
| **Operator / Funder** | `0x3e83695578ca8a473f387f9b338e4e22f7cae02ddb8817a8951abcbf3e38248` | Test operator wallet used in demo flows |
| **Guardian** | `0x22837eb3ba3a474005ec995d5f548f76a6ad673a4eafe32a3b9172d54ce2a0f` | Test guardian wallet for ward approval flows |

---

## Demo Registrations — All Confirmed On-Chain

All agents below were registered through the Cloak Operator Dashboard. Each registration called `register()` on the ERC-8004 identity registry and minted a unique on-chain token.

### final demo v4 ← Primary Demo Agent

| Field | Value |
|-------|-------|
| **Agent ID** | `finalDemov4` |
| **Name** | final demo v4 |
| **Status** | confirmed |
| **Tx hash** | `0x2fdc7d0850e1980d64d0c0bb5b4248e5a0fd588be1c5ea93fc22fef8bf43dc1` |
| **Voyager** | https://sepolia.voyager.online/tx/0x2fdc7d0850e1980d64d0c0bb5b4248e5a0fd588be1c5ea93fc22fef8bf43dc1 |
| **Registered** | 2026-03-10 |

### final demo v3

| Field | Value |
|-------|-------|
| **Agent ID** | `finalDemoV3` |
| **Name** | final demo v3 |
| **Status** | confirmed |
| **Tx hash** | `0x19e2a79821806e3de6232908375809d49df6701545ae45a0cee3088d4999e32` |
| **Voyager** | https://sepolia.voyager.online/tx/0x19e2a79821806e3de6232908375809d49df6701545ae45a0cee3088d4999e32 |
| **Registered** | 2026-03-10 |

### final demo v2

| Field | Value |
|-------|-------|
| **Agent ID** | `finalDemov2` |
| **Name** | final final v2 |
| **Status** | confirmed |
| **Tx hash** | `0x5d3eda08a4af0cfd06578c2a21e0057b67e97b6905e63f0ebb01edd67d7ee15` |
| **Voyager** | https://sepolia.voyager.online/tx/0x5d3eda08a4af0cfd06578c2a21e0057b67e97b6905e63f0ebb01edd67d7ee15 |
| **Registered** | 2026-03-10 |

### final demo v1

| Field | Value |
|-------|-------|
| **Agent ID** | `finalDemov1` |
| **Name** | demo final final |
| **Status** | confirmed |
| **Tx hash** | `0x10f7691b6b28b00d9f37b8dd3f186851a03adac2eef53662dac605b655dc691` |
| **Voyager** | https://sepolia.voyager.online/tx/0x10f7691b6b28b00d9f37b8dd3f186851a03adac2eef53662dac605b655dc691 |
| **Registered** | 2026-03-10 |

### final demo (initial)

| Field | Value |
|-------|-------|
| **Agent ID** | `finalDemo` |
| **Name** | final demo staking steward |
| **Status** | confirmed |
| **Tx hash** | `0x63ec5822222f28cef186d336fadd32d195d6a420b3af486e7316de47743bcc7` |
| **Voyager** | https://sepolia.voyager.online/tx/0x63ec5822222f28cef186d336fadd32d195d6a420b3af486e7316de47743bcc7 |
| **Registered** | 2026-03-10 |

### testing002 (dev verification run)

| Field | Value |
|-------|-------|
| **Agent ID** | `testing002` |
| **Name** | testing 002 |
| **Status** | confirmed |
| **Tx hash** | `0x38ed95d74c84b1ce57f156cdfa5dbb4f7943c782a639fceabb7697a1f3d94db` |
| **Voyager** | https://sepolia.voyager.online/tx/0x38ed95d74c84b1ce57f156cdfa5dbb4f7943c782a639fceabb7697a1f3d94db |
| **Registered** | 2026-03-10 |

---

## Third-Party Protocols Used

Cloak is built on top of these protocols. We do not own or operate them.

| Protocol | Purpose | Notes |
|----------|---------|-------|
| **Tongo** | ZK-proof shielded payment pool | ElGamal encryption on StarkCurve. Cloak integrates via `@fatsolutions/tongo-sdk`. Contracts deployed and operated by the Tongo team. |
| **ERC-8004** | On-chain agent identity registry | NFT-based agent registry standard on Starknet. Cloak uses the Sepolia identity registry to mint permanent on-chain identities for registered agents. Registry deployed and operated by the ERC-8004 team. |
| **x402** | HTTP-native payment protocol | `402 Payment Required` based payment handshake. Cloak implements the x402 challenge/verify/settle flow on top of Tongo shielded payments. |

---

## Live Links

| Resource | URL |
|----------|-----|
| Web app + API | https://cloak-backend-vert.vercel.app |
| Marketplace | https://cloak-backend-vert.vercel.app/marketplace |
| Operator dashboard | https://cloak-backend-vert.vercel.app/marketplace/dashboard |
| SDK on npm | https://www.npmjs.com/package/@cloak-wallet/sdk |
