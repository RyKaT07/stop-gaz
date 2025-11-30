# Setup klienta i niezaleznego deploymentu

Ponizej znajdziesz komplet instrukcji, jak przygotowac powtarzalny setup na Raspi przy pomocy Ansible (bez Pythona, tylko bash + mosquitto + systemd + timer). Material jest gotowy do skopiowania 1:1 do repo, tak aby po sklonowaniu mozna bylo niezaleznie odpalic klienta i caly pozostaly stack (Ansible nie bedzie kolidowal z reszta).

**Szybki start klienta**
- `./run-client.sh` uruchamia playbook z katalogu `client/ansible` (wymaga zainstalowanego Ansible lokalnie).
- Haslo sudo pobierane jest z `CLIENT_BECOME_PASS` (jesli brak, skrypt korzysta z wartosci wpisanej w pliku; zmien ja pod siebie).
- Nadal mozesz standardowo wejsc do `client/ansible` i wykonac `ansible-playbook`, np. gdy chcesz podac wlasne flagi.

## 1. Struktura projektu Ansible

```text
client/ansible/
├─ inventory.ini
├─ playbook-okno-mqtt.yml
└─ roles/
   └─ okno_mqtt/
      ├─ defaults/
      │  └─ main.yml
      ├─ handlers/
      │  └─ main.yml
      ├─ tasks/
      │  └─ main.yml
      └─ templates/
         ├─ publish_okno.sh.j2
         ├─ sub_okno.sh.j2
         ├─ skrypt_on.sh.j2
         ├─ skrypt_off.sh.j2
         ├─ mqtt-okno-publish.service.j2
         ├─ mqtt-okno-publish.timer.j2
         └─ mqtt-okno-sub.service.j2
```

## 2. Inventory – `client/ansible/inventory.ini`

```ini
[rpi_czujniki]
czujnik ansible_connection=local ansible_host=127.0.0.1
```

* Domyslnie playbook wykonuje sie lokalnie (repo i Ansible sa na tej samej Malinie), wiec nie ma zadnego SSH.
* Jezeli musisz uderzac w inna maszyne, podmien linie na `czujnik ansible_host=<ip> ansible_user=<user>` i usun `ansible_connection=local`.

## 3. Playbook – `client/ansible/playbook-okno-mqtt.yml`

```yaml
- hosts: rpi_czujniki
  become: yes

  vars:
    okno_mqtt_broker_host: "10.252.249.2"
    okno_mqtt_broker_port: 1883
    okno_mqtt_interval_sec: 10        # co ile sekund publish
    okno_mqtt_user: "{{ ansible_user }}"

  roles:
    - okno_mqtt
```

Uruchamianie:

```bash
# calosc z repozytorium
CLIENT_BECOME_PASS='twoje_haslo' ./run-client.sh

# lub recznie z katalogu klienta
cd client/ansible
ansible-playbook -i inventory.ini playbook-okno-mqtt.yml
```

## 4. Rola `okno_mqtt`

### 4.1. `defaults/main.yml`

```yaml
okno_mqtt_broker_host: "127.0.0.1"
okno_mqtt_broker_port: 1883
okno_mqtt_interval_sec: 10
okno_mqtt_user: "{{ ansible_user }}"

okno_mqtt_project_dir: "/home/{{ okno_mqtt_user }}/okno-mqtt"

okno_mqtt_topic_temp_wewn: "czujnik/okno/temperatura/wewn"
okno_mqtt_topic_temp_zewn: "czujnik/okno/temperatura/zewn"
okno_mqtt_topic_okno: "okno/zamkniete"   # 1 = zamkniete, 0 = otwarte

okno_mqtt_file_temp_wewn: "{{ okno_mqtt_project_dir }}/temp_wewn"
okno_mqtt_file_temp_zewn: "{{ okno_mqtt_project_dir }}/temp_zewn"
okno_mqtt_file_okno: "{{ okno_mqtt_project_dir }}/okno_stan"

okno_mqtt_default_temp_wewn: "23.5"
okno_mqtt_default_temp_zewn: "5.2"
okno_mqtt_default_okno: "1"

okno_mqtt_publish_service: "mqtt-okno-publish.service"
okno_mqtt_publish_timer: "mqtt-okno-publish.timer"
okno_mqtt_sub_service: "mqtt-okno-sub.service"
```

### 4.2. `handlers/main.yml`

```yaml
- name: reload systemd
  become: yes
  command: systemctl daemon-reload
```

### 4.3. `tasks/main.yml`

