# Integrazione Codex

## Percorso scelto

Usare **Codex app-server locale via stdio** nel processo desktop. L'account Codex resta personale; Nexus autentica separatamente l'accesso ai progetti. Il percorso principale usa il login ChatGPT gestito da Codex; API key solo con scelta esplicita. La documentazione ufficiale descrive entrambi i percorsi e lo storage locale delle credenziali. [Autenticazione](https://learn.chatgpt.com/docs/auth).

Fissare la versione runtime in T05 e generare i tipi con `codex app-server generate-ts --out ...`. Il protocollo espone inizializzazione, thread, turni, delta e richieste di approvazione. I metodi account includono `account/read`, `account/login/start`, `account/login/cancel` e `account/logout`. Verificare i nomi nello schema adottato. [App Server](https://learn.chatgpt.com/docs/app-server).

L'alternativa con OAuth gestito dall'app esiste, ma comporta un lifecycle distinto: non è la base scelta per Nexus. [Percorso OAuth](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

## Responsabilità del bridge Nexus

Il bridge fornisce a Nexus le operazioni interne `connect`, `readAccount`, `signIn`, `signOut`, `listModels`, `startThread`, `resumeThread`, `startTurn`, `interruptTurn`, `resolveApproval`, `subscribe` e `dispose`. Questi sono nomi dell'adapter da implementare, non firme RPC ufficiali.

- Home/configurazione runtime dedicata a Nexus e scelta esplicita di storage credenziali supportato dall'OS. Nessuna importazione dei file auth di altre applicazioni. Versione, percorso e account attivo visibili nelle impostazioni.
- Un supervisore per processo: handshake con timeout, correlazione richieste, framing JSON per linea, gestione richieste iniziate dal server, stderr separato, backpressure e shutdown. Non interpretare lo stdout con parser di testo libero.
- Mapping dei thread provider verso ID sessioni Nexus solo locali; il server conserva eventi di prodotto selezionati e non diventa un proxy delle credenziali AI.
- Schema provider isolato in `packages/codex-bridge/generated/`; eventi pubblici indipendenti in `packages/contracts`. Nessuna modifica manuale ai file generati per nascondere incompatibilità.
- Selezione modello da catalogo reale e comportamento su account/quota non disponibile. Nessun diritto di accesso dedotto dal nome del piano o dal solo elenco modelli.
- Context file scelti dall'utente dentro root autorizzata, con normalizzazione path, symlink e controllo traversal. Il progetto illustrativo può contenere Vue/TS; Nexus resta indipendente dal framework del repository aperto.
- Allegati e output inviati al server solo secondo policy di condivisione. Il contesto locale di Codex può essere più ampio della proiezione mostrata a un cliente.

## UI e semantica

L'interfaccia mostra messaggi, file, piano dichiarato, strumenti/output e stati di avanzamento esposti. Non inventa una catena di pensiero o un ragionamento privato. Il riquadro di analisi della reference diventa una lista di attività realmente disponibili; senza piano/step osservabili mostra attività correnti senza numeri presunti.

`Pause` interrompe il turno tramite la capacità supportata; la ripresa è un nuovo turno sul thread esistente. Non promettere di congelare una shell a metà esecuzione. `Stop Session` interrompe/chiude secondo lo stato e rende visibili eventuali processi ancora in terminazione. `Publish Update` crea una bozza revisionabile da pubblicare, non inoltra l'intera chat.

I risultati test mostrano conteggi/coverage solo quando un report riconosciuto li fornisce; un comando con exit code zero senza report non prova un numero di test. I diff vengono dallo stato reale del repository/strumento. Le percentuali dei mockup non sono valori iniziali.

## Approvazioni

Tradurre ogni richiesta supportata dallo schema in un oggetto locale con sessione, turno, item, scopo e scadenza. La decisione torna esclusivamente alla richiesta ancora pendente. Nessuna autoapprovazione per timeout. Se il driver scompare, la richiesta resta in attesa o viene annullata secondo il runtime; i client remoti non guadagnano controllo.

L'approvazione di un piano nell'interfaccia, l'approvazione di esecuzione Codex e l'approvazione di un deliverable cliente sono tre azioni distinte. Non riutilizzare stato, tabella o pulsante in modo che una autorizzi le altre.

## Errori e verifiche necessarie

Gestire runtime assente/incompatibile, autenticazione annullata/scaduta, quota, errore protocollo, crash, cartella rimossa, permesso negato, output eccessivo e processo che non termina. Mostrare un recupero preciso e conservare la cronologia consentita; non sostituire il runtime con risposte finte o chiavi API automatiche.

T05–T07 devono dimostrare con il runtime adottato: login reale, richiesta completata, streaming, interruzione/ripresa, modifica file autorizzata, approvazione risolta una sola volta e ripresa dopo riavvio. Registrare separatamente Windows, macOS e Linux, senza estendere una prova Windows agli altri OS. Le prove che usano account e build del maintainer vengono indicate come tali nel task.
