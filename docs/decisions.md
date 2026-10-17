# Decisioni progettuali

Stato iniziale al 17 ottobre 2026. Le scelte tecniche qui proposte sono modificabili prima del task che le concretizza, senza riprogettare l'obiettivo di prodotto. Le richieste dell'utente restano vincolanti.

| ID | Stato | Decisione e motivazione |
| --- | --- | --- |
| D01 | Richiesta utente | Desktop Windows/macOS/Linux; le build macOS saranno provate dal maintainer sul Mac più avanti |
| D02 | Richiesta utente | Solo Codex; account personale principale, API opzionale; server ospitato e inviti |
| D03 | Adottata in T01 | Monorepo TypeScript, pnpm, React/Vite per renderer condiviso, Electron per runtime desktop: una lingua e componenti comuni per un singolo maintainer |
| D04 | Fastify T01, PostgreSQL/Drizzle T03; realtime futuro | Pool server Node-only, schema Drizzle e migrazioni SQL esplicite, senza migrazioni all'avvio. REST per snapshot/mutazioni e WebSocket futuro per eventi |
| D05 | Adottata in T03 | Better Auth e plugin Electron 1.7.10 per identità Nexus, email/password verificata e reset; browser di sistema con PKCE, IPC ristretto e storage OS cifrato. Inviti in T04; identità Codex distinta |
| D06 | Adottata in T05 | Codex app-server 0.159.2 ufficiale nativo via stdio, distribuito dal pacchetto npm esatto/lockfile; schema generato immutato, login gestito da Codex, home per account Nexus e keyring OS obbligatorio. Nessuna lettura dell'auth store di altre applicazioni |
| D07 | Proposta operativa | Eventi durevoli in PostgreSQL e outbox transazionale; presenza effimera. Nessun Redis obbligatorio all'inizio: la voce Redis nelle PNG appartiene al progetto illustrativo |
| D08 | Proposta operativa | Accesso web con renderer condiviso e capacità esplicite del dispositivo; nessuna shell nel browser |
| D09 | Proposta operativa | Asset ambientali procedurali SVG/canvas e componenti accessibili; Inter per UI e JetBrains Mono per codice, perché il font originale non è ricavabile dalle PNG |
| D10 | Default scelto per la richiesta open source | Repository pubblico `AndreaZero/nexus-ai`, licenza MIT e documentazione di lavoro in italiano, codice e identificatori in inglese |
| D11 | Richiesta utente | Una tranche attiva, fronti paralleli disgiunti, integrazione unica, controlli mirati e build manuali del maintainer |
| D12 | Proposta operativa | Cliente vede solo proiezioni esplicitamente pubblicate; approvazione deliverable separata dall'esecuzione Codex; solo driver locale controlla il proprio runtime |
| D13 | Preparazione T03 adottata | PostgreSQL locale 18 aggiornato, alternativa 17 aggiornata già installata; database UTF8 e ruolo dedicati `nexus_ai_dev`, host `127.0.0.1:5432`. Il maintainer crea personalmente il DB vuoto; script manuale con password interattiva, nessuna tabella o migrazione all'avvio dell'app |
| D14 | Adottata in T03 | Mailpit loopback per email locali reali, installazione ufficiale con SHA-256 verificato. Secret generato una sola volta nel proprio `.env`; template pubblico senza credenziali. Plugin senza IPC/CSP automatici; adattamento PKCE 1.7.10 isolato e testato, da riesaminare prima di aggiornamenti |
| D15 | Adottata in T04 | Workspace owner/member amministrativi, creazione progetti riservata agli owner workspace; ruoli operativi owner/developer/client/viewer per progetto. Appartenenza ordinaria workspace senza accesso implicito ai progetti. Ultimo owner esplicito protetto con lock transazionali e issuer invito riaccertato all'accettazione |
| D16 | Adottata in T04 | Un endpoint collaborazione con union di operazioni validate e bridge desktop corrispondente, senza URL/header/credenziali arbitrari dal renderer. Binding cartella solo userData per account/progetto/repository/device; repository remoto separato. Invito in fragment/sessionStorage, hash SHA-256 nel DB e SMTP locale esistente |
| D17 | Adottata in T05 | Modalità iniziale readOnly, approvazioni di escalation declinate e metodi non supportati rifiutati. Nessun bypass o fallback API; scrittura e approvazioni interattive in T07. Ogni operazione locale ricontrolla ruolo/binding T04; thread scoped a utente/progetto/repository/cwd canonico |
| D18 | Adottata in T05 | Packaging sul relativo OS e architettura Node nativa x64/arm64, per distribuire Electron e Codex della stessa architettura. Due architetture richiedono due build native. Licenza Apache-2.0 Codex e notices conservati nel pacchetto |
| D19 | Adottata in T07 | ReadOnly default, workspaceWrite esplicito per binding senza network/tmp e senza full access. Solo approvazioni moderne singole, UUID effimero/scadenza, riautorizzazione e consumo prima dell'I/O; negate richieste che implicano consenso permanente o contesti non supportati |
| D20 | Adottata in T07 | Diff locale mediante oggetti Git e letture descriptor bounded, senza filtri repository; apertura VS Code via URI fissa costruita dal main. Preview URL scelta esplicitamente e aperta nel browser di sistema, nessun embed con privilegi o deploy/probe implicito |
| D21 | Adottata in T08 | Outbox metadata PostgreSQL atomica e receipt UUID/hash/offset dopo COMMIT. Snapshot corrente al join/reconnect, letture dei dettagli riautorizzate, retention1.000 eventi; presenza effimera e poll2s su una sola istanza, senza broker obbligatorio |
| D22 | Adottata in T08 | Solo messaggi scelti e loro futuri delta dopo preview/consenso; coda main cifrata e limitata, ripristino sospeso con Retry esplicito. Nessun nuovo messaggio, file, comando o consenso eseguibile accodato; indisponibilità Nexus conserva processo Codex ma interrompe il turno e torna readOnly |
| D23 | Adottata in T09 | Overview come proiezione metadata della finestra outbox T08, coalescente per entità e autorizzata prima di pagine/conteggi. Feed stabile durante lettura ma rimozione immediata dei target revocati. Notifiche altri autori con cursore letto monotono per account/progetto; non un sistema notifiche universale anticipato |
| D24 | Adottata in T09 | CPU/memoria aggregate OS solo opt-in sul dispositivo, nessun upload/persistenza/consenso permanente. Campioni2s/max60, rete unknown; timer senza HTTP e lease10s del consumatore, ruoli/binding ricontrollati. Health/deploy senza dati restano unknown |

