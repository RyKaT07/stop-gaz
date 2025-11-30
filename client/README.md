# Setup klienta i niezaleznego deploymentu

Ponizej znajdziesz komplet instrukcji, jak przygotowac powtarzalny setup na Raspi przy pomocy Ansible (bez Pythona, tylko bash + mosquitto + systemd + timer). Material jest gotowy do skopiowania 1:1 do repo, tak aby po sklonowaniu mozna bylo niezaleznie odpalic klienta i caly pozostaly stack (Ansible nie bedzie kolidowal z reszta).

## 1. Struktura projektu Ansible

```text
ansible/
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

## 2. Inventory – `inventory.ini`

```ini
[rpi_czujniki]
czujnik ansible_host=10.252.249.X ansible_user=czujka
```

* Podmien `10.252.249.X` na IP swojej Raspi.
* `ansible_user` to uzytkownik SSH (przyklad: `czujka`).

## 3. Playbook – `playbook-okno-mqtt.yml`

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
cd ansible
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
set -e

BROKER_HOST="{{ okno_mqtt_broker_host }}"
BROKER_PORT={{ okno_mqtt_broker_port }}

TOPIC_TEMP_WEWN="{{ okno_mqtt_topic_temp_wewn }}"
TOPIC_TEMP_ZEWN="{{ okno_mqtt_topic_temp_zewn }}"
TOPIC_OKNO="{{ okno_mqtt_topic_okno }}"   # 1 = zamkniete, 0 = otwarte

# ====== TUTAJ PODMIENISZ NA PRAWDZIWE ODCZYTY ======

read_temp_wewn() {
  echo "23.5"
}

read_temp_zewn() {
  echo "5.2"
}

read_okno_state() {
  # 1 = zamkniete, 0 = otwarte
  echo "1"
}

# ===================================================

temp_wewn="$(read_temp_wewn)"
temp_zewn="$(read_temp_zewn)"
okno_state="$(read_okno_state)"

echo "[PUB] $TOPIC_TEMP_WEWN -> $temp_wewn"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_TEMP_WEWN" -m "$temp_wewn"

echo "[PUB] $TOPIC_TEMP_ZEWN -> $temp_zewn"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_TEMP_ZEWN" -m "$temp_zewn"

echo "[PUB] $TOPIC_OKNO -> $okno_state"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -t "$TOPIC_OKNO" -m "$okno_state"
```

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
