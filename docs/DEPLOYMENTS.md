# Cloak — Deployment Reference

## Network

All contracts are deployed on **Starknet Sepolia testnet**.
No mainnet deployment yet.

---

## Smart Contracts (Deployed by Cloak)

### CloakAccount

Account abstraction contract with optional dual-key 2FA.

| Field | Value |
|-------|-------|
| **Network** | Starknet Sepolia |
| **Sierra class hash** | `0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00` |
| **Type** | SRC-6 account with optional secondary key |

---

### CloakWard

Guardian-controlled sub-account contract.

| Field | Value |
|-------|-------|
| **Network** | Starknet Sepolia |
| **Sierra class hash** | `0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132` |
| **CASM class hash** | `0x657bb2d68a7126505cb6ff37bd8ff4622949becdf1b83d41a66c6e445f2c858` |
| **Type** | Guardian-linked account (get_account_type() → "WARD") |

---

### CloakDelegation

On-chain spending cap enforcement for agent runs.

| Field | Value |
|-------|-------|
| **Network** | Starknet Sepolia |
| **Sierra class hash** | `0x6ffc7f7ef8b644f82fbcd0ffca170c84412034bd096a26f8b598007e886f81b` |
| **CASM class hash** | `0x23cc1bd11994e415e364bb44e97368fb38b445bf81f7784c45c79ca99ea11f9` |
| **Contract address** | `0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10` |
| **Voyager** | https://sepolia.voyager.online/contract/0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10 |

---

## ERC-8004 Registries (Third-Party, Starknet Protocol)

### Sepolia

| Registry | Address |
|----------|---------|
| **Identity** (agent NFT registry) | `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631` |
| **Reputation** | `0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e` |
| **Validation** | `0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f` |

### Mainnet

| Registry | Address |
|----------|---------|
| **Identity** | `0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595` |
| **Reputation** | `0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944` |
| **Validation** | `0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83` |

---

## Tongo Protocol Contracts (Third-Party, Sepolia)

Shielded pool contracts — one per token.

| Token | ERC-20 Address | Tongo Contract |
|-------|---------------|----------------|
| **STRK** | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` | `0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed` |
| **ETH** | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` | `0x02cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5` |
| **USDC** | `0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080` | `0x02caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552` |

---

## Cloak Service Accounts (Sepolia)

| Account | Address | Purpose |
|---------|---------|---------|
| **ERC-8004 Signer** | `0x7f7d57934a34ee9357857488cc69a08af7976533874c4fea5a6dd433647d7b6` | Signs on-chain agent registrations on behalf of operators |
| **Account 1 (Operator)** | `0x3e83695578ca8a473f387f9b338e4e22f7cae02ddb8817a8951abcbf3e38248` | Test operator / funder wallet |
| **Account 2 (Guardian)** | `0x22837eb3ba3a474005ec995d5f548f76a6ad673a4eafe32a3b9172d54ce2a0f` | Test guardian wallet (for ward approval flows) |

---

## Demo v4 — Transaction Hashes

All transactions below are on **Starknet Sepolia**.

### Agent Registration — `testing002`

The on-chain registration of the `testing002` demo agent via the ERC-8004 identity registry. This minted **token ID 179** on the registry, owned by the Cloak ERC-8004 signer.

| Field | Value |
|-------|-------|
| **Tx hash** | `0x38ed95d74c84b1ce57f156cdfa5dbb4f7943c782a639fceabb7697a1f3d94db` |
| **Action** | `register()` on ERC-8004 Identity Registry |
| **Token ID minted** | 179 |
| **Registry** | `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631` |
| **Voyager** | https://sepolia.voyager.online/tx/0x38ed95d74c84b1ce57f156cdfa5dbb4f7943c782a639fceabb7697a1f3d94db |

---

### Ward Approval Pipeline

End-to-end ward multi-sig verified on Sepolia: ward signed → guardian signed + submitted → confirmed on-chain.

| Field | Value |
|-------|-------|
| **Tx hash** | `0x4d770e...` *(confirm full hash from Voyager history of guardian wallet)* |
| **Action** | Ward transaction with full `[ward_sig, guardian_sig]` chain |
| **Ward address** | `0x049f329063e74482166e081f3994946ec71f138f17aeb4c193ef50c0065b7e46` |
| **Guardian** | Account 1: `0x3e83695578ca8a473f387f9b338e4e22f7cae02ddb8817a8951abcbf3e38248` |

---

## Test Wallet Addresses (Sepolia)

| Wallet | Stark Address | Used For |
|--------|--------------|----------|
| Test wallet 1 | `0x0588e2c3de574d3d9273b65b36007355479fba64e8ecad147764ac48cdea2872` | Primary test user |
| Test wallet 2 | `0x22837eb3ba3a474005ec995d5f548f76a6ad673a4eafe32a3b9172d54ce2a0f` | Cross-account transfers, guardian |

---

## Quick Reference — Voyager Links

| Resource | Voyager Link |
|----------|-------------|
| CloakDelegation contract | https://sepolia.voyager.online/contract/0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10 |
| ERC-8004 Identity Registry | https://sepolia.voyager.online/contract/0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631 |
| ERC-8004 Signer account | https://sepolia.voyager.online/contract/0x7f7d57934a34ee9357857488cc69a08af7976533874c4fea5a6dd433647d7b6 |
| Agent registration tx (testing002) | https://sepolia.voyager.online/tx/0x38ed95d74c84b1ce57f156cdfa5dbb4f7943c782a639fceabb7697a1f3d94db |
