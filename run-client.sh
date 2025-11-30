#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/client/ansible"

DEFAULT_PASS="zostanie#%3"
BECOME_PASS="${CLIENT_BECOME_PASS:-${DEFAULT_PASS}}"

if [[ -z "${BECOME_PASS}" ]]; then
	cat >&2 <<'EOF'
[run-client] Brak hasla sudo.
Ustaw zmienna CLIENT_BECOME_PASS przed uruchomieniem lub wpisz wartosc w run-client.sh.
EOF
	exit 1
fi

ANSIBLE_BECOME_PASSWORD="${BECOME_PASS}" ansible-playbook \
	-i inventory.ini \
	playbook-okno-mqtt.yml \
	--become \
	"$@"
