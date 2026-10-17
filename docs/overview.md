# Overview operativa — T09

La vista **Overview** collega la composizione di `examples/design/3.png` ai dati effettivi del progetto. Il desktop mantiene runtime, filesystem e misure sul dispositivo; il browser mostra le proiezioni condivise consentite. Le tre PNG rimangono l'autorità visiva, senza copiare nomi, numeri, test o deploy illustrativi nel normale avvio.

## Pannelli e fonti

| Pannello | Dati e azioni disponibili |
| --- | --- |
| Team Online | Presenza T08 aggregata per account, denominatore membri progetto più owner workspace senza duplicati, ruoli attuali, invito/team e conteggio share attive consentite. Mappa schematica decorativa, senza geolocalizzazione |
| Active AI Session | Sessione Codex sul dispositivo con richiesta/piano/token/context effettivi, oppure selezione di una share attiva autorizzata. L'opzione This device distingue il driver dall'osservatore; testo condiviso letto in Session Info. Nessun token/path/macchina privata ricevuto dagli altri driver |
| Live Activity | Eventi durevoli T08 degli estratti e delle share autorizzate; una riga per entità aggiornata, timestamp e autore reali. Filtri, paginazione, aggiornamenti espliciti e link al dettaglio consentito |
| Task Overview | Task già presenti e visibili al ruolo, raggruppati In Progress/Review/Done, conteggio To do separato. View all apre la lista in lettura. Creazione, assegnazione, commenti e board completa restano T11 |
| System Activity | CPU e memoria aggregate dell'intero dispositivo, soltanto dopo Enable. Fonte locale, intervallo2s, massimo60 campioni/2minuti, rete sconosciuta. Nessuna serie simulata Code/Build/Deploy |
| Project Health | Ultimo report test locale riconosciuto con formato/data e possibile precedenza rispetto agli edit correnti. Build, coverage, performance e sicurezza rimangono sconosciuti quando non riportati. Nessun punteggio health aggregato senza regola configurata |
| Live Deploy Preview | Eventuale URL preview locale T07, con etichetta Unverified URL e apertura esplicita. Nessuna thumbnail remota acquisita o stato Deployed inventato. Integrazione ambienti/build T13 |
| Recent Changes | Diff Git/file reali T07 o patch del provider con fonte distinta, timestamp e apertura del workspace. Informazioni locali del driver; non caricate automaticamente nel feed |
| Notifications | Aggiornamenti condivisi dagli altri autori, secondo audience corrente. Stato letto per account/progetto persistente, stesso modello nel rail e nel dialog aperto dalla campanella |

Un progetto appena creato può avere solo la propria presenza e nessuna attività/notifica. Pubblicare un estratto o confermare una condivisione live alimenta il feed; un proprio aggiornamento non genera una notifica a se stessi. I filtri Commits/File Changes/Comments/Deployments restano realmente vuoti finché i rispettivi domini non pubblicano eventi. GitHub T12, deploy T13 e ricerca/notifiche estese T14 non vengono anticipati da T09.

Open in Editor e Stop Session agiscono solo sul runtime/cartella del dispositivo con ruolo tecnico e binding corrente. Se si seleziona una share remota, la card non mostra richiesta privata, token, file o contesto della sessione locale e non abilita il controllo del suo runtime. La presenza non dimostra esecuzione Codex o produttività.

## Feed, consistenza e autorizzazioni

Contratto strict in `packages/contracts/src/overview.ts`, endpoint fisso **POST /api/overview** con operazioni `snapshot` e `markRead`. Cookie main desktop o HttpOnly browser, Origin verificata, risposta no-store, limiti di richiesta e frequenza. Nessun endpoint scelto dal renderer e nessun nuovo payload privato nel WebSocket.

Lo snapshot comprende projectId, cursor/observedAt, activity/nextBefore, authorizedTargets, notifications/unreadCount/readThrough, tasks, activeShares e memberCount. I metadata di attività contengono soltanto ID, target, autore/nome, titolo già condiviso, audience e timestamp; nessun testo completo, file o evento provider grezzo. Il dettaglio passa dai domini sessions/realtime con una nuova verifica dei permessi.

Il backend legge l'outbox T08, raggruppa per tipo/entità prendendo l'evento più recente, filtra secondo membership e audience attuali, quindi pagina. Cursori decimali confrontati come BigInt, massimo50 righe per pagina e500 righe tenute dal renderer. Il dominio conserva gli ultimi1.000 eventi metadata per progetto: questa vista è attività recente corrente, non un archivio completo di tutti i delta storici. Il testo accettato resta nelle relative entità anche dopo la retention metadata.

Il cursore WS T08 invalida lo snapshot con coalescenza di1,5s. Il feed già letto non viene riordinato automaticamente: **New activity available · show latest** applica i nuovi elementi. Lo snapshot include anche i target attualmente autorizzati per rimuovere immediatamente dalle righe già mostrate un'entità passata ad audience interna. La rimozione non aspetta il clic del lettore. Pagine successive deduplicate per tipo/ID entità; cambi di account/progetto/ruolo, offline e revoca invalidano i dati e le risposte asincrone precedenti.

