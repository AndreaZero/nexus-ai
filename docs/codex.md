# Integrazione Codex

**T06:** la sessione aggiunge [contesto e cronologia esplicita](session.md): file selezionati/preview, bozza cifrata, Git osservato, piano/token dagli eventi reali e Share con preview. Il protocollo/runtime resta 0.159.2 e la modalità readOnly; i limiti T05 sotto sono descritti nel loro contesto storico.

## Contratto T05 fissato

Il maintainer ha autorizzato T05 il 17 ottobre 2026. Runtime ufficiale **Codex CLI 0.159.2**, schema TypeScript ottenuto con il suo `app-server generate-ts` e conservato immutato in `packages/codex-bridge/generated/`. La documentazione corrente può descrivere campi successivi: l'implementazione usa quelli effettivamente generati per la versione fissata. Fonte ufficiale letta: [App Server](https://learn.chatgpt.com/docs/app-server), sezioni autenticazione, thread, turni e sandbox.

Il coordinatore distribuisce il runtime nativo dal pacchetto npm ufficiale `@openai/codex@0.159.2` nel bundle desktop, senza dipendere da installazioni globali/WSL o leggere il profilo `.codex` del maintainer. Il build copia il vendor della piattaforma in `.nexus/runtime/codex`; il pacchetto lo colloca in `resources/codex`. Native Windows/macOS/Linux x64/arm64 quando disponibili nel pacchetto ufficiale; ogni build si esegue sul suo OS. Nessun download automatico all'avvio, installazione runtime via dipendenza fissata e lockfile.

### Confini tra i tre agenti

- Bridge Node-only: `CodexProcess({executable,home,clientVersion})`, `start`, `request` typed su metodi ufficiali limitati, `onNotification`, `onServerRequest`, `respond/reject`, `onExit`, `dispose`. Versione verificata prima dell'avvio; NDJSON con limiti, timeout e shutdown senza processi orfani. Il secondo parametro test non viene esposto dal package index.
- Desktop: `DesktopBridge.codex.request(CodexRequest)` e sottoscrizione `onStateChanged(CodexState)`, con schemi autorevoli in `packages/contracts/src/codex.ts`. Nessun metodo RPC/path/argv/header arbitrario dal renderer. Login API key esplicito: input transitorio, cancellato dal form dopo invio, mai persistito in renderer/DTO/log; credenziali gestite da Codex con keyring OS. Nessun token Nexus o Codex inviato al backend condiviso.
- Home `userData/codex/<hash account Nexus>` e mapping thread locale separato per account/progetto/repository. Nessuna importazione di auth/config/cronologia di altre app. Cambio/logout Nexus arresta il processo e cancella i DTO correnti. Storage credenziali runtime `keyring`, senza ripiego plaintext; env child limitato a OS/PATH/keyring/proxy e home dedicata, niente DATABASE_URL/SMTP/OpenAI key ambientali.
- Ogni `openSession/newSession/send/interrupt` verifica account Nexus, ruolo owner/developer e binding corrente attraverso il servizio T04; folder nativa canonicalizzata e ancora esistente. Il renderer invia soltanto ID: il cwd viene dal binding autorizzato. La risposta Codex non viene inoltrata al server: T05 è locale, condivisione successiva esplicita.
- Settings: connect/disconnect, login browser ufficiale o device code scelto, annullamento/logout, API key soltanto azione esplicita, modello da catalogo reale. Session view reference 2: selettore modello/effort, messaggi/stream reale, nuovo thread, interruzione e prosecuzione sul thread esistente. Niente metriche, file, diff o test simulati.

### Policy permanente iniziale

T05 espone **readOnly** come modalità locale esplicita. Thread/turn/start fissano sandbox read-only, modelProvider openai e approvalPolicy on-request, senza full access o bypass OS. Le richieste comando/file che richiedono escalation vengono declinate con risposta schema-corretta e mostrano attività bloccata; metodi non supportati sono rifiutati, mai autoapprovati o lasciati pendenti. La gestione interattiva completa delle approvazioni e della scrittura è T07, sullo stesso protocollo. Non presentare T05 come esecuzione scrivente già disponibile. La sandbox della 0.159.2 limita scritture; non dichiarare un isolamento di lettura a root che il suo schema non espone.

Il servizio main consuma `item/agentMessage/delta`, item started/completed e turn completed/error, con snapshot limitati/coalescenza per IPC. Espone soltanto messaggi user/assistant e attività osservabili, nessun ragionamento privato. Mantiene il mapping thread atomico e ricostruisce cronologia da thread/resume/read, senza fidarsi di path/provider thread ID dal renderer. Su cambio cartella il mapping del vecchio cwd non viene riutilizzato; modifiche quota/protocollo/crash producono errore sanitizzato e nessun fallback API.

