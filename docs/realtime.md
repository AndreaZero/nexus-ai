# Realtime, presenza e recupero — T08

T08 collega desktop e osservatori web allo stesso progetto con presenza reale e testo condiviso esplicitamente. La sessione Codex resta sulla macchina del driver; né presenza né condivisione concedono controllo remoto. Runtime e approvazioni T07 rimangono locali. Da T09 questi dati alimentano anche l'[overview operativa](overview.md); GitHub T12 e deploy T13 seguono il piano.

## Flusso nell'app

In **AI Session → Share** si sceglie fra un estratto completo pubblicato una volta e **Share selected messages live**. La seconda scelta parte senza messaggi selezionati: scegliere gli elementi, titolo e audience, aprire **Review selected messages**, controllare il testo e confermare il consenso agli aggiornamenti futuri degli stessi messaggi. Nuovi messaggi, allegati, file, diff, output strumenti e approvazioni non vengono aggiunti automaticamente. Il testo selezionato può contenere informazioni private: la preview serve a revisionarlo, non garantisce redazione automatica.

**Session Info** contiene stato di connessione, presenza, ultimo sync, conteggio degli upload pendenti, retry, stop e cancellazione locale dei pendenti. **Live shared sessions** elenca le condivisioni accessibili e apre il testo in sola lettura. La cronologia degli estratti T06 si aggiorna dallo stesso stream di metadati. Header/Team Online usano membri effettivamente connessi, con connessioni multiple raggruppate per account. Essere online non misura produttività né dimostra che Codex stia eseguendo un turno.

L'audience **team** è riservata a owner/developer; **client** include client/viewer assegnati. Un normale membro workspace non acquisisce automaticamente accesso al progetto. Stop interrompe i nuovi upload; il testo già accettato rimane leggibile. Eliminare i pendenti elimina la copia da inviare sul dispositivo e non cancella quanto già accettato dal server.

## Trasporto e persistenza

Gli schemi autorevoli sono in `packages/contracts/src/realtime.ts`. `POST /api/realtime` accetta `snapshot`, `readShare` e `upload`; WebSocket sullo stesso percorso accetta `join`, `heartbeat` e `ack`, con frame `snapshot`, `events`, `presence`, `heartbeat`, `denied`. URL fissa, cookie di sessione, nessun token in query o subprotocollo. Nel desktop il socket e il cookie restano nel main; il renderer usa soltanto `DesktopBridge.realtime.request/onStateChanged`. Il browser usa il proprio cookie HttpOnly. CSP limita connect-src agli endpoint configurati HTTP/WS; nessun wildcard aggiunto.

La migrazione additiva **0003_realtime.sql** introduce:

| Tabella | Funzione |
| --- | --- |
| `project_realtime_cursor` | Sequenza canonica crescente per progetto |
| `realtime_event` | Outbox metadata atomica con la mutazione; ultimi 1.000 eventi per progetto |
| `live_share` | Titolo, audience, autore/dispositivo e testo esplicitamente selezionato |
| `realtime_upload` | Receipt per batch UUID e hash del payload, con cursore del commit |

Start/append/stop e pubblicazione di estratti generano eventi nella stessa transazione dei dati. L'ACK HTTP viene emesso dopo COMMIT. Il retry dello stesso batch e dello stesso payload restituisce la stessa receipt; riusare l'ID con contenuto diverso produce conflitto. Append richiede offset esatto e non riapre messaggi terminali. Testo NUL o Unicode UTF-16 malformato è rifiutato prima della scrittura PostgreSQL.

Il cursore è una stringa decimale e si confronta come BigInt. Il join ricostruisce sempre uno snapshot autorizzato corrente; durante la connessione gli eventi successivi sono ordinati e consegnati a blocchi di massimo 100. Cursori futuri/scaduti e finestre con eventi nascosti causano resync, senza divulgare identificatori interni. Gli eventi contengono solo ID, tipo e timestamp: il testo si rilegge attraverso `readShare` con permessi attuali. Un HTTP snapshot può essere avanti al socket: l'ACK WebSocket non supera mai il cursore effettivamente ricevuto da quel socket.

Sessione, membership, ruolo e audience vengono ricontrollati dal backend durante la connessione, sulle letture e sugli upload. La revoca chiude l'accesso; la riduzione del ruolo ricostruisce la proiezione. L'interfaccia invalida i dettagli precedenti quando cambia ambito, cursore o connessione e ignora risposte asincrone obsolete.

## Recupero e limiti operativi

Il main accorpa gli aggiornamenti ogni 500 ms, soltanto sugli ID già scelti. Limiti: 20 messaggi, 128 Ki caratteri complessivi, append di massimo 16 Ki caratteri; nessun taglio nel mezzo di una coppia surrogate. La coda è cifrata con lo storage sicuro OS in `realtime-queue.bin`, massimo 100 batch/1 MiB per contesto, e include account/progetto/repository/root canonica/dispositivo/thread. Prima di ogni flush vengono ricontrollati server e binding locale. Non contiene comandi, decisioni di approvazione o turni da rieseguire.

