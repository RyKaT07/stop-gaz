# stop-gaz

Platforma telemetryczna dla cieplarni: odczyt sensorów, magistrala MQTT, agregacja danych i panel diagnostyczny. Nazwa "stop-gaz" nawiązuje do celu ograniczenia ręcznego sterowania ogrzewaniem dzięki automatyzacji.

## Cel projektu
- zebrać pomiary (temperatura, wilgotność, CO₂, przepływy) w jednym kanale komunikacyjnym,
- utrzymać spójną historię danych do analizy i sterowania,
- udostępnić webowy panel diagnostyczny z alarmami i trendami,
- dostarczyć infrastrukturę możliwą do odtworzenia jednym poleceniem (Docker Compose + Ansible).

## Architektura docelowa
- **Mosquitto MQTT** – broker dla urządzeń i usług; dwa porty (1883/8883 TLS), ACL/hasła, docelowo część wspólnego `docker-compose.yml`.
- **Serwis agregacyjny** – aplikacja (np. FastAPI) odbierająca payload z MQTT, walidująca i zapisująca do Timescale/Influx.
- **Magazyn danych** – baza z polityką retencji oraz API do analityki.
- **Panel www** – dashboard (Grafana lub dedykowany frontend) korzystający z bazy i usług automatyki.
- **Automatyzacja** – playbooki Ansible przygotowujące hosty edge/VM (Docker, firewall, tajemnice) i uruchamiające jedną kompozycję.

## Stan prac
| Etap | Status | Notatki |
| --- | --- | --- |
| Broker MQTT | ✅ prototyp w `docker-compose.yml` (porty 1883/9001, bez TLS) | `docs/mosquitto.md` opisuje konfigurację i testy |
| Agregator danych | 🔄 projektowanie | Definicja schematów payload oraz wybór bazy |
| Panel webowy | 🕒 zaplanowane | Wizualizacje i alarmy |
| Ansible provisioning | 🔄 projektowanie | Role `docker_host`, `mosquitto`, `stack` |

## Struktura repozytorium
- `docker-compose.yml` – aktualnie zawiera tylko Mosquitto, ale zostanie rozszerzony o agregator, bazę i panel.
- `mosquitto/` – konfiguracje, ACL, przykładowy `passwordfile`, katalogi wolumenów.
- `scripts/mosquitto-generate-certs.sh` – generator lokalnego CA i certyfikatu serwera.
- `docs/` – instrukcje operacyjne (np. `docs/mosquitto.md`).

## Roadmapa
1. Zamknąć schematy payloadów MQTT oraz model bazy (Timescale/Influx).
2. Przygotować wspólny `docker-compose.yml` obejmujący broker, agregator, bazę i panel.
3. Zaimplementować role Ansible automatyzujące provisioning i deployment.
4. Dostarczyć dashboard z testami E2E.

## Dokumentacja szczegółowa
- `docs/mosquitto.md` – uruchomienie i testy brokera MQTT.
