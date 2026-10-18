# Stato operativo

**T18 integrata e consegnata — 0.17.1, in attesa di verifica manuale del maintainer. Polish di layout e controlli completato; nessun task successivo avviato.**

## Ownership T18 integrate e rilasciate

Un solo intervento di rifinitura, senza nuove feature di dominio o modifiche a DB/runtime/auth. Uscita: contenuti e azioni raggiungibili a 1586×992, 1280×720 e 960×640, testi lunghi, dialoghi e tastiera; palette/composizione originali conservate. Verifica visuale con fixture dichiarate, nessuna inferenza personale.

| Fronte | Percorsi scrivibili | Contratto e consegna |
| --- | --- | --- |
| /root/polish_session | apps/web/src/session/session.css, apps/web/src/repositories/repositories.css, apps/web/src/views/SessionView.tsx, apps/web/src/session/SessionPanels.tsx, apps/web/src/session/CodeWorkspace.tsx | Correggere overflow di sessione, strumenti, composer, diff/code e toolbar locali. Nessun provider/contratto/azione nuova. Segnalare cause e controlli; non editare app.css o primitive condivise. |
| /root/polish_pages | apps/web/src/{collaboration,work,deployments,onboarding,application,codex,overview,pulse}/*.css | Layout e controlli delle pagine, card a contenuto lungo e finestre ridotte; preservare griglie reference al viewport originale. CSS di dominio soltanto; proporre cambi TSX al coordinatore. |
| /root/polish_qa | apps/desktop/src/polish-verification.ts, scripts/verify-polish.mjs | Verifica Electron con renderer/preload reali e fixture controllate riusando l’impostazione acceptance: viewport reference/1280×720/960×640, pagine e dialoghi, raggiungibilità di azioni e screenshot. Nessun account personale o inferenza. Coordinatore esegue dopo build integrata. |
| Coordinatore | app.css, integration.css, shell/AppShell.tsx, packages/ui, dialoghi condivisi, docs/manifests e verifica visuale | Shell/sidebar/header, menu/dialoghi, integrazione e verifica finale con renderer reale; un solo autore per config/versioni. |

## Integrazione T18 — 0.17.1

Cause corrette: header ad altezza fissa non compatibile con toolbar su più righe, sidebar con altezza minima e selettori nascosti in modalità compatta, griglie intrinseche che si allargavano con nomi/URL lunghi, azioni locali rimosse ai breakpoint e liste con righe compresse o overflow nascosto. Card e colonne restano fedeli alla composizione originale; lo scorrimento è confinato a liste, tab, contesto e codice dove serve. Per la sessione il frame segue l'altezza effettiva dell'header e riserva spazio al composer: su una finestra bassa messaggi e contesto scorrono senza spingere il campo di invio fuori dalla vista iniziale. Ridotto movimento e focus sono conservati.

Dialoghi centrati nel viewport e moduli con primo campo abilitato a fuoco; Escape e chiusura ripristinano il focus. Il padding interno non equivale più al backdrop. Pulsanti con label lunghe e gruppi azioni possono andare a capo. Nessun cambiamento ad autorizzazioni, login, runtime/protocollo Codex o dati condivisi; nove migrazioni e dipendenze invariate. Le versioni applicative/health/immagine server sono allineate a 0.17.1; UI e bridge mantengono le rispettive versioni interne.

Check completo passato: typecheck/lint e **121 confini renderer**. Build completa passata; dopo la correzione concreta del composer su 1280×720 è stata ricompilata la sola web app. Bundle renderer 762.61kB, warning chunk esistente non bloccante. Corrette anche due diagnostiche del solo verifier (cause dell'errore e firma console Electron), con ESLint mirato e typecheck desktop passati.

**Verifica finale passata: 30 combinazioni pagina/viewport, 7 gruppi di controlli, 19 catture e 129 misure.** Dieci rotte a 1586×992, 1280×720 e 960×640: Overview, Pulse, Sessione, Projects, Repos, Tasks, Docs, Deployments, Settings e Getting started. I check usano scorrimento reale, geometria degli antenati e hit test; coprono sidebar/selettori, cinque azioni sessione, policy, due preview Pulse, footer di moduli lunghi, click nativi su padding/backdrop, Escape, ritorno focus, ricerca e skip link. Il composer è verificato prima di qualsiasi scroll automatico: fondo a 922/992px, 650/720px e 570/640px nei tre viewport. Report .nexus/visual/t18/polish-report.json.

L'ispezione degli screenshot ha motivato due rifiniture concrete: frame sessione per il composer, seguito dal pass finale completo; poi rail Overview/Pulse spostato sotto il contenuto già sotto 1366px, per non comprimere KPI e label su 1280px. **Ricontrollo mirato delle sole due dashboard passato**: 3 gruppi, 2 catture e 8 misure a 1280×720, incluse le due azioni preview tramite scroll; report polish-dashboard-report.json. Package Windows x64 unsigned 0.17.1 riuscito: 220126746 byte, sorgente d8d3556 pulito (sourceDirty=false), firma osservata unsigned. SHA-256: 111a2fc1a954e9b4fcde3044c320ca32969ece8e2888d74948e3725bd043b465. Manifest/checksum accanto all’installer; report windows-package-report.json. Smoke dell’eseguibile confezionato passato con profilo isolato, renderer e IPC validati, Node assente. Nessuna installazione o inferenza personale. Aperte PNG1/2/3 e catture effettive delle tre viste, compresi sessione 1280/960, Pulse1280 finale e footer deploy960. Catture pubbliche selezionate in docs/design/captures/t18-*.png.

L'harness usa renderer/preload di produzione e DTO controllati dichiarati, senza inferenza, DB o credenziali personali. Un ReferenceError del solo harness e il suo budget iniziale insufficiente sono stati corretti senza allentare le asserzioni. La suite funzionale completa non viene ripetuta localmente per sole modifiche di presentazione; i controlli CI restano distinti. Screenshot Settings/Repos con percorso temporaneo QA conservati solo nell'area ignorata; le catture pubbliche selezionate non contengono percorsi locali.

**CI sorgente d8d3556 passata su Windows/macOS/Linux**, con installazione lockfile, check, suite funzionale completa e build su ogni runner: [run 39109700346](https://github.com/AndreaZero/nexus-ai/actions/runs/39109700346). T18 non ripete installer o GUI Mac/Linux; il package Windows e la CI sorgente restano prove distinte. Runtime Codex 0.159.2, 9 migrazioni e configurazione personale conservati. [Issue 18](https://github.com/AndreaZero/nexus-ai/issues/18). Tutti i fronti integrati e ownership rilasciate; sviluppo fermo alla consegna T18 in attesa della prova manuale.


## Mandato e ownership T17 integrate e rilasciate

Nuova autorizzazione dopo l'arresto T16: implementare con multiagenti l'onboarding fino alla prima sessione Codex, mantenendo le reference. Sei passi account/workspace/project/folder/codex/session, ripresa e rimando locali per account/authority; progressi derivati da dati correnti. Nessuna inferenza, pubblicazione, scrittura file o modifica permessi automatica. Ramo client/browser senza requisiti Codex locali; inviti preservati. Nessuna migrazione o nuova dipendenza prevista.

| Agente | Percorsi scrivibili | Obiettivo e contratto |
| --- | --- | --- |
| /root/onboarding_state | apps/web/src/onboarding/state.ts,OnboardingProvider.tsx,apps/web/test/onboarding.test.mjs | Derivazione prerequisiti/ruoli e stato locale UI soltanto, receipt prima risposta scoped account/progetto/repository/bindingstamp, storage fallibile, no autorizzazioni o segreti persistiti. Hook contract sotto; test isolamento/revoca/reset/errori. |
| /root/onboarding_ui | apps/web/src/onboarding/OnboardingView.tsx,OnboardingSummary.tsx,onboarding.css; collaboration/ProjectsPage.tsx,RepositoryPage.tsx | Guida e riepilogo stile PNG1/2/3, riuso dialog workspace/project e RepositoryDetails esportato con callback binding. Non editare provider/state/App/shell/contracts. Focus/tastiera/960/reduced, nessuna azione automatica. |
| /root/onboarding_qa | apps/desktop/src/onboarding-verification.ts,scripts/verify-onboarding.mjs,docs/onboarding.md | Harness Electron/preload reale con DTO controllati dichiarati, percorso signedout→setup→prima risposta simulata soloQA, reload/skip/role/invite/noautosend/nooverwrite, screenshot1586/960/reduced. Root esegue build. |
| Coordinatore | App.tsx/routes.ts/shell/types.ts/AppShell.tsx/ApplicationSettings.tsx, codex/CodexProvider.tsx, contratti Codex e desktop/codex*.ts test, manifest/versioni/docsstatusplanchangelog | Integrazione, refreshBinding disponibile al form riusato; stato Windows sandbox osservabile da notifica ufficiale, QA mirata/build/smoke e consegna. Un autore per confini. |

Hook fisso useOnboarding(): steps readonly {id,title,description,complete,available}[], stepId (account/workspace/project/folder/codex/session), selectStep(id),next(),back(),completed,dismissed,storageAvailable,autoStart,mode(developer/observer/browser),dismiss(),restart(). Provider usa contesti esistenti e nessuna fetch supplementare. autoStart suggerisce solo UI; root gestisce routing una volta al bootstrap senza interferire inviti/deep link. Receipt locale per prima risposta completa non autorizza nulla ed è valida solo nel binding corrente. Finché caricamento/errore/revoca, prerequisiti non diventano verdi da storage.

Contratti aggiuntivi coordinatore: CodexState.windowsSandbox opzionale enum unknown/running/ready/failed/not_applicable, osservato in main da setupCompleted (setup richiesta accettata non equivale successo). CodexContext.refreshBinding():Promise<void>. RepositoryDetails({project,onBindingChange?}) esportato e callback dopo select/remove; EntityEditor esportato per dialog creazione. Ultimo passo usa sessione/bozza esistenti: suggerimento solo se bozza vuota, invio esplicito nel composer, nessun reset automatico di conversazioni/permessi.


## Mandato T13–T16 del18ottobre2026

Il maintainer autorizza esplicitamente di procedere fino a T16 senza soste tra task e di fermarsi al termine. Si mantiene l'ordine T13→T14→T15→T16 e si integra/verifica ciascuna task prima della seguente. Questa autorizzazione sostituisce l'attesa del via dopo ogni consegna; non equivale a prove native Mac/Linux o firma/credenziali esterne disponibili. T12 manuale resta distinto dal via allo sviluppo.

## Integrazione T17: repository locale senza remoto

Il form esistente richiedeva un URL HTTPS anche prima del primo collegamento locale. Per rendere GitHub effettivamente facoltativo nel nuovo flusso, il metadato remoteUrl ammette stringa vuota come remoto non configurato; è una assenza esplicita, non un URL fittizio. La colonna SQL già accetta questo valore: nessuna migrazione. Gli URL non vuoti mantengono tutte le verifiche HTTPS/credenziali. I controlli GitHub non vengono avviati senza URL GitHub; Git e Codex locali mantengono ruolo/binding.

Ownership aggiuntiva prima della delega: /root/onboarding_data possiede apps/server/src/onboarding-data.test.ts e scripts/verify-onboarding-data.mjs per regressioni contract/PG/HTTP su repository senza remoto; può proporre, non editare, contratti o servizi fuori questi file. Root integra schema repository location, RepositoryPage e display/use-repository UI. Test reali solo fixture proprio, nessuna lettura log di segreti, nessuna inferenza o GitHub esterno. Root possiede anche CodexSettings e auth/configuration per stato typed/setup e destinazione finale login web.

## Evidenze T17

Implementazione **0.17.0** integrata. Guida in sei passi con account/progetti/cartelle/runtime reali, UI riusata e ramo cliente/browser; prima richiesta soltanto dopo click Send. Dopo una risposta completa osservata si conserva anche il rimando per evitare di forzare il setup al successivo avvio freddo; i check correnti non vengono autorizzati da quella preferenza. Una bozza esistente, anche fatta di soli spazi, e una conversazione già aperta restano intatte.

- **Check passato**: typecheck/lint e120confini renderer. Primo controllo corretto per il tipo dei tab dopo l’aggiunta della nuova route; nessun errore residuo. Build completa passata, renderer761.62kB (warningchunk non bloccante). Dopo la rifinitura del solo copy cliente, typecheck/lint web mirati passati; il package ricompila i bundle finali.
- **Suite generale passata:337test e1skip POSIX su Windows**,338casi totali:14bridge,9DB(8pass/1skip),71web,112server,125desktop,7script. I10test derivazione onboarding,3contratto e31DesktopCodex sono sottoinsiemi, non conteggi aggiuntivi.
- **Electron/preload produzione:12controlli passati e11catture**, DTO controllati dichiarati per account/browsertransfer, selezione cartella, catalogo, sandbox e risposta; nessuna credenziale/inferenza personale. Coperti bootstrap, form, remoto opzionale, skip/ripresa, bozza, noautosend/cambio policy, receipt senza transcript, nuovo binding con vecchia sessione, invito/cliente, tastiera/960/reduced. Le correzioni dell’harness hanno riguardato locator dopo avanzamento e osservazione characterData; il difetto URL effettivo è stato corretto in produzione prima del pass finale. Report .nexus/visual/t17/onboarding-report.json.
- **PostgreSQL/SMTP/HTTP reali:6scenari passati**, senza DDL o GitHub esterno: due account propri verificati, metadato remoto vuoto persistente dopo restart server isolato, salvataggi ripetuti e aggiunta HTTPS sullo stesso ID, URL invalidi400 senza mutazioni, invito client e repository redatto/negato. Fixture ed email proprie eliminate; account/workspace esistenti e intero journal/hash invariati. Report onboarding-data-report.json.
- Aperte PNG1/2/3 e cinque catture effettive: account, cartella, prima sessione, client e960reduced. Sidebar/pianeta, palette navy/ciano/blu/viola, card e stepper coerenti; rail294px e nessun overflow orizzontale. Nuova composizione senza PNG dedicata, nessuna identità pixel dichiarata. Catture controllate pubbliche in docs/design/captures/t17-onboarding*.png; copy cliente finale adattato al ruolo.
- Audit:1753file sorgente/build testuali,0corrispondenze dei valori privati cercati,0account/0workspace QA residui,1account esistente e9migrazioni conservati. Nessuna migrazione o nuova dipendenza.

Il suggerimento finale è stato rifinito dopo il primo package: lettura senza modifiche, con ispezione readonly consentita, evitando un divieto generale che ostacolerebbe la lettura del README. Cambia soltanto il testo, senza alterare invio, policy o permessi; non si ripetono le suite funzionali per questo edit. Il package viene ricompilato per allinearlo al sorgente finale. **Package Windows x64 0.17.0 riuscito**,220124864byte, dal commitf9f30d1 pulito (sourceDirty=false). Firma Authenticode osservata unsigned. SHA-256: e931e3459bed2657169c9934da332a93b09f285ee2cc176586fea4798d086b83. Manifest e checksum accanto all’installer; report .nexus/visual/t17/windows-package-report.json. Esclusa installazione automatica. **Smoke dell’eseguibile confezionato passato**: renderer/IPC e Node assente; profilo isolato. **Codex confezionato 0.159.2 passato**: initialize/account anonimo/catalogo8modelli e shutdown, nessuna inferenza o credenziale personale.

**CI del sorgente finale f9f30d1 passata su Windows, macOS e Linux**: installazione con lockfile, check, test e build riusciti su tutti e tre i runner. [Run 39107765517](https://github.com/AndreaZero/nexus-ai/actions/runs/39107765517). Questa verifica non esegue gli installer o il login personale sui tre sistemi.

I package macOS/Linux di T16 restano evidenze storiche0.16.0; T17 non ripete i package di questi sistemi e non dichiara esecuzione GUI personale. Il database resta a 9 migrazioni, senza reset di account o .env. Le prove finali con login/permessi OS e prima risposta personali sono del maintainer. [Issue17](https://github.com/AndreaZero/nexus-ai/issues/17), [guida](onboarding.md), [matrice](acceptance.md). Tutti i fronti agenti sono integrati e rilasciati; root completa la distribuzione e si ferma alla consegna T17.

## Ownership T16 integrate e rilasciate

| Agente | Percorsi scrivibili | Contratto/uscita |
| --- | --- | --- |
| /root/t16_ops | Dockerfile,.dockerignore,compose.yaml,deploy/**,packages/db/src/operator*.ts e readiness.ts,apps/server/src/operations*.ts/config.ts/config.test.ts,scripts/database.mjs e verify-operations.mjs,docs/self-host.md | Setup selfhost reale senza Codexserver, readinessreadonly, proxytrust esplicito, operator migrate/backup/restore con confermadb/emptytarget; QA solo schema proprio |
| /root/t16_release | .github/workflows/**,apps/desktop/electron-builder.yml,apps/desktop/scripts/release*.mjs,scripts/release*.mjs,docs/release.md | Packaging nativo3OS, artifacts/checksums, unsigned/signed separati, notarizationsecredenziali; fonti ufficiali v26, noaggiornamentideps nonnecessari |
| /root/t16_docs | README.md,CONTRIBUTING.md,docs/README.md,docs/architecture.md,docs/acceptance.md,docs/sources.md,THIRD_PARTY_NOTICES.md | Stato finale e guide aggiornate/completamentoR01–R16 con limiti veri, setup/buildWindows/3OS; nonstatus/plan/changelog/AGENTS |
| /root/t16_docs — QA Docker dopo handoff | scripts/verify-self-host.mjs | Compose effettivo con progetto/volumi/image/secret propri; readiness prima/dopo migrazione, SMTP/signup, backup/restoreDBQA, cleanup isolato |
| Coordinatore | contratti/DBexport/app.ts/logging/manifest/versioni/.env.example,status/plan/changelog/AGENTS,verifiche/packageGitHub e .gitignore/email.ts | Integrazione un autore, tests/check/build finali, backupQA isolato, packageWindows e smoke; stopdopoT16 |

Contratto readinessResponseSchema in contracts/operations.ts: GET/ready readonly, statusready/not_ready; checks.database, schema(current/pending/mismatch/unavailable), accounts/emailconfigured, timestamp. Factoryserver readOperationalReadiness(database,config,version) restituisce DTO. DB readiness controlla journal/hash migrazioni senza eseguireDDL. Config trustedProxies readonlystring[] default[] validIP/CIDRespliciti; mainFastify rootintegra. Operator produzione richiede --confirm-database nomeesatto, restore soltanto databasevuoto nooverwriteimplicit; backupsegreti separati, PGpasswordchildenvnonargv/log. QA pg_dump/pg_restore solo schemaQAproprio nella nexus_ai_dev (ruolononCREATEDB), nessunrestorepublic. Compose singleinstance+PGprivate+SMTPconfig esterna/optionalMailpitdev, TLSreverseproxy esplicito, secretstemplate nonvalori privati. Rootmanifestsseparati e nessun install/commit agenti.

## Evidenze T16

Versione applicazione **0.16.0**, Codex **0.159.2**, nove migrazioni. T16 non aggiunge tabelle o migrazioni applicative. Sono implementati container server senza Electron/Codex, PostgreSQL privato, Mailpit nel solo profilo development, proxy attendibili espliciti e STARTTLS per SMTP autenticato. La readiness confronta tutta la cronologia delle migrazioni senza DDL; migrate, backup e restore restano azioni esplicite dell'operatore.

### Controlli del sorgente

- **pnpm check passato**: typecheck, lint e confini di 116 file.
- **pnpm test passato: 318 test** nella suite generale iniziale: 14 bridge, 7 DB, 61 web, 108 server, 122 desktop, 6 script. Dopo difetti concreti, controlli mirati passati: CSP HTTP/ws/wss; 9 test DB (8 passati, 1 symlink POSIX saltato su Windows); 5 test release. Questi gruppi sovrapposti non sono sommabili.
- **CI finale check/test/build riuscita sui tre OS**, commit08679f4: [run39100475642](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475642). La CI esegue anche il caso wrapper POSIX su macOS/Linux.

### PostgreSQL e container effettivi

La verifica PostgreSQL18 locale ha superato **5 controlli** con schema temporaneo proprio: cronologia/hash, pg_dump custom, rifiuto overwrite e restore sul DB applicativo non vuoto, pg_restore effettivo dello schema QA e account/journal invariati. Report privato: .nexus/visual/t16/operations-report.json.

La verifica **Docker reale ha superato 6 scenari**: build dal lockfile; avvio fresco con503/pending senza DDL; migrazione esplicita di nove hash e200/current; ruolo DB non amministrativo e CSP HTTP/WebSocket esatta; registrazione, email Mailpit, verifica, login e preferenze persistenti; backup custom e ripristino completo su un database QA vuoto con utente, nome e preferenze esatti. Restore sul DB sorgente rifiutato con dati invariati. Progetto, volumi, immagine e segreti UUID propri rimossi. Report privato: .nexus/visual/t16/self-host-report.json, cleanup completo.

Le due ripetizioni Docker hanno corretto difetti confermati: rete Mailpit interna senza accesso HTTP dalla porta pubblicata e dispatch Debian pg_wrapper perso eseguendo direttamente il target del symlink. Ora il resolver controlla il target canonico conservando il nome del tool; backup e restore rifiutano archivi vuoti/nonPGDMP anche dopo exit0. Nessuna ripetizione senza una causa concreta.

### Package Windows locale

Installer **Nexus-AI-0.16.0-win-x64.exe**,220117999 byte; versione letta da app.asar e runtime Codex realmente confezionato. Sorgente del package: commit84234a1, checkout pulito e sourceDirty=false. Le correzioni successive riguardano operator server e tooling release/Linux, senza modifiche a main/preload/renderer Windows confezionati.

SHA-256: 13b62b35d0a937fc38b2d89f39032b9f863ef0eb940082c218d0f47d83af54a4.

Smoke dell'eseguibile confezionato passato: renderer montato, IPC validato e Node assente nel renderer; profilo QA isolato. Runtime confezionato passato: initialize/account/catalogo effettivi, home vuota,8modelli, nessuna credenziale o inferenza personale. Installer generato, non installato automaticamente.

La firma osservata indipendentemente sullo stesso hash è **NotSigned**. Il manifest originale conserva la provenienza e il primo stato unverified: PowerShell7 ereditava un PSModulePath incompatibile con Security5. L'helper corretto usa Windows PowerShell di sistema e moduli propri; il report windows-signature-report.json registra la nuova osservazione senza cambiare il commit attribuito al package. Report aggregato: .nexus/visual/t16/windows-package-report.json.

### Matrice installer CI

**Tutti i job riusciti** sul commit08679f4: [run39100475946](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475946). Ogni job ha eseguito install frozen, check, test, build, packaging nativo, manifest/hash e upload. Artefatti conservati per14giorni; le dimensioni ZIP GitHub non sono le dimensioni degli installer.

| Sistema/architettura CI | Package effettivo | Firma osservata | Artifact |
| --- | --- | --- | --- |
| Windows x64 | NSIS .exe | unsigned | [Windows](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475946/artifacts/12126591011) |
| macOS ARM64 | DMG | ad_hoc, non notarizzata | [macOS](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475946/artifacts/12125874796) |
| Linux x64 | AppImage, suffisso x86_64 | not_applicable | [Linux](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475946/artifacts/12126118688) |

Report privati native-ci-report.json e native-artifacts-report.json in .nexus/visual/t16. Queste sono build/package sui runner nativi, senza esecuzione GUI personale sui sistemi del maintainer.

La prima run39100176870 ha prodotto Windows e macOS, ma ha rilevato i difetti Linux executableName scoped e suffisso AppImage x86_64 nel manifest. Correzioni pubblicate in08679f4; pipeline ripetuta per questi difetti e per la verifica firma Windows corretta. Non sono stati acquistati certificati, usate credenziali personali o pubblicate Release automatiche.

### Conservazione dati e limiti

Audit finale:1742 file sorgente/build testuali,0 corrispondenze dei valori privati cercati,0 account/0 workspace QA residui,1 account esistente e9 migrazioni conservati. Configurazione .env preservata. Le prove usano fixture dichiarati e risorse proprie, senza dati simulati nel normale avvio.

Guide [self-host](self-host.md), [release](release.md), matrice [R01–R16](acceptance.md). Package e CI non certificano installazione GUI, Gatekeeper/SmartScreen, filesystem/keyring e callback personali su Mac/Linux, firma sviluppatore, TLS/SMTP pubblici o accettazione estetica umana. Il maintainer proverà il Mac dal proprio dispositivo. T16 conclude il mandato; nessuna T17 o ulteriore attività automatica dell'agente.

## Ownership T15 integrate e rilasciate

| Agente | Percorsi scrivibili | Obiettivo/uscita |
| --- | --- | --- |
| /root/t15_ui | apps/web/src/**,packages/ui/src/**,apps/web/test/t15.test.mjs,docs/design/t15-review.md | Confronto PNG1/2/3 e cattureT13/14, fix densitàSettings/longnames/focus/routes/error/offline/reduced; no contratti/main/manifests |
| /root/t15_recovery | apps/desktop/src/codex*.ts (esclusi generated/harness),packages/codex-bridge/src/** esclusigenerated, relativitest | Review runtimecrash/reconnect/approvals/accountchange, correggere solo difetti concreti; test mirati ai nuovi rischi, niente inferenza personale |
| /root/t15_qa | apps/desktop/src/acceptance-verification.ts,scripts/verify-acceptance.mjs | Harness Electron/preload/DTO controllati,3reference a1586/960,3ruoli/longnames/keyboard/dialog/auth/offline/runtimeerror recovery; screenshot/report e limiti, no UI edit |
| /root/t15_recovery — QA renderer dopo handoff | apps/desktop/src/renderer-recovery-verification.ts,scripts/verify-renderer-recovery.mjs | Reactboundary effettivo con childthrow isolato, focus/no payload/riavvio manuale; nessun hookproduzione |
| /root/t15_recovery — crash nativo dopo QA boundary | apps/desktop/src/renderer-process-recovery.ts,renderer-process-verification.ts,scripts/verify-renderer-process.mjs e main.ts solo hookcreateWindow | Arresto locale prima dialogReload/Close esplicito su render-process-gone; actualforcefullyCrashRenderer su finestraQA sola |
| Coordinatore | integrazione/docs/versioni/rootmanifest, context-git.ts e context.test.ts/codex.test.ts dopo handoff recovery | Canonicalizzazione percorsi fixture da fallimentoCI39098545462 e resolverGitconalias; un autore per confini, build/controlli mirati e integrazione primaT16; nessuna accettazione personale inventata |

Contratti T14 invariati; nessuna nuova tabella/migrazione. Harness usa configurationRead trusted e rendererConnectionPolicy production perCSP, nessuna credenziale o inferenza. Difetti fuoriownership tramite handoff; coordinate screenshot e fonti distinte da accettazione manuale.

## Evidenze T15

Confrontate le PNG1/2/3 e le catture effettive:14controlli renderer/preload e17catture passati con DTO controllati,3ruoli/longnames/keyboard/960/reduced/offline/auth/runtime recovery. Geometrie sidebar212,heroPulse1050×232,rail294/Overview370,splitSessionentro4px. Corrette cardSettings stirate, header/titoli lunghi, feedbackfooterPulse e chip/allegati/taskmini oltrecard. Tre catture controllate pubbliche e report in docs/design/captures/t15*, revisione in design/t15-review.md; nessuna identità pixel o accettazione personale dichiarata.

Recovery:3difetti corretti (epoca della coda comandi, attesa shutdown prima reconnect, frame stdin scaduti). **28test DesktopCodex e14bridge passati**; dopo correzione percorsi canonicalizzati CI, **39test Codex+context passati** incl aliasRootGit. Si tratta di ripetizione motivata da difetti concreti, non somma di test distinti. CI precedente39098545462 falliva12casi macOS/Windows sufixturetemporanei conalias; fixture canonicalizzate e resolverGit rafforzato prima della prossima run.

ErrorBoundaryReact effettivo: **6controlli Electron passati**, focusalert/no payload/noautoreload e un reload esplicito. Crashprocessrenderer: **5controlli passati**,2forcefullyCrashRenderer propri, stopesecuzione prima dialog e reload/close espliciti. Main integra DesktopCodex.dispose prima del dialog; nessun crash/inferenza sull’app del maintainer. Typecheck/lintmirati e buildUI/web/desktop passati; smoke finale Windows passato dopo hookmaincrash (warningGPUsoloall’uscita). Nessuna migrazione,9totali; versioni app0.15.0,UI0.3.1,bridge0.5.1,Codex0.159.2. Tutteownershiprilasciate; acceptance.md distingueR01–R16 e prove personali/native residue.

## Ownership T14 integrate e rilasciate

| Agente | Percorsi scrivibili | Contratto e uscita |
| --- | --- | --- |
| /root/t14_server | apps/server/src/application*.ts, scripts/verify-application.mjs | createApplicationService(database,reportError?).execute(actor,ApplicationRequest). Ricerca ACL prima match/snippet; user_preferences CAS; test + QA PG/HTTP. Nessun app/schema/contracts |
| /root/t14_web | apps/web/src/**, apps/web/test/t14.test.mjs | Ricerca globale e apertura crossworkspace, settings persistenti/profile/modello/sharing, centro notifiche corrente con filtri/markread; primitive reference e provider scoped |
| /root/t14_native | apps/desktop/src/main.ts,preload.ts,auth-config.ts,preferences*.ts,application-transport.ts, apps/desktop/test/preferences*.ts | Preferenze endpoint validated signedout/restart e profili distinti per authority; bootstrap configuration sync trusted. Application IPC/transport. auth.ts root aggiunge metodo, native non edita. Smoke/harness native aggiornabili per nuove bridgekeys/configuration |
| /root/t14_server — QA UI dopo handoff | apps/desktop/src/application-verification.ts, scripts/verify-application-ui.mjs | Electron/preload veri e DTO controllati, ricerca/settings/notifiche/connessione/reload/offline/960; root gestisce build |
| Coordinatore | contracts/application.ts e index, DB0008/schema, auth.ts e server app/logging, versioni/docs/integration | Contratti fissati; manifest/lock/schema un solo autore. Nessun install/commit degli agenti |

DB0008 user_preferences(user_id text PK FKuser cascade, version integer>=1, preferences jsonb, updated_at timestamptz). Lettura assente versione0/default, save CAS con lock user e insert/upsert incrementa versione; name stesso commit. Search tipi project/task/milestone/document/update/deliverable/shared_session/live_share/deployment/environment; solo contenuti pubblicati visibili correnti, nessun filesystem o cronologia privata Codex. Pagination50, excerpt500, titolo300; query2–200 letterale. Notifications usa dominio overview e cursore persistente esistente per progetto corrente; preferenze filtrano badge/elenco senza modificare ACL. Endpoint HTTPSorigin o HTTPloopback, no credenziali/query/path/hash, modifica signedout e restart esplicito; isolare userData per server custom mantenendo default profilo esistente. Contratti strict in application.ts; bridge application.request, preferences.request, readonly configuration.

## Evidenze T14

Ricerca10tipi compresi messaggi pubblicati con ACL correnti prima di match/snippet/pagine, settings/profile atomici CAS, notifiche progetto con ultimo30/categorie/readcursor persistente. Bridgeconnessione signedout+conferma+restart, profileauthoritymarker/hash e CSP esatta dell’origine attiva; preset modello soltanto se catalogovalido. Tutte le rotte sidebar hanno destinazione reale; Publish Update apre l’editor autorizzato con anteprima.

Passati **5test server,6preferenze native+4CSP,7web**, typecheck/lintmirati, confini114file e buildrenderer738kB (warningchunk). **5scenari PG/Mailpit/HTTP** reali, fixture3account/2workspace rimossi; **9controlli renderer/preload** con DTOcontrollati dichiarati e healthHTTPloopback, ricerca crossworkspace/reload/CAS/notifiche/offline/signedout/960/reduced. Report/catture .nexus/visual/t14. Smoke desktopWindows passato dopo correzione CSP che decodifica le entità HTML Vite, nessun Node nelrenderer; warningGPUsoloall’uscita. Migrazione0008 applicata esplicitamente a nexus_ai_dev, **9totali**. Nessuna nuova dipendenza o inferenza personale. Installer finale T16; Mac/Linux/manualeutente non eseguiti. Tutte ownership T14 rilasciate. Guida application.md. Settings gridstretch da rifinire inT15.

## Ownership T13 integrate e rilasciate

| Agente | Percorsi assegnati | Obiettivo/contratto/stato |
| --- | --- | --- |
| /root/t13_server — integrato/rilasciato | apps/server/src/deployments.ts, deployments-health.ts, deployments.test.ts | Ambienti/build/health manuali, CAS/ricevute, scadenza, validazione PNG e invalidazione atomica; 8 test mirati |
| /root/t13_web — integrato/rilasciato | apps/web/src/** e apps/web/test/t13.test.mjs | Deployments, card reference1/3, Environment Status reference2, provider scoped, file/preview espliciti e health; 8 test mirati |
| /root/t13_probe — integrato/rilasciato | apps/desktop/src/environment-probe.ts e apps/desktop/test/environment-probe.test.ts | Una HEAD loopback per consenso, nessun polling o upload, autorizzazione prima/dopo, scadenza30s; 8 test mirati |
| /root/t13_server — QA integrata/rilasciata | scripts/verify-deployments.mjs | 6 scenari PostgreSQL/Mailpit/HTTP reali, cleanup fixture propri, report .nexus/visual/t13 |
| /root/t13_probe — QA UI integrata/rilasciata | apps/desktop/src/deployment-verification.ts e scripts/verify-deployment-ui.mjs | 13 controlli Electron/preload, una HEAD loopback effettiva, DTO condivisi controllati dichiarati e catture reference |
| /root/t13_server — documentazione integrata/rilasciata | status/plan/changelog, guida deployments, append architecture/contracts/design screens | Chiusura documentale T13; nessun cambio alla fase successiva |
| Coordinatore — integrato | contratti,DB0007,main/preload/auth/routes,feed/Pulse,QA/versioni | Integrazione sequenziale, migrazione esplicita, build/smoke e documentazione; unico autore manifest/lock/schema |

DB0007: deployment_environment(id,project_id,name,kind,visibility,preview_url,required_checks jsonb,version,created_by,created_at,updated_at); project_deployment(id,project_id,environment_id,title,status,commit_sha,branch,build_url,preview_url,notes,thumbnail,version,created_by,observed_at,created_at,updated_at); health_observation(id,project_id,environment_id,check_name,status,value double precision nullable,unit,summary,source_url,version,created_by,observed_at,expires_at,created_at,updated_at, UNIQUE(environment_id,check_name)); deployment_receipt(project_id,actor_id,request_id,payload_hash,response jsonb,created_at). Tutti UUIDtext/FK progetti/account; ambienti30, deployment1000progetto e pagine100, ricevute100k, thumbnailPNG256KiB max1280x720 e quota10MiBprogetto. Audience sul parentenvironment corrente; client/viewer solo client. Nessuna fetch server di URL progetto. Manual provider definitivo ammesso dal piano, fonteesplicita. Mutation appende invalidazione con entityId idambiente/deploy; feed root proietta entità correnti. Native probe solo driver attivo, privata/temporanea, no upload implicito. Preview desktop in BrowserWindow separata senza preload, sandbox/noNode/partition effimera, apertura esplicita daID autorizzato.

## Evidenze T13 e consegna

| Ambito | Esito |
| --- | --- |
| Implementazione | Ambienti con audience e requisiti health dichiarati; build/deploy manuali con URL/SHA/branch, thumbnail scelta e anteprima di pubblicazione. Editor CAS, ricevute idempotenti, lettura dettaglio e paginazione. Nessuna infrastruttura esterna creata |
| Persistenza | Migrazione additiva0007 applicata esplicitamente al solo nexus_ai_dev, **8 migrazioni**. Conservato **1 account reale**, configurazione e progetti; fixture QA rimossi, nessuna migrazione all'avvio |
| Sicurezza/health | Ruoli e visibilità del parent correnti in ogni query, ricevuta e feed. PNG256KiB/max1280×720 con firma/chunk/CRC e quota10MiB. URL senza credenziali/query/fragment; server senza fetch. Health unknown se requisito assente/scaduto/futuro; pass/required soltanto con tutte le osservazioni correnti |
| Proiezioni | deployment.changed invalida WS senza contenuti. Feed coalescente autorizzato, card Overview/Pulse dallo stesso dominio e conteggio Build & deploys per osservazione UTC/autore; nessuna metrica di provider inventata |
| Probe locale | Una HEAD HTTP loopback soltanto dopo consenso, timeout5s, nessun redirect/body/cookie/DNS remoto. Autorizzazione prima/dopo, invalidazione al cambio account e osservazione privata scaduta dopo30s |
| Statici/test/build | Typecheck ed ESLint mirati passati; **8 test server + 8 probe + 8 web** passati. Build renderer passata con warning chunk circa715kB, controllo confini108file passato. Nessuna nuova dipendenza o modifica allo schema Codex |
| PostgreSQL/HTTP | Verifier **6 scenari passati** con account verificati, PG/Mailpit/HTTP effettivi: ruoli/CAS/ricevute/audience, PNG/quote, health/scadenza/futuro, Pulse UTC/Mine, feed/pagine, narrowing/revoca e cascade. Report deployments-report.json in .nexus/visual/t13 |
| UI/IPC | **13 controlli passati** con renderer e preload effettivi, DTO condivisi controllati dichiarati e una HEAD loopback reale. Empty/editor/pubblicazione PNG/CAS, Overview/Pulse/Sessione,960px/reduced motion/offline/cliente/scadenza; catture e report nella stessa directory |
| Reference | PNG1/2/3 originali aperte; shell, palette, pianeta/wave e primitive preservati. Card health/preview della reference3, preview reference1 ed Environment Status reference2 collegate ai dati reali. La pagina Deployments estende le primitive senza una PNG dedicata; nessuna identità pixel dichiarata |
| Preview/smoke | Main apre preview mediante ID autorizzato in finestra isolata; smoke desktop Windows passato. Il QA UI intercetta la finestra OS e verifica la chiamata ID-only; verifica aggiuntiva Electron reale passata: Node/preload e cookie Nexus assenti, partizione effimera, popup negati e chiusura finestra. Separata dai13controlli |
| Versioni/piattaforme | App/contratti/DB **0.13.0**, UI0.3.0,bridge0.5.0,Codex0.159.2 e auth0.9.1 invariati. Nessun installer intermedio: packaging finale previsto T16. Build manuale del maintainer e prove native macOS/Linux non eseguite |

Workflow e verifica manuale in [deployments.md](deployments.md). T13 è integrato e consegnato, con accettazione manuale distinta. Il mandato cumulativo consente al coordinatore di avviare T14 dopo l'integrazione; fermarsi dopo T16.


## Archivio T12

Aggiornato: **18 ottobre 2026**. **T12 consegnato, in attesa di verifica utente** — [issue12](https://github.com/AndreaZero/nexus-ai/issues/12). Build Windows T11 accettata, issue11 chiusa. T12 completa Git locale e GitHub (commit, branch, fetch/push espliciti, PR/review, sincronizzazione e webhook); T13–T16 restano successivi. Nessun cambio al runtime Codex o alle policy account.

## Ownership T12 integrate/rilasciate e contratto

| Agente | Obiettivo e percorsi scrivibili | Dipendenze / consegna |
| --- | --- | --- |
| /root/t12_git — integrato/rilasciato | DesktopGit, git-runner/safety/tests; apps/desktop/src/git*.ts e workspace.ts (solo esportare helper sicuri), non workspace-verification | packages/contracts/src/repositories.ts; classe DesktopGit.request; autorizzazione/credenziale iniettate dal coordinatore; Git reale isolato e nessun hook/filtro/credenziale ambientale |
| /root/t12_github — integrato/rilasciato | Servizio GitHub/crypto/webhook/tests: apps/server/src/repositories*.ts e github*.ts | Contratti repositories.ts e DB 0006 definiti da root; factory createRepositoriesService(database, secret, reportError?), execute(actor,request), credential(actor,projectId,repositoryId), webhook(repositoryId,headers,rawBody); nessun app.ts/config/schema edit |
| /root/t12_web — integrato/rilasciato | UI Code/Repos, PR/diff/review/sync: apps/web/src/** e apps/web/test/t12.test.mjs | Contratti stabili git/repositories, bridge disponibili da root; PNG1/2/3 e design docs obbligatori; no main/preload/manifest; handoff UI e controlli |
| /root/t12_git — QA integrata/rilasciata | solo apps/desktop/src/repository-verification.ts e scripts/verify-repository-ui.mjs | Renderer/preload reali, Git isolato reale, API GitHub controllata dichiarata, catture Code/Repos/PR a1586 e960px; nessun edit UI |
| Coordinatore — integrato | contratti/DB0006/schema, auth/main/preload/routes, proiezioni feed/Pulse, QA/docs/versioni/GitHub | Integrazione e verifica proporzionata; unico autore manifest/lockfile/migrazioni; agenti non installano, committano o pubblicano |

Contratto fissato in packages/contracts/src/repositories.ts. Git locale solo desktop, snapshotId+fileIds opachi per selezione, autore esplicito e messaggio prima commit; branch/switch/fetch/pullFF/push separati, nessun force/reset/merge automatico. GitHub HTTPS github.com esclusivo, token fine-grained personale per account/repository cifrato AES-GCM nel server con chiave derivata dal segreto Nexus; nessun token nei DTO di risposta, storage renderer o log. Credential lease privata main su origine desktop distinta; browser escluso. API REST ufficiale GitHub per PR/review con SHA atteso e requestId/receipt contro duplicati. Webhook per repository configurato da owner con secret scelto, firma raw HMAC-SHA256 e delivery ID idempotente; metadati tecnici solo owner/developer, nessuna pubblicazione cliente implicita. DB0006: repository_connection(repository_id,user_id,token_cipher,login); repository_sync(repository_id,remote_url,snapshot JSONB); repository_webhook(repository_id,secret_cipher,configured_by); repository_delivery(repository_id,delivery_id,payload_hash); repository_receipt(repository_id,actor_id,request_id,payload_hash,response JSONB nullable); repository_activity(id,project_id,repository_id,actor_id,kind,title,url,sha nullable,pull_number nullable,external_key,occurred_at). Tutte con created_at/updated_at dove necessario; root consegna SQL prima esecuzione. appendRealtimeEvent nuovo repository.changed come invalidazione solo, feed proietta righe attualmente autorizzate. Verifica Git/HTTP/PG firma+replay+ruoli e UI effettiva; nessun dato reale modificato dai fixture.

## Evidenze T12 e consegna

| Ambito | Esito |
| --- | --- |
| Implementazione | Git locale snapshot/diff/history, commit selettivo con autore/indice temporaneo/CAS, create/switch branch, fetch/pullFF/push confermati. Repos token per account, PR draft/preview/detail/patch/review sullo SHA, retry ricevute, webhook e feed tecnico. Nessun merge/force implicito |
| Persistenza | Migrazione0006_repositories additiva applicata esplicitamente al solo nexus_ai_dev, **7 migrazioni**. Account/progetti/.env conservati, nessun seed o migrazione all'avvio. URL cambiato invalida dati/credenziali vecchi atomicamente |
| Contratti/confini | Bridge git/repositories strict, UUID opachi e correlazione tenant/pagine. Lease credenziale solo main/origine desktop, non nel bridge; token AES-GCM/AAD per account/repository e segreto Nexus stabile. Rifiuto di helper/hook/filtri/config eseguibile e protocolli/redirect alternativi |
| Statici/build | Frozen/offline install passato, typecheck pacchetti/app, ESLint e confini100file passati dopo due correzioni lint (campo destructuring inutilizzato e controllo NUL). pnpm build passato; renderer678kB minificato con warning chunk non bloccante. Nessuna dipendenza/lockfile/schema Codex aggiunti |
| Test | **258/258**: bridge13,DB3,desktop100,server94,web46,confini2. Git/socket/rename eseguiti fuori sandbox Windows. Dopo hardening finale UI, web46/46 ed ESLint/typecheck mirati ripassati; nessuna ripetizione globale della suite |
| Git reale | Nove test native Git, commit selettivo/unborn/deletion, staged/conflict/index lock preservati, snapshot/file/ref CAS, branch, revoca e filtri/hook/remote spoof rifiutati. Nessun token personale o Git network su repo del maintainer |
| PG/HTTP | pnpm verify:repositories **5 scenari** con tre account temporanei verificati e PG/Mailpit/HTTP reali. Token cifrato/isolation/ruoli/Origin/lease, sync/feed/Pulse, ricevuta PR persa riconciliata senza POST duplicati, review SHA/replay, webhook raw firma/replay/collisione/repository errato, disconnect e URL replacement. Ultimo controllo include resolveActivity e coalescenza di aggiornamenti dello stesso commit |
| UI/IPC | pnpm verify:repository-ui: **13 controlli**, renderer/preload/Git effettivi; commit e branch reali con autore/SHA confermati anche dal runner. DTO GitHub/account/realtime controllati dichiarati per connessione token write-only, anteprima PR e review SHA, offline/revoca/960px/reduced motion. Integrazione finale del KPI commit Pulse verificata nella stessa QA |
| Reference | PNG1/2/3 aperte; catture Code/diff, Repos, commit, PRdetail/review, reduced motion e960px ispezionate. Palette/Card/Dialog/focus e pianeta/wave conservati. Code/Repos sono estensioni senza PNG dedicata, non una dichiarazione di identità pixel delle nuove viste |
| Feed/Pulse | repository.changed invalidazione WS senza contenuti; metadata soltanto ai tecnici attuali. Feed coalescente per attività e link risolti per ID; commit osservati UTC da dati reali, unknown prima sync, Mine soltanto con login collegato univoco. Nessuna metrica GitHub pubblicata automaticamente ai clienti |
| Segreti/pulizia | Scan sorgenti/build1637file:0valori privati. QA account/workspace rimossi, **1 account reale conservato**,7migrazioni. Servizi del maintainer non fermati. Nessun POST GitHub personale, token di altre app o inferenza automatica |
| Desktop/package | Smoke sviluppo e package finale passati. NSIS Windows x64 **0.12.0**, release/win/Nexus-AI-0.12.0-win-x64.exe, **220080460 byte**, NotSigned. Ultimo package include KPI Pulse; smoke hidden finale di win-unpacked passato, nessuna installazione automatica |
| Versioni | Root/desktop/web/server/contratti/DB **0.12.0**; UI0.3.0,bridge0.5.0,Codex0.159.2 invariati. Git regolare/no sparse/submodule/worktree, diff50file64KiB, scan10kfile/16MiBperfile/64MiBtotale. GitHub30commit/PRpagina e100file/reviewpagina; ricevute100k e attività1000/repository |
| Limiti/prova personale | GitHub personale (token dedicato, push/PR/review reali) e webhook HTTPS esterno attendono la configurazione/prova del maintainer. Windows manuale T12 ancora atteso; macOS/Linux non buildati nativamente qui. T13–T16 non avviati |

Guida e passi Windows in [repositories.md](repositories.md); rapporti/catture in .nexus/visual/t12. T12 consegnato per la verifica del maintainer; il task successivo T13 richiede il suo via.

---

## Archivio consegna T11 (accettata dal maintainer il18ottobre)

Aggiornato: **18 ottobre 2026**. **T11 consegnato, in attesa di verifica utente** — [issue11](https://github.com/AndreaZero/nexus-ai/issues/11). Il maintainer conferma WindowsT10; issue10 accettata/chiusa. Fronti T11 integrati, prove automatiche separate dalla build personale. T12 non avviato; runtime0.159.2 e correzione429 invariati.

## Ownership T11 integrate/rilasciate e contratto

| Agente | Percorsi scrivibili | Handoff |
| --- | --- | --- |
| /root/t11_tasks — integrato | apps/server/src/work-planning.ts e work-planning.test.ts | Task/milestone CRUD, assegnazioni, progressi/roadmap, commenti autorizzati e test |
| /root/t11_content — integrato | apps/server/src/work-content.ts e work-content.test.ts | Documenti/aggiornamenti, revisioni deliverable, approvazioni cliente e feedback con provenienza; test |
| /root/t11_web — integrato | apps/web/src/** e apps/web/test/t11.test.mjs | Board/roadmap/Docs/detail, pubblicazione con preview/audience, file scelti, feedback/decisioni; collegare card Pulse/Overview reference1/3 |
| /root/t11_content — QA integrata | solo scripts/verify-work.mjs | Prove reali PG/HTTP/WS/Mailpit, workflow completo/ruoli/CAS/receipt/revisioni/download/revoca e cleanup |
| /root/t11_tasks — QA integrata | solo apps/desktop/src/workspace-verification.ts e scripts/verify-workspace.mjs | QA renderer/preload actual, snapshot Work controllati dichiarati, nuova board/docs e Pulse popolata; root coordina build prima esecuzione |
| Coordinatore — integrato | contratti/DB/migrazioni/schema, work-common/service/attachments/route, desktop auth/main/preload/transport/download, proiezioni server, QA/docs/GitHub/manifest | Integrazione, migrazione0005 additiva, dominio singolaTX, idempotenza/CAS, UI/HTTP/PG/WS e package Windows |

Contratto autorevole packages/contracts/src/work.ts già fissato e compilato. POST /api/work e bridge work.request; work.download apre salvataggio nativo soltanto allegato autorizzato con ID, mai path da remoto. List con kind/offset/limit/target e view auto|client, read per ID/revision. Mutazioni con requestId UUID per ricevuta idempotente; save expectedVersion0 per creare, CAS per aggiornare/delete. WorkItem comune strict (list body vuoto, read testo), progress visible_tasks per milestone. Tabelle/colonne esatte in0005_project_work.sql. Ruoli: owner/developer scrittura tecnica; client commenti pubblici/feedback/decisione deliverable; viewer sola lettura. Decisione cliente una per revisione corrente, nessun consenso runtime; revisione successiva pending e mantiene storico. Preview+audience prima di pubblicare; niente upload automatico. Allegati selezionati max1MiB ciascuno/5perdeliverable, max20MiB progetto, memorizzati nel DB con hash e download esplicito; no path o token nei DTO. Testi plain text escaped, mai HTML eseguibile. SingolaTX lock workspace→project, receipt+mutazione+evento atomici. Evento work.changed solo invalidazione WS con resync senza ID di oggetto privato; metadata feed proiettati da oggetti attualmente autorizzati. File condivisi helper root work-common.ts: WorkDb, WorkAccess {projectId,actor:{id,email},role,team}; WorkError(code,message); makeWorkItem(input) defaults nullable/arrays; requireTechnical(access), requireWriter(access), readableTarget(db,access,kind,id) -> {id,title,visibility,version}|null, validateReferences(db,access,{visibility,sourceSessionId,taskId,documentId}); visibleReference(db,access,kind,id) -> id|null; appendWorkChange(db,access,kind,id) atomico. Agenti non installano/committano o modificano contratti/migrazioni.

## Evidenze T11 e consegna

| Ambito | Esito |
| --- | --- |
| Installazione/statici | Installazione frozen/offline e pnpm check passati; typecheck tutti pacchetti/app, ESLint e confini93file. Esclusi dalla lint i bundle generati .nexus, già ignorati daGit: una verifica concorrente stava leggendo il bundle temporaneo QA, nessuna esclusione di codice applicativo |
| Test | **222/222**: bridge13,DB3,desktop88,server76,web40,confini2. Suite eseguita fuori sandbox per rename/Git/socket dei fixture Windows. Dopo ritocchi finali web40/40 ritestati, typecheck/lint/build mirati passati |
| Build | pnpm build e build finali renderer/server/desktop passati; nessuna nuova dipendenza o schema Codex. Warning Vite chunk principale circa632kB senza errore. Lockfile invariato |
| Migrazione/persistenza | 0005_project_work applicata esplicitamente al solo nexus_ai_dev; **6 migrazioni** registrate. Colonne task/milestone e nove tabelle work aggiuntive, nessun dato iniziale o cambio .env/account/project. Migrazione ripetibile tramite comando, mai all’avvio |
| Percorso reale | pnpm verify:work: **8/8 scenari** PostgreSQL/SMTP/HTTP/WS,3account temporanei/ruoli correnti,2progetti. Workflow task→sessione pubblicata→documento/update→file→deliverable→feedback/commento→approvazione→v2 Pending/storico/download. CAS/receipt/hash/rollback,105task/pagine/conteggi, origine/parent/audience, unsafefile/MIME/size, recoveryupload, commenti UTC/mine, filtri/target feed e revoca socket/snapshot inclusi |
| Renderer/IPC | pnpm verify:workspace: **35/35** nel renderer/preload effettivi. Git/TAP reali, provider/Work DTO e risposte controllati dichiarati. Board CRUD/assegnazione/CAS, roadmap/Docs/provenienza escaped, scelta File prima anteprima e upload soltanto dopo conferma, revisioni e download ID, clientdecision/feedback, offline e960px |
| Confronto | PNG1/2/3 originali aperte; catture finali Pulse/dettaglio revisioni/board/Docs/pubblicazione/client/reducedmotion/960 ispezionate. Griglia hero1050×232/railx1286 e pianeta/wave preservati, card approvazione/feedback/provenienza da dati Work. Nuove board/dialoghi non hanno PNG dedicata e riusano palette/focus. Select revisioni navy e heading feedback/commenti accessibili corretti; nessuna uguaglianza pixel di contenuti diversi dichiarata |
| Recupero finale | Cancel non resta bloccato se cleanupupload fallisce/offline: chiude il form, gli upload restano recuperabili in Manage unused uploads. Correzione mirata verificata con typecheck/lint/build; nessuna eliminazione di allegati pubblicati. Le bozze restano nello scope durante resync, reset al cambio account/ruolo/progetto/audience |
| Desktop | Smoke sviluppo passato: work.request/download validati, URL/cookie/path arbitrari negati, Node assente/CSP/mount validi. Download autorizzato riautentica dopo Save dialog e verifica byte/hash; nel QA il salvataggio OS è intercettato e la scelta destinazione manuale resta da provare |
| Segreti/pulizia | Scan1598file sorgenti/build:0valori privati;0account/workspaceQA T11 residui,1account reale conservato. Fixture/email proprie rimosse, servizi del maintainer conservati. Primi tentativi QA: sandbox negava rete; il quarto signup fu respinto dal limite3/min, poi QA allineata a3account senza alterare limiter/rate_limit |
| Versioni/limiti | Root/desktop/web/server/contratti/DB **0.11.0**; UI0.3.0,bridge0.5.0,Codex0.159.2 invariati. File1MiB/5perrevisione/20MiBproject e ricevute100.000, revisioni50; testo plainescaped, lista100paginabile. Git/GitHub T12, deploy/probe T13 e ricerca globale T14 restano futuri |
| Pacchetto finale | NSIS Windows x64 **0.11.0**, release/win/Nexus-AI-0.11.0-win-x64.exe, **220048793 byte**, NotSigned; smoke finale dell’eseguibile win-unpacked passato, nessuna installazione automatica |
| Piattaforme | Windows x64 build e package verificati; macOS/Linux non buildati nativamente qui. La conferma del maintainer T11 è ancora attesa |

Guida completa e prova manuale in [work.md](work.md), rapporti/catture .nexus/visual/t11. Tutti i fronti consegnati, ownership rilasciate; coordinatore unico autore di contratti/migrazioni/main/preload/manifest e pubblicazione. Chiudere app/backend precedenti, pnpm install --frozen-lockfile, pnpm db:migrate, pnpm package:win; avviare server/app separatamente. Attendere feedback prima di T12.

## Storico consegna T10

Aggiornato: **17 ottobre 2026**. **T10 consegnato, in attesa di verifica utente** — [issue10](https://github.com/AndreaZero/nexus-ai/issues/10). Il maintainer conferma build Windows0.9.1 e assenza del429; T09/issue9 accettato e chiuso. T10 sviluppato con multiagenti, integrato e controllato; build personale e accettazione restano distinte. Il feedback non certifica ogni percorso personale o altri OS. T11 non avviato.

## Ownership T10 integrate/rilasciate e contratto

| Fronte | Percorsi scrivibili | Obiettivo / handoff |
| --- | --- | --- |
| `/root/t10_server` — integrato | `apps/server/src/pulse*.ts`, `overview.ts`/test per helper transazionale, `app.ts` | Snapshot Pulse audience corrente, milestone/progresso da task visibili, summary UTC/mine, outcome da estratti completati; route e test |
| `/root/t10_web` — integrato | `apps/web/src/**`, nuovo test webT10 | Vista reference1, provider scoped e client preview, progressi/summary/sessioni/presenza/feed/link/dialoghi reali; nessun dato inventato |
| `/root/t10_effects` — integrato | `packages/ui/src/effects/**`, export effetti e CSS dedicato | PulseScene wave/particelle/nodi con milestone reali, focus/reduced motion e geometria reference1 |
| `/root/t10_server` — QA integrata | solo `scripts/verify-pulse.mjs` | Sei scenari veri PG/HTTP/WS/Mailpit, fixture proprie e cleanup |
| `/root/t10_effects` — QA integrata | solo `workspace-verification.ts`, `scripts/verify-workspace.mjs` | Renderer/preload nativi, proiezioni QA dichiarate, confronto PNG1 e28controlli inclusi22storici |
| Coordinatore — integrato | contratti, auth/main/preload e trasporto Pulse desktop, manifest/lock, logging, QA/docs/GitHub | Contratto unico, integrazione transazioni/privilegi, prove e consegna Windows |

Contratti fissi `packages/contracts/src/pulse.ts`: POST `/api/pulse`/bridge pulse.request snapshot(projectId,view auto|client,scope project|mine,filter,before,limit). Snapshot audience team|client, overview autorizzata T09 (feed/authorizedTargets), milestone max100 con conteggi task visibili/progressi e totale, progresso globale visible_tasks, summary giorno UTC con tasksUpdated e sharedUpdates retained_entities; commits/comments/builds null. Outcomes max20 estratti esplicitamente pubblicati e completed, non file/deliverable approvati. Nessuna nuova tabella/migrazione: scrittura task/milestone/deliverable/feedback resta T11. Client/viewer ricevono soltanto proiezione client; technical può preview client, mai elevazione dal request. Snapshot in singola transazione con lock workspace→project; riuso helper overview senza transazioni annidate. Presence WS T08 e snapshot/role/outage invalidano UI; progressi da scope dichiarato, niente percentuali PNG, geolocalizzazione o attività produttiva dedotte. PulseScene props: milestones readonly {id,title,state completed|in_progress|planned,progress number|null}[],reducedMotion,onSelect?(id),activeId?,className?. UI usa export @nexus-ai/ui/effects, nessuna sovrapposizione sui file effetti. PNG1 aperta prima delle deleghe; nessuna regressione0.9.1.

## Evidenze T10 e consegna

| Ambito | Esito |
| --- | --- |
| Installazione/statici | `pnpm install --frozen-lockfile --offline`, `pnpm check` passati; confini finali84file. Typecheck/lint mirati e build dei fronti ritoccati passati |
| Test integrati | **198/198**: bridge13, DB3, desktop86, server59, web35, confini2. Esecuzione fuori sandbox per Git/rename/socket dei fixture Windows; il tentativo nel sandbox aveva EPERM dei percorsi temporanei, non è riportato come passato. Trasporto Pulse ritestato dopo controllo progetto interno e scope |
| Build | `pnpm build` e build finale UI/web/desktop passati,335moduli, chunk principale587,75kB minificati; warning Vite dimensione senza errore. Nessuna nuova dipendenza o schema Codex |
| PostgreSQL/audience reali | `pnpm verify:pulse`: **6 scenari** PostgreSQL/SMTP/HTTP/WS con3account temporanei,2progetti,105task client più task interne/estranee e oltre100milestone. Progressi globali prima dei limiti, figli stesso progetto/audience, summary UTC/mine, outcomes completed senza body, filtri e revoca su socket/snapshot, Origin/noStore |
| Regressione429 | `pnpm verify:session-rate` passato anche con backend0.10:4scenari/180letture su6minuti virtuali, burst/recupero/revoca e10controlli auth Electron nativi isolati. Nessuna inferenza personale |
| Desktop IPC | Smoke sviluppo e dell'eseguibile impacchettato passati: bridge Pulse validato, cookie arbitrari negati, mount/CSP e Node assente. Cookie/URL del main non esposti al renderer |
| UI/IPC e confronto | `pnpm verify:workspace`: **28/28** controlli finali,22storici più6Pulse, Git/TAP reali e trasporti provider/Pulse controllati dichiarati. Cinque milestone/quattro outcomes/presenza nel renderer/preload effettivi, dialog e scope mine, preview client senza dettagli locali, canvas fermo fuori viewport e reduced motion con bitmap identica |
| Fedeltà visiva | PNG1 originale e catture finali1586×992/960 aperte e ispezionate. Hero1050×232/railx1286, tre righe card, donut verde/ciano e wave3200punti; nessun overflow documento a1586, nessun overflow orizzontale a960, cinque membri visibili. Corretto footer che restringeva griglia di15px. Titoli/dati reali differenti e font/moto ricostruiti; nessuna uguaglianza pixel dichiarata |
| Pacchetto Windows | NSIS **0.10.0 x64**, `release/win/Nexus-AI-0.10.0-win-x64.exe`, **220035314 byte**, `NotSigned`; nessuna installazione automatica. Smoke dell'eseguibile `win-unpacked` passato |
| Segreti/pulizia | Scan1560file sorgenti/build:0valori privati;0account/workspace QA T10 residui,1account reale conservato,5migrazioni invariate. Fixture/email proprie rimosse, Mailpit/backend del maintainer conservati |
| Limiti di prodotto | Milestone/task in lettura fino aT11; outcomes sono estratti pubblicati, non deliverable; feedback/approvazioni cliente T11, GitHub T12, deploy condivisi/probe T13. Nessun dato PNG simulato nel normale avvio |
| Piattaforme | Windows x64 build/package/smoke passati; macOS/Linux portabili ma non buildati nativamente qui |

Versioni root/desktop/web/server/contratti **0.10.0**, UI0.3.0; DB0.9.0, bridge0.5.0 e Codex0.159.2 invariati. Nessuna migrazione/configurazione nuova. Guide/prova in [pulse.md](pulse.md), rapporti/catture `.nexus/visual/t10/`. Tutti i fronti consegnati/ownership rilasciate, nessun install/commit autonomo degli agenti. Chiudere vecchi app/backend, `pnpm install --frozen-lockfile`, `pnpm package:win`, quindi server/app in terminali distinti. Attendere feedback del maintainer prima di T11.

## Correzione T09 0.9.1 — controlli account

Log utente: GET `/auth/get-session` 429/rate_limited dopo 1–2 minuti. Ispezionata l'implementazione installata Better Auth 1.7.10: il contatore DB aggiorna lastRequest a ogni richiesta e si azzera dopo 60 s di inattività; polling ogni 2–30 s mantieneva la finestra aperta. La telemetria aggiungeva anche un HTTP account ridondante ogni 2 s quando abilitata. La riga utente dimostra il429; frequenza e implementazione sono state verificate nel codice, senza leggere credenziali o attribuire il problema a PostgreSQL indisponibile.

Solo `/auth/get-session` usa ora il gate applicativo bounded 100 richieste/IP per finestra fissa di60s, Retry-After e alias canonici coperti. Login/reset/email conservano i limiti della libreria; sessioni e permessi continuano a essere verificati sul DB. `DesktopTelemetry` legge un'identità locale staccata, poi riautorizza sul server la richiesta di dominio: nessuna cache di permessi. Nessuna nuova migrazione, dipendenza o modifica `.env`.

**Verifiche:** `pnpm check`, **186/186 test** (server52; gli altri domini invariati), `pnpm build`, smoke desktop passati. `pnpm verify:session-rate` passato: **4 scenari** con HTTP/PG/SMTP reali, 180 letture a intervalli di2s su6minuti virtuali senza pausa, burst100/min ancora limitato e recupero non esteso dai rifiuti, revoca efficace e **10 controlli auth Electron reali** con PKCE/cifratura OS, inclusi1.000 snapshot locali senza HTTP. Nessun minuto reale di attesa artificiale e nessuna inferenza personale. Rapporti `.nexus/visual/t09-fix/`; package/pulizia sotto.

Installazione frozen passata. Pacchetto Windows x64 **0.9.1**, `release/win/Nexus-AI-0.9.1-win-x64.exe`, **220029372 byte**, unsigned, generato senza installazione automatica; smoke dell'eseguibile impacchettato passato. Scan **1538 file** sorgenti/build senza valori privati `.env`; **0 account QA rate/native** residui, **1 account reale** conservato e5migrazioni invariate. Email/account propri rimossi, servizi del maintainer non arrestati. Mac/Linux non provati nativamente; UI T09 invariata.

Versioni app/root/desktop/web/server **0.9.1**, contratti/DB0.9.0 e Codex0.159.2 invariati. Per provare chiudere **sia app sia backend vecchi**, `pnpm package:win`, poi riavviare `pnpm start:server` e `pnpm start:desktop` separatamente. Nessuna nuova configurazione PostgreSQL o cancellazione login; il vecchio backend mantiene la vecchia regola finché non viene riavviato. Verificare Overview/telemetria e sessione oltre2minuti. La conferma0.9.1 è stata ricevuta all’avvio T10 (sopra).

## Ownership T09 integrate/rilasciate e contratto

| Fronte | Percorsi scrivibili | Obiettivo / handoff |
| --- | --- | --- |
| `/root/t09_server` — integrato | `apps/server/src/overview*.ts`, `app.ts` | Proiezione autorizzata feed/notification/read cursor, task esistenti e share attive; HTTP valido e test ruoli/isolation/pagination |
| `/root/t09_desktop` — integrato | nuovi `apps/desktop/src/overview-transport.ts`, `telemetry.ts`, test corrispondenti | Trasporto overview main-only e misure CPU/memoria opt-in scoped account/project/binding, campioni limitati, rete unknown |
| `/root/t09_web` — integrato | `apps/web/src/**`, test web T09 | Reference3 popolata da proiezioni reali, feed/filtri/lettura stabile/link, diff/sessione/health locali, notifiche e presenza |
| Coordinatore — integrato | contratti/DB/migrazione0004, auth/main/preload, manifest/lock, logging, QA/docs/GitHub | Integrazione unica, contratti fissi e consegna Windows |

Contratti fissi in `packages/contracts/src/overview.ts`: POST `/api/overview` snapshot(project/filter/before/limit) e markRead(through). Snapshot cursor/observedAt/activity/nextBefore/notifications/unreadCount/readThrough/tasks/activeShares/memberCount. Activity soltanto metadata sessions da outbox T08, raggruppata per entità aggiornata (non una riga per delta), filtri non ancora alimentati vuoti; target shared_session/live_share riaperto con permessi correnti. Notifiche degli altri autori, read cursor monotono per account/progetto in tabella overview_read_cursor migrazione0004; niente alert inventati da deploy/GitHub. WS T08 invalida proiezioni per cursore, nessun nuovo payload privato nel socket. Telemetry request getState/setEnabled con project/repository; state samples<=60/2s CPU/memoria del dispositivo, rete null, nessun upload o permesso permanente implicito. Desktop serve misure soltanto su ruolo tecnico e binding corrente; default off, stato resettato su cambio contesto/logout. Link a dettaglio autorizzato in sessione, nessuna esecuzione remota. Nessun task CRUD/T10/T11/T12/T13 anticipato. PNG3 aperta dal coordinatore prima delle deleghe.

## Evidenze T09 e prossimo passo

| Ambito | Esito |
| --- | --- |
| Installazione/statici | `pnpm install --frozen-lockfile`, `pnpm check` passati; controlli mirati su ultimo collegamento Tasks/QA passati, confini finali **79 file** |
| Test integrati | **184/184**: bridge13, DB3, desktop84, server50, web32, confini2. Feed/coalescenza/pagine/ruoli/lettura, trasporto ristretto, telemetria opt-in/lease/binding/generazioni e target revocati inclusi |
| Build | `pnpm build` passato, renderer **330 moduli**, chunk principale567,65kB minificati (warning Vite di dimensione, nessun errore). Nessuna dipendenza o schema Codex nuovi |
| Migrazione | **0004_overview.sql** applicata sul DB locale dedicato, **5 migrazioni** registrate. Solo cursore notifiche per account/progetto; account, progetti e `.env` conservati, nessuna migrazione all'avvio |
| Percorso reale overview | `pnpm verify:overview`: **7 scenari PG/SMTP/HTTP/WS reali** con tre account temporanei. Audience prima di conteggi/pagine, estraneo negato, task autorizzati, filtri indipendenti da notifiche, delta coalescenti, read cursor monotono/futuro e riavvio, cambio audience/target rimossi, revoca su socket aperto/Origin/noStore |
| UI/IPC e OS | `pnpm verify:workspace`: **22 controlli** nel renderer/preload effettivi, Git e TAP reali isolati, trasporti provider/shared controllati dichiarati. Confronto overview1586×992 popolata, Enable→CPU/memoria OS reali, rete null, Mark read/filtri, locale vs osservato con Stop disabilitato, deep link, feed stabile con nuovi eventi e rimozione immediata target/offline |
| Confronto visivo | PNG3 originale aperta e cattura `overview-populated.png` ispezionata. Strip84px/sessione278px/feed420px e rail preservati con planet/particelle T02; niente health/deploy numerici di esempio. Nessuna uguaglianza pixel di contenuti differenti o OS non provati dichiarata |
| Electron/shell | Smoke sviluppo e pacchetto Windows passati: overview/telemetry IPC validati, input cookie/path/command arbitrari negati e Node assente. Shell3 layout/4gate, tastiera, reduced motion e960px passati |
| Pacchetto Windows | NSIS **0.9.0 x64**, `release/win/Nexus-AI-0.9.0-win-x64.exe`, **220029062 byte**, unsigned; nessuna installazione automatica |
| Segreti/pulizia | Scan **1536 file** sorgenti/build senza valori privati `.env`; **0 account/workspace QA T09** residui e **1 account reale** conservato. Email/fixture propri rimossi; Mailpit preesistente conservato |
| Prova personale/limiti | Task CRUD/T11, GitHub/T12, deploy/T13 restano futuri; feed recente retained, notifiche altri autori. Nessuna inferenza personale automatica. Monitor solo dispositivo locale opt-in/lease10s; test report con fonte/data, health aggregata assente |
| macOS/Linux | Implementazione/packaging portabili; build/keyring/campionamento nativi non provati qui |

Versioni root/desktop/web/server/contratti/DB **0.9.0**, bridge0.5.0/UI0.2.0 e Codex ufficiale **0.159.2** invariati. Contratto finale include `authorizedTargets` (max1.000), set metadata corrente che elimina i target revocati anche dalle righe congelate durante lettura; nessun contenuto grezzo aggiunto al WS. Fronti integrati e ownership rilasciate; nessun agente ha installato dipendenze o fatto commit autonomo.

Chiudere app/backend precedenti, `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm package:win`; avviare server e app separatamente. [Prova completa T09](overview.md#build-e-prova-windows): due account, share/estratto, feed/link/read, locale/remoto, opt-in e revoca. Rapporti/catture `.nexus/visual/t09/`, shell nel percorso storico `.nexus/visual/t02/`. Feedback T09/0.9.1 ricevuto all’avvio T10 (sopra).

## Ownership T08 integrate/rilasciate e contratto

| Fronte | Percorsi scrivibili | Obiettivo / handoff |
| --- | --- | --- |
| `/root/t08_server` — integrato | `apps/server/src/realtime*.ts`, `app.ts`, `sessions.ts`, test server pertinenti | HTTP upload selezionato, outbox atomica, WS autenticato, snapshot/replay/ACK/presenza/revoca |
| `/root/t08_desktop` — integrato | `apps/desktop/src/realtime*.ts`, test corrispondenti, `codex.ts` e suo test per perdita auth transitoria | WS nel main, coda cifrata/bounded, offset/idempotenza, recupero senza replay eseguibile |
| `/root/t08_web` — integrato | `apps/web/src/**`, `apps/web/vite.config.ts`, test web | Presenza e sync reali reference, share live esplicito e proiezioni autorizzate, recupero senza dati obsoleti |
| Coordinatore — integrato | contratti/DB/migrazione, auth/main/preload, manifest/lockfile, logging, QA/docs | Contratti unici e migrazione additiva 0003, integrazione e consegna |

Contratti fissati in `packages/contracts/src/realtime.ts`: HTTP `POST /api/realtime` snapshot/readShare/upload; WS `/api/realtime` join/heartbeat/ack, frame snapshot/events/presence/heartbeat/denied. Cursori decimali per progetto, eventi durevoli solo metadata con proiezioni attuali: i dettagli selezionati si rileggono tramite readShare, senza raw protocol/tool/file. Migrazione 0003: project_realtime_cursor, live_share, realtime_event, realtime_upload; receipt idempotente con hash e ACK dopo COMMIT. Upload start/append/stop con offset testuali, max20 messaggi/128Ki caratteri, batch append16Ki. Condivisione soltanto messaggi scelti e confermati, futuri delta degli stessi ID; nessun nuovo messaggio o comando aggiunto implicitamente. Queue main cifrata max100/1MiB, riautorizzata prima del flush, scoping account/progetto/repo/root e nessun consenso/esecuzione in coda. Reconnect massimo8 tentativi con backoff+jitter e retry manuale; presenza heartbeat15s/scadenza45s, permessi/sessione ricontrollati anche a connessione aperta. Singolo backend con outbox PostgreSQL, nessun Redis/provider/deploy aggiunto. T09 non avviato.

## Evidenze e procedura storica T08

| Ambito | Esito |
| --- | --- |
| Installazione/statici | `pnpm install --frozen-lockfile`, `pnpm check` passati: typecheck/lint e confini 72 file. Lint/typecheck QA mirati dopo estensione delle catture |
| Test integrati | **160/160**: bridge13, DB3, desktop72, server43, web27, confini2. Coda/offset/stop a coda piena, revoca, Unicode, backpressure, rate, ACK WS separato da HTTP e scoping inclusi. Esecuzione nativa fuori dal sandbox Windows che blocca rename/Git dei fixture |
| Build | `pnpm build` passato; renderer322 moduli, chunk principale548 kB minificati (warning dimensione Vite, nessun errore). Main ESM include compatibilità createRequire per ws; preload isolato CJS |
| Migrazione | **0003_realtime.sql** applicata sul DB locale dedicato, **4 migrazioni** registrate. Additiva e idempotente, nessuna migrazione all'avvio; `.env` e account/progetti conservati |
| Percorso reale realtime | `pnpm verify:realtime`: **8 scenari** PG/SMTP/HTTP/WS reali con tre account temporanei. Presenza a due, estraneo, offset/idempotenza, audience/cursore, vero servizio desktop con ACK perso dopo commit, backend riavviato, revoca di socket aperto, Origin e metadata. Source Codex controllata e storage in memoria del fixture: nessuna inferenza personale |
| UI/IPC/visivo | `pnpm verify:workspace`: **13 controlli**, renderer/preload effettivi, Git/TAP reali e trasporti dichiarati controllati. Nuove catture Connection e consenso live a1586×992 ispezionate, PNG2/3 originali aperte. Nessuna preselezione e conferma disabilitata senza consenso; layout/pianeta/particelle T02 preservati |
| Electron/shell | Smoke sviluppo e pacchetto Windows passati, IPC realtime validato/Node assente. Tre layout reference, quattro gate collaborazione, tastiera, reduced motion e960px passati |
| Pacchetto Windows | NSIS **0.8.0 x64**, `release/win/Nexus-AI-0.8.0-win-x64.exe`, **220017318 byte**, unsigned. Nessuna installazione automatica |
| Segreti/pulizia | Scan **1513 file** sorgenti/build, **0** valori privati `.env`; **0** account/workspace QA T08 residui, **1 account reale** conservato. Rimossi solo email e cartelle QA proprie, Mailpit preesistente lasciato attivo |
| Limiti e prova personale | Singola istanza backend/poll2s, retention1.000 eventi metadata; stato attuale e testo accettato persistenti. Condivisione solo stessi ID selezionati. Ripristino coda sospeso, Retry esplicito; nessun replay di esecuzione/approvazione. Due account e stream personale da provare dal maintainer |
| macOS/Linux | Codice e packaging portabili; build, keyring e prova nativa non eseguiti qui |

Versioni root/desktop/web/server/contratti/DB **0.8.0**, bridge0.5.0/UI0.2.0 invariati; Codex ufficiale **0.159.2** e generated schema invariati. Nuova dipendenza `ws`8.22.0 con tipi8.18.2, Zod4.6.7 nel desktop come nei contratti. Il main riusa la credenziale corrente senza duplicare `/auth/get-session` a ogni delta; autorizzazione corrente comunque applicata dal server per ogni operazione e dal controllo membership live. Nessun agente ha installato dipendenze o fatto commit; integrazione unica.

Procedura consegnata con T08: installazione/migrazione/packaging, due account, Share live, Stop, reconnect e revoca in [realtime.md](realtime.md#build-e-prova-del-maintainer). Rapporti/catture `.nexus/visual/t08/`; shell nel percorso storico `.nexus/visual/t02/`. Il maintainer ha confermato la build Windows e autorizzato T09, ora consegnato sopra.

## Ownership T07 integrate/rilasciate e contratto

| Fronte | Percorsi scrivibili | Obiettivo / handoff |
| --- | --- | --- |
| `/root/t07_runtime` — integrato | `apps/desktop/src/codex*.ts`, `apps/desktop/test/codex*.test.ts` | Policy readOnly/workspaceWrite esplicita, approvazioni singole con scadenza/scoping, stream output/diff e report test |
| `/root/t07_workspace` — integrato | `apps/desktop/src/workspace.ts`, `workspace-git.ts`, `workspace-diff.ts`, `apps/desktop/test/workspace.test.ts` | Diff Git locale senza hook, path sicuri, apertura VS Code e preview configurata; API servizio per main |
| `/root/t07_web` — integrato | `apps/web/src/**`, nuovo `apps/web/test/t07.test.mjs` | Code Preview split/unified, output/test/preview, policy e dialog approvazioni fedeli reference 2 |
| Coordinatore — integrato | contratti, bridge protocollo, main/preload, `workspace-verification.ts`/`verify-workspace.mjs`, manifest/lockfile, QA/docs | Contratti unici, integrazione nativa, verifica e consegna |

Contratti T07 in `packages/contracts/src/{codex,workspace}.ts`. Policy iniziale readOnly; workspaceWrite solo scelta locale esplicita, limitata al binding corrente, network sandbox disabilitato. Richieste moderne provider tradotte in ID UUID opachi, decisione acceptOnce/decline, massimo 20 pendenti e scadenza entro 110 s; mai persistenza/replay/autorizzazioni di sessione. Riautorizzazione owner/developer e binding prima di rispondere, invalidazione su stop/logout/cambio binding/turno. Legacy e richieste non supportate negate. Diff/output/report rimangono locali e non entrano automaticamente negli estratti T06. Workspace API senza path, comandi o schemi arbitrari dal renderer: file UUID del risultato locale, editor URI VS Code costruito nel main, preview URL configurato esplicitamente e aperto nel browser di sistema. Nessuna migrazione DB prevista; T08/T12/T13 non avviati.

## Evidenze e procedura storica T07

| Ambito | Esito |
| --- | --- |
| Installazione/statici | `pnpm install --frozen-lockfile` invariato; `pnpm check` passato, confini 67 file. Typecheck/lint mirati ripetuti solo sulle correzioni successive |
| Test integrati | **124/124**: bridge 13, DB 3, desktop 58, server 32, web 16, confini 2. Comprendono decisione singola/expiry/replay/ruoli/binding, patch complete, output/report bounded e Git/filesystem reali con filtri ostili |
| Build | `pnpm build` passato, renderer finale 316 moduli. Warning chunk principale circa 526 kB minificati; nessun errore o nuova dipendenza |
| UI/IPC popolata | `pnpm verify:workspace`: **10 controlli** su renderer e preload effettivi, servizi main reali, Git e TAP Node in fixture isolato. Split/unified/Terminal/Tests/Preview, consenso policy e Allow once/Decline via IPC. Provider/account controllati, OS opens intercettati: nessuna inferenza personale |
| Confronto visivo | Catture split/unified e dialog approvazioni a 1586×992; original PNG 2 aperta. Corretto spazio del diff e output 130 px, metadata repository contenuti. Shell/pianeta/effetti T02 preservati; non dichiarata uguaglianza pixel di tutti i contenuti o altri OS |
| Electron/shell | Smoke sviluppo e pacchetto Windows passati, bridge workspace validato, path arbitrari/consenso permanente negati, Node assente. Shell reference, tastiera/reduced motion e 960 px passati |
| Pacchetto Windows | NSIS **0.7.0 x64**, `release/win/Nexus-AI-0.7.0-win-x64.exe`, **219912210 byte**, unsigned; nessuna installazione automatica |
| Segreti/dati | Scan **995 file** sorgenti/build senza valori privati `.env`. Nessuna operazione DB o modifica `.env`, credenziali/account/progetti conservati. Cartella Git/profilo QA rimossi dopo il test |
| Prova personale | Modifica/escalation eseguite dal proprio Codex e apertura effettiva VS Code/browser da verificare dal maintainer; fixture e decisione su trasporto controllato non dimostrano inferenza |
| macOS/Linux | Implementazione portabile, prove native non eseguite su questa macchina Windows |

Versioni root/desktop/web/contratti **0.7.0**, server/DB 0.6.0, bridge 0.5.0 e UI 0.2.0; runtime ufficiale invariato **0.159.2** e generated schema immutato. Ownership chiuse dopo integrazione; nessun agente ha installato dipendenze o fatto commit. Rapporti/catture in `.nexus/visual/t07/`, shell nel percorso storico `.nexus/visual/t02/`.

Procedura consegnata con T07: installazione/packaging e prova di Workspace write, file/diff, approvazioni e preview in [session.md](session.md#build-e-prova-del-maintainer). Il maintainer ha confermato la build Windows funzionante e autorizzato T08, ora consegnato sopra con la nuova migrazione0003.

## Ownership T06 integrate/rilasciate e contratto

| Fronte | Percorsi scrivibili | Obiettivo |
| --- | --- | --- |
| `/root/t06_desktop` — integrato | `apps/desktop/src/codex*.ts`, nuovo `context*.ts`, test disgiunti | File scelti nativamente, testo sicuro entro root, draft cifrato, Git locale osservato, input Codex, piano/token reali |
| `/root/t06_server` — integrato | nuovo `apps/server/src/sessions.ts`, `sessions.test.ts` | Pubblicazione esplicita di estratti e cronologia autorizzata, lettura task di progetto esistenti |
| `/root/t06_web` — integrato | `apps/web/src/**`, test web | Reference 2, file chip/preview, bozza, piano, metriche reali, condivisione con preview e cronologia pubblicata |
| Coordinatore — integrato | contratti/DB/migrazioni, auth/main/preload desktop, route server/logging, manifest, QA/docs | Contratti unici, integrazione, migrazione additiva e consegna |

Contratti fissati in `packages/contracts/src/{context,sessions,codex}.ts`. Fino a 8 file UTF-8 da 64 KiB e 256 KiB complessivi, soltanto selezione nativa dentro il binding autorizzato e senza file segreti/binari. Bozza locale cifrata e nessun path arbitrario dal renderer. La chat resta locale finché l'utente seleziona e conferma un estratto in preview: max 20 messaggi, 128 Ki caratteri complessivi; audience team/client e versione attesa. Il backend non riceve thread provider/path locali/credenziali/attività grezze. Scrittura/approvazioni T07 e realtime T08; niente task CRUD/GitHub/deploy anticipati. Ogni fronte ricontrolla account/ruoli/binding e conserva la correzione auth 0.5.1.

La selezione non garantisce assenza di segreti dentro normali sorgenti. L'estratto scelto può contenere testo con percorsi/codice: preview e conferma servono a revisionarlo, non viene promessa redazione automatica. Versioni root/app/server/contratti/DB **0.6.0**, bridge 0.5.0 e UI 0.2.0; runtime Codex invariato 0.159.2. Nessuna nuova dipendenza.

## Evidenze T06

| Ambito | Esito |
| --- | --- |
| Statici | `pnpm check` passato: typecheck, lint e confini 61 file |
| Test | **101/101**: bridge 13, DB 3, desktop 40, server 32, web 11, confini 2. Contesto/TOCTOU, scoping, Git spoof/hooks, draft, autorizzazioni/versioni/audience e IPC/trasporti |
| Build | Passata, 310 moduli web; warning Vite per chunk principale circa 506 kB minificati, nessun errore o aumento dipendenze |
| Migrazione | `0002_session_snapshots.sql` applicata sul DB dedicato esistente; 3 migrazioni registrate, account/progetti conservati. Additiva, nessuna migrazione all'avvio |
| `pnpm verify:sessions` | **5 scenari reali** PostgreSQL/SMTP/HTTP: publish/retry, audience/isolation, driver/device e CAS concorrente, task/revoca, audit e route/origin. Nessuna inferenza |
| Pulizia QA | 0 account e 0 workspace T06 QA residui, **1 account reale conservato**. Rimosse soltanto email/fixture della prova |
| Electron/shell | Smoke sviluppo passato con bridge context/sessions, input path/cookie arbitrari negati e Node assente. Tre layout reference/gate, tastiera/reduced motion e 960 px passati; cattura sessione ispezionata, forme autenticate da prova manuale |
| Pacchetto Windows | NSIS 0.6.0 x64, `release/win/Nexus-AI-0.6.0-win-x64.exe`, **219880788 byte**, unsigned. Smoke dell'eseguibile impacchettato passato |
| Segreti | Scan **974 file** sorgenti/build senza valori privati del `.env`; nessun dump di contenuti/chat/credenziali nei rapporti |
| Prova personale | Picker/bozza/preview/Share, streaming/token/piano con il proprio Codex e confronto popolato da verificare dal maintainer; nessuna inferenza personale eseguita dall'agente |
| macOS/Linux | Implementazione portabile, build/keyring/Git/picker nativi non provati qui |

Rapporto `.nexus/visual/t06/sessions-report.json` e smoke pacchetto locali; catture nel percorso storico `.nexus/visual/t02/`. Scelte/test e limiti dettagliati in [session.md](session.md). I subagenti non hanno installato dipendenze o fatto commit; un solo autore per contratti/migrazioni/lockfile.

## Procedura storica T06

Procedura consegnata con T06: `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm package:win`, quindi server e app aggiornati. DB e `.env` esistenti bastano. File/preview, Saved dopo navigazione/riavvio, piano/token, Share con audience e secondo account restano verificabili nella [guida](session.md#build-e-prova-del-maintainer). Il maintainer ha confermato la build Windows e autorizzato T07, ora consegnato sopra. GitHub T12 e Deploy T13 sono spiegati nella [mappa pannelli/dati](product.md#da-dove-arrivano-i-dati-dei-pannelli).

## Correzione T05 0.5.1

Feedback maintainer: login Codex riuscito; al riavvio Nexus/Codex richiedono refresh manuale e dopo avvio chat Nexus segnala account server unavailable. Backend riferito ancora attivo. Richiesti log server completi con Chalk. Nessun nuovo task avviato, credenziali/account/progetti preservati.

| Fronte | Ownership | Obiettivo |
| --- | --- | --- |
| `/root/fix_auth` — integrato/rilasciato | `apps/desktop/src/auth.ts`, `auth-verification.ts` | Check concorrenti accorpati senza bypassare logout/callback/permessi; pubblicazione solo transizioni; gestione scadenze e 429 |
| `/root/fix_renderer` — integrato/rilasciato | `apps/web/src/auth/**`, `apps/web/src/codex/**`, test renderer pertinenti | Sottoscrizione prima del recupero, revisioni contro risultati obsoleti, ripristino Codex una volta per account con Disconnect rispettato |
| Coordinatore — integrato | server/logging/test, manifest/lockfile, docs e QA | Chalk 6.0.1, richieste/errori sanitizzati, verifiche reali auth e pacchetto Windows |

Difetti di startup corretti; non è stata riprodotta la causa esatta del blocco dopo chat. I contatori DB ispezionati in sola lettura non dimostravano saturazione; nessuna attribuzione automatica al rate limiter. La nuova diagnostica distingue status HTTP, 429 e codici stabili senza esporre body o segreti. Accesso/ruoli restano riautorizzati dal backend, senza cache temporale che ritardi la revoca.

**Verifiche 0.5.1:** `pnpm check` passato (52 file ai confini), **73/73 test** (bridge 13, desktop 26, server 23, DB 3, web 6, confini 2), build passata (300 moduli web), smoke Electron passato. `pnpm verify:auth-desktop` passato con **9 verifiche reali** PG/SMTP/PKCE/cifratura OS: primo ripristino, 20 controlli contemporanei→1 HTTP, nessun evento duplicato, outage/429/scadenza invalida e recupero, expiry senza loop, revoca. Errori di rete/429/dati errati iniettati soltanto sul trasporto QA. Eliminato l'unico account QA creato e le sue email, **1 account reale conservato**. Log HTTP osservati dal backend compilato, senza query/token. Versioni app/desktop/web/server **0.5.1**, contratti/bridge 0.5.0, DB 0.4.0 e UI 0.2.0. Nessuna nuova migrazione o cambio credenziali.

Installer Windows x64 **0.5.1** generato, `release/win/Nexus-AI-0.5.1-win-x64.exe`, **219855203 byte**, unsigned; smoke dell'eseguibile impacchettato passato. Backend temporaneo QA arrestato, Mailpit preesistente conservato. Le prove personali di riavvio/chat rimangono distinte da questi controlli.

## Risultato T05

- Codex ufficiale **0.159.2** nativo incluso nell'app; versione esatta, schema TypeScript generato immutato e supervisore stdio con framing, timeout, backpressure e shutdown atteso.
- Settings con connect/disconnect, login personale browser/device, annullamento/logout, API key soltanto esplicita e catalogo modelli/effort reale. Identità Nexus distinta da Codex; nessuna importazione di credenziali di altre app.
- Home/keyring OS per account Nexus, mapping atomico thread per account/progetto/repository/cwd canonico. Nessun token, chiave o transcript inviato al server. Logout/cambio account Nexus ferma il processo e cancella subito lo stato corrente.
- AI Session nella shell reference 2: messaggi reali progressivi, attività osservabili, nuovo thread, interruzione e ripresa. Nessun ragionamento privato, contatore di test o risultato fittizio.
- Ogni operazione sessione ricontrolla ruolo owner/developer, repository e binding T04. Renderer senza Node/RPC/cwd arbitrari. Snapshot e protocollo limitati; policy **readOnly** iniziale, escalation declinate e operazioni non supportate rifiutate. Scrittura e approvazioni interattive T07, contesto avanzato T06, condivisione/realtime T08.
- App/root/desktop/web/contratti/bridge **0.5.0**. Server/DB **0.4.0**, UI **0.2.0**: nessuna nuova migrazione o configurazione PostgreSQL. Runtime e licenza Apache-2.0/notices nel pacchetto; MIT per Nexus.
- Packaging sul proprio OS e architettura Node x64/arm64, con vendor Codex corrispondente. Windows x64 verificato; altre combinazioni non dichiarate provate.

## Ownership T05 integrate e rilasciate

| Fronte | Agente | Percorsi integrati |
| --- | --- | --- |
| Bridge protocollo | `/root/t05_bridge` | `packages/codex-bridge/src/**`, `test/**`, `tsconfig.json` |
| Desktop | `/root/t05_desktop` | `apps/desktop/src/**`, `test/**` |
| Renderer | `/root/t05_web` | `apps/web/src/**` |
| Integrazione | Coordinatore — integrato | contratti, schema generato, manifest/lockfile, provision/build/packaging, licenze, documenti e QA |

Skill `nexus-coordination` e `openai-docs` applicate. Contratti fissati prima degli edit; un writer per manifest/contratti/schema. Nessuna nuova chat utente, installazione concorrente o commit degli agenti. Tutti gli handoff integrati; nessuna delega residua.

## Evidenze iniziali T05 0.5.0

| Ambito | Esito |
| --- | --- |
| `pnpm check` | Typecheck completo, ESLint e confini renderer **50 file** passati. Corretto un warning lint nello script di cleanup QA prima del controllo integrato riuscito |
| `pnpm test` | **65/65**: bridge 13, desktop 26, server 20, DB 3, web 1, confini 2. Include lifecycle, framing, isolamento account, late event, ruoli/binding, readOnly, stream/limiti, ripresa, login/cancel/device e mapping atomico |
| `pnpm build` | Passato, renderer 298 moduli; runtime nativo della piattaforma preparato dal lockfile |
| `pnpm verify:codex` | Binario reale 0.159.2 Windows x64, initialize, account/read nullo in home nuova, 8 modelli del catalogo, arresto senza lock residui. Nessun login o inferenza |
| Runtime impacchettato | `pnpm verify:codex --packaged` passato sugli stessi passaggi usando `resources/codex/bin/codex.exe` |
| Electron | Smoke sviluppo e dell'eseguibile impacchettato passati: renderer montato, IPC Codex validato, input arbitrario negato, Node assente |
| Shell | Tre layout reference, quattro gate collaborazione, tastiera/reduced motion e sessione a 960 px passati; cattura sessione ispezionata. Catture locali nel percorso storico `.nexus/visual/t02/` |
| Pacchetto Windows | NSIS **0.5.0**, `release/win/Nexus-AI-0.5.0-win-x64.exe`, **219852006 byte**, unsigned; nessuna installazione automatica. Runtime escluso dall'asar e copiato una sola volta in resources |
| Segreti/licenze | Scan 924 file source/build senza valori privati del `.env`; licenza Codex nell'asar, vendor notices conservati, documento terze parti incluso nelle resources |
| Prova personale | Login Codex confermato dal maintainer dopo consegna; risposta completata/interruzione/ripresa non ancora confermate. Feedback e correzione 0.5.1 sopra. Catalogo anonimo e test di trasporto non dimostrano quota/diritti di inferenza |
| macOS/Linux | Configurazioni native presenti; packaging, keyring e inferenza non provati qui |

Rapporti locali `.nexus/visual/t05/`: runtime, runtime impacchettato e smoke. L'home QA anonima viene eliminata dopo lo shutdown; account reale e profili delle altre app conservati. I test di servizio usano trasporto controllato e non sono descritti come inferenza.

## Continuità T04

T04 implementa workspace/progetti PostgreSQL, membri/ruoli, inviti SMTP monouso, repository remoti e binding locale separato. Migrazione additiva `0001_collaboration.sql`, 42 test, 12 scenari reali PG/SMTP/HTTP con tre account temporanei e pacchetto Windows 0.4.0/smoke passati. Fixture rimossi, unico account reale conservato. Form autenticati, invito con secondo account e selettore cartella nativo restano da prova manuale secondo [collaboration.md](collaboration.md). L'autorizzazione a T05 non è un'accettazione implicita di quei passi.

## Procedura storica T05

Chiudere app/backend precedenti, eseguire `pnpm install --frozen-lockfile` e `pnpm package:win`, riavviare `pnpm start:server` e app aggiornata oppure `pnpm start:desktop`. PostgreSQL e `.env` esistenti vanno bene. Mailpit una sola istanza per email Nexus/inviti; non riceve il login Codex.

Avviare **prima il backend aggiornato**, poi l'app 0.5.1. Il login Nexus viene ripristinato e Codex ricollegato automaticamente usando la home/keyring dedicata. Connect/login manuali restano disponibili quando necessari. Seguire [prova personale T05](codex.md#prova-manuale-t05), verificare chat/interruzione/riapertura e recupero senza refresh obbligatorio a ogni avvio. Se ricompare il blocco, riportare le righe server WARN/ERROR o i completamenti auth/collaboration vicini all'errore; [log e livelli](../CONTRIBUTING.md#log-server-e-diagnosi). Nessuna password o API key da inviare in chat.

Il maintainer ha poi autorizzato T06, consegnato sopra. Firma/notarizzazione/hosting restano T16. Modalità offline avanzata T08: il backend deve essere raggiungibile per riaccertare sessione e ruolo.