Le notifiche sono indipendenti da filtro e pagina del feed: ultimi30 aggiornamenti di altri autori, con conteggio degli elementi recenti autorizzati oltre readThrough. **Mark all read** usa il cursore catturato dallo snapshot visualizzato; il dialog mantiene quello dell'apertura. Eventi successivi rimangono non letti. L'upsert usa GREATEST, rifiuta cursori futuri e non può riportare indietro una lettura concorrente. Migrazione additiva **0004_overview.sql**, tabella `overview_read_cursor(project_id,user_id,sequence,updated_at)` con cancellazione a cascata.

## Misure locali opt-in

`DesktopBridge.telemetry.request` accetta solo getState/setEnabled per ID progetto/repository autorizzati. CPU deriva dalla differenza dei contatori OS aggregati fra due campioni: il primo valore è sconosciuto. Memoria da totalmem/freemem, rete null perché non esiste una misura portabile implementata. Non sono metriche del solo processo Nexus né del backend remoto.

Enable vale per account, progetto, repository, dispositivo e root canonica correnti. Nessun salvataggio del consenso o dei campioni e nessun upload. Il timer non interroga il server; ogni richiesta del consumatore viene invece riautorizzata. Cambio binding/ruolo/account, logout o account non verificabile azzerano i campioni. La UI interrompe quando nascosta/smontata; una lease di10s senza richieste arresta comunque il monitor e richiede una nuova scelta Enable. Il browser mostra la capacità assente, senza raccogliere dati dal PC remoto.

## Fedeltà visiva e verifiche

Reference3 aperta prima dello sviluppo. Conservati sidebar/pianeta/particelle e token T02, strip84px, sessione278px, feed420px, colonne task/system e rail health/preview/diff/notifiche. Le nuove righe usano bordi sottili, dot/timeline, avatar e badge coerenti. Focus, scroll locale, resize e movimento ridotto restano parte della stessa UI. I grafici rappresentano campioni misurati; gli effetti ambientali sono decorativi. Una PNG non permette di ricavare l'animazione originale o certificare uguaglianza pixel su contenuti diversi.

`pnpm verify:overview` usa DB locale migrato/Mailpit loopback, tre account temporanei e un backend effimero. Verifica HTTP/WS/PostgreSQL reali, audience prima di conteggi/pagine, coalescenza, lettura monotona persistente dopo riavvio, cambio audience e revoca; elimina soltanto i propri account/workspace/email. Nessuna inferenza personale. `pnpm verify:workspace` usa renderer/preload effettivi, Git/TAP isolati reali e trasporti provider/shared dichiarati controllati; i campioni di sistema sono raccolti realmente dal dispositivo dopo clic Enable. Rapporti/catture in `.nexus/visual/t09/`, risultati registrati in [status.md](status.md).

## Build e prova Windows

Chiudere app/backend precedenti e usare il DB/ruolo/`.env` già configurati. La migrazione0004 è già applicata su questa macchina; il comando è idempotente:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm package:win
```

Installer x64 `release/win/Nexus-AI-0.9.0-win-x64.exe`. Tenere Mailpit attivo se serve registrare/invitare, poi avviare `pnpm start:server` e `pnpm start:desktop` in terminali separati, oppure aprire l'app aggiornata. Backend/PostgreSQL/Mailpit rimangono servizi separati dal pacchetto.

1. Aprire Overview sullo stesso progetto da desktop owner/developer e browser con un secondo account invitato. Il browser può usare un profilo/incognito distinto su `http://127.0.0.1:3001/`. Presenza e conteggio membri devono essere coerenti.
2. Pubblicare un estratto o una share live da AI Session con preview e audience client se necessario. Nel secondo account il feed e le notifiche mostrano solo i contenuti consentiti; il link apre proprio il testo scelto in Session Info.
3. Restare sul feed durante nuovi aggiornamenti: le righe non saltano, il pulsante nuovi eventi aggiorna la vista. Provare filtri, caricamento più vecchi se presenti e Mark all read; un evento successivo resta non letto anche dopo riavvio.
4. Sul desktop, durante una propria sessione, verificare richiesta/piano/token realmente disponibili, Open in Editor, Stop Session e diff Git. Scegliere una share dal selettore: richiesta e controlli locali non devono essere attribuiti alla sessione osservata.
5. Abilitare System Activity: memoria subito, CPU dopo il secondo campione, rete sconosciuta. Disable o uscita dalla vista ferma il monitor; al ritorno serve un nuovo consenso. Nessun health92%, deploy o sessione di esempio viene inserito.
6. Cambiare audience o revocare il secondo membro mentre è connesso: elementi non più autorizzati e notifiche spariscono. Arrestare/riavviare il backend: stato offline esplicito e recupero T08 senza riavviare prompt/approvazioni.

Mac/Linux conservano la stessa architettura e i relativi comandi package sul loro OS; prove native da registrare separatamente. Attendere feedback Windows prima di T10.
