# Lavorare su Nexus AI

Leggere [AGENTS.md](AGENTS.md), [stato](docs/status.md) e [piano](docs/plan.md). I task T01–T16 appartengono alla stessa base definitiva. Il mandato T17 aggiunge l’onboarding dopo la consegna T16; nessuna tranche ulteriore viene avviata automaticamente. Il maintainer verifica le build native; implementazione, verifica automatica e accettazione sono registrate separatamente.

## Setup locale

Requisiti: Node **22.19+ della serie 22 oppure 24**, pnpm **10.32.1**, Git, PostgreSQL con ruolo/database dedicati. Per un nuovo clone predisporre PostgreSQL con la [guida locale](docs/setup/postgresql.md), poi impostare `DATABASE_URL` nel proprio `.env` ignorato da Git. La password è quella del ruolo dedicato, con codifica URL dei caratteri riservati; non quella dell'account Nexus. Non condividere credenziali in chat o in variabili `VITE_`.

Solo per la prima configurazione:

```powershell
pnpm install --frozen-lockfile
pnpm auth:setup
pnpm db:migrate
pnpm mailpit --install
pnpm package:win
```

`auth:setup` aggiunge i valori locali mancanti e genera il secret una sola volta, conservando quelli esistenti. Mailpit viene scaricato dalla release ufficiale con verifica SHA-256 e conservato in `.nexus/`, ignorata da Git. Non è un servizio SMTP pubblico: le email di verifica/reset/invito restano nell'[inbox locale](http://127.0.0.1:8025). Per inviare agli indirizzi reali serve SMTP sul server ospitato: [self-host](docs/self-host.md).

## Aggiornamento e build Windows corrente

Chiudere l'app precedente e il terminale con il vecchio backend, conservando `.env`, account e database:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm package:win
```

La versione applicativa è **0.17.1**. Su Windows x64 l'installer è `release/win/Nexus-AI-0.17.1-win-x64.exe`; il programma non installato è `release/win/win-unpacked/Nexus AI.exe`. Il packaging usa l'architettura dell'host. Senza credenziali di firma l'artefatto è unsigned; il comando non installa automaticamente il pacchetto. I risultati effettivamente ottenuti nella consegna sono in [status](docs/status.md), la procedura completa in [release](docs/release.md).

`db:migrate` è esplicito e limitato al database locale dedicato `nexus_ai_dev`. Le migrazioni additive arrivano a `0008_application`, **nove in totale**; su questa macchina sono già applicate e un nuovo lancio non ricrea account o dati. Il backend non migra il database all'avvio. Per un host diverso usare gli strumenti operatore e le conferme descritti in [self-host](docs/self-host.md), senza modificare la protezione del comando locale.

Avviare ciascun servizio in un terminale distinto. Se Mailpit è già attivo, riutilizzarlo:

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

Il package desktop contiene runtime Codex e renderer; PostgreSQL, backend e Mailpit sono servizi separati. Le pagine account compilate sono servite dal backend su `http://127.0.0.1:3001/sign-in`. In sviluppo `pnpm dev:desktop` avvia backend/Vite/app, con URL browser account5173, lasciando Mailpit separato. Non eseguirlo insieme a `start:server` sulle stesse porte; Ctrl+C arresta i comandi avviati.

## Comandi disponibili

