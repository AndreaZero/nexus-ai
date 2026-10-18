# Self-host, operazioni e recupero

Nexus ospita identità, membership, dati condivisi e realtime in **un processo server** con PostgreSQL e SMTP. Il server serve anche la UI web compilata. Codex, file locali, approvazioni di esecuzione e credenziali personali del runtime restano nel desktop; l'immagine server non contiene Electron o Codex. Il realtime usa un broker in memoria: questa distribuzione supporta una sola istanza applicativa, senza bilanciamento fra processi.

## Configurazione del server

Usare Node22.19+ o24, pnpm10.32.1, PostgreSQL18 e un SMTP configurato. Le variabili effettive sono in [.env.example](../.env.example). Il processo server legge soltanto l'ambiente; non carica `.env` autonomamente. `BETTER_AUTH_SECRET` deve essere casuale, stabile e conservato anche nei backup operativi: protegge sessioni e cifratura delle connessioni GitHub. Perdere o cambiare questo segreto invalida quei dati cifrati. Il database non deve essere raggiungibile pubblicamente e il ruolo applicativo non deve essere superuser o avere CREATEDB/CREATEROLE.

`BETTER_AUTH_URL`, `NEXUS_WEB_URL` e la build web `VITE_NEXUS_SERVER_URL` devono puntare all'origine pubblica esatta. HTTPS è obbligatorio fuori dal loopback; `NEXUS_ALLOWED_ORIGINS` contiene quell'origine e `nexus://app`. Usare il medesimo dominio per server e web evita cookie fra siti differenti. Il desktop può selezionare l'origine pubblica in Settings dopo il logout, quindi riavviare esplicitamente; le authority personalizzate hanno profili locali separati.

`NEXUS_TRUSTED_PROXIES` è vuoto per impostazione predefinita. Dietro reverse proxy, impostare esclusivamente gli IP/CIDR del proprio proxy, verificati nella rete di destinazione. Non sono accettati trust globale, wildcard o prefissi `/0`. Il proxy deve sovrascrivere gli header forwarded ricevuti dall'esterno e inoltrare WebSocket: [esempio nginx](../deploy/nginx.conf.example). Il file richiede dominio, certificati e indirizzi della propria infrastruttura; non procura automaticamente hosting o certificati. Pubblicare soltanto HTTPS443 e mantenere l'upstream server su loopback/rete privata. Il limite nginx1MiB coincide con il limite d'ingresso del server.

## Container riproducibile

