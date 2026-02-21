use contracts::cloak_ward::{ICloakWardDispatcher, ICloakWardDispatcherTrait};
use openzeppelin_account::interface::{ISRC6Dispatcher, ISRC6DispatcherTrait};
use openzeppelin_testing::constants::AsAddressTrait;
use openzeppelin_testing::constants::stark::{KEY_PAIR, KEY_PAIR_2};
use openzeppelin_testing::declare_and_deploy;
use openzeppelin_testing::signing::{SerializedSigning, StarkKeyPair, get_stark_keys_from};
use openzeppelin_utils::serde::SerializedAppend;
use snforge_std::{
    CheatSpan, cheat_block_timestamp, cheat_caller_address, cheat_signature,
    cheat_transaction_hash,
};
use starknet::ContractAddress;
use starknet::account::Call;

const ERC20_TRANSFER_SELECTOR: felt252 =
    0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e;

fn deploy_ward(
    ward_public_key: felt252, guardian_address: ContractAddress, guardian_public_key: felt252,
) -> (ContractAddress, ICloakWardDispatcher, ISRC6Dispatcher) {
    let mut calldata = array![];
    calldata.append_serde(ward_public_key);
    calldata.append_serde(guardian_address);
    calldata.append_serde(guardian_public_key);

    let ward_address = declare_and_deploy("CloakWard", calldata);
    let ward = ICloakWardDispatcher { contract_address: ward_address };
    let src6 = ISRC6Dispatcher { contract_address: ward_address };
    (ward_address, ward, src6)
}

fn as_guardian_for_next_call(ward_address: ContractAddress, guardian_address: ContractAddress) {
    cheat_caller_address(ward_address, guardian_address, CheatSpan::TargetCalls(1));
}

fn as_self_for_next_call(ward_address: ContractAddress) {
    cheat_caller_address(ward_address, ward_address, CheatSpan::TargetCalls(1));
}

fn set_block_timestamp_for_next_call(ward_address: ContractAddress, ts: u64) {
    cheat_block_timestamp(ward_address, ts, CheatSpan::TargetCalls(1));
}

fn make_transfer_call(token: ContractAddress, amount_low: felt252) -> Call {
    let calldata = array!['RECIPIENT', amount_low, 0];
    Call { to: token, selector: ERC20_TRANSFER_SELECTOR, calldata: calldata.span() }
}

fn push_sig(ref out: Array<felt252>, sig: Array<felt252>) {
    for value in sig.span() {
        out.append(*value);
    };
}

fn validate_calls(
    src6: ISRC6Dispatcher,
    ward_address: ContractAddress,
    tx_hash: felt252,
    signature: Array<felt252>,
    calls: Array<Call>,
) -> felt252 {
    cheat_transaction_hash(ward_address, tx_hash, CheatSpan::TargetCalls(1));
    cheat_signature(ward_address, signature.span(), CheatSpan::TargetCalls(1));
    src6.__validate__(calls)
}

fn setup_base_policy(
    ward_address: ContractAddress,
    ward: ICloakWardDispatcher,
    guardian_address: ContractAddress,
    known_token: ContractAddress,
    per_tx_limit: felt252,
) {
    as_guardian_for_next_call(ward_address, guardian_address);
    ward.set_require_guardian_for_all(false);

    as_guardian_for_next_call(ward_address, guardian_address);
    ward.set_spending_limit(per_tx_limit);

    as_guardian_for_next_call(ward_address, guardian_address);
    ward.add_known_token(known_token.into());
}

fn set_daily_limit(
    ward_address: ContractAddress,
    ward: ICloakWardDispatcher,
    guardian_address: ContractAddress,
    limit_24h: felt252,
    ts: u64,
) {
    set_block_timestamp_for_next_call(ward_address, ts);
    as_guardian_for_next_call(ward_address, guardian_address);
    ward.set_spending_limit_24h(limit_24h);
}

fn record_daily_spend(
    ward_address: ContractAddress, ward: ICloakWardDispatcher, amount: felt252, ts: u64,
) {
    set_block_timestamp_for_next_call(ward_address, ts);
    as_self_for_next_call(ward_address);
    ward.record_daily_spend(amount);
}

#[test]
fn test_ward_normal_payment_no_guardian_needed() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    let tx_hash = 'TX_NORMAL';
    let ward_sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 50)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, ward_sig, calls);
    assert(is_valid == starknet::VALIDATED, 'normal payment invalid');
}

