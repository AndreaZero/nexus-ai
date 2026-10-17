# Task, roadmap e consegne cliente — T11

T11 collega **Tasks**, **Docs**, Overview e Client & Team Pulse ai dati persistenti del progetto. UI e dialoghi riusano palette, bordi, glow, focus e densità delle reference1/2/3; board e pagine documentali non hanno una PNG dedicata. Pianeta, wave e particelle restano quelli della shell approvata. Task successivo Git/GitHub T12 non avviato.

## Percorso operativo

1. In **Tasks → Roadmap**, creare una milestone con descrizione, audience e scadenza. In **Board** creare una task, assegnare un membro, scegliere milestone e stato. Le quattro colonne sono To do, In progress, Review, Done. Conteggi e progressi usano tutte le task autorizzate, anche oltre la prima pagina.
2. Dal dettaglio task aprire **AI Sessions**. Il proprio Codex resta locale e richiede le consuete scelte/approvazioni. Pubblicare esplicitamente l'estratto desiderato; modificare poi la task per collegarlo tramite **Published session provenance**. Nessun prompt, thread o file viene caricato automaticamente.
3. In **Docs → Documents** creare un documento con testo e provenienza: estratto pubblicato, task e/o documento sorgente. Un documento interno si salva direttamente; un documento destinato ai clienti passa da anteprima e conferma. Il collegamento mostra la sorgente attualmente autorizzata, non promette una copia storica del suo testo.
4. In **Updates** pubblicare un aggiornamento dopo l'anteprima con audience. Gli aggiornamenti sono immutabili. **Share Update** di Pulse apre questo flusso; la pubblicazione degli estratti sessione resta disponibile in AI Sessions.
5. In **Deliverables** pubblicare titolo/testo, provenienza e, se desiderato, file scelti esplicitamente. Prima della conferma si vede il riepilogo di testo, audience, fonti e file; la selezione del file da sola non avvia upload. Ogni nuova pubblicazione sul medesimo deliverable crea una revisione immutabile e riparte da **Pending**.
6. Un membro con ruolo effettivo **client** può approvare o chiedere modifiche alla revisione corrente ancora Pending, con un commento. La decisione è una sola per revisione. Una decisione su una revisione superata viene negata; lo storico conserva autore, data e decisione delle revisioni precedenti. Questa approvazione non concede alcuna esecuzione a Codex.
7. Il cliente può inviare feedback sul progetto, documento, aggiornamento o deliverable, con sentiment facoltativo scelto esplicitamente. I tecnici rispondono nei commenti del record/feedback. Nessun sentiment viene dedotto dal testo. Le frecce del feedback Pulse sono manuali.

Le liste sono paginabili fino a100 record per richiesta, con totale autorizzato e Load older. Dopo modifiche concorrenti aggiornare la lista: le pagine sono ordinate dal server e il renderer elimina duplicati per ID. I testi completi si leggono aprendo il dettaglio; le liste contengono metadata. Anche i commenti hanno dettaglio autorizzato, senza scaricare preventivamente tutti i corpi. La roadmap mostra soltanto le task collegate consentite alla propria audience.

## Ruoli, versioni e visibilità

| Operazione | Owner/developer | Client | Viewer |
| --- | --- | --- | --- |
| Lettura | Team e client | Solo client | Solo client |
| CRUD task/milestone/documenti | Sì | No | No |
| Pubblicazione update/revisioni/file | Sì, selezione e conferma | No | No |
| Commenti | Target autorizzato | Target pubblicato client | No |
| Feedback/decisione deliverable | Risposta tramite commenti; nessuna impersonazione cliente | Sì, con vincoli di revisione | No |
| Download allegati | Versioni autorizzate e propri upload privati | Solo versioni pubblicate client | Solo versioni pubblicate client |

L'owner del workspace mantiene i privilegi amministrativi già definiti in T04. L'assegnatario deve essere un membro del progetto o owner del workspace. Fonti e milestone devono appartenere allo stesso progetto; un nuovo oggetto client non può referenziare una sorgente interna. Se una fonte viene successivamente ristretta, il contenuto derivato già pubblicato esplicitamente mantiene la propria audience, mentre il suo link sorgente viene redatto. Feedback e commenti ereditano invece l'accesso del destinatario corrente e scompaiono se questo diventa inaccessibile.

La visibilità attuale del deliverable protegge anche tutto il suo storico; il cliente deve avere accesso sia al parent corrente sia all'audience della revisione richiesta. Un file di una vecchia revisione client rimane scaricabile finché parent e revisione lo consentono. Non è possibile eliminare un file referenziato da una revisione pubblicata. Eliminare una milestone scollega le task e incrementa le loro versioni; eliminare task/documenti scollega le provenienze tramite FK, senza riscrivere il testo dei deliverable pubblicati.

Modifiche e cancellazioni usano `expectedVersion`, creazione con0. Un conflitto conserva la bozza e richiede di riaprire la versione corrente. Ogni mutazione porta un `requestId` UUID: un retry dello stesso payload restituisce la ricevuta precedente; riusarlo per un payload diverso produce conflitto. I form mantengono il consenso e la ricevuta nel perimetro account/progetto/ruolo/audience; una pubblicazione non si ripete automaticamente al reconnect.