[Dockerfile](../Dockerfile) compila soltanto contracts/DB/UI/web/server con lockfile congelato e pnpm10.32.1. Le immagini ufficiali fissate sono Node24.22.0-bookworm-slim e PostgreSQL18.6-bookworm, verificati nelle [fonti ufficiali Node](https://github.com/docker-library/official-images/blob/master/library/node) e [PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres). Il runtime combina Node e strumenti PostgreSQL18 sulla stessa Debian, gira come UID10001, filesystem readonly e senza capability. I tag fissano la release; chi richiede immutabilità binaria deve risolvere e registrare anche i digest nella propria distribuzione. Credenziali, `.env`, runtime privati e artefatti desktop sono esclusi dal build context.

Copiare [deploy/self-host.env.example](../deploy/self-host.env.example) in `deploy/self-host.env`, escluso da Git, e compilare tutti i campi obbligatori. Generare **tre valori distinti** per password amministratore PostgreSQL, password ruolo Nexus e segreto auth, per esempio ripetendo `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Non incollare questi valori in chat o commit. Compose richiede password URL-safe base64url per costruire la connessione senza ambiguità. Configurare SMTP reale per produzione; Mailpit intercetta localmente le email e non le consegna alle caselle reali.

```text
docker compose --env-file deploy/self-host.env build server
docker compose --env-file deploy/self-host.env up -d database
docker compose --env-file deploy/self-host.env run --rm server packages/db/dist/operator-cli.js migrate --confirm-database nexus
docker compose --env-file deploy/self-host.env up -d server
```

La migrazione è un'azione operator esplicita prima dell'avvio, non un entrypoint automatico. Il volume PostgreSQL18 è montato su `/var/lib/postgresql`; il bootstrap crea il solo ruolo `nexus`, proprietario del database/schema e senza privilegi amministrativi. Le password di inizializzazione operano soltanto sul volume nuovo: cambiarle nel file non cambia i ruoli già creati. Una rotazione successiva richiede un'operazione PostgreSQL esplicita e la configurazione coerente del server. Non usare `down -v` su dati da conservare.

Compose pubblica il server su `127.0.0.1:NEXUS_HTTP_PORT`; nessuna porta DB è pubblicata. Il reverse proxy dell'host raggiunge questa porta. Il database usa una rete interna; il server dispone anche di uscita per SMTP e GitHub. Non pubblicare il file di configurazione o l'output interpolato di `docker compose config`, che contiene segreti.

Per un'installazione locale isolata, scegliere `NEXUS_PUBLIC_URL=http://127.0.0.1:3001`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, user/password SMTP vuoti e un mittente valido; aggiungere `--profile development` ai comandi e avviare anche `mailpit`. La UI Mailpit è su `http://127.0.0.1:8026`; questa porta evita il Mailpit locale8025 già previsto dal percorso di sviluppo. Il profilo è esplicito e non viene avviato in produzione.

## Readiness e diagnosi

`GET /health` è liveness del processo. `GET /ready` restituisce200 soltanto se PostgreSQL risponde, tutti i nove hash/stamp delle migrazioni corrispondono alla release e account/SMTP sono configurati; altrimenti503. Restituisce stati sintetici e timestamp senza DSN, host, email, token o errori SQL. Schema può essere `pending`, `mismatch` o `unavailable`: non esegue DDL. Una modifica a una migrazione già applicata è un mismatch, anche se l'ultima versione coincide. SMTP configurato non dimostra consegna: verificare una registrazione con un indirizzo di propria pertinenza. Readiness non invia email o richieste a provider.

I log strutturati includono requestId, metodo, percorso fisso, status, durata e categoria; non stampano body, cookie o credenziali. Per erroreSMTP verificare configurazione e servizio; per schema pending fermare scritture ed eseguire il comando esplicito. Un mismatch richiede confronto con la release corretta, senza modificare il journal per forzare il verde.

## Migrazioni, backup e restore

Il comando multipiattaforma è `pnpm db:operator --help` (prima compilare `pnpm --filter @nexus-ai/db build`). Usa `DATABASE_URL` dall'ambiente. `--env-file .env` è un'opzione esplicita limitata a `nexus_ai_dev` sul loopback; non viene caricata una configurazione locale durante operazioni self-host remote. Ogni operazione richiede `--confirm-database` con il nome esatto. Sono supportate connessioni PostgreSQL con credenziali e l'opzione URL `sslmode`; fuori loopback il default per i client di backup è `verify-full`. Usare TLS e CA attendibile sul server PostgreSQL remoto. Non passare DSN o password negli argomenti: le credenziali dei client PostgreSQL sono soltanto nell'ambiente del processo figlio, senza ereditare `PGOPTIONS` o altri override `PG*`.

```text
pnpm db:operator migrate --confirm-database nexus
pnpm db:operator backup --confirm-database nexus --file /percorso/privato/nexus-2026-10-18.dump
pnpm db:operator restore --confirm-database nexus_recovery --file /percorso/privato/nexus-2026-10-18.dump
```

Per Windows usare un percorso assoluto Windows equivalente. Il restore richiede che `DATABASE_URL` sia stato impostato **sul nuovo database vuoto** `nexus_recovery`, creato dall'amministratore con owner corretto. La conferma non cambia il target da sola. Gli operator prendono lo stesso advisory lock delle migrazioni locali; fermare comunque il server e ogni altro writer durante manutenzione e recupero. Un backup online `pg_dump` è consistente per il DB, ma fermare le scritture rende coerente anche il punto di recupero operativo. Il lock serializza gli operator Nexus e non blocca writer esterni arbitrari.

Backup usa `pg_dump --format=custom`; crea esclusivamente un file nuovo (`wx`), non sovrascrive file/symlink, richiede parent esistente e rimuove un proprio file parziale in caso di errore. Permessi0600 sui sistemi POSIX; su Windows scegliere una cartella con ACL private. L'archivio contiene dati utente e credenziali cifrate: conservarlo cifrato fuori dal repository, con accesso limitato, retention e una copia del segreto auth protetta separatamente. Il database non contiene filesystem o autenticazione Codex locali; questi richiedono la normale protezione del profilo desktop del proprietario.

Restore accetta solo un archivio regolare non vuoto e un database senza oggetti applicativi o schemi utente. Non esegue DROP/CLEAN o CREATE DATABASE. `pg_restore` usa una singola transazione, exit-on-error, no-owner/no-privileges; il ruolo target deve essere proprietario del database/schema. Ripristinare **soltanto archivi fidati**: un dump può contenere SQL eseguibile. I client `pg_dump`/`pg_restore`18 sono inclusi nell'immagine server; sul percorso host installarli nel PATH, di versione almeno uguale a quella del server. La risoluzione accetta soltanto eseguibili assoluti esterni al repository e alla directory corrente, verificando anche gli alias canonici; non cerca nel progetto. Il processo figlio riceve solo variabili OS essenziali e le credenziali PostgreSQL selezionate, senza segreti auth/SMTP.

Con Compose montare una cartella privata già creata nel container operator; il server gira comeUID10001 e deve poterci scrivere. Esempio host POSIX, con `./private-backups` preventivamente assegnata a quell'UID:

```text
docker compose --env-file deploy/self-host.env run --rm -v ./private-backups:/backups server packages/db/dist/operator-cli.js backup --confirm-database nexus --file /backups/nexus.dump
```

Il restore di produzione segue il percorso verso **un altro database vuoto** e un `DATABASE_URL` diverso fornito al container tramite un file ambiente privato; non ripristinare sul database in uso. Il container PostgreSQL privato può essere raggiunto da un operator sulla medesima rete. Dopo il recupero verificare `/ready`, conteggi attesi, login/email, ACL dei progetti e un flusso condiviso prima di cambiare il servizio attivo.

## Upgrade e rollback

1. Conservare tag/commit, configurazione privata e digest delle immagini correnti; pianificare una finestra e fermare il server.
2. Eseguire un backup e verificarlo su un database vuoto separato. Conservare il segreto auth esistente.
3. Compilare la release desiderata dal lockfile, leggere CHANGELOG/migrazioni additive e lanciare `migrate --confirm-database` con il nuovo operator, mantenendo fermo il server.
4. Avviare una sola istanza nuova; controllare readiness, log, login, email, UI e realtime.
5. Se serve rollback, fermare la nuova istanza e recuperare il backup in un database separato insieme alla release precedente. Non esistono down migration automatiche: il journal atteso di una release vecchia vede come mismatch migrazioni più recenti, impedendo un rollback cieco del solo binario.

Non cambiare major PostgreSQL con il solo tag del volume: seguire il percorso ufficiale di dump/restore o pg_upgrade. Non duplicare istanze server finché non viene progettato e verificato un broker condiviso.

## Evidenze e limiti

`pnpm verify:operations` usa PostgreSQL18 locale reale e **solo uno schema QA temporaneo proprio**: controlla nove hash, crea un archivio custom di quello schema, verifica rifiuto overwrite/restore sul database applicativo non vuoto, ripristina esclusivamente il proprio schema e confronta la riga; rimuove schema e archivio, lasciando invariati account/journal. Il report è `.nexus/visual/t16/operations-report.json`. Un restore completo su un nuovo database vuoto e le prove container sono evidenze separate registrate in [status](status.md); non sono dedotte dal test isolato. Hosting pubblico, TLS/SMTP reali, restore periodici e accettazione operativa del maintainer restano azioni della propria installazione.

Riferimenti: [Docker Node](https://docs.docker.com/guides/nodejs/), [immagine PostgreSQL e volume18](https://hub.docker.com/_/postgres), [pg_dump18](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore18](https://www.postgresql.org/docs/18/app-pgrestore.html), [Mailpit1.31.6](https://github.com/axllent/mailpit/releases/tag/v1.31.6).
