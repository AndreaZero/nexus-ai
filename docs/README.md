# Documentazione Nexus AI

La documentazione distingue **requisiti dell'utente**, **decisioni progettuali proposte** e **comportamenti verificati**. T09 collega overview operativa, feed e notifiche reali alla presenza e al recupero T08. Prove automatiche, native e accettazione manuale sono distinte in `status.md`; setup/build in `../CONTRIBUTING.md`, runtime in `codex.md`, sessione in `session.md`, sincronizzazione in `realtime.md`, overview in `overview.md`.

| Documento | Uso |
| --- | --- |
| [Fonti](sources.md) | Conversazione recuperata, limiti del recupero e documentazione ufficiale |
| [Prodotto](product.md) | Big picture, ruoli, requisiti e completamento dell'app |
| [Architettura](architecture.md) | Desktop multipiattaforma, server, confini e struttura prevista |
| [Dati e protocollo](contracts.md) | Modello dati, eventi, comandi, autorizzazioni e consistenza |
| [Codex](codex.md) | Account, runtime locale, protocollo e approvazioni |
| [Piano](plan.md) | Tranche sequenziali, task, dipendenze e criteri di uscita |
| [Stato](status.md) | Situazione corrente, prossimo task e verifica del maintainer |
| [Decisioni](decisions.md) | Motivazioni e assunzioni tecniche da concretizzare |
| [Design](design/README.md) | Palette, tipografia, geometria, componenti e asset |
| [Schermate](design/screens.md) | Mappa completa delle tre reference e flussi collegati |
| [Movimento](design/motion.md) | Particelle, pianeta, wave, grafici, transizioni e prestazioni |
| [Token CSS](design/tokens.css) | Base dei valori trasferiti al package UI in T02 |
| [Registro asset](design/assets.md) | Origine, hash, elementi da costruire e criteri di accettazione |
| [Confronto T02](design/t02-review.md) | Catture reali della shell, geometria verificata e differenze residue |
| [PostgreSQL locale](setup/postgresql.md) | Database/ruolo dedicati, script manuale, configurazione e verifica prima della persistenza |
| [Account T03](auth.md) | Setup, migrazioni, Mailpit, accesso web/desktop, confini e prove eseguite |
| [Collaborazione T04](collaboration.md) | Workspace/progetti, ruoli, inviti, repository, cartella locale e verifica manuale |
| [Sessione T06/T07](session.md) | File/bozza, diff e output reali, report test, policy/approvazioni locali e pubblicazione esplicita |
| [Realtime T08](realtime.md) | Presenza, selezione/consenso live, outbox, recupero, revoca e prova a due account |
| [Overview T09](overview.md) | Reference3, feed/filtri/link, notifiche e lettura persistente, misure locali opt-in e prova |

Le documentazioni tecniche indicano la struttura da implementare, non API o tabelle già esistenti. Il piano e lo stato sono le sole fonti operative di avanzamento. Il changelog descrive cambiamenti consegnati; le decisioni spiegano scelte durevoli.