## Allegati e download

Massimo **1MiB per file**, **5 file per deliverable**, **20MiB complessivi per progetto**, comprese versioni storiche e upload non pubblicati. Testo UTF-8/sorgente, Markdown, JSON, PDF, PNG e JPEG; nomi con percorsi, controlli, credenziali note, HTML/SVG ed eseguibili vengono rifiutati. Per PDF/immagini si verifica anche la firma iniziale. Il file scelto resta contenuto dell'utente: selezionarlo e revisionarlo prima di confermare. Il filtro per nome non garantisce la rimozione di segreti nel contenuto.

I byte sono memorizzati in PostgreSQL come base64 con dimensione e SHA-256; non occorrono servizi storage aggiuntivi o cartelle da esporre. Gli upload non pubblicati sono leggibili solo dal tecnico autore e non nella preview client. **Docs → Manage unused uploads** permette di rimuovere i propri file rimasti dopo crash/interruzione e recuperare quota; Cancel/Remove tentano la rimozione esplicita degli upload del form con ricevuta stabile. Cancel resta disponibile anche offline o se la pulizia fallisce: gli upload rimasti si recuperano da questa schermata. Nessuna eliminazione automatica di file pubblicati.

Nel browser il download autorizzato crea un file Blob dopo verifica dei byte/hash. Nel desktop **work.download** accetta solo progetto/ID/audience e apre Save dialog nativo; cookie e destinazione rimangono nel main. Dopo il dialog si verifica nuovamente account, permesso, dimensione e hash prima di scrivere. Nessun path remoto, apertura automatica o esecuzione del file. Gli harness intercettano l'apertura/salvataggio OS; la scelta manuale della destinazione resta da provare dal maintainer.

## Persistenza e realtime

`POST /api/work`, `DesktopBridge.work.request/download`, schemi strict in `packages/contracts/src/work.ts`. Corpo HTTP massimo2MiB, risposta desktop limitata3MiB, cookie main/HttpOnly, Origin e sessione corrente verificati, no-store. Limiti fissi per account/IP e logging Chalk con campi ammessi; niente testo, base64, query, percorsi o segreti nei log. Ricevuta, mutazione e outbox sono atomiche nella stessa transazione con lock workspace→project. Limite100.000 ricevute per progetto, senza scadenza che possa duplicare una pubblicazione ritentata.

Migrazione additiva **0005_project_work.sql**: estende task/milestone e aggiunge documenti, update, deliverable/revisioni, feedback/commenti, allegati, ricevute e metadati cambiamenti. Si applica esplicitamente con `pnpm db:migrate`; nessuna migrazione all'avvio, nessun dato iniziale e nessun cambio a `.env`, secret, account o progetto esistenti.

L'evento interno `work.changed` invalida i client tramite snapshot WS con cursore e resync; non invia ID/titolo di un oggetto privato. Il feed Overview/Pulse rilegge metadata dal target attualmente autorizzato prima di conteggi/pagine e coalescenza. Categorie Tasks, Documents e Comments si aggiungono a Sessions; notifiche e target revocati seguono gli stessi controlli T09. Il summary UTC include entità condivise e commenti/feedback distinti nella finestra retained; non è uno storico completo. Commit/build/deploy rimangono sconosciuti fino ai relativi domini T12/T13.

Provider scoped, invalidazione coalescente1,5s, richieste obsolete ignorate e dati condivisi nascosti offline. I form restano recuperabili nel medesimo scope; cambio identità/ruolo/progetto/audience li smonta. Il recupero non accoda esecuzioni o decisioni cliente. La correzione429 della0.9.1 resta invariata.

## Build e prova Windows

Chiudere app/backend precedenti, poi:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm package:win
```

Installer unsigned x64 `release/win/Nexus-AI-0.11.0-win-x64.exe`. In terminali separati avviare `pnpm start:server` e `pnpm start:desktop`; conservare Mailpit attivo per account/inviti. Su questa macchina la0005 è già applicata e ripetere il comando è innocuo. Non occorre ricreare PostgreSQL.

Provare il percorso operativo sopra con owner/developer e un secondo account invitato **client**; controllare anche viewer, revisione superata, download, preview client, commenti e revoca. In Pulse verificare milestone/progresso, card approvata/feedback/provenienza e nuovi eventi senza salto della lettura. Da Tasks aprire dettaglio e modificare lo stesso record da due finestre: la seconda modifica deve richiedere di ricaricare. Provare tastiera, reduced motion e960px.

`pnpm verify:work` esercita PG/Mailpit/HTTP/WS reali con fixture proprie eliminate. `pnpm verify:workspace` usa renderer/preload effettivi, Git/TAP reali e trasporti provider/Work controllati dichiarati; nessuna credenziale o inferenza personale. Risultati realmente eseguiti in [status.md](status.md). macOS/Linux richiedono ancora build e prove native sul relativo sistema.
