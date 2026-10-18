# Piano di lavoro

## Regola di esecuzione

Una **tranche** raggruppa una parte coerente del prodotto. Dentro la tranche si esegue **un task corrente alla volta**; il task può avere fronti paralleli con file disgiunti e contratti concordati. Completare, integrare, documentare e consegnare quel task prima di spostare il lavoro su un altro obiettivo. Le build manuali vengono eseguite dal maintainer, con prova Mac dal Mac più avanti.

T00 prepara la base. Lo sviluppo T01 parte dopo il via del maintainer. Non sono previste versioni demo o un MVP da riscrivere: ciascun task aggiunge codice definitivo, anche se il prodotto nel suo complesso è ancora incompleto. I blocchi non collegati mostrano uno stato vuoto/disponibilità esplicita, mai dati finti nel normale avvio dell'app.

## Roadmap

| Tranche | Task in ordine | Risultato cumulativo | Requisiti |
| --- | --- | --- | --- |
| 0 — Preparazione | T00 | Requisiti, design, regole, skill e repository | R14, R16 |
| 1 — Fondazioni | T01 → T02 | Monorepo/build desktop e shell grafica definitiva | R01, R14 |
| 2 — Workspace | T03 → T04 | Identità Nexus, progetti, membri e inviti reali | R02, R15 |
| 3 — Codex locale | T05 → T06 → T07 | Account personale, sessione, contesto, diff e approvazioni | R03–R05 |
| 4 — Collaborazione | T08 → T09 | Sincronizzazione, presenza e overview condivisa | R06, R07 |
| 5 — Lavoro e cliente | T10 → T11 | Pulse, task/roadmap, deliverable e feedback completi | R08, R09, R11 |
| 6 — Integrazioni | T12 → T13 → T14 | GitHub, deploy, ambiente, ricerca e impostazioni | R10, R12, R13 |
| 7 — Completamento | T15 → T16 | Fedeltà/recupero verificati e distribuzione riproducibile | R01, R14–R16 |

## Schede task

### T00 — Base di progetto

**Stato:** completato; evidenze GitHub, skill e controlli in `status.md`. **Dipendenze:** conversazione e reference. **Owner:** coordinatore.

Consegna: documenti di prodotto/architettura/protocollo/design, regole `AGENTS.md`, skill versionata, piano a task, repository pubblico, licenza e changelog. Uscita: link interni controllati, tre reference integre, limiti delle fonti dichiarati, prossimo task chiaro. Nessuna build applicativa dichiarata. La sola azione successiva richiesta al maintainer è il via a T01.

### T01 — Monorepo e build native

