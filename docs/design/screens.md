# Mappa delle schermate e dei flussi

Coordinate approssimative in CSS px sul canvas **1586 × 992**. Gli ancoraggi visivi prevalgono sui numeri arrotondati se un confronto rivela differenze. Le tre viste condividono il frame e possono avere griglie diverse.

## Frame comune

Sidebar x=0–212, logo x≈24 y≈24, wordmark x≈72 y≈31, payoff y≈65. Voci a partire da y≈114: Projects, Live Sessions, Team, Tasks, Repos, Client Portal, Settings. Badge contatore per Projects/Live Sessions/Tasks; dot rosso per live session con attenzione. Pianeta ambientale circa y=520–855, testo in basso al pianeta e piccola barra ciano. Workspace switcher x≈13 y≈883–941 con icona, label workspace, nome e chevron. Nella PNG 1 il suo ancoraggio è leggermente più alto: preservare l'equilibrio della rispettiva vista.

Header con breadcrumb progetto a sinistra; ricerca x≈1180 y≈14 w≈242 h≈33, icona waveform, bell con unread dot, avatar a destra. Icona progetto circolare ciano/blu presso x≈260 y≈75; titolo e sottotitolo al fianco, pill Live e chevron. A destra, Live sync, stato sistema, sparkline ciano, data/ora e chevron. I dettagli header sessione cambiano nella reference 2.

La sidebar apre pagine reali: elenco progetti, sessioni cross-project autorizzate, membri/team, task, repository, portale cliente e impostazioni. I tab di progetto non sono link decorativi: mappano sezioni reali sotto lo stesso progetto, con route e breadcrumb consistenti.

## Reference 3 — Overview progetto

File: [`../../examples/design/3.png`](../../examples/design/3.png). È la vista di ingresso operativa.

Area contenuti principale x≈229–1188 (w≈959), rail destro x≈1199–1568 (w≈369). Tab progetto a y≈134: Overview selezionato, Code, Tasks, AI Sessions, Deployments, Docs, Client Portal. Sottolineatura ciano da x≈239 a 325. Header/tab terminano presso y≈155.

| Blocco | Rettangolo circa x, y, w, h | Contenuto e comportamento |
| --- | --- | --- |
| Team Online | 230,168,958,84 | Dot online, rapporto attivi/totali, avatar e attività di Andrea/Marco/Cliente, invito circolare tratteggiato, mappa mondo con nodi e sessioni attive a destra |
| Active AI Session | 227,262,960,278 | Bordo attivo, titolo e close; badge LIVE, brand Codex, label macchina, Open in Editor e Stop Session. Task corrente; token/context/durata/stato in colonne; barra step/progresso; file chip inferiori |
| Live Activity | 230,551,560,420 | Titolo, Live badge, filtri All/AI Sessions/Commits/File Changes/Comments/Deployments. Timeline con ora, avatar, testo, stato e azioni diff/commenti |
| Task Overview | 799,551,388,290 | Link View all; tre colonne In Progress/Review/Done con conteggio, card assegnatario e barra. Board compatta con overflow locale, non crescita incontrollata della pagina |
| System Activity | 799,849,388,122 | CPU/memory/network sopra, wave multilivello e legenda Code/Editor/Tests/Build/Deploy, nodo stato a destra. Dati misurati o unknown |
| Project Health | 1199,142,369,169 | Header Live, donut verde a sinistra; Build, Tests, Coverage, Performance, Security a destra con stato/valore/recenza |
| Live Deploy Preview | 1199,323,369,132 | Thumbnail ambiente, URL, tempo, badge Deployed, Open Preview, View Builds e menu |
| Recent Changes | 1199,467,369,219 | Filename e +/−, badge Live, blocco diff numeri linea e sintassi |
| Notifications | 1199,697,369,274 | Mark all read; quattro righe con icona, titolo, excerpt, tempo; elenco reale paginabile |

`Code` apre browser repository e diff autorizzati; `AI Sessions` elenca e apre la reference 2; `Tasks` apre board completa; `Deployments` elenca ambienti/build e link; `Docs` ospita documenti del progetto e risultati pubblicati. `Open in Editor` funziona solo per una cartella locale collegata. I viewer non ricevono dati tecnici non esposti.

Metriche della sessione: token e context solo se disponibili dal runtime; durata da lifecycle, numero file da contesto selezionato. `Step 12/18`, `67%`, `92%`, `248/248` e gli altri numeri nelle PNG non vengono copiati nel prodotto. Un task senza piano misurabile ha stato testuale e barra indeterminata solo durante attività osservata.

