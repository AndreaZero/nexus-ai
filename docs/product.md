# Prodotto e requisiti

## Obiettivo

Nexus AI rende visibile il lavoro di sviluppo con Codex in un workspace condiviso. Lo sviluppatore lavora sui propri file dal desktop; colleghi e clienti seguono attività, conversazioni autorizzate, task, modifiche e risultati attraverso un server ospitato. Il cliente può capire cosa sta succedendo e dare feedback senza dover interpretare un terminale.

Il caso guida è uno sviluppatore che lavora a un gestionale e invita colleghi e referenti cliente. I nomi, i file e i numeri nelle PNG illustrano la composizione, non sono dati iniziali del prodotto. L'app deve servire anche altri progetti e richieste non legate al codice.

## Esperienza completa

1. Installare Nexus su Windows/macOS/Linux; accedere all'identità Nexus e connettere il proprio account Codex separatamente.
2. Creare un workspace e un progetto, collegare una cartella/repository locale, impostare cosa condividere e invitare membri.
3. Aprire una sessione Codex sul proprio computer, allegare contesto scelto e inviare richieste. Chat, piano, output, file modificati e approvazioni mostrano stati reali.
4. Aprire lo stesso progetto da un altro dispositivo autorizzato: vedere presenza, attività e progressi senza configurare rete locale o condividere credenziali AI.
5. Lavorare su task e review con colleghi. Ogni sviluppatore esegue le proprie sessioni sulla propria macchina e con il proprio account.
6. Pubblicare aggiornamenti, deliverable e link di anteprima; raccogliere feedback e approvazioni dei clienti con audit.
7. Riprendere cronologia e task dopo riavvio o riconnessione. Gestire ruoli, notifiche, impostazioni e rimozione accessi.

## Ruoli e controllo

| Ruolo | Capacità di prodotto |
| --- | --- |
| Owner | Gestione workspace, membri e progetti; policy di condivisione; tutte le funzioni di sviluppo sul proprio runtime |
| Developer | Task, commenti, repository autorizzati, sessioni sulla propria macchina, review e pubblicazione nei progetti assegnati |
| Client | Vista cliente del progetto, aggiornamenti e deliverable pubblicati, commenti e approvazione dei deliverable abilitati |
| Viewer | Lettura delle sole risorse esposte al suo ruolo, senza modifiche o approvazioni |

`driver` è la relazione tra sessione, utente e dispositivo che esegue Codex, non un nuovo ruolo globale. Solo il driver controlla quel runtime e risponde alle approvazioni di esecuzione. I colleghi possono osservare contenuti consentiti e proporre cambiamenti; la collaborazione non conferisce esecuzione arbitraria sulla macchina di un altro membro. Un owner remoto non aggira questo confine.

La vista cliente/team in reference 1 è la **composizione più ricca**, visibile al team. Il client riceve la stessa struttura editoriale con soli dati pubblicati; file, diff, log, metriche tecniche e chat interne richiedono una condivisione esplicita, altrimenti il blocco viene adattato o omesso lato server.

## Requisiti e accettazione

| ID | Requisito definitivo | Evidenza di completamento |
| --- | --- | --- |
| R01 | Desktop Windows/macOS/Linux | Configurazioni di packaging native e risultato di ogni build registrato separatamente |
| R02 | Workspace, progetti, inviti e ruoli | Due account in un progetto; accesso estraneo negato e revoca efficace |
| R03 | Solo Codex, account come default | Login personale, richiesta reale completata; API opzionale scelta dall'utente |
| R04 | Runtime locale e repository | Cartella selezionata, contesto e modifiche reali, percorsi indipendenti dall'OS |
| R05 | Sessione AI completa, reference 2 | Chat streaming, piano, contesto, diff/output/test e approvazioni realmente collegati |
| R06 | Sincronizzazione condivisa ospitata | Due client, stesso evento autorizzato, riconnessione senza duplicati o perdita di eventi accettati |
| R07 | Overview progetto, reference 3 | Presenza, sessioni, feed, task, health, deploy e notifiche alimentati dai rispettivi domini |
| R08 | Cliente/team pulse, reference 1 | Milestone, attività, outcome, deliverable, feedback e preview con visibilità coerente |
| R09 | Task e collaborazione | Creazione, assegnazione, stato, commenti, link a sessione e attività aggiornati |
| R10 | Git/GitHub e codice | Stato Git, diff e commit veri; link repository/PR e sincronizzazione GitHub autenticata |
| R11 | Aggiornamenti e deliverable | Pubblicazione esplicita, feedback e approvazione distinti dalle approvazioni Codex |
| R12 | Deploy e ambiente | Link/registrazioni reali, stato datato e verificabile; nessun servizio dichiarato verde per default |
| R13 | Ricerca, notifiche, impostazioni | Ricerca autorizzata, lettura notifiche, preferenze e configurazioni persistenti |
| R14 | Fedeltà visiva | Confronto delle tre viste a 1586 × 992 e verifica del movimento definito nei documenti |
| R15 | Errori, accessibilità e recupero | Vuoto, loading, offline, auth scaduta, errore runtime e focus gestiti senza stati live falsi |
| R16 | Open source e manutenzione single dev | Repository, MIT, setup riproducibile, changelog e documentazione aggiornati per tranche |

## Perimetro

Il risultato è l'app completa descritta sopra, costruita per tranche senza una linea separata MVP/demo. Le prime tranche possono essere incomplete come prodotto ma il codice entra nella base definitiva. Non abilitare azioni non ancora implementate: mostrare stati vuoti o indisponibili con una ragione concreta.

Non richiesti: altri motori AI, esecuzione AI cloud a carico di Nexus, editing simultaneo dello stesso file stile Google Docs, videoconferenze, sistema di fatturazione, marketplace, clonazione di tutte le funzioni di un IDE o piattaforma deploy proprietaria. Aprire un editor e mostrare diff/output fa parte del perimetro; costruire un nuovo IDE no.

L'accesso web per osservatori e collaboratori è una decisione progettuale a supporto della condivisione. Non sostituisce il requisito desktop sui tre OS e non può eseguire processi locali senza un runtime desktop collegato.
