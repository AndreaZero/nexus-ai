# Decisioni progettuali

Stato iniziale al 17 ottobre 2026. Le scelte tecniche qui proposte sono modificabili prima del task che le concretizza, senza riprogettare l'obiettivo di prodotto. Le richieste dell'utente restano vincolanti.

| ID | Stato | Decisione e motivazione |
| --- | --- | --- |
| D01 | Richiesta utente | Desktop Windows/macOS/Linux; le build macOS saranno provate dal maintainer sul Mac più avanti |
| D02 | Richiesta utente | Solo Codex; account personale principale, API opzionale; server ospitato e inviti |
| D03 | Adottata in T01 | Monorepo TypeScript, pnpm, React/Vite per renderer condiviso, Electron per runtime desktop: una lingua e componenti comuni per un singolo maintainer |
| D04 | Bootstrap Fastify adottato in T01; persistenza/realtime futuri | Fastify, PostgreSQL e Drizzle; REST per snapshot/mutazioni e WebSocket per eventi. Un backend modulare prima di servizi separati |
| D05 | Proposta operativa | Better Auth per identità Nexus con email/password, verifica email, reset e inviti; sessione desktop tramite flusso browser supportato. L'identità Nexus è distinta dall'autenticazione Codex |
| D06 | Proposta operativa | Codex app-server locale via stdio, login ufficiale gestito da Codex e home dedicata a Nexus. Nessuna lettura dell'auth store di altre applicazioni |
| D07 | Proposta operativa | Eventi durevoli in PostgreSQL e outbox transazionale; presenza effimera. Nessun Redis obbligatorio all'inizio: la voce Redis nelle PNG appartiene al progetto illustrativo |
| D08 | Proposta operativa | Accesso web con renderer condiviso e capacità esplicite del dispositivo; nessuna shell nel browser |
| D09 | Proposta operativa | Asset ambientali procedurali SVG/canvas e componenti accessibili; Inter per UI e JetBrains Mono per codice, perché il font originale non è ricavabile dalle PNG |
| D10 | Default scelto per la richiesta open source | Repository pubblico `AndreaZero/nexus-ai`, licenza MIT e documentazione di lavoro in italiano, codice e identificatori in inglese |
| D11 | Richiesta utente | Una tranche attiva, fronti paralleli disgiunti, integrazione unica, controlli mirati e build manuali del maintainer |
| D12 | Proposta operativa | Cliente vede solo proiezioni esplicitamente pubblicate; approvazione deliverable separata dall'esecuzione Codex; solo driver locale controlla il proprio runtime |
| D13 | Preparazione T03 adottata | PostgreSQL locale 18 aggiornato, alternativa 17 aggiornata già installata; database UTF8 e ruolo dedicati `nexus_ai_dev`, host `127.0.0.1:5432`. Il maintainer crea personalmente il DB vuoto; script manuale con password interattiva, nessuna tabella o migrazione all'avvio dell'app |

## Da concretizzare al momento opportuno

- **T01 implementato:** versioni effettive fissate nel lockfile e riepilogate in `CONTRIBUTING.md`; app ID `io.github.andreazero.nexusai`. Packaging NSIS x64, DMG arm64/x64 e AppImage x64; Windows generato/verificato, altre prove native da registrare.
- **T05–T07:** versione Codex compatibile, modalità di credenziali disponibili sui tre OS, isolamento configurazione e comportamento delle approvazioni sul runtime installato. Verifica come parte dell'integrazione definitiva, senza un'app dimostrativa separata.
- **T03/T16:** URL server, servizio email per verifica/reset/inviti e provider PostgreSQL/object storage. Preparare configurazione self-host senza impegnare servizi a pagamento non richiesti.
- **T03 avviato:** [preparazione PostgreSQL](setup/postgresql.md) e [contratto auth](auth.md). Better Auth + adapter Drizzle/PostgreSQL e integrazione Electron ufficiale sono il percorso selezionato; dipendenze/versioni esatte e API vengono fissate nella successiva implementazione, dopo preparazione DB. Nessun account o pool implementato da questa sola decisione.
- **T12/T16:** account GitHub App/OAuth, segreti, domini, firma e notarizzazione delle build richiedono credenziali/configurazioni reali del maintainer quando si arriva al relativo task.

Le dipendenze esterne vengono segnalate per il task interessato senza sospendere il resto dello sviluppo indipendente. T01 è stato avviato al via esplicito del maintainer e consegnato per la sua verifica.
