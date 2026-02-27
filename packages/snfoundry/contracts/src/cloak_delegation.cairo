// SPDX-License-Identifier: MIT
// Cloak Delegation Contract
//
// Non-account contract that manages spending delegations for agent marketplace.
// Operators can create delegations with per-run and total allowance limits,
// and agents consume delegations within those bounds.

#[starknet::interface]
pub trait ICloakDelegation<TContractState> {
    fn create_delegation(
        ref self: TContractState,
        operator: felt252,
        agent_id: felt252,
        token: felt252,
        max_per_run: felt252,
        total_allowance: felt252,
        valid_from: u64,
        valid_until: u64,
    ) -> felt252;
    fn revoke_delegation(ref self: TContractState, delegation_id: felt252);
    fn consume_delegation(ref self: TContractState, delegation_id: felt252, amount: felt252);
    fn consume_and_transfer(
        ref self: TContractState,
        delegation_id: felt252,
        amount: felt252,
        recipient: felt252,
    );
    fn get_delegation(
        self: @TContractState, delegation_id: felt252,
    ) -> (felt252, felt252, felt252, felt252, felt252, felt252, felt252, u64, u64, felt252);
    fn get_delegation_remaining(self: @TContractState, delegation_id: felt252) -> felt252;
    fn is_delegation_active(self: @TContractState, delegation_id: felt252) -> bool;
    fn get_delegation_count(self: @TContractState) -> felt252;
}

#[starknet::contract]
pub mod CloakDelegation {
    use starknet::get_block_timestamp;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::syscalls::call_contract_syscall;

    const STATUS_ACTIVE: felt252 = 0;
    const STATUS_REVOKED: felt252 = 1;

    #[storage]
    struct Storage {
        next_delegation_id: felt252,
        delegation_operators: Map<felt252, felt252>,
        delegation_agent_ids: Map<felt252, felt252>,
        delegation_tokens: Map<felt252, felt252>,
        delegation_max_per_run: Map<felt252, felt252>,
        delegation_total_allowance: Map<felt252, felt252>,
        delegation_consumed: Map<felt252, felt252>,
        delegation_nonces: Map<felt252, felt252>,
        delegation_valid_from: Map<felt252, u64>,
        delegation_valid_until: Map<felt252, u64>,
        delegation_status: Map<felt252, felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        DelegationCreated: DelegationCreated,
        DelegationRevoked: DelegationRevoked,
        DelegationConsumed: DelegationConsumed,
    }

