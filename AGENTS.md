# Regole di sviluppo Nexus AI

## Prima di lavorare

Leggi `docs/status.md`, il task corrente in `docs/plan.md` e i documenti pertinenti. Per lavoro parallelo leggi `.agents/skills/nexus-coordination/SKILL.md`. Per UI leggi `docs/design/README.md`, `screens.md` e `motion.md`, quindi apri le PNG originali. I riassunti testuali non sostituiscono l'ispezione delle immagini.

La fase corrente è **T15 in sviluppo; prosecuzione T16 autorizzata e arresto al termine**. Fermarsi dopo T16. Ownership ed evidenze in docs/status.md; migrazione0008 applicata,9totali. Preservare shell/reference1/2/3, runtime Codex0.159.2 e auth0.9.1/no429, account e configurazione. Non stampare .env/segreti o avviare migrazioni automaticamente.

## Prodotto e architettura

- Desktop Windows/macOS/Linux come target reali; niente dipendenze strutturali da PowerShell, WSL, bash o percorsi di una sola piattaforma. Il maintainer proverà macOS dal Mac più avanti.
- Codex è l'unico motore AI. Account personale come percorso principale; chiave API solo come opzione esplicita, senza fallback a pagamento automatico.
- Runtime e filesystem locali nel processo principale desktop. Renderer web/desktop condiviso e senza privilegi Node. Server ospitato per identità Nexus, membership, cronologia condivisa ed eventi.
- Nessuna raccolta di credenziali da altre app, condivisione dei token Codex, controllo remoto implicito o importazione delle chat ChatGPT. Integrazione tramite protocollo ufficiale documentato e schema della versione effettivamente adottata.
- Le azioni di Codex restano soggette a policy e approvazioni locali. Un'approvazione cliente è un oggetto di prodotto distinto da un'approvazione di esecuzione.
- Il server applica ruoli, appartenenza al progetto e visibilità a ogni lettura, comando, download e sottoscrizione. Nascondere un pulsante non autorizza i dati.

## Come procedere

1. Scegli il primo task disponibile nella tranche corrente e dichiara risultato, dipendenze e file di proprietà.
2. Implementa la soluzione definitiva per quel perimetro. Niente demo parallele, pagine fittizie, adapter temporanei da buttare o schermate riempite con metriche inventate. Gli stati vuoti sono parte del prodotto.
3. Se serve parallelismo, il coordinatore assegna percorsi disgiunti e contratti condivisi prima degli edit. Lockfile, contratti, migrazioni e root config hanno un solo autore alla volta. I subagenti non creano o contattano altre chat senza autorizzazione dell'utente.
4. Esegui i controlli pertinenti una volta dopo l'integrazione. Ripeti solo per correzioni concrete o nuovi rischi; niente loop di test, polling o review senza esito decisionale.
5. Aggiorna task, `docs/status.md` e `CHANGELOG.md`; aggiungi una decisione se cambia un confine architetturale o un requisito.
6. Consegna cambiamenti, verifica eseguita, limiti e istruzioni manuali per la build dell'utente. Il passaggio alla tranche seguente segue il feedback del maintainer.

## Fedeltà visiva

- `examples/design/{1,2,3}.png` è l'autorità per composizione, densità e stile al viewport 1586 × 992; `docs/design/tokens.css` è la base documentata dei token.
- Riprodurre sidebar, griglie, altezze, bordi sottili, glow localizzato, pianeta, particelle, wave, grafici, avatar, tab, badge, timeline e diff. Una dashboard generica scura non soddisfa il requisito.
- La tipografia e le animazioni sono ricostruzioni esplicitate nella specifica, non proprietà ricavabili con certezza dalle PNG. Correggerle con confronti visivi, senza dichiarare una corrispondenza non verificata.
- Grafici numerici e indicatori di stato derivano da dati reali. Gli effetti decorativi possono animarsi ma non simulano attività, progresso, successo o connessioni.
- Accessibilità, focus, navigazione da tastiera, riduzione movimento, stati errore/offline e autorizzazioni fanno parte del componente finito.

## Qualità e repository

TypeScript strict, validazione ai confini, moduli per dominio, errori con recupero comprensibile. Evitare astrazioni per provider o piattaforme non richiesti. Introdurre dipendenze solo per un bisogno del task; versioni stabili e lockfile durante T01, non numeri presunti dai documenti.

Test mirati a isolamento progetti, ruoli, replay/idempotenza, approvazioni, segreti e operazioni locali quando queste parti cambiano. Nessun obbligo di snapshot per ogni componente o test che ripete l'implementazione. Non dichiarare build o test passati se non eseguiti. I comandi effettivi sono in `CONTRIBUTING.md`: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm dev:desktop` e packaging sul relativo OS. Per modifiche a main/preload ripetere lo smoke pertinente; la build manuale del maintainer resta distinta dalle verifiche automatiche.

Commit piccoli e coerenti per task; il coordinatore integra e pubblica. Mai forzare push, cancellare modifiche altrui, registrare segreti o dati di clienti nei fixture. Aggiornare i documenti esistenti invece di moltiplicare piani concorrenti. Le migrazioni sono additive e revisionate; nessuna esecuzione su produzione durante un task locale implicito.
