// SPDX-License-Identifier: MIT
// Cloak Ward Account Contract
//
// A special account contract permanently linked to a Guardian (CloakAccount).
// The ward CANNOT create further wards — it is a leaf node by design.
//
// Signature validation chain (in __validate__):
//   1. Ward primary signature     — ALWAYS required
//   2. Ward 2FA signature         — IF ward has 2FA enabled
//   3. Guardian primary signature — IF transaction needs guardian approval
//   4. Guardian 2FA signature     — IF guardian has 2FA enabled AND guardian approval needed
//
// Guardian approval is needed when:
//   - require_guardian_for_all is true, OR
//   - Transaction amount exceeds per-tx spending limit, OR
//   - Account is calling an unknown contract (not in known_tokens)
//
// The guardian can:
//   - Set spending limits (per-tx)
//   - Freeze / unfreeze the account
//   - Update their 2FA key on this contract
//
// The ward can:
//   - Enable/disable their own 2FA (separate from guardian)
//   - Transact freely within spending limits (if require_guardian_for_all is false)

#[starknet::interface]
pub trait ICloakWard<TContractState> {
    // ── Query functions ──
    fn get_public_key(self: @TContractState) -> felt252;
    fn get_guardian_address(self: @TContractState) -> felt252;
    fn get_guardian_public_key(self: @TContractState) -> felt252;
    fn is_guardian_2fa_enabled(self: @TContractState) -> bool;
    fn get_secondary_key(self: @TContractState) -> felt252;
    fn is_2fa_enabled(self: @TContractState) -> bool;
    fn is_frozen(self: @TContractState) -> bool;
    fn get_spending_limit_per_tx(self: @TContractState) -> felt252;
    fn is_require_guardian_for_all(self: @TContractState) -> bool;
    fn get_account_type(self: @TContractState) -> felt252; // Returns 'WARD'

    // ── Ward self-management (self-call only) ──
    fn set_secondary_key(ref self: TContractState, new_key: felt252);
    fn remove_secondary_key(ref self: TContractState);

    // ── Guardian-only management ──
    fn set_spending_limit(ref self: TContractState, limit_per_tx: felt252);
    fn set_require_guardian_for_all(ref self: TContractState, required: bool);
    fn freeze(ref self: TContractState);
    fn unfreeze(ref self: TContractState);
    fn update_guardian_2fa(ref self: TContractState, key: felt252, enabled: bool);
    fn add_known_token(ref self: TContractState, token_address: felt252);
    fn remove_known_token(ref self: TContractState, token_address: felt252);

    // ── Upgrade ──
    fn upgrade(ref self: TContractState, new_class_hash: starknet::ClassHash);
}

