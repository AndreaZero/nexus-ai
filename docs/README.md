# Documentazione Nexus AI

Base applicativa **0.17.0**, base T01–T16 e onboarding T17. Le guide descrivono i comportamenti implementati; [stato](status.md) e [accettazione](acceptance.md) distinguono controlli automatici, package, prova personale e risultati per piattaforma. Dopo la consegna T16 è stato autorizzato T17, limitato al percorso iniziale guidato.

| Documento | Uso |
| --- | --- |
| [Onboarding](onboarding.md) | Primo accesso, workspace/progetto, cartella locale, Codex e prima risposta |
| [Contribuire](../CONTRIBUTING.md) | Setup locale, build, comandi e controlli proporzionati |
| [Self-host](self-host.md) | Container, SMTP, HTTPS/proxy, readiness, migrazioni, backup/restore e upgrade |
| [Release](release.md) | Package Windows/macOS/Linux, CI, checksum, firma e notarizzazione |
| [Stato](status.md) | Evidenze effettive, ownership e limiti della consegna finale |
| [Accettazione](acceptance.md) | Matrice R01–R16 e prove personali/native ancora distinte |
| [Prodotto](product.md) | Obiettivo, ruoli, requisiti e fonti reali dei pannelli |
| [Architettura](architecture.md) | Confini desktop/server/web, dati locali e servizi ospitabili |
| [Dati e protocollo](contracts.md) | Schemi, autorizzazioni, comandi, eventi e consistenza |
| [Codex](codex.md) | Runtime ufficiale0.159.2, account personale, protocollo e approvazioni |
| [PostgreSQL locale](setup/postgresql.md) | Database/ruolo dedicati e preparazione manuale |
| [Account](auth.md) | Identità Nexus, Mailpit, login browser/desktop e recupero |
| [Collaborazione](collaboration.md) | Workspace/progetti, membri, inviti e binding della cartella |
| [Sessione](session.md) | Contesto scelto, diff/output/test, policy e pubblicazione esplicita |
| [Realtime](realtime.md) | Presenza, condivisione selezionata, outbox, recupero e revoca |
| [Overview](overview.md) | Reference3, feed/notifiche, health e metriche locali opt-in |
| [Pulse](pulse.md) | Reference1, milestone, progressi, outcome, feedback e audience cliente |
| [Lavoro e consegne](work.md) | Task/roadmap, documenti/update, allegati, revisioni e feedback |
| [Git/GitHub](repositories.md) | Commit/branch/sync, token cifrati, PR/review e webhook |
| [Ambienti e deploy](deployments.md) | Registrazioni manuali, URL reali, health con TTL e preview isolata |
| [Ricerca e impostazioni](application.md) | Ricerca autorizzata, notifiche, preferenze e connessione self-host |
| [Design](design/README.md) | Palette, tipografia, geometrie, componenti ed effetti |
| [Schermate](design/screens.md) e [movimento](design/motion.md) | Mappa delle tre PNG e comportamento delle animazioni |
| [Token CSS](design/tokens.css) e [asset](design/assets.md) | Valori, origini, licenze e ricostruzioni |
| [Confronto finale T15](design/t15-review.md) | Catture controllate, geometrie, accessibilità e limiti visivi |
| [Piano](plan.md), [decisioni](decisions.md) e [fonti](sources.md) | Sequenza completata, motivazioni e tracciabilità |

Le sezioni storiche T03–T12 documentano le verifiche della rispettiva consegna. Per versione, comandi operativi e stato finale prevalgono questa guida, CONTRIBUTING, self-host, release e status. I fixture dei verifier non vengono caricati nell'app distribuita; un nuovo progetto mantiene stati vuoti finché non vengono creati o pubblicati dati reali.
