# Nexus AI

Workspace open source per sviluppare con **Codex locale** e condividere il lavoro con colleghi e clienti. Desktop Windows, macOS e Linux; renderer web comune e server Nexus per account, progetti, cronologia pubblicata e collaborazione.

La base **0.17.0** comprende il piano T01–T16 e l’onboarding guidato T17: sessioni, contesto, diff e approvazioni locali; realtime e presenza; task, roadmap, documenti e consegne; Git/GitHub; ambienti e health; ricerca, notifiche e impostazioni. L'interfaccia segue le [tre reference](examples/design/). Le animazioni sono ricostruzioni documentate e i pannelli si popolano soltanto con dati effettivi.

L'implementazione e l'accettazione restano distinte: risultati automatici e package effettivamente prodotti sono nello [stato](docs/status.md), prove personali e native residue nella [matrice R01–R16](docs/acceptance.md). Dopo T16 il maintainer ha autorizzato T17, la guida dal primo accesso alla prima sessione. Ulteriori task richiedono un nuovo via. Il server ospitabile non viene distribuito automaticamente su un servizio esterno.

## Build Windows dal checkout già configurato

Chiudere la precedente app e il terminale del server. Conservare il proprio `.env`, database e account. Requisiti: Node **22.19+ della serie 22 oppure 24**, pnpm **10.32.1**, Git e PostgreSQL locale configurato.

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm package:win
```

Installer in `release/win/Nexus-AI-0.17.0-win-x64.exe` su Windows x64. In assenza di credenziali di firma il package è **unsigned**. Le migrazioni sono esplicite; il DB locale aggiornato contiene nove migrazioni fino a `0008_application`. Per un nuovo clone seguire il [setup completo](CONTRIBUTING.md#setup-locale).

Avviare in terminali separati, senza duplicare Mailpit se è già attivo:

```powershell
pnpm mailpit
```

```powershell
pnpm start:server
```

```powershell
pnpm start:desktop
```

Si può aprire l'app installata al posto dell'ultimo comando. Mailpit trattiene le email locali nell'[inbox](http://127.0.0.1:8025), senza inviarle al proprio indirizzo esterno. Un server pubblico richiede SMTP reale: [self-host](docs/self-host.md). Login Nexus e login personale Codex sono separati; le credenziali Codex restano sul dispositivo.

## Documentazione

- [Guida iniziale, primo progetto e prima sessione Codex](docs/onboarding.md)
- [Setup, comandi e prove manuali](CONTRIBUTING.md)
- [Indice delle guide](docs/README.md), [architettura](docs/architecture.md) e [requisiti](docs/product.md)
- [Design e confronto finale](docs/design/t15-review.md)
- [Self-host, backup e upgrade](docs/self-host.md)
- [Package nativi, firma e release](docs/release.md)
- [Stato delle verifiche](docs/status.md) e [accettazione R01–R16](docs/acceptance.md)
- [Regole agenti](AGENTS.md) e [skill di coordinamento](.agents/skills/nexus-coordination/SKILL.md)

`pnpm package:mac` e `pnpm package:linux` richiedono il rispettivo sistema operativo e producono l'architettura dell'host. Configurazione e workflow CI non sostituiscono la prova nativa: il maintainer proverà macOS dal Mac quando disponibile.

## Licenza

[MIT](LICENSE). Dipendenze e runtime conservano le [proprie licenze](THIRD_PARTY_NOTICES.md). Repository: [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai).
