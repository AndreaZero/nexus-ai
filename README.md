# Nexus AI

Workspace open source per sviluppare con Codex e condividere in tempo reale il lavoro con colleghi e clienti.

App desktop **Windows, macOS e Linux**, runtime Codex sulla macchina dello sviluppatore, server condiviso ospitato e accesso web per osservatori e collaboratori. Ogni sviluppatore usa il proprio account Codex/ChatGPT. L'interfaccia segue le tre reference in [`examples/design/`](examples/design/).

## Stato del progetto

**T03 implementato, in attesa di verifica Windows del maintainer.** T01/T02 sono accettati. Sono operativi account Nexus, verifica email/reset via SMTP, sessioni PostgreSQL e accesso desktop tramite browser con storage cifrato. Setup e prova in [Account T03](docs/auth.md); le shell approvate restano preservate. Workspace/progetti arrivano in T04, Codex in T05. Packaging macOS/Linux configurato, prove native ancora da eseguire sui rispettivi sistemi.

Da questa cartella, con Node 22.19+ della serie 22 o Node 24 e pnpm 10.32.1:

```sh
pnpm install --frozen-lockfile
# Dopo aver configurato DATABASE_URL nel proprio .env:
pnpm auth:setup
pnpm db:migrate
pnpm mailpit --install
pnpm package:win
```

`package:win` va eseguito su Windows e produce l'installer unsigned 0.3.0 in `release/win/`. Per provarlo, tenere `pnpm mailpit` e `pnpm start:server` in due terminali, poi aprire l'app o eseguire `pnpm start:desktop`. Inbox locale: `http://127.0.0.1:8025`. Le migrazioni non partono automaticamente. Per Mac/Linux usare `pnpm package:mac`/`pnpm package:linux` sul relativo sistema. Controlli `pnpm check`/`pnpm test` e dettagli in [CONTRIBUTING.md](CONTRIBUTING.md).

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
