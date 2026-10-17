# Sessione AI e contesto — T06

T06 estende la stessa app e la reference `examples/design/2.png`. File e cronologia Codex rimangono locali; la cronologia sul server contiene soltanto gli estratti selezionati e confermati con **Share**. Policy readOnly: scritture e approvazioni interattive sono T07.

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
pnpm db:migrate
pnpm package:win
```

Avviare `pnpm start:server` e `pnpm start:desktop` in terminali distinti, oppure l'app aggiornata. PostgreSQL esistente è sufficiente, nessun nuovo DB/secret. Mailpit resta per le email Nexus.

1. Collegare progetto/cartella, aggiungere README o un sorgente piccolo e controllare chip, preview, branch e rimozione. Env o file esterno devono essere rifiutati.
2. Scrivere una bozza, attendere Saved, navigare/riaprire: deve rimanere nel proprio progetto, distinta dal secondo progetto/account.
3. Inviare una domanda sui file con il proprio Codex. Piano/token solo se forniti; controllare errore senza perdita della bozza e interruzione/ripresa.
4. Share → selezione → preview/audience → conferma. Riaprire l'estratto da Session Info; il client vede solo quelli client, l'estraneo nessuno.

`pnpm verify:sessions` prova PostgreSQL/SMTP/HTTP con tre account temporanei: audience, retry/conflitti, revoca e pulizia fixture, senza inferenza. Solo DB dedicato e Mailpit loopback. Evidenze in [status.md](status.md).
