# Lavorare su Nexus AI

Il maintainer sviluppa con agenti e verifica le build native. Leggere [AGENTS.md](AGENTS.md), [piano](docs/plan.md) e [stato](docs/status.md). Un task corrente, file assegnati senza sovrapposizioni, integrazione unica e verifiche proporzionate.

## Setup e comandi

Requisiti: Node **22.19+ della serie 22 oppure 24**, pnpm **10.32.1**, Git. T03 richiede PostgreSQL locale per account/persistenza e Mailpit per email locali. Il DB è creato dal maintainer secondo [questa guida](docs/setup/postgresql.md); nessun servizio a pagamento necessario. Non inserire password nel template `.env.example` o in variabili `VITE_`.

Dalla root, dopo `DATABASE_URL` nel proprio `.env`:

```powershell
pnpm install --frozen-lockfile
pnpm auth:setup
pnpm db:migrate
pnpm mailpit --install
pnpm package:win
```

`auth:setup` aggiunge solo configurazioni mancanti e genera il secret una volta; conserva i valori esistenti. La migrazione è esplicita e limitata al DB locale `nexus_ai_dev`, senza esecuzione automatica all'avvio. Mailpit viene scaricato dalla release ufficiale, verificato SHA-256 e conservato in `.nexus/`, ignorata da Git. Lo stesso launcher gestisce i tre OS; solo Windows è stato provato qui.

| Comando | Scopo |
| --- | --- |
| `pnpm check` | Build librerie, typecheck, lint e confini renderer/Node |
| `pnpm test` | Test di dominio, autorizzazioni, sicurezza, SMTP locale e storage |
| `pnpm build` | Compilazione workspace |
| `pnpm db:check` | Probe DB reale senza stampare credenziali |
| `pnpm db:migrate` | Migrazioni versionate sul DB locale dedicato |
| `pnpm mailpit --install` / `pnpm mailpit` | Installazione locale verificata / avvio inbox e SMTP loopback |
| `pnpm dev:desktop` | Librerie, backend, Vite e app; URL browser account 5173 |
| `pnpm dev:web` / `pnpm dev:server` | Renderer web + backend / solo backend |
| `pnpm start:server` | Backend compilato, `.env` root e pagine account compilate |
| `pnpm start:desktop` | App compilata; richiede build |
| `pnpm smoke:desktop` | Renderer/bridge/isolamento in finestra nascosta |
| `pnpm verify:shell` | Catture shell, ricerca e preferenza movimento; richiede build |
| `pnpm verify:accounts` | Prova esplicita account PostgreSQL/SMTP reali con fixture locale temporanea |
| `pnpm verify:auth-desktop` | Scambio PKCE, cifratura OS, ripristino/revoca in Electron isolato |
| `pnpm verify:session-rate` | Regressione429, finestre reali del limiter con tempo QA virtuale e controlli auth Electron su backend proprio |
| `pnpm verify:collaboration` | Tre account temporanei: inviti SMTP, isolamento progetti, ruoli/revoca e owner concorrenti su PostgreSQL reale |
| `pnpm verify:sessions` | Tre account temporanei: estratti/audience, versioni/concorrenza, idempotenza, task visibili e revoca su HTTP/PostgreSQL/SMTP |
| `pnpm verify:work` | Workflow T11 con PG/SMTP/HTTP/WS reali: ruoli, CAS/ricevute, revisione/decisione, allegati, visibilità e revoca |
| `pnpm verify:pulse` | Snapshot Pulse, audience e progressi oltre100task, summary UTC/mine, outcomes e revoca con PG/SMTP/HTTP/WS reali |
| `pnpm verify:workspace` | Electron/IPC/UI reale con Git e TAP Node isolati, trasporto provider controllato e OS opens intercettati; nessuna credenziale o inferenza personale |
| `pnpm codex:prepare` | Copia il runtime ufficiale fissato della piattaforma dalla dipendenza installata; eseguito anche dal build desktop |
| `pnpm codex:schema` | Rigenera i tipi dal binario 0.159.2; non modificare manualmente `generated/` |
| `pnpm verify:codex` | Handshake, account anonimo isolato, catalogo e shutdown del binario reale; richiede build, non esegue inferenza |
| `pnpm package:win` / `pnpm package:mac` / `pnpm package:linux` | Build e NSIS / DMG / AppImage sul relativo OS |

Gli harness account richiedono PostgreSQL locale e Mailpit attivi. `verify:accounts`/`verify:auth-desktop` usano un backend locale già avviato; il secondo scrive ID/email in `.nexus/visual/t09-fix/auth/desktop-auth-report.json` e il coordinatore rimuove solo tali righe. `verify:session-rate` avvia invece il proprio backend su porta effimera e coordina anche la pulizia dei due account QA. Non eseguirli su servizi remoti o usare dati di persone reali. I test SMTP aprono una porta loopback temporanea; il sandbox dell'agente può richiedere esecuzione esterna, senza cambiare la sandbox del renderer.

