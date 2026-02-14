#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
E2E_DIR="${MOBILE_DIR}/e2e"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
TARGET_PLATFORM="${TARGET_PLATFORM:-both}"

ANDROID_FLOW="${ANDROID_FLOW:-${E2E_DIR}/maestro/flows/core/android-live-smoke.yaml}"
IOS_FLOW="${IOS_FLOW:-${E2E_DIR}/maestro/flows/core/ios-live-smoke.yaml}"

log() {
  printf '[%s][live-smoke] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

run_android() {
  log "Running Android live smoke"
  RUN_ID="${RUN_ID}" \
  FLOW_FILE="${ANDROID_FLOW}" \
  APP_ID_ANDROID="${APP_ID_ANDROID_LIVE:-com.cloakmobile}" \
  GRADLE_TASKS="${ANDROID_GRADLE_TASKS_LIVE:-app:assembleRelease app:installRelease}" \
  RUNTIME_MODE="e2e-live" \
  NETWORK_MODE="live" \
  "${SCRIPT_DIR}/run-e2e-android.sh"
}

run_ios() {
  log "Running iOS live smoke"
  RUN_ID="${RUN_ID}" \
  FLOW_FILE="${IOS_FLOW}" \
  APP_ID_IOS="${APP_ID_IOS_LIVE:-org.reactjs.native.example.CloakMobile}" \
  IOS_CONFIGURATION="${IOS_CONFIGURATION_LIVE:-Release}" \
  RUNTIME_MODE="e2e-live" \
  NETWORK_MODE="live" \
  "${SCRIPT_DIR}/run-e2e-ios.sh"
}

case "${TARGET_PLATFORM}" in
  android)
    run_android
    ;;
  ios)
    run_ios
    ;;
  both)
    run_android
    run_ios
    ;;
  *)
    log "Invalid TARGET_PLATFORM='${TARGET_PLATFORM}'. Use android, ios, or both."
    exit 1
    ;;
esac

log "Live smoke completed. Artifacts root: ${E2E_DIR}/artifacts/${RUN_ID}"
