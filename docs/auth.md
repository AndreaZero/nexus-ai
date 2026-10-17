# Identità Nexus — contratto T03

Stato: **preparazione, 17 ottobre 2026**. Questo documento fissa i confini per implementare T03 dopo che il maintainer ha preparato PostgreSQL. Account, tabelle, migrazioni, invio email e login desktop **non sono ancora implementati**. Il DB resta a carico del maintainer: [preparazione locale](setup/postgresql.md).

## Scelte e dipendenze

Nexus usa Better Auth con email/password, PostgreSQL, Drizzle e driver JavaScript `pg`/node-postgres. Il pool appartiene a `packages/db`, viene creato dal server e chiuso con Fastify; non entra nei bundle renderer o desktop. Drizzle documenta questo driver e l'uso di un pool esistente: non serve `pg-native`. [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql).

L'adapter Better Auth sarà Drizzle con provider `pg`, schema esplicito e istanza DB condivisa dal server. La generazione dello schema viene revisionata e trasformata in migrazioni Drizzle versionate; niente `push`, `migrate` della CLI Better Auth o migrazioni all'avvio dell'app. Lo schema standard e la generazione per ORM sono documentati ufficialmente. [Adapter Drizzle](https://better-auth.com/docs/adapters/drizzle), [database Better Auth](https://better-auth.com/docs/concepts/database).

