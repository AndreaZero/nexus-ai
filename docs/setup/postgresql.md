# PostgreSQL locale — preparazione T03

Il maintainer esegue personalmente questi passi. La preparazione crea soltanto ruolo e database vuoto; account Nexus, tabelle e migrazioni saranno introdotti nel seguito di T03. Nessun database viene installato, creato o modificato dall'agente.

## Configurazione richiesta

| Campo | Valore locale |
| --- | --- |
| Server | PostgreSQL **18**, ultima minor disponibile; **18.6** alla verifica del 17 ottobre 2026 |
| Alternativa già installata | PostgreSQL **17** aggiornato; **17.11** alla stessa verifica |
| Host / porta | `127.0.0.1` / `5432` |
| Database / login | `nexus_ai_dev` / `nexus_ai_dev` |
| Encoding | `UTF8` |
| Schema applicativo | `public`, proprietà di `nexus_ai_dev` |
| Privilegi login | `LOGIN`, senza superuser, creazione DB/ruoli, replica o bypass RLS |
| Password | Dedicata, scelta localmente e mai inviata in chat |

Usare la minor corrente della major scelta: PostgreSQL mantiene le major per cinque anni e raccomanda gli aggiornamenti minori. Queste sono versioni target; non è ancora stata eseguita una prova dell'app con il DB. [Policy e versioni PostgreSQL](https://www.postgresql.org/support/versioning/).

Sul PC Windows è stato rilevato soltanto il client `psql` 18.1 nel percorso `C:\Program Files\PostgreSQL\18\bin\psql.exe`. Questo non dimostra la versione o la disponibilità del server: verificarle con il login e le query sotto, aggiornando la minor del server se necessario. Nessun aggiornamento è stato eseguito dall'agente.

