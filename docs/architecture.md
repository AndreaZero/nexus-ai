# Architettura

## Struttura del sistema

La base T01 è un monorepo TypeScript con backend Fastify e renderer React condiviso. Il desktop Electron aggiunge il confine locale isolato. Nei task successivi il server conserverà e distribuirà il lavoro condiviso e il browser servirà collaborazione e osservazione. Windows, macOS e Linux sono target desktop fin dalla prima configurazione.

```mermaid
flowchart LR
  subgraph Machine[Computer dello sviluppatore]
    Desktop[Desktop Electron]
    Runtime[Runtime locale e bridge Codex]
    Codex[Codex app-server]
    Files[Repository e file locali]
    Desktop --> Runtime
    Runtime --> Codex
    Runtime --> Files
    Codex --> Files
  end
  Codex --> OpenAI[OpenAI con account personale]
  Desktop <-->|HTTPS e WSS in uscita| Server[Server Nexus]
  Web[Web e altri desktop autorizzati] <-->|HTTPS e WSS| Server
  Server --> DB[(PostgreSQL)]
  Server --> Assets[Storage allegati e deliverable]
  Server --> GitHub[GitHub e webhook]
```

Il server riceve contenuti selezionati per il progetto e applica la visibilità prima di inoltrarli. Non viene promessa cifratura end-to-end: il server deve poter elaborare i dati condivisi. Il filesystem del computer e le credenziali Codex restano locali. Nessuna porta del computer viene pubblicata per la collaborazione; l'eventuale callback di login è solo locale e temporanea.

## Stack proposto

| Area | Scelta | Motivazione |
| --- | --- | --- |
| Workspace | pnpm, TypeScript strict | Dipendenze e contratti condivisi, manutenzione da singolo sviluppatore |
| UI | React, Vite, CSS tokens, primitive accessibili | Fedeltà grafica senza un tema preconfezionato che imponga layout diversi |
| Desktop | Electron, preload ristretto, packaging nativo | Processi Codex/Git locali e UI comune sui tre OS |
| Backend | Node.js e Fastify | API e WebSocket nello stesso servizio modulare |
| Persistenza | PostgreSQL, Drizzle e migrazioni SQL; auth operativo da T03 | Pool server Node-only e migrazioni esplicite. Tenant/eventi nei task successivi |
| Identità Nexus | Better Auth 1.7.10, plugin Electron ufficiale | Account verificati, sessioni/revoca e SMTP; browser desktop con PKCE e storage OS cifrato, implementati in T03 |
| Realtime | WebSocket autenticato, outbox PostgreSQL | Eventi durevoli e presenza senza un broker obbligatorio |
| Codice e diff | Monaco caricato su richiesta; output terminale isolato | Confronto dei cambiamenti con linee, tab e output come reference 2 |
| Grafici ed effetti | SVG per dati piccoli; canvas per particelle ambientali | Controllo di wave, pianeta e glow senza un motore 3D pesante obbligatorio |
| Verifica | Typecheck/lint, test mirati, confronto visuale e build del maintainer | Confidenza proporzionata al cambiamento |

Nessun numero di versione è un vincolo prima di T01. T01 registra versioni effettive nel manifest/lockfile e una matrice compatibilità. Nessun servizio presente nei mockup, come Redis, email o database del gestionale illustrato, diventa automaticamente un requisito infrastrutturale di Nexus.

## Struttura prevista al termine dello sviluppo

```text
apps/
  desktop/                 # Electron main, preload, packaging e runtime locale
  web/                     # Renderer comune, rotte e feature di prodotto
  server/                  # API, auth, domini, realtime, webhook e job
packages/
  contracts/               # Schemi pubblici, DTO, eventi, comandi, capability
  ui/                      # Token applicativi, componenti, grafici ed effetti
  codex-bridge/            # Client app-server, schema generato, normalizzazione
  db/                      # Schema, query autorizzate e migrazioni
docs/
examples/design/
.agents/skills/nexus-coordination/
```

