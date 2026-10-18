# Ambienti, build, preview e health

T13 introduce il registro condiviso delle build e degli ambienti del progetto. La sorgente disponibile è **manuale**: un membro tecnico registra una build o un deploy effettivamente eseguito, il suo risultato e i collegamenti ai report. Questa registrazione non avvia comandi, pipeline o infrastruttura. Il server Nexus non interroga gli URL del progetto e non deduce uno stato operativo dalla presenza di un link.

## Preparazione e avvio

PostgreSQL locale e l'account Nexus già configurati restano validi. La migrazione additiva `0007_deployments` porta il database a8migrazioni; non modifica `.env` né crea dati iniziali. Sul checkout aggiornato:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
```

Avviare server e desktop in terminali distinti:

```powershell
pnpm start:server
```

```powershell
pnpm start:desktop
```

Mailpit resta necessario per email di verifica/reset, senza avviare una seconda istanza se già attivo. Il packaging cumulativo è previsto T16; una build nativa su Windows non certifica macOS/Linux. Le istruzioni operative generali sono in [CONTRIBUTING](../CONTRIBUTING.md).

## Registrare ambiente e risultato

1. Selezionare il progetto e aprire **Deployments → New environment**. Indicare nome, development/staging/production, audience, eventuale preview URL e check richiesti. Controllare l'anteprima e confermare.
2. **Record build / deploy** registra titolo, ambiente, stato, data osservata, SHA/branch e link ai report. Scegliere eventualmente una PNG locale: il file rimane sul dispositivo fino alla conferma della pubblicazione. Note e testi sono mostrati come testo, senza HTML eseguibile.
3. Aprire il record per controllare versione, fonte manuale, data, audience e thumbnail. **Edit record** usa la versione corrente: in caso di conflitto ricaricare e confrontare la bozza, senza sovrascrivere il lavoro altrui.
4. Per un record `succeeded`, **Open Preview** usa il suo URL o, in assenza di override, l'URL corrente dell'ambiente. **View Builds** apre il record condiviso. La presenza della preview non prova che il servizio sia raggiungibile.

Owner/developer gestiscono ambienti, record e osservazioni. Client/viewer leggono soltanto gli ambienti `client` e i figli attualmente pubblicati. Il flag **Preview client audience** applica la stessa restrizione sul server anche a un owner. Cambiare un ambiente da client a team rimuove immediatamente record, health e target feed dalla proiezione cliente. La cancellazione dell'ambiente richiede conferma ed elimina anche i suoi record, thumbnail e osservazioni.

## Regola della health

Ogni ambiente dichiara quali fra build, tests, coverage, performance e security sono obbligatori. **Record observation** salva fonte manuale, risultato pass/warn/fail, eventuale valore/unità, riepilogo, URL del report, data osservata e durata di validità.

| Evidenza corrente | Stato aggregato | Score |
| --- | --- | --- |
| Nessun requisito configurato | unknown | Assente |
| Almeno un requisito mancante, scaduto o con osservazione ancora futura | unknown | Assente |
| Tutti correnti, almeno un fail | unhealthy | Numero di pass / requisiti ×100 |
| Tutti correnti, nessun fail e almeno un warn | degraded | Numero di pass / requisiti ×100 |
| Tutti correnti e pass | healthy |100 |

Ogni requisito pesa allo stesso modo; lo score non è una media di coverage o performance. La scadenza è **data osservata + durata**, non data di caricamento: inserire oggi un report vecchio non lo rende fresco. Durata consentita60s–7giorni; timestamp oltre2minuti nel futuro rifiutati, timestamp futuri entro la tolleranza restano non correnti fino alla loro data. Un'osservazione precedente non può sostituirne una più recente. Il dettaglio mostra fonte, versione, osservazione, scadenza e componenti; il renderer rimuove il numero quando l'evidenza scade.

Le card Project Health/Live Deployment Preview dell'Overview, Deploy Previews di Pulse ed Environment Status nella sessione usano gli stessi record autorizzati. Il riepilogo Build & deploys conta i record osservati nel giorno UTC, con Mine limitato all'autore; assenza di ambienti visibili produce unknown, non una build riuscita inventata. Il feed coalescente risolve i target correnti senza contenuti privati negli eventi WS.

## Probe locale esplicita

Nella sessione, Environment Status consente un'osservazione privata dal desktop. Aprire il dialogo, indicare un URL HTTP loopback e dare consenso a **questa** richiesta. Il main effettua una sola `HEAD`, senza cookie/body, redirect o timer; timeout5s. Sono accettati soltanto gli host esatti `127.0.0.1`, `localhost` e `[::1]`, senza credenziali, query o fragment. `localhost` viene risolto direttamente sull'indirizzo loopback previsto, senza consultare host remoti.

Il risultato contiene stato HTTP, latenza e timestamp, scade dopo30s ed è scartato se account/permessi cambiano durante la richiesta. Una risposta2xx indica raggiungibilità di quell'URL in quell'istante; non certifica database, test o sicurezza. Nessuna osservazione locale viene pubblicata automaticamente. Per condividere un report occorre registrarlo esplicitamente nel dominio health.

## Preview e limiti

Il bridge desktop riceve soltanto ID progetto/deployment, poi il main rilegge record e ambiente autorizzati. Apre una `BrowserWindow` con partizione effimera, sandbox, isolamento contesto, Node e preload assenti; permessi, popup e webview negati, navigazioni e redirect limitati all'origine autorizzata. La chiusura rimuove lo storage della partizione. La pagina esterna non riceve il cookie Nexus dal main. Nel browser web il link usa una nuova scheda con `noopener noreferrer`; non è una finestra Electron privilegiata.

| Limite | Valore |
| --- | --- |
| Ambienti per progetto |30 |
| Record build/deploy per progetto |1000 |
| Pagina record | Fino a100, ordine osservazione DESC/ID DESC |
| Thumbnail | PNG256KiB, massimo1280×720, firma/chunk/CRC validati |
| Thumbnail aggregate per progetto |10MiB |
| Ricevute mutazioni per progetto |100.000 |
| URL condivisi | HTTPS o HTTP loopback, senza credenziali/query/fragment |
| Trasporto snapshot desktop | JSON limitato a16MiB per le thumbnail autorizzate |

Nessuna fetch di URL, generazione di screenshot, importazione automatica di segreti o provider cloud avviene sul server. Una thumbnail è un file scelto esplicitamente. Il registro non equivale a una verifica indipendente del report dichiarato dall'autore.

## Prova manuale e prove automatiche

Registrare una build effettiva in un ambiente di prova, aprirne il report e la preview; verificare lo stesso record in Overview e Pulse. Dichiarare build/tests richiesti: con un solo report lo score resta unknown; con entrambi pass correnti diventa100. Usare una durata breve e controllare che la scadenza rimuova il numero. Provare audience client e ritorno a team, poi un'osservazione locale del proprio server con consenso. Un indirizzo senza server deve risultare irraggiungibile e non operativo.

I comandi `pnpm verify:deployments` e `pnpm verify:deployment-ui` sono QA locale con fixture proprie e report in `.nexus/visual/t13`. Il primo ha passato6scenari PG/Mailpit/HTTP effettivi; il secondo13controlli renderer/preload con DTO condivisi controllati dichiarati e una HEAD loopback reale. La finestra OS preview è intercettata nel secondo harness: questi13controlli non ne provano l'isolamento dinamico. Passati anche8test server,8probe,8web, build e smoke desktop Windows. Nessun deploy remoto, inferenza personale, installer intermedio o prova nativa Mac/Linux è incluso; [evidenze correnti](status.md).

La verifica aggiuntiva `pnpm verify:preview` è passata con una finestra Electron effettiva e fixture HTTP locale: Node, preload e cookie Nexus assenti, sessione effimera, popup negati e chiusura verificata.
