# Nexus AI

Workspace open source per sviluppare con Codex e condividere in tempo reale il lavoro con colleghi e clienti.

App desktop **Windows, macOS e Linux**, runtime Codex sulla macchina dello sviluppatore, server condiviso ospitato e accesso web per osservatori e collaboratori. Ogni sviluppatore usa il proprio account Codex/ChatGPT. L'interfaccia segue le tre reference in [`examples/design/`](examples/design/).

## Stato del progetto

**T01 e T02 accettati dal maintainer su Windows; T03 avviato.** La prima consegna T03 prepara PostgreSQL locale e il contratto auth prima di introdurre account/persistenza: [preparazione database](docs/setup/postgresql.md). Le shell Overview, Client & Team Pulse e AI Session riprendono griglie, palette, font, pianeta e particelle delle reference. I dati di progetto arriveranno nei task successivi. Packaging macOS/Linux configurato, prove native ancora da eseguire sui rispettivi sistemi. [Confronto visivo T02](docs/design/t02-review.md).

Da questa cartella, con Node 22.19+ della serie 22 o Node 24 e pnpm 10.32.1:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm package:win
```

`package:win` va eseguito su Windows e produce l'installer unsigned in `release/win/`. `pnpm dev:desktop` avvia server locale, renderer e app; `pnpm start:desktop` apre la build compilata. Per Mac/Linux usare `pnpm package:mac`/`pnpm package:linux` sul relativo sistema. I dettagli e la verifica dello step sono in [CONTRIBUTING.md](CONTRIBUTING.md).

- [Indice documentazione](docs/README.md)
- [Prodotto e requisiti](docs/product.md)
- [Architettura](docs/architecture.md)
- [Piano di lavoro e task](docs/plan.md)
- [Stato e prossimo passo](docs/status.md)
- [Specifiche design](docs/design/README.md)
- [Regole agenti](AGENTS.md)
- [Skill di coordinamento](.agents/skills/nexus-coordination/SKILL.md)
- [Contribuire e verificare le build](CONTRIBUTING.md)
- [Task T03 — identità e persistenza](https://github.com/AndreaZero/nexus-ai/issues/3)

## Metodo

Una tranche alla volta, sviluppo parallelo con ownership separate, integrazione del coordinatore e verifica manuale del maintainer. Ogni tranche aggiunge funzionalità definitive alla stessa app. Niente demo separate, simulazioni live in produzione o riscritture pianificate di un prototipo.

Le verifiche automatiche sono mirate ai rischi reali. Le build e le prove manuali delle piattaforme vengono eseguite dal maintainer e registrate distinguendo ciò che è stato verificato da ciò che resta da verificare.

## Licenza

[MIT](LICENSE). Repository: [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai).
