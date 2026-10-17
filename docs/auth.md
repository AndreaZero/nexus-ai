# Identità Nexus — T03

Stato: **implementato, consegnato per verifica Windows del maintainer**, 17 ottobre 2026. Account Nexus distinti dal login Codex. Workspace, progetti, membership e inviti restano T04; nessuna membership viene attribuita dalla sola registrazione.

## Avvio locale

PostgreSQL è stato predisposto dal maintainer: server 18.1, database UTF8 e ruolo `nexus_ai_dev`, schema `public` dello stesso owner. Credenziali esclusivamente nel `.env` locale ignorato da Git. Per un nuovo clone vedere [preparazione PostgreSQL](setup/postgresql.md).

Nella root, una volta configurato `DATABASE_URL`:

```powershell
pnpm install --frozen-lockfile
pnpm auth:setup
pnpm db:migrate
pnpm mailpit --install
pnpm package:win
```

`auth:setup` conserva i valori esistenti e aggiunge solo quelli mancanti: secret casuale di 32 byte, URL locali ed SMTP Mailpit. Il secret resta stabile nel proprio `.env`, non viene stampato o copiato nel renderer. `mailpit --install` scarica la release ufficiale **1.31.6** nella cartella ignorata `.nexus/tools/`, verifica il digest SHA-256 e non installa un servizio di sistema. Supporto del launcher per Windows/macOS/Linux x64/arm64; esecuzione nativa verificata qui solo Windows x64. [Distribuzione ufficiale Mailpit](https://mailpit.axllent.org/docs/install/).

Per provare la build compilata, lasciare aperti tre terminali nella root:

```powershell
# Terminale 1: posta locale
pnpm mailpit
```

```powershell
# Terminale 2: backend e pagine account compilate
pnpm start:server
```

```powershell
# Terminale 3: app compilata, oppure aprire l'app installata
pnpm start:desktop
```

Inbox: **http://127.0.0.1:8025**. Pagine account: **http://127.0.0.1:3001/sign-in**. Nell'app: **Settings → Nexus account → Sign in with browser**. Mailpit ascolta solo su `127.0.0.1:1025`/`8025`, conserva i messaggi in `.nexus/mailpit/` e non inoltra posta esterna.

Per sviluppo usare `pnpm dev:desktop` nel secondo terminale al posto di server/app separati: avvia Fastify, Vite e desktop; il flusso browser usa `127.0.0.1:5173`. Non avviarlo insieme a `start:server` sulla stessa porta. Per il ritorno OS più rappresentativo usare l'installer 0.3.0, così il protocollo è registrato dal pacchetto. Ctrl+C arresta i comandi avviati dal maintainer.

## Verifica manuale del task

1. Creare un account nel browser con password 12–128 caratteri. Prima della verifica il login è rifiutato; aprire la mail in Mailpit, seguire il link e accedere.
2. Dall'accesso iniziato nel desktop completare **Continue in Nexus AI**, consentire al browser l'apertura dell'app e verificare nome/email in Settings. Non usare la password PostgreSQL per l'account Nexus.
3. Chiudere e riaprire l'app: la sessione salvata deve essere verificata col server e ripristinata. Fare logout e verificare che non torni autenticata alla riapertura.
4. Richiedere **Forgot password?**, aprire la mail, scegliere una nuova password. Il link è monouso e le sessioni precedenti sono revocate; il vecchio accesso deve cessare di essere valido.
5. Fermare Mailpit e richiedere un reinvio/reset: errore recuperabile, nessuna consegna dichiarata. Riavviare e riprovare rispettando il cooldown. Codex resta scollegato e i progetti restano vuoti fino ai task successivi.

Se il desktop resta su **Complete sign-in** dopo **Continue in Nexus AI**, usare la correzione browser T03: il trasferimento non deve ricevere un `callbackURL` web, che farebbe ricaricare la pagina prima del ritorno OS. Dopo l'aggiornamento eseguire `pnpm --filter @nexus-ai/web build`, arrestare e riavviare `pnpm start:server`, poi annullare la vecchia richiesta nell'app e avviare un nuovo accesso. Con `pnpm dev:desktop` il renderer si aggiorna tramite Vite. La richiesta desktop scade dopo cinque minuti; eventuali schede di accesso precedenti non la riattivano. La nuova build web richiede il riavvio del server compilato perché le route degli asset vengono registrate all'avvio.

## Stack e persistenza

Versioni fissate: Better Auth, adapter Drizzle e plugin Electron **1.7.10**; Drizzle ORM **0.45.4**, Kit **0.31.11**, `pg` **8.23.1**, Nodemailer **10.1.2**. Le peer del plugin sono fissate nei manifest. Nessun `pg-native`, Redis, database ombra o estensione PostgreSQL.

Il pool Node-only vive in `packages/db`, viene creato pigramente dal server e chiuso con Fastify; massimo otto connessioni, timeout espliciti. Health esegue un probe reale e distingue `not_configured`, `not_connected`, `connected`, `unavailable`. Non è un'autorizzazione di dominio.

| Tabella | Uso |
| --- | --- |
| `user` | Identità, email univoca/verificata, nome e date |
| `account` | Password e metodo credenziale gestiti dalla libreria; FK utente con cascade |
| `session` | Token, scadenza e revoca persistiti; FK utente con cascade |
| `verification` | Materiale temporaneo di reset e protocollo auth |
| `rate_limit` | Limiti auth persistiti, indipendenti dai riavvii server |

Lo schema Drizzle esplicito corrisponde ai modelli della release installata; nomi SQL in snake case, ID testuali generati dalla libreria. Migrazioni SQL e metadata sono versionati in `packages/db/migrations/`. `pnpm db:migrate` è un comando esplicito, serializzato con advisory lock e limitato al DB locale `nexus_ai_dev`; seconda applicazione verificata senza duplicazioni. L'avvio di app/server non applica migrazioni. Il percorso self-host/produzione verrà esteso esplicitamente in T16. [Adapter ufficiale](https://better-auth.com/docs/adapters/drizzle), [schema libreria](https://better-auth.com/docs/concepts/database).

## Configurazione

| Variabile | Default/requisito locale | Visibilità |
| --- | --- | --- |
| `DATABASE_URL` | Connessione al DB dedicato; password come componente URI | Solo server/CLI DB |
| `BETTER_AUTH_SECRET` | 32 byte casuali base64 generati una sola volta | Solo server |
| `BETTER_AUTH_URL` | `http://127.0.0.1:3001` | Endpoint pubblico, anche compilato nel main |
| `NEXUS_WEB_URL` | `http://127.0.0.1:3001`; orchestratore dev usa 5173 | Link account; anche compilato nel main |
| `VITE_NEXUS_SERVER_URL` | `http://127.0.0.1:3001` | URL pubblico incorporato nel renderer |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | `127.0.0.1` / `1025` / `false` | Server |
| `NEXUS_EMAIL_FROM` | `Nexus AI <noreply@nexus.local>` | Server |
| `SMTP_USER` / `SMTP_PASSWORD` | Entrambi assenti per Mailpit; entrambi presenti per SMTP autenticato | Solo server |

Non sovrascrivere `.env` con il template e non mettere credenziali in `.env.example` o variabili `VITE_`. I soli URL pubblici sono incorporati dal build script desktop; il pacchetto non legge il `.env` del clone. Cambiare endpoint richiede ricompilazione. In hosting HTTP remoto è rifiutato; TLS DB e trasporto SMTP dipendono dalla configurazione del servizio.

## HTTP, email e sessioni web

Better Auth è montato su `/auth/*`, con URL costruiti dalla configurazione e non dall'header Host. `Set-Cookie` è preservato come header multiplo. `/auth/status` espone solo `{configured,emailConfigured}`; `/auth/me` restituisce solo `{user,expiresAt}`, con profilo validato. Nessun token nei DTO Nexus o in localStorage.

Cookie HttpOnly, Secure su HTTPS e SameSite Lax, nessun dominio globale. Cache cookie auth disabilitata; le API ricontrollano la sessione persistita. Sessione di sette giorni con aggiornamento dopo un giorno; logout revoca la sessione corrente, reset revoca tutte le precedenti. Verifica email obbligatoria, nessun login automatico prima/dopo la verifica; link verifica un'ora e reset 15 minuti. Risposta di reset neutra per indirizzi inesistenti. [Email/password](https://better-auth.com/docs/authentication/email-password), [sessioni](https://better-auth.com/docs/concepts/session-management).

CORS auth ammette soltanto origini esatte web/server e protocollo desktop configurato; credenziali soltanto su auth. Gli asset pubblici accettano anche la propria origine server, senza credenziali. CSRF e controllo Origin restano attivi. IP per rate limit ricavato dalla connessione, senza fidarsi degli header inviati dal client. Registrazioni, login, reinvio e reset hanno limiti specifici.

SMTP realmente ricevuto da Mailpit nelle prove. Gli hook attendono l'invio; un contesto AsyncLocalStorage per richiesta segnala anche i fallimenti che la libreria intercetta internamente. Errori SMTP sanitizzati e risposta 503 recuperabile, preflight comune per richieste email e durata minima 500 ms come mitigazione dell'enumerazione temporale, non garanzia di tempi identici. Nessun URL/token di verifica/reset o errore grezzo SMTP nei log. Nessuna coda di invio durevole aggiunta in T03.

## Desktop: protocollo e segreti

Plugin ufficiale `@better-auth/electron`, client ID `nexus-desktop`, protocollo OS **`io.github.andreazero.nexusai`**. Callback effettivo della release: `io.github.andreazero.nexusai://auth/callback#token=…`. È distinto da `nexus://app`, protocollo dei file del renderer. Il browser conserva PKCE/state lungo registrazione/verifica/accesso e richiede esplicitamente il ritorno al desktop. [Integrazione ufficiale](https://better-auth.com/docs/integrations/electron).

Il main usa `requestAuth`/`authenticate` del plugin; i bridge generici, modifiche CSP, protocol handler e proxy immagini automatici del plugin sono disattivati. Nexus espone solo `getState`, `signIn`, `cancelSignIn`, `signOut` e sottoscrizione DTO; ogni invoke verifica mittente, main frame, URL e numero di argomenti. Parser callback ristretto, tentativo singolo di cinque minuti, stato corrente richiesto, consumo prima dello scambio asincrono, rifiuto replay/callback spontanee. Codice server valido due minuti.

La release 1.7.10 non offre cancellazione pubblica di PKCE e `requestAuth` restituisce void. `auth-attempt.ts` isola la dipendenza dal registro `Symbol.for('better-auth:electron')` della release fissata, per rimuovere il verifier quando si annulla/scade il tentativo. Nessuna generazione PKCE alternativa. **Prima di aggiornare il plugin riesaminare questo contratto di sorgente e i relativi test.**

Credenziali nel solo main, cifrate con `safeStorage` e file sostituito atomicamente sotto `app.getPath('userData')`. La storage API sincrona del plugin è adattata tramite cache privata e barriera di flush; la sessione non viene dichiarata persistita prima della scrittura. Cifratura assente o backend Linux `basic_text` producono un errore, senza fallback in chiaro. Il comando **Sign out on this device** permette di cancellare dati locali corrotti/non leggibili; se il server è offline si dichiara esplicitamente che la revoca remota non è confermata. Firma/macOS Keychain e protocollo OS restano da provare sul Mac. [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Evidenze e limiti

- `pnpm check`, 29 test di dominio, build workspace e pacchetto Windows 0.3.0, smoke dell'eseguibile impacchettato passati.
- `pnpm verify:accounts` su PostgreSQL/Mailpit reali: origine estranea negata, registrazione, verifica, rifiuto prima della verifica, profilo sanitizzato, risposta neutra di reset, token reset monouso, revoca/reset/logout e scadenza sessione. Fixture rimossa.
- `pnpm verify:auth-desktop` in Electron con profilo temporaneo isolato: SMTP reale, scambio PKCE ufficiale, callback duplicata ignorata, cifratura OS, ricostruzione del client con sessione ripristinata e revoca server efficace. Fixture rimossa dal coordinatore. Il browser OS è intercettato nel test; l'apertura/rientro tramite installer resta parte della prova umana.
- Pagine account, link e Settings controllati nel browser reale; corretto il rifiuto CORS degli asset same-origin emerso nella prova. [Login](design/captures/t03-sign-in.jpg) e [registrazione](design/captures/t03-sign-up.jpg) sono catture responsive a 654 × 653, con scroll verticale previsto. Le pagine account non compaiono nelle PNG originali e sono composizioni nuove nello stesso sistema visivo.
- Regressione del trasferimento browser verificata con il vero redirect plugin di Better Auth e il proxy Electron: nessun reload HTTP, callback OS prodotto e cookie temporaneo consumato. Il test intercetta la navigazione, quindi non dimostra l'apertura nativa sul sistema del maintainer.
- Prova manuale Windows T03 pendente; macOS/Linux non provati nativamente. Nessun deploy, account esterno/email a pagamento o runtime Codex introdotto.

Gli harness di integrazione richiedono backend/Mailpit attivi, creano solo account QA locali temporanei e non vanno eseguiti contro servizi remoti. Il test desktop salva soltanto ID/email del fixture nel report ignorato da Git: il coordinatore elimina quelle righe specifiche dopo la prova. I comandi di test non espongono password o link email.
