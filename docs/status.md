# Stato operativo

Aggiornato: **17 ottobre 2026**. **T02 consegnato, in attesa di verifica visiva del maintainer** ([issue #2](https://github.com/AndreaZero/nexus-ai/issues/2)). T01 è accettato su Windows: il maintainer conferma che la build funziona ([issue #1 chiusa](https://github.com/AndreaZero/nexus-ai/issues/1)). T03 non avviato.

## Risultato T02

- Sistema visivo condiviso: token, componenti, tracciati SVG originali, font locali Inter/JetBrains Mono con OFL, icone native Windows/macOS/Linux.
- Shell definitive Overview, Client & Team Pulse e AI Session, con griglie e proporzioni delle reference a 1586 × 992. Stati vuoti reali; nessun progetto, membro, messaggio o indicatore di salute inventato.
- Pianeta/orbite nella sidebar, particelle Pulse, wave e mappa schematica. Canvas limitati a 30 fps/DPR 1.5, sospensione in background/fuori viewport e composizione statica con movimento ridotto.
- Sidebar, rotte e tab collegati; dialogo di navigazione Ctrl/⌘ K, notifiche vuote, preferenza movimento persistita e impostazioni con dati desktop/HTTP reali. Le funzioni successive restano disabilitate con motivazione.
- Versione desktop/renderer/UI **0.2.0**; server/contratti/DB/bridge restano 0.1.0, non modificati nel dominio. Nessuna migrazione o connessione PostgreSQL introdotta.
- Catture reali e differenze rispetto alle PNG in [confronto T02](design/t02-review.md). Il contenuto pieno delle reference sarà collegato nei task successivi; questa consegna verifica frame/componenti, non l'intera applicazione.

## Registro task e deleghe

| Task/fronte | Stato | Owner | Percorsi e integrazione |
| --- | --- | --- | --- |
| T00 | Completato | Coordinatore | Documenti, repository MIT pubblico e skill versionata |
| T01 | Accettato Windows | Coordinatore + desktop/server/renderer | Ownership concluse; base, sicurezza, health e packaging |
| T02 | Consegnato | Coordinatore | Routing, impostazioni, font/manifest/lockfile, icone native, QA, docs e pubblicazione |
| T02 UI | Integrato, ownership rilasciata | `/root/t02_ui` | `packages/ui/src/**` escluso `effects/**`; token, primitive, logo e icone |
| T02 effetti | Integrato, ownership rilasciata | `/root/t02_effects` | `packages/ui/src/effects/**`; scene e lifecycle canvas |
| T02 layout | Integrato, ownership rilasciata | `/root/t02_layout` | `apps/web/src/shell/**`, `views/**`, `app.css`; griglie e correzioni misurate |

Tre fronti paralleli con percorsi disgiunti; un solo autore per dipendenze/config condivise e integrazione. T03–T16 non avviati. Skill usata: `.agents/skills/nexus-coordination/SKILL.md`.

## Evidenze tecniche

| Ambito | Esito registrato |
| --- | --- |
| Toolchain | Windows x64, Node 22.19.0, pnpm 10.32.1, versioni esatte e lockfile |
| `pnpm check` | Passato: TypeScript, lint, confini renderer/UI/contratti (29 sorgenti); verifiche mirate durante integrazione |
| `pnpm test` | 16/16 passati dopo integrazione: DB/config, desktop origine/path/IPC, server health/CORS, import renderer |
| `pnpm build` | Passato, sette package/app; font e licenze inclusi nel renderer |
| `pnpm verify:shell` | Passato nel renderer Electron produzione: tre catture 1586 × 992, canvas inizializzati, nessun overflow orizzontale, Ctrl K/focus input, preferenza ridotta e Session 960 × 800 |
| Confronto PNG | Eseguito sulle tre viste; corretto wrapping sidebar e scroll Pulse. Catture in `docs/design/captures/`; limiti in `design/t02-review.md` |
| Packaging Windows | `pnpm package:win` passato; installer `release/win/Nexus-AI-0.2.0-win-x64.exe`, 113449222 byte, unsigned; non installato automaticamente |
| Eseguibile Windows impacchettato | Smoke exit 0: renderer montato, bridge validato, CSP e Node non disponibile. Log GPU alla chiusura del processo nascosto, senza errore dello smoke |
| Prova umana T02 Windows | Pendente: usare i cinque passi in `CONTRIBUTING.md`, soprattutto movimento normale/ridotto e riapertura |
| macOS/Linux | Configurazioni e icone presenti, prove native non eseguite qui. Il maintainer userà il Mac più avanti |
| CI tre OS | Workflow presente; verificare la run effettiva dopo il push, senza dedurne l'esito dalla configurazione |

Le verifiche Electron sono state eseguite fuori dal sandbox di esecuzione dopo che questo ne impediva l'avvio; nessun allentamento della sandbox del renderer o `--no-sandbox` introdotto. Screenshot QA con device scale 1 solo nel percorso `--verify-shell`, non nella normale app.

## Prossimo passo

Il maintainer esegue build/verifica Windows **T02** secondo [CONTRIBUTING.md](../CONTRIBUTING.md). Registrare feedback e correggere difetti di questo task prima di T03.

**PostgreSQL:** il maintainer creerà personalmente il DB locale quando richiesto. Non serve per T02. All'avvio di T03 definire libreria auth/schema, poi comunicargli versione supportata e istruzioni per database/utente dedicati e configurazione locale; non chiedere password nella chat.

Hosting/email, runtime Codex, GitHub del prodotto, storage esterno e credenziali di firma saranno trattati nei rispettivi task. Nessun servizio a pagamento creato o chiave AI richiesta. Il repository del codice è [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai).