| D25 | Adottata in T10 | Pulse è una lettura transazionale dei domini esistenti con preview client restrittiva. Progressi da tutte le task visibili prima dei limiti; summary UTC da record correnti e outbox retained. Outcomes sono estratti completed pubblicati con provenienza, distinti dai deliverable/feedback T11; nessuna nuova tabella o metrica illustrativa |

| D26 | Adottata in T11 | Task/milestone/documenti CAS e ricevute UUID/hash persistenti; pubblicazione update e revisioni deliverable esplicita. Decisione cliente singola sulla revisione corrente Pending, separata da esecuzione Codex; storico immutable e audience corrente sul parent. Allegati scelti max1MiB/5perrevisione/20MiBprogetto nel DB con hash, recupero upload inutilizzati e download main con scelta destinazione; nessuno storage esterno obbligatorio |

## Da concretizzare al momento opportuno

**T06:** bozza/selezione restano cifrate sul dispositivo; il backend persiste solo messaggi scelti con preview e conferma di audience. Nessuna promozione automatica di un thread completo a contenuto cliente. Osservazioni Git locali separate dall'autenticazione/API GitHub T12; condivisione pull separata dal realtime T08. Limiti e prova in [session.md](session.md).

- **T01 implementato:** versioni effettive fissate nel lockfile e riepilogate in `CONTRIBUTING.md`; app ID `io.github.andreazero.nexusai`. Packaging NSIS x64, DMG arm64/x64 e AppImage x64; Windows generato/verificato, altre prove native da registrare.
- **T05 implementato, prova personale pendente:** runtime 0.159.2 e isolamento fissati. Verificare login/keyring/inferenza su Windows e in seguito su Mac/Linux; T07 completa le approvazioni interattive e scritture sullo stesso protocollo.
- **T03/T16:** URL server, servizio email per verifica/reset/inviti e provider PostgreSQL/object storage. Preparare configurazione self-host senza impegnare servizi a pagamento non richiesti.
- **T03 accettato su Windows:** [account e prove](auth.md), login/rientro OS confermati dal maintainer. T04 aggiunge [collaborazione](collaboration.md) sullo stesso DB; prove native Mac/Linux restano distinte.
- **T12/T16:** account GitHub App/OAuth, segreti, domini, firma e notarizzazione delle build richiedono credenziali/configurazioni reali del maintainer quando si arriva al relativo task.

Le dipendenze esterne vengono segnalate per il task interessato senza sospendere il resto dello sviluppo indipendente. T01 è stato avviato al via esplicito del maintainer e consegnato per la sua verifica.
