// SPDX-License-Identifier: MIT
// Cloak Multi-Sig Account Contract
//
// Custom account contract implementing SRC6 with optional dual-signature (2FA).
// When a secondary key is set, ALL transactions require two ECDSA signatures:
//   signature = [r1, s1, r2, s2]
// This is enforced on-chain — single-sig transactions are rejected by the contract.

#[starknet::interface]
pub trait ICloakAccount<TContractState> {
    fn get_public_key(self: @TContractState) -> felt252;
    fn get_secondary_key(self: @TContractState) -> felt252;
    fn is_2fa_enabled(self: @TContractState) -> bool;
    fn set_secondary_key(ref self: TContractState, new_key: felt252);
    fn remove_secondary_key(ref self: TContractState);
    fn upgrade(ref self: TContractState, new_class_hash: starknet::ClassHash);
}

#[starknet::contract(account)]
pub mod CloakAccount {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use openzeppelin_account::interface;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::account::Call;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{
        ClassHash, SyscallResultTrait, get_caller_address, get_contract_address, get_tx_info,
        syscalls::{call_contract_syscall, replace_class_syscall},
    };

    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        public_key: felt252,
        secondary_key: felt252,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252) {
        self.src5.register_interface(interface::ISRC6_ID);
        self.public_key.write(public_key);
        // secondary_key defaults to 0 (2FA disabled)
    }

    // Internal helpers
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Validates the current transaction's signature(s).
        /// Always checks primary key. If 2FA enabled, also checks secondary key.
        fn validate_transaction(self: @ContractState) -> felt252 {
            let tx_info = get_tx_info().unbox();
            let tx_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;

            // Primary signature (always required)
            assert(signature.len() >= 2, 'Missing primary signature');
            assert(
                check_ecdsa_signature(
                    tx_hash, self.public_key.read(), *signature.at(0), *signature.at(1),
                ),
                'Invalid primary signature',
            );

            // Secondary signature (required when 2FA is active)
            let sec_key = self.secondary_key.read();
            if sec_key != 0 {
                assert(signature.len() >= 4, 'Missing 2FA signature');
                assert(
                    check_ecdsa_signature(
                        tx_hash, sec_key, *signature.at(2), *signature.at(3),
                    ),
                    'Invalid 2FA signature',
                );
            }

            starknet::VALIDATED
        }

        /// Validates a signature against an arbitrary hash (for off-chain verification).
        fn is_valid_sig(
            self: @ContractState, hash: felt252, signature: Span<felt252>,
        ) -> bool {
            if signature.len() < 2 {
                return false;
            }
            if !check_ecdsa_signature(
                hash, self.public_key.read(), *signature.at(0), *signature.at(1),
            ) {
                return false;
            }

            let sec_key = self.secondary_key.read();
            if sec_key != 0 {
                if signature.len() < 4 {
                    return false;
                }
                if !check_ecdsa_signature(
                    hash, sec_key, *signature.at(2), *signature.at(3),
                ) {
                    return false;
                }
            }
            true
        }
    }

    // SRC6 (Account standard)
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
            self.validate_transaction()
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

    #[abi(embed_v0)]
    impl DeclarerImpl of interface::IDeclarer<ContractState> {
        fn __validate_declare__(self: @ContractState, class_hash: felt252) -> felt252 {
            self.validate_transaction()
        }
    }

    #[abi(embed_v0)]
    impl DeployableImpl of interface::IDeployable<ContractState> {
        fn __validate_deploy__(
            self: @ContractState,
            class_hash: felt252,
            contract_address_salt: felt252,
            public_key: felt252,
        ) -> felt252 {
            self.validate_transaction()
        }
    }

    // Cloak-specific management (self-call only)
    #[abi(embed_v0)]
    impl CloakAccountImpl of super::ICloakAccount<ContractState> {
        fn get_public_key(self: @ContractState) -> felt252 {
            self.public_key.read()
        }

        fn get_secondary_key(self: @ContractState) -> felt252 {
            self.secondary_key.read()
        }

        fn is_2fa_enabled(self: @ContractState) -> bool {
            self.secondary_key.read() != 0
        }

        fn set_secondary_key(ref self: ContractState, new_key: felt252) {
            assert(get_caller_address() == get_contract_address(), 'Only self');
            self.secondary_key.write(new_key);
        }

        fn remove_secondary_key(ref self: ContractState) {
            assert(get_caller_address() == get_contract_address(), 'Only self');
            self.secondary_key.write(0);
        }

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            assert(get_caller_address() == get_contract_address(), 'Only self');
            replace_class_syscall(new_class_hash).unwrap();
        }
    }
}
