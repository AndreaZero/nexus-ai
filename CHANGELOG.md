# Changelog

### 2026-10-17 — T09 0.9.1: limite delle verifiche account

- Corretto429 su `/auth/get-session` dopo polling continuo: nella libreria installata il contatore DB si azzera dopo inattività, accumulando letture anche attraverso più minuti. La sola lettura sessione usa ora il gate applicativo bounded a finestre fisse di60s/100 richieste per IP, con Retry-After e recupero non prolungato dai tentativi respinti. Limiti login/reset/verifica email invariati.
- La telemetria legge una copia locale dell'identità, mantenendo la verifica server corrente di sessione/ruolo a ogni richiesta di dominio. Eliminato il controllo HTTP `/auth/get-session` ridondante ogni2s; nessun permesso memorizzato o controllo di revoca disabilitato.
- App/server0.9.1, nessuna nuova migrazione/dipendenza, account e configurazione conservati. Check,186test, build/smoke e regressione con180letture autenticate su6minuti virtuali, burst/recupero/revoca e10controlli auth Electron reali passati. Evidenze e package in `docs/status.md`.

### 2026-10-17 — T09: overview operativa e attività reali

- Overview reference3 collegata a presenza, sessione locale/condivisa, feed filtrabile/paginato con link al dettaglio autorizzato, task in lettura, diff/report/preview locali e notifiche reali. Nuovi eventi applicati esplicitamente mentre si legge; target revocati rimossi subito.
- Proiezione backend da outbox T08 coalescente per entità, audience prima di pagine/conteggi e cursore letto monotono persistente per account/progetto. Migrazione additiva0004; nessun testo provider grezzo nel feed e nessun controllo remoto.
- CPU/memoria OS locali solo opt-in, campioni2s/max60, rete unknown, nessun upload/persistenza; lease10s e reset su account/binding/ruolo. Health/deploy assenti restano sconosciuti.
- Versione0.9.0 app/server/contratti/DB, runtime0.159.2 invariato e nessuna nuova dipendenza. 184 test, 7 scenari PG/HTTP/WS e22controlli UI/IPC passati; check/build/shell/smoke e pacchetto Windows x64 verificati. Account reale conservato, fixture propri rimossi. Guida `docs/overview.md`; prova personale e Mac/Linux distinte, T10 non avviato.

### 2026-10-17 — T08: realtime, presenza e recupero

- WebSocket Nexus autenticato e presenza per progetto, audience/ruoli verificati durante la connessione e revoca su socket aperto. Outbox metadata PostgreSQL atomica, snapshot autorevole e upload idempotenti con ACK dopo COMMIT.
- Share live soltanto per messaggi scelti con preview/consenso e futuri delta degli stessi ID; coda main cifrata/limitata, Stop senza perdere il suffisso già osservato, Retry/discard e recupero senza duplicare testo accettato. Nessun replay di prompt/approvazioni o controllo remoto.
- Presenza/Live Sync reali in header e Team Online, Connection/Live shares in Session Info nello stile reference2/3. Lifecycle Codex conservato durante outage Nexus, turno interrotto/readOnly e nessuna ripartenza automatica.
- Versione0.8.0 per app/server/contratti/DB, migrazione additiva0003 sul DB esistente, ws8.22.0 e Zod4.6.7 desktop; runtime Codex0.159.2 invariato. 160 test, 8 scenari PG/HTTP/WS, 13 controlli UI/IPC, check/build/smoke/shell e pacchetto Windows passati. Account reale conservato e QA rimossi. Guida `docs/realtime.md`; prova personale e macOS/Linux distinte, T09 non avviato.

### 2026-10-17 — T07: diff, output e approvazioni locali

