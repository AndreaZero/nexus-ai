# Componenti distribuiti

Nexus AI mantiene la propria licenza MIT. Le dipendenze conservano le rispettive licenze.

- **Codex CLI 0.159.2**, OpenAI: Apache License 2.0. Runtime nativo ufficiale dal pacchetto npm `@openai/codex@0.159.2` e relativa dipendenza di piattaforma, fissati nel lockfile. [Sorgente della release](https://github.com/openai/codex/tree/rust-v0.159.2), [licenza inclusa](apps/desktop/resources/licenses/codex-APACHE-2.0.txt). Il vendor viene distribuito con README e avvisi delle sue risorse; nessuna modifica al binario o allo schema di protocollo generato.
- **Font Inter e JetBrains Mono**: licenze OFL incluse con gli asset del package UI; riferimenti in `docs/design/assets.md`.

Lo schema `packages/codex-bridge/generated/` è prodotto dal comando ufficiale della versione adottata, senza modifiche manuali. Codice originale e versioni delle altre dipendenze sono identificati da manifest e `pnpm-lock.yaml`.
