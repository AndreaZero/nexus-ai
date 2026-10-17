# Stato operativo

Aggiornato: **17 ottobre 2026**. **T05 implementato e consegnato per verifica personale Windows**. T01–T03 accettati dal maintainer; T04 consegnato con prova manuale ancora distinta. T06 non avviato.

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

## Evidenze T05

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
| Prova personale | **Pendente:** login Codex/keyring, risposta autenticata, interruzione e ripresa con account del maintainer. Catalogo anonimo e test di trasporto non dimostrano quota/diritti di inferenza |
| macOS/Linux | Configurazioni native presenti; packaging, keyring e inferenza non provati qui |

Rapporti locali `.nexus/visual/t05/`: runtime, runtime impacchettato e smoke. L'home QA anonima viene eliminata dopo lo shutdown; account reale e profili delle altre app conservati. I test di servizio usano trasporto controllato e non sono descritti come inferenza.

## Continuità T04

T04 implementa workspace/progetti PostgreSQL, membri/ruoli, inviti SMTP monouso, repository remoti e binding locale separato. Migrazione additiva `0001_collaboration.sql`, 42 test, 12 scenari reali PG/SMTP/HTTP con tre account temporanei e pacchetto Windows 0.4.0/smoke passati. Fixture rimossi, unico account reale conservato. Form autenticati, invito con secondo account e selettore cartella nativo restano da prova manuale secondo [collaboration.md](collaboration.md). L'autorizzazione a T05 non è un'accettazione implicita di quei passi.

## Prossimo passo del maintainer

Chiudere app/backend precedenti, eseguire `pnpm install --frozen-lockfile` e `pnpm package:win`, riavviare `pnpm start:server` e app aggiornata oppure `pnpm start:desktop`. PostgreSQL e `.env` esistenti vanno bene. Mailpit una sola istanza per email Nexus/inviti; non riceve il login Codex.

Seguire [prova personale T05](codex.md#prova-manuale-t05): Connect Codex → Sign in with ChatGPT, setup sandbox Windows esplicito, cartella collegata in Repos, modello e domanda sui file in AI Session. Verificare streaming, interruzione, nuovo messaggio e riapertura dello stesso thread. Login personale nella finestra ufficiale; nessuna password o API key da inviare in chat.

Registrare feedback prima di avviare T06. Firma/notarizzazione/hosting restano T16. Modalità offline avanzata T08: per T05 il backend deve essere raggiungibile per riaccertare sessione e ruolo.