```yaml
- name: Ensure mosquitto-clients installed
  apt:
    name: mosquitto-clients
    state: present
    update_cache: yes

- name: Ensure project directory exists
  file:
    path: "{{ okno_mqtt_project_dir }}"
    state: directory
    owner: "{{ okno_mqtt_user }}"
    group: "{{ okno_mqtt_user }}"
    mode: "0755"

# --- skrypty bash ---

- name: Deploy publish_okno.sh
  template:
    src: publish_okno.sh.j2
    dest: "{{ okno_mqtt_project_dir }}/publish_okno.sh"
    owner: "{{ okno_mqtt_user }}"
    group: "{{ okno_mqtt_user }}"
    mode: "0755"

- name: Deploy sub_okno.sh
  template:
    src: sub_okno.sh.j2
    dest: "{{ okno_mqtt_project_dir }}/sub_okno.sh"
    owner: "{{ okno_mqtt_user }}"
    group: "{{ okno_mqtt_user }}"
    mode: "0755"

- name: Deploy skrypt_on.sh
  template:
    src: skrypt_on.sh.j2
    dest: "{{ okno_mqtt_project_dir }}/skrypt_on.sh"
    owner: "{{ okno_mqtt_user }}"
    group: "{{ okno_mqtt_user }}"
    mode: "0755"

- name: Deploy skrypt_off.sh
  template:
    src: skrypt_off.sh.j2
    dest: "{{ okno_mqtt_project_dir }}/skrypt_off.sh"
    owner: "{{ okno_mqtt_user }}"
    group: "{{ okno_mqtt_user }}"
    mode: "0755"

# --- systemd unity ---

- name: Deploy mqtt-okno-publish.service
  template:
    src: mqtt-okno-publish.service.j2
    dest: "/etc/systemd/system/{{ okno_mqtt_publish_service }}"
    mode: "0644"
  notify: reload systemd

- name: Deploy mqtt-okno-publish.timer
  template:
    src: mqtt-okno-publish.timer.j2
    dest: "/etc/systemd/system/{{ okno_mqtt_publish_timer }}"
    mode: "0644"
  notify: reload systemd

- name: Deploy mqtt-okno-sub.service
  template:
    src: mqtt-okno-sub.service.j2
    dest: "/etc/systemd/system/{{ okno_mqtt_sub_service }}"
    mode: "0644"
  notify: reload systemd

# --- enable + start ---

- name: Ensure mqtt-okno-publish.timer enabled and started
  systemd:
    name: "{{ okno_mqtt_publish_timer }}"
    enabled: yes
    state: started

- name: Ensure mqtt-okno-sub.service enabled and started
  systemd:
    name: "{{ okno_mqtt_sub_service }}"
    enabled: yes
    state: started
```

## 5. Templaty skryptow

### 5.1. `templates/publish_okno.sh.j2`

```bash
#!/bin/bash
set -euo pipefail

BROKER_HOST="{{ okno_mqtt_broker_host }}"
BROKER_PORT={{ okno_mqtt_broker_port }}

TOPIC_TEMP_WEWN="{{ okno_mqtt_topic_temp_wewn }}"
TOPIC_TEMP_ZEWN="{{ okno_mqtt_topic_temp_zewn }}"
TOPIC_OKNO="{{ okno_mqtt_topic_okno }}"   # 1 = zamkniete, 0 = otwarte

VALUE_TEMP_WEWN_FILE="{{ okno_mqtt_file_temp_wewn }}"
VALUE_TEMP_ZEWN_FILE="{{ okno_mqtt_file_temp_zewn }}"
VALUE_OKNO_FILE="{{ okno_mqtt_file_okno }}"

DEFAULT_TEMP_WEWN="{{ okno_mqtt_default_temp_wewn }}"
DEFAULT_TEMP_ZEWN="{{ okno_mqtt_default_temp_zewn }}"
DEFAULT_OKNO="{{ okno_mqtt_default_okno }}"

read_value() {
  local file_path="$1"
  local description="$2"
  local fallback="$3"

  if [[ -r "$file_path" ]]; then
    local value
    value="$(tail -n 1 "$file_path" | tr -d '\r')"
    if [[ -n "$value" ]]; then
      echo "$value"
      return 0
    fi
    echo "[WARN] Plik $description jest pusty, uzywam wartosci domyslnej $fallback" >&2
  else
    echo "[WARN] Brak pliku $description ($file_path), uzywam wartosci domyslnej $fallback" >&2
  fi

  echo "$fallback"
}

temp_wewn="$(read_value "$VALUE_TEMP_WEWN_FILE" "temp_wewn" "$DEFAULT_TEMP_WEWN")"
temp_zewn="$(read_value "$VALUE_TEMP_ZEWN_FILE" "temp_zewn" "$DEFAULT_TEMP_ZEWN")"
okno_state="$(read_value "$VALUE_OKNO_FILE" "okno_stan" "$DEFAULT_OKNO")"

echo "[PUB] $TOPIC_TEMP_WEWN -> $temp_wewn"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_TEMP_WEWN" -m "$temp_wewn"

echo "[PUB] $TOPIC_TEMP_ZEWN -> $temp_zewn"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_TEMP_ZEWN" -m "$temp_zewn"

echo "[PUB] $TOPIC_OKNO -> $okno_state"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_OKNO" -m "$okno_state"
```

Domyslnie skrypt szuka wartosci w plikach tekstowych tworzonych w katalogu `~/okno-mqtt/`:
- `temp_wewn` – ostatnia linia to temperatura wewnetrzna,
- `temp_zewn` – temperatura zewnetrzna,
- `okno_stan` – stan okna (`1`/`0`).

