# Dati, API ed eventi

Questo è il contratto progettuale iniziale. T01 crea gli schemi eseguibili in `packages/contracts`; le forme definitive vengono versionate lì e mantenute coerenti con questo documento. I nomi di endpoint sottostanti sono proposti, non servizi esistenti.

## Entità e invarianti

| Entità | Campi/relazioni essenziali | Invariante |
| --- | --- | --- |
| User / auth session | ID Nexus, email verificata, nome, avatar, sessioni revocabili | Credenziali gestite dalla libreria auth, nessun token Codex nel profilo |
| Workspace / membership | owner, membri, ruolo | Un owner residuo; owner esplicito per operazioni amministrative |
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
| `/realtime` | Join/leave progetto, eventi e heartbeat | Sessione Nexus valida e controllo membership per messaggio |

Le mutazioni espongono idempotency key dove possono essere ritentate; aggiornamenti task/documenti usano `version` o `expectedVersion` e ritornano conflitto gestibile. Validare body, query, parametri e payload provider. Gli allegati hanno limiti di tipo/dimensione e percorsi storage scelti dal server.

## Evento condiviso

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

ID e sequenze dell'esempio sono illustrativi. Il server determina `actor`, progetto, visibilità consentita, `receivedAt` e sequenza dal contesto autenticato: non si fida di tali campi forniti dal client. `occurredAt` non determina l'ordine canonico.

Famiglie: `presence.*`, `session.*`, `turn.*`, `message.*`, `approval.*`, `repository.*`, `task.*`, `milestone.*`, `update.*`, `deliverable.*`, `feedback.*`, `deployment.*`, `notification.*`, `membership.*`. Presenza ed heartbeat possono essere effimeri; messaggi, decisioni e mutazioni accettate sono durevoli. Gli eventi normalizzati non sono copie del protocollo Codex.

## Connessione, replay e concorrenza

1. Autenticare HTTP e upgrade WebSocket, validare Origin ed evitare token in query persistenti nei log. Applicare controlli di sessione/revoca durante la connessione.
2. Al join, il server acquisisce un high-watermark coerente e uno snapshot autorizzato, poi consegna gli eventi successivi senza una finestra di perdita fra snapshot e sottoscrizione.
3. Il client conserva il cursore riconosciuto e deduplica per `eventId`. Retry con stesso `sourceEventId` non crea un secondo record. ACK di upload dopo commit, non dopo ricezione in memoria.
4. Dopo reconnect, replay dal cursore; se scaduto, `resync_required` e nuovo snapshot. Il server restituisce il cursore globale di avanzamento anche quando filtra eventi: il client non interpreta gap autorizzati come eventi persi.
5. Revoca/riduzione ruolo: invalidare cache e sottoscrizioni, eliminare la proiezione locale non più accessibile e negare replay/download. Le code pendenti vengono riautorizzate prima del flush.
6. Timeout, limiti coda, backoff con jitter e annullamento visibile. Niente retry illimitati di un errore permanente, di un comando shell o di un'approvazione.

## Stato sessione e controllo locale

Stati applicativi: `created → starting → ready → running → completed`; transizioni aggiuntive `waiting_approval`, `interrupted`, `failed`, `disconnected`. Uno stesso thread può contenere più turni: completare un turno non chiude tutta la sessione. La connettività Nexus è uno stato separato dal runtime Codex. Se il server è offline, un lavoro locale può continuare ma la UI deve dichiarare che non è condiviso live.

Il controllo accetta solo driver e dispositivo associati, sessione e turno correnti, capability presenti e policy locale. Solo il driver invia input a Codex, interrompe un turno o risponde a una richiesta di esecuzione. Gli altri membri aggiungono commenti/proposte autorizzate. Una risposta a un'approvazione scaduta, già risolta o di un altro turno è rifiutata. Non accodare decisioni per eseguirle automaticamente in futuro.

## Visibilità e dati sensibili

`private` resta sul dispositivo; `team` è condiviso con sviluppatori autorizzati; `client` è la proiezione esplicitamente pubblicata per clienti/viewer assegnati. Il server non trasforma un blob interno in client solo cambiandone il flag: costruisce un payload consentito. Non inviare prima un evento grezzo pensando di ripulirlo nel renderer.

Prima dell'upload escludere auth store, env, chiavi, path home e output riconosciuto come sensibile; l'utente sceglie contesto e livello di condivisione. Il filtraggio automatico non garantisce la rimozione di ogni segreto: servono selezione esplicita dei dati, preview di pubblicazione e policy per progetto. Log operativi usano ID e stati, non token, prompt e dump dei processi. Markdown, link, allegati e output terminale sono input non affidabili e non acquisiscono privilegi tramite rendering.
