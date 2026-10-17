# Dati, API ed eventi

**T06 implementato:** `DesktopBridge.context.request` get/pickFiles/removeFile/readFile/saveDraft per contesto locale autorizzato e cifrato, IDs file opachi; `DesktopBridge.sessions.request` e `POST /api/sessions` list/read/listProjectTasks/publish per soli estratti confermati. Schemi in `context.ts`/`sessions.ts`, limiti 8 file/64 KiB ciascuno/256 KiB totali e 20 messaggi/128 Ki caratteri complessivi. `CodexRequest.send.attachmentIds` seleziona solo file del binding corrente; `CodexSession` include piano/usage/start osservati. Dettagli in [session.md](session.md). Nessun upload automatico di thread/file/tool.

T01 implementa la base; T03 aggiunge identità e `DesktopBridge.auth` ristretto. T04 implementa workspace/progetti/membership/inviti/repository con `POST /api/collaboration`, union validata di operazioni di dominio; `DesktopBridge.collaboration.request` mantiene il cookie nel main. `DesktopBridge.localBinding.request` accetta soltanto get/select/remove e ID progetto/repository, con autorizzazione server e selettore cartella nativo. Schemi autorevoli in `packages/contracts/src/collaboration.ts`, policy/trasporto in [collaboration.md](collaboration.md). Non esiste fetch/exec/file API generica nel bridge.

`GET /health` descrive liveness e probe DB reale (`not_configured`, `not_connected`, `connected`, `unavailable`), senza affermare presenza Codex. `/auth/*` è operativo tramite Better Auth; `/auth/status` espone due flag e `/auth/me` solo profilo sanitizzato e scadenza. Schema/account in [auth.md](auth.md). Le rotte REST per risorsa elencate sotto restano progettuali; le operazioni T11 e il download sono disponibili attraverso il dominio work descritto sotto. Le route operative per collaborazione, sessioni e realtime sono descritte nei paragrafi dedicati.

## Contratti lavoro T11

`POST /api/work` e `DesktopBridge.work.request` espongono list/read, CRUD task/milestone/documenti, pubblicazione update/revisioni deliverable, commenti/feedback/decisioni e upload/read/delete/listAttachments. Schemi strict WorkItem/Request/Response in work.ts; body completi solo dettaglio, pagine max100. CAS expectedVersion e receipt UUID/hash atomiche con evento sotto lock workspace→project. `work.download` accetta ID/audience e apre Save dialog nel main; nessun path/URL/credenziale arbitrario. File max1MiB/5perrevision/20MiBproject, storeDB e hash. Client decide una sola revisione corrente Pending; viewer non scrive. Audience corrente protegge anche parent/storico/allegati. Migrazione0005 additiva; [semantica completa](work.md). Work.changed è invalidazione WS tramite snapshot senza ID privati; feed metadata tasks/documents/comments proiettati dal target corrente, senza body.

## Contratti Pulse T10

`DesktopBridge.pulse.request` e `POST /api/pulse` espongono snapshot(projectId,view auto|client,scope project|mine,filter,before,limit). Schema strict in `pulse.ts`: audience effettiva, overview autorizzata, milestone max100 e totale esatto, progresso globale visible_tasks, summary UTC con task aggiornate/entità condivise retained, outcomes max20 estratti completed pubblicati. Client/viewer sempre client; preview tecnica client restrittiva anche su overview/feed/tooltip. Nessun testo, path locale o metrica non collegata aggiunti al DTO. Singola transazione/lock workspace→project; niente nuova migrazione. Semantica, limiti e prova in [pulse.md](pulse.md).

## Contratti overview T09

`DesktopBridge.overview.request` e `POST /api/overview` accettano snapshot(projectId,filter,before,limit) e markRead(projectId,through), schema strict in `overview.ts`. Feed metadata coalescente per entità, pagine fino a50, notifiche ultimi30 degli altri autori, conteggi e audience correnti. `authorizedTargets` comprende i target della finestra recente autorizzata: il renderer rimuove subito quelli revocati anche dalle righe lasciate ferme durante lettura. Cursore letto monotono in `overview_read_cursor`, futuro rifiutato; invalidazione tramite WS T08.

