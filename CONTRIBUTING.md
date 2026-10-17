# Lavorare su Nexus AI

Il maintainer sviluppa con agenti e verifica personalmente le build. I contributi esterni usano gli stessi contratti e standard, senza richiedere una struttura da grande team.

Leggere [AGENTS.md](AGENTS.md), [piano](docs/plan.md) e [stato](docs/status.md). Un task corrente, un risultato concreto, percorsi assegnati senza sovrapposizioni. Il coordinatore integra cambiamenti e dipendenze condivise. Il task successivo segue la consegna e il feedback del maintainer.

## Setup

Prerequisiti: **Node.js 22.19+ della serie 22 oppure Node 24**, **pnpm 10.32.1** e Git. La versione usata qui è Node 22.19.0 x64 su Windows; `.node-version` permette di riprodurla. Prima di aggiornare versioni major, verificare compatibilità di lint, TypeScript, Vite ed Electron. [Requisiti Vite](https://vite.dev/guide/).

Se pnpm manca: `npm install --global pnpm@10.32.1`. Dalla root del repository eseguire `pnpm install --frozen-lockfile`. La prima installazione/il primo avvio possono scaricare runtime e strumenti ufficiali Electron; nessuna chiave API o database è richiesta in T01/T02. Il maintainer creerà PostgreSQL quando T03 introdurrà la persistenza. Il warning di pnpm su `electron-winstaller` riguarda un tool Squirrel transitivo non utilizzato: il packaging Windows scelto è NSIS; non abilitare indiscriminatamente script di dipendenze.

| Comando | Scopo |
| --- | --- |
| `pnpm install --frozen-lockfile` | Installazione riproducibile dopo il primo lockfile |
| `pnpm dev:desktop` | Compila librerie, avvia server, Vite e desktop; Ctrl+C arresta i processi del comando |
| `pnpm dev:web` | Server locale e stesso renderer nel browser su `http://127.0.0.1:5173` |
| `pnpm dev:server` | Solo server locale in watch |
| `pnpm check` | Compila librerie, typecheck, lint e confini renderer/Node |
| `pnpm test` | Test mirati di origine/path/IPC, configurazione, health/CORS e confini import |
| `pnpm build` | Compilazione workspace |
| `pnpm start:desktop` | Avvia il renderer compilato; richiede `pnpm build` |
| `pnpm smoke:desktop` | Verifica nascosta del renderer compilato e bridge, senza mostrare finestre; richiede build |
| `pnpm verify:shell` | Catture Electron reali delle tre viste, focus ricerca, preferenza movimento ridotto e viewport 960 px; richiede build |
| `pnpm start:server` | Avvia il server compilato e carica `.env` dalla root |
| `pnpm package:win` | Compila workspace e produce installer NSIS x64 su Windows |
| `pnpm package:mac` | Compila e produce DMG arm64/x64 sul Mac |
| `pnpm package:linux` | Compila e produce AppImage x64 su Linux |

Gli script root usano Node e argomenti di processo separati, senza richiedere bash/PowerShell nei manifest. Per test di un solo dominio: `pnpm --filter @nexus-ai/server test` oppure `pnpm --filter @nexus-ai/desktop test`, dopo la build delle librerie. Se si cambiano librerie condivise durante dev, riavviare il comando dev per ricompilarle; Vite/tsx aggiornano renderer e server, main/preload richiedono riavvio desktop.

Il comando di packaging richiede il sistema operativo di destinazione. Le icone native sono incluse da T02; firma/notarizzazione vengono trattate nei task successivi. I pacchetti attuali sono unsigned. L'installer non include né avvia il backend condiviso. `verify:shell` usa il renderer compilato della stessa app senza dati fittizi; salva PNG/report in `.nexus/visual/t02/`, imposta device scale 1 solo per la verifica e ripristina la preferenza movimento dell'utente.

## Build e verifica Windows

Da PowerShell nella root del clone:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm package:win
```

`package:win` include `pnpm build`. Gli artefatti vanno in `release/win/`; l'installer T02 è `Nexus-AI-0.2.0-win-x64.exe`, il programma senza installer è `release/win/win-unpacked/Nexus AI.exe`. Non sono artefatti firmati: l'installazione manuale resta una verifica del maintainer, distinta dalla generazione del pacchetto.

Per provare rapidamente la build compilata: `pnpm start:desktop`. Per usare il ciclo di sviluppo completo: `pnpm dev:desktop`. Non avviare contemporaneamente più comandi dev sulle porte 5173/3001.

Controllare T02 (T01 è già stato confermato funzionante dal maintainer):

1. Confrontare **Overview** con `examples/design/3.png`, **Client Portal / Client & Team Pulse** con `1.png` e **Live Sessions** con `2.png`, idealmente su area contenuto 1586 × 992. Sidebar, pianeta, griglie, font e glow devono mantenere le proporzioni; i contenuti di progetto sono vuoti, senza dati inventati. [Catture e limiti](docs/design/t02-review.md).
2. Provare sidebar, tab della sessione e **Ctrl K**: il dialogo permette di cercare pagine, selezionarle con Tab/Invio e chiudere con Esc. La ricerca nei dati arriverà in T14. La campanella apre il centro notifiche vuoto.
3. Osservare pianeta, orbite e particelle di Pulse, poi attivare **Reduce ambient motion** nelle impostazioni o dall'icona waveform nell'header. La scena deve rimanere completa e statica; chiudere e riaprire per verificare la preferenza. La preferenza di sistema ha precedenza.
4. Ridimensionare a circa 960 px: la sidebar diventa rail compatto; la sessione offre tab **Conversation / Context / Code**. Non deve esserci scroll orizzontale dell'intera pagina. Lo scroll verticale conserva tutti i blocchi.
5. In **Settings** verificare versione desktop **0.2.0**, piattaforma/architettura reali e stato HTTP. Codex/database restano non collegati/non configurati. Comandi senza capacità reale sono disabilitati con una motivazione; non richiedono ancora login o PostgreSQL.

La build produzione senza configurazione mostra **Server non configurato**. Per verificare la connessione anche nella build/installer, prima della build copiare `.env.example` in `.env` (senza sovrascrivere un file proprio) e lasciare `VITE_NEXUS_SERVER_URL=http://127.0.0.1:3001`; poi ricompilare. Avviare `pnpm start:server` in un secondo terminale. Modificare `.env` dopo il packaging non cambia l'endpoint già incorporato.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm package:win
# In un secondo terminale, dalla stessa root:
pnpm start:server
```

`Invoke-RestMethod http://127.0.0.1:3001/health` deve restituire `service: nexus-server`, `status: ok`, `database: not_configured` e `codex: local_only`. È liveness HTTP, non una verifica di servizi ancora assenti. URL remoti del renderer richiedono HTTPS; HTTP è ammesso solo per loopback. Nessun segreto deve avere prefisso `VITE_`, perché questi valori sono pubblici nel bundle.

## macOS, Linux e configurazione

Sul relativo sistema: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, quindi `pnpm package:mac` o `pnpm package:linux`. macOS richiede gli strumenti nativi Apple per packaging ed eventuale firma; il maintainer eseguirà la prova sul proprio Mac. Su Linux il sistema deve offrire una sessione grafica e le librerie runtime Electron; l'esecuzione AppImage può richiedere FUSE 2 o l'opzione standard `--appimage-extract-and-run`. Registrare distribuzione/architettura provate. Non usare `--no-sandbox` per aggirare problemi del sistema.

Output previsti `release/mac/` e `release/linux/`. Le configurazioni sono presenti, ma non costituiscono una prova nativa su macOS/Linux. La CI di base esegue check/test/build sui tre runner; i risultati effettivi vanno letti nelle run GitHub, senza dedurre successo dalla sola presenza del workflow.

Variabili in `.env.example`: host/porta/origini/log del server, URL pubblico renderer e URL PostgreSQL opzionale. `.env` è caricato dagli orchestratori root; Vite lo legge dalla root durante build/dev. Non serve creare `.env` per il percorso default di sviluppo. In T01 un `DATABASE_URL` valido cambia lo stato solo in `not_connected`: nessuna connessione o migrazione è ancora introdotta.

Versioni fissate nel lockfile: pnpm 10.32.1, TypeScript 5.9.3, Electron 44.9.0, electron-builder 26.15.3, React 19.3.1, Vite 8.3.4, Fastify 5.12.7, Zod 4.6.7. TypeScript è mantenuto nella serie supportata dal lint adottato, anziché aggiornato automaticamente alla major più nuova. Usare il lockfile, non aggiornare dipendenze durante una prova del task.

## Verifica e build del maintainer

Per il task corrente l'agente esegue controlli statici/di dominio appropriati al cambiamento e li riassume. Non serve ripetere build complete a ogni edit o introdurre test su cambiamenti documentali reversibili. Un nuovo controllo deve risolvere un dubbio concreto.

La consegna al maintainer contiene: commit/task, prerequisiti nuovi, comando build corretto per il suo OS, tre-cinque azioni da provare, risultato atteso e limiti noti. Il maintainer restituisce esito e problemi; registrarli in `docs/status.md`, mantenendo distinta implementazione da accettazione manuale. La prova Mac avverrà sul Mac più avanti; non blocca i task indipendenti ma resta necessaria per dichiarare supporto verificato.

Quando si tocca UI, confrontare la reference pertinente a 1586 × 992 e annotare le differenze materiali. I dataset di verifica, se necessari, sono isolati e non compaiono nell'avvio normale del prodotto. I controlli su ruoli, replay o approvazioni verificano comportamenti osservabili, non stringhe dell'implementazione.

## Commit e documenti

Un commit coerente per un risultato circoscritto, con riferimento Txx nel messaggio quando utile. Aggiornare piano/stato/changelog senza creare diari ridondanti. Annotare una decisione solo quando cambia un requisito, un confine o una scelta durevole. Una PR può essere utile per una modifica ampia; non è un passaggio burocratico obbligatorio per ogni piccola modifica del singolo maintainer.

Non includere `.env`, token, auth store, output reali di clienti, cartelle locali o build generate. Gli screenshot pubblicati come esempi usano contenuto autorizzato. Non eseguire migrazioni di produzione o pubblicazioni di release come effetto collaterale di un check locale.
