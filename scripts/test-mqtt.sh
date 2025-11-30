#!/usr/bin/env bash
set -euo pipefail

BROKER_HOST=${BROKER_HOST:-localhost}
BROKER_PORT=${BROKER_PORT:-1883}
TEST_TOPIC=${TEST_TOPIC:-cieplarnia/test}
TEST_PAYLOAD=${TEST_PAYLOAD:-"hello $(date +%s)"}
USE_RETAIN=${USE_RETAIN:-false}

if ! command -v mosquitto_pub >/dev/null 2>&1; then
  echo "mosquitto_pub not found. Install mosquitto-clients." >&2
  exit 1
fi

if ! command -v mosquitto_sub >/dev/null 2>&1; then
  echo "mosquitto_sub not found. Install mosquitto-clients." >&2
  exit 1
fi

RETAIN_FLAG=""
if [[ "${USE_RETAIN}" == "true" ]]; then
  RETAIN_FLAG="-r"
fi

PUBLISH_CMD=(mosquitto_pub -h "${BROKER_HOST}" -p "${BROKER_PORT}" -t "${TEST_TOPIC}" -m "${TEST_PAYLOAD}")
if [[ -n "${RETAIN_FLAG}" ]]; then
  PUBLISH_CMD+=(${RETAIN_FLAG})
fi

SUBSCRIBE_CMD=(mosquitto_sub -h "${BROKER_HOST}" -p "${BROKER_PORT}" -t "${TEST_TOPIC}" -C 1 -W 5)

set -x
"${SUBSCRIBE_CMD[@]}" & SUB_PID=$!
sleep 0.5
"${PUBLISH_CMD[@]}"
wait ${SUB_PID}
set +x

echo "Payload delivered successfully."