Il collegamento richiede il login personale nella finestra ufficiale: nessuna prova di inferenza autenticata viene dichiarata prima che il maintainer l'abbia completato nella home dedicata. Completare tutto il lavoro indipendente e la verifica reale handshake/modelli anonimi senza appropriarsi della sessione di questa chat.

## Percorso scelto

Usare **Codex app-server locale via stdio** nel processo desktop. L'account Codex resta personale; Nexus autentica separatamente l'accesso ai progetti. Il percorso principale usa il login ChatGPT gestito da Codex; API key solo con scelta esplicita. La documentazione ufficiale descrive entrambi i percorsi e lo storage locale delle credenziali. [Autenticazione](https://learn.chatgpt.com/docs/auth).

La versione fissata in T05 è 0.159.2; `pnpm codex:schema` genera i tipi con il suo `app-server generate-ts --out ...`. Il protocollo espone inizializzazione, thread, turni, delta e richieste di approvazione. I metodi account includono `account/read`, `account/login/start`, `account/login/cancel` e `account/logout`, verificati nello schema adottato. [App Server](https://learn.chatgpt.com/docs/app-server).

L'alternativa con OAuth gestito dall'app esiste, ma comporta un lifecycle distinto: non è la base scelta per Nexus. [Percorso OAuth](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

## Responsabilità del bridge Nexus

Il servizio desktop espone le operazioni validate `getState`, `connect`, `disconnect`, `login`, `cancelLogin`, `loginApiKey`, `logout`, `refreshModels`, `setupSandbox`, `openSession`, `newSession`, `send`, `interrupt`. I nomi e DTO autorevoli sono in `packages/contracts/src/codex.ts`; il bridge sottostante parla RPC ufficiali typed e non è accessibile al renderer. Le approvazioni interattive saranno aggiunte in T07.

- Home/configurazione runtime dedicata a Nexus e scelta esplicita di storage credenziali supportato dall'OS. Nessuna importazione dei file auth di altre applicazioni. Versione, percorso e account attivo visibili nelle impostazioni.
- Un supervisore per processo: handshake con timeout, correlazione richieste, framing JSON per linea, gestione richieste iniziate dal server, stderr separato, backpressure e shutdown. Non interpretare lo stdout con parser di testo libero.
- Mapping dei thread provider verso ID sessioni Nexus solo locali; il server conserva eventi di prodotto selezionati e non diventa un proxy delle credenziali AI.
- Schema provider isolato in `packages/codex-bridge/generated/`; eventi pubblici indipendenti in `packages/contracts`. Nessuna modifica manuale ai file generati per nascondere incompatibilità.
- Selezione modello da catalogo reale e comportamento su account/quota non disponibile. Nessun diritto di accesso dedotto dal nome del piano o dal solo elenco modelli.
- Context file scelti dall'utente dentro root autorizzata, con normalizzazione path, symlink e controllo traversal. Il progetto illustrativo può contenere Vue/TS; Nexus resta indipendente dal framework del repository aperto.
- Allegati e output inviati al server solo secondo policy di condivisione. Il contesto locale di Codex può essere più ampio della proiezione mostrata a un cliente.

## UI e semantica del prodotto finale

L'interfaccia mostra messaggi, file, piano dichiarato, strumenti/output e stati di avanzamento esposti. Non inventa una catena di pensiero o un ragionamento privato. Il riquadro di analisi della reference diventa una lista di attività realmente disponibili; senza piano/step osservabili mostra attività correnti senza numeri presunti.

`Pause` interrompe il turno tramite la capacità supportata; la ripresa è un nuovo turno sul thread esistente. Non promettere di congelare una shell a metà esecuzione. `Stop Session` interrompe/chiude secondo lo stato e rende visibili eventuali processi ancora in terminazione. `Publish Update` crea una bozza revisionabile da pubblicare, non inoltra l'intera chat.

I risultati test mostrano conteggi/coverage solo quando un report riconosciuto li fornisce; un comando con exit code zero senza report non prova un numero di test. I diff vengono dallo stato reale del repository/strumento. Le percentuali dei mockup non sono valori iniziali.

## Approvazioni interattive previste in T07

Tradurre ogni richiesta supportata dallo schema in un oggetto locale con sessione, turno, item, scopo e scadenza. La decisione torna esclusivamente alla richiesta ancora pendente. Nessuna autoapprovazione per timeout. Se il driver scompare, la richiesta resta in attesa o viene annullata secondo il runtime; i client remoti non guadagnano controllo.

L'approvazione di un piano nell'interfaccia, l'approvazione di esecuzione Codex e l'approvazione di un deliverable cliente sono tre azioni distinte. Non riutilizzare stato, tabella o pulsante in modo che una autorizzi le altre.

## Errori e verifiche necessarie

Gestire runtime assente/incompatibile, autenticazione annullata/scaduta, quota, errore protocollo, crash, cartella rimossa, permesso negato, output eccessivo e processo che non termina. Mostrare un recupero preciso e conservare la cronologia consentita; non sostituire il runtime con risposte finte o chiavi API automatiche.

T05–T07 devono dimostrare con il runtime adottato: login reale, richiesta completata, streaming, interruzione/ripresa, modifica file autorizzata, approvazione risolta una sola volta e ripresa dopo riavvio. Registrare separatamente Windows, macOS e Linux, senza estendere una prova Windows agli altri OS. Le prove che usano account e build del maintainer vengono indicate come tali nel task.

## Prova manuale T05

Da T04 non occorrono nuove variabili o migrazioni. Chiudere app/backend precedenti, eseguire `pnpm install --frozen-lockfile` e `pnpm package:win`, poi riavviare il backend con `pnpm start:server` e l'app aggiornata oppure `pnpm start:desktop`. Mailpit serve alle email Nexus/inviti; avviarne una sola istanza se necessaria. Codex richiede connettività ai servizi ufficiali e storage sicuro OS funzionante.

1. Accedere a Nexus. Da 0.5.1 il runtime si collega automaticamente una volta per account verificato; in Settings, riquadro **Codex runtime**, deve apparire versione **0.159.2** e percorso locale. **Connect Codex** resta disponibile per un collegamento manuale dopo errore/Disconnect. Nessun profilo di altre app viene letto e nessuna pagina di login viene aperta automaticamente. Il proprio login persistito nel keyring viene ripreso dal runtime.
2. Premere **Sign in with ChatGPT**, completare il login nella pagina ufficiale e tornare a Nexus; email/piano riportati devono comparire. Non serve un'API key per questo percorso. Se necessario scegliere **Use device code** e completare URL/codice mostrati; annullamento disponibile. Le credenziali non vanno inserite in chat o nel `.env` Nexus.
3. Su Windows premere **Set up Windows sandbox** e attendere l'esito. L'azione usa il setup `unelevated` ufficiale, senza abilitare full access. Un errore va risolto prima di richieste che usano strumenti locali; non aggirarlo disabilitando la sandbox.
4. Selezionare un progetto owner/developer e in **Repos** collegare repository e cartella locale esistente. Aprire **AI Session**, scegliere modello/effort disponibili e inviare: «Leggi il README di questa cartella e riassumi il progetto in tre punti. Non modificare file.» Verificare risposta progressiva e attività reali; nessuna scrittura prevista.
5. Inviare una seconda richiesta, interromperla mentre è in corso con Pause/interruzione, poi inviare un nuovo messaggio sullo stesso thread. Riaprire l'app, ricollegare il runtime e la stessa sessione: la cronologia deve essere ripresa. **New session** crea un thread distinto. Cambiare cartella non deve riaprire quello del vecchio binding.
6. Provare logout Codex e logout Nexus separati: il primo revoca il login Codex sul dispositivo; il secondo ferma il runtime e cancella lo stato visibile. Il login Codex resta nel suo keyring finché non viene esplicitamente revocato. Altri account Nexus hanno una home distinta.

Il catalogo modelli può esistere anche senza login: non prova accesso, piano o quota per completare una richiesta. In caso di indisponibilità nessun passaggio automatico a fatturazione API. La modalità T05 è **readOnly**: diff/scritture e approvazioni interattive sono T07, selezione contesto avanzata T06, condivisione/realtime T08. Il server Nexus deve restare raggiungibile per ricontrollare sessione e ruolo; gestione offline estesa prevista in T08.

`pnpm verify:codex` esercita il binario reale con una home anonima temporanea: versione, initialize, account/read nullo, catalogo e arresto. Non effettua login o inferenza, non legge credenziali preesistenti. I test di servizio coprono isolamento, ruoli, stream/limiti, ripresa, policy, login/cancel ed errori con trasporto controllato; non sostituiscono i passi autenticati sopra. Evidenze aggiornate in [status.md](status.md).