    #[derive(Drop, starknet::Event)]
    struct DelegationCreated {
        #[key]
        delegation_id: felt252,
        operator: felt252,
        agent_id: felt252,
        token: felt252,
        total_allowance: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct DelegationRevoked {
        #[key]
        delegation_id: felt252,
        operator: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct DelegationConsumed {
        #[key]
        delegation_id: felt252,
        amount: felt252,
        new_consumed: felt252,
        nonce: felt252,
        recipient: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_delegation_id.write(1);
    }

    #[abi(embed_v0)]
    impl CloakDelegationImpl of super::ICloakDelegation<ContractState> {
        fn create_delegation(
            ref self: ContractState,
            operator: felt252,
            agent_id: felt252,
            token: felt252,
            max_per_run: felt252,
            total_allowance: felt252,
            valid_from: u64,
            valid_until: u64,
        ) -> felt252 {
            assert(operator != 0, 'Operator cannot be zero');
            assert(token != 0, 'Token cannot be zero');
            assert(total_allowance != 0, 'Allowance cannot be zero');
            assert(valid_until > valid_from, 'Invalid time range');

            let delegation_id = self.next_delegation_id.read();
            self.next_delegation_id.write(delegation_id + 1);

            self.delegation_operators.entry(delegation_id).write(operator);
            self.delegation_agent_ids.entry(delegation_id).write(agent_id);
            self.delegation_tokens.entry(delegation_id).write(token);
            self.delegation_max_per_run.entry(delegation_id).write(max_per_run);
            self.delegation_total_allowance.entry(delegation_id).write(total_allowance);
            self.delegation_consumed.entry(delegation_id).write(0);
            self.delegation_nonces.entry(delegation_id).write(0);
            self.delegation_valid_from.entry(delegation_id).write(valid_from);
            self.delegation_valid_until.entry(delegation_id).write(valid_until);
            self.delegation_status.entry(delegation_id).write(STATUS_ACTIVE);

            self
                .emit(
                    DelegationCreated { delegation_id, operator, agent_id, token, total_allowance },
                );

            delegation_id
        }

        fn revoke_delegation(ref self: ContractState, delegation_id: felt252) {
            let operator = self.delegation_operators.entry(delegation_id).read();
            assert(operator != 0, 'Delegation does not exist');

            let status = self.delegation_status.entry(delegation_id).read();
            assert(status == STATUS_ACTIVE, 'Delegation not active');

            // Only the original operator can revoke
            let caller: felt252 = starknet::get_caller_address().into();
            assert(caller == operator, 'Only operator can revoke');

            self.delegation_status.entry(delegation_id).write(STATUS_REVOKED);

            self.emit(DelegationRevoked { delegation_id, operator });
        }

        fn consume_delegation(ref self: ContractState, delegation_id: felt252, amount: felt252) {
            let status = self.delegation_status.entry(delegation_id).read();
            assert(status == STATUS_ACTIVE, 'Delegation not active');

            // Time bounds check
            let now = get_block_timestamp();
            let valid_from = self.delegation_valid_from.entry(delegation_id).read();
            let valid_until = self.delegation_valid_until.entry(delegation_id).read();
            assert(now >= valid_from, 'Delegation not yet valid');
            assert(now <= valid_until, 'Delegation expired');

            // Per-run limit check (cast to u256 since felt252 has no PartialOrd)
            let max_per_run = self.delegation_max_per_run.entry(delegation_id).read();
            let amount_u: u256 = amount.into();
            let max_per_run_u: u256 = max_per_run.into();
            assert(amount_u <= max_per_run_u, 'Exceeds per-run limit');

            // Total allowance check
            let consumed = self.delegation_consumed.entry(delegation_id).read();
            let total_allowance = self.delegation_total_allowance.entry(delegation_id).read();
            let consumed_u: u256 = consumed.into();
            let total_allowance_u: u256 = total_allowance.into();
            assert(consumed_u + amount_u <= total_allowance_u, 'Exceeds total allowance');

            // Update consumed and nonce
            let new_consumed = consumed + amount;
            self.delegation_consumed.entry(delegation_id).write(new_consumed);

            let nonce = self.delegation_nonces.entry(delegation_id).read();
            let new_nonce = nonce + 1;
            self.delegation_nonces.entry(delegation_id).write(new_nonce);

            self
                .emit(
                    DelegationConsumed {
                        delegation_id, amount, new_consumed, nonce: new_nonce, recipient: 0,
                    },
                );
        }

        fn consume_and_transfer(
            ref self: ContractState,
            delegation_id: felt252,
            amount: felt252,
            recipient: felt252,
        ) {
            assert(recipient != 0, 'Recipient cannot be zero');

            let status = self.delegation_status.entry(delegation_id).read();
            assert(status == STATUS_ACTIVE, 'Delegation not active');

            // Time bounds check
            let now = get_block_timestamp();
            let valid_from = self.delegation_valid_from.entry(delegation_id).read();
            let valid_until = self.delegation_valid_until.entry(delegation_id).read();
            assert(now >= valid_from, 'Delegation not yet valid');
            assert(now <= valid_until, 'Delegation expired');

            // Per-run limit check
            let max_per_run = self.delegation_max_per_run.entry(delegation_id).read();
            let amount_u: u256 = amount.into();
            let max_per_run_u: u256 = max_per_run.into();
            assert(amount_u <= max_per_run_u, 'Exceeds per-run limit');

            // Total allowance check
            let consumed = self.delegation_consumed.entry(delegation_id).read();
            let total_allowance = self.delegation_total_allowance.entry(delegation_id).read();
            let consumed_u: u256 = consumed.into();
            let total_allowance_u: u256 = total_allowance.into();
            assert(consumed_u + amount_u <= total_allowance_u, 'Exceeds total allowance');

            // Update consumed and nonce
            let new_consumed = consumed + amount;
            self.delegation_consumed.entry(delegation_id).write(new_consumed);

            let nonce = self.delegation_nonces.entry(delegation_id).read();
            let new_nonce = nonce + 1;
            self.delegation_nonces.entry(delegation_id).write(new_nonce);

            // ERC-20 transferFrom: move tokens from operator to recipient
            let operator = self.delegation_operators.entry(delegation_id).read();
            let token_address = self.delegation_tokens.entry(delegation_id).read();

            // Split amount into u256 (low, high) for ERC-20 calldata
            let amount_low: felt252 = (amount_u & 0xffffffffffffffffffffffffffffffff_u256)
                .try_into()
                .unwrap();
            let amount_high: felt252 = ((amount_u / 0x100000000000000000000000000000000_u256))
                .try_into()
                .unwrap();

            // transfer_from selector = starknet_keccak("transfer_from")
            let transfer_from_selector =
                0x3704ffe8fba161be0e994951751a5033b1462b918ff785c0a636be718dfdb68;

            let mut calldata = array![operator, recipient, amount_low, amount_high];
            let result = call_contract_syscall(
                token_address.try_into().unwrap(),
                transfer_from_selector,
                calldata.span(),
            );
            match result {
                Result::Ok(_) => {},
                Result::Err(_) => { panic!("transferFrom failed"); },
            }

            self
                .emit(
                    DelegationConsumed {
                        delegation_id, amount, new_consumed, nonce: new_nonce, recipient,
                    },
                );
        }

        fn get_delegation(
            self: @ContractState, delegation_id: felt252,
        ) -> (felt252, felt252, felt252, felt252, felt252, felt252, felt252, u64, u64, felt252) {
            let operator = self.delegation_operators.entry(delegation_id).read();
            let agent_id = self.delegation_agent_ids.entry(delegation_id).read();
            let token = self.delegation_tokens.entry(delegation_id).read();
            let max_per_run = self.delegation_max_per_run.entry(delegation_id).read();
            let total_allowance = self.delegation_total_allowance.entry(delegation_id).read();
            let consumed = self.delegation_consumed.entry(delegation_id).read();
            let nonce = self.delegation_nonces.entry(delegation_id).read();
            let valid_from = self.delegation_valid_from.entry(delegation_id).read();
            let valid_until = self.delegation_valid_until.entry(delegation_id).read();
            let status = self.delegation_status.entry(delegation_id).read();

            (
                operator,
                agent_id,
                token,
                max_per_run,
                total_allowance,
                consumed,
                nonce,
                valid_from,
                valid_until,
                status,
            )
        }

        fn get_delegation_remaining(self: @ContractState, delegation_id: felt252) -> felt252 {
            let total_allowance = self.delegation_total_allowance.entry(delegation_id).read();
            let consumed = self.delegation_consumed.entry(delegation_id).read();
            total_allowance - consumed
        }

        fn is_delegation_active(self: @ContractState, delegation_id: felt252) -> bool {
            let status = self.delegation_status.entry(delegation_id).read();
            if status != STATUS_ACTIVE {
                return false;
            }

            let now = get_block_timestamp();
            let valid_from = self.delegation_valid_from.entry(delegation_id).read();
            let valid_until = self.delegation_valid_until.entry(delegation_id).read();

            now >= valid_from && now <= valid_until
        }

        fn get_delegation_count(self: @ContractState) -> felt252 {
            // next_delegation_id starts at 1, so count = next_id - 1
            self.next_delegation_id.read() - 1
        }
    }
}