Per il desktop scegliamo il plugin ufficiale `@better-auth/electron`, evitando un protocollo auth costruito da Nexus. La documentazione descrive browser di sistema, PKCE/state, codice temporaneo, proxy web e storage sostituibile. Il client auth resta nel main. [Integrazione Electron](https://better-auth.com/docs/integrations/electron).

**Da fissare nell'implementazione, prima degli edit paralleli:** versioni esatte di Better Auth, plugin Electron, Drizzle ORM/Kit e `pg`, compatibilità peer e schema della medesima versione. La documentazione Better Auth consultata indica **1.7.10**; non è un pin già installato. La guida Drizzle corrente mostra anche pacchetti `@rc`: Nexus userà release stabili compatibili, senza introdurre una prerelease per seguire un esempio. Se il plugin stabile non mantiene sandbox, verifica mittente e confini sotto descritti, registrare il difetto prima di modificare la scelta, senza introdurre un'autenticazione alternativa silenziosa.

## PostgreSQL e schema

La preparazione richiede un database UTF-8 dedicato e un ruolo login dedicato, proprietario del solo DB locale, senza privilegi superuser, creazione ruoli/database o replica. Nessuna estensione è richiesta dallo schema auth base esaminato; non preparare Redis, `pgcrypto`, `uuid-ossp`, tabelle o dati manuali per T03. Versione e comandi operativi sono nella [guida PostgreSQL](setup/postgresql.md).

| Modello libreria | Dati principali | Confine Nexus |
| --- | --- | --- |
| `user` | ID, nome, email univoca, verifica email, immagine, date | Identità Nexus; nessuna credenziale Codex |
| `session` | Utente, token, scadenza, date, metadati del dispositivo | Revocabile; token escluso da DTO, log e renderer |
| `account` | Metodo credenziale, relazione utente e password gestita dalla libreria | Nessuna duplicazione dell'hash in tabelle Nexus |
| `verification` | Identificatore, valore, scadenza e date | Materiale temporaneo per verifica/reset e flussi plugin secondo schema generato |

Questi sono i quattro modelli base documentati, non SQL da creare. Nomi, indici, relazioni, eventuali campi/plugin aggiuntivi e formato dei valori vengono fissati sullo schema generato dalla configurazione effettiva; non presumere token già hashati o formati UUID. [Schema base ufficiale](https://better-auth.com/docs/concepts/database).

T03 non aggiunge workspace, progetti, ruoli, inviti o dati iniziali: appartengono a T04. Un'identità autenticata non attribuisce alcuna membership. I futuri controlli di dominio restano server-side come richiesto da [contracts.md](contracts.md).

## Configurazione prevista

Le variabili seguenti costituiscono il contratto da collegare nel codice T03. Solo `DATABASE_URL` e l'URL renderer figurano già in `.env.example`; le altre saranno aggiunte con l'implementazione. La base T02 non legge ancora configurazione auth o SMTP.

| Variabile | Valore locale / requisito | Visibilità |
| --- | --- | --- |
| `DATABASE_URL` | URL del DB dedicato su `127.0.0.1:5432`; password codificata nell'URL | Solo server e comando migrazioni |
| `BETTER_AUTH_SECRET` | 32 byte casuali codificati base64, mantenuti stabili fra riavvii | Solo server |
| `BETTER_AUTH_URL` | `http://127.0.0.1:3001` | Config server; URL pubblico non segreto |
| `NEXUS_WEB_URL` | `http://127.0.0.1:5173` | Config server per link e redirect esatti |
| `VITE_NEXUS_SERVER_URL` | `http://127.0.0.1:3001` | Pubblica, già usata dal renderer |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Trasporto SMTP esplicito | Solo server |
| `SMTP_USER`, `SMTP_PASSWORD` | Credenziali se richieste dal trasporto | Solo server |
| `NEXUS_EMAIL_FROM` | Mittente consentito dal trasporto | Solo server |

Better Auth richiede un secret ad alta entropia lungo almeno 32 caratteri e un URL base esplicito; il requisito Nexus di 32 byte casuali soddisfa quel minimo. Non rigenerarlo a ogni avvio. Non mettere segreti in variabili `VITE_`, repository o messaggi in chat. [Installazione Better Auth](https://better-auth.com/docs/installation).

Usare `127.0.0.1` per web, API e link locali: `localhost` è un host diverso per cookie e origine. La porta DB può essere diversa se già occupata, aggiornando la sola connessione DB. In hosting serviranno URL HTTPS configurati esplicitamente e TLS del DB verificato secondo il provider; HTTP locale non definisce una policy di produzione.

## HTTP e sessione browser

Il percorso libreria sarà **`/auth/*`** (basePath esplicito), coerente con i contratti Nexus; il default della libreria è `/api/auth`. Fastify inoltrerà richieste/risposte tramite l'handler ufficiale, preservando separatamente tutti i `Set-Cookie`. L'URL sarà costruito dalla configurazione server, senza fidarsi di `Host`/forwarded headers arbitrari. La guida ufficiale illustra handler, conversione header, CORS e lettura server della sessione. [Fastify Better Auth](https://better-auth.com/docs/integrations/fastify), [base path e client](https://better-auth.com/docs/installation).

Il browser usa cookie HttpOnly e richieste con credenziali; nessun token in localStorage. Cookie Secure in HTTPS, attributi SameSite appropriati, niente dominio condiviso globale. Web e API locali hanno host uguale e porte diverse. L'hosting dovrà conservarli sullo stesso sito o introdurre un proxy esplicito, verificato prima del deploy. [Cookie Better Auth](https://better-auth.com/docs/concepts/cookies).

Origini di fiducia auth: web esatto `http://127.0.0.1:5173` e schema callback desktop indicato sotto. L'allowlist CORS esistente include separatamente `nexus://app`; non equivale a un redirect auth autorizzato. Niente wildcard per host web, disabilitazione del controllo Origin/CSRF o origine `null` consentita globalmente. Il server amplia metodi e credenziali CORS solo dove richiesto dalle rotte auth effettive.

La UI distingue sessione assente, verifica email richiesta, autenticata, scaduta/revocata e server non raggiungibile. Un dato in cache non prova che una sessione sia ancora valida. Per T03 le API protette ricontrollano la sessione persistita e non autorizzano tramite una cache cookie non invalidabile. Logout revoca la sessione corrente; reset riuscito revoca le altre sessioni secondo configurazione esplicita. [Sessioni Better Auth](https://better-auth.com/docs/concepts/session-management).

## Accesso desktop e persistenza locale

Identificatori Nexus da usare coerentemente in server, proxy web, main e packaging:

- Scheme OS proposto: **`io.github.andreazero.nexusai`**, distinto da `nexus://app`, che serve soltanto i file del renderer.
- Callback proposto: **`/auth/callback`**, client ID **`nexus-desktop`**. La documentazione mostra un'origin di fiducia nella forma `scheme:/`; la stringa concreta `io.github.andreazero.nexusai:/` e l'URI di ritorno restano **da validare sulla release fissata**, non sono già stati provati da Nexus. Il parser deve rispettare la forma prodotta dal plugin.
- Pagina web di accesso: URL costruito da `NEXUS_WEB_URL`; server auth da `BETTER_AUTH_URL`. Gli eventuali parametri PKCE/state vengono conservati nel percorso email/password e nel trasferimento di una sessione browser già valida.

Il percorso avvia l'accesso dal main, apre soltanto l'URL configurato nel browser di sistema, riceve il codice temporaneo e lo scambia tramite il plugin. Il renderer riceve esclusivamente profilo consentito e stato. Il protocollo documentato consente il rientro tramite deep link; l'eventuale inserimento manuale del codice resta esplicito e legato a un tentativo PKCE già avviato. [Plugin Electron ufficiale](https://better-auth.com/docs/integrations/electron).

Requisiti Nexus per l'integrazione: accettare solo il callback atteso per il tentativo attivo; rifiutare state assente/diverso, codice scaduto o riusato, callback non richiesta e destinazioni arbitrarie. Gestire un solo tentativo attivo, annullamento e scadenza visibili. Windows/Linux richiedono la gestione del secondo avvio e macOS dell'evento URL; nessun callback esegue comandi o cambia endpoint server. Non aprire un listener di rete per questo percorso.

Usare storage custom nel main con dati cifrati sotto `app.getPath('userData')` tramite `safeStorage` e sostituzione atomica del file. Nessun salvataggio in chiaro implicito. Verificare disponibilità della cifratura; su Linux il backend `basic_text` non è protezione accettabile. Se il keyring non è disponibile, spiegare il recupero e proporre solo una sessione in memoria esplicitamente scelta. macOS richiede una firma stabile per continuità affidabile del Keychain fra build. [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

Il setup del plugin deve rispettare sandbox, CSP e verifica del mittente IPC di T01. Prima dell'adozione verificare le API della release fissata, senza esporre `authClient`, cookie o chiamate generiche al renderer. Il preload Nexus conserva un insieme ristretto di operazioni validate: richiesta login, annullamento, stato/profilo, logout e sottoscrizione ai cambiamenti. I token non attraversano questi metodi. Eventuali richieste autenticate future dal desktop passano dal main per dominio, senza un proxy HTTP arbitrario.

## Email e pagine account

Registrazione, verifica e reset usano email reali via SMTP configurato. In sviluppo un SMTP sink locale è ammesso: riceve realmente il messaggio e permette al maintainer di aprire il link senza consegnare posta esterna. L'eventuale servizio viene preparato dal maintainer; non servono account email a pagamento per preparare il DB.

T03 richiederà verifica email, reinvio con cooldown, reset monouso con scadenza e risposta neutra quando un indirizzo non esiste. Si usano gli hook ufficiali di invio e reset della libreria, mantenendo le protezioni contro enumerazione. Rate limit esplicito su login, registrazione, reinvio e reset; l'IP deve provenire da proxy configurati, non da header arbitrari. Nessun login automatico prima della verifica e nessuna stampa di token/link di reset nei log. Gli errori SMTP sono recuperabili, senza segnare una mail come consegnata quando non lo è. [Email e password Better Auth](https://better-auth.com/docs/authentication/email-password).

Le PNG approvate non mostrano pagine account. Login, creazione account, verifica, reset e ritorno desktop devono quindi essere nuove composizioni esplicitamente dichiarate, con gli stessi token, font, bordi e focus T02; niente cambiamenti arbitrari alle tre shell approvate. Login Nexus e collegamento Codex restano azioni e credenziali separate.

## Uscita dell'implementazione T03

Una volta pronto il DB, integrare in ordine schema/migrazioni revisionati, servizio auth/email, pagine web e bridge desktop sul contratto fissato. I controlli mirati devono coprire:

1. Registrazione, verifica, sessione persistente dopo riapertura, logout e reset con email ricevuta; rifiuto di email non verificata, link scaduti e token reset riusato; limiti contro tentativi ripetuti.
2. Origine non consentita, redirect esterno e credenziali mancanti: nessun accesso; revoca/scadenza effettiva anche dopo una sessione in cache.
3. Callback senza tentativo, state errato, replay, PKCE errato, cancellazione e doppio callback; nessuna credenziale nei DTO IPC, bundle o log.
4. IPC da mittente/frame non autorizzato, storage non disponibile/corrotto e backend Linux debole; nessun fallback persistente in chiaro.
5. Migrazione su DB vuoto e secondo avvio senza modifiche automatiche allo schema; errori DB/SMTP mostrati con recupero comprensibile.

Le prove del protocollo OS e del keyring rimangono separate per Windows, macOS e Linux. Non dichiararle superate perché esiste una configurazione di packaging. Le prove account non autorizzano T04 o l'accesso a un progetto.