`DesktopBridge.telemetry.request` accetta getState/setEnabled con progetto/repository. Solo ruolo tecnico e binding canonico corrente, default off, campioni CPU/memoria OS locali ogni2s fino a60, rete null. Nessun evento push, upload o persistenza del consenso; lease10s senza consumatore ferma/azzera. Tipo/limiti e flussi in [overview.md](overview.md).

## Contratti realtime T08

`DesktopBridge.realtime.request` accetta getState/connect/disconnect/retry/discardPending/readShare/startSharing/stopSharing; `onStateChanged` consegna soltanto il DTO validato. `RealtimeState` distingue connection, cursor, snapshot autorizzato, presence, pending, sharing e lastSyncedAt. Nessun URL/path/cookie/socket arbitrario dal renderer.

`POST /api/realtime` espone snapshot/readShare/upload; WebSocket `/api/realtime` usa join/heartbeat/ack e restituisce snapshot/events/presence/heartbeat/denied. Schemi strict in `packages/contracts/src/realtime.ts`, comportamenti e limiti in [realtime.md](realtime.md). Cookie nel main o HttpOnly browser, Origin verificata, nessuna credenziale in query. La coda cifrata invia soltanto start/append/stop dei messaggi scelti, max20/128Ki caratteri, append16Ki. Batch UUID/hash/offset e receipt dopo COMMIT garantiscono retry idempotente; il cursore è una stringa decimale per progetto.

Gli eventi durevoli T08 sono `session.changed` e `live.changed`: eventId UUID, projectId, sequence, entityId, occurredAt, senza testo/driver path/raw protocol. I dettagli passano da una lettura riautorizzata. Presence è effimera e aggregata per account; non è attività produttiva. Revoca o ruolo ridotto invalidano la proiezione anche su socket aperto. Coda mai usata per prompt, comandi o approvazioni; nessun controllo remoto.

## Contratti locali T07

`DesktopBridge.workspace.request` ammette `getChanges`, `openEditor(fileId|null)`, `setPreview(url|null)` e `openPreview` con soli ID progetto/repository. UUID file temporanei della snapshot autorizzata, nessun path o argv dal renderer. `WorkspaceSnapshot` contiene path relativi, diff/conteggi limitati, timestamp e URL configurato; non viene caricato al server.

`CodexRequest.setPolicy` seleziona readOnly/workspaceWrite per il binding corrente. `resolveApproval` accetta UUID opaco e decisione acceptOnce/decline; nessun RPC ID, policy amendment o autorizzazione permanente. `CodexSession` aggiunge approvals (max 20), diff (256 Ki caratteri), fileChanges (50 × 64 Ki), testReports (50); attività con exitCode/durationMs/outputTruncated. I servizi applicano ulteriori budget aggregati prima dell'IPC. I tipi/schema effettivi sono `packages/contracts/src/{codex,workspace}.ts`.

## Entità e invarianti

| Entità | Campi/relazioni essenziali | Invariante |
| --- | --- | --- |
| User / auth session | ID Nexus, email verificata, nome, avatar, sessioni revocabili | Credenziali gestite dalla libreria auth, nessun token Codex nel profilo |
| Workspace / membership | owner/member amministrativi | Un owner residuo; membership ordinaria non apre progetti |
| Project / membership | workspace, nome, slug, descrizione, membri/ruoli e policy | Ogni query include il perimetro progetto autorizzato |
| Invitation | workspace/progetto, email destinataria, ruolo, token hash, scadenza | Monouso, revocabile, destinatario verificato e ruolo assegnabile dal mittente |
| Repository | progetto, URL remoto, default branch | Il path locale vive in un binding per dispositivo, mai nel record condiviso |
| Device / local binding | utente, installazione, repositoryId, root locale, capability | Root e segreti solo locali; il server riceve label e identificatori opachi |
| AiSession | progetto, driverUserId, deviceId, titolo, stato, visibility | Un solo driver/dispositivo per runtime; niente takeover implicito |
| Turn / Message / Item | sessione, autore, tipo, contenuto e stati | ID stabili; output completo distinguibile dai delta parziali |
| ExecutionApproval | sessione, turn/item, richiesta provider, decisione, scadenza | Solo driver locale; idempotente; non un deliverable approval |
| Task / task comment | progetto, assegnatario, stato, priorità, sessione collegata | Stati `todo`, `in_progress`, `review`, `done`; aggiornamenti concorrenti con versione |
| Milestone | progetto, target, task associati e ordinamento | Progresso calcolato da scope dichiarato, nessuna percentuale presunta |
| ProjectUpdate | progetto, autore, testo, audience, pubblicazione | Bozza interna distinta dal contenuto pubblicato |
| Outcome / Deliverable | sessione/task, allegato o riferimento verificato, audience, versione | Il risultato esiste e ha provenienza; non basta testo AI che ne afferma il successo |
| DeliverableApproval | deliverableVersionId, cliente, decisione, commento, data | Approvazione della versione pubblicata e abilitata per quel cliente |
| Feedback / Notification | oggetto, destinatario, stato lettura | Il link non aggira l'accesso all'oggetto |
| Deployment / health snapshot | URL, provider, commit, stato, source, observedAt | Stato esterno datato; unknown/stale non diventano passing |
| Attachment | progetto, owner, storage key opaca, MIME, dimensione, audience | Accesso verificato anche al download, nessuna URL pubblica permanente implicita |
| ProjectEvent / outbox | ID, progetto, sequence, tipo, payload, stato invio | Sequenza assegnata dal server e ID sorgente univoco per deduplica |