#[test]
fn test_ward_normal_payment_with_ward2fa_and_guardian2fa_no_guardian_needed() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let ward_2fa_keys: StarkKeyPair = get_stark_keys_from('WARD_2FA_PRIVATE');
    let guardian_2fa_keys: StarkKeyPair = get_stark_keys_from('GUARDIAN_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    as_self_for_next_call(ward_address);
    ward.set_secondary_key(ward_2fa_keys.public_key);

    as_guardian_for_next_call(ward_address, guardian_address);
    ward.update_guardian_2fa(guardian_2fa_keys.public_key, true);

    let tx_hash = 'TX_NORMAL_2FA';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    push_sig(ref sig, ward_2fa_keys.serialized_sign(tx_hash));

    let calls = array![make_transfer_call(known_token, 50)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'normal 2fa invalid');
}

#[test]
#[should_panic(expected: 'Missing ward signature')]
fn test_missing_ward_signature_rejected() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);
    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    let tx_hash = 'TX_MISSING_WARD_SIG';
    let sig = array![];
    let calls = array![make_transfer_call(known_token, 50)];
    let _ = validate_calls(src6, ward_address, tx_hash, sig, calls);
}

#[test]
#[should_panic(expected: 'Missing ward 2FA signature')]
fn test_missing_ward_2fa_signature_rejected_when_enabled() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let ward_2fa_keys: StarkKeyPair = get_stark_keys_from('WARD_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);
    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    as_self_for_next_call(ward_address);
    ward.set_secondary_key(ward_2fa_keys.public_key);

    let tx_hash = 'TX_MISSING_WARD_2FA';
    let sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 50)];
    let _ = validate_calls(src6, ward_address, tx_hash, sig, calls);
}

#[test]
#[should_panic(expected: 'Missing guardian signature')]
fn test_ward_payment_exceed_max_per_tx_requires_guardian() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    let tx_hash = 'TX_EXCEED_MAX';
    let ward_only_sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 150)];
    let _ = validate_calls(src6, ward_address, tx_hash, ward_only_sig, calls);
}

#[test]
fn test_ward_payment_exceed_max_per_tx_with_guardian_sig_passes() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    let tx_hash = 'TX_EXCEED_MAX_OK';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    push_sig(ref sig, guardian_keys.serialized_sign(tx_hash));

    let calls = array![make_transfer_call(known_token, 150)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'guardian payment invalid');
}

#[test]
#[should_panic(expected: 'Missing guardian signature')]
fn test_missing_guardian_signature_rejected_when_guardian_required_and_ward2fa_on() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let ward_2fa_keys: StarkKeyPair = get_stark_keys_from('WARD_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);
    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    as_self_for_next_call(ward_address);
    ward.set_secondary_key(ward_2fa_keys.public_key);

    let tx_hash = 'TX_MISSING_GUARDIAN_SIG';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    push_sig(ref sig, ward_2fa_keys.serialized_sign(tx_hash));

    let calls = array![make_transfer_call(known_token, 150)];
    let _ = validate_calls(src6, ward_address, tx_hash, sig, calls);
}

#[test]
#[should_panic(expected: 'Missing guardian 2FA signature')]
fn test_missing_guardian_2fa_signature_rejected_when_enabled() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_2fa_keys: StarkKeyPair = get_stark_keys_from('GUARDIAN_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);
    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    as_guardian_for_next_call(ward_address, guardian_address);
    ward.update_guardian_2fa(guardian_2fa_keys.public_key, true);

    let tx_hash = 'TX_MISSING_GUARDIAN_2FA';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    push_sig(ref sig, guardian_keys.serialized_sign(tx_hash));

    let calls = array![make_transfer_call(known_token, 150)];
    let _ = validate_calls(src6, ward_address, tx_hash, sig, calls);
}

#[test]
#[should_panic(expected: 'Missing ward 2FA signature')]
fn test_missing_ward_2fa_signature_rejected_before_guardian_checks() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let ward_2fa_keys: StarkKeyPair = get_stark_keys_from('WARD_2FA_PRIVATE');
    let guardian_2fa_keys: StarkKeyPair = get_stark_keys_from('GUARDIAN_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();

    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);
    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    as_self_for_next_call(ward_address);
    ward.set_secondary_key(ward_2fa_keys.public_key);

    as_guardian_for_next_call(ward_address, guardian_address);
    ward.update_guardian_2fa(guardian_2fa_keys.public_key, true);

    let tx_hash = 'TX_MISSING_WARD_2FA_PRECEDENCE';
    // Only ward primary provided: ward 2FA is required and missing.
    let sig = ward_keys.serialized_sign(tx_hash);

    let calls = array![make_transfer_call(known_token, 150)];
    let _ = validate_calls(src6, ward_address, tx_hash, sig, calls);
}

