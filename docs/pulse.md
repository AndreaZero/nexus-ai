# Client & Team Pulse — T10

**Aggiornamento T11:** CRUD/roadmap, documenti e aggiornamenti, deliverable versionati, feedback/approvazioni e file scelti sono ora operativi: [guida corrente](work.md). Pulse riusa questi dati nelle card; il summary Comments conta commenti/feedback visibili retained UTC. Le sezioni sotto descrivono la consegna T10 e i suoi limiti storici.

La vista **Client & Team Pulse** e **Client Portal** usa la composizione della [reference1](../examples/design/1.png): hero wave/particelle e nodi selezionabili, donut, tre righe di card e rail attività/presenza. Pianeta e shell T02 restano condivisi. Non occorre preparare un altro database o cambiare `.env`: T10 legge le tabelle esistenti, senza migrazioni nuove.

## Dati e azioni

| Blocco | Fonte e comportamento effettivi |
| --- | --- |
| Hero / Overall Progress | Conteggi di tutte le task visibili del progetto: done=completed, in_progress/review=in progress, todo=planned. Percentuale completed/total; nessuna task → sconosciuto. Nessun limite100 nel denominatore |
| Milestone Progress / Roadmap | Fino a100 milestone autorizzate, prime5 nella card/hero. Dettaglio con scadenza, audience e conteggi delle task visibili collegate nello stesso progetto. Nessun progresso dedotto dalla data |
| Today's Activity Summary | Giorno UTC del server, intervallo start incluso/end escluso. Task aggiornate = record attuali con updatedAt nel giorno; My Activity limita all'assegnatario corrente. Shared updates = entità distinte cambiate oggi nella finestra outbox conservata, My Activity limita l'autore dell'evento. Non un ledger completo. Commit/commenti/build non collegati → — |
| Active Sessions / View Live Work | Condivisioni live autorizzate e link al testo selezionato in Session Info; senza share apre AI Session. Presenza da connessioni Nexus, senza inferire esecuzione dal nome di una sessione |
| Working now | Solo sul dispositivo dello sviluppatore nella vista team: sessione Codex propria, contesto/file scelti, stato Git/diff e apertura editor già autorizzati. Nessuna lettura remota del filesystem |
| Session Outcomes / View all | Fino a20 estratti esplicitamente pubblicati, completed, con autore/audience/versione e link al testo autorizzato. Il completamento della sessione non approva un deliverable e non pubblica file |
| Share Update | Riusa selezione/anteprima/audience della pubblicazione estratto T06. Senza sessione locale apre AI Session; non crea ancora il nuovo oggetto aggiornamento T11 |
| Deploy Previews | URL configurata localmente nel workspace T07, indicata come non verificata; apertura esplicita. Nella vista client nessuna URL privata del dispositivo. Deploy condivisi e probe sono T13 |
| Deliverables / Feedback | Stati vuoti e dettaglio esplicito fino al workflow T11; View all offre anche accesso agli estratti pubblicati. Nessun dato illustrativo copiato dalla PNG |
| Team Availability / Viewer Activity | Membri connessi, ruolo, numero connessioni e ultima osservazione del heartbeat. Non disponibilità professionale, produttività o cronologia pagine/deploy visti. Invito apre Team |
| Activity Feed | Metadata di estratti/live share T09, filtri e pagine, link autorizzati. I nuovi eventi attendono “show latest”; i target rimossi dall'audience spariscono subito anche dalle righe trattenute |

Task/milestone preesistenti vengono letti, ma la loro creazione e modifica nell'app arriva in **T11**, insieme a documenti, deliverable, feedback e aggiornamenti dedicati. Un progetto nuovo può quindi avere milestone/task vuote: non inserirle con SQL per popolare la UI. Le fixture degli harness sono temporanee e non entrano nel normale avvio.

## Audience e recupero

Owner/developer vedono la proiezione team. **Preview client audience** richiede una nuova proiezione server `view:client` e smonta Working now, preview locale, editor e pubblicazione. Client/viewer ricevono sempre proiezione client, anche se chiedono `view:auto`; non esiste un parametro per elevare i privilegi. Ogni query applica membership e audience prima di conteggi, limite e paginazione, inclusi figli delle milestone e outcomes.

`POST /api/pulse` e `DesktopBridge.pulse.request` accettano `snapshot(projectId,view,scope,filter,before,limit)` secondo `packages/contracts/src/pulse.ts`. Singola transazione con lock workspace→project e helper overview condiviso, nessuna transazione annidata. Risposta strict, no-store, Origin e cookie verificati, limiti IP/account separati; logger Chalk include endpoint/operazione/esito senza contenuti. Il desktop sceglie endpoint/cookie nel main e valida risposta, progetto e audience; il renderer non può fornire URL/header/credenziali.

Provider montato solo nella route Pulse/portal, separato dall'overview. Cambio account/progetto/ruolo/audience invalida le richieste precedenti. Gli eventi WS T08 richiedono snapshot coalescenti a1,5s, senza polling continuo; refresh esplicito e rollover UTC aggiornano dati senza eventi. Offline/revoca nasconde immediatamente la proiezione. Il feed mantiene la lettura con applicazione esplicita dei nuovi eventi. Correzione429 della0.9.1 conservata.

La wave è decorativa e deterministica, i nodi derivano da milestone reali e sono selezionabili anche da tastiera. Tooltip include titolo/stato/progresso autorizzati. Canvas30fps, DPR massimo1,5, pausa fuori viewport/background; reduced motion conserva una scena statica. Colori/glow/font e geometria seguono i token e le specifiche design; una PNG non determina il moto originale.

## Build e prova Windows

Chiudere app e backend precedenti, quindi:

```powershell
pnpm install --frozen-lockfile
pnpm package:win
```

Installer x64 `release/win/Nexus-AI-0.10.0-win-x64.exe`, unsigned. Avviare `pnpm start:server` e `pnpm start:desktop` in terminali separati; Mailpit già attivo serve per nuovi account/inviti. Nessuna nuova migrazione rispetto a T09.

1. Selezionare un progetto, aprire **Client & Team Pulse**. Controllare griglia, pianeta, wave e card; con progetto vuoto progressi sconosciuti e stati vuoti coerenti.
2. Pubblicare un estratto completed da AI Session con selezione/anteprima e audience client; per la presenza usare un secondo account invitato. Una share live selezionata alimenta Active Sessions; l'estratto completed alimenta Outcomes e Activity. Aprire i link per controllare il testo consentito.
3. Con owner/developer passare a **Preview client audience**: contenuti team e dettagli locali scompaiono. Un secondo client/viewer vede soltanto il contenuto pubblicato client. Revocare l'accesso da Team e verificare che non resti una proiezione leggibile.
4. Provare My Activity, Refresh Pulse, filtri feed e applicazione esplicita dei nuovi eventi; selezionare una milestone se già disponibile. Provare tastiera, reduced motion e finestra960px. CRUD milestone/task e feedback si proveranno in T11.

Controlli disponibili: `pnpm verify:pulse` (PG/Mailpit/HTTP/WS reali con fixture proprie rimosse), `pnpm verify:workspace` (renderer/preload Electron, Git/TAP reali e proiezioni provider/Pulse controllate dichiarate), `pnpm verify:session-rate` (regressione429). Questi harness richiedono esclusivamente servizi loopback dedicati e non eseguono inferenza personale. Evidenze realmente eseguite e limiti in [status.md](status.md). Build/keyring nativi macOS/Linux restano da provare sul relativo OS.
