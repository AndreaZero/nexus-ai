# Workspace e progetti — T04

Versione **0.4.0**, 17 ottobre 2026. T03 accettato su Windows (login e rientro OS confermati); T04 implementato, consegnato per verifica manuale Windows. T05 non avviato. Autorità eseguibile: `packages/contracts/src/collaboration.ts`.

## Ruoli e perimetri

Un workspace ha membri amministrativi `owner/member`. L'owner amministra workspace e tutti i suoi progetti, compresa la creazione; il membro ordinario vede solo progetti con membership esplicita. Il ruolo operativo appartiene al progetto: `owner/developer/client/viewer`. Il workspace non introduce un quinto ruolo operativo. Non è prevista ereditarietà implicita di accesso da un workspace a tutti i progetti, tranne l'amministrazione dell'owner. Un client invitato non può creare nuovi progetti nel workspace del mittente; può creare un proprio workspace separato.

L'owner del progetto gestisce impostazioni, repository, membri e inviti del progetto. Developer vede metadati tecnici/repository e roster, senza amministrare accessi. Client/viewer ricevono metadati del progetto e roster ridotto (email altrui oscurate); repository e contenuti interni non vengono inviati. T04 non implementa ancora allegati, task operativi o stream: le relative route restano non disponibili. Nessun oggetto privato viene pubblicato. `defaultVisibility` private/team/client è la preferenza di condivisione dei futuri contenuti, non un link pubblico o autorizzazione implicita. Il confine private resta locale.

Workspace e progetto devono mantenere almeno un owner esplicito; le mutazioni bloccano la riga del contenitore in transazione. Rimozione workspace elimina anche membership esplicite del membro nei progetti di quel workspace, verificando prima che nessun progetto perda l'ultimo owner. Non esistono cancellazioni distruttive di workspace/progetti in T04. Il server verifica sessione corrente e membership a ogni richiesta; nessuna cache di autorizzazione.

## Trasporto e DTO

`POST /api/collaboration` accetta soltanto la union `CollaborationRequest`; restituisce `CollaborationResponse` validata, con `ok/kind/items|item` o errore `ok:false/code/message`. Le operazioni sono elenchi/creazione/modifica workspace e progetti, roster, cambio/rimozione ruolo, inviti (creazione/elenco/revoca/anteprima/accettazione) e collegamento repository. È un endpoint di dominio ristretto: nessun URL, header, SQL o comando arbitrario nel payload. Le letture passano dallo stesso confine autenticato e non vengono memorizzate da cache HTTP.

Nel browser: cookie HttpOnly e `credentials:include`, Origin esatta web/server, Content-Type JSON. Nel desktop: `DesktopBridge.collaboration.request` validato in preload/main; il main applica lo stesso schema e allega privatamente il cookie ufficiale, con server configurato e path fisso. Nessun token nel renderer, nessun generico fetch IPC. Il main riaccerta la sessione; server applica sempre membership/autorizzazioni. Errori sanitizzati, timeout limitati, nessun retry automatico delle mutazioni.

## Inviti

Scope workspace o progetto, email destinataria verificata, ruolo valido per lo scope. Solo owner del relativo scope (o owner workspace per un progetto) può emettere/revocare. Un invito progetto aggiunge la membership workspace `member` se assente; un invito workspace non apre progetti. Un membro esistente non viene promosso tramite invito: cambio ruolo esplicito separato. Inviti owner consentiti solo dall'owner esistente; ultimo owner protetto.

Token casuale 32 byte base64url, solo SHA-256 nel DB, durata 72 ore. Il link email usa origine web configurata e `/#/invitations?token=…`: il frammento non entra nei log HTTP/Referrer. Il browser conserva il token solo in sessionStorage della pagina per attraversare login/registrazione e lo rimuove dopo esito terminale. Anteprima e accettazione richiedono account verificato con email corrispondente; nessun dettaglio per estranei. Accettazione atomica con token/righe bloccate, replay/revoca/scadenza negati. L'email passa dall'SMTP già configurato (Mailpit locale); mancata consegna produce errore recuperabile e invito non utilizzabile. Nessun invio a servizi esterni aggiunto in locale.

## Repository e binding locale

Repository condiviso distinto: un record per progetto con HTTPS remoteUrl senza credenziali/query/fragment e defaultBranch. Nessun clone, comando Git, token GitHub o accesso remoto ai file in T04. Client/viewer non ricevono questo record. Un binding locale associa account/progetto/repository/device a una cartella scelta tramite dialogo nativo Electron: file sotto userData, schema validato e sostituzione atomica. Non è caricato sul server e non è esposto dal renderer web. Get/select/remove accettano solo ID UUID e operazione; nessun path fornito dal renderer. Sessione e diritto al repository verificati prima di mostrare/scegliere/rimuovere; la selezione viene ricontrollata dopo il dialogo. Non attraversare o leggere file del repository.

## Schema DB fissato per i fronti

Nomi SQL e colonne (UUID applicativi come text; date timestamptz):

