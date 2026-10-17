# Changelog

## Unreleased

### 2026-10-17 — T01: base multipiattaforma

- Creato workspace pnpm/TypeScript strict con desktop Electron, renderer React/Vite condiviso e server Fastify.
- Introdotti contratti validati per bridge desktop e liveness HTTP, confini Node per DB/Codex e controllo degli import nel renderer.
- Implementati main/preload isolati, protocollo locale sicuro, gestione origini/IPC e stato iniziale privo di dati simulati.
- Fissate dipendenze/lockfile e aggiunti script dev/build/check/test, packaging nativo NSIS/DMG/AppImage e CI sui tre OS.
- Verificati check, 16 test, build, avvio Vite/Electron e pacchetto Windows x64; installer unsigned prodotto e smoke dell'eseguibile impacchettato passato.
- Documentati comandi Windows, configurazione opzionale server e verifiche manuali. T01 in attesa dell'esito del maintainer; macOS/Linux non ancora provati nativamente.

### 2026-10-17 — T00: preparazione

- Raccolti requisiti dalla conversazione e chiarimento desktop Windows/macOS/Linux.
- Definiti architettura, confini Codex locale/server condiviso, dati/eventi e piano T00–T16.
- Documentate le tre reference con layout, palette/token, componenti, particelle, grafici e movimento inferito.
- Aggiunti regole agenti, skill di coordinamento, contributi e tracciamento delle build per piattaforma.
- Creata la repository pubblica MIT `AndreaZero/nexus-ai` e aperta l'issue #1 per T01, ancora da avviare.
- Validati skill, collegamenti documentali, YAML, integrità reference e whitespace. Nessun codice applicativo o build ancora prodotto.
