---
name: nexus-coordination
description: "Coordina task e agenti di Nexus AI con ownership dei file, contratti condivisi, integrazione e consegna per build Windows/macOS/Linux. Usare per avviare o riprendere un task del piano Nexus, distribuire fronti paralleli o integrare il loro lavoro. Non avviare sviluppo durante la sola preparazione richiesta dal maintainer."
---

# Coordinamento Nexus AI

## Contesto e fonti

Questa skill riguarda il repository Nexus AI. La root è la directory che contiene `AGENTS.md` e `docs/plan.md`; risolverla dalla posizione della skill, senza percorsi assoluti di una singola macchina.

Leggere [regole](../../../AGENTS.md), [stato](../../../docs/status.md) e [task](../../../docs/plan.md). Caricare [architettura](../../../docs/architecture.md) e [contratti](../../../docs/contracts.md) quando si toccano i confini. Per UI leggere [specifiche](../../../docs/design/README.md), [schermate](../../../docs/design/screens.md), [movimento](../../../docs/design/motion.md) e aprire le PNG pertinenti. Per runtime leggere [Codex](../../../docs/codex.md).

Il maintainer vuole un'app completa, desktop Windows/macOS/Linux, Codex locale e server condiviso ospitato. Una sola base definitiva, niente versioni demo da riscrivere. Il maintainer esegue le build; macOS verrà provato dal Mac più avanti. Non dichiarare verificati sistemi non provati.

## Avvio o ripresa

1. Controllare fase, task corrente, modifiche locali e deleghe esistenti. In preparazione produrre solo gli artefatti richiesti: il piano non autorizza l'avvio dell'app prima del via del maintainer.
2. Dopo il via, scegliere un solo task disponibile della tranche corrente. Dichiarare risultato, dipendenze, criteri di uscita e controlli mirati. Non avviare task successivi per mantenere occupati agenti.
3. Fissare le forme dei contratti necessari e indicare chi può modificarli. Non delegare implementazioni su interfacce contraddittorie o ancora contese.
4. Dividere il task in fronti indipendenti solo quando riduce il tempo senza creare sovrapposizioni. Per un cambiamento piccolo lavorare direttamente.

## Delega e ownership

Il coordinatore resta responsabile dell'integrazione. Se gli strumenti lo consentono, usare subagenti del task corrente, non nuove chat visibili al maintainer. Il numero segue la disponibilità del runtime e il lavoro indipendente, non un obbligo fisso. Non cambiare modello o effort senza richiesta o istruzione applicabile. Non contattare chat esterne senza autorizzazione umana.

Prima di avviare agenti registrare in `docs/status.md` una riga per fronte: agente, obiettivo, percorsi scrivibili, dipendenze, stato e punto di consegna. Non affidarsi solo a una dichiarazione in chat se un altro coordinatore deve riprendere.

Un solo autore alla volta per root manifest/config, lockfile, `packages/contracts`, schema/migrazioni e generated schema Codex. Di norma il coordinatore possiede questi file o ne assegna esplicitamente uno a un singolo agente. Gli altri propongono la modifica tramite handoff. I fronti UI, backend e runtime sono esempi, non una suddivisione obbligatoria.

Usare percorsi disgiunti nel checkout condiviso; non resettare file modificati da altri. Un worktree serve solo se l'isolamento lo giustifica, e non copia implicitamente modifiche non committate. Gli agenti non eseguono installazioni concorrenti o commit/push autonomi; l'integratore gestisce dipendenze, commit e pubblicazione.

Ogni incarico deve contenere:

- Task e comportamento da ottenere, con input e dipendenze già disponibili.
- Percorsi assegnati e confini che appartengono ad altri.
- Contratti da usare e reference da aprire se pertinenti.
- Criteri di completamento e una verifica proporzionata.
- Handoff richiesto: file modificati, comportamento, controlli realmente eseguiti, limiti e contratto che richiede intervento del coordinatore.

Se emerge sovrapposizione, fermare il fronte coinvolto, leggere le modifiche e riassegnare; non far correggere contemporaneamente lo stesso file a più agenti. Un agente che necessita un cambiamento fuori ownership lo segnala, senza estendere unilateralmente il perimetro.

## Integrazione e verifica

Integrare dopo handoff concreto, non dopo un semplice messaggio di avanzamento. Verificare che i domini si colleghino nel percorso reale e che stato/contratti/UI raccontino lo stesso risultato. Restituire all'agente solo difetti specifici ancora nel suo perimetro; evitare catene di review senza una decisione.

Eseguire controlli pertinenti una volta dopo l'integrazione. Ripeterli solo in seguito a correzioni, fallimenti o dubbi irrisolti. Test mirati per ruoli/tenant, replay/idempotenza, approvazioni e confini locali quando toccati; controlli visuali sulla reference pertinente per UI. Non generare suite per edit documentali o componenti banali solo per aumentare copertura.

Nessun polling rapido di agenti, build o servizi. Usare attese basate su eventi o intervalli ragionevoli e interrompere una ripetizione senza nuova evidenza. Se manca una credenziale o piattaforma, completare il lavoro indipendente del task e registrare la dipendenza; non dichiarare successo, non introdurre mock di produzione e non aprire un altro obiettivo.

## Consegna al maintainer

Aggiornare task, `docs/status.md`, `CHANGELOG.md` e decisioni solo quando necessarie. Registrare separatamente: implementazione, controlli automatici, package/build per OS, prova manuale e accettazione. Chiudere ownership di un agente solo dopo integrazione.

La consegna contiene risultato, commit o file, comandi effettivamente disponibili, prerequisiti nuovi e pochi passi manuali con risultato atteso. Se la build utente manca, usare lo stato `consegnato, in attesa di verifica utente`. Non dichiarare l'intero prodotto completo finché i requisiti R01–R16 e le prove di piattaforma necessarie restano aperti.

Il feedback dell'utente orienta il passo successivo. Risolvere difetti del task consegnato prima di estendere la tranche; non ricominciare da un piano nuovo a ogni turno e non trasformare una domanda di stato in un nuovo obiettivo.