fn run_exceed_max_with_2fa_matrix(ward_has_2fa: bool, guardian_has_2fa: bool) {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let ward_2fa_keys: StarkKeyPair = get_stark_keys_from('WARD_2FA_PRIVATE');
    let guardian_2fa_keys: StarkKeyPair = get_stark_keys_from('GUARDIAN_2FA_PRIVATE');

    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 100);

    if ward_has_2fa {
        as_self_for_next_call(ward_address);
        ward.set_secondary_key(ward_2fa_keys.public_key);
    }

    if guardian_has_2fa {
        as_guardian_for_next_call(ward_address, guardian_address);
        ward.update_guardian_2fa(guardian_2fa_keys.public_key, true);
    }

    let tx_hash = 'TX_MATRIX_EXCEED';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    if ward_has_2fa {
        push_sig(ref sig, ward_2fa_keys.serialized_sign(tx_hash));
    }
    push_sig(ref sig, guardian_keys.serialized_sign(tx_hash));
    if guardian_has_2fa {
        push_sig(ref sig, guardian_2fa_keys.serialized_sign(tx_hash));
    }

    let calls = array![make_transfer_call(known_token, 150)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, '2fa matrix invalid');
}

#[test]
fn test_ward_exceed_max_matrix_ward2fa_off_guardian2fa_off() {
    run_exceed_max_with_2fa_matrix(false, false);
}

#[test]
fn test_ward_exceed_max_matrix_ward2fa_on_guardian2fa_off() {
    run_exceed_max_with_2fa_matrix(true, false);
}

#[test]
fn test_ward_exceed_max_matrix_ward2fa_off_guardian2fa_on() {
    run_exceed_max_with_2fa_matrix(false, true);
}

#[test]
fn test_ward_exceed_max_matrix_ward2fa_on_guardian2fa_on() {
    run_exceed_max_with_2fa_matrix(true, true);
}

fn run_daily_limit_exceed_requires_guardian_matrix(ward_has_2fa: bool, guardian_has_2fa: bool) {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let ward_2fa_keys: StarkKeyPair = get_stark_keys_from('WARD_2FA_PRIVATE');
    let guardian_2fa_keys: StarkKeyPair = get_stark_keys_from('GUARDIAN_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1);

    if ward_has_2fa {
        as_self_for_next_call(ward_address);
        ward.set_secondary_key(ward_2fa_keys.public_key);
    }

    if guardian_has_2fa {
        as_guardian_for_next_call(ward_address, guardian_address);
        ward.update_guardian_2fa(guardian_2fa_keys.public_key, true);
    }

    // Seed 24h spend state from a prior successful execution.
    record_daily_spend(ward_address, ward, 80, 10);

    set_block_timestamp_for_next_call(ward_address, 20);
    let tx_hash_2 = 'TX_DAILY_2';
    let mut sig_2 = array![];
    push_sig(ref sig_2, ward_keys.serialized_sign(tx_hash_2));
    if ward_has_2fa {
        push_sig(ref sig_2, ward_2fa_keys.serialized_sign(tx_hash_2));
    }
    let calls_2 = array![make_transfer_call(known_token, 30)];
    let _ = validate_calls(src6, ward_address, tx_hash_2, sig_2, calls_2);
}

#[test]
#[should_panic(expected: 'Missing guardian signature')]
fn test_ward_payment_exceed_daily_limit_requires_guardian_ward2fa_off_guardian2fa_off() {
    run_daily_limit_exceed_requires_guardian_matrix(false, false);
}

#[test]
#[should_panic(expected: 'Missing guardian signature')]
fn test_ward_payment_exceed_daily_limit_requires_guardian_ward2fa_on_guardian2fa_off() {
    run_daily_limit_exceed_requires_guardian_matrix(true, false);
}

#[test]
#[should_panic(expected: 'Missing guardian signature')]
fn test_ward_payment_exceed_daily_limit_requires_guardian_ward2fa_off_guardian2fa_on() {
    run_daily_limit_exceed_requires_guardian_matrix(false, true);
}

#[test]
#[should_panic(expected: 'Missing guardian signature')]
fn test_ward_payment_exceed_daily_limit_requires_guardian_ward2fa_on_guardian2fa_on() {
    run_daily_limit_exceed_requires_guardian_matrix(true, true);
}

#[test]
fn test_ward_payment_exceed_daily_limit_with_guardian_sig_passes() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1);
    record_daily_spend(ward_address, ward, 80, 10);

    set_block_timestamp_for_next_call(ward_address, 20);
    let tx_hash = 'TX_DAILY_WITH_GUARDIAN';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    push_sig(ref sig, guardian_keys.serialized_sign(tx_hash));
    let calls = array![make_transfer_call(known_token, 30)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'daily guardian invalid');
}

