# Stato operativo

Aggiornato: **17 ottobre 2026**. **T03 avviato: preparazione PostgreSQL e contratti auth**, multiagenti autorizzati. **T02 accettato su Windows**, build funzionante e UI approvata dal maintainer ([issue #2](https://github.com/AndreaZero/nexus-ai/issues/2)). T01 già accettato.

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
| T02 | Accettato Windows | Coordinatore | Build funzionante e UI approvata dal maintainer |
| T02 UI | Integrato, ownership rilasciata | `/root/t02_ui` | `packages/ui/src/**` escluso `effects/**`; token, primitive, logo e icone |
| T02 effetti | Integrato, ownership rilasciata | `/root/t02_effects` | `packages/ui/src/effects/**`; scene e lifecycle canvas |
| T02 layout | Integrato, ownership rilasciata | `/root/t02_layout` | `apps/web/src/shell/**`, `views/**`, `app.css`; griglie e correzioni misurate |
| T03 preparazione DB | Integrato, ownership rilasciata | `/root/t03_postgresql` | `docs/setup/postgresql.md`, `scripts/postgresql/prepare-local.psql`; istruzioni e SQL che eseguirà il maintainer |
| T03 contratti auth | Integrato, ownership rilasciata | `/root/t03_auth_design` | `docs/auth.md`; libreria/schema/flussi browser/desktop, versioni esatte da fissare prima del codice |
| T03 integrazione | Preparazione consegnata | Coordinatore | Stato/piano/decisioni, `.env.example`, GitHub, contratto configurazione e revisione comandi |

Due fronti paralleli con percorsi disgiunti; nessun agente installa o crea PostgreSQL e nessuna migrazione è applicata. T04–T16 non avviati. Skill usata: `.agents/skills/nexus-coordination/SKILL.md`.

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
| Prova umana T02 Windows | Passata: il maintainer conferma build funzionante e UI approvata |
| macOS/Linux | Configurazioni e icone presenti, prove native non eseguite qui. Il maintainer userà il Mac più avanti |
| CI T02 tre OS | Passata sul commit `187506b`: [run 39031526123](https://github.com/AndreaZero/nexus-ai/actions/runs/39031526123). Compilazione/check/test dei runner, non prova nativa dei pacchetti Mac/Linux |

Le verifiche Electron sono state eseguite fuori dal sandbox di esecuzione dopo che questo ne impediva l'avvio; nessun allentamento della sandbox del renderer o `--no-sandbox` introdotto. Screenshot QA con device scale 1 solo nel percorso `--verify-shell`, non nella normale app.

## Prossimo passo

Il maintainer prepara PostgreSQL T03 seguendo [la guida](setup/postgresql.md), prima di introdurre account e persistenza. Database UTF8 e ruolo dedicati `nexus_ai_dev`, connessione `127.0.0.1:5432`, PostgreSQL 18 aggiornato o 17 aggiornato già installato. Lo script manuale non crea tabelle applicative. Comunicare solo versione server ed esito delle query; proseguire T03 dopo la preparazione locale, senza richiedere credenziali in chat.

**Verifiche della preparazione T03:** rilevato client `psql 18.1` già installato; versione server non interrogata. Revisionati comandi e riferimenti ufficiali, senza installazioni, connessioni, creazione ruoli/DB o migrazioni. Nessuna dipendenza applicativa modificata e nessuna nuova build richiesta per questa consegna documentale. L'app continua a mostrare `not_connected` se `DATABASE_URL` è impostata: è il comportamento T01, non una prova PostgreSQL.

Hosting/email, runtime Codex, GitHub del prodotto, storage esterno e credenziali di firma saranno trattati nei rispettivi task. Nessun servizio a pagamento creato o chiave AI richiesta. Il repository del codice è [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai).
