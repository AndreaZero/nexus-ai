# Sessione AI, contesto e workspace codice — T06/T07

La stessa app segue la reference `examples/design/2.png`. File, diff, output e cronologia Codex rimangono locali; la cronologia sul server contiene soltanto gli estratti selezionati e confermati con **Share**. T06 introduce contesto e cronologia, T07 aggiunge workspace codice e approvazioni locali.

## Workspace codice e controllo locale T07

La policy iniziale resta **Read only**. Il driver locale owner/developer può scegliere **Workspace write** per il binding corrente, a turno fermo, spuntare il consenso e confermare **Enable workspace writes**: autorizza le operazioni consentite dalla sandbox nella cartella collegata. Non ogni scrittura genera un prompt: il runtime decide quando chiedere un'escalation. La rete nella sandbox resta disabilitata e le directory temporanee generali non vengono aggiunte alle root scrivibili. Cambio account, cartella o arresto del runtime azzera il consenso locale; non esiste modalità full access.

**Approvals** mostra le richieste attualmente pendenti. Ogni scheda espone comando o modifica, directory, motivo e scadenza: **Allow once** e **Decline** valgono per quella callback. L'approvazione di un comando può autorizzare l'esecuzione oltre i normali limiti della sandbox; revisionare il comando completo. Nessuna autorizzazione permanente, regola automatica o approvazione cliente abilita esecuzioni. Le richieste con grantRoot per l'intera sessione, contesto rete gestita, ambiente remoto, input a terminale preesistente o protocollo legacy sono negate perché non corrispondono al consenso singolo supportato.

Fino a 20 richieste pendenti, con scadenza entro 110 secondi e diniego alla scadenza. Il main riautorizza ruolo e binding prima di rispondere, lega il consenso ad account/processo/thread/turno/item e consuma l'ID prima dell'I/O. Replay, vecchio turno, revoca o cambio cartella non possono riutilizzarlo. Una modifica richiede patch concreta disponibile e non troncata prima di poterla consentire; il solo motivo generico non basta. Nessuna richiesta viene salvata o riprodotta dopo un riavvio. **Pause** interrompe il turno; la prosecuzione richiede un nuovo messaggio. **Stop** arresta il runtime locale, preservando il login nel keyring finché non si sceglie logout Codex.

**Code Preview** mostra modifiche locali osservate rispetto a HEAD: staged, unstaged e nuovi file non ignorati. Sono osservazioni dell'intero working tree, comprese modifiche manuali; la provenienza è distinta dal diff riportato dal runtime per il turno. Il binding deve essere la root del repository Git; un binding annidato non può esporre la cartella superiore. Repository senza commit gestito come base vuota. Nessun fetch, commit, push o comando modificante Git.

Il servizio legge oggetti Git e file testuali direttamente: non esegue filtri clean/smudge, hook, external diff o textconv del repository. Esclude segreti riconoscibili dal nome, binari, symlink e submodule. Limiti: 50 file, 64 KiB per sorgente/diff e 256 KiB complessivi di diff; scansione fino a 10.000 nomi/16 MiB, overflow segnalato. I filtri non garantiscono che un normale sorgente sia privo di segreti. Confronta il testo letterale: conversioni EOL/filtri Git non vengono applicati, rinominati rappresentati come add/delete e modifiche dei soli permessi non mostrate. Split/unified sono viste dello stesso diff, con numeri linea e conteggi reali. L'aggiornamento avviene a fine turno e su **Refresh**; non è un monitor filesystem continuo.

**Terminal / Output** espone lo stream osservato, exit code e durata quando forniti. Un comando con exit code diverso da zero è fallito anche se il trasporto si conclude. **Tests** accetta report completi riconosciuti TAP o JSON Jest: conteggi con fonte e timestamp, senza dedurre test/coverage dall'exit code o inventare percentuali. Output troppo grande è troncato e non viene interpretato come report completo. Gli output sono testo, senza HTML eseguibile o sequenze terminale attive.

