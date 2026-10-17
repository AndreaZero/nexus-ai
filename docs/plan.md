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

**Stato:** [implementato, in attesa di verifica utente — issue #1](https://github.com/AndreaZero/nexus-ai/issues/1). **Dipendenze:** T00 e via ricevuto il 17 ottobre 2026. **Owner:** coordinatore/integratore, con tre fronti desktop/server/renderer integrati.

Creare `apps/desktop`, `apps/web`, `apps/server`, `packages/contracts`, `packages/ui`, `packages/codex-bridge`, `packages/db`; fissare versioni stabili, workspace e lockfile, TS strict, entrypoint reali e comandi dev/build/check/package. Rendere il renderer comune caricabile in Electron isolato e web. Predisporre packaging Windows/macOS/Linux e app ID stabile. Creare solo i contratti necessari alla struttura e i confini IPC, senza generare pagine dimostrative.

Fronti possibili dopo i contratti: desktop/build; backend/bootstrap; renderer/bootstrap. Il coordinatore resta autore esclusivo di manifest root, lockfile, TS condiviso e contratti.

**Uscita:** installazione riproducibile e compilazione della base sul sistema disponibile; configurazioni native per tutti gli OS; istruzioni esatte per l'utente. Verifica mirata dei confini renderer/main. **Build utente:** Windows qui; macOS differita al Mac; Linux indicata separatamente. Non dichiarare packaging verificato dove non eseguito.

**Evidenza T01:** `pnpm check`, 16 test mirati, `pnpm build`, smoke Electron produzione e Vite, liveness HTTP reale, `pnpm package:win` e smoke dell'eseguibile impacchettato passati su Windows x64. Installer unsigned, nessuna installazione automatica. Le configurazioni macOS/Linux e la CI sono presenti; esiti nativi/accettazione utente restano da registrare. Comandi e prova manuale in `CONTRIBUTING.md`.

### T02 — Sistema visivo e shell definitiva

**Dipendenze:** T01. **Ownership:** UI per token/primitive/effetti, renderer per frame/rotte; integrazione centrale.

Trasferire token CSS, font e licenze; costruire logo, sidebar con pianeta/orbite, header, ricerca e tab, card, badge, avatar, pulsanti, progressi e donut. Impostare layout distinti delle tre viste e rotte future con stati vuoti reali. Effetti ambientali e reduced motion fanno parte del task, non di un generico polish futuro. Le feature ancora assenti non espongono pulsanti finti.

**Uscita:** frame riconoscibile e proporzioni delle PNG a 1586 × 992, focus/tastiera e finestra ridotta utilizzabili. Controllo visuale una volta su frame e componenti, correggendo differenze materiali. **Build utente:** verificare shell, sidebar, resize, movimento normale/ridotto.

### T03 — Identità Nexus e accesso

**Dipendenze:** T01–T02. **Ownership:** backend auth/dati, renderer onboarding, desktop integrazione browser; schema auth con un autore.

Implementare account Nexus, email verificata, sessioni, logout/revoca e reset tramite libreria mantenuta; flusso desktop nel browser di sistema e ritorno validato. Distinguere chiaramente login Nexus e collegamento Codex. Configurazione email reale/self-host e errori recuperabili; nessun segreto nel renderer.

**Uscita:** registrazione/login/logout, reset e sessione persistente funzionanti; rifiuto sessioni scadute e callback invalide. Test mirati auth e confini IPC. **Build utente:** accedere, riaprire e uscire; prerequisiti email documentati.

### T04 — Workspace, progetti, membri e inviti

**Dipendenze:** T03. **Ownership:** backend membership/schema; renderer progetti/team; coordinatore contratti/migrazioni.

Creare workspace/progetto, associare repository/binding locale come record distinto, selezione progetto, ruoli owner/developer/client/viewer e policy private/team/client. Inviti monouso con scadenza, accettazione e revoca. Creare basi dati per task/milestone e sessioni senza inventare contenuti.

**Uscita:** due account invitati vedono solo progetti consentiti; terzo estraneo negato su API e allegati; riduzione ruolo efficace. **Build utente:** creare progetto, invitare e accettare con secondo account.

### T05 — Runtime locale Codex e account personale

**Dipendenze:** T04. **Ownership:** bridge app-server; desktop supervisore/credenziali; renderer impostazioni account.

Adottare runtime ufficiale/versione, schema generato, home dedicata e supervisore multipiattaforma. Implementare login personale, stato account, modelli, logout e API key opzionale esplicita. Thread/turni/stream/interruzione funzionano sul filesystem scelto; errori runtime/account/quota sono gestiti. Questa integrazione è codice dell'app, senza un'app di prova separata.

**Uscita:** una richiesta reale completata dal percorso Nexus e un'interruzione/ripresa; versione incompatibile e runtime assente gestiti. **Build utente:** login Codex e richiesta nella cartella scelta; risultato per OS registrato.

### T06 — Sessione AI e contesto, reference 2

**Dipendenze:** T05. **Ownership:** chat/composer; contesto/repository; backend cronologia. Contratti già stabiliti prima della divisione.

Collegare toolbar, stepper, stream messaggi, attività strumenti, piano esposto, contesto, file chip, task correlati e informazioni sessione. Collegare ogni comando del composer a una capacità reale; allegati locali sicuri e condivisione esplicita. Persistenza/ripresa della cronologia consentita.

**Uscita:** layout sinistra/destra fedele, richiesta e output reali, invio/interruzione/errori/riapertura senza perdita di bozza. L'ambiente non configurato resta unknown. **Build utente:** eseguire sessione reale e verificare chat, contesto e dimensioni pannelli.

### T07 — Diff, output e approvazioni

**Dipendenze:** T06. **Ownership:** code workspace; policy/approvals locali; mapping provider. Un autore per bridge e generated schema.

Completare Code Preview/Terminal/Tests/Preview, diff reale, output strumenti, report test riconosciuti e approvazioni del driver. Distinguere piano, esecuzione e deliverable. Approvals counter, Pause e Stop riflettono stato/capacità effettivi; apertura editor sicura per OS.

**Uscita:** modifica reale visualizzata nel diff, report/output corretti, richiesta approvabile una sola volta e rifiuto stale/non-driver. **Build utente:** consentire e negare un'operazione nella cartella dedicata, osservare file e output.

### T08 — Realtime, presenza e recupero

**Dipendenze:** T07; contratti di evento da T01/T04. **Ownership:** backend outbox/replay; desktop coda upload; renderer reducer/presenza.

Connettere due dispositivi/account al server ospitabile con upload selezionato, WebSocket autenticato, proiezioni per ruolo, heartbeat, cursore/idempotenza, snapshot coerente e revoca live. Separare connettività Nexus da lifecycle Codex. Stream batch con offset e ACK dopo persistenza; code limitate e niente replay di azioni eseguibili.

**Uscita:** due client mostrano stessa attività autorizzata; reconnect senza duplicazioni/perdita di dati accettati; membership revocata chiude accesso; evento interno non inviato al client. Test mirati a questi invarianti. **Build utente:** due finestre/account, disconnettere e riconnettere, cambiare ruolo.

### T09 — Overview operativa, reference 3

**Dipendenze:** T08. **Ownership:** renderer overview/feed; UI grafici/presence-map; backend proiezioni.

Completare Team Online, Active AI Session, Live Activity, Task Overview, System Activity, Project Health, Deploy Preview, Recent Changes e Notifications con dati disponibili e stati vuoti/unknown per integrazioni future. Filtri, link e selezione sessione reali. Metriche locali opt-in con fonte e tempo; nessuna simulazione di health verde.

**Uscita:** griglia e densità reference 3 rispettate, aggiornamenti reali, lettura feed senza auto-scroll invasivo. **Build utente:** seguire una sessione da secondo client e navigare dagli eventi ai dettagli.

### T10 — Client & Team Pulse, reference 1

**Dipendenze:** T09. **Ownership:** hero/effetti; renderer pulse/card; backend proiezioni audience.

Completare composizione, wave/particelle e nodi, milestone, summary, active sessions, working now, outcomes, deliverable, preview, feedback, disponibilità e rail attività. Dati già presenti collegati; workflow di scrittura esteso in T11. Proiezione cliente senza dettagli interni non pubblicati. Vista team completa e vista client con contenuto consentito.

**Uscita:** reference 1 riconoscibile in tutti i blocchi, movimento ridotto completo, nessuna fuga di contenuti via snapshot/eventi/tooltip. **Build utente:** confrontare vista developer e client con la stessa sessione.

### T11 — Task, roadmap, documenti e consegne cliente

**Dipendenze:** T10. **Ownership:** task/roadmap; documenti/outcomes; backend deliverable/feedback. Root schema e migrazioni serializzati.

Completare CRUD task/milestone, assegnazioni e commenti, board estesa, progressi da scope definito e link sessioni. Documenti progetto e outcome con provenienza; aggiornamenti pubblicati con anteprima/audience, allegati scaricabili, versioni deliverable, feedback e approvazioni cliente. Alimentare completamente le viste T09–T10 senza flussi interrotti.

**Uscita:** task → sessione → risultato → aggiornamento → deliverable → feedback/approvazione attraversabile con ruoli corretti. **Build utente:** completare questo percorso con account sviluppatore e cliente.

### T12 — Git, GitHub e repository

**Dipendenze:** T11; basi Git locali da T05–T07. **Ownership:** desktop Git; server integrazione GitHub; renderer code/repos.

Completare branch/stato/commit con operazioni esplicite, link GitHub, autenticazione/integration scopes minimi, PR/review e webhook verificati/idempotenti. Repo e cronologia del progetto reale; gestire dirty tree/conflitti senza sovrascritture. Nessun push o merge automatico dedotto da un'approvazione cliente.

**Uscita:** commit reale e attività GitHub coerente con progetto, webhook non valido negato, segreti non condivisi. **Build utente:** collegare un repository autorizzato, fare una modifica e controllare diff/attività/link.

### T13 — Ambienti, deploy e health

**Dipendenze:** T12. **Ownership:** backend adapter/stato; renderer deploy/preview; desktop probe locali.

Gestire ambienti e build con provider configurabile o registrazione esplicita, URL reali, thumbnail e apertura isolata. Probe di ambiente opt-in; build/test/coverage/performance/security con fonte, ultima osservazione e stato unknown/stale. Health aggregata solo con regola dichiarata e dettaglio delle componenti. Nessun deploy di infrastruttura esterna senza la relativa configurazione del maintainer.

**Uscita:** deploy registrato visibile da entrambe le viste, preview sicura, probe scaduto smette di apparire operativo. **Build utente:** collegare staging reale o registrare una build effettiva e controllare gli stati.

### T14 — Ricerca, notifiche e impostazioni complete

**Dipendenze:** T13. **Ownership:** backend ricerca/notifiche; renderer settings/search; desktop preferenze.

Ricerca autorizzata fra progetti accessibili, messaggi, task e documenti; shortcut piattaforma, centro notifiche e mark read persistente. Profilo, preferenze, sharing, endpoint self-host, account/runtime e reduced motion. Completare tutte le rotte della sidebar e tutti i tab, rimuovendo qualsiasi affordance rimasta senza risultato.

**Uscita:** nessuna destinazione morta; ricerca/contatori coerenti coi ruoli; preferenze conservate al riavvio. **Build utente:** usare tastiera, cercare contenuti interni/cliente e verificare scope e stato letto.

### T15 — Accettazione visiva e percorsi di recupero

**Dipendenze:** T14. **Ownership:** coordinatore integra feedback; fronti UI/accessibilità e runtime/recovery su percorsi separati.

Confrontare tutte le PNG sul viewport originale, correggere differenze di layout/tipo/luce/asset e verificare animazioni dal vivo. Provare tre ruoli, titoli lunghi, vuoti, offline, auth scaduta, crash e ripresa; viewport ridotto e tastiera. Coprire solo rischi non già verificati o toccati dalle correzioni, senza ripetere suite per abitudine.

**Uscita:** differenze materiali risolte o esplicitamente registrate col maintainer; nessun percorso principale interrotto; prove precedenti ancora valide dove non toccate. **Build utente:** accettazione delle tre viste e percorsi principali con dati veri.

### T16 — Distribuzione, self-host e completamento

**Dipendenze:** T15. **Ownership:** coordinatore release/docs; backend deploy/migrazioni; desktop packaging OS.

Rendere setup self-host riproducibile, environment template senza segreti, migrazioni/backups/restore e upgrade documentati. Packaging finale, icone OS e versioni; GitHub Actions per controlli pertinenti e build native, firma/notarizzazione quando le credenziali sono disponibili. Preparare release/changelog e istruzioni per utenti e sviluppatori.

**Uscita:** matrice build esplicita Windows/macOS/Linux, documentazione installazione/upgrade verificata, requisiti R01–R16 con evidenza e nessuna feature principale ancora mancante. Una piattaforma non provata resta da verificare e impedisce di dichiarare accettazione completa di R01. Il maintainer esegue la build Mac dal proprio Mac quando disponibile. Non confondere build di sviluppo, package unsigned e release firmata.

## Definizione di completamento per ogni task

Il comportamento previsto è implementato e integrato nel flusso reale; i controlli pertinenti eseguiti hanno un risultato registrato; documentazione/stato/changelog sono aggiornati; le istruzioni per la build sono concrete e i limiti sono dichiarati. `implementato`, `controllato automaticamente`, `build provata dall'utente` e `accettato` sono evidenze distinte.

Se la build manuale non è ancora arrivata, il task può essere **consegnato, in attesa di verifica utente**. Non dichiararlo accettato. Un problema esterno blocca solo i fronti dipendenti: documentarlo e continuare il lavoro autorizzato indipendente del task, senza cambiare obiettivo o avviare automaticamente la tranche successiva.
