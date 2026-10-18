# Revisione visiva e accessibilità T15

Confronto del 18 ottobre 2026. Sono state aperte le PNG originali `examples/design/1.png`, `2.png` e `3.png`, oltre alle catture T13 di Overview, Pulse e Sessione e alle catture T14 di Settings e ricerca. Le immagini di verifica usano contenuti controllati dichiarati; non sono dati o accettazione del maintainer.

## Composizione conservata

| Vista | Riscontro e confine |
| --- | --- |
| Overview — reference 3 | Sidebar da 212 px, header, strip presenza, card sessione, griglia attività/task e rail health/preview/diff/notifiche conservati. Health e deployment hanno fonte e data; gli stati vuoti sostituiscono numeri e miniature quando i dati mancano. |
| Sessione — reference 2 | Conversazione e contesto/codice affiancati, Environment Status con sei righe compatte, tab e output separati. Sotto 1024 px la selezione Conversation/Context/Code & Output mantiene accessibili i pannelli. Nessun messaggio, piano o risultato di test viene copiato dall'immagine. |
| Client & Team Pulse — reference 1 | Hero di 232 px, wave e nodi di milestone reali, donut separato, tre righe di card e rail conservati. La proiezione cliente nasconde il lavoro locale e verifica le audience correnti. |
| Settings e ricerca | Non esistono PNG dedicate. Surface navy, bordi sottili, ciano, spaziatura e focus derivano dalle primitive della shell; nessuna corrispondenza pixel viene attribuita a questi layout. |

Pianeta, particelle e wave restano decorativi. La riduzione movimento dell'OS o di Nexus arresta le animazioni; il canvas conserva il frame statico e sospende il ciclo fuori viewport o con documento nascosto. Il badge della connessione deriva dallo stato osservato, separato dagli effetti.

## Correzioni concrete

- Settings aveva una card Application alta quanto il form Profile & preferences: circa 725 px nella cattura T14, con gran parte della colonna vuota. Due colonne indipendenti mantengono le card alla propria altezza e portano Connection e le altre impostazioni vicino alle informazioni dell'app. Sotto 900 px il layout passa a una colonna.
- Il titolo progetto e il breadcrumb ora possono restringersi all'interno del flex layout. L'ellissi mantiene visibili badge e controlli; nome e descrizione completi restano nel DOM e nel titolo del relativo elemento. La composizione non dipende dalla lunghezza del nome.
- La cattura Pulse con autore lungo ha rivelato il footer del feedback fuori dalla card: la scrollbar del documento restringeva anche il hero di 15 px. Autore e sentiment condividono ora una riga con ellissi e titolo completo; quote, metadata e navigazione manuale hanno spazi delimitati, con overflow interno alla card per i casi estremi. La verifica attende font e contenuti prima di misurare la griglia.
- I testi lunghi della richiesta corrente e dei task compatti potevano spingere gli allegati fuori dalla card sessione o creare scroll annidati nel Task Overview. La richiesta è limitata a due righe con titolo completo, i task dell'overview a tre righe con apertura del dettaglio; le colonne scorrono ciascuna all'interno dello spazio assegnato. I link dei task nella sessione usano ellissi e titolo completo, preservando il badge di stato. Il board completo Tasks conserva il proprio layout.
- Il contatore Tasks della sidebar non mostra più uno zero fisso: usa la snapshot autorizzata corrente, `—` prima della verifica e `100+` quando raggiunge il limite di lettura. La descrizione esplicita che si tratta dei task visibili nell'overview, fino a 100; Tasks apre l'elenco completo. Il contatore Live Sessions descrive la conversazione in esecuzione sul dispositivo.
- Un errore React durante il rendering ora mostra un fallback delimitato, focalizzato e leggibile da tastiera. `Reload Nexus` richiede un'azione dell'utente; non esistono retry automatici del render. Il messaggio non mostra dettagli, stack, credenziali o contenuti del progetto. Gli errori catturati non vengono registrati dal root React. Le modifiche non ancora salvate possono richiedere un nuovo inserimento dopo il reload.

## Percorsi e accessibilità

La sidebar e la ricerca portano alle pagine implementate; i collegamenti di progetto aprono i dettagli del dominio relativo. Le azioni locali richiedono cartella, account e capacità effettivamente disponibili. Le azioni non disponibili hanno stato disabilitato e una descrizione del prerequisito; nessun pulsante genera metriche o dati di esempio.

I dialoghi usano `HTMLDialogElement.showModal()`: il browser gestisce il focus modale e rende inerte il contenuto sottostante. Escape, chiusura esplicita e ripristino del focus sono presenti; una mutazione pendente blocca la chiusura del relativo dialogo. Le tab condivise supportano frecce, Home ed End. Il focus visibile, i nomi dei controlli a icona e l'accesso da tastiera ai diff/output restano parte delle primitive. Questa revisione non equivale a una certificazione con screen reader.

Typecheck web ed ESLint dei sorgenti modificati sono passati. Le prove Electron della tranche, le catture a 1586 × 992 e 960 px, i tre ruoli e i percorsi offline/auth/runtime sono registrati dal coordinatore in `docs/status.md` e nei report locali `.nexus/visual/t15/`. Non vengono aggiunti test che si limitano a confrontare stringhe CSS con l'implementazione.

## Differenze e verifiche umane residue

Testi, avatar, contenuti e indicatori dipendono dai dati effettivi. La tipografia e il movimento sono ricostruzioni documentate: le PNG statiche non ne specificano con certezza font o traiettorie. I dati mancanti producono empty/unknown al posto dei valori della reference. Le immagini attuali non provano identità pixel o prestazioni su ogni GPU.

Restano distinti il confronto delle catture Windows controllate, l'uso con dati reali del maintainer e le prove native macOS/Linux. Verificare sul relativo dispositivo rendering dei font, contrasto percepito, movimento normale/ridotto e uso delle tre viste con le proprie sessioni, senza condividere credenziali o cronologia privata.

## Catture controllate finali

[Pulse](captures/t15-pulse.png), [Sessione](captures/t15-session.png), [Overview](captures/t15-overview.png) e [misure/report](captures/t15-report.json) sono prodotti dal renderer effettivo con DTO controllati dichiarati, senza dati del maintainer. La verifica finale passa14controlli e17catture: nessuno scroll orizzontale a960px, geometrie principali e contenimento dei testi lunghi controllati dopo font e dati. Le tre catture normali sono a1586×992.

Il recupero del processo renderer nativo è distinto dal boundary React: il main arresta Codex prima del dialogo Reload Nexus/Close window e non ricarica automaticamente. Verifier effettivi separati:6controlli boundary e5controlli con2crash del solo renderer temporaneo. Nessuna esecuzione o finestra personale è stata interrotta.