| Comando | Scopo |
| --- | --- |
| `pnpm check` | Build librerie, TypeScript strict, ESLint e confini renderer/Node |
| `pnpm test` | Test workspace e orchestratori |
| `pnpm build` | Compilazione workspace; prepara il runtime Codex nativo |
| `pnpm db:check` / `pnpm db:migrate` | Probe DB senza segreti / migrazioni locali esplicite |
| `pnpm mailpit --install` / `pnpm mailpit` | Scaricamento verificato / SMTP e inbox loopback |
| `pnpm dev:desktop` | Backend, renderer Vite e desktop in sviluppo |
| `pnpm dev:web` / `pnpm dev:server` | Renderer e backend / solo backend |
| `pnpm start:server` / `pnpm start:desktop` | Servizi compilati, dopo build |
| `pnpm smoke:desktop` | Renderer/preload/IPC in finestra nascosta, senza Node nel renderer |
| `pnpm codex:prepare` | Vendor ufficiale della piattaforma dalla dipendenza fissata |
| `pnpm codex:schema` | Schema dal binario0.159.2; non editare manualmente i generated |
| `pnpm verify:codex` | Handshake/account anonimo/catalogo/shutdown reali, senza inferenza |
| `pnpm package:win` / `pnpm package:mac` / `pnpm package:linux` | Installer/DMG/AppImage sul rispettivo OS |
| `pnpm release:package unsigned` / `pnpm release:manifest unsigned` | Build/package/hash / hash e manifest del package già creato |
| `pnpm db:operator --help` | Migrazioni, backup e restore espliciti con conferma del database |
| `pnpm verify:operations` | Readiness/hash e backup/restore del solo schema QA proprio |
| `pnpm verify:accounts` / `pnpm verify:auth-desktop` | Account locali reali / PKCE, cifratura OS e ripristino/revoca |
| `pnpm verify:session-rate` | Regressione429 con tempo QA virtuale e auth Electron su backend proprio |
| `pnpm verify:collaboration` / `pnpm verify:sessions` | Inviti/ruoli/revoca / estratti, CAS e pubblicazione autorizzata |
| `pnpm verify:realtime` / `pnpm verify:overview` | Outbox/presenza/replay / feed, notifiche e target correnti |
| `pnpm verify:pulse` / `pnpm verify:work` | Audience/progressi / task, documenti, allegati, feedback e decisioni |
| `pnpm verify:workspace` | Sessione, Git/TAP locali e UI/IPC con provider controllato |
| `pnpm verify:repositories` / `pnpm verify:repository-ui` | PG/HTTP e API GitHub controllata / renderer/preload e Git reale isolato |
| `pnpm verify:deployments` / `pnpm verify:deployment-ui` | Registro/health/ruoli su PG/HTTP / UI reale e singola HEAD locale |
| `pnpm verify:preview` | Finestra preview effettiva, isolamento/cookie/Node e chiusura |
| `pnpm verify:application` / `pnpm verify:application-ui` | Ricerca/settings ACL su PG/HTTP / ricerca, notifiche, preferenze e UI |
| `pnpm verify:shell` / `pnpm verify:acceptance` | Shell / tre reference, ruoli, tastiera, resize e recupero controllato |
| `pnpm verify:renderer-recovery` / `pnpm verify:renderer-process` | Boundary React / crash del solo renderer QA e recupero esplicito |

Gli strumenti operativi T16 e i comandi di checksum/package sono elencati nelle guide [self-host](docs/self-host.md) e [release](docs/release.md). I verifier non sono prerequisiti da ripetere tutti per ogni build dell'utente.

Gli harness PostgreSQL/SMTP richiedono DB locale migrato e Mailpit. Creano fixture propri, mai dati di persone reali, e non vanno puntati a SMTP o servizi di produzione. `verify:accounts` e `verify:auth-desktop` usano un backend locale già avviato; il secondo conserva gli identificativi QA nel report privato per la pulizia documentata. Gli altri orchestratori indicano nel relativo report server effimeri e pulizia eseguita. I verifier UI possono usare DTO o provider controllati dichiarati: non dimostrano inferenza personale o chiamate GitHub esterne. I report locali sono in `.nexus/visual/`, esclusi da Git; soltanto catture controllate e revisionate possono entrare nei documenti pubblici.

## Prova manuale della consegna

1. **Account e progetto:** riaprire l'app con backend attivo, controllare il ripristino Nexus e la selezione progetto. Registrazione, reset e inviti locali si leggono in Mailpit. [Account](docs/auth.md), [collaborazione](docs/collaboration.md).
2. **Codex e sessione:** collegare il proprio account Codex da Settings, scegliere cartella autorizzata in Repos e modello dal catalogo. Provare richiesta, streaming, interruzione e ripresa; workspaceWrite richiede scelta locale e approvazioni del driver. [Codex](docs/codex.md), [sessione](docs/session.md).
3. **Condivisione:** pubblicare soltanto messaggi scelti dopo anteprima/audience; osservare da un secondo account, scollegare/ricollegare e ridurre il ruolo. Controllare che il contenuto interno sparisca dalla vista cliente. [Realtime](docs/realtime.md).
4. **Lavoro:** task → sessione → aggiornamento → deliverable → feedback/decisione cliente. [Workflow](docs/work.md). Una decisione cliente non autorizza esecuzioni Codex, push o deploy.
5. **Git e ambiente:** usare un repository dedicato, diff/commit e sincronizzazione espliciti. Configurare GitHub solo con il proprio token dedicato; registrare una build effettiva e health con fonte/scadenza, aprire preview. [Repository](docs/repositories.md), [deploy](docs/deployments.md).
6. **Ricerca e UI:** Ctrl+K/Cmd+K, ricerca di testo pubblicato, notifiche/mark read, preferenze e riavvio. Confrontare Pulse/Sessione/Overview a1586×992 e960px, normale/ridotto. [Impostazioni](docs/application.md), [revisione visiva](docs/design/t15-review.md).

