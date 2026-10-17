# Lavorare su Nexus AI

Il maintainer sviluppa con agenti e verifica personalmente le build. I contributi esterni usano gli stessi contratti e standard, senza richiedere una struttura da grande team.

Leggere [AGENTS.md](AGENTS.md), [piano](docs/plan.md) e [stato](docs/status.md). Un task corrente, un risultato concreto, percorsi assegnati senza sovrapposizioni. Il coordinatore integra cambiamenti e dipendenze condivise. Il task successivo segue la consegna e il feedback del maintainer.

## Setup

L'app non è ancora implementata. I comandi seguenti sono l'interfaccia **da realizzare in T01**, non istruzioni già eseguibili:

| Comando previsto | Scopo |
| --- | --- |
| `pnpm install --frozen-lockfile` | Installazione riproducibile dopo il primo lockfile |
| `pnpm dev:desktop` | Renderer e runtime desktop |
| `pnpm dev:web` | Renderer web |
| `pnpm dev:server` | API e realtime locali |
| `pnpm check` | Typecheck e lint |
| `pnpm test -- <scope>` | Controlli mirati al dominio modificato, sintassi da fissare in T01 |
| `pnpm build` | Compilazione workspace |
| `pnpm package:win` | Packaging nativo Windows |
| `pnpm package:mac` | Packaging sul Mac |
| `pnpm package:linux` | Packaging su Linux |

T01 sostituisce questa sezione con comandi, prerequisiti e risultati effettivi. Fissare Node/pnpm e dipendenze stabili verificate, non dipendere dalla versione installata accidentalmente su un solo computer. Il DB e le variabili ambiente vengono documentati quando introdotti; nessuna chiave API è prerequisito del percorso principale Codex.

## Verifica e build del maintainer

Per il task corrente l'agente esegue controlli statici/di dominio appropriati al cambiamento e li riassume. Non serve ripetere build complete a ogni edit o introdurre test su cambiamenti documentali reversibili. Un nuovo controllo deve risolvere un dubbio concreto.

La consegna al maintainer contiene: commit/task, prerequisiti nuovi, comando build corretto per il suo OS, tre-cinque azioni da provare, risultato atteso e limiti noti. Il maintainer restituisce esito e problemi; registrarli in `docs/status.md`, mantenendo distinta implementazione da accettazione manuale. La prova Mac avverrà sul Mac più avanti; non blocca i task indipendenti ma resta necessaria per dichiarare supporto verificato.

Quando si tocca UI, confrontare la reference pertinente a 1586 × 992 e annotare le differenze materiali. I dataset di verifica, se necessari, sono isolati e non compaiono nell'avvio normale del prodotto. I controlli su ruoli, replay o approvazioni verificano comportamenti osservabili, non stringhe dell'implementazione.

## Commit e documenti

Un commit coerente per un risultato circoscritto, con riferimento Txx nel messaggio quando utile. Aggiornare piano/stato/changelog senza creare diari ridondanti. Annotare una decisione solo quando cambia un requisito, un confine o una scelta durevole. Una PR può essere utile per una modifica ampia; non è un passaggio burocratico obbligatorio per ogni piccola modifica del singolo maintainer.

Non includere `.env`, token, auth store, output reali di clienti, cartelle locali o build generate. Gli screenshot pubblicati come esempi usano contenuto autorizzato. Non eseguire migrazioni di produzione o pubblicazioni di release come effetto collaterale di un check locale.