#[starknet::contract(account)]
pub mod CloakWard {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use openzeppelin_account::interface;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::account::Call;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ClassHash, ContractAddress, SyscallResultTrait, get_caller_address, get_contract_address,
        get_tx_info, syscalls::{call_contract_syscall, replace_class_syscall},
    };

    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    // ── ERC20 selectors for amount parsing ──
    // transfer(recipient, amount_low, amount_high)
    const ERC20_TRANSFER_SELECTOR: felt252 =
        0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;
    // approve(spender, amount_low, amount_high)
    const ERC20_APPROVE_SELECTOR: felt252 =
        0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c;

    // Account type marker
    const WARD_TYPE: felt252 = 'WARD';

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        // Ward identity
        public_key: felt252,
        // Guardian link (immutable after deploy)
        guardian_address: ContractAddress,
        guardian_public_key: felt252,
        // Guardian 2FA (synced from guardian's CloakAccount)
        guardian_2fa_key: felt252,
        guardian_2fa_enabled: bool,
        // Ward's own 2FA (independent of guardian)
        secondary_key: felt252,
        // Spending limits (set by guardian)
        limit_per_tx: felt252, // Max per single tx (0 = unlimited)
        require_guardian_for_all: bool, // If true, ALL txs need guardian sig
        // Freeze
        frozen: bool,
        // Known token contracts (for amount parsing)
        known_token_count: u32,
        known_tokens: Map<u32, felt252>, // index → token contract address
        known_token_index: Map<felt252, u32>, // token address → index+1 (0 = not known)
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        public_key: felt252,
        guardian_address: ContractAddress,
        guardian_public_key: felt252,
    ) {
        self.src5.register_interface(interface::ISRC6_ID);
        self.public_key.write(public_key);
        self.guardian_address.write(guardian_address);
        self.guardian_public_key.write(guardian_public_key);
        // Defaults: no 2FA, no limits, not frozen, require guardian for all
        self.require_guardian_for_all.write(true);
    }

    // ── Internal helpers ──
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Check if the caller is the guardian account
        fn assert_guardian(self: @ContractState) {
            assert(
                get_caller_address() == self.guardian_address.read(), 'Only guardian',
            );
        }

        /// Check if the caller is self (for self-management operations)
        fn assert_self(self: @ContractState) {
            assert(get_caller_address() == get_contract_address(), 'Only self');
        }

        /// Parse total value being transferred from a set of calls.
        /// Only parses known ERC20 token contracts (transfer + approve).
        /// Unknown contract calls return felt252::max to force guardian approval.
        fn parse_total_value(self: @ContractState, calls: Span<Call>) -> felt252 {
            let mut total: felt252 = 0;
            let mut has_unknown = false;

            for call in calls {
                let Call { to, selector, calldata } = *call;
                let to_felt: felt252 = to.into();

                // Check if this is a known token contract
                let token_idx = self.known_token_index.read(to_felt);
                if token_idx != 0 {
                    // Known token — parse amount from calldata
                    if selector == ERC20_TRANSFER_SELECTOR
                        || selector == ERC20_APPROVE_SELECTOR {
                        // calldata: [recipient, amount_low, amount_high]
                        if calldata.len() >= 2 {
                            // Use amount_low only (felt252 is enough for practical amounts)
                            total = total + *calldata.at(1);
                        }
                    }
                    // Other selectors on known tokens (e.g., Tongo ops) — don't add to total
                    // They go through guardian if require_guardian_for_all is set
                } else {
                    // Self-calls (set_secondary_key, etc.) don't need guardian
                    if to != get_contract_address() {
                        has_unknown = true;
                    }
                }
            };

            if has_unknown {
                // Force guardian approval for unknown contracts
                // Use a very large value that will exceed any limit
                return 'UNKNOWN_CALL';
            }

            total
        }

        /// Determine if guardian signature is needed for this transaction
        fn needs_guardian_approval(self: @ContractState, calls: Span<Call>) -> bool {
            // Frozen accounts can't transact at all (checked separately)
            // Check require_guardian_for_all flag
            if self.require_guardian_for_all.read() {
                // Exception: self-calls (ward managing own 2FA) don't need guardian
                let self_addr = get_contract_address();
                let mut all_self = true;
                for call in calls {
                    if *call.to != self_addr {
                        all_self = false;
                    }
                };
                if all_self {
                    return false;
                }
                return true;
            }

            // Check spending limit
            let limit = self.limit_per_tx.read();
            if limit == 0 {
                // No limit set — no guardian needed (unless require_guardian_for_all)
                return false;
            }

            let total_value = self.parse_total_value(calls);

            // Unknown calls always need guardian
            if total_value == 'UNKNOWN_CALL' {
                return true;
            }

            // Check if total exceeds per-tx limit
            // Since felt252 comparison isn't straightforward, we use a subtraction check
            // If total > limit, then total - limit won't underflow in felt arithmetic
            // For simplicity in hackathon: compare as u256
            let total_u256: u256 = total_value.into();
            let limit_u256: u256 = limit.into();

            total_u256 > limit_u256
        }

        /// Validate guardian signatures starting at the given offset
        fn validate_guardian_sigs(
            self: @ContractState, tx_hash: felt252, signature: Span<felt252>, offset: u32,
        ) -> u32 {
            let mut off = offset;

            // ── 3. Guardian primary signature ──
            assert(signature.len() >= off + 2, 'Missing guardian signature');
            assert(
                check_ecdsa_signature(
                    tx_hash,
                    self.guardian_public_key.read(),
                    *signature.at(off),
                    *signature.at(off + 1),
                ),
                'Invalid guardian signature',
            );
            off += 2;

            // ── 4. Guardian 2FA signature (if guardian has 2FA) ──
            if self.guardian_2fa_enabled.read() {
                let g2fa_key = self.guardian_2fa_key.read();
                if g2fa_key != 0 {
                    assert(
                        signature.len() >= off + 2, 'Missing guardian 2FA signature',
                    );
                    assert(
                        check_ecdsa_signature(
                            tx_hash, g2fa_key, *signature.at(off), *signature.at(off + 1),
                        ),
                        'Invalid guardian 2FA signature',
                    );
                    off += 2;
                }
            }

            off
        }

        /// Full validation with calls (determines if guardian is needed)
        fn validate_with_calls(self: @ContractState, calls: Array<Call>) -> felt252 {
            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            // ── Check frozen ──
            assert(!self.frozen.read(), 'Account frozen by guardian');

            let mut offset: u32 = 0;

            // ── 1. Ward primary signature (ALWAYS) ──
            assert(signature.len() >= 2, 'Missing ward signature');
            assert(
                check_ecdsa_signature(
                    tx_hash, self.public_key.read(), *signature.at(0), *signature.at(1),
                ),
                'Invalid ward signature',
            );
            offset = 2;

            // ── 2. Ward 2FA signature (if enabled) ──
            let ward_2fa_key = self.secondary_key.read();
            if ward_2fa_key != 0 {
                assert(signature.len() >= offset + 2, 'Missing ward 2FA signature');
                assert(
                    check_ecdsa_signature(
                        tx_hash, ward_2fa_key, *signature.at(offset), *signature.at(offset + 1),
                    ),
                    'Invalid ward 2FA signature',
                );
                offset += 2;
            }

            // ── 3 & 4. Guardian signatures (if needed) ──
            let guardian_needed = self.needs_guardian_approval(calls.span());
            if guardian_needed {
                let _final_offset = self.validate_guardian_sigs(tx_hash, signature, offset);
            }

            starknet::VALIDATED
        }

        /// Validate a signature against an arbitrary hash (off-chain verification)
        fn is_valid_sig(
            self: @ContractState, hash: felt252, signature: Span<felt252>,
        ) -> bool {
            if signature.len() < 2 {
                return false;
            }
            // Check ward primary sig
            if !check_ecdsa_signature(
                hash, self.public_key.read(), *signature.at(0), *signature.at(1),
            ) {
                return false;
            }

            let mut offset: u32 = 2;

            // Check ward 2FA if enabled
            let ward_2fa_key = self.secondary_key.read();
            if ward_2fa_key != 0 {
                if signature.len() < offset + 2 {
                    return false;
                }
                if !check_ecdsa_signature(
                    hash, ward_2fa_key, *signature.at(offset), *signature.at(offset + 1),
                ) {
                    return false;
                }
                offset += 2;
            }

            // If there are more sig elements, check guardian
            if signature.len() >= offset + 2 {
                if !check_ecdsa_signature(
                    hash,
                    self.guardian_public_key.read(),
                    *signature.at(offset),
                    *signature.at(offset + 1),
                ) {
                    return false;
                }
                offset += 2;

                // Check guardian 2FA if present
                if self.guardian_2fa_enabled.read() && signature.len() >= offset + 2 {
                    let g2fa_key = self.guardian_2fa_key.read();
                    if g2fa_key != 0 {
                        if !check_ecdsa_signature(
                            hash, g2fa_key, *signature.at(offset), *signature.at(offset + 1),
                        ) {
                            return false;
                        }
                    }
                }
            }

            true
        }
    }

    // ── SRC6 (Account standard) ──
    #[abi(embed_v0)]
    impl SRC6Impl of interface::ISRC6<ContractState> {
        fn __execute__(self: @ContractState, calls: Array<Call>) {
            let sender = get_caller_address();
            assert(sender.is_zero(), 'Invalid caller');

            for call in calls.span() {
                let Call { to, selector, calldata } = *call;
                call_contract_syscall(to, selector, calldata).unwrap_syscall();
            }
        }

        fn __validate__(self: @ContractState, calls: Array<Call>) -> felt252 {
            self.validate_with_calls(calls)
        }

        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            if self.is_valid_sig(hash, signature.span()) {
                starknet::VALIDATED
            } else {
                0
            }
        }
    }

    // Note: No DeclarerImpl or DeployableImpl needed.
    // Wards are deployed by the Guardian via UDC (account.deploy()),
    // not via self-deploy (deployAccount). Wards don't declare contracts.

    // ── CloakWard-specific management ──
    #[abi(embed_v0)]
    impl CloakWardImpl of super::ICloakWard<ContractState> {
        // ── Query functions ──

        fn get_public_key(self: @ContractState) -> felt252 {
            self.public_key.read()
        }

        fn get_guardian_address(self: @ContractState) -> felt252 {
            let addr: ContractAddress = self.guardian_address.read();
            addr.into()
        }

        fn get_guardian_public_key(self: @ContractState) -> felt252 {
            self.guardian_public_key.read()
        }

        fn is_guardian_2fa_enabled(self: @ContractState) -> bool {
            self.guardian_2fa_enabled.read()
        }

        fn get_secondary_key(self: @ContractState) -> felt252 {
            self.secondary_key.read()
        }

        fn is_2fa_enabled(self: @ContractState) -> bool {
            self.secondary_key.read() != 0
        }

        fn is_frozen(self: @ContractState) -> bool {
            self.frozen.read()
        }

        fn get_spending_limit_per_tx(self: @ContractState) -> felt252 {
            self.limit_per_tx.read()
        }

        fn is_require_guardian_for_all(self: @ContractState) -> bool {
            self.require_guardian_for_all.read()
        }

        fn get_account_type(self: @ContractState) -> felt252 {
            WARD_TYPE
        }

        // ── Ward self-management (self-call only) ──

        fn set_secondary_key(ref self: ContractState, new_key: felt252) {
            self.assert_self();
            self.secondary_key.write(new_key);
        }

        fn remove_secondary_key(ref self: ContractState) {
            self.assert_self();
            self.secondary_key.write(0);
        }

        // ── Guardian-only management ──

        fn set_spending_limit(ref self: ContractState, limit_per_tx: felt252) {
            self.assert_guardian();
            self.limit_per_tx.write(limit_per_tx);
        }

        fn set_require_guardian_for_all(ref self: ContractState, required: bool) {
            self.assert_guardian();
            self.require_guardian_for_all.write(required);
        }

        fn freeze(ref self: ContractState) {
            self.assert_guardian();
            self.frozen.write(true);
        }

        fn unfreeze(ref self: ContractState) {
            self.assert_guardian();
            self.frozen.write(false);
        }

        fn update_guardian_2fa(ref self: ContractState, key: felt252, enabled: bool) {
            self.assert_guardian();
            self.guardian_2fa_key.write(key);
            self.guardian_2fa_enabled.write(enabled);
        }

        fn add_known_token(ref self: ContractState, token_address: felt252) {
            self.assert_guardian();
            // Check not already added
            let existing = self.known_token_index.read(token_address);
            if existing != 0 {
                return; // Already known
            }
            let idx = self.known_token_count.read();
            self.known_tokens.write(idx, token_address);
            self.known_token_index.write(token_address, idx + 1); // +1 so 0 means "not found"
            self.known_token_count.write(idx + 1);
        }

        fn remove_known_token(ref self: ContractState, token_address: felt252) {
            self.assert_guardian();
            let idx_plus_one = self.known_token_index.read(token_address);
            if idx_plus_one == 0 {
                return; // Not known
            }
            // Mark as removed
            self.known_token_index.write(token_address, 0);
            // Note: we don't compact the array — just remove the index lookup
            // This is fine for small token sets
        }

        // ── Upgrade ──

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // Only guardian can upgrade ward contract
            self.assert_guardian();
            replace_class_syscall(new_class_hash).unwrap();
        }
    }
}
