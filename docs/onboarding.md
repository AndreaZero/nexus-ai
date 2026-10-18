# Onboarding guidato

T17 aggiunge un percorso riprendibile dal primo accesso Nexus alla prima risposta completa di Codex. La guida usa gli stessi account, progetti, repository, binding e sessioni delle schermate operative. Non crea dati di esempio e non invia richieste AI automaticamente.

La voce **Getting started** riapre la guida. Il riepilogo in Overview indica il prossimo prerequisito mancante; Settings offre un accesso alla stessa guida. **Set up later** permette di continuare nell'app e conserva il rimando nel profilo locale. Il primo avvio propone il percorso quando necessario, senza sostituire una destinazione esplicita o un invito.

## Percorso sviluppatore desktop

| Passo | Azione esplicita | Condizione di completamento |
| --- | --- | --- |
| Your Nexus account | Accedere nel browser e tornare all'app, completando la verifica email se richiesta. | Sessione Nexus corrente con email verificata. |
| Choose a workspace | Creare uno spazio oppure selezionarne uno già disponibile. | Workspace selezionato, ricontrollato tramite appartenenza corrente. |
| Choose your project | Creare il progetto oppure selezionare quello condiviso. | Progetto corrente appartenente al workspace selezionato. |
| Connect your local folder | Salvare il collegamento al repository, poi scegliere una cartella esistente con il selettore nativo. L'URL remoto HTTPS è facoltativo. | Binding locale del progetto/repository corrente, senza errore o caricamento pendente. |
| Connect Codex | Collegare il runtime, accedere al proprio account Codex e scegliere un modello disponibile. Su Windows preparare la sandbox. | Runtime pronto, account Codex presente, catalogo coerente e sandbox Windows osservata come pronta. |
| Your first AI session | Aprire AI Session, leggere la richiesta suggerita o la bozza esistente e premere Send. | Risposta assistente completa osservata nel progetto e repository correnti. |

L'account **Nexus** governa identità, appartenenze e contenuti condivisi. L'account **Codex** serve al runtime locale e può avere un'email diversa. Mailpit riceve soltanto le email Nexus quando configurato per lo sviluppo; l'accesso Codex segue il flusso ufficiale del provider.

La cartella va preparata sul proprio dispositivo prima di selezionarla. Per iniziare non serve un account GitHub o un URL remoto: si può salvare il collegamento locale lasciando vuoto l'URL, quindi scegliere la cartella. Un eventuale URL HTTPS non clona il repository, non carica file e non esegue Git. Ogni sviluppatore collega la propria cartella; il percorso resta sul suo dispositivo. Git e GitHub diventano utili nei successivi flussi di versionamento e collaborazione.

La guida suggerisce una richiesta di lettura del README e vieta nel testo suggerito modifiche e comandi. La richiesta viene inserita soltanto aprendo esplicitamente la prima sessione, se contesto e bozza sono caricati e non esistono già conversazione o bozza. L'invio richiede comunque Send nel composer. Nessun cambio automatico della policy: una sessione nuova mantiene il comportamento read only dell'app; se si torna a una sessione con Workspace write già scelto, la guida lo indica e preserva la scelta. Verificare sempre la policy prima di inviare.

Su Windows la conferma della richiesta di setup non equivale a sandbox pronta. La guida attende il risultato notificato dal runtime; in caso di errore resta possibile riprovare dai controlli Codex. macOS e Linux non richiedono il passaggio specifico Windows.

## Client, viewer, browser e inviti

Client e viewer seguono tre passi: account, workspace e progetto. Possono aprire Client & Team Pulse e i contenuti pubblicati consentiti dal ruolo, senza collegare cartelle o account Codex. Anche dal browser il percorso si ferma al progetto condiviso: l'accesso al filesystem e il runtime AI richiedono Nexus desktop.

Un invito si accetta dalla destinazione ricevuta via email, con l'indirizzo verificato corrispondente. Il collegamento di invito conserva priorità sulla proposta iniziale della guida. La guida non accetta inviti e non modifica ruoli automaticamente. Appartenere al workspace non concede automaticamente accesso a ogni suo progetto.

## Ripresa, dati locali e recupero

L'avanzamento deriva dai contesti correnti: account, autorizzazioni, selezione progetto, binding e runtime. La guida non usa una spunta memorizzata per autorizzare operazioni. Durante caricamento, errore, revoca o perdita dei prerequisiti il passo interessato torna incompleto.

Nel profilo locale vengono conservati solo preferenze della guida e il riscontro della prima risposta, separati per account e origine del server. Il riscontro è legato a progetto, repository, dispositivo e data del binding; cambiare cartella invalida quello del binding precedente. Non vengono aggiunti password, token, percorsi o testi della conversazione allo storage della guida. Cambiare account separa la ripresa dal precedente utente.

