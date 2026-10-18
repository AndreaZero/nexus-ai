# Matrice di accettazione del prodotto

Base 0.17.1, piano T01–T16, onboarding T17 e polish T18. La matrice separa **funzionalità implementate**, **controlli eseguiti** e **accettazione personale o di piattaforma**. I fixture dei verifier sono isolati dal normale avvio e non diventano dati fittizi dell'app. Il mandato di sviluppo non certifica percorsi personali o piattaforme non provate. Il polish verifica adattamento e raggiungibilità di controlli; l'accettazione visiva finale resta del maintainer.

| Requisito | Implementazione | Evidenze automatiche disponibili | Verifica personale/esterna distinta |
| --- | --- | --- | --- |
| R01 desktop multipiattaforma | Main/preload/renderer condivisi, vendor e package nativi Windows/macOS/Linux | T18: package/smoke Windows 0.17.1 e CI sorgente su tre OS passati; T17: Codex confezionato 0.159.2. T16: package NSIS/DMG/AppImage 0.16.0 sui tre OS con manifest/hash; build Windows confermata dal maintainer | Prova personale dell’onboarding 0.17.0 su Windows e desktop Mac/Linux; firma/notarizzazione richiedono credenziali |
| R02 collaborazione | Workspace/progetti, membership, inviti e ruoli correnti | PostgreSQL/SMTP/HTTP, isolamento/revoca/concorrenza T04/T08/T11–T14 | Utenti reali e SMTP del proprio server ospitato |
| R03 Codex personale | Solo Codex 0.159.2, login e home/keyring Nexus, API opzionale esplicita | Binario reale anonimo/handshake/catalogo e provider controllato; recovery mirato T15 | Richiesta completa, interruzione e approvazioni con account personale; nessuna inferenza avviata dai verifier |
| R04 filesystem locale | Binding account/progetto, contesto scelto, Git e modifiche/diff | Git/filesystem effettivi isolati T05–T07/T12; canonicalizzazione e alias root T15 | Cartelle, permessi e selettori nativi Mac/Linux |
| R05 sessione completa | Chat/piano/contesto/diff/output/test/approvazioni del driver e Share selezionato | Renderer/preload/Git/TAP con provider controllato T07/T11/T12; recovery T15 | Workflow personale completo sul proprio repository |
| R06 realtime | Outbox/ACK/replay, presenza, coda testo bounded e revoca | HTTP/WS/PG reali e riconnessione/idempotenza T08–T14 | Due dispositivi su server/rete effettivi con TLS/proxy |
| R07 Overview | Presenza/sessioni/feed/task/health/deploy/notifiche da domini reali | Proiezioni T09–T14 e catture/geometrie reference 3 T15 | Conferma con dati reali e requisiti health scelti |
| R08 Pulse | Milestone/progressi, outcome/consegne/feedback, wave e audience | PG/HTTP/WS T10/T11/T13 e catture reference 1 T15 | Accettazione finale del maintainer e del flusso cliente reale |
| R09 task | CRUD/stato/assegnazioni/commenti, milestone/roadmap e link sessioni | CAS/ricevute/ruoli su PG/HTTP T11 e ricerca T14 | Uso con collaboratori effettivi |
| R10 Git/GitHub | Commit selettivo, branch/sync espliciti, PR/review e webhook | Git reale; API GitHub controllata, cifratura, ricevute e firma/replay T12 | Token/repository personale, push/PR/review e webhook HTTPS esterno |
| R11 consegne | Anteprima/audience, revisioni/allegati, feedback e decisioni cliente | Percorso e download autorizzati PG/HTTP/WS T11 | Consegna e decisione con cliente reale |
| R12 ambienti | Registro manuale, URL/PNG scelti, health con fonte/TTL e preview isolata | T13:8 test server+8probe+8 web;6 scenari PG/HTTP;13UI; finestra preview effettiva separata | Registrare build/staging effettivi; nessuna pipeline cloud avviata implicitamente |
| R13 ricerca/settings |10 tipi pubblicati con ACL prima del match, profilo/preferenze CAS, notifiche/cursore e endpoint isolati | T14:5 test server+10 native+7 web;5 scenari PG/HTTP e9UI | Ricerca sui propri dati, riavvio e configurazione del proprio host |
| R14 reference | Tre composizioni1586×992, pianeta/particelle/wave e riduzione movimento | T15:14 controlli/17 catture, geometrie e testi lunghi,960 px; tre catture pubbliche controllate | Confronto estetico umano e movimento/GPU/font sul dispositivo; nessuna identità pixel dichiarata |
| R15 recupero/accessibilità | Focus/dialog/tastiera, vuoti/offline/auth, boundary React e recupero crash esplicito | T15:6 controlli boundary,5processo con2crash QA;28 Codex/14 bridge e39Codex+context dopo fix concreto | Tecnologie assistive, sessione personale e percorsi di recupero su altre piattaforme |
| R16 open source/manutenzione | GitHub MIT, regole/skill, guide, container, migrazioni/backup/restore, CI/package/checksum | T16:5 verifiche PG locale,6 scenari Docker reali con SMTP/persistenza e restore completo su DB vuoto; package CI dei tre OS, evidenze in status | Host reale, SMTP/TLS/segreti, backup esterni, ripristino e aggiornamento operativo del proprio servizio |

I conteggi dei test mirati T15 non sono sommabili: il gruppo39Codex+context comprende verifiche ripetute dopo il fix di canonicalizzazione;28 Codex/14 bridge descrivono una precedente verifica motivata di recovery. Analogamente, le suite finali sono registrate separatamente in status, senza sommare esecuzioni ripetute.

## Evidenze consultabili

- [Stato finale e risultati effettivi per versione](status.md), [piano](plan.md) e [changelog](../CHANGELOG.md).
- [CI T16 riuscita su Windows/macOS/Linux](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475946): check/test/build e package nativi con manifest/hash, distinti dalla prova GUI personale.
- [Revisione visuale e catture controllate T15](design/t15-review.md), con report delle tre reference.
- [Setup/upgrade/backup](self-host.md) e [distribuzione nativa](release.md).

Il package unsigned non equivale a una release firmata. La readiness non dimostra consegna SMTP, login Codex o salute del progetto; queste prove hanno fonti e consensi propri. Il prodotto è implementato nel perimetro previsto, ma l'accettazione completa di R01 resta aperta fino alle prove native richieste. Dopo la consegna T16 il maintainer ha autorizzato T17. La guida iniziale ha12controlli Electron e6scenari PG/HTTP reali passati; login/permessi OS e prima inferenza personali restano manuali. T18 aggiunge polish e verifica delle dieci rotte a tre viewport, con composer visibile prima dello scroll, dialoghi e azioni raggiungibili. Il lavoro corrente si arresta alla consegna T18.