**Stato:** [accettato dal maintainer su Windows — issue #1](https://github.com/AndreaZero/nexus-ai/issues/1). **Dipendenze:** T00 e via ricevuto il 17 ottobre 2026. **Owner:** coordinatore/integratore, con tre fronti desktop/server/renderer integrati.

Creare `apps/desktop`, `apps/web`, `apps/server`, `packages/contracts`, `packages/ui`, `packages/codex-bridge`, `packages/db`; fissare versioni stabili, workspace e lockfile, TS strict, entrypoint reali e comandi dev/build/check/package. Rendere il renderer comune caricabile in Electron isolato e web. Predisporre packaging Windows/macOS/Linux e app ID stabile. Creare solo i contratti necessari alla struttura e i confini IPC, senza generare pagine dimostrative.

Fronti possibili dopo i contratti: desktop/build; backend/bootstrap; renderer/bootstrap. Il coordinatore resta autore esclusivo di manifest root, lockfile, TS condiviso e contratti.

**Uscita:** installazione riproducibile e compilazione della base sul sistema disponibile; configurazioni native per tutti gli OS; istruzioni esatte per l'utente. Verifica mirata dei confini renderer/main. **Build utente:** Windows qui; macOS differita al Mac; Linux indicata separatamente. Non dichiarare packaging verificato dove non eseguito.

**Evidenza T01:** `pnpm check`, 16 test mirati, `pnpm build`, smoke Electron produzione e Vite, liveness HTTP reale, `pnpm package:win` e smoke dell'eseguibile impacchettato passati su Windows x64. Installer unsigned, nessuna installazione automatica. Il maintainer conferma la build Windows funzionante; configurazioni macOS/Linux e CI presenti, prove native Mac/Linux ancora da registrare. Comandi in `CONTRIBUTING.md`.

### T02 — Sistema visivo e shell definitiva

**Stato:** [accettato dal maintainer su Windows — issue #2](https://github.com/AndreaZero/nexus-ai/issues/2), build funzionante e UI approvata. **Dipendenze:** T01 accettato e via del maintainer con multiagenti. **Ownership:** fronti UI, effetti e layout integrati; ownership rilasciate.

Trasferire token CSS, font e licenze; costruire logo, sidebar con pianeta/orbite, header, ricerca e tab, card, badge, avatar, pulsanti, progressi e donut. Impostare layout distinti delle tre viste e rotte future con stati vuoti reali. Effetti ambientali e reduced motion fanno parte del task, non di un generico polish futuro. Le feature ancora assenti non espongono pulsanti finti.

**Uscita:** frame riconoscibile e proporzioni delle PNG a 1586 × 992, focus/tastiera e finestra ridotta utilizzabili. Controllo visuale una volta su frame e componenti, correggendo differenze materiali. **Build utente:** verificare shell, sidebar, resize, movimento normale/ridotto.

**Evidenza T02:** token e font locali, tre griglie, effetti procedurali, primitive, navigazione e impostazioni integrate nella stessa app. Check statici e 16 test passati; renderer reale catturato a 1586 × 992 e 960 × 800, con verifica focus ricerca e preferenza movimento ridotto. Rettangoli e differenze residue in [confronto T02](design/t02-review.md). Le PNG contengono dati di progetto; la shell consegnata mantiene stati vuoti finché le capacità reali non arrivano. Il maintainer ha confermato build Windows funzionante e UI approvata; CI del commit `187506b` passata sui tre runner. PostgreSQL non serve per T02.

### T03 — Identità Nexus e accesso

**Stato:** [accettato dal maintainer su Windows — issue #3](https://github.com/AndreaZero/nexus-ai/issues/3), login e ritorno browser → app confermati dopo correzione `5fa5846`; via a T04 ricevuto. **Dipendenze:** T01–T02 accettati, PostgreSQL e `.env` predisposti dal maintainer, Mailpit locale scelto. **Ownership:** fronti T03 integrati e rilasciati.

Prima dell'implementazione della persistenza avvisare il maintainer: creerà personalmente PostgreSQL locale. Comunicare versione supportata, database/utente dedicati e variabili richieste dopo aver definito schema e libreria auth; non richiedere credenziali in chat.

Implementare account Nexus, email verificata, sessioni, logout/revoca e reset tramite libreria mantenuta; flusso desktop nel browser di sistema e ritorno validato. Distinguere chiaramente login Nexus e collegamento Codex. Configurazione email reale/self-host e errori recuperabili; nessun segreto nel renderer.

**Uscita:** registrazione/login/logout, reset e sessione persistente funzionanti; rifiuto sessioni scadute e callback invalide. Test mirati auth e confini IPC. **Build utente:** accedere, riaprire e uscire; prerequisiti email documentati.

**Evidenze T03:** migrazione reale/idempotente, check, 29 test iniziali, prove PostgreSQL/SMTP/PKCE/storage/revoca e pacchetto Windows 0.3.0 con smoke. Corretti CORS asset e reload prematuro del trasferimento browser; relativo test di regressione passato. Il maintainer conferma login e ricezione dell'accesso dal browser nell'app Windows e autorizza T04. Mac/Linux non provati nativamente. [Setup e passi manuali](auth.md).

### T04 — Workspace, progetti, membri e inviti

**Stato:** [implementato e consegnato per verifica Windows — issue #4](https://github.com/AndreaZero/nexus-ai/issues/4). **Dipendenze:** T03 accettato e via del maintainer con multiagenti. **Ownership:** backend, renderer e desktop integrati, coordinatore DB/contratti/prove; ownership rilasciate. Specifica effettiva in [collaboration.md](collaboration.md).

Creare workspace/progetto, associare repository/binding locale come record distinto, selezione progetto, ruoli owner/developer/client/viewer e policy private/team/client. Inviti monouso con scadenza, accettazione e revoca. Creare basi dati per task/milestone e sessioni senza inventare contenuti.

**Uscita:** due account invitati vedono solo progetti consentiti; terzo estraneo negato su API e allegati; riduzione ruolo efficace. **Build utente:** creare progetto, invitare e accettare con secondo account.

**Evidenze T04:** migrazione additiva/idempotente, 42 test, 12 scenari reali PostgreSQL/SMTP/HTTP con tre account temporanei (isolamento, inviti, riduzione/revoca, owner concorrenti e issuer revocato), statici/build, shell e pacchetto Windows 0.4.0 con smoke passati. Fixture rimossi, account reale conservato. Le API allegati non sono ancora disponibili (404); nessun contenuto scaricabile esposto. Form autenticati/due account/dialogo nativo da prova manuale del maintainer; macOS/Linux da provare nativamente. Il maintainer ha autorizzato T05 senza un'accettazione manuale T04 esplicita.

### T05 — Runtime locale Codex e account personale

**Stato:** [implementato e consegnato per verifica personale Windows — issue #5](https://github.com/AndreaZero/nexus-ai/issues/5), avviato su richiesta esplicita del maintainer; non deduce una prova manuale T04. **Dipendenze:** T04 implementato. **Ownership:** bridge, desktop e renderer integrati/rilasciati; coordinatore contratti, schema, runtime/build/packaging e prove. Runtime fissato **0.159.2**, policy readOnly iniziale esplicita; [contratto e prova T05](codex.md#prova-manuale-t05).

Adottare runtime ufficiale/versione, schema generato, home dedicata e supervisore multipiattaforma. Implementare login personale, stato account, modelli, logout e API key opzionale esplicita. Thread/turni/stream/interruzione funzionano sul filesystem scelto; errori runtime/account/quota sono gestiti. Questa integrazione è codice dell'app, senza un'app di prova separata.

**Uscita:** una richiesta reale completata dal percorso Nexus e un'interruzione/ripresa; versione incompatibile e runtime assente gestiti. **Build utente:** login Codex e richiesta nella cartella scelta; risultato per OS registrato.

**Evidenze T05:** check completo, 65 test, build, smoke Electron sviluppo/pacchetto e confronto shell passati. Runtime ufficiale distribuito con l'app: handshake/account anonimo/catalogo/chiusura provati sia in sviluppo sia dal vendor impacchettato Windows x64. Nessuna credenziale di altre app usata, nessuna inferenza autenticata dichiarata. Installer 0.5.0 unsigned generato; nessuna nuova migrazione. Restano login personale/keyring, risposta, interruzione e ripresa del maintainer. macOS/Linux non provati nativamente; T06 non avviato.

**Feedback/correzione 0.5.1:** login personale confermato dal maintainer; segnalati recupero manuale al riavvio e Nexus auth indisponibile dopo chat con backend attivo. Corretti race/risultati obsoleti, accorpati check, ripristino Codex automatico e log Chalk server richiesti. Check, 73 test, build, smoke e 9 controlli auth reali passati; causa specifica dopo chat ancora da confermare nella nuova prova Windows con log. Stato/evidenze aggiornati in [status.md](status.md); T06 non avviato.

### T06 — Sessione AI e contesto, reference 2

**Stato:** [build Windows confermata dal maintainer — issue #6 chiusa](https://github.com/AndreaZero/nexus-ai/issues/6). **Ownership:** desktop, server e renderer integrati; coordinatore contratti/DB/IPC/route/QA/documenti. [Guida effettiva](session.md). Il feedback non è prova esaustiva di tutti i percorsi personali T04/T05/T06 o altre piattaforme.

**Dipendenze:** T05. **Ownership:** chat/composer; contesto/repository; backend cronologia. Contratti già stabiliti prima della divisione.

Collegare toolbar, stepper, stream messaggi, attività strumenti, piano esposto, contesto, file chip, task correlati e informazioni sessione. Collegare ogni comando del composer a una capacità reale; allegati locali sicuri e condivisione esplicita. Persistenza/ripresa della cronologia consentita.

**Uscita:** layout sinistra/destra fedele, richiesta e output reali, invio/interruzione/errori/riapertura senza perdita di bozza. L'ambiente non configurato resta unknown. **Build utente:** eseguire sessione reale e verificare chat, contesto e dimensioni pannelli.

**Evidenze T06:** check, 101 test, build, migrazione additiva 0002 e cinque scenari reali PostgreSQL/SMTP/HTTP per audience/concorrenza/revoca passati; account/progetti reali conservati e fixture rimossi. Shell e smoke sviluppo passati, pacchetto Windows 0.6.0 generato; picker autenticato/bozza/Share/inferenza attendono prova del maintainer. Niente dati simulati nel normale avvio, GitHub/deploy nei task T12/T13, readOnly fino a T07.

### T07 — Diff, output e approvazioni

**Stato:** [build Windows confermata dal maintainer — issue #7 chiusa](https://github.com/AndreaZero/nexus-ai/issues/7), con via esplicito a T08. **Dipendenze:** T06. **Ownership:** runtime, workspace locale e renderer integrati/rilasciati; coordinatore contratti, main/preload, integrazione e consegna. Schema provider 0.159.2 invariato; ownership dettagliate in `status.md`. Il feedback non certifica ogni percorso personale o altre piattaforme.

Completare Code Preview/Terminal/Tests/Preview, diff reale, output strumenti, report test riconosciuti e approvazioni del driver. Distinguere piano, esecuzione e deliverable. Approvals counter, Pause e Stop riflettono stato/capacità effettivi; apertura editor sicura per OS.

**Uscita:** modifica reale visualizzata nel diff, report/output corretti, richiesta approvabile una sola volta e rifiuto stale/non-driver. **Build utente:** consentire e negare un'operazione nella cartella dedicata, osservare file e output.

**Evidenze T07:** check e 124 test integrati passati; Git/filesystem reali, sandbox policy e scoping/replay/expiry/ruoli. Harness Electron UI/IPC con Git e TAP reali isolati, provider controllato: 10 controlli, nessuna inferenza o credenziale personale. Build/smoke/package e confronto visivo in [status.md](status.md). Nessuna nuova migrazione DB o dipendenza. Prova con il proprio Codex e build native macOS/Linux ancora distinte.

### T08 — Realtime, presenza e recupero

**Stato:** [build Windows confermata dal maintainer — issue #8 chiusa](https://github.com/AndreaZero/nexus-ai/issues/8), con via esplicito a T09. Fronti server, desktop e renderer integrati/rilasciati. Guida effettiva e limiti in [realtime.md](realtime.md); evidenze in [status.md](status.md). Il feedback non certifica ogni percorso personale o le altre piattaforme.

**Dipendenze:** T07; contratti di evento da T01/T04. **Ownership:** backend outbox/replay; desktop coda upload; renderer reducer/presenza.

Connettere due dispositivi/account al server ospitabile con upload selezionato, WebSocket autenticato, proiezioni per ruolo, heartbeat, cursore/idempotenza, snapshot coerente e revoca live. Separare connettività Nexus da lifecycle Codex. Stream batch con offset e ACK dopo persistenza; code limitate e niente replay di azioni eseguibili.

**Uscita:** due client mostrano stessa attività autorizzata; reconnect senza duplicazioni/perdita di dati accettati; membership revocata chiude accesso; evento interno non inviato al client. Test mirati a questi invarianti. **Build utente:** due finestre/account, disconnettere e riconnettere, cambiare ruolo.

### T09 — Overview operativa, reference 3

**Stato:** [build Windows0.9.1 confermata dal maintainer e429 assente — issue #9 chiusa](https://github.com/AndreaZero/nexus-ai/issues/9), con via esplicito a T10. Guida effettiva in [overview.md](overview.md), prove e limiti in [status.md](status.md). Il feedback non certifica ogni percorso personale o altri OS.

**Dipendenze:** T08. **Ownership:** renderer overview/feed; UI grafici/presence-map; backend proiezioni.

Completare Team Online, Active AI Session, Live Activity, Task Overview, System Activity, Project Health, Deploy Preview, Recent Changes e Notifications con dati disponibili e stati vuoti/unknown per integrazioni future. Filtri, link e selezione sessione reali. Metriche locali opt-in con fonte e tempo; nessuna simulazione di health verde.

**Uscita:** griglia e densità reference 3 rispettate, aggiornamenti reali, lettura feed senza auto-scroll invasivo. **Build utente:** seguire una sessione da secondo client e navigare dagli eventi ai dettagli.

### T10 — Client & Team Pulse, reference 1

**Stato:** [build Windows T10 confermata dal maintainer — issue #10 chiusa](https://github.com/AndreaZero/nexus-ai/issues/10), con via esplicito a T11. Fonti/prova in [pulse.md](pulse.md), evidenze in [status.md](status.md); gli altri OS restano distinti.

**Dipendenze:** T09. **Ownership:** hero/effetti; renderer pulse/card; backend proiezioni audience.

Completare composizione, wave/particelle e nodi, milestone, summary, active sessions, working now, outcomes, deliverable, preview, feedback, disponibilità e rail attività. Dati già presenti collegati; workflow di scrittura esteso in T11. Proiezione cliente senza dettagli interni non pubblicati. Vista team completa e vista client con contenuto consentito.

**Uscita:** reference 1 riconoscibile in tutti i blocchi, movimento ridotto completo, nessuna fuga di contenuti via snapshot/eventi/tooltip. **Build utente:** confrontare vista developer e client con la stessa sessione.

### T11 — Task, roadmap, documenti e consegne cliente

**Stato:** [build Windows T11 confermata dal maintainer — issue #11 chiusa](https://github.com/AndreaZero/nexus-ai/issues/11). Fronti e prove in [work.md](work.md), evidenze in [status.md](status.md); via esplicito a T12.

**Dipendenze:** T10. **Ownership:** task/roadmap; documenti/outcomes; backend deliverable/feedback. Root schema e migrazioni serializzati.

Completare CRUD task/milestone, assegnazioni e commenti, board estesa, progressi da scope definito e link sessioni. Documenti progetto e outcome con provenienza; aggiornamenti pubblicati con anteprima/audience, allegati scaricabili, versioni deliverable, feedback e approvazioni cliente. Alimentare completamente le viste T09–T10 senza flussi interrotti.

**Uscita:** task → sessione → risultato → aggiornamento → deliverable → feedback/approvazione attraversabile con ruoli corretti. **Build utente:** completare questo percorso con account sviluppatore e cliente.

### T12 — Git, GitHub e repository

**Stato:** [implementato e consegnato, in attesa di verifica utente — issue #12](https://github.com/AndreaZero/nexus-ai/issues/12). Guida/configurazione in [repositories.md](repositories.md), prove distinte in [status.md](status.md).

**Dipendenze:** T11; basi Git locali da T05–T07. **Ownership:** desktop Git; server integrazione GitHub; renderer code/repos.

Completare branch/stato/commit con operazioni esplicite, link GitHub, autenticazione/integration scopes minimi, PR/review e webhook verificati/idempotenti. Repo e cronologia del progetto reale; gestire dirty tree/conflitti senza sovrascritture. Nessun push o merge automatico dedotto da un'approvazione cliente.

**Uscita:** commit reale e attività GitHub coerente con progetto, webhook non valido negato, segreti non condivisi. **Build utente:** collegare un repository autorizzato, fare una modifica e controllare diff/attività/link.

### T13 — Ambienti, deploy e health

**Stato:** integrato/consegnato0.13.0, in attesa di verifica manuale. Migrazione0007 applicata (8totali), test mirati8server+8probe+8web,6scenari PG/HTTP,13controlli UI e smoke Windows passati; [evidenze](status.md) e [workflow](deployments.md). Nessun installer intermedio o deploy remoto; package finale T16. Il mandato del maintainer autorizza T14–T16 in sequenza senza attesa intermedia; accettazione nativa e personale resta distinta.

**Dipendenze:** T12. **Ownership:** backend adapter/stato; renderer deploy/preview; desktop probe locali.

Gestire ambienti e build con provider configurabile o registrazione esplicita, URL reali, thumbnail e apertura isolata. Probe di ambiente opt-in; build/test/coverage/performance/security con fonte, ultima osservazione e stato unknown/stale. Health aggregata solo con regola dichiarata e dettaglio delle componenti. Nessun deploy di infrastruttura esterna senza la relativa configurazione del maintainer.

**Uscita:** deploy registrato visibile da entrambe le viste, preview sicura, probe scaduto smette di apparire operativo. **Build utente:** collegare staging reale o registrare una build effettiva e controllare gli stati.

### T14 — Ricerca, notifiche e impostazioni complete

**Stato:** integrata e consegnata, in attesa di verifica manuale — [issue14](https://github.com/AndreaZero/nexus-ai/issues/14). Ricerca/profile/preferences e connessione self-host effettivi; guida application.md. Mandato continuo fino aT16, verifica manuale distinta.

**Dipendenze:** T13. **Ownership:** backend ricerca/notifiche; renderer settings/search; desktop preferenze.

Ricerca autorizzata fra progetti accessibili, messaggi, task e documenti; shortcut piattaforma, centro notifiche e mark read persistente. Profilo, preferenze, sharing, endpoint self-host, account/runtime e reduced motion. Completare tutte le rotte della sidebar e tutti i tab, rimuovendo qualsiasi affordance rimasta senza risultato.

**Uscita:** nessuna destinazione morta; ricerca/contatori coerenti coi ruoli; preferenze conservate al riavvio. **Build utente:** usare tastiera, cercare contenuti interni/cliente e verificare scope e stato letto.

### T15 — Accettazione visiva e percorsi di recupero

**Stato:** integrata e consegnata, in attesa di verifica manuale — [issue15](https://github.com/AndreaZero/nexus-ai/issues/15). Confronto in design/t15-review.md e matrice in acceptance.md. Accettazione personale distinta; prosecuzione T16 autorizzata.

**Dipendenze:** T14. **Ownership:** coordinatore integra feedback; fronti UI/accessibilità e runtime/recovery su percorsi separati.

Confrontare tutte le PNG sul viewport originale, correggere differenze di layout/tipo/luce/asset e verificare animazioni dal vivo. Provare tre ruoli, titoli lunghi, vuoti, offline, auth scaduta, crash e ripresa; viewport ridotto e tastiera. Coprire solo rischi non già verificati o toccati dalle correzioni, senza ripetere suite per abitudine.

**Uscita:** differenze materiali risolte o esplicitamente registrate col maintainer; nessun percorso principale interrotto; prove precedenti ancora valide dove non toccate. **Build utente:** accettazione delle tre viste e percorsi principali con dati veri.

### T16 — Distribuzione, self-host e completamento

**Stato:** integrata e consegnata, versione0.16.0; in attesa di verifica manuale — [issue16](https://github.com/AndreaZero/nexus-ai/issues/16). Check/test/build e installer nativi dei tre OS passati in CI; package/smoke Windows e sei scenari Docker reali passati. È l’ultima task del piano: sviluppo fermo come richiesto. Evidenze e accettazione distinte in [status.md](status.md).

**Dipendenze:** T15. **Ownership:** coordinatore release/docs; backend deploy/migrazioni; desktop packaging OS.

Rendere setup self-host riproducibile, environment template senza segreti, migrazioni/backups/restore e upgrade documentati. Packaging finale, icone OS e versioni; GitHub Actions per controlli pertinenti e build native, firma/notarizzazione quando le credenziali sono disponibili. Preparare release/changelog e istruzioni per utenti e sviluppatori.

**Uscita:** matrice build esplicita Windows/macOS/Linux, documentazione installazione/upgrade verificata, requisiti R01–R16 con evidenza e nessuna feature principale ancora mancante. Una piattaforma non provata resta da verificare e impedisce di dichiarare accettazione completa di R01. Il maintainer esegue la build Mac dal proprio Mac quando disponibile. Non confondere build di sviluppo, package unsigned e release firmata.

### T17 — Onboarding guidato fino alla prima sessione

**Stato:** integrata e consegnata 0.17.0, in attesa di verifica manuale — [issue17](https://github.com/AndreaZero/nexus-ai/issues/17). Check/build e suite337pass/1skip,12controlliUI e6scenariPG/HTTP, package/smoke Windows passati; risultati CI e limiti in status.md. Nuova autorizzazione esplicita dopo build Windows 0.16.0 confermata. **Dipendenze:** T16. Ownership/contratti in status.md.

Guida riprendibile account Nexus → workspace → progetto → cartella locale → Codex/sandbox → prima sessione. Prerequisiti reali, dialog e servizi riusati, skip e riapertura da Overview/Settings, ramo cliente/browser e inviti. Conservare bozza/sessione, ruolo e confini locali; nessuna inferenza automatica o dato demo nel prodotto. Reference1/2/3 guidano token, card, glow, stepper e movimento ridotto; nessuna PNG dedicata a questo nuovo flusso.

**Uscita:** primo utente percorre il setup e raggiunge il composer pronto; prima risposta completa osservata conclude la guida. Stato account/progetto/cartella modificato invalida i prerequisiti; rimando e ripresa sopravvivono al reload, inviti e ruoli mantengono il proprio percorso. Test mirati e catture Electron dichiarate; maintainer verifica login e prima richiesta personale.

### T18 — Polish mirato di layout e controlli

**Stato:** integrata e consegnata 0.17.1, in attesa di verifica manuale — [issue18](https://github.com/AndreaZero/nexus-ai/issues/18). Verifica visuale30combinazioni più ricontrollo2dashboard, package/smoke Windows e CI sorgente dei tre OS passati. **Dipendenze:** T17; evidenze e ownership in status.md.

Correggere componenti tagliati e azioni poco raggiungibili senza ridisegnare la shell. Layout flessibili per testi lunghi, header e toolbar, navigazione laterale nelle finestre basse, dialoghi e moduli. Conservare palette, card, pianeta, particelle e composizione delle reference. Nessuna modifica ai servizi di dominio o ai confini runtime/server.

**Uscita:** dieci pagine principali senza overflow orizzontale del documento a 1586×992, 1280×720 e 960×640; azioni principali raggiungibili tramite vero scorrimento, tastiera e dialoghi. Verifiche automatiche e prova manuale restano distinte. Fermarsi alla consegna.

## Definizione di completamento per ogni task

Il comportamento previsto è implementato e integrato nel flusso reale; i controlli pertinenti eseguiti hanno un risultato registrato; documentazione/stato/changelog sono aggiornati; le istruzioni per la build sono concrete e i limiti sono dichiarati. `implementato`, `controllato automaticamente`, `build provata dall'utente` e `accettato` sono evidenze distinte.

Se la build manuale non è ancora arrivata, il task può essere **consegnato, in attesa di verifica utente**. Non dichiararlo accettato. Un problema esterno blocca solo i fronti dipendenti: documentarlo e continuare il lavoro autorizzato indipendente del task, senza cambiare obiettivo o avviare automaticamente la tranche successiva.