- Confermata dal maintainer la build Windows T06; integrati tre fronti runtime, workspace locale e renderer nella reference 2.
- Diff Git effettivi HEAD/working tree con staged/unstaged/untracked, split/unified, numeri linea e colori; oggetti e descriptor diretti senza hook/filtri del repository. File/volume limitati, esclusioni sensibili e percorsi opachi per apertura VS Code.
- Workspace write solo per consenso locale esplicito e binding corrente. Approvazioni moderne monouso con scadenza, controlli ruolo/account/cartella/turno e consumo prima dell'I/O; diniego di richieste stale, grant di sessione, contesti non supportati e patch non revisionabili.
- Output progressivo, exit code/durata/troncamento e report TAP/Jest riconosciuti; nessun conteggio o coverage dedotto. Preview configurata in memoria e aperta esplicitamente nel browser di sistema. Pause interrompe, Stop arresta il runtime; Share conserva la selezione/preview T06.
- App/root/desktop/web/contratti 0.7.0, server/DB 0.6.0 e bridge 0.5.0 invariati. Nessuna dipendenza o migrazione nuova, nessun cambio a `.env` o account. Check e 124 test passati; prove native/visive e pacchetto registrati in `docs/status.md`. Prova personale Codex e macOS/Linux distinte.

### 2026-10-17 — T06: sessione, contesto e cronologia esplicita

- Aggiunti selezione nativa/anteprima di sorgenti UTF-8, file chip e invio reale al proprio Codex; esclusione file sensibili/binari, limiti e controlli canonical path/descriptor contro traversal e symlink esterni.
- Bozza e selezione locali cifrate per account/progetto/repository/cartella, autosalvataggio 1,5 s, flush focus e stato Saved/Not saved. Un controllo autorizzativo per salvataggio, senza moltiplicare le chiamate account.
- Collegati Git locale osservato, piano/step/token del protocollo e tempo osservato nella sessione/overview; reference 2 preservata, niente progressi o health inventati.
- Share con selezione messaggi, audience e preview prima della conferma. Nuovo dominio server sessioni con cronologia autorizzata, versioni/retry e audit atomico senza contenuto. Migrazione additiva 0002, nessuna importazione chat/credenziali o upload automatico.
- Aggiornati mappa dei dati/pannelli, percorso GitHub T12 e Deploy T13. ReadOnly e approvazioni T07/realtime T08 restano distinti. Versione app/server/contratti/DB 0.6.0, runtime Codex invariato.
- Passati check, 101 test, build, cinque scenari reali PG/SMTP/HTTP, shell e smoke sviluppo/pacchetto Windows 0.6.0. Migrazione applicata, fixture rimossi e account reale conservato; prova personale popolata/inferenza e Mac/Linux restano distinte.

### 2026-10-17 — T05 0.5.1: ripristino account e log server

- Ricevuta conferma del login Codex; segnalati refresh manuali a ogni avvio e account Nexus indisponibile dopo una chat, con backend ancora attivo. T06 rimane fermo.
- Corretti ordine di sottoscrizione/recupero Nexus e risultati obsoleti dopo login/logout. Refresh simultanei accorpati, transizioni duplicate eliminate, scadenza invalida rifiutata e HTTP 429 distinto senza cancellare credenziali.
- Codex si ricollega una volta per account Nexus verificato all'avvio, riusando il proprio keyring; nessun login browser/inferenza automatici, Disconnect rispettato durante navigazione e focus.
- Aggiunto Chalk 6.0.1 al backend: log richieste/esiti/durata/ID/operazioni, categorie errori e codici stabili, startup/shutdown, timeout e connessioni interrotte. Campi ammessi, nessun body/query/cookie/token/SQL o chat nei log.
- Passati check, 73 test, build, smoke Electron e 9 verifiche reali account/PKCE/storage OS, inclusi primo ripristino, 20 controlli concorrenti e recupero da outage/429/scadenza invalida. Account QA rimosso, account reale conservato. Causa specifica del blocco dopo chat ancora da confermare con i nuovi log e prova del maintainer.

### 2026-10-17 — T05: Codex personale e sessioni locali