Jesli pliku brakuje albo jest pusty, wysylana jest wartosc domyslna z `defaults/main.yml`. Wystarczy wiec, ze inne procesy/czujniki beda nadpisywac te pliki (np. przez `echo 22.4 > ~/okno-mqtt/temp_wewn`) przed kolejnym wywolaniem timera.

### 5.2. `templates/sub_okno.sh.j2`

```bash
#!/bin/bash

BROKER_HOST="{{ okno_mqtt_broker_host }}"
BROKER_PORT={{ okno_mqtt_broker_port }}
TOPIC_CONTROL="{{ okno_mqtt_topic_okno }}"

SCRIPT_ON="{{ okno_mqtt_project_dir }}/skrypt_on.sh"
SCRIPT_OFF="{{ okno_mqtt_project_dir }}/skrypt_off.sh"

last=""

echo "Start subskrypcji $TOPIC_CONTROL z $BROKER_HOST:$BROKER_PORT"

mosquitto_sub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_CONTROL" | while read -r payload; do
    echo "[SUB] $TOPIC_CONTROL -> $payload"

    if [[ -z "$last" ]]; then
        last="$payload"
        echo "Stan poczatkowy: $last"
        continue
    fi

    norm_last="$last"
    norm_payload="$payload"

    [[ "$norm_last" =~ ^[Tt]rue$ ]] && norm_last="1"
    [[ "$norm_last" =~ ^[Ff]alse$ ]] && norm_last="0"
    [[ "$norm_payload" =~ ^[Tt]rue$ ]] && norm_payload="1"
    [[ "$norm_payload" =~ ^[Ff]alse$ ]] && norm_payload="0"

    if [[ "$norm_last" == "0" && "$norm_payload" == "1" ]]; then
        echo "ZMIANA 0 -> 1, odpalam ON"
        "$SCRIPT_ON" &
    elif [[ "$norm_last" == "1" && "$norm_payload" == "0" ]]; then
        echo "ZMIANA 1 -> 0, odpalam OFF"
        "$SCRIPT_OFF" &
    else
        echo "Brak istotnej zmiany ($norm_last -> $norm_payload)"
    fi

    last="$payload"
done
```

### 5.3. `templates/skrypt_on.sh.j2`

```bash
#!/bin/bash
LOG_FILE="{{ okno_mqtt_project_dir }}/mqtt_okno.log"
echo "$(date)  TRYB ON (0 -> 1)" >> "$LOG_FILE"

# TODO: tutaj co ma sie stac przy 0 -> 1
```

### 5.4. `templates/skrypt_off.sh.j2`

```bash
#!/bin/bash
LOG_FILE="{{ okno_mqtt_project_dir }}/mqtt_okno.log"
echo "$(date)  TRYB OFF (1 -> 0)" >> "$LOG_FILE"

# TODO: tutaj co ma sie stac przy 1 -> 0
```

## 6. Templaty unitow systemd

### 6.1. `templates/mqtt-okno-publish.service.j2`

```ini
[Unit]
Description=Publikacja danych okna do MQTT

[Service]
Type=oneshot
User={{ okno_mqtt_user }}
WorkingDirectory={{ okno_mqtt_project_dir }}
ExecStart=/bin/bash {{ okno_mqtt_project_dir }}/publish_okno.sh
StandardOutput=journal
StandardError=journal
```

### 6.2. `templates/mqtt-okno-publish.timer.j2`

```ini
[Unit]
Description=Timer publikacji danych okna do MQTT

[Timer]
OnBootSec=15
OnUnitActiveSec={{ okno_mqtt_interval_sec }}
Unit={{ okno_mqtt_publish_service }}

[Install]
WantedBy=timers.target
```

### 6.3. `templates/mqtt-okno-sub.service.j2`

```ini
[Unit]
Description=Subskrypcja MQTT okno/zamkniete

[Service]
User={{ okno_mqtt_user }}
WorkingDirectory={{ okno_mqtt_project_dir }}
ExecStart=/bin/bash {{ okno_mqtt_project_dir }}/sub_okno.sh
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## 7. Efekt po `ansible-playbook`

Po odpaleniu playbooka na kazdej Raspi w grupie `rpi_czujniki`:

* powstaje katalog `/home/<user>/okno-mqtt` ze skryptami,
* co `okno_mqtt_interval_sec` sekund timer `mqtt-okno-publish.timer` uruchamia `publish_okno.sh`, ktory publikuje na tematykach:
  * `czujnik/okno/temperatura/wewn`
  * `czujnik/okno/temperatura/zewn`
  * `okno/zamkniete`
* usluga `mqtt-okno-sub.service` stale nasluchuje `okno/zamkniete` i przy:
  * przejsciu `0 -> 1` odpala `skrypt_on.sh`,
  * przejsciu `1 -> 0` odpala `skrypt_off.sh`.

Przy kolejnej Raspi wystarczy dopisac hosta do `inventory.ini` i odpalenie tego samego playbooka postawi identyczne srodowisko. W razie potrzeby mozna dopisac do `publish_okno.sh.j2` konkretne odczyty z czujnikow (GPIO / I2C / 1-Wire), ale caly fundament (MQTT + systemd + timer) jest juz gotowy w Ansible.