Il login Codex è distinto da Nexus: la sua email non passa da Mailpit. Il runtime usa una home/keyring di Nexus senza importare le credenziali di altre app. API key solo per scelta esplicita, senza fallback automatico a consumo. Il collegamento automatico al riavvio verifica il proprio account e non invia prompt o apre login. `Open in Editor` richiede VS Code e il protocollo `vscode://` registrato.

## Log server e diagnosi

`pnpm start:server` mostra log Chalk con ora UTC, livello, ID richiesta, metodo, endpoint, stato HTTP e durata. Operazioni validate aggiungono il nome dell'operazione; gli errori hanno categoria/codice stabile quando disponibile. `X-Request-ID` permette la correlazione. Colore automatico, disattivabile con `NO_COLOR=1`. `NEXUS_LOG_LEVEL=debug|info|warn|error|silent` regola la verbosità.

Body, query/fragment, cookie, token, email, contenuti chat e stack SQL sono esclusi dai campi ammessi. Il processo Codex resta locale; i prompt non vengono inviati al logger Nexus. HTTP 429, autenticazione e indisponibilità hanno esiti diversi: conservare le sole righe pertinenti con ID richiesta, senza copiare `.env` o credenziali. La correzione account0.9.1/no429 resta nella base finale.

`/health` espone il probe DB, non prova lo stato Codex o degli ambienti del progetto. `/ready` verifica prerequisiti operativi e schema senza migrare: [semantica e limiti](docs/self-host.md). Gli endpoint custom si configurano da Settings da disconnessi con riavvio esplicito; account/keyring/cartelle sono isolati per autorità. Nel browser le origini si configurano nella build/deployment web.

## macOS e Linux

Sul relativo sistema usare Node/pnpm della versione supportata, `pnpm install --frozen-lockfile`, quindi `pnpm check`, `pnpm test` e `pnpm package:mac` oppure `pnpm package:linux`. Output `release/mac/` e `release/linux/`. Il backend può essere locale o self-host configurato; non occorre installare PostgreSQL su ogni dispositivo che usa un server ospitato.

Il packaging produce x64/arm64 secondo l'host Node, con runtime Codex corrispondente. Due architetture richiedono due host/runner nativi. Non copiare il vendor da un altro OS. Mac DMG e Linux AppImage richiedono prova su desktop reale; AppImage può richiedere FUSE2 o `--appimage-extract-and-run`. Non usare `--no-sandbox`.

Mac: protocollo di ritorno, Keychain e continuità della firma richiedono prova nativa. Linux: keyring sicuro richiesto, `basic_text` rifiutato senza ripiego in chiaro. Workflow CI, package unsigned e release firmata sono evidenze distinte. Firma/notarizzazione richiedono le credenziali del maintainer: [release](docs/release.md). La prova Mac sarà eseguita dal maintainer dal proprio Mac.

## Regole di integrazione

Un autore per manifest/lockfile, contratti e migrazioni; ownership prima delle deleghe. I processi usano Node e argv separati, con main/preload isolati dal renderer. Non committare `.env`, auth store, token, output di clienti o package. Dipendenze esatte nel lockfile; nessun aggiornamento casuale durante le verifiche.

Eseguire controlli pertinenti dopo l'integrazione, ripetendoli solo dopo difetti concreti o rischi nuovi. I cambi documentali non richiedono nuovi test che ripetano il testo. Aggiornare documenti esistenti, stato/piano/changelog e commit coerenti; niente push forzati, migrazioni di produzione implicite o loop senza nuova evidenza. La [matrice di accettazione](docs/acceptance.md) resta il riferimento per ciò che richiede ancora una prova umana.
