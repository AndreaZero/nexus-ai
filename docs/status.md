# Stato operativo

Aggiornato: **17 ottobre 2026**. Fase: **preparazione completata**. Task **T00 completato**; prossimo task **T01**, in attesa del via. Implementazione app: **non avviata**.

## Risultato della preparazione

- Recuperati cinque turni leggibili della conversazione e incorporata la scelta esplicita desktop Windows/macOS/Linux. Limiti delle risposte assistente dichiarati in `sources.md`.
- Ispezionate le tre PNG originali, rilevate dimensioni/hash e preparate specifiche di layout, palette, componenti, asset, particelle, grafici e movimento inferito.
- Scritti requisiti, architettura proposta, dati/eventi, integrazione Codex e piano T00–T16.
- Predisposti regole agenti, coordinamento per ownership, contributi e registro verifiche per OS.

- Creato il repository pubblico MIT [AndreaZero/nexus-ai](https://github.com/AndreaZero/nexus-ai), con base versionata sul branch `main`.
- Creata e validata la skill `.agents/skills/nexus-coordination/`; discovery locale al repository, nessuna installazione globale richiesta.
- Verificati 19 documenti Markdown, 43 collegamenti locali, i tre hash PNG, i due file YAML e il whitespace Git. Nessun errore residuo nei controlli documentali.
- Aperto il primo task operativo [T01 — issue #1](https://github.com/AndreaZero/nexus-ai/issues/1), pronto senza avviare l'implementazione.

## Prossimo passo

**[T01 — Monorepo e build native](https://github.com/AndreaZero/nexus-ai/issues/1)**, dopo il via del maintainer. Primo risultato: base definitiva condivisa web/desktop/server e comandi riproducibili, senza avviare altri task in parallelo. Dentro T01 il coordinatore può assegnare fronti distinti dopo aver fissato i contratti.

All'avvio leggere `AGENTS.md`, `docs/plan.md#t01--monorepo-e-build-native`, `docs/architecture.md`, quindi `.agents/skills/nexus-coordination/SKILL.md`. Lo sviluppo di T01 non è autorizzato dalla sola esistenza del piano.

## Registro task e deleghe

| Task | Stato | Owner | Fronti/file riservati | Esito integrazione |
| --- | --- | --- | --- | --- |
| T00 | Completato | Coordinatore | Nessuna ownership di sviluppo attiva | Documentazione e skill verificate, base pubblicata |
| T01 | Pronto, non avviato | Da assegnare all'avvio | Nessuna delega attiva | In attesa del via |

T02–T16 sono pianificati e non avviati. Non esistono subagenti di sviluppo attivi in questa preparazione.

## Evidenze build e prove

| Ambito | Stato | Evidenza |
| --- | --- | --- |
| Documenti/link/skill | Verificati | Link locali, hash reference, validatore skill, YAML e `git diff --cached --check` passati; nessun test applicativo necessario |
| Windows | Non disponibile | Codice applicativo non iniziato |
| macOS | Non disponibile | Build nativa dal Mac del maintainer più avanti |
| Linux | Non disponibile | Build/prova da registrare sul relativo sistema |
| UI contro reference | Specificata, non implementata | PNG ispezionate; nessuna corrispondenza applicativa ancora dimostrata |

## Dipendenze future

Nessun blocco di prodotto per iniziare T01 dopo il via. Hosting/email, account integrazione GitHub, eventuale storage esterno e credenziali di firma verranno configurati nei task interessati. Non sono stati creati servizi a pagamento né modificate credenziali locali.

## Formato degli aggiornamenti successivi

Aggiornare questo file nello stesso cambiamento del task: obiettivo corrente, owner e percorsi, comportamento consegnato, controlli effettivamente eseguiti, build utente per OS, problemi residui e prossimo task. Tenere solo lo stato utile alla ripresa; la storia dei cambiamenti sta nel changelog e nei commit.
