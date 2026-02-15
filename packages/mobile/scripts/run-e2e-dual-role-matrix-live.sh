#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
E2E_DIR="${MOBILE_DIR}/e2e"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
MAESTRO_BIN="${MAESTRO_BIN:-/Users/mohit/.maestro/bin/maestro}"
JAVA_HOME_VALUE="${JAVA_HOME_VALUE:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
PATH="${JAVA_HOME_VALUE}/bin:${PATH}"
export JAVA_HOME="${JAVA_HOME_VALUE}"

IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
IOS_SIMULATOR_UDID="${IOS_SIMULATOR_UDID:-}"
ANDROID_DEVICE="${ANDROID_DEVICE:-emulator-5554}"

IOS_APP_ID_LIVE="${IOS_APP_ID_LIVE:-org.reactjs.native.example.CloakMobile}"
ANDROID_APP_ID_LIVE="${ANDROID_APP_ID_LIVE:-com.cloakmobile}"
IOS_CONFIGURATION_LIVE="${IOS_CONFIGURATION_LIVE:-Release}"
ANDROID_GRADLE_TASKS_LIVE="${ANDROID_GRADLE_TASKS_LIVE:-app:assembleRelease app:installRelease}"

IOS_SKIP_BUILD_SETUP="${IOS_SKIP_BUILD_SETUP:-0}"
ANDROID_SKIP_BUILD_SETUP="${ANDROID_SKIP_BUILD_SETUP:-0}"
IOS_SKIP_BUILD_STAGES="${IOS_SKIP_BUILD_STAGES:-1}"
ANDROID_SKIP_BUILD_STAGES="${ANDROID_SKIP_BUILD_STAGES:-1}"

FLOW_IOS_SETUP_PREDEPLOY="${FLOW_IOS_SETUP_PREDEPLOY:-${E2E_DIR}/maestro/flows/dual/ios-guardian-setup-predeploy-live.yaml}"
FLOW_IOS_SETUP_POSTDEPLOY="${FLOW_IOS_SETUP_POSTDEPLOY:-${E2E_DIR}/maestro/flows/dual/ios-guardian-postdeploy-createward-live.yaml}"
FLOW_ANDROID_SETUP_WARD="${FLOW_ANDROID_SETUP_WARD:-${E2E_DIR}/maestro/flows/dual/android-ward-setup-live.yaml}"
FLOW_ANDROID_OPEN_WARD_QR="${FLOW_ANDROID_OPEN_WARD_QR:-${E2E_DIR}/maestro/flows/dual/android-ward-open-cloak-qr-live.yaml}"
FLOW_IOS_GUARDIAN_SEND="${FLOW_IOS_GUARDIAN_SEND:-${E2E_DIR}/maestro/flows/dual/ios-guardian-send-live.yaml}"
FLOW_ANDROID_WARD_CLAIM="${FLOW_ANDROID_WARD_CLAIM:-${E2E_DIR}/maestro/flows/dual/android-ward-claim-live.yaml}"
FLOW_ANDROID_WARD_SEND="${FLOW_ANDROID_WARD_SEND:-${E2E_DIR}/maestro/flows/dual/android-ward-initiate-send-live.yaml}"
FLOW_IOS_GUARDIAN_APPROVE="${FLOW_IOS_GUARDIAN_APPROVE:-${E2E_DIR}/maestro/flows/dual/ios-guardian-approve-live.yaml}"
FLOW_IOS_GUARDIAN_REJECT="${FLOW_IOS_GUARDIAN_REJECT:-${E2E_DIR}/maestro/flows/dual/ios-guardian-reject-live.yaml}"
FLOW_ANDROID_WARD_ENABLE_2FA="${FLOW_ANDROID_WARD_ENABLE_2FA:-${E2E_DIR}/maestro/flows/dual/android-ward-enable-2fa-live.yaml}"
FLOW_IOS_GUARDIAN_ENABLE_2FA="${FLOW_IOS_GUARDIAN_ENABLE_2FA:-${E2E_DIR}/maestro/flows/dual/ios-guardian-enable-2fa-live.yaml}"
FLOW_ANDROID_WARD_APPROVE_STAGE="${FLOW_ANDROID_WARD_APPROVE_STAGE:-${E2E_DIR}/maestro/flows/dual/android-ward-approve-stage-live.yaml}"
FLOW_ANDROID_WARD_REJECT_STAGE="${FLOW_ANDROID_WARD_REJECT_STAGE:-${E2E_DIR}/maestro/flows/dual/android-ward-reject-stage-live.yaml}"

