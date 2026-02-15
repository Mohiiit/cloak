#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
E2E_DIR="${MOBILE_DIR}/e2e"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
MAESTRO_BIN="${MAESTRO_BIN:-maestro}"
RUNTIME_MODE="${RUNTIME_MODE:-e2e-live}"
NETWORK_MODE="${NETWORK_MODE:-live}"

IOS_FLOW_GUARDIAN_ACTIONS="${IOS_FLOW_GUARDIAN_ACTIONS:-${E2E_DIR}/maestro/flows/dual/ios-guardian-sticky.yaml}"
IOS_FLOW_GUARDIAN_APPROVALS="${IOS_FLOW_GUARDIAN_APPROVALS:-${E2E_DIR}/maestro/flows/dual/ios-guardian-approvals-only.yaml}"
ANDROID_FLOW_WARD_ACTIONS="${ANDROID_FLOW_WARD_ACTIONS:-${E2E_DIR}/maestro/flows/dual/android-ward-sticky.yaml}"
ANDROID_FLOW_WARD_TWOFA="${ANDROID_FLOW_WARD_TWOFA:-${E2E_DIR}/maestro/flows/dual/android-ward-twofa-sticky.yaml}"

IOS_SKIP_BUILD="${IOS_SKIP_BUILD:-1}"
ANDROID_SKIP_BUILD="${ANDROID_SKIP_BUILD:-1}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 16}"
ANDROID_DEVICE="${ANDROID_DEVICE:-emulator-5554}"

RUN_GUARDIAN_ACTIONS="${RUN_GUARDIAN_ACTIONS:-1}"
RUN_WARD_ACTIONS="${RUN_WARD_ACTIONS:-1}"
RUN_GUARDIAN_APPROVALS="${RUN_GUARDIAN_APPROVALS:-1}"
RUN_WARD_TWOFA="${RUN_WARD_TWOFA:-0}"

overall_status=0
declare -a failures=()

log() {
  printf '[%s][dual-role] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

run_ios_stage() {
  local stage_name="$1"
  local flow_file="$2"
  local stage_run_id="${RUN_ID}-${stage_name}"

  log "Starting iOS stage '${stage_name}'"
  if ! RUN_ID="${stage_run_id}" \
    FLOW_FILE="${flow_file}" \
    SKIP_BUILD="${IOS_SKIP_BUILD}" \
    IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME}" \
    RUNTIME_MODE="${RUNTIME_MODE}" \
    NETWORK_MODE="${NETWORK_MODE}" \
    MAESTRO_BIN="${MAESTRO_BIN}" \
    "${SCRIPT_DIR}/run-e2e-ios.sh"; then
    overall_status=1
    failures+=("ios:${stage_name}")
  fi
}

run_android_stage() {
  local stage_name="$1"
  local flow_file="$2"
  local stage_run_id="${RUN_ID}-${stage_name}"

  log "Starting Android stage '${stage_name}'"
  if ! RUN_ID="${stage_run_id}" \
    FLOW_FILE="${flow_file}" \
    SKIP_BUILD="${ANDROID_SKIP_BUILD}" \
    MAESTRO_DEVICE="${ANDROID_DEVICE}" \
    RUNTIME_MODE="${RUNTIME_MODE}" \
    NETWORK_MODE="${NETWORK_MODE}" \
    MAESTRO_BIN="${MAESTRO_BIN}" \
    "${SCRIPT_DIR}/run-e2e-android.sh"; then
    overall_status=1
    failures+=("android:${stage_name}")
  fi
}

log "Dual-role run id: ${RUN_ID}"
log "Runtime mode: ${RUNTIME_MODE}, network mode: ${NETWORK_MODE}"
log "iOS simulator: ${IOS_SIMULATOR_NAME}"
log "Android device: ${ANDROID_DEVICE}"
log "Artifacts root: ${E2E_DIR}/artifacts"

if [[ "${RUN_GUARDIAN_ACTIONS}" == "1" ]]; then
  run_ios_stage "ios-guardian-actions" "${IOS_FLOW_GUARDIAN_ACTIONS}"
fi

if [[ "${RUN_WARD_ACTIONS}" == "1" ]]; then
  run_android_stage "android-ward-actions" "${ANDROID_FLOW_WARD_ACTIONS}"
fi

if [[ "${RUN_GUARDIAN_APPROVALS}" == "1" ]]; then
  run_ios_stage "ios-guardian-approvals" "${IOS_FLOW_GUARDIAN_APPROVALS}"
fi

if [[ "${RUN_WARD_TWOFA}" == "1" ]]; then
  run_android_stage "android-ward-twofa" "${ANDROID_FLOW_WARD_TWOFA}"
fi

if [[ "${overall_status}" -eq 0 ]]; then
  log "Dual-role run finished successfully."
else
  log "Dual-role run finished with failures: ${failures[*]}"
fi

exit "${overall_status}"
