# Componenti distribuiti

Nexus AI è distribuito con [licenza MIT](LICENSE). Le dipendenze mantengono licenze, copyright e avvisi propri. L'inventario seguente è stato confrontato con i manifest installati dal lockfile il 18 ottobre 2026; non sostituisce i testi delle licenze dei componenti transitivi.

| Componente | Versione fissata | Licenza dichiarata |
| --- | --- | --- |
| Codex CLI, OpenAI |0.159.2 | Apache-2.0 |
| Electron |44.9.0 | MIT, con avvisi dei componenti Chromium/Node inclusi nella distribuzione |
| React e React DOM |19.3.1 | MIT |
| Better Auth e plugin Electron |1.7.10 | MIT |
| Better Fetch |1.3.2 | MIT |
| Better Call |1.4.2 | MIT |
| Conf |15.0.2 | MIT |
| ws |8.22.0 | MIT |
| Zod |4.6.7 | MIT |
| Fastify |5.12.7 | MIT |
| @fastify/cors / @fastify/static |11.3.1 /10.1.6 | MIT |
| Chalk |6.0.1 | MIT |
| Drizzle ORM |0.45.4 | Apache-2.0 |
| Nodemailer |10.1.2 | MIT-0 |
| node-postgres (pg) |8.23.1 | MIT |
| Inter e JetBrains Mono, pacchetti Fontsource |5.3.0 | OFL-1.1 |

Codex proviene da `@openai/codex@0.159.2` e dalla dipendenza nativa ufficiale della piattaforma, fissati nel lockfile. [Sorgente della release](https://github.com/openai/codex/tree/rust-v0.159.2), [licenza Apache inclusa](apps/desktop/resources/licenses/codex-APACHE-2.0.txt). Il vendor include README e risorse della distribuzione originale. Binario e schema `packages/codex-bridge/generated/` non vengono modificati; lo schema è prodotto dal comando ufficiale della stessa versione.

Le distribuzioni Electron contengono `LICENSE` e `LICENSES.chromium.html`: conservarli negli artefatti. I file delle dipendenze packaged conservano le rispettive licenze. L'avviso Nexus viene copiato nelle risorse del package desktop.

I font sono locali e non caricati da CDN. I testi SIL Open Font License sono inclusi in [Inter-OFL.txt](apps/web/public/licenses/Inter-OFL.txt) e [JetBrainsMono-OFL.txt](apps/web/public/licenses/JetBrainsMono-OFL.txt), quindi nel renderer distribuito. Origine degli altri asset in [docs/design/assets.md](docs/design/assets.md): icone, pianeta e wave sono costruiti nel repository; thumbnail e avatar di progetto sono dati pubblicati dall'utente.

Per l'elenco completo delle dipendenze, incluse quelle di build, consultare i manifest workspace, `pnpm-lock.yaml` e i testi di licenza dei pacchetti installati. Componenti infrastrutturali opzionali, immagini container e servizi SMTP mantengono a loro volta licenze e condizioni della propria distribuzione.
