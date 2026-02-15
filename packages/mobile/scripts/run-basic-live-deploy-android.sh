#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
E2E_DIR="${MOBILE_DIR}/e2e"

APP_ID="${APP_ID_ANDROID_LIVE:-com.cloakmobile}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_DIR="${E2E_DIR}/artifacts/${RUN_ID}/android-basic-live"
GRADLE_TASKS="${GRADLE_TASKS_LIVE:-app:assembleRelease app:installRelease}"
FUND_AMOUNT="${FUND_AMOUNT:-0.8}"
SKIP_BUILD="${SKIP_BUILD:-0}"

MAESTRO_BIN="${MAESTRO_BIN:-maestro}"

FLOW_CREATE="${FLOW_CREATE:-${E2E_DIR}/maestro/flows/shared/create-wallet.yaml}"
FLOW_COPY="${FLOW_COPY:-${E2E_DIR}/maestro/flows/shared/copy-deploy-address.yaml}"
FLOW_DEPLOY="${FLOW_DEPLOY:-${E2E_DIR}/maestro/flows/shared/deploy-wallet.yaml}"

log() {
  printf '[%s][android-basic-live] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Required command not found: $1"
    exit 1
  fi
}

extract_stark_address() {
  local raw="$1"
  echo "$raw" | tr -d '\r' | rg -o '0x[0-9a-fA-F]+' -m 1 || true
}

extract_stark_address_from_ui() {
  adb exec-out uiautomator dump /dev/tty 2>/dev/null \
    | tr -d '\r' \
    | rg -o '0x[0-9a-fA-F]{20,}' -m 1 || true
}

run_flow() {
  local flow="$1"
  local out="$2"
  "${MAESTRO_BIN}" test "${flow}" \
    --env "APP_ID=${APP_ID}" \
    --format junit \
    --output "${out}.xml" \
    | tee "${out}.log"
}

require_cmd "${MAESTRO_BIN}"
require_cmd adb
require_cmd node
require_cmd rg

mkdir -p "${ARTIFACT_DIR}"

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "Building and installing Android live variant (${GRADLE_TASKS})"
  (
    cd "${MOBILE_DIR}/android"
    ./gradlew --no-daemon ${GRADLE_TASKS} | tee "${ARTIFACT_DIR}/gradle.log"
  )
else
  log "Skipping build because SKIP_BUILD=${SKIP_BUILD}"
fi

log "Creating wallet and navigating to deploy screen"
run_flow "${FLOW_CREATE}" "${ARTIFACT_DIR}/flow-create-wallet"

log "Copying deploy address to device clipboard"
run_flow "${FLOW_COPY}" "${ARTIFACT_DIR}/flow-copy-address"

CLIPBOARD_RAW="$(adb shell cmd clipboard get 2>/dev/null || true)"
DEPLOY_ADDRESS="$(extract_stark_address "${CLIPBOARD_RAW}")"
if [[ -z "${DEPLOY_ADDRESS}" ]]; then
  log "Clipboard extraction unavailable, falling back to UI hierarchy parse"
  DEPLOY_ADDRESS="$(extract_stark_address_from_ui)"
fi
if [[ -z "${DEPLOY_ADDRESS}" ]]; then
  log "Failed to extract Stark address from clipboard and UI output:"
  printf '%s\n' "${CLIPBOARD_RAW}" | tee "${ARTIFACT_DIR}/clipboard-raw.txt"
  exit 1
fi

log "Funding ${DEPLOY_ADDRESS} with ${FUND_AMOUNT} STRK"
DEPLOY_ADDRESS="${DEPLOY_ADDRESS}" FUND_AMOUNT="${FUND_AMOUNT}" \
  node "${SCRIPT_DIR}/fund-stark-address.js" \
  --address "${DEPLOY_ADDRESS}" \
  --amount "${FUND_AMOUNT}" \
  | tee "${ARTIFACT_DIR}/funding-result.json"

log "Tapping deploy and waiting for deployed state"
run_flow "${FLOW_DEPLOY}" "${ARTIFACT_DIR}/flow-deploy-wallet"

log "Basic live deploy flow succeeded. Artifacts: ${ARTIFACT_DIR}"
