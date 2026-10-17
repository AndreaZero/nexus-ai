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
| `pnpm verify:collaboration` | Tre account temporanei: inviti SMTP, isolamento progetti, ruoli/revoca e owner concorrenti su PostgreSQL reale |
| `pnpm package:win` / `pnpm package:mac` / `pnpm package:linux` | Build e NSIS / DMG / AppImage sul relativo OS |

Gli harness account richiedono backend e Mailpit attivi. Quello HTTP elimina il proprio fixture; quello Electron scrive ID/email in `.nexus/visual/t03/desktop-auth-report.json` e il coordinatore rimuove solo tali righe dopo la prova. Non eseguirli su servizi remoti o usare dati di persone reali. I test SMTP aprono una porta loopback temporanea; il sandbox dell'agente può richiedere esecuzione esterna, senza cambiare la sandbox del renderer.

Gli orchestratori usano Node e argomenti separati, senza shell nei manifest. Dev carica `.env` e sostituisce solo `NEXUS_WEB_URL` con il Vite locale; main/preload e librerie richiedono riavvio dopo modifiche, renderer/server hanno watch. Non avviare comandi concorrenti sulle porte 3001/5173.

## Build e prova Windows T04

Versione T04: **0.4.0**. Con `pnpm package:win` l'installer viene scritto in `release/win/Nexus-AI-0.4.0-win-x64.exe`; programma senza installer in `release/win/win-unpacked/Nexus AI.exe`. Pacchetto unsigned; nessuna installazione automatica. Arrestare app/server precedenti prima della build e riavviarli dopo: il backend registra i nuovi asset compilati all'avvio.

Dopo la build tenere aperti:

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

`pnpm verify:collaboration` richiede il DB locale migrato e Mailpit loopback; crea una propria istanza HTTP temporanea e non arresta il server del maintainer. Elimina soltanto workspace/account/email QA della propria esecuzione. La verifica non deve essere usata con SMTP remoto o credenziali di produzione.

Il backend serve le pagine compilate su `http://127.0.0.1:3001/sign-in`; le email non escono dal PC. In sviluppo si può usare `pnpm dev:desktop` al posto dei comandi server/app, lasciando Mailpit nell'altro terminale. Per fermare usare Ctrl+C. Il pacchetto non incorpora né avvia backend, PostgreSQL o Mailpit.

`Invoke-RestMethod http://127.0.0.1:3001/health` mostra `database: connected` solo dopo un probe riuscito; non dimostra che Codex sia collegato. Le sole URL pubbliche vengono incorporate nel renderer/main durante build: cambiando URL nel `.env` occorre ricompilare il pacchetto. Nessuna credenziale del `.env` deve essere incorporata negli artefatti.

## macOS, Linux e limiti

Sul relativo sistema usare installazione/setup DB e auth, poi `pnpm check`, `pnpm test` e `pnpm package:mac` oppure `pnpm package:linux`. Output `release/mac/` e `release/linux/`. Mac DMG arm64/x64, Linux AppImage x64; prerequisiti runtime Electron e ambiente grafico reali. AppImage può richiedere FUSE 2 o `--appimage-extract-and-run`. Non usare `--no-sandbox`.

macOS richiede prova nativa di protocollo e continuità Keychain/firma. Linux richiede keyring sicuro: `basic_text` è rifiutato, senza salvataggio in chiaro. Le configurazioni di packaging e la CI non provano questi comportamenti nativi. Il maintainer proverà il Mac più avanti. Firma/notarizzazione e distribuzione self-host sono T16.

## Verifiche e contributi

Le shell T02 sono già accettate Windows; [reference e confronto](docs/design/t02-review.md). Le pagine account nuove seguono gli stessi token e font; [catture T03](docs/auth.md). UI vuota senza dati reali, nessuna attività o salute inventata.

Eseguire i controlli pertinenti dopo l'integrazione; ripeterli solo per correzioni o dubbi concreti. Non aggiungere test per edit documentali reversibili o ripetere suite per abitudine. La consegna contiene commit, comandi OS, prerequisiti, pochi passi e limiti: implementato, testato, pacchetto generato e accettato dal maintainer restano evidenze distinte.

Un autore per manifest/lockfile, contratti e migrazioni. Versioni esatte nel lockfile; niente aggiornamenti durante una verifica del task. Niente `.env`, auth store, token, output di clienti o build nei commit. Aggiornare stato/piano/changelog con il task; commit coerenti, niente push forzati o migrazioni su produzione implicite.