**T09 implementato:** griglia e altezze reference3 preservate; strip presenza reale, selezione This device/share osservata, timeline con filtri/pagine e nuovi eventi da applicare, card task in lettura, campioni CPU/memoria opt-in, diff e report locali, preview configurata e notifiche con stato letto. Posizioni mappa schematiche, nessuna geolocalizzazione; chart dai campioni OS e nessun dato health/deploy presunto. Cattura popolata1586×992 in `.nexus/visual/t09/`, font/bordi/glow T02, stati offline e target revocati nascosti. [Fonti e limiti operativi](../overview.md).

## Reference 2 — Sessione AI

File: [`../../examples/design/2.png`](../../examples/design/2.png). Area operativa con chat e contesto/codice simultanei.

Breadcrumb Projects / progetto / AI Session. Titolo `Refactor customer document workflow` nella PNG come esempio, y≈58. Icona sessione ad anello blu; sottotitolo. Badge Live vicino al titolo; avatar stack e `+2`. Toolbar destra Share, Pause, Approvals con contatore e Publish Update. Ricerca e avatar globali restano in alto.

Contenuto sinistro x≈224–900, y≈119–982; destro x≈907–1578. Rapporto circa 50/50 con gap 8–12 px, separatore ridimensionabile senza perdere la larghezza minima leggibile. La chat ha cornice attiva; il codice ha una seconda cornice attiva nella metà destra inferiore.

| Blocco | Geometria e contenuto | Azioni/stati |
| --- | --- | --- |
| Stepper sessione | x≈236 y≈132 w≈651 h≈49; cinque passi con cerchi e frecce: Understand Requirements, Implement Changes, Run Tests, Review & Refine, Commit & Publish | Riflette un piano effettivo; se non c'è, mostra solo fase corrente senza inventare progresso |
| Chat | x≈240–885 y≈196–860; avatar esterno alla colonna testo, autore/ora; richiesta utente con file chip, risposta Codex, card analisi e card piano | Streaming, messaggi completi, richieste input e errori; scroll indipendente dal contesto |
| Analysis card | x≈300 y≈398 w≈575 h≈156; spinner, titolo, chevron; lista check verdi, fase corrente, pending e durate | Dati esposti dall'attività/strumenti, non ragionamento privato simulato |
| Implementation Plan | x≈300 y≈638 w≈559 h≈223; header e conteggio step, righe numerate, due azioni | Approva/suggerisci piano distinto dall'approvazione esecuzione |
| Composer | x≈239 y≈876 w≈631 h≈96; input, allegato, invio; toolbar Tools/Search/Edit Files/Run Commands/Browse Docs/Use Context | Capacità disponibili, allegati selezionati e stato invio; interruzione/errore senza perdita della bozza |
| Context tabs | x≈916 y≈121; Context & Files selezionato, Tasks, Session Info | Pannelli persistono nello stato locale di navigazione |
| Repository Context | x≈917 y≈157 w≈412 h≈148; GitHub, repo/private, branch, sync, ahead count, Open in GitHub | Binding reale, errore Git e non collegato |
| Attached Files | x≈917 y≈307 w≈412 h≈180; conteggio, Add Files/Add Context; lista 5 file con icona, path, active e remove | Picker locale sicuro, contesto manuale, file mancanti o accesso negato |
| Environment Status | x≈1340 y≈158 w≈226 h≈329; dot verde, riepilogo, sei servizi con icona, stato/endpoint | Capability/probe configurate, nessun Redis/database verde hardcoded |
| Related Tasks | x≈918 y≈494 w≈649 h≈112; tre righe task con stato, id e View in Project | Link al dominio task e aggiornamenti live |
| Code workspace | x≈879 y≈616 w≈700 h≈368; tab Code Preview/Terminal/Tests/Preview, Split View | Tab attivo con underline ciano, bordi sottili |
| File tabs/diff | y≈655–845; tab file con icona e +/−, breadcrumb, due pane con numeri linea | Syntax highlight, added/deleted background, unified disponibile su piccolo viewport |
| Output e test | x≈889 y≈844 w≈679 h≈131; Output/Problems/Debug Console, running marker; log con timestamp; box results, coverage e duration | Dati reali, scroll output locale, report separato e stale esplicito |