FUND_AMOUNT="${FUND_AMOUNT:-5.0}"
FUNDER_ADDRESS="${FUNDER_ADDRESS:-}"
FUNDER_PRIVATE_KEY="${FUNDER_PRIVATE_KEY:-}"
STARKNET_RPC_URL="${STARKNET_RPC_URL:-https://rpc.starknet-testnet.lava.build}"

SEND_AMOUNT="${SEND_AMOUNT:-1}"
UNSHIELD_AMOUNT="${UNSHIELD_AMOUNT:-1}"
SEND_NOTE_PREFIX="${SEND_NOTE_PREFIX:-dual-matrix}"

log() {
  printf '[%s][dual-live] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Required command not found: $1"
    exit 1
  fi
}

resolve_ios_udid() {
  local name="$1"
  xcrun simctl list devices available | sed -n "s/.*${name} (\([A-Fa-f0-9-]*\)).*/\1/p" | head -n 1
}

run_ios_stage() {
  local stage_name="$1"
  local flow_file="$2"
  local skip_build="$3"
  local stage_run_id="${RUN_ID}-${stage_name}"

  log "iOS stage: ${stage_name}"
  RUN_ID="${stage_run_id}" \
  FLOW_FILE="${flow_file}" \
  SKIP_BUILD="${skip_build}" \
  APP_ID_IOS="${IOS_APP_ID_LIVE}" \
  IOS_CONFIGURATION="${IOS_CONFIGURATION_LIVE}" \
  IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME}" \
  IOS_SIMULATOR_UDID="${IOS_SIMULATOR_UDID}" \
  RUNTIME_MODE="e2e-live" \
  NETWORK_MODE="live" \
  SEND_RECIPIENT="${SEND_RECIPIENT}" \
  SEND_AMOUNT="${SEND_AMOUNT}" \
  SEND_NOTE="${SEND_NOTE}" \
  UNSHIELD_AMOUNT="${UNSHIELD_AMOUNT}" \
  MAESTRO_BIN="${MAESTRO_BIN}" \
  "${SCRIPT_DIR}/run-e2e-ios.sh"
}

run_android_stage() {
  local stage_name="$1"
  local flow_file="$2"
  local skip_build="$3"
  local stage_run_id="${RUN_ID}-${stage_name}"

  log "Android stage: ${stage_name}"
  RUN_ID="${stage_run_id}" \
  FLOW_FILE="${flow_file}" \
  SKIP_BUILD="${skip_build}" \
  MAESTRO_DEVICE="${ANDROID_DEVICE}" \
  APP_ID_ANDROID="${ANDROID_APP_ID_LIVE}" \
  GRADLE_TASKS="${ANDROID_GRADLE_TASKS_LIVE}" \
  RUNTIME_MODE="e2e-live" \
  NETWORK_MODE="live" \
  WARD_INVITE_JSON="${WARD_INVITE_JSON}" \
  SEND_RECIPIENT="${SEND_RECIPIENT}" \
  SEND_AMOUNT="${SEND_AMOUNT}" \
  SEND_NOTE="${SEND_NOTE}" \
  UNSHIELD_AMOUNT="${UNSHIELD_AMOUNT}" \
  MAESTRO_BIN="${MAESTRO_BIN}" \
  "${SCRIPT_DIR}/run-e2e-android.sh"
}

extract_first_hex() {
  local input="$1"
  printf '%s' "${input}" | rg -o '0x[0-9a-fA-F]+' -m1 || true
}

extract_base58_from_android_hierarchy() {
  local xml
  xml="$(adb -s "${ANDROID_DEVICE}" exec-out uiautomator dump /dev/tty 2>/dev/null | tr -d '\r')"
  printf '%s\n' "${xml}" \
    | rg -o '[1-9A-HJ-NP-Za-km-z]{32,64}' \
    | awk '{print length, $0}' \
    | sort -nr \
    | head -n1 \
    | cut -d' ' -f2-
}

