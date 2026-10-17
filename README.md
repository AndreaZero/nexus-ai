# Nexus AI

Workspace open source per sviluppare con Codex e condividere in tempo reale il lavoro con colleghi e clienti.

App desktop **Windows, macOS e Linux**, runtime Codex sulla macchina dello sviluppatore, server condiviso ospitato e accesso web per osservatori e collaboratori. Ogni sviluppatore usa il proprio account Codex/ChatGPT. L'interfaccia segue le tre reference in [`examples/design/`](examples/design/).

## Stato del progetto

**T07: workspace codice e approvazioni locali.** Diff Git reali split/unified, output progressivo, report TAP/Jest, preview configurata e apertura VS Code. ReadOnly iniziale, scrittura nel workspace per scelta esplicita e approvazioni singole del driver con scadenza. [Guida e prova T07](docs/session.md). Contesto, bozza cifrata e Share con preview T06 conservati; runtime ufficiale 0.159.2 incluso. Realtime T08, GitHub completo T12 e deploy T13: [mappa dati e funzioni](docs/product.md#da-dove-arrivano-i-dati-dei-pannelli). Evidenze, consegna e limiti di piattaforma in [stato](docs/status.md).

Da questa cartella, con Node 22.19+ della serie 22 o Node 24 e pnpm 10.32.1:

```sh
pnpm install --frozen-lockfile
# Dopo aver configurato DATABASE_URL nel proprio .env:
pnpm auth:setup
pnpm db:migrate
pnpm mailpit --install
pnpm package:win
```

`package:win` va eseguito su Windows e produce l'installer unsigned 0.7.0 in `release/win/`. Aggiornando da T06 non occorrono migrazioni; per una prima installazione applicare quelle esistenti con `pnpm db:migrate`. Account/progetti e `.env` conservati, nessun nuovo DB/secret. Arrestare app/server precedenti prima della build e riavviarli dopo. Tenere Mailpit e `pnpm start:server` in terminali distinti, poi aprire l'app o `pnpm start:desktop`. Inbox locale `http://127.0.0.1:8025`; login Codex personale distinto, ripreso automaticamente dal proprio keyring senza browser/inferenza automatici. Backend con [log Chalk](CONTRIBUTING.md#log-server-e-diagnosi). Mac/Linux: `pnpm package:mac`/`pnpm package:linux` sul relativo OS/architettura. Controlli `pnpm check`/`pnpm test` e dettagli in [CONTRIBUTING.md](CONTRIBUTING.md).

- [Indice documentazione](docs/README.md)
- [Prodotto e requisiti](docs/product.md)
- [Architettura](docs/architecture.md)
- [Piano di lavoro e task](docs/plan.md)
- [Stato e prossimo passo](docs/status.md)
- [Specifiche design](docs/design/README.md)
- [Regole agenti](AGENTS.md)
- [Skill di coordinamento](.agents/skills/nexus-coordination/SKILL.md)
- [Contribuire e verificare le build](CONTRIBUTING.md)
- [Task T04 — workspace e collaborazione](https://github.com/AndreaZero/nexus-ai/issues/4)
- [Task T05 — Codex locale e account personale](https://github.com/AndreaZero/nexus-ai/issues/5)
- [Task T06 — sessione, contesto e cronologia](https://github.com/AndreaZero/nexus-ai/issues/6)
- [Task T07 — diff, output e approvazioni locali](https://github.com/AndreaZero/nexus-ai/issues/7)

## Metodo

Una tranche alla volta, sviluppo parallelo con ownership separate, integrazione del coordinatore e verifica manuale del maintainer. Ogni tranche aggiunge funzionalità definitive alla stessa app. Niente demo separate, simulazioni live in produzione o riscritture pianificate di un prototipo.

Le verifiche automatiche sono mirate ai rischi reali. Le build e le prove manuali delle piattaforme vengono eseguite dal maintainer e registrate distinguendo ciò che è stato verificato da ciò che resta da verificare.

## Licenza

[MIT](LICENSE). Repository: [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai).