- Integrati tre fronti multiagente: supervisore Codex typed stdio, servizio desktop isolato e renderer account/sessione nella shell approvata.
- Incluso il runtime ufficiale Codex 0.159.2 nativo nel pacchetto, tipi generati immutati e licenza Apache-2.0/notices. Build per OS e architettura dell'host, senza CLI globale o WSL.
- Collegati login ChatGPT browser/device, annullamento/logout, API key solo esplicita, catalogo/effort reale, messaggi progressivi, interruzione, nuovo thread e ripresa locale.
- Home/keyring dedicati per account Nexus, mapping per cartella canonicalizzata, autorizzazioni T04 ricontrollate e IPC/output limitati. Modalità readOnly e richieste di escalation declinate; scritture/approvazioni interattive in T07, condivisione in T08.
- Versione app 0.5.0; nessun cambiamento DB/server o migrazione. Passati check, 65 test, build, shell, smoke sviluppo/pacchetto e handshake/catalogo anonimi del binario reale. Pacchetto Windows unsigned generato; login/inferenza personali e prove native Mac/Linux da registrare col maintainer.

## Unreleased

### 2026-10-17 — T04: workspace, progetti, membri e inviti

- Ricevuta conferma Windows T03 (login e ritorno browser → app); avviato e integrato T04 con tre agenti e contratti condivisi.
- Implementati workspace/progetti persistenti, selezione per account, impostazioni e roster reali nella shell approvata. Ruoli operativi owner/developer/client/viewer con amministrazione workspace distinta; solo owner workspace crea progetti, nessun progetto aperto dalla sola membership ordinaria.
- Inviti SMTP con token solo hash, durata 72 ore, recipient verificato, revoca/replay, accettazione atomica e controllo dell'issuer attuale. Ultimo owner protetto anche con richieste concorrenti e rimozione dal workspace.
- Repository HTTPS condiviso distinto dalla cartella locale account/dispositivo. Nuovi bridge IPC di dominio validati, cookie solo nel main, selettore nativo e nuova autorizzazione dopo il dialogo; nessuna lettura/upload di file o esecuzione Git/Codex.
- Migrazione additiva applicata/idempotente, audit transazionale e basi vuote task/milestone/sessioni. Verificati 42 test, 12 scenari PostgreSQL/SMTP/HTTP, build e shell Electron; fixture rimossi e account reale conservato. Versione 0.4.0; prova manuale Windows T04 e native Mac/Linux distinte.

### 2026-10-17 — T03: ritorno browser → desktop

- Corretto il reload di `/desktop-auth` dopo **Continue in Nexus AI**: il redirect web interrompeva il timer del callback desktop, lasciando l'app in attesa. Il trasferimento resta ora sulla pagina e usa il proxy ufficiale per aprire Nexus.
- Aggiunto un test con i plugin reali per rilevare navigazioni web premature e verificare callback OS/consumo del cookie. Passati test mirato, lint e build web; rientro OS manuale da riconfermare. Documentati riavvio backend e rinnovo del tentativo scaduto.

### 2026-10-17 — T03: account e persistenza

- Implementati pool PostgreSQL/Drizzle, cinque tabelle auth e migrazioni SQL esplicite/idempotenti, senza creazione automatica di account iniziali.
- Integrati Better Auth 1.7.10, email verificata obbligatoria, SMTP reale, reset monouso e revoca sessioni; CORS/CSRF, rate limit persistiti ed errori sanitizzati.
- Aggiunte pagine account e impostazioni, login desktop nel browser con PKCE, bridge ristretto, storage OS cifrato e ripristino validato col server.
- Predisposti setup locale senza segreti nei log, Mailpit ufficiale verificato SHA-256 e comandi di verifica su DB/SMTP reali. Ripulita la copia accidentale di una credenziale nel template pubblico prima del commit; `.env` privato conservato.
- Passati check, 29 test, prove account/browser/desktop e pacchetto Windows 0.3.0 unsigned con smoke. Corretto il rifiuto CORS degli asset same-origin trovato nel browser. Rimossi gli account QA; accettazione del maintainer e prove Mac/Linux pendenti.

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