fund_guardian_deploy_address() {
  local deploy_address="$1"
  if [[ -z "${FUNDER_ADDRESS}" || -z "${FUNDER_PRIVATE_KEY}" ]]; then
    log "Missing FUNDER_ADDRESS/FUNDER_PRIVATE_KEY for setup funding."
    exit 1
  fi

  log "Funding guardian deploy address ${deploy_address} with ${FUND_AMOUNT} STRK"
  STARKNET_RPC_URL="${STARKNET_RPC_URL}" \
  "${SCRIPT_DIR}/fund-stark-address.js" \
    --address "${deploy_address}" \
    --amount "${FUND_AMOUNT}" \
    --funderAddress "${FUNDER_ADDRESS}" \
    --funderPrivateKey "${FUNDER_PRIVATE_KEY}" \
    >/tmp/dual-live-fund-result.json
  cat /tmp/dual-live-fund-result.json
}

require_cmd "${MAESTRO_BIN}"
require_cmd xcrun
require_cmd adb
require_cmd rg
require_cmd node

if [[ -z "${IOS_SIMULATOR_UDID}" ]]; then
  IOS_SIMULATOR_UDID="$(resolve_ios_udid "${IOS_SIMULATOR_NAME}")"
fi
if [[ -z "${IOS_SIMULATOR_UDID}" ]]; then
  log "Unable to resolve simulator '${IOS_SIMULATOR_NAME}'"
  exit 1
fi

log "Run id: ${RUN_ID}"
log "iOS guardian simulator: ${IOS_SIMULATOR_NAME} (${IOS_SIMULATOR_UDID})"
log "Android ward device: ${ANDROID_DEVICE}"
log "Live app ids: ios=${IOS_APP_ID_LIVE}, android=${ANDROID_APP_ID_LIVE}"
log "Artifacts root: ${E2E_DIR}/artifacts"

# --- Setup: Guardian ---
SEND_RECIPIENT="7YWHMfk9JZeNMg2auHxsPqR4"
SEND_NOTE="${SEND_NOTE_PREFIX}-seed"
WARD_INVITE_JSON="{}"

run_ios_stage "ios-guardian-setup-predeploy" "${FLOW_IOS_SETUP_PREDEPLOY}" "${IOS_SKIP_BUILD_SETUP}"

deploy_clipboard="$(xcrun simctl pbpaste "${IOS_SIMULATOR_UDID}" || true)"
guardian_deploy_address="$(extract_first_hex "${deploy_clipboard}")"
if [[ -z "${guardian_deploy_address}" ]]; then
  log "Failed to read guardian deploy address from iOS clipboard."
  exit 1
fi
log "Guardian deploy address: ${guardian_deploy_address}"

fund_guardian_deploy_address "${guardian_deploy_address}"

run_ios_stage "ios-guardian-setup-postdeploy" "${FLOW_IOS_SETUP_POSTDEPLOY}" "${IOS_SKIP_BUILD_STAGES}"

invite_clipboard="$(xcrun simctl pbpaste "${IOS_SIMULATOR_UDID}" || true)"
WARD_INVITE_JSON="$(
  node -e 'const raw = process.argv[1] || ""; const parsed = JSON.parse(raw); if (!parsed || parsed.type !== "cloak_ward_invite") throw new Error("invalid ward invite payload"); process.stdout.write(JSON.stringify(parsed));' \
    "${invite_clipboard}"
)"
log "Ward invite payload captured from iOS clipboard."

# --- Setup: Ward ---
SEND_NOTE="${SEND_NOTE_PREFIX}-ward-setup"
run_android_stage "android-ward-setup" "${FLOW_ANDROID_SETUP_WARD}" "${ANDROID_SKIP_BUILD_SETUP}"

run_android_stage "android-ward-open-cloak-qr" "${FLOW_ANDROID_OPEN_WARD_QR}" "${ANDROID_SKIP_BUILD_STAGES}"
SEND_RECIPIENT="$(extract_base58_from_android_hierarchy)"
if [[ -z "${SEND_RECIPIENT}" ]]; then
  log "Failed to extract ward cloak address from Android hierarchy dump."
  exit 1
fi
log "Ward cloak address extracted: ${SEND_RECIPIENT}"
adb -s "${ANDROID_DEVICE}" shell input keyevent 4 >/dev/null 2>&1 || true

# --- Case 1: Guardian transfer + ward claim + guardian approve/reject ---
SEND_NOTE="${SEND_NOTE_PREFIX}-case1-approve-send"
run_ios_stage "case1-guardian-send-approve" "${FLOW_IOS_GUARDIAN_SEND}" "${IOS_SKIP_BUILD_STAGES}"
run_android_stage "case1-ward-claim-approve" "${FLOW_ANDROID_WARD_CLAIM}" "${ANDROID_SKIP_BUILD_STAGES}"
run_ios_stage "case1-guardian-approve" "${FLOW_IOS_GUARDIAN_APPROVE}" "${IOS_SKIP_BUILD_STAGES}"

