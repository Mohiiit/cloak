#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
E2E_DIR="${MOBILE_DIR}/e2e"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
PLATFORM="android"
ARTIFACT_DIR="${E2E_DIR}/artifacts/${RUN_ID}/${PLATFORM}"

MAESTRO_BIN="${MAESTRO_BIN:-maestro}"
APP_ID="${APP_ID_ANDROID:-com.cloakmobile.e2e}"
FLOW_FILE="${FLOW_FILE:-${E2E_DIR}/maestro/flows/core/android-mock-full-matrix.yaml}"
GRADLE_TASKS="${GRADLE_TASKS:-app:assembleE2e app:installE2e}"
SKIP_BUILD="${SKIP_BUILD:-0}"
RUNTIME_MODE="${RUNTIME_MODE:-e2e-mock}"
NETWORK_MODE="${NETWORK_MODE:-mock}"
IMPORT_STARK_PRIVATE_KEY="${IMPORT_STARK_PRIVATE_KEY:-0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
IMPORT_STARK_ADDRESS="${IMPORT_STARK_ADDRESS:-0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
WARD_INVITE_JSON="${WARD_INVITE_JSON:-{\"type\":\"cloak_ward_invite\",\"wardAddress\":\"0x09f0a7cd3e4705b078e25d89397c6b62617ab405931\",\"wardPrivateKey\":\"0x005e02fb4405f98e463520831ac80cdc0117bb9a53b3aa907c798267bc26\",\"guardianAddress\":\"0x2653549193fc3783859f509a07cd3e4705b078e25d89397c6b62617ab405931\",\"network\":\"sepolia\"}}"
SEND_RECIPIENT="${SEND_RECIPIENT:-7YWHMfk9JZe0LM0g1ZauHuiSxhI}"
SEND_AMOUNT="${SEND_AMOUNT:-1}"
SEND_NOTE="${SEND_NOTE:-maestro-android}"
UNSHIELD_AMOUNT="${UNSHIELD_AMOUNT:-1}"

mkdir -p "${ARTIFACT_DIR}"

log() {
  printf '[%s][android-e2e] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Required command not found: $1"
    exit 1
  fi
}

require_cmd "${MAESTRO_BIN}"
require_cmd adb

log "Run ID: ${RUN_ID}"
log "Artifacts: ${ARTIFACT_DIR}"
log "Flow: ${FLOW_FILE}"

adb devices -l > "${ARTIFACT_DIR}/adb-devices.pre.txt" || true

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "Building and installing Android E2E variant (${GRADLE_TASKS})"
  (
    cd "${MOBILE_DIR}/android"
    ./gradlew --no-daemon ${GRADLE_TASKS} | tee "${ARTIFACT_DIR}/gradle.log"
  )
else
  log "Skipping Android build/install because SKIP_BUILD=${SKIP_BUILD}"
fi

adb devices -l > "${ARTIFACT_DIR}/adb-devices.post.txt" || true

MAESTRO_ARGS=(
  test "${FLOW_FILE}"
  --env "APP_ID=${APP_ID}"
  --env "E2E_RUN_ID=${RUN_ID}"
  --env "RUNTIME_MODE=${RUNTIME_MODE}"
  --env "NETWORK_MODE=${NETWORK_MODE}"
  --env "IMPORT_STARK_PRIVATE_KEY=${IMPORT_STARK_PRIVATE_KEY}"
  --env "IMPORT_STARK_ADDRESS=${IMPORT_STARK_ADDRESS}"
  --env "WARD_INVITE_JSON=${WARD_INVITE_JSON}"
  --env "SEND_RECIPIENT=${SEND_RECIPIENT}"
  --env "SEND_AMOUNT=${SEND_AMOUNT}"
  --env "SEND_NOTE=${SEND_NOTE}"
  --env "UNSHIELD_AMOUNT=${UNSHIELD_AMOUNT}"
  --format junit
  --output "${ARTIFACT_DIR}/maestro-junit.xml"
)

if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
  MAESTRO_ARGS+=(--device "${MAESTRO_DEVICE}")
fi

if "${MAESTRO_BIN}" test --help 2>&1 | grep -q -- '--debug-output'; then
  MAESTRO_ARGS+=(--debug-output "${ARTIFACT_DIR}/debug")
fi

set +e
"${MAESTRO_BIN}" "${MAESTRO_ARGS[@]}" | tee "${ARTIFACT_DIR}/maestro.log"
status=${PIPESTATUS[0]}
set -e

log "Finished with status: ${status}"
log "Artifacts available at ${ARTIFACT_DIR}"
exit "${status}"