Gli orchestratori usano Node e argomenti separati, senza shell nei manifest. Dev carica `.env` e sostituisce solo `NEXUS_WEB_URL` con il Vite locale; main/preload e librerie richiedono riavvio dopo modifiche, renderer/server hanno watch. Non avviare comandi concorrenti sulle porte 3001/5173.

## Build e prova Windows T11

Versione T11: **0.11.0**, task/roadmap/documenti/consegne cliente; correzione429 conservata. Eseguire `pnpm install --frozen-lockfile`, poi `pnpm package:win`: installer `release/win/Nexus-AI-0.11.0-win-x64.exe` su host x64; programma senza installer `release/win/win-unpacked/Nexus AI.exe`. Prima della build eseguire esplicitamente `pnpm db:migrate`:0005 estende il DB esistente, già applicata su questa macchina senza cancellare dati. Nessun cambio credenziali o nuovo DB. Codex nativo0.159.2 incluso, senza CLI globale/WSL richiesti. Pacchetto unsigned, nessuna installazione automatica. Arrestare app e backend precedenti prima della build e riavviarli entrambi dopo: il vecchio processo server mantiene il limiter precedente finché non viene riavviato.

Per T11 seguire la [prova completa](docs/work.md#build-e-prova-windows): task → sessione → documento/update → deliverable/file → feedback/approvazione cliente → nuova revisione Pending. `pnpm verify:work` verifica il workflow T11 con fixture PG/HTTP/WS proprie; `pnpm verify:workspace` include board/Docs, pubblicazione/revisioni/feedback e Pulse/preview cliente/reduced motion/960px nel renderer/preload effettivi. Rapporti `.nexus/visual/t11/`.

Dopo la build tenere aperti:

Per T09 seguire la [prova a due account](docs/overview.md#build-e-prova-windows): presenza, feed e link al testo autorizzato, selezione locale/remota, nuovi eventi senza salto della lettura, Mark all read, metriche locali opt-in e revoca. `pnpm verify:overview` esegue la prova locale PG/Mailpit/HTTP/WS con fixture propri; `pnpm verify:workspace` verifica anche overview popolata, campioni OS reali e privacy delle righe trattenute nel renderer/preload effettivi con trasporti controllati. I percorsi [T08](docs/realtime.md) e [T07](docs/session.md) restano disponibili. **Open in Editor** richiede VS Code con protocollo `vscode://` registrato.

```powershell
# Terminale 1
pnpm mailpit
```

```powershell
# Terminale 2
pnpm start:server
```

```powershell
# Terminale 3, oppure aprire l'app installata
pnpm start:desktop
```

In Settings avviare **Sign in with browser**, registrarsi, aprire la verifica su **http://127.0.0.1:8025**, accedere e scegliere **Continue in Nexus AI**. Verificare riapertura, logout e reset con revoca delle vecchie sessioni. I cinque passi completi e gli errori recuperabili sono in [Account T03](docs/auth.md).

Per T04 aprire **Projects**, creare workspace/progetto e selezionarlo. In **Team**, scegliere ambito Project e invitare un secondo indirizzo; aprire l'email in Mailpit e accettare dal browser con l'account verificato corrispondente. Controllare il solo progetto assegnato, ridurre il ruolo e rimuovere l'accesso. In **Repos** salvare URL HTTPS/default branch e scegliere una cartella locale dal desktop; riaprendo l'app il binding rimane distinto per account e dispositivo. [Regole e prova completa T04](docs/collaboration.md).

Per T05, dopo l'accesso Nexus, aprire **Settings → Codex**, collegare il runtime e scegliere l'accesso personale ChatGPT nel browser. È un login distinto da quello Nexus: l'email Codex non passa da Mailpit. Il ritorno viene gestito dal runtime locale; attendere lo stato account connesso. Il device code è un'alternativa esplicita se il browser non completa il flusso. Su Windows usare il setup sandbox mostrato nelle impostazioni se richiesto. In **Repos** collegare una cartella a un repository del progetto, con ruolo owner/developer, poi aprire **AI Session**, scegliere modello/effort dal catalogo e inviare una domanda sui file chiedendo sola lettura. Controllare streaming, interruzione, nuovo messaggio e riapertura sullo stesso thread. [Passi e limiti completi](docs/codex.md#prova-manuale-t05).

L'accesso personale usa lo storage sicuro OS nella home Codex di Nexus, distinta dalle altre app. Nessuna importazione automatica delle loro sessioni; API key solo se scelta esplicitamente e con relativo consumo API. Il catalogo da solo non prova diritti/quota di inferenza. Scritture/approvazioni locali T07, estratti T06 e condivisione selezionata live T08 sono disponibili con consensi distinti.

Da 0.5.1 il renderer ascolta gli eventi Nexus prima del recupero iniziale, ignora letture obsolete e accorpa refresh simultanei. Dopo il ripristino Nexus collega automaticamente Codex una volta per account verificato, leggendo solo il proprio keyring: non apre un nuovo login o una richiesta AI. Disconnect resta rispettato durante navigazione/cambio progetto/focus; al riavvio l'app tenta nuovamente il collegamento. Se il backend parte dopo l'app, **Refresh Nexus** o il ritorno in primo piano recuperano la credenziale conservata; non esistono retry infiniti. Logout/revoca e permessi rimangono autorevoli sul server.

### Log server e diagnosi

`pnpm start:server` mostra log Chalk con ora UTC, livello, ID richiesta, metodo, endpoint, esito HTTP e durata. Le operazioni workspace validate aggiungono `operation`; errori catturati aggiungono categoria e codice stabile quando disponibile, ad esempio `database_authentication`/`28P01`, `unavailable`/`ECONNREFUSED`, `rate_limited`/HTTP 429. Ogni risposta espone anche `X-Request-ID` per correlazione. Il colore è automatico nel terminale e disattivabile con `NO_COLOR=1`; nei file resta testo leggibile.

`NEXUS_LOG_LEVEL=info` registra ogni completamento, `debug` anche l'inizio richiesta, `warn`/`error` riducono il rumore e `silent` disattiva i log ordinari. Query/fragment, body, cookie, header, indirizzi email, messaggi/stack SQL e contenuto chat sono esclusi tramite campi ammessi. URL sconosciute e asset usano etichette di percorso generiche. Nessun invio a servizi esterni. Il logger riguarda il backend: il processo Codex resta locale e non inoltra i prompt al server Nexus.

Per il problema dopo l'avvio chat, riprovare con app e backend 0.5.1 e conservare le righe WARN/ERROR o i completamenti `/auth/get-session` e `/api/collaboration` vicini all'errore. HTTP 429 è distinto da indisponibilità e la sessione salvata è conservata per un nuovo controllo. Non è stato dimostrato che un limite di frequenza abbia causato il feedback iniziale; i log servono a identificarne la risposta effettiva.

`pnpm verify:collaboration` richiede il DB locale migrato e Mailpit loopback; crea una propria istanza HTTP temporanea e non arresta il server del maintainer. Elimina soltanto workspace/account/email QA della propria esecuzione. La verifica non deve essere usata con SMTP remoto o credenziali di produzione.

Il backend serve le pagine compilate su `http://127.0.0.1:3001/sign-in`; le email non escono dal PC. In sviluppo si può usare `pnpm dev:desktop` al posto dei comandi server/app, lasciando Mailpit nell'altro terminale. Per fermare usare Ctrl+C. Il pacchetto non incorpora né avvia backend, PostgreSQL o Mailpit.

`Invoke-RestMethod http://127.0.0.1:3001/health` mostra `database: connected` solo dopo un probe riuscito; non dimostra che Codex sia collegato. Le sole URL pubbliche vengono incorporate nel renderer/main durante build: cambiando URL nel `.env` occorre ricompilare il pacchetto. Nessuna credenziale del `.env` deve essere incorporata negli artefatti.

## macOS, Linux e limiti

Sul relativo sistema usare installazione/setup DB e auth, poi `pnpm check`, `pnpm test` e `pnpm package:mac` oppure `pnpm package:linux`. Output `release/mac/` e `release/linux/`. Ogni comando produce l'architettura dell'host Node (x64 o arm64), con runtime Codex corrispondente: per due architetture usare due host/runner nativi, senza copiare il vendor di un altro sistema. Mac DMG e Linux AppImage richiedono ambiente desktop reale. AppImage può richiedere FUSE 2 o `--appimage-extract-and-run`. Non usare `--no-sandbox`.

macOS richiede prova nativa di protocollo e continuità Keychain/firma. Linux richiede keyring sicuro: `basic_text` è rifiutato, senza salvataggio in chiaro. Le configurazioni di packaging e la CI non provano questi comportamenti nativi. Il maintainer proverà il Mac più avanti. Firma/notarizzazione e distribuzione self-host sono T16.

## Verifiche e contributi

Le shell T02 sono già accettate Windows; [reference e confronto](docs/design/t02-review.md). Le pagine account nuove seguono gli stessi token e font; [catture T03](docs/auth.md). UI vuota senza dati reali, nessuna attività o salute inventata.

Eseguire i controlli pertinenti dopo l'integrazione; ripeterli solo per correzioni o dubbi concreti. Non aggiungere test per edit documentali reversibili o ripetere suite per abitudine. La consegna contiene commit, comandi OS, prerequisiti, pochi passi e limiti: implementato, testato, pacchetto generato e accettato dal maintainer restano evidenze distinte.

Un autore per manifest/lockfile, contratti e migrazioni. Versioni esatte nel lockfile; niente aggiornamenti durante una verifica del task. Niente `.env`, auth store, token, output di clienti o build nei commit. Aggiornare stato/piano/changelog con il task; commit coerenti, niente push forzati o migrazioni su produzione implicite.