SEND_NOTE="${SEND_NOTE_PREFIX}-case1-reject-send"
run_ios_stage "case1-guardian-send-reject" "${FLOW_IOS_GUARDIAN_SEND}" "${IOS_SKIP_BUILD_STAGES}"
run_android_stage "case1-ward-claim-reject" "${FLOW_ANDROID_WARD_CLAIM}" "${ANDROID_SKIP_BUILD_STAGES}"
run_ios_stage "case1-guardian-reject" "${FLOW_IOS_GUARDIAN_REJECT}" "${IOS_SKIP_BUILD_STAGES}"

# --- Case 2: Ward 2FA + ward tx + guardian approval matrix ---
run_android_stage "case2-ward-enable-2fa" "${FLOW_ANDROID_WARD_ENABLE_2FA}" "${ANDROID_SKIP_BUILD_STAGES}"

SEND_NOTE="${SEND_NOTE_PREFIX}-case2-ward-reject"
run_android_stage "case2-ward-send-reject-stage" "${FLOW_ANDROID_WARD_SEND}" "${ANDROID_SKIP_BUILD_STAGES}"
run_android_stage "case2-ward-reject-stage" "${FLOW_ANDROID_WARD_REJECT_STAGE}" "${ANDROID_SKIP_BUILD_STAGES}"

SEND_NOTE="${SEND_NOTE_PREFIX}-case2-guardian-reject"
run_android_stage "case2-ward-send-guardian-reject" "${FLOW_ANDROID_WARD_SEND}" "${ANDROID_SKIP_BUILD_STAGES}"
run_android_stage "case2-ward-approve-stage-for-guardian-reject" "${FLOW_ANDROID_WARD_APPROVE_STAGE}" "${ANDROID_SKIP_BUILD_STAGES}"
run_ios_stage "case2-guardian-reject" "${FLOW_IOS_GUARDIAN_REJECT}" "${IOS_SKIP_BUILD_STAGES}"

SEND_NOTE="${SEND_NOTE_PREFIX}-case2-guardian-approve"
run_android_stage "case2-ward-send-guardian-approve" "${FLOW_ANDROID_WARD_SEND}" "${ANDROID_SKIP_BUILD_STAGES}"
run_android_stage "case2-ward-approve-stage-for-guardian-approve" "${FLOW_ANDROID_WARD_APPROVE_STAGE}" "${ANDROID_SKIP_BUILD_STAGES}"
run_ios_stage "case2-guardian-approve" "${FLOW_IOS_GUARDIAN_APPROVE}" "${IOS_SKIP_BUILD_STAGES}"

# --- Case 3: Ward 2FA + Guardian 2FA + same matrix ---
run_ios_stage "case3-guardian-enable-2fa" "${FLOW_IOS_GUARDIAN_ENABLE_2FA}" "${IOS_SKIP_BUILD_STAGES}"

SEND_NOTE="${SEND_NOTE_PREFIX}-case3-guardian-reject"
run_android_stage "case3-ward-send-guardian-reject" "${FLOW_ANDROID_WARD_SEND}" "${ANDROID_SKIP_BUILD_STAGES}"
run_android_stage "case3-ward-approve-stage-for-guardian-reject" "${FLOW_ANDROID_WARD_APPROVE_STAGE}" "${ANDROID_SKIP_BUILD_STAGES}"
run_ios_stage "case3-guardian-reject" "${FLOW_IOS_GUARDIAN_REJECT}" "${IOS_SKIP_BUILD_STAGES}"

SEND_NOTE="${SEND_NOTE_PREFIX}-case3-guardian-approve"
run_android_stage "case3-ward-send-guardian-approve" "${FLOW_ANDROID_WARD_SEND}" "${ANDROID_SKIP_BUILD_STAGES}"
run_android_stage "case3-ward-approve-stage-for-guardian-approve" "${FLOW_ANDROID_WARD_APPROVE_STAGE}" "${ANDROID_SKIP_BUILD_STAGES}"
run_ios_stage "case3-guardian-approve" "${FLOW_IOS_GUARDIAN_APPROVE}" "${IOS_SKIP_BUILD_STAGES}"

log "Dual-role live matrix complete."