`Share` gestisce audience/inviti, mai il token del runtime. `Approvals` apre richieste pendenti del driver; i membri senza controllo leggono solo lo stato consentito. `Publish Update` prepara un riepilogo selezionato, con anteprima e audience. `Preview` apre l'URL configurato in un contesto isolato. Il composer non promette strumenti assenti nel runtime selezionato.

T07 collega file tab, colori add/delete, numeri linea e split/unified a diff locali reali o patch provider con fonte distinta. Terminal/Output/Problems/Debug Console proiettano gli eventi osservati; Tests indica formato e data del report, coverage unknown se non riportata. Il composer sceglie Read only/Workspace write con conferma locale, la toolbar conta soltanto richieste pendenti e Stop arresta il runtime. I nuovi dialoghi mantengono surface/bordi/focus della shell: comando completo o patch, scadenza, Allow once/Decline; nessuna approvazione remota o permanente. La preview T07 apre esplicitamente il browser di sistema; thumbnail/probe/deploy T13. Il movimento decorativo T02 resta invariato, senza simulare avanzamento.

## Reference 1 — Client & Team Pulse

File: [`../../examples/design/1.png`](../../examples/design/1.png). Vista editoriale di avanzamento e collaborazione; i clienti ricevono solo la proiezione pubblicata.

Tab Overview / Code / Client & Team Pulse selezionato / Deployments / Docs. Area centro x≈225–1275 (w≈1050), rail destro x≈1286–1580 (w≈294). Griglia più ampia al centro e rail più stretto dell'overview: non imporre la stessa larghezza della reference 3.

| Blocco | Rettangolo circa x, y, w, h | Contenuto e interazioni |
| --- | --- | --- |
| Project Pulse hero | 225,160,1050,232 | Bordo ciano/viola; dot/eyebrow; headline su due righe con seconda blu; sintesi; View Live Work e Share Update. Wave di particelle con milestone/nodi e tooltip workstream; a destra donut e legenda overall progress |
| Milestone Progress | 225,402,380,224 | Titolo e View Roadmap; cinque righe numerate con stato, nome, %, barra. Riga attiva evidenziata blu |
| Today's Activity Summary | 615,402,390,224 | Header, calendario/data, All Activity; quattro colonne KPI (commits, tasks, comments, builds/deploys), icone e delta percentuali solo con confronto reale |
| Active Sessions | 1015,402,260,224 | Conteggio live, tre righe avatar/nome/attività/badge, link finale |
| Working now | 225,635,414,207 | Titolo personale, badge Live, avatar/ruolo, Open in Editor; current task con linea/punto e file; microdecorazione a destra |
| Recent AI Outcomes | 649,640,357,206 | Titolo, sparkle, conteggio oggi, View all; quattro righe icona/file, descrizione, successo, tempo e menu |
| Latest Approved Deliverables | 1016,635,259,211 | View all; tre righe icona stato, nome, approvazione e data/versione |
| Deploy Previews | 225,850,448,127 | Due tile con miniatura, URL/link, timestamp, Open Preview e View Builds; header Deployed e View all |
| Client Feedback | 682,854,333,123 | Header, Latest/View all; avatar, quote breve, autore/azienda, data, sentiment se esplicito; frecce e pagination dot |
| Team Availability | 1029,847,246,132 | Header Live, cinque righe avatar/nome, stato e attività; denominazioni visibili senza dipendere solo dal dot |
| Activity Feed | 1286,142,294,450 | All activity dropdown; sei righe con icona colorata, titolo, descrizione e tempo. Include commit, commento, approvazione, build e deploy |
| Client & Viewer Activity | 1286,600,294,380 | Conteggio online; avatar, presenza, nome, ruolo/contesto e tempo; Invite Client or Stakeholder in fondo |

Il pianeta e le particelle della sidebar sono presenti anche qui. Nel hero la wave non deve coprire headline o legenda; i nodi hanno label con halo locale. Il testo più importante sta nella metà sinistra, visuale ambientale al centro e progress ring nella fascia destra separata.

`View Live Work` apre una sessione consentita o l'elenco; se non esiste una sessione attiva lo stato lo dice. `Share Update` apre pubblicazione/invito secondo contesto. `View Roadmap` apre milestone e task collegati. Outcome e deliverable aprono dettaglio/provenienza/versione; feedback non scorre da solo mentre viene letto. La disponibilità è uno stato membro o presenza dichiarata, non inferenza di produttività.