- `workspace`: id, name, created_at, updated_at.
- `workspace_member`: workspace_id/user_id PK composta, role owner/member, joined_at.
- `project`: id, workspace_id FK, name, description, default_visibility, created_at, updated_at.
- `project_member`: project_id/user_id PK composta, role owner/developer/client/viewer, joined_at.
- `repository`: id, project_id UNIQUE FK, remote_url, default_branch.
- `invitation`: id, workspace_id FK, project_id FK nullable, email, role, token_hash UNIQUE, created_by FK user, status pending/accepted/revoked, created_at, expires_at, accepted_at nullable.
- `collaboration_event`: id, workspace_id, project_id nullable, actor_id, event_type, payload JSON con soli identificatori non segreti, created_at; registrato nella transazione mutativa, senza broadcast T04.
- Basi vuote per `milestone`, `task`, `ai_session`, con project_id FK e visibility/creator per il perimetro futuro. Nessun endpoint o contenuto inventato aggiunto.

La migrazione è additiva ed esplicita sul DB locale già dedicato. Nessuna migrazione all'avvio o nuovo cluster/ruolo/database. Eventi/membership realtime e outbox operativa si collegano in T08, senza dichiarare sincronizzazione live in T04.

## Avvio e prova del maintainer

Sulla macchina attuale la migrazione `0001_collaboration.sql` è già stata applicata e una seconda esecuzione non ha duplicato oggetti. Per un altro clone eseguire `pnpm db:migrate` dopo il setup T03. Chiudere app e backend precedenti prima di compilare; poi:

```powershell
pnpm package:win
```

Lasciare Mailpit attivo in un terminale (`pnpm mailpit`, una sola istanza), riavviare il backend con `pnpm start:server` e aprire l'app aggiornata o `pnpm start:desktop` da un altro terminale. Il backend deve essere quello T04: un processo precedente può mantenere API/asset precedenti anche dopo la build. Non cambiare le credenziali PostgreSQL o rifare la registrazione Nexus.

1. In **Projects** creare un workspace e due progetti; selezionare il primo. Header, elenco e contatore devono riportare i nomi reali. Modificare nome/descrizione/default sharing e riaprire l'app: selezione e dati devono persistere.
2. In **Team** scegliere **Project** e invitare un secondo indirizzo come client o developer. L'email arriva in [Mailpit locale](http://127.0.0.1:8025), non nella casella esterna. Aprire il link, creare/verificare il secondo account se necessario, accedere e accettare con l'indirizzo destinatario. La pagina non mostra dettagli a un altro account e consente **Use another account**.
3. Col secondo account verificare che compaia soltanto il progetto invitato; l'altro progetto rimane negato anche conoscendone l'ID. Un invito **Workspace** crea solo l'appartenenza, senza aprire progetti. Per confrontare due sessioni browser usare profili o finestre private distinte.
4. Come owner cambiare developer → viewer e ricaricare/Refresh dall'altro client: repository tecnico e comandi amministrativi non devono essere accessibili. Rimuovere la membership e verificare accesso negato. Provare revoca/replay di un invito; rimozione/demozione dell'ultimo owner deve fallire con messaggio recuperabile.
5. In **Repos**, da owner, salvare HTTPS URL/default branch e scegliere una cartella esistente nel desktop. Chiudere/riaprire e verificare persistenza del collegamento. **Unlink folder** rimuove solo il binding, senza toccare i file. Nel browser e per client/viewer il percorso locale non è disponibile.

Aggiornamento T04 mediante richieste esplicite, focus e Refresh; nessuna presenza o sincronizzazione realtime dichiarata. Codex e Git non vengono avviati in questo task. La shell T02, gli effetti e i grafici senza dati mantengono stati reali vuoti/unknown.

## Verifiche eseguite e limiti

- Typecheck di tutti i package/app, ESLint e confini renderer (45 file) passati dopo integrazione. Corretti confronti TypeScript non più raggiungibili nelle nuove rotte e un escape superfluo nel pattern branch.
- `pnpm test`: **42/42** (DB 3, desktop 16, server 20, web 1, confini 2). Copertura mirata su isolamento, origine/sessione, parser IPC, storage atomico, cancellazione/revoca durante dialogo cartella, ruoli/inviti e ritorno browser T03.
- `pnpm verify:collaboration`: **12 scenari** con server HTTP isolato, PostgreSQL/Mailpit reali e tre account verificati temporanei. Copre progetti separati, recipient/replay/hash, ruoli e revoca, due owner concorrenti, issuer non più autorizzato e rimozione workspace che lascerebbe un progetto senza owner.
- Migrazione reale/idempotente: 15 tabelle pubbliche totali. Corretto l'ordine generato dell'indice composto prima della FK invito/progetto; i primi tentativi sono stati annullati da PostgreSQL senza schema parziale. Pulizia QA verificata: zero account/workspace QA, account reale preesistente conservato.
- Verifica shell Electron a 1586 × 992 e 960 px: tre layout reference, quattro gate collaborazione senza account, tastiera e reduced motion passati. Le catture sono output locali `.nexus/visual/t02/` del comando storico `verify:shell`; non sono prove visuali dei form autenticati. Nessun progetto fittizio inserito nel renderer per le catture.
- Il dialogo nativo e il flusso visuale autenticato con due account richiedono ancora la prova manuale sopra. Le prove Mac/Linux restano native sui relativi sistemi; nessuna firma/notarizzazione aggiunta.

`pnpm verify:collaboration` è un controllo esplicito solo per DB `nexus_ai_dev` loopback e SMTP Mailpit `127.0.0.1:1025`. Crea la propria istanza HTTP temporanea, non interrompe il server del maintainer, elimina soltanto i propri fixture e non stampa password, destinatari o link. Report locale ignorato da Git: `.nexus/visual/t04/collaboration-report.json`.
