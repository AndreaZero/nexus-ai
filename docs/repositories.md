# Git, GitHub e repository — T12

Nexus AI 0.12.0 aggiunge Code & review e completa Repos. Il repository condiviso conserva URL e branch predefinito; la cartella resta un binding per account/dispositivo. Git e filesystem girano soltanto nel main desktop Windows/macOS/Linux. Il browser può usare GitHub e leggere le proiezioni autorizzate, senza accedere alla cartella locale.

## Preparazione e prova Windows

Chiudere app e server della build precedente. PostgreSQL e Mailpit restano quelli già configurati; non occorre creare un altro DB o cambiare `.env`.

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm package:win
```

La migrazione additiva **0006_repositories** porta a sette migrazioni. È applicata esplicitamente al database locale `nexus_ai_dev`, mai all'avvio. Account e dati esistenti sono conservati. In un terminale avviare `pnpm start:server`; mantenere Mailpit già attivo oppure avviarlo una sola volta con `pnpm mailpit`. Nell'altro terminale `pnpm start:desktop`, oppure installare il package unsigned `release/win/Nexus-AI-0.12.0-win-x64.exe`. Mac/Linux richiedono `pnpm package:mac`/`pnpm package:linux` sul relativo sistema; non sono build native verificate da Windows.

1. In Repos impostare l'URL HTTPS `github.com/owner/repo`, il branch predefinito e scegliere una cartella Git esistente, alla radice del repository.
2. In Code controllare branch, stato e diff. Modificare un piccolo file di testo con l'editor, usare Refresh observations e selezionarlo. Commit selected apre l'anteprima con percorso/HEAD, messaggio, autore/email e conferma esplicita. Il commit deve apparire nella cronologia Git effettiva. I file non selezionati restano modificati.
3. Su working tree pulito creare un branch. La creazione lo lascia selezionabile; Switch branch è un'azione separata.
4. Collegare il proprio token GitHub in Repos, poi Synchronize GitHub per osservare commit e PR. Git Fetch, Pull fast-forward e Push sono azioni desktop distinte con destinazione/ref mostrate prima della conferma. Per pubblicare un nuovo branch usare Push prima di creare la PR.
5. In Pull requests creare una draft PR scegliendo head/base, titolo e descrizione, leggere l'anteprima e confermare. Aprire dettaglio/file/review; una review è legata allo SHA mostrato. GitHub conserva le proprie restrizioni, inclusa l'impossibilità di approvare la propria PR. Merge e risoluzione dei conflitti si eseguono negli strumenti Git/GitHub appropriati.
6. Verificare feed e Pulse dopo la sincronizzazione. Un client/viewer non deve vedere URL privati, diff, commit, PR o credenziali; la preview client applica lo stesso filtro sul server. Scollegando GitHub si rimuove il token del proprio account, senza cancellare la cronologia tecnica condivisa già osservata.

## Collegamento GitHub

Creare un **fine-grained personal access token** in [GitHub Settings](https://github.com/settings/personal-access-tokens), con scadenza e accesso al solo repository autorizzato. Permessi repository: **Contents read/write**, **Pull requests read/write**, Metadata read obbligatorio di GitHub. Nessun permesso organizzazione o account aggiuntivo. Per repository di un'organizzazione può servire l'approvazione prevista dalle sue policy. Il token va incollato nel campo password di Repos, mai in chat o nell'URL. Sono accettati token `github_pat_`; una credenziale read-only non abilita le operazioni di scrittura.

Il server verifica account e identità numerica del repository con l'API ufficiale e conserva la credenziale cifrata **AES-256-GCM**, con chiave derivata da `BETTER_AUTH_SECRET` e AAD per account/repository. Il segreto Nexus deve restare stabile anche durante backup/ripristino; ruotandolo occorre ricollegare GitHub e riconfigurare i webhook. L'input viene svuotato e non entra in localStorage, risposte renderer o log. Nessuna lettura di credenziali di GitHub CLI, editor o altri programmi.

Il main richiede una lease della sola credenziale del proprio account tramite endpoint fisso `/api/repositories/credential`, con sessione Nexus corrente e origine desktop dedicata. Le origini browser sono respinte. La lease non è un'operazione del bridge renderer. Durante Git viene passata nell'ambiente del solo processo figlio come header HTTPS; non entra negli argv, file del repository o log. HOME temporanea vuota, helper disabilitati, TLS verificato, redirect e protocolli alternativi bloccati.

## Git locale e recupero

Lo snapshot contiene UUID opachi dei file e `snapshotId`; nessun comando, path libero o token è accettato dal renderer. Prima di una mutazione vengono ricontrollati account, ruolo, binding, URL, HEAD, indice e byte del working tree. Un cambiamento dopo l'anteprima produce Conflict: aggiornare e rileggere il diff.

Il commit usa blob senza filtri, indice temporaneo, `commit-tree` e aggiornamento compare-and-swap del ref. L'indice reale viene aggiornato sotto lock; errori prima del completamento tentano il ripristino del ref soltanto se ancora quello creato. Staging già presente e merge irrisolto bloccano le scritture. Non vengono eseguiti hook, signing automatico, filtri, shell o helper del repository. Non vengono eseguiti reset, force push o merge commit automatici.

Sono supportati repository Git standard: worktree collegati, sparse/assume-unchanged, submodule, symlink e configurazioni eseguibili richiedono gli strumenti Git locali. Limiti di scansione: 10.000 file, 16 MiB per file e 64 MiB totali; diff di testo massimo64KiB/file e50file, cronologia30commit e200branch. Un'anteprima troncata non può essere committata. File sensibili/binari esclusi dal diff non vengono aggiunti dal commit selettivo. Altri dati modificati impediscono branch switch/pull quando necessario; file ignorati non vengono sovrascritti.

Le operazioni remote usano esclusivamente l'URL GitHub configurato e il branch corrente, senza seguire `origin`, pushurl o rewrite del repository. Fetch aggiorna `refs/remotes/nexus/<branch>`. Pull richiede working tree pulito e antenato fast-forward; una divergenza va risolta esplicitamente fuori dal workflow. Dopo un'interruzione di rete, aggiornare e controllare il risultato remoto prima di ripetere.

## PR, review e ricevute

Letture e comandi ricontrollano membership e repository corrente sul server. Solo owner/developer accedono al dominio tecnico. PR/review usano l'API REST GitHub versione `2026-03-10`, origine fissa, redirect negati, risposta limitata2MiB e timeout12s per richiesta, deadline totale30s nel servizio. Liste30commit/PR per pagina, dettaglio100file/review per pagina, con paginazione visibile. Patch non disponibili mostrano uno stato esplicito; i testi sono escaped.

Prima del POST remoto viene registrata una ricevuta durevole UUID/hash. Se la risposta si perde, lo stesso requestId cerca il marker nell'oggetto GitHub e non invia un secondo POST. Un esito uncertain resta da controllare: usare Retry check con lo stesso contenuto. La ricerca di riconciliazione è bounded; oltre la finestra resta uncertain. Il limite è100.000ricevute/repository. Approvazione cliente, review GitHub e consenso a eseguire Codex sono oggetti separati.

## Webhook e attività

Un owner collegato può generare/configurare un segreto in Repos e copiarlo nelle impostazioni webhook del repository GitHub. Payload URL: `https://<server-pubblico>/api/repositories/webhook/<repositoryId>`, Content type `application/json`, eventi **push**, **pull_request**, **pull_request_review**; ping supportato. GitHub non può raggiungere il loopback del PC: in locale usare Synchronize GitHub; attivare webhook esterni quando il server dispone di URL HTTPS raggiungibile. Nessun tunnel o deploy viene avviato automaticamente.

