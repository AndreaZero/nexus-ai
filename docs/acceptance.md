# Matrice di accettazione del prodotto

Questa matrice distingue funzionalità implementate, prove automatiche e accettazione del maintainer. Le fixture dei verifier sono isolate dal normale avvio: non simulano dati di lavoro nell’app distribuita. Il mandato T13–T16 consente la prosecuzione senza conferme intermedie, ma non certifica prove personali o piattaforme non eseguite.

| Requisito | Implementazione e prove disponibili | Verifica personale o esterna ancora distinta |
| --- | --- | --- |
| R01 desktop multipiattaforma | Main/preload/renderer condivisi, runtime nativo e packaging per Windows/macOS/Linux; smoke e package Windows effettivi | Build ed esecuzione native Mac/Linux; firma e notarizzazione con credenziali del maintainer |
| R02 collaborazione | Workspace/progetti/inviti/ruoli, PostgreSQL/HTTP e revoca verificati inT04/T08/T11–T14 | Percorso con utenti e SMTP reali del server ospitato |
| R03 Codex personale | Protocollo ufficiale0.159.2 fissato, login/keyring isolato, API opzionale esplicita e nessun fallback automatico; test provider controllato | Richiesta e approvazioni con account personale, nessuna inferenza avviata dai verifier |
| R04 filesystem locale | Binding per account/progetto, file scelti, Git e modifiche/diff reali isolati; test T05–T07/T12 | Cartelle e permessi nativi su Mac/Linux |
| R05 sessione completa | Chat/contesto/piano/diff/output/test/approvazioni, publisher estratti selezionati; verifier Electron T07/T11/T12 | Workflow personale completo sul proprio repository |
| R06 realtime | Outbox/ACK/replay/idempotenza/ruoli, presenza e revoca con HTTP/WS reali T08 | Due dispositivi su rete/server ospitato, TLS e proxy effettivi |
| R07 Overview | Presenza/feed/task/sessioni/health/deploy/notifiche da domini reali; T09/T11–T14 | Accettazione visiva con dati personali e soglie health scelte |
| R08 Pulse | Milestone/progressi/outcome/consegne/feedback, wave e audience; T10/T11/T13 | Conferma finale delle tre viste da parte del maintainer |
| R09 task | CRUD/stato/assegnazioni/commenti/roadmap/link sessioni, CAS e PG/HTTP T11 | Uso del flusso con collaboratori reali |
| R10 Git/GitHub | Git locale effettivo; token cifrati, PR/review SHA e webhook firma/replay con API controllata T12 | Token/repository GitHub personale, push/PR/review e webhook HTTPS esterno |
| R11 consegne | Pubblicazione con anteprima/audience, revisioni/allegati/feedback/decisioni e ruoli T11 | Consegna e decisione del cliente reale |
| R12 ambienti | Registro manuale effettivo, URL/PNG scelti, health con fonte/TTL, preview isolata e HEAD locale consensuale T13 | Registrare una build o staging effettivo; nessuna pipeline cloud implicita |
| R13 ricerca/settings | ACL prima del match,10tipi/messaggi pubblicati, CAS preferenze/profilo e notifiche, endpoint/profili/CSP T14 | Riavvio nativo e ricerca con propri dati dopo la build finale |
| R14 reference | Tre PNG autoritative, geometria1586×992, scene pianeta/particelle/wave deterministiche, screenshot e movimento ridotto | Le PNG non definiscono animazioni; ricostruzioni e differenze documentate, accettazione estetica umana |
| R15 recupero/accessibilità | Focus/dialog/keyboard, stati vuoto/offline/auth/runtime e test mirati; ulteriore review T15 | Tecnologie assistive e percorso personale sulle altre piattaforme |
| R16 open source/manutenzione | Repository GitHub MIT, istruzioni agenti/skill, docs/changelog per task; T16 setup/release | Gestione segreti/SMTP/TLS, backup conservati esternamente e prove operative del proprio host |

Le prove successive e il risultato finale di distribuzione sono registrati in [status.md](status.md). Questa matrice non trasforma un package unsigned in una release firmata e non dichiara l’accettazione completa di R01 finché mancano le prove native richieste.