Queste directory esistono dalla base T01: entrypoint desktop/web/server e confini per contratti, UI, DB e Codex. Da T03 sono operativi identità Nexus, persistenza auth e accesso browser/desktop; i domini di progetto successivi restano pianificati. Le feature di `apps/web` saranno organizzate per progetti, sessioni, task, attività, cliente, repository e impostazioni, con componenti e query del dominio vicini. `packages/ui` non importa il database o il runtime. `packages/contracts` non importa Electron, Fastify o il filesystem. `codex-bridge` e `db` hanno export solo Node e non entrano nel bundle web; il controllo automatico verifica gli import di renderer/UI/contratti.

## Confini del desktop

- `main`: lifecycle runtime, selezione cartella, Git, processi locali e segreti Nexus protetti dal sistema operativo. Path mediante API native, processi con argomenti separati e senza composizione di comandi shell da input remoto.
- `preload`: metodi espliciti e validati, con verifica del mittente IPC. Nessun `exec`, `readFile` generico o accesso indiscriminato a `ipcRenderer` esposto alla pagina.
- `renderer`: stesso prodotto del web; sceglie le azioni da capability reali come `canRunLocalSession` e `canOpenLocalEditor`. Renderer isolato, sandbox, `nodeIntegration: false`, `contextIsolation: true` e CSP.
- Navigazioni esterne e deep link sono validati; preview esterne non ereditano il preload o i privilegi della finestra Nexus. Nessun `webview` privilegiato per una pagina deploy.
- Il processo Codex è supervisionato: avvio, stop, crash, ripresa, limiti buffer e shutdown senza processi orfani. Il percorso eseguibile e la sua versione sono verificati.

## Condivisione e consistenza

Ogni mutazione di dominio salva il risultato e un evento nella stessa transazione. L'outbox inoltra eventi autorizzati; i client applicano eventi per ID e cursore. Le proiezioni per overview e pulse derivano dagli stessi domini, evitando conteggi incompatibili tra schermate. La presenza scade tramite heartbeat e non è una misura durevole di lavoro.

Gli stream di testo vengono raccolti localmente, filtrati e trasmessi in batch brevi con offset stabili. Il server conferma solo batch persistiti. Una coda locale limitata può ritrasmettere eventi già autorizzati senza dupliche; non riproduce comandi, approvazioni o azioni eseguibili dopo una riconnessione. Gli eventi non ancora accettati devono essere visibili come non sincronizzati.

Ogni modifica a membership/visibilità invalida sottoscrizioni e cache. Il replay applica i permessi correnti, non quelli della data di creazione dell'evento. Il dettaglio del protocollo è in `contracts.md`.

## Piattaforme, distribuzione e hosting

| Piattaforma | Percorso previsto | Verifica |
| --- | --- | --- |
| Windows | Installer x64, runtime e percorsi Windows | Build e prova del maintainer su questa macchina |
| macOS | Artefatti arm64/x64 in base al Mac disponibile; identità bundle stabile | Build nativa dal Mac del maintainer più avanti; firma/notarizzazione quando configurate |
| Linux | AppImage x64 e istruzioni dipendenze desktop | Build su Linux/runner appropriato; prova manuale prima di dichiararlo verificato |

Usare directory dati OS, selettori cartella nativi, keychain disponibile e apertura editor con adapter per OS. Se lo storage sicuro non è disponibile, mostrare l'errore e richiedere una modalità esplicita: nessun salvataggio silenzioso in chiaro. Non dichiarare supporto verificato solo perché compila il TypeScript.

Il backend deve essere distribuibile come immagine/container con PostgreSQL, migrazioni controllate, storage allegati configurabile, email e URL pubblici HTTPS/WSS. Un singolo processo è sufficiente inizialmente; il broadcast deve dichiarare questo limite. Prima di più repliche introdurre fanout condiviso e rate limit coerenti, senza perdere l'outbox durevole. Non è autorizzato ora alcun acquisto o deploy a pagamento.

Backup/restore del DB, retention, log privi di contenuti sensibili e endpoint di health operativa fanno parte di T16. Le metriche dell'ambiente del progetto e quelle del server Nexus sono domini distinti.
