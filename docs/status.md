# Stato operativo

Aggiornato: **17 ottobre 2026**. **T03 implementato e consegnato per verifica Windows del maintainer** ([issue #3](https://github.com/AndreaZero/nexus-ai/issues/3)). T01 e T02 già accettati su Windows. T04 non avviato.

## Correzione dal feedback Windows

Il maintainer segnala desktop fermo su “Complete sign-in” anche dopo **Continue in Nexus AI**. Individuato un conflitto nel browser: `transferUser` riceveva un `callbackURL` web, quindi il redirect plugin predefinito di Better Auth ricaricava `/desktop-auth` prima che il timer Electron potesse aprire il protocollo OS. La richiesta ora omette quel redirect e lascia consumare il cookie al proxy ufficiale. Nessuna modifica a credenziali, account o confini IPC.

Test di regressione con i client/plugin ufficiali 1.7.10: nessuna navigazione HTTP durante il trasferimento, invocazione del callback OS e consumo del cookie temporaneo. Test, lint e build web passati. La pagina corretta richiede il riavvio del backend compilato, che registra gli asset statici all'avvio, e una nuova richiesta desktop; rientro OS manuale ancora da confermare. Correzione del coordinatore limitata al browser, nessun fronte parallelo necessario.

## Risultato T03

- PostgreSQL locale predisposto dal maintainer: server **18.1**, DB/ruolo `nexus_ai_dev`, UTF8 e ownership `public` corretta; login reale verificato senza mostrare credenziali.
- Pool Node-only, schema Drizzle e cinque tabelle auth; migrazione esplicita applicata e seconda applicazione senza duplicazioni. Nessun account iniziale o progetto fittizio.
- Better Auth 1.7.10: registrazione, email verificata obbligatoria, login, sessioni persistenti, logout, reset monouso e revoca delle sessioni precedenti. CORS/CSRF, rate limit DB, DTO sanitizzati e errori SMTP recuperabili.
- SMTP Mailpit **1.31.6** locale scelto dal maintainer, archivio ufficiale SHA-256 verificato. Helper loopback senza inoltro esterno; secret auth aggiunto una sola volta al `.env` privato, conservando DATABASE_URL. Ripulita la credenziale accidentalmente copiata nel template pubblico prima della pubblicazione.
- Pagine account browser e card Nexus nelle impostazioni; runtime Codex separato e non collegato. Shell T02 preservate, workspace/membership in T04.
- Desktop: browser di sistema, plugin ufficiale PKCE/state, callback e IPC ristretti, storage OS cifrato/atomico e ripristino verificato col server. Nessun token/cookie nel renderer Electron.
- Versione desktop/web/server/contratti/DB **0.3.0**; UI resta 0.2.0 e bridge Codex 0.1.0. Installer Windows unsigned generato, non installato automaticamente.

## Ownership concluse

| Fronte | Agente | Percorsi integrati |
| --- | --- | --- |
| Backend T03 | `/root/t03_server` | `apps/server/src/**`: configurazione, auth/SMTP, HTTP/statico e test; correzione CORS asset verificata |
| Desktop T03 | `/root/t03_desktop` | `apps/desktop/src/**`, `test/**`, build script e config protocollo: auth, storage, IPC e harness |
| Web T03 | `/root/t03_web` | `apps/web/src/auth/**`, App e Settings: pagine account e stato profilo |
| DB/contratti/integratore | Coordinatore | Schema/migrazioni, contratti, manifest/lockfile, setup/Mailpit, prove reali, documenti e pubblicazione |

Tutti i fronti integrati e ownership rilasciate. Skill usata `.agents/skills/nexus-coordination/SKILL.md`; nessuna nuova chat utente creata e nessun task T04–T16 avviato.

## Evidenze

| Ambito | Esito |
| --- | --- |
| `pnpm check` | Passato: TypeScript, lint e confini renderer (34 sorgenti); controlli mirati ripetuti dopo correzione CORS/web |
| `pnpm test` | **29/29**: DB 3, desktop 11, server 13, confini 2. SMTP e scritture atomiche eseguiti fuori sandbox; renderer sempre sandboxed |
| Build e packaging Windows | Passati; installer `release/win/Nexus-AI-0.3.0-win-x64.exe`, **115559968 byte**, Authenticode NotSigned |
| Smoke pacchetto Windows | Exit 0: renderer montato, IPC validato, CSP presente e Node non disponibile |
| PostgreSQL / migrazioni | Connessione reale, schema applicato e seconda applicazione senza duplicazioni; nessuna creazione cluster/ruoli/DB da parte degli agenti |
| `pnpm verify:accounts` | Passato su PostgreSQL/Mailpit: origin negata, verifica obbligatoria, login, profilo sanitizzato, reset neutro/monouso, revoca e scadenza |
| `pnpm verify:auth-desktop` | Exit 0: SMTP reale, PKCE, replay ignorato, cifratura Windows, ricostruzione del client con sessione ripristinata e revoca server |
| Browser reale | Login/registrazione/recupero/link/Settings controllati; corretto rifiuto CORS dei moduli/CSS same-origin. Catture in `docs/design/captures/t03-*.jpg` |
| Pulizia QA | Account temporanei e messaggi SMTP specifici eliminati; verifica finale: **0 utenti applicativi**, nessun account demo lasciato |
| Prova umana Windows T03 | Pendente: installazione, apertura/rientro OS dal browser, riapertura, logout e reset secondo `docs/auth.md` |
| macOS/Linux | Configurazioni presenti, prove native di packaging/protocollo/keyring non eseguite qui |
| CI T03 | Consultare la run del commit pubblicato; non dedurre esito dalla sola configurazione. CI T02 passata sui tre OS |

Il primo harness desktop aveva completato i controlli ma falliva nella cancellazione del profilo di test per un file Electron ancora aperto. Corretto inizializzando la verifica prima della partizione persistente; riesecuzione mirata exit 0. Gli utenti di entrambe le prove sono stati rimossi. Il ritorno OS reale non viene dedotto dall'intercettazione controllata del browser nel test.

## Prossimo passo

Il maintainer segue [Account T03](auth.md) e [CONTRIBUTING.md](../CONTRIBUTING.md), ricompila o usa l'installer 0.3.0 e prova registrazione/verifica/login desktop/riapertura/logout/reset. Setup privato e migrazioni su questa macchina sono già eseguiti; i relativi comandi sono ripetibili senza sostituire i valori esistenti.

Backend e Mailpit sono servizi locali separati: avviarli con `pnpm start:server` e `pnpm mailpit`, poi aprire l'app. Inbox su `http://127.0.0.1:8025`. Nessun PostgreSQL reinstallato e nessuna password richiesta in chat. Registrare feedback e correggere eventuali difetti di T03 prima di T04.

Limiti: adattamento della cancellazione PKCE vincolato al sorgente plugin 1.7.10, da riesaminare prima di un upgrade; firma/keyring/protocollo Mac/Linux da provare sui relativi OS. Hosting/email esterna, runtime Codex, membership e storage allegati restano nei task successivi. Nessun deploy o servizio a pagamento creato.
