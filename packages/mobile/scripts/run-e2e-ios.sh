#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
E2E_DIR="${MOBILE_DIR}/e2e"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
PLATFORM="ios"
ARTIFACT_DIR="${E2E_DIR}/artifacts/${RUN_ID}/${PLATFORM}"

MAESTRO_BIN="${MAESTRO_BIN:-maestro}"
APP_ID="${APP_ID_IOS:-com.cloakmobile.e2e}"
FLOW_FILE="${FLOW_FILE:-${E2E_DIR}/maestro/flows/core/ios-mock-full-matrix.yaml}"
RUNTIME_MODE="${RUNTIME_MODE:-e2e-mock}"
NETWORK_MODE="${NETWORK_MODE:-mock}"
IMPORT_STARK_PRIVATE_KEY="${IMPORT_STARK_PRIVATE_KEY:-0x1}"
IMPORT_STARK_ADDRESS="${IMPORT_STARK_ADDRESS:-0x1}"
WARD_INVITE_JSON="${WARD_INVITE_JSON:-{\"type\":\"cloak_ward_invite\",\"wardAddress\":\"0x2\",\"wardPrivateKey\":\"0x1\",\"guardianAddress\":\"0x3\",\"network\":\"sepolia\"}}"
SEND_RECIPIENT="${SEND_RECIPIENT:-7YWHMfk9JZeNMg2auHxsPqR4}"
SEND_AMOUNT="${SEND_AMOUNT:-1}"
SEND_NOTE="${SEND_NOTE:-maestro-ios}"
UNSHIELD_AMOUNT="${UNSHIELD_AMOUNT:-1}"

IOS_WORKSPACE="${IOS_WORKSPACE:-${MOBILE_DIR}/ios/CloakMobile.xcworkspace}"
IOS_SCHEME="${IOS_SCHEME:-CloakMobile}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-E2E}"
IOS_DERIVED_DATA="${IOS_DERIVED_DATA:-${MOBILE_DIR}/ios/build/e2e}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 16}"
IOS_SIMULATOR_UDID="${IOS_SIMULATOR_UDID:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"
START_METRO="${START_METRO:-1}"
SKIP_METRO="${SKIP_METRO:-0}"
METRO_HOST="${METRO_HOST:-127.0.0.1}"
METRO_PORT="${METRO_PORT:-8081}"

mkdir -p "${ARTIFACT_DIR}"

log() {
  printf '[%s][ios-e2e] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

stop_metro() {
  if [[ -n "${METRO_PID:-}" ]]; then
    log "Stopping Metro (PID ${METRO_PID})"
    kill "${METRO_PID}" >/dev/null 2>&1 || true
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Required command not found: $1"
    exit 1
  fi
}

wait_for_metro() {
  for _ in {1..40}; do
    if curl -fsS "http://${METRO_HOST}:${METRO_PORT}/status" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_metro() {
  if [[ "${SKIP_METRO}" == "1" ]]; then
    log "Skipping metro startup because SKIP_METRO=1"
    return
  fi

  if (( START_METRO != 1 )); then
    log "Skipping metro startup because START_METRO=${START_METRO}"
    return
  fi

  if curl -fsS "http://${METRO_HOST}:${METRO_PORT}/status" >/dev/null 2>&1; then
    log "Metro already running at http://${METRO_HOST}:${METRO_PORT}"
    return
  fi

  log "Starting Metro at http://${METRO_HOST}:${METRO_PORT}"
  (
    cd "${MOBILE_DIR}"
    yarn start --host "${METRO_HOST}" --port "${METRO_PORT}" --reset-cache > "${ARTIFACT_DIR}/metro.log" 2>&1
  ) &
  METRO_PID=$!
  export METRO_PID

  if wait_for_metro; then
    log "Metro started (PID ${METRO_PID})"
    return
  fi

  log "Metro did not become reachable after startup"
}

resolve_sim_udid() {
  local name="$1"
  xcrun simctl list devices available | sed -n "s/.*${name} (\([A-Fa-f0-9-]*\)).*/\1/p" | head -n 1
}

require_cmd "${MAESTRO_BIN}"
require_cmd xcodebuild
require_cmd xcrun
require_cmd curl

trap stop_metro EXIT

if [[ -z "${IOS_SIMULATOR_UDID}" ]]; then
  IOS_SIMULATOR_UDID="$(resolve_sim_udid "${IOS_SIMULATOR_NAME}")"
fi

if [[ -z "${IOS_SIMULATOR_UDID}" ]]; then
  log "Unable to find an available simulator named '${IOS_SIMULATOR_NAME}'."
  xcrun simctl list devices available > "${ARTIFACT_DIR}/simulators.available.txt" || true
  exit 1
fi

log "Run ID: ${RUN_ID}"
log "Artifacts: ${ARTIFACT_DIR}"
log "Flow: ${FLOW_FILE}"
log "Simulator: ${IOS_SIMULATOR_NAME} (${IOS_SIMULATOR_UDID})"

xcrun simctl list devices available > "${ARTIFACT_DIR}/simulators.available.txt" || true
xcrun simctl boot "${IOS_SIMULATOR_UDID}" >/dev/null 2>&1 || true
xcrun simctl bootstatus "${IOS_SIMULATOR_UDID}" -b

start_metro

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "Building iOS app (scheme=${IOS_SCHEME}, configuration=${IOS_CONFIGURATION})"
  xcodebuild \
    -workspace "${IOS_WORKSPACE}" \
    -scheme "${IOS_SCHEME}" \
    -configuration "${IOS_CONFIGURATION}" \
    -destination "id=${IOS_SIMULATOR_UDID}" \
    -derivedDataPath "${IOS_DERIVED_DATA}" \
    clean build | tee "${ARTIFACT_DIR}/xcodebuild.log"
else
  log "Skipping iOS build because SKIP_BUILD=${SKIP_BUILD}"
fi

APP_PATH="${IOS_DERIVED_DATA}/Build/Products/${IOS_CONFIGURATION}-iphonesimulator/CloakMobile.app"
if [[ ! -d "${APP_PATH}" ]]; then
  APP_PATH="$(find "${IOS_DERIVED_DATA}/Build/Products" -maxdepth 2 -type d -name '*.app' | head -n 1 || true)"
fi

if [[ -z "${APP_PATH}" || ! -d "${APP_PATH}" ]]; then
  log "Unable to locate built .app bundle in derived data path: ${IOS_DERIVED_DATA}"
  exit 1
fi

log "Installing app bundle: ${APP_PATH}"
xcrun simctl install "${IOS_SIMULATOR_UDID}" "${APP_PATH}" | tee "${ARTIFACT_DIR}/simctl-install.log"

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

MAESTRO_ARGS+=(--device "${IOS_SIMULATOR_UDID}")

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