**T10 implementato:** hero232px, wave/particelle e nodi da milestone reali, donut da task visibili, griglia delle tre righe e rail450/380px. Roadmap in lettura e dialoghi di provenienza, summary UTC/project-mine, outcomes da estratti completed, presenza WS reale. Preview client richiede una proiezione server restrittiva e nasconde il lavoro locale. Deliverable/feedback/deploy condivisi hanno stati vuoti fino ai workflow previsti. Nessun dato numerico o avatar personale copiato dalla PNG; focus/reduced motion e960px. [Fonti e prova](../pulse.md).

**T11 implementato:** Tasks/Board/Roadmap e Docs con editor, dettaglio/versioni/provenienza/commenti e preview prima della pubblicazione. I nuovi layout non hanno PNG dedicate e riusano Card/Dialog/tokens/focus della shell. Pulse mantiene la griglia reference1 e mostra deliverable realmente approvati, feedback con navigazione manuale e documenti/update con fonte pubblicata. Overview/Sessione aprono task reali; feed/filtri/notifiche includono metadata autorizzati. Nessuna simulazione di generazione file o approvazione cliente. [Workflow](../work.md).

## Flussi complementari da realizzare

**T08 implementato:** presenza in header/Team Online, badge Live Sync, Connection panel e Live shared sessions in Session Info della reference2. Share apre scelta estratto/live, selezione senza default, preview congelata e consenso per i futuri delta degli stessi messaggi. I dialog non hanno una PNG dedicata e riusano le primitive della shell. Catture1586×992 in `.nexus/visual/t08/`, limiti e prova in [realtime](../realtime.md); overview completa reference3 resta T09.

| Flusso | Risultato finito |
| --- | --- |
| Onboarding | Accesso Nexus, workspace/progetto, cartella locale, Codex connect, riepilogo dati condivisi |
| Projects | Elenco, ricerca, creazione, selezione e modifica progetto; empty state utile |
| Team/inviti | Ruoli, invito, accettazione con email verificata, revoca e lista membri |
| Tasks/roadmap | Board completa, dettaglio task, assegnazione/commenti e milestone |
| Session history | Elenco, filtro, dettaglio e ripresa locale quando disponibile |
| Repos/code | Collegamento locale/GitHub, branch/stato, file e diff autorizzati |
| Docs/outcomes | Documenti e risultati con provenienza, ricerca e pubblicazione |
| Client portal | Accesso cliente, aggiornamenti, deliverable, feedback e approvazioni |
| Deployments | Ambienti e build da integrazione o registrazione esplicita, link e osservazioni datate |
| Settings | Profilo, notifiche, runtime/account, modello, cartelle, sharing, endpoint self-host e preferenza movimento |
| Search/notifications | Ricerca autorizzata con scorciatoia, centro notifiche e stato letto |

Non esistono reference per questi flussi: usare componenti, palette e densità già definite, senza spacciare una scelta progettuale per dettaglio della PNG.

**T12 implementato:** Code/Repos e dialoghi Git/PR/review riusano surface, tab, bordi, densità e focus delle reference; diff split/unified con numeri e colori derivato da Git/patch reali. Repository Context della sessione mantiene la composizione reference2 e apre Code. Feed reference1/3 risolve commit/PR/review autorizzati; summary mostra commit osservati UTC, mai una metrica decorativa. Pianeta/wave/particelle restano T02/T10; nessuna PNG dedicata alle nuove pagine. [Workflow](../repositories.md).

**T13 implementato:** card Project Health e Live Deployment Preview nel rail della reference3, Deploy Previews nella griglia della reference1 ed Environment Status compatto nella reference2 condividono dati deployments autorizzati. I record succeeded mostrano thumbnail scelta, ambiente, fonte e data; il placeholder è un'icona senza screenshot fittizio. Donut/label health derivano dai check richiesti correnti: unknown elimina il numero, scadenza e dettagli restano accessibili. La probe richiede un dialogo e consenso per ogni osservazione; il verde non dichiara servizi mai verificati. Deployments, editor e dialoghi di conferma non hanno PNG dedicate e riusano Card/Dialog, palette navy/ciano, densità, bordi e focus della shell. Catture1586×992/960px e reduced motion in .nexus/visual/t13; pianeta, wave e particelle preservati. Nessuna identità pixel delle nuove viste o delle animazioni ricavate da immagini statiche dichiarata. [Workflow e prove](../deployments.md).
