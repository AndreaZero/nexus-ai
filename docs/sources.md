# Fonti e tracciabilità

Rilevazione iniziale: **17 ottobre 2026**; aggiornamento finale T16: **18 ottobre 2026**, fuso Europe/Rome. Le fonti di progettazione sono distinte dalle prove sul codice registrate in [status.md](status.md).

## Conversazione di prodotto

[Workspace AI condiviso](chatgpt-conversation://6ad33df6-03cc-83eb-bdf1-18366c3f9543), ID `6ad33df6-03cc-83eb-bdf1-18366c3f9543`.

Il lettore ha restituito cinque turni con messaggi utente, senza ulteriori pagine. Le risposte dell'assistente sono riferimenti `chatgpt-content-reference`, non testo leggibile. Non sono state ricostruite o trattate come decisioni approvate. Il primo messaggio leggibile sembra proseguire una discussione precedente: eventuali requisiti non presenti restano da recuperare se emergono divergenze.

| ID | Evidenza leggibile | Implicazione |
| --- | --- | --- |
| U01 | Uso principalmente per coding; colleghi e clienti possono vedere il lavoro e collaborare | Progetti, presenza, sessioni condivise e visibilità per ruolo |
| U02 | Preferenza per account e piani esistenti; API come alternativa opzionale | Account personale principale, nessuna chiave API obbligatoria |
| U03 | Preferenza per un server ospitato per evitare IP, porte e forwarding; inviti a progetto/team | Backend centrale, connessioni in uscita e membership |
| U04 | Chat e attività passano dal server per raggiungere gli altri | Cronologia condivisa ed eventi autorizzati; il server può leggere i dati condivisi |
| U05 | Scelta successiva di utilizzare solo Codex | Niente Claude o framework multiprovider nel perimetro |
| U06 | Interfaccia futuristica, dinamica, lavoro percepito dal vivo | Design live coerente con dati reali e animazioni ambientali |
| U07 | Richiesta corrente: documenti, piano, file agenti, skill, repository open source; sviluppo dopo il via | Preparare e pubblicare la base, poi attendere avvio implementazione |
| U08 | Una cosa alla volta, sviluppo parallelo per fronti, niente versioni di prova o loop infiniti; build eseguite dall'utente | Tranche definitive, ownership e verifiche limitate ai cambiamenti |
| U09 | Reference 1/2/3 da riprodurre in componenti, layout, grafici, dettagli e animazioni | Specifica dettagliata e confronto sul viewport originale |
| U10 | Chiarimento corrente: app Windows, Mac e Linux; build Mac dal Mac più avanti | Target desktop multipiattaforma da subito; evidenze build separate per OS |

Successivamente il maintainer conferma le build Windows fino a T11, autorizza T12 con multiagenti e infine chiede di continuare fino alla task finale senza fermarsi e di arrestarsi dopo la consegna. Il mandato copre T13–T16, senza trasformarsi in accettazione manuale di ogni percorso o di altri OS. La sequenza effettiva e i commit sono nel piano e nello stato.

## Reference visive

Il maintainer conferma in questa sessione build Windows0.9.1 e scomparsa del429, poi autorizza T10 con multiagenti per Client & Team Pulse reference 1. La conferma accetta T09 per Windows; non estende l'evidenza a macOS/Linux o a ogni percorso personale Codex.

`examples/design/1.png`: vista cliente/team. `2.png`: sessione AI. `3.png`: overview progetto. Tutte **1586 × 992 pixel**. Geometria e colori sono stati ispezionati; i colori CSS sono una sintesi dei pixel con gradienti, non token originali recuperati. Font, frequenza delle particelle, durata animazioni e comportamento responsive non sono determinabili da una PNG: la specifica li definisce come ricostruzione.

## Documentazione ufficiale consultata

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): protocollo, schemi generati dalla CLI, conversazioni, streaming e richieste di approvazione.
- [Autenticazione Codex](https://learn.chatgpt.com/docs/auth): account ChatGPT, alternativa API e credenziali locali.
- [Codex app-server con Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server): percorso alternativo con OAuth gestito dall'app.
- [Sign in with ChatGPT per app open source](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt): identità e uso del piano come permessi distinti. Non implica importare conversazioni ChatGPT.
- [Sicurezza Electron](https://www.electronjs.org/docs/latest/tutorial/security): isolamento del renderer e confine con API native.
- [Better Auth](https://better-auth.com/docs/introduction) e [integrazione Electron](https://better-auth.com/docs/integrations/electron): identità Nexus e accesso browser desktop, implementati con la versione fissata 1.7.10.

Queste fonti hanno supportato la progettazione. Le versioni effettive sono fissate nei manifest e nel lockfile; il runtime Codex 0.159.2 ha prodotto il proprio schema. Dove i documenti correnti descrivono un protocollo successivo, prevalgono i tipi generati della versione adottata. Nessun modello, prezzo, quota o diritto di accesso viene dedotto dai mockup.

**Aggiornamento T05:** runtime fissato a `@openai/codex@0.159.2`, schema prodotto dal comando ufficiale della stessa versione e conservato in `packages/codex-bridge/generated/`. Consultate le sezioni account/login, thread/turni e sandbox di App Server; dove la documentazione corrente contiene campi successivi, prevalgono i tipi effettivamente generati per 0.159.2. Licenza dalla [release ufficiale](https://github.com/openai/codex/blob/rust-v0.159.2/LICENSE), copiata nei resources desktop. Handshake/catalogo anonimo provati sul binario reale Windows; inferenza personale ancora da prova del maintainer.

**Aggiornamento T07:** schema 0.159.2 per sandbox workspaceWrite, CommandExecutionRequestApproval/FileChangeRequestApproval, decisione accept/decline, delta output e diff; nessuna modifica ai generated. Consultata la [documentazione ufficiale VS Code](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls) per URI di apertura file/cartella. Le prove UI/IPC con provider controllato restano distinte dall'esecuzione personale Codex.

**Aggiornamento T08:** [ws — autenticazione dell'upgrade HTTP](https://github.com/websockets/ws#client-authentication) e API browser nativa; `ws`8.22.0 e `@types/ws`8.18.2 verificati sul registro tramite pnpm. Origin/cookie verificati prima dell'upgrade, no query token e no compressione. Schema Codex 0.159.2 invariato; protocollo realtime Nexus distinto dal protocollo provider. PNG2 e3 aperte per presenza/header e Session Info. Contratto, limiti e verifiche effettive in [realtime.md](realtime.md).

**Aggiornamento T09:** PNG3 originale aperta prima delle deleghe e confrontata con il renderer effettivo1586×992 popolato da fixture dichiarati, Git/TAP isolati reali e campioni OS reali dopo Enable. Contratti e fonti dei pannelli in [overview.md](overview.md): eventi outbox T08, entità correnti e contatori `node:os` cpus/totalmem/freemem, nessuna nuova libreria o promessa di dati remoti. Build/personale e prove native distinte in status.

## Preparazione T03

Il maintainer ha confermato T02 Windows funzionante e UI approvata, autorizzando T03 con multiagenti e chiedendo i prerequisiti PostgreSQL prima di introdurre account/persistenza. Il database locale sarà creato personalmente dal maintainer.

- [Policy versioni PostgreSQL](https://www.postgresql.org/support/versioning/): 18.6 e 17.11 risultano minor correnti alla consultazione del 17 ottobre 2026; scegliere la minor aggiornata della major supportata.
- [CREATE ROLE](https://www.postgresql.org/docs/18/sql-createrole.html), [CREATE DATABASE](https://www.postgresql.org/docs/18/sql-createdatabase.html) e [psql](https://www.postgresql.org/docs/18/app-psql.html): ruolo dedicato, creazione DB fuori transazione e password interattiva.
- [Adapter Drizzle Better Auth](https://better-auth.com/docs/adapters/drizzle), [integrazione Fastify](https://better-auth.com/docs/integrations/fastify) e [Electron](https://better-auth.com/docs/integrations/electron): base del contratto in `auth.md`. Le pagine correnti sono fonti di progettazione, non prova della versione futura del lockfile o di un flusso già funzionante.

## T12 — Git e GitHub

Fonti ufficiali consultate il 18 ottobre 2026: [permessi fine-grained](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens), [review REST](https://docs.github.com/en/rest/pulls/reviews), [firma webhook](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [commit-tree](https://git-scm.com/docs/git-commit-tree) e [update-ref](https://git-scm.com/docs/git-update-ref). Adottati API 2026-03-10, HMAC raw/timingSafeEqual e token dedicati con Contents/Pull requests read-write; comportamento effettivo/limiti/prova in repositories.md, non dedotti dalla sola documentazione. PNG1/2/3 aperte per nuovi flussi Code/Repos e diff; animazioni restano ricostruzioni T02/T10.

## T13–T16 — fonti ed evidenze finali

T13 usa registrazioni manuali di build e health con fonte e scadenza; non è un adapter cloud o un servizio di deployment implicito. T14 aggiunge ricerca sui contenuti pubblicati e autorizzati, preferenze persistenti e autorità self-host isolate. Queste sono decisioni implementate nel repository, descritte in [deployments](deployments.md) e [application](application.md), senza dedurre dati operativi dalle PNG.

T15 ha riaperto e confrontato gli originali1/2/3 con il renderer effettivo. [Revisione e catture controllate](design/t15-review.md) riportano geometrie, testi lunghi, movimento ridotto e recupero; non attestano identità pixel o una prova di inferenza personale. La [CI del commit T15](https://github.com/AndreaZero/nexus-ai/actions/runs/39099306162) è passata su Windows/macOS/Linux per check/test/build; package e prova desktop nativi sono verifiche separate.

Per T16 sono state consultate fonti ufficiali, mantenendo electron-builder 26.15.3 e senza applicare opzioni della versione 27:

- [electron-builder 26: macOS e notarizzazione](https://www.electron.build/v26/docs/mac/) e [firma Windows](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).
- [Docker: Node.js](https://docs.docker.com/guides/nodejs/) e [immagine PostgreSQL ufficiale](https://hub.docker.com/_/postgres), per container e persistenza.
- Release ufficiali Actions fissate: [checkout7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [pnpm action-setup6.1.0](https://github.com/pnpm/action-setup/releases/tag/v6.1.0), [upload-artifact7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).

Le fonti spiegano le opzioni adottate; le prove effettive di container, backup/restore, firma, package e runtime restano quelle registrate in [status](status.md), [self-host](self-host.md) e [release](release.md). Nessuna consultazione documentale vale come certificato di firma o deployment remoto.