Un ACK perso mantiene lo stesso batch UUID per il retry. Stop drena prima il suffisso selezionato già osservato; se la coda è piena mantiene l'intento di stop finché c'è spazio. Un cambio cartella o account non può inviare la vecchia coda nel nuovo contesto. Dopo riavvio i pendenti ripristinati sono sospesi: usare **Retry** per inviare il testo congelato, oppure eliminarlo; per catturare nuovo testo effettuare una nuova selezione e conferma.

Desktop e web tentano al massimo 8 riconnessioni con backoff e jitter, poi richiedono Retry. Heartbeat ogni 15 s, scadenza dopo 45 s. Il backend controlla le sottoscrizioni ogni 2 s, anche senza nuovi eventi: la revoca su socket aperto non dipende da un nuovo messaggio del membro. Presenza effimera ricostruita dopo riavvio, testo accettato e receipt durevoli in PostgreSQL.

La perdita del solo canale live non equivale a logout Codex. Quando l'identità Nexus risulta temporaneamente non verificabile, il turno locale viene interrotto una volta, le approvazioni declinate e la policy torna readOnly; processo e cronologia sono conservati. Al recupero non vengono reinviati prompt o approvazioni. Logout/cambio account reali mantengono l'isolamento e la chiusura del contesto. Non è introdotta un'autonomia di esecuzione offline.

Il server usa una singola istanza, outbox PostgreSQL e polling bounded; non introduce Redis. Limiti per IP/account/socket, payload in ingresso 64 KiB, backpressure 1 MiB, timeout di join e rate limit HTTP con 429/Retry-After. Log Chalk includono route/operazione/categoria ed eventi di connessione, senza body, chat, cookie, query o dump SQL. Per più istanze servirà una progettazione esplicita di presenza/pubsub e rate limit condivisi.

## Build e prova del maintainer

Chiudere app e backend precedenti. Il DB/ruolo e `.env` esistenti sono sufficienti; nessuna nuova password. La migrazione è stata applicata sul DB locale durante T08; il comando resta idempotente per riallineare un'altra copia:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm package:win
```

In terminali separati avviare `pnpm mailpit` se non è già in esecuzione, `pnpm start:server`, quindi `pnpm start:desktop` oppure l'app aggiornata. Installer x64 `release/win/Nexus-AI-0.8.0-win-x64.exe`. Il pacchetto include Codex 0.159.2; backend, PostgreSQL e Mailpit rimangono servizi separati.

1. Aprire il progetto dal desktop owner/developer e da un browser con un secondo account invitato. Il browser usa `http://127.0.0.1:3001/`; per identità diverse utilizzare un profilo/incognito separato. Selezionare lo stesso progetto: presenza e badge diventano online.
2. Nel desktop aprire una propria sessione Codex, **Share → Share selected messages live**. Selezionare solo i messaggi voluti, audience client se l'osservatore è client/viewer, controllare preview e consenso. Nel browser **AI Session → Session Info → Live shared sessions** apre soltanto il testo scelto. Un nuovo messaggio non compare automaticamente.
3. Fermare e riavviare il backend locale: lo stato passa a reconnect/offline, i dettagli non verificabili vengono nascosti, poi ricostruiti senza duplicare il testo accettato. Se esauriti i tentativi usare Retry. Eventuali prompt o approvazioni interrotti non ripartono da soli.
4. Provare Stop sharing e riaprire l'app con pendenti: controllare contatore, Retry/discard espliciti e conservazione del testo già accettato. Nessuna nuova cattura automatica dopo ripristino.
5. Dall'owner ridurre/rimuovere il ruolo del secondo membro: il browser connesso perde immediatamente la proiezione al successivo controllo del server (poll 2 s), e non rilegge contenuti team o revocati.

`pnpm verify:realtime` richiede il DB locale migrato e Mailpit loopback. Crea tre account, un workspace e un backend temporanei; verifica HTTP/WS/DB reali, perdita ACK, riavvio e revoca, poi elimina soltanto i propri fixture e le proprie email. Non esegue inferenza personale. `pnpm verify:workspace` verifica invece renderer/preload con trasporti controllati dichiarati, Git e TAP reali isolati. Rapporti e catture in `.nexus/visual/t08/`; risultati e prove native distinte in [status.md](status.md).

## Integrazione visiva

Le PNG 2 e 3 originali sono state aperte. Header, avatar, badge Live Sync e pannelli Session Info seguono token, bordi, tipografia e densità della shell T02. Pianeta, particelle e animazioni ambientali restano quelli della shell; un effetto decorativo non indica connessione. Dialog selezione/consenso e Connection panel non hanno una schermata originale dedicata: usano le primitive esistenti, focus/tastiera e stati ridotti/offline. Confronto popolato a 1586×992, senza dichiarare uguaglianza pixel delle nuove funzioni o prove su OS non eseguiti.