Se PostgreSQL manca, installarlo dalla [pagina ufficiale Windows](https://www.postgresql.org/download/windows/), includendo server e strumenti da riga di comando (`psql`). pgAdmin è facoltativo. Per macOS/Linux usare la [pagina download del proprio OS](https://www.postgresql.org/download/); stessi nomi e SQL, nessuna dipendenza da WSL o Docker. Non servono estensioni, Redis o un database ombra.

Tenere il servizio raggiungibile solo localmente, con autenticazione a password; non abilitare accesso di rete per questa preparazione. Lo script imposta la nuova password con SCRAM nella propria connessione amministrativa, senza cambiare le impostazioni globali. [Autenticazione PostgreSQL](https://www.postgresql.org/docs/18/auth-password.html).

## Creazione con psql

Aprire PowerShell nella root del repository. Il primo prompt richiede la password dell'amministratore PostgreSQL `postgres`; i due successivi chiedono la nuova password di `nexus_ai_dev`. Alla riconnessione finale può essere richiesta di nuovo la password di `postgres`, come indicato dal messaggio dello script.

```powershell
psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -f scripts/postgresql/prepare-local.psql
```

Se `psql` non è nel PATH, usare lo stesso comando con l'eseguibile installato, per esempio:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -f scripts/postgresql/prepare-local.psql
```

Oppure aprire **SQL Shell (psql)** dal menu Start, collegarsi a `127.0.0.1`, database `postgres`, porta `5432`, utente `postgres`, quindi caricare lo script con il suo percorso assoluto e slash `/`:

```text
\i 'C:/percorso/nexus-ai/scripts/postgresql/prepare-local.psql'
```

Lo script usa `ON_ERROR_STOP`, verifica versioni, encoding e nomi prima delle scritture, e si ferma se ruolo o DB esistono già. Non sovrascrive oggetti esistenti e non contiene `DROP`. Non eseguirlo con `-1`/`--single-transaction`: `CREATE DATABASE` deve stare fuori da una transazione. [CREATE DATABASE](https://www.postgresql.org/docs/18/sql-createdatabase.html).

La password è letta tramite `\password`, senza inserirla nel file SQL o nella riga di comando. Non usare password vuota. Se la procedura si interrompe dopo la creazione del ruolo, conserva quanto già creato e segnala solo il punto dell'errore: non rilanciare né cancellare oggetti per ripartire. [psql e password interattive](https://www.postgresql.org/docs/18/app-psql.html).

Il login possiede DB/schema per poter applicare le future migrazioni di sviluppo, ma non amministra il cluster. Questa configurazione locale non definisce il ruolo runtime di produzione, che sarà separato dal ruolo migrazioni e avrà i soli privilegi necessari. [Attributi dei ruoli](https://www.postgresql.org/docs/18/sql-createrole.html).

## Alternativa manuale con pgAdmin

Il file `.psql` contiene metacomandi: **non incollarlo nel Query Tool**, che esegue SQL. Se preferisci pgAdmin:

1. Collegati come amministratore al database `postgres`; verifica che `nexus_ai_dev` non esista fra ruoli e database.
2. Da **Login/Group Roles → Create** crea `nexus_ai_dev`. In **Definition** imposta una password dedicata; in **Privileges** abilita solo il login, mantenendo disabilitati superuser, creazione ruoli/DB, replica e bypass RLS.
3. Da **Databases → Create** crea `nexus_ai_dev`, owner `nexus_ai_dev`, encoding `UTF8`, template `template0`. Non creare tabelle.
4. Apri il Query Tool del **nuovo database `nexus_ai_dev`** e applica questo SQL solo a quel DB appena creato:

```sql
REVOKE CONNECT, TEMPORARY ON DATABASE nexus_ai_dev FROM PUBLIC;
ALTER SCHEMA public OWNER TO nexus_ai_dev;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
```

Per `CREATE DATABASE` eseguito manualmente nel Query Tool serve autocommit attivo e un'esecuzione separata dalle altre istruzioni. La procedura GUI evita questa ambiguità. [Query Tool e autocommit](https://www.pgadmin.org/docs/pgadmin4/latest/query_tool_toolbar.html). L'ownership e i privilegi dello schema impediscono che altri ruoli ordinari creino oggetti in `public`. [Schemi PostgreSQL](https://www.postgresql.org/docs/18/ddl-schemas.html).

## Verifica senza modifiche

Collegati come login applicativo, usando la password appena scelta:

```powershell
psql -X -h 127.0.0.1 -p 5432 -U nexus_ai_dev -d nexus_ai_dev -W
```

Esegui queste query di sola lettura in psql o nel Query Tool collegato con lo stesso login:

```sql
SELECT current_database(), current_user,
       inet_server_addr(), inet_server_port(),
       current_setting('server_version') AS server_version,
       current_setting('server_encoding') AS server_encoding;

SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname = current_user;

SELECT datname, pg_get_userbyid(datdba) AS owner,
       pg_encoding_to_char(encoding) AS encoding
FROM pg_database WHERE datname = current_database();

SELECT nspname, pg_get_userbyid(nspowner) AS owner,
       has_schema_privilege(current_user, oid, 'USAGE') AS can_use,
       has_schema_privilege(current_user, oid, 'CREATE') AS can_create
FROM pg_namespace WHERE nspname = 'public';
```

Atteso: DB e utente `nexus_ai_dev`, host `127.0.0.1`, porta `5432`, encoding `UTF8`; `rolcanlogin = true` e tutti gli altri attributi elencati `false`; owner di DB e schema `nexus_ai_dev`, `can_use = true`, `can_create = true`. In psql esci con `\q`. Non creare tabelle di prova o account SQL per gli utenti Nexus: i loro account saranno record applicativi.

## Configurazione del repository

Se `.env` non esiste, copia `.env.example` in `.env`; altrimenti modifica il file già presente senza sovrascriverlo. Inserisci **solo nel file locale ignorato da Git**:

```dotenv
DATABASE_URL=postgresql://nexus_ai_dev:PASSWORD_URL_ENCODED@127.0.0.1:5432/nexus_ai_dev
```

`PASSWORD_URL_ENCODED` è un segnaposto: sostituiscilo con la password codificata come componente URI. Per esempio `@` diventa `%40`, `:` `%3A`, `/` `%2F`, `#` `%23`, `%` `%25`; non inviare la password a encoder online. [URI di connessione PostgreSQL](https://www.postgresql.org/docs/18/libpq-connect.html#LIBPQ-CONNSTRING).

`DATABASE_URL` è una configurazione **server**, mai `VITE_DATABASE_URL` né un valore da trasferire al renderer. Non stamparla nei log o incollarla in chat. Per questa connessione locale non occorrono certificati TLS; in hosting si definiranno TLS e segreti del servizio separatamente.

La base attuale legge la configurazione ma non apre ancora connessioni: uno stato `not_connected` dell'app è previsto in questa fase e non sostituisce la prova psql. Quando il login e le query danno i risultati attesi, comunica soltanto **“PostgreSQL pronto, versione X, verifiche OK”**, senza URL o password. Riprenderemo T03 introducendo migrazioni e account sul DB vuoto preparato.
