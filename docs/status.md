# Stato operativo

Aggiornato: **17 ottobre 2026**. Fase: **T01 implementato, in attesa di verifica utente**. Il maintainer ha autorizzato T01 con multiagenti; i tre fronti sono integrati. T02 non avviato.

## Risultato della preparazione

- Recuperati cinque turni leggibili della conversazione e incorporata la scelta esplicita desktop Windows/macOS/Linux. Limiti delle risposte assistente dichiarati in `sources.md`.
- Ispezionate le tre PNG originali, rilevate dimensioni/hash e preparate specifiche di layout, palette, componenti, asset, particelle, grafici e movimento inferito.
- Scritti requisiti, architettura proposta, dati/eventi, integrazione Codex e piano T00–T16.
- Predisposti regole agenti, coordinamento per ownership, contributi e registro verifiche per OS.

- Creato il repository pubblico MIT [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai), con base versionata sul branch `main`.
- Creata e validata la skill `.agents/skills/nexus-coordination/`; discovery locale al repository, nessuna installazione globale richiesta.
- Verificati 19 documenti Markdown, 43 collegamenti locali, i tre hash PNG, i due file YAML e il whitespace Git. Nessun errore residuo nei controlli documentali.
- Aperto il primo task operativo [T01 — issue #1](https://github.com/AndreaZero/nexus-ai/issues/1), pronto senza avviare l'implementazione.

## Risultato T01

- Monorepo a otto progetti (root più sette workspace), versioni esatte e lockfile; TypeScript strict, lint e controllo dei confini degli import.
- Renderer comune React/Vite e primitive UI minime. Stato iniziale reale, dati desktop via bridge validato, health HTTP con timeout/retry e stati non configurato/offline.
- Electron main/preload isolati, protocollo `nexus://app`, controllo path/symlink/origini/frame e permessi negati per default. Nessuna API generica di shell/filesystem esposta.
- Fastify con `/health`, CORS per origini esatte, errori senza echo di input sensibili, configurazione PostgreSQL senza connessioni simulate e shutdown.
- Comandi dev/build/check/test e packaging nativo per i tre OS. Installer Windows unsigned generato in `release/win/Nexus-AI-0.1.0-win-x64.exe` e programma in `release/win/win-unpacked/Nexus AI.exe`; artefatti esclusi da Git.
- CI check/test/build per Windows/macOS/Linux aggiunta. La presenza del workflow non dimostra l'esito dei runner: consultare la run effettiva dopo il push.

## Prossimo passo

Il maintainer esegue la verifica Windows di **[T01 — issue #1](https://github.com/AndreaZero/nexus-ai/issues/1)** con i comandi e i passi in `CONTRIBUTING.md`. Registrare il suo esito; correggere eventuali difetti di T01 prima di passare a **T02 — Sistema visivo e shell definitiva**. Il codice è implementato, ma l'accettazione manuale e le prove native Mac/Linux sono evidenze ancora distinte.

## Registro task e deleghe

| Task | Stato | Owner | Fronti/file riservati | Esito integrazione |
| --- | --- | --- | --- | --- |
| T00 | Completato | Coordinatore | Nessuna ownership di sviluppo attiva | Documentazione e skill verificate, base pubblicata |
| T01 | Implementato; verifica utente pendente | Coordinatore | Ownership di integrazione conclusa | Check/test/build e pacchetto Windows verificati |
| T01 desktop | Integrato | `/root/desktop` | Ownership rilasciata | Main/preload, sicurezza, build e packaging |
| T01 server | Integrato | `/root/server` | Ownership rilasciata | Fastify, health/config e confine DB |
| T01 renderer | Integrato | `/root/renderer` | Ownership rilasciata | Renderer comune e stato iniziale reale |

T02–T16 sono pianificati e non avviati. Nessuna delega di sviluppo ancora attiva. Dipendenze condivise, contratti e pubblicazione sono stati gestiti dal coordinatore.

## Evidenze build e prove

| Ambito | Stato | Evidenza |
| --- | --- | --- |
| Toolchain Windows | Verificata | Node 22.19.0 x64, pnpm 10.32.1; dipendenze esatte nel lockfile |
| `pnpm check` | Passato | Typecheck, lint e confini renderer/UI/contratti, nove file sorgente controllati |
| `pnpm test` | 16/16 passati | Tre test DB, tre desktop, otto server/config, due confini import; dopo correzione API logging ripetuti solo i controlli server pertinenti |
| `pnpm build` | Passato | Sette package/app compilati in ordine di dipendenza |
| Electron Windows | Passato | Smoke produzione e dev Vite: mount renderer, schema bridge, CSP, capability e assenza di Node |
| Server e dev | Passati | Avvio reale Vite/Fastify, `/health` via HTTP, arresto con porte 3001/5173 libere |
| Packaging Windows | Passato | `pnpm package:win`, installer NSIS x64 di circa 113 MB, Authenticode `NotSigned`; smoke eseguibile impacchettato exit 0. Installer non installato automaticamente |
| Prova Windows del maintainer | Pendente | Comandi e checklist in `CONTRIBUTING.md` |
| macOS | Configurato, non provato qui | DMG arm64/x64; build nativa dal Mac del maintainer più avanti |
| Linux | Configurato, non provato qui | AppImage x64; build/prova da registrare sul relativo sistema |
| UI contro reference | T02 e task seguenti | Solo schermata iniziale T01; nessuna corrispondenza completa con le tre PNG ancora dichiarata |

## Dipendenze future

Nessun blocco tecnico residuo di T01 sulla piattaforma verificata. Hosting/email, account integrazione GitHub, storage esterno e credenziali di firma verranno configurati nei task interessati. Nessun servizio a pagamento creato; nessuna credenziale AI richiesta/usata per T01. Gli asset finali di brand e l'interfaccia delle reference iniziano con T02.

## Formato degli aggiornamenti successivi

Aggiornare questo file nello stesso cambiamento del task: obiettivo corrente, owner e percorsi, comportamento consegnato, controlli effettivamente eseguiti, build utente per OS, problemi residui e prossimo task. Tenere solo lo stato utile alla ripresa; la storia dei cambiamenti sta nel changelog e nei commit.
