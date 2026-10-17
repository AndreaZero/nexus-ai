# Changelog

## Unreleased

### 2026-10-17 — T03: ripresa preparazione PostgreSQL

- Aggiunto completamento manuale dei permessi dopo password amministrativa errata alla riconnessione finale: connessione diretta al DB, verifiche preventive e transazione, senza ricreare oggetti o modificare password.
- Server locale raggiungibile dalla verifica dell'agente; ispezione autenticata non eseguita perché nessuna password è disponibile ai comandi. Stato finale da verificare con il login manuale del maintainer.

### 2026-10-17 — T03: preparazione PostgreSQL e contratto auth

- Ricevuta accettazione Windows T02: build funzionante e UI approvata. Chiusa issue #2 e avviata issue #3 con multiagenti.
- Preparati guida PostgreSQL locale e script psql manuale per ruolo/database UTF8 dedicati, password interattiva e verifiche in sola lettura. Il maintainer crea personalmente il database.
- Definito il contratto per Better Auth, Drizzle/PostgreSQL, accesso browser/desktop e verifica/reset email; nessuna implementazione account/pool o migrazione introdotta in questa preparazione.
- Aggiornati esempio `DATABASE_URL`, piano, stato e prerequisiti. Rilevato il solo client psql 18.1 installato, senza connettersi al server né modificarlo.

### 2026-10-17 — T02: sistema visivo e shell

- Integrati con tre agenti token, componenti, logo e icone originali, font locali Inter/JetBrains Mono con licenze OFL e icone native Windows/macOS/Linux.
- Costruite le shell Overview, Client & Team Pulse e AI Session nelle proporzioni delle reference, con stati vuoti reali e comandi futuri disabilitati con motivazione.
- Aggiunti pianeta/orbite, superficie di particelle, wave e mappa schematica; pausa fuori viewport/in background e movimento ridotto di sistema o persistito nelle impostazioni.
- Collegate sidebar, tab, rotte, dialogo di navigazione Ctrl/⌘ K, notifiche e impostazioni con diagnostica desktop/server.
- Verificati typecheck/lint/confini, 16 test, build e renderer Electron a 1586 × 992; catture delle tre viste, focus ricerca, preferenza movimento ridotto e layout 960 px. Pacchetto Windows 0.2.0 unsigned; prove native Mac/Linux e accettazione visiva del maintainer separate.
- Ricevuta conferma del maintainer: T01 Windows funziona. T02 non richiede PostgreSQL; creazione locale a cura del maintainer al task di persistenza T03.

### 2026-10-17 — T01: base multipiattaforma

- Creato workspace pnpm/TypeScript strict con desktop Electron, renderer React/Vite condiviso e server Fastify.
- Introdotti contratti validati per bridge desktop e liveness HTTP, confini Node per DB/Codex e controllo degli import nel renderer.
- Implementati main/preload isolati, protocollo locale sicuro, gestione origini/IPC e stato iniziale privo di dati simulati.
- Fissate dipendenze/lockfile e aggiunti script dev/build/check/test, packaging nativo NSIS/DMG/AppImage e CI sui tre OS.
- Verificati check, 16 test, build, avvio Vite/Electron e pacchetto Windows x64; installer unsigned prodotto e smoke dell'eseguibile impacchettato passato.
- Documentati comandi Windows, configurazione opzionale server e verifiche manuali. T01 in attesa dell'esito del maintainer; macOS/Linux non ancora provati nativamente.

### 2026-10-17 — T00: preparazione

- Raccolti requisiti dalla conversazione e chiarimento desktop Windows/macOS/Linux.
- Definiti architettura, confini Codex locale/server condiviso, dati/eventi e piano T00–T16.
- Documentate le tre reference con layout, palette/token, componenti, particelle, grafici e movimento inferito.
- Aggiunti regole agenti, skill di coordinamento, contributi e tracciamento delle build per piattaforma.
- Creata la repository pubblica MIT `AndreaZero/nexus-ai` e aperta l'issue #1 per T01, ancora da avviare.
- Validati skill, collegamenti documentali, YAML, integrità reference e whitespace. Nessun codice applicativo o build ancora prodotto.