I conteggi sui client arrivano da proiezioni autorizzate. Tempo, locale e fuso sono preferenze utente; nel protocollo usare timestamp UTC. Errori e stati assenti restano espliciti, non zero per convenienza.

## API per dominio

| Gruppo | Operazioni previste | Accesso |
| --- | --- | --- |
| `/auth/*` | Login, logout, verifica email, reset, sessioni desktop | Libreria auth e flusso browser supportato; rate limit e protezione CSRF/origin |
| `/workspaces`, `/projects` | Creazione, elenco, dettaglio e impostazioni | Membership e ruoli |
| `/projects/:id/members`, `/invitations` | Inviti, accettazione, revoca e rimozione | Owner/amministrazione autorizzata |
| `/projects/:id/sessions` | Creazione, elenco, snapshot condiviso e cronologia | Membri abilitati alla visibilità sessione |
| `/projects/:id/tasks`, `/milestones` | CRUD, assegnazione, commenti | Owner/developer; proiezioni client secondo pubblicazione |
| `/projects/:id/activity`, `/overview`, `/pulse` | Feed paginato e snapshot composti | Filtri applicati prima di conteggi e paginazione |
| `/projects/:id/updates`, `/deliverables`, `/feedback` | Pubblicazione, download, commento e approvazione | Audience e capability di scrittura distinte |
| `/repositories`, `/deployments`, `/health` | Collegamenti, sincronizzazione e dati di ambiente | Progetto e provider autorizzato |
| `/notifications`, `/search` | Notifiche personali e ricerca | Solo oggetti accessibili; niente indici che rivelino progetti estranei |
| `/api/realtime` — operativo T08 | Snapshot/readShare/upload HTTP; join/eventi/heartbeat WebSocket | Sessione Nexus e membership/audience ricontrollate durante la connessione |

Le mutazioni espongono idempotency key dove possono essere ritentate; aggiornamenti task/documenti usano `version` o `expectedVersion` e ritornano conflitto gestibile. Validare body, query, parametri e payload provider. Gli allegati hanno limiti di tipo/dimensione e percorsi storage scelti dal server.

## Evento condiviso progettuale oltre T08

```json
{
  "schemaVersion": 1,
  "eventId": "01J_EVENT_ID",
  "projectId": "project-id",
  "sequence": 42,
  "sourceEventId": "device-id:session-id:local-42",
  "type": "session.item.updated",
  "actor": { "userId": "user-id", "deviceId": "device-id" },
  "sessionId": "session-id",
  "occurredAt": "2026-10-17T10:00:00.000Z",
  "receivedAt": "2026-10-17T10:00:00.120Z",
  "visibility": "team",
  "payload": { "itemId": "item-id", "status": "in_progress" }
}
```

Questo envelope esteso è progettuale, non il frame T08: quello effettivo è lo schema metadata descritto sopra. ID e sequenze dell'esempio sono illustrativi. Il server determina attore, progetto, visibilità consentita e sequenza dal contesto autenticato: non si fida di tali campi forniti dal client. `occurredAt` non determina l'ordine canonico.