Il server verifica HMAC-SHA256 sui byte originali con confronto a tempo costante, delivery UUID, identità numerica/nome del repository e autorità attuale dell'owner configuratore. Delivery uguale/hash uguale è idempotente; stesso ID con payload diverso viene respinto. Segreto o URL cambiati richiedono riconfigurazione. Limiti: payload1MiB,100.000delivery/repository, storico1000attività. Il webhook importa soli metadati e invalida lo snapshot; non esegue comandi o sincronizzazioni remote.

Feed e Pulse ricavano commit/PR/review dalle osservazioni reali autorizzate. I contatori rappresentano commit osservati nel giorno UTC, non l'intera storia GitHub; restano unknown prima della sincronizzazione corrente. Mine attribuisce un commit soltanto a una corrispondenza univoca con il login GitHub esplicitamente collegato da un membro tecnico. Gli eventi WS sono invalidazioni senza ID o contenuti tecnici; il server rivaluta i dati quando compone lo snapshot. Sostituire l'URL rimuove atomicamente credenziali, cache, ricevute, webhook e attività del vecchio repository.

## Verifica e fonti

`pnpm verify:repositories` usa account temporanei, PostgreSQL/Mailpit/HTTP reali e API GitHub controllata per i POST, inclusa perdita della risposta, firma raw e replay. `pnpm verify:repository-ui` usa renderer/preload e Git temporaneo reali, con DTO GitHub/realtime controllati dichiarati. Nessuna PR/review personale viene pubblicata dai verifier. Rapporti e screenshot sono in `.nexus/visual/t12`, ignorata da Git. Le prove native/manuali e il package sono registrati separatamente in [status.md](status.md).

Fonti ufficiali: [permessi fine-grained](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens), [review](https://docs.github.com/en/rest/pulls/reviews), [firma webhook](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [commit-tree](https://git-scm.com/docs/git-commit-tree), [update-ref](https://git-scm.com/docs/git-update-ref). UI: PNG1/2/3; Code/Repos e dialoghi sono estensioni con Card/Dialog/palette della shell, senza una PNG dedicata.