#[test]
fn test_ward_daily_limit_resets_after_24h() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1_000);
    record_daily_spend(ward_address, ward, 80, 1_000);

    // After 24h window passes, spent_24h should reset and ward-only tx is valid.
    set_block_timestamp_for_next_call(ward_address, 1_000 + 86_401);
    let tx_hash = 'TX_DAILY_RESET_24H';
    let sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 30)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'daily reset invalid');
}

#[test]
fn test_ward_daily_limit_exact_limit_allows_without_guardian() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1);
    record_daily_spend(ward_address, ward, 80, 10);

    // projected spend = 80 + 20 == 100 (allowed, no guardian required)
    set_block_timestamp_for_next_call(ward_address, 20);
    let tx_hash = 'TX_DAILY_EQ_LIMIT';
    let sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 20)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'daily eq invalid');
}

#[test]
fn test_ward_daily_limit_zero_means_unlimited() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 0, 1);
    record_daily_spend(ward_address, ward, 9_999, 10);

    set_block_timestamp_for_next_call(ward_address, 20);
    let tx_hash = 'TX_DAILY_UNLIMITED';
    let sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 5_000)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'daily zero invalid');
}

#[test]
fn test_ward_daily_limit_resets_exactly_at_24h_boundary() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1_000);
    record_daily_spend(ward_address, ward, 80, 1_000);

    // Exact boundary should count as a fresh window.
    set_block_timestamp_for_next_call(ward_address, 1_000 + 86_400);
    let tx_hash = 'TX_DAILY_EXACT_24H';
    let sig = ward_keys.serialized_sign(tx_hash);
    let calls = array![make_transfer_call(known_token, 30)];
    let is_valid = validate_calls(src6, ward_address, tx_hash, sig, calls);
    assert(is_valid == starknet::VALIDATED, 'daily 24h invalid');
}

#[test]
fn test_ward_daily_spent_accumulates_within_window() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, _src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 500, 100);
    record_daily_spend(ward_address, ward, 40, 100);
    record_daily_spend(ward_address, ward, 60, 150);

    set_block_timestamp_for_next_call(ward_address, 200);
    let spent = ward.get_spent_24h();
    assert(spent == 100, 'spent accumulate invalid');
}

#[test]
fn test_ward_set_daily_limit_resets_spent_window() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, _src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1);
    record_daily_spend(ward_address, ward, 80, 10);

    set_daily_limit(ward_address, ward, guardian_address, 200, 20);

    set_block_timestamp_for_next_call(ward_address, 21);
    let spent = ward.get_spent_24h();
    let limit = ward.get_spending_limit_24h();
    assert(spent == 0, 'limit reset spent invalid');
    assert(limit == 200, 'limit reset value invalid');
}

#[test]
#[should_panic(expected: 'Missing guardian 2FA signature')]
fn test_ward_daily_limit_breach_with_guardian2fa_enabled_missing_g2fa() {
    let ward_keys = KEY_PAIR();
    let guardian_keys = KEY_PAIR_2();
    let guardian_2fa_keys: StarkKeyPair = get_stark_keys_from('GUARDIAN_2FA_PRIVATE');
    let guardian_address: ContractAddress = 'GUARDIAN'.as_address();
    let known_token: ContractAddress = 'KNOWN_TOKEN'.as_address();
    let (ward_address, ward, src6) =
        deploy_ward(ward_keys.public_key, guardian_address, guardian_keys.public_key);

    setup_base_policy(ward_address, ward, guardian_address, known_token, 10_000);
    set_daily_limit(ward_address, ward, guardian_address, 100, 1);
    record_daily_spend(ward_address, ward, 80, 10);

    as_guardian_for_next_call(ward_address, guardian_address);
    ward.update_guardian_2fa(guardian_2fa_keys.public_key, true);

    set_block_timestamp_for_next_call(ward_address, 20);
    let tx_hash = 'TX_DAILY_MISSING_G2FA';
    let mut sig = array![];
    push_sig(ref sig, ward_keys.serialized_sign(tx_hash));
    push_sig(ref sig, guardian_keys.serialized_sign(tx_hash));
    let calls = array![make_transfer_call(known_token, 30)];
    let _ = validate_calls(src6, ward_address, tx_hash, sig, calls);
}
