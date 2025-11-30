# Broker MQTT (Mosquitto)

Ten dokument opisuje bieżący etap projektu – uruchomienie i testy brokera MQTT, który stanie się centralnym punktem dla wszystkich urządzeń i usług cieplarni. Prototyp używa jednego pliku `docker-compose.yml`, w którym na razie znajduje się tylko Mosquitto.

## Wymagania wstępne
- Docker 24+ oraz `docker compose` plugin
- `mosquitto-clients` (np. `apt install mosquitto-clients`) do testów CLI

## Zawartość repozytorium
- `docker-compose.yml` – uruchamia obraz `eclipse-mosquitto:2`, wystawia porty 1883 (MQTT) i 9001 (websockets)
- `mosquitto/config/` – bieżący konfig (prototyp, anonimowy dostęp), przykładowy `passwordfile`
- `mosquitto/data`, `mosquitto/log`, `mosquitto/certs` – katalogi montowane jako wolumeny
- `scripts/mosquitto-generate-certs.sh` – zostanie użyty gdy wrócimy do TLS

## Procedura uruchomienia

1. **Start brokera**  
   ```bash
   docker compose up -d
   docker compose ps
   ```

2. **Test portu 1883 (anonimowy dostęp)**  
   ```bash
   mosquitto_pub -h localhost -p 1883 -t cieplarnia/test -m "hello"
   mosquitto_sub -h localhost -p 1883 -t cieplarnia/# -C 1
   ```

   Alternatywnie skrypt automatyczny:
   ```bash
   ./scripts/test-mqtt.sh
   ```
   Ustaw `USE_RETAIN=true` aby wysłać komunikat z flagą retain.

3. **Test portu 9001 (websockets)**  
   Użyj np. `wscat` lub innego klienta WS:
   ```bash
   npx wscat -c ws://localhost:9001/
   > CONNECT cieplarnia/test
   ```

## Następne kroki
- przełączenie `allow_anonymous` na `false` i dodanie `password_file` oraz `acl_file`,
- ponowna aktywacja TLS (listener 8883) wraz z generacją certyfikatów,
- scalenie z agregatorem, bazą i panelem w tym samym compose.