La guida funziona anche se lo storage locale è indisponibile, mostrando che il rimando potrebbe non sopravvivere al riavvio. Errori di rete o contesto locale offrono un recupero esplicito senza avviare richieste AI, reimpostare la bozza o creare un'altra conversazione. Bozza e cronologia restano gestite dai servizi di sessione già esistenti.

## Stile e accessibilità

Non esiste una PNG dedicata all'onboarding: T17 ricompone card, bordi sottili, glow ciano localizzato, stepper, densità e tipografia delle reference1/2/3. La shell, il pianeta e le particelle restano quelli delle viste accettate. Le check derivano dai prerequisiti reali, senza metriche o percentuali fittizie. A960px i blocchi si ricompongono; focus da tastiera, stato corrente testuale e movimento ridotto restano disponibili.

## Build e prova del maintainer

Usare PostgreSQL e `.env` esistenti: T17 non introduce una migrazione. Chiudere app/backend precedenti e generare il package sul relativo sistema operativo seguendo [CONTRIBUTING](../CONTRIBUTING.md). Su Windows:

```powershell
pnpm install --frozen-lockfile
pnpm package:win
```

Avviare `pnpm start:server` e l'app aggiornata. Per gli accessi/email Nexus locali mantenere una sola istanza Mailpit. In sviluppo `pnpm start:desktop` usa la build esistente.

1. Aprire Getting started con il proprio account, verificando che account/workspace/progetto già presenti risultino completati senza ricrearli.
2. Creare o scegliere una piccola cartella di prova con README; salvare il collegamento anche senza URL remoto, scegliere la cartella e controllare il nome del binding.
3. Accedere a Codex e, su Windows, attendere l'esito del setup sandbox. La guida deve consentire il passo sessione soltanto quando tutto è pronto.
4. Aprire la prima sessione. Il composer deve contenere il suggerimento solo se era vuoto; una bozza personale già esistente deve rimanere intatta. Nessun messaggio deve partire prima di Send.
5. Inviare esplicitamente una richiesta di lettura, verificare una risposta reale e tornare alla guida: il passo sessione deve risultare completo.
6. Riavviare l'app, rimandare e riaprire la guida. Cambiare progetto/cartella e verificare che il completamento precedente non renda pronto un contesto diverso.
7. Con un secondo account client accettare un invito, aprire il progetto e verificare che non venga richiesto il setup Codex.

## Verifica automatica e limiti

`pnpm verify:onboarding` usa Electron con renderer e preload di produzione in un profilo/partition QA propri. Account, trasferimento dal browser, forme di collaborazione, binding, catalogo, esito sandbox e prima risposta sono DTO controllati e validati dagli schemi condivisi. Nessun login personale, inferenza, selezione della cartella reale o accesso al `.env` viene eseguito. Il rapporto e le catture locali si trovano in `.nexus/visual/t17/`; le fixture vengono eliminate dal solo percorso temporaneo creato dal verificatore.

Verifica T17 eseguita su Windows: **12 controlli passati e11 catture**. Coperti bootstrap iniziale, forme workspace/progetto, cartella senza URL remoto, rimando e ripresa da Overview, esito sandbox osservato, suggerimento senza invio, bozza esistente e riavvio renderer, riscontro persistito senza transcript in memoria, cambio binding con vecchia conversazione, navigazione da tastiera/960px/movimento ridotto e invito cliente senza requisiti Codex. Le catture1586×992, cartella e ramo cliente e quella960px ridotta sono state ispezionate; nessun overflow orizzontale rilevato. Nessuna corrispondenza pixel di questa nuova vista con una PNG dedicata viene dichiarata.

L'esito del verificatore non sostituisce login, permessi OS e prima inferenza reali del maintainer. I test puri della derivazione coprono anche ruoli browser senza bridge e storage fallibile; le prove manuali delle tre piattaforme restano distinte. Le evidenze effettivamente eseguite per questa consegna sono registrate in [status](status.md).

## Catture controllate

- [Guida alla prima sessione,1586×992](design/captures/t17-onboarding.png).
- [Guida con movimento ridotto,960×992](design/captures/t17-onboarding-960.png).

Le catture mostrano esclusivamente fixture QA dichiarati. Account, modello e risposta di questi scenari sono controllati, separati dalle verifiche PostgreSQL/HTTP reali e dal normale avvio dell’app.

Il testo consigliato invita a leggere il README senza modificare file, consentendo l’ispezione in sola lettura. Non vieta tutti i comandi, perché la lettura dei file può passare dagli strumenti readonly del runtime. Non viene cambiata la policy corrente e nessun comando parte prima dell’invio esplicito. Le catture QA del commit e26a2a6 precedono questa sola rifinitura del testo.