Famiglie: `presence.*`, `session.*`, `turn.*`, `message.*`, `approval.*`, `repository.*`, `task.*`, `milestone.*`, `update.*`, `deliverable.*`, `feedback.*`, `deployment.*`, `notification.*`, `membership.*`. Presenza ed heartbeat possono essere effimeri; messaggi, decisioni e mutazioni accettate sono durevoli. Gli eventi normalizzati non sono copie del protocollo Codex.

## Connessione, replay e concorrenza

1. Autenticare HTTP e upgrade WebSocket, validare Origin ed evitare token in query persistenti nei log. Applicare controlli di sessione/revoca durante la connessione.
2. Al join, il server acquisisce un high-watermark coerente e uno snapshot autorizzato, poi consegna gli eventi successivi senza una finestra di perdita fra snapshot e sottoscrizione.
3. Il client conserva il cursore riconosciuto e ignora sequenze duplicate. Retry T08 con stesso batchId/payload non crea un secondo record. ACK di upload dopo commit, non dopo ricezione in memoria; ACK WS limitato al cursore effettivamente consegnato su quel socket.
4. T08 ricostruisce uno snapshot autorevole al join/reconnect e consegna successivamente eventi ordinati. Un cursore scaduto/futuro o eventi nascosti causano snapshot con resync, senza divulgare entità interne; il testo accettato non dipende dalla retention degli eventi metadata.
5. Revoca/riduzione ruolo: invalidare cache e sottoscrizioni, eliminare la proiezione locale non più accessibile e negare replay/download. Le code pendenti vengono riautorizzate prima del flush.
6. Timeout, limiti coda, backoff con jitter e annullamento visibile. Niente retry illimitati di un errore permanente, di un comando shell o di un'approvazione.

## Stato sessione e controllo locale

**Implementazione T05 locale:** contratti Zod `CodexState`, `CodexRequest`, `CodexResponse` in `packages/contracts/src/codex.ts`; `DesktopBridge.codex.request/onStateChanged`. Account, runtime, login e sessione sono stati distinti; nessun RPC/cwd arbitrario o token nel DTO. Modelli dal catalogo, messaggi massimo 200 e attività 100; testo di ogni messaggio massimo 128 Ki caratteri, attività 32 Ki, budget aggregati 512 Ki/256 Ki. IPC coalescente 50 ms, protocollo linea 8 MiB/coda 16 MiB e richieste pendenti limitate. ID repository/progetto validati e autorizzati dal main, mapping thread locale sul cwd canonico. Policy readOnly e interruzione reali; approvazioni interattive T07 e testo scelto live T08. Gli eventi condivisi estesi restano progettuali; il contratto T08 è descritto sopra.

Stati applicativi: `created → starting → ready → running → completed`; transizioni aggiuntive `waiting_approval`, `interrupted`, `failed`, `disconnected`. Uno stesso thread può contenere più turni: completare un turno non chiude tutta la sessione. La connettività Nexus è uno stato separato dal runtime Codex. T08 preserva processo e cronologia durante indisponibilità transitoria Nexus, ma interrompe il turno e nega nuove esecuzioni finché l'autorità non torna verificabile. Nessun replay di prompt o approvazioni al recupero.

Il controllo accetta solo driver e dispositivo associati, sessione e turno correnti, capability presenti e policy locale. Solo il driver invia input a Codex, interrompe un turno o risponde a una richiesta di esecuzione. Gli altri membri aggiungono commenti/proposte autorizzate. Una risposta a un'approvazione scaduta, già risolta o di un altro turno è rifiutata. Non accodare decisioni per eseguirle automaticamente in futuro.

## Visibilità e dati sensibili

`private` resta sul dispositivo; `team` è condiviso con sviluppatori autorizzati; `client` è la proiezione esplicitamente pubblicata per clienti/viewer assegnati. Il server non trasforma un blob interno in client solo cambiandone il flag: costruisce un payload consentito. Non inviare prima un evento grezzo pensando di ripulirlo nel renderer.

Prima dell'upload escludere auth store, env, chiavi, path home e output riconosciuto come sensibile; l'utente sceglie contesto e livello di condivisione. Il filtraggio automatico non garantisce la rimozione di ogni segreto: servono selezione esplicita dei dati, preview di pubblicazione e policy per progetto. Log operativi usano ID e stati, non token, prompt e dump dei processi. Markdown, link, allegati e output terminale sono input non affidabili e non acquisiscono privilegi tramite rendering.