**Open in VS Code** passa al sistema soltanto una URI `vscode://file/` costruita dal main per la root o un file esistente identificato da UUID del diff. Richiede VS Code e il suo protocollo registrato; nessun argv/shell/path arbitrario dal renderer. Si usa il [formato ufficiale VS Code](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls). **Preview** richiede un URL configurato esplicitamente, HTTPS oppure HTTP loopback. Si apre nel browser di sistema, senza incorporare pagine con privilegi Nexus, eseguire probe o avviare server/deploy. La configurazione T07 è locale in memoria e si azzera al riavvio/cambio account; configurazioni ambienti/deploy persistenti restano T13.

Diff, file, output, report e approvazioni non vengono aggiunti automaticamente a **Share**. L'interfaccia del browser o di un membro client/viewer non controlla il runtime del driver.

## Contesto locale

Con account Nexus verificato e ruolo owner/developer, collegare in Repos una cartella locale al repository. AI Session mostra branch, HEAD, modifiche e divergenza dall'upstream quando osservabili tramite Git locale. Senza Git/upstream/commit il dato resta unknown. Nessun fetch, autenticazione GitHub, push, hook o fsmonitor; ahead/behind usa i riferimenti locali, con timestamp della lettura.

**Add files** e l'allegato del composer aprono il selettore nativo. Fino a 8 file UTF-8, 64 KiB ciascuno e 256 KiB complessivi, soltanto dentro la root autorizzata. Path arbitrari dal renderer, env/credenziali/chiavi, directory sensibili/dipendenze, binari e symlink esterni vengono rifiutati. I filtri non garantiscono che un normale sorgente sia privo di segreti: selezionare il contesto con attenzione.

I file diventano chip e righe nella card Attached Files. Aprire una riga mostra l'anteprima testuale in Code Preview; rimuoverla esclude il file dal prossimo invio. Il main rilegge e ricontrolla i file prima di allegare il testo al turno Codex ufficiale. Il contenuto va al proprio servizio Codex quando si invia; non al server Nexus. Le copie allegate dal main non diventano messaggi utente aggiuntivi e non vengono condivise automaticamente.

Selezione e bozza sono cifrate tramite storage OS in `userData/session-context.bin`, per account/progetto/repository/cwd canonico. Nessuna copia persistente del contenuto dei file nella bozza. Cambio cartella non riutilizza la selezione precedente; cambio account invalida le operazioni pendenti. Ogni operazione verifica i permessi correnti, senza cache temporale delle autorizzazioni.

Autosalvataggio dopo 1,5 secondi senza modifiche e flush al cambio focus/uscita pagina se ancora autorizzato. Il composer mostra Saving/Saved/Not saved: per provare il riavvio attendere **Draft saved locally** prima di chiudere. Un arresto forzato durante una scrittura non conferma il salvataggio. Navigazione tra viste conserva la bozza; invio riuscito cancella solo la bozza ancora uguale al testo inviato, errore la conserva.

## Piano e metriche

Piano e passi completati derivano da `turn/plan/updated`; non misurano la durata o il progresso dell'intero progetto. Le attività mostrano eventi osservabili, senza ragionamento privato. Token input/output/cache, totale e finestra contesto arrivano da `thread/tokenUsage/updated` quando disponibili nella 0.159.2. Nessun evento significa unknown. Il tempo decorre dall'avvio locale osservato del turno; la ripresa senza timestamp non inventa durata storica. Overview usa gli stessi dati; test/coverage/health/deploy restano nei rispettivi task.

## Share e cronologia

**Share** apre titolo, audience e selezione dei messaggi: nessuno preselezionato. Massimo 20 messaggi completati, 32 Ki caratteri ciascuno e 128 Ki complessivi. **Review selected messages** congela e mostra il testo; soltanto **Confirm and publish** lo carica.

- Team: owner/developer del progetto.
- Client: anche client/viewer attualmente assegnati.
- Controllare il testo selezionato per percorsi, codice o informazioni private. Allegati, tool grezzi, credenziali AI e path di configurazione non vengono aggiunti al payload.

Session Info elenca e apre gli estratti autorizzati da desktop/browser. È cronologia persistita, non stream live o trasferimento del controllo Codex. Retry usano ID stabile/versione attesa; autore, driver, dispositivo, membership e audience sono verificati dal backend. Nessun thread provider o token Codex nel DB condiviso. Il server può leggere gli estratti: nessuna promessa di cifratura end-to-end.

