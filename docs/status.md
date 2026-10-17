# Stato operativo

Aggiornato: **17 ottobre 2026**. **T08 consegnato, in attesa di verifica utente** su via esplicito del maintainer dopo conferma della build Windows T07. Il feedback non certifica tutti i percorsi personali o le altre piattaforme. [Issue T08 aperta](https://github.com/AndreaZero/nexus-ai/issues/8), T07 chiusa; T09 non avviato.

## Ownership T08 integrate/rilasciate e contratto

| Fronte | Percorsi scrivibili | Obiettivo / handoff |
| --- | --- | --- |
| `/root/t08_server` — integrato | `apps/server/src/realtime*.ts`, `app.ts`, `sessions.ts`, test server pertinenti | HTTP upload selezionato, outbox atomica, WS autenticato, snapshot/replay/ACK/presenza/revoca |
| `/root/t08_desktop` — integrato | `apps/desktop/src/realtime*.ts`, test corrispondenti, `codex.ts` e suo test per perdita auth transitoria | WS nel main, coda cifrata/bounded, offset/idempotenza, recupero senza replay eseguibile |
| `/root/t08_web` — integrato | `apps/web/src/**`, `apps/web/vite.config.ts`, test web | Presenza e sync reali reference, share live esplicito e proiezioni autorizzate, recupero senza dati obsoleti |
| Coordinatore — integrato | contratti/DB/migrazione, auth/main/preload, manifest/lockfile, logging, QA/docs | Contratti unici e migrazione additiva 0003, integrazione e consegna |

Contratti fissati in `packages/contracts/src/realtime.ts`: HTTP `POST /api/realtime` snapshot/readShare/upload; WS `/api/realtime` join/heartbeat/ack, frame snapshot/events/presence/heartbeat/denied. Cursori decimali per progetto, eventi durevoli solo metadata con proiezioni attuali: i dettagli selezionati si rileggono tramite readShare, senza raw protocol/tool/file. Migrazione 0003: project_realtime_cursor, live_share, realtime_event, realtime_upload; receipt idempotente con hash e ACK dopo COMMIT. Upload start/append/stop con offset testuali, max20 messaggi/128Ki caratteri, batch append16Ki. Condivisione soltanto messaggi scelti e confermati, futuri delta degli stessi ID; nessun nuovo messaggio o comando aggiunto implicitamente. Queue main cifrata max100/1MiB, riautorizzata prima del flush, scoping account/progetto/repo/root e nessun consenso/esecuzione in coda. Reconnect massimo8 tentativi con backoff+jitter e retry manuale; presenza heartbeat15s/scadenza45s, permessi/sessione ricontrollati anche a connessione aperta. Singolo backend con outbox PostgreSQL, nessun Redis/provider/deploy aggiunto. T09 non avviato.

## Evidenze T08 e prossimo passo

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

Chiudere app/backend precedenti, `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm package:win`; riavviare server e app in terminali separati. Guida a due account, Share live, Stop, reconnect e revoca in [realtime.md](realtime.md#build-e-prova-del-maintainer). Rapporti/catture `.nexus/visual/t08/`; shell nel percorso storico `.nexus/visual/t02/`. Attendere feedback del maintainer prima di T09.

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
| Coordinatore | contratti/DB/migrazioni, auth/main/preload desktop, route server/logging, manifest, QA/docs | Contratti unici, integrazione, migrazione additiva e consegna |

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
| Integrazione | Coordinatore | contratti, schema generato, manifest/lockfile, provision/build/packaging, licenze, documenti e QA |

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
