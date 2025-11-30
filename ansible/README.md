Szybkie wskazówki do uruchomienia Ansible playbook (lokalny host):

1. Zainstaluj Ansible (i wymagane kolekcje, opcjonalnie):

```bash
python3 -m pip install --user ansible
```

2. Uruchom playbook na `localhost` (playbook używa `become: true`):

```bash
cd ansible
ansible-playbook -i inventory.ini playbook.yml --ask-become-pass
```

Uwaga: playbook wykonuje prostą instalację Dockera przez `get.docker.com` i może modyfikować system.
W środowisku produkcyjnym warto użyć bezpieczniejszych metod (repozytorium Dockera, `ansible.builtin.apt_key`, itp.) oraz zabezpieczyć hasła przez `ansible-vault`.

Konfiguracja (zmienne): edytuj `group_vars/all.yml` aby zmienić docelowy katalog (`stack_dest`) oraz listę użytkowników `mosquitto_users`.