Tasks legge i task esistenti del progetto secondo audience. CRUD e collegamenti operativi sono T11: nessun task d'esempio creato. **Publish Update** è l'aggiornamento/deliverable T11, distinto da Share.

## Contratti e persistenza

Migrazione additiva `0002_session_snapshots.sql`: `ai_session.version` e `messages`, con vincoli. Nessuna rimozione di dati o migrazione all'avvio. `POST /api/sessions` accetta list/read/listProjectTasks/publish, JSON limitato e Origin esatto. `DesktopBridge.context.request` e `sessions.request` hanno schemi in `packages/contracts/src/{context,sessions,codex}.ts`. Pubblicazione e audit senza contenuto sono atomici; lock workspace→progetto→sessione e versioni gestiscono revoca/conflitti. Log Chalk senza testo dell'estratto.

## Build e prova del maintainer

Chiudere app/backend precedenti:

```powershell
pnpm install --frozen-lockfile
pnpm package:win
```

Avviare `pnpm start:server` e `pnpm start:desktop` in terminali distinti, oppure l'app aggiornata. PostgreSQL esistente è sufficiente, nessun nuovo DB/secret. Mailpit resta per le email Nexus.

T07 non aggiunge migrazioni: 0002 deve essere già applicata da T06. Per aggiornamenti diretti da versioni precedenti eseguire `pnpm db:migrate` una volta. Su Windows x64 l'installer è `release/win/Nexus-AI-0.7.0-win-x64.exe`; macOS/Linux richiedono la build sul proprio OS.

Prova T07 con una cartella Git dedicata senza dati sensibili, collegata a un proprio progetto:

1. Aprire una sessione, scegliere **Workspace write**, spuntare e confermare **Enable workspace writes**. Chiedere a Codex di creare un file di testo di prova nella cartella. Il file deve esistere sul disco e comparire nel diff locale dopo il turno; alternare split/unified e aprirlo in VS Code.
2. Chiedere l'esecuzione di un comando innocuo che richieda approvazione esplicita. Confrontare il comando nel dialogo, negarlo e controllare che resti bloccato; ripetere e consentire una volta. I prompt dipendono dal runtime: un'operazione già ammessa dalla sandbox non richiede consenso aggiuntivo.
3. Lasciare scadere una richiesta o interrompere il turno: il vecchio pulsante non deve poterla approvare. Con ruolo client/viewer e da browser non deve essere disponibile alcuna decisione locale.
4. Chiedere il test reale del repository con output TAP o JSON Jest, se disponibile. Controllare stream, exit code e report; un comando senza report deve lasciare test sconosciuti. Nessun conteggio coverage presunto.
5. Configurare in Preview il proprio URL locale, per esempio `http://127.0.0.1:5173`, e aprirlo: il servizio deve essere già avviato. Verificare rifiuto di schemi come `file:` o `javascript:`.

Restano disponibili le verifiche T06:

1. Collegare progetto/cartella, aggiungere README o un sorgente piccolo e controllare chip, preview, branch e rimozione. Env o file esterno devono essere rifiutati.
2. Scrivere una bozza, attendere Saved, navigare/riaprire: deve rimanere nel proprio progetto, distinta dal secondo progetto/account.
3. Inviare una domanda sui file con il proprio Codex. Piano/token solo se forniti; controllare errore senza perdita della bozza e interruzione/ripresa.
4. Share → selezione → preview/audience → conferma. Riaprire l'estratto da Session Info; il client vede solo quelli client, l'estraneo nessuno.

`pnpm verify:sessions` prova PostgreSQL/SMTP/HTTP con tre account temporanei: audience, retry/conflitti, revoca e pulizia fixture, senza inferenza. Solo DB dedicato e Mailpit loopback. Evidenze in [status.md](status.md).

`pnpm verify:workspace` richiede il build e verifica in Electron il renderer/preload effettivi: diff da Git e TAP Node su cartella temporanea isolata, navigazione dei tab, consenso alla policy, diniego/allow once tramite IPC. Il trasporto provider e l'account sono fixture controllati, le aperture OS intercettate: non prova inferenza personale o l'installazione dell'editor/browser. Scrive catture e rapporto in `.nexus/visual/t07/`, poi elimina la propria cartella QA; non usa PostgreSQL, il profilo del maintainer o credenziali di altre app.
