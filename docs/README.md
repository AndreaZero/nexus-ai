# Documentazione Nexus AI

La documentazione distingue **requisiti dell'utente**, **decisioni progettuali proposte** e **comportamenti verificati**. T01 e T02 sono accettati su Windows. T03 parte dalla preparazione PostgreSQL richiesta dal maintainer, prima di introdurre account e persistenza. Stato corrente in `status.md`, setup/build in `../CONTRIBUTING.md`.

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
| [Contratto auth T03](auth.md) | Better Auth/Drizzle, accesso web e desktop, email, confini e criteri di verifica |

Le documentazioni tecniche indicano la struttura da implementare, non API o tabelle già esistenti. Il piano e lo stato sono le sole fonti operative di avanzamento. Il changelog descrive cambiamenti consegnati; le decisioni spiegano scelte durevoli.
