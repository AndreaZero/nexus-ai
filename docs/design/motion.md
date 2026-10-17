# Movimento, particelle e grafici

Le PNG sono statiche. Le animazioni qui definite sono la ricostruzione proposta dell'intento live e futuristico; si validano con una breve osservazione dell'app, oltre al confronto degli screenshot. Gli effetti ambientali non rappresentano dati di lavoro.

## Sistema di movimento

| Effetto | Specifica iniziale | Condizione |
| --- | --- | --- |
| Hover/focus controlli | 120–160 ms, opacity/border/ombra; easing ease-out | Focus resta visibile senza animazione |
| Cambio tab/pannello | 160–220 ms, fade e spostamento massimo 4 px | Nessun flash della griglia o reset dello scroll non richiesto |
| Card nuova nel feed | 180–240 ms, fade e translateY 6 px | Non sposta la lettura corrente; badge nuovi eventi se scroll lontano dal live |
| Progresso numerico | 250–400 ms tra valori osservati | Numero finale e stato restano autorevoli; nessun incremento automatico |
| Dot live | Respiro morbido 1.8–2.4 s, alone 4–10 px | Solo connessione attiva con timestamp recente; offline interrompe il pulse |
| Spinner attività | Rotazione ≈1 s | Solo lavoro pending reale; niente spinner dopo errore/completamento |
| Bordo card attiva | Alone statico con drift di intensità 5–7 s molto lieve | Non una striscia neon che corre continuamente attorno a tutte le card |
| Waveform header | Movimento ambientale lento 5–8 s | Label connessione alimentata separatamente da heartbeat reale |
| Carosello feedback | Transizione manuale 180–240 ms | Nessuna rotazione automatica durante lettura o focus |

Preferire `transform` e `opacity` per il DOM. Non animare continuamente larghezza/altezza delle card, blur grandi o ombre di tutta la pagina. Non mostrare battito/streaming su sessioni terminate o sconnesse.

## Pianeta nella sidebar

Scena verticale confinata a circa 200 × 340 px, con orbita che esce leggermente dal frame. Sfera blu scuro con bordo luminoso superiore/destro, rete di punti/segmenti a bassa intensità, due archi orbitali ciano/viola, rare scintille e fondo trasparente verso la sidebar. La scena è più luminosa ai bordi e resta scura dove compare il payoff.

Implementazione proposta: canvas 2D con sfera proiettata, punti deterministici e archi; eventuale texture originale separata se la ricostruzione procedurale non raggiunge la reference. Nessuna generazione di asset obbligatoria adesso. Rotazione lentissima 70–110 s; 80–140 punti nel livello sidebar, scie brevi su pochi segmenti, drift quasi impercettibile. Un singolo orologio animazione, pause su tab nascosto e quando fuori viewport.

## Hero pulse, reference 1

Superficie ondulata di punti blu/ciano in prospettiva nella metà centrale/destra del hero. Tre/quattro curve luminose attraversano la superficie; nodi principali e ring indicano milestone e workstream. Le label sono DOM/SVG leggibili sopra il canvas, con collegamenti precisi. Il progress ring è un componente separato, non disegnato come parte dell'effetto decorativo.

Budget iniziale 500–900 punti, wave sinusoidali molto lente e drift 6–10 s; pochi punti percorrono le curve per suggerire flusso. Seed deterministico per stessa composizione tra render; niente rigenerazione casuale a ogni render React. Gli eventi di progetto possono evidenziare per 300–500 ms un nodo reale, senza inventare traffico. Senza milestone la scena resta ambientale e le label lasciano uno stato vuoto.

## Mappa e microvisualizzazioni

T10 usa `PulseScene`: superficie deterministica3200punti e76particelle, curve blu/ciano con alone viola localizzato. Massimo5 nodi derivati dalle milestone autorizzate, posizioni schematiche e nessuna animazione che simuli completamento. DOM focusabile per selezione/dettaglio, tooltip titoli/stati/progresso reali. Canvas30fps/DPR1,5, pausa hidden/offscreen e reduced motion statico; hero non copre copy/CTA/donut. Le etichette troppo lunghe hanno ellissi e titolo completo accessibile.

Mappa mondo della presence strip: silhouette/dot grid blu molto scura, 3–5 nodi luminosi legati a dispositivi attivi; archi brevi e luminosità localizzata. Non dedurre o esporre geolocalizzazione precisa degli utenti: posizioni decorative schematiche, conteggi reali e label coerente. Icona waveform globale e piccola visualizzazione nella card Working now usano lo stesso linguaggio grafico.

## Grafici con dati

- **Donut health/progress:** SVG con track scuro, arco gradiente verde/ciano e cap tondi. Valore e legenda da aggregazione definita; health senza regola configurata mostra `Not configured`, non un punteggio inventato.
- **System activity:** linee sottili ciano/blu/viola/verde, punti e glow moderato; finestra temporale e legenda chiare. CPU/memoria/network solo dal dispositivo che consente la misura. Processi Codex/test/build/deploy come serie di stato reale, non senoide presentata come telemetria.
- **Progressi task/milestone:** valori calcolati da sottotask/scope o dichiarati dall'utente con provenienza. Non usare token consumati o tempo trascorso come percentuale di completamento.
- **Sparkline sync:** può essere ambientale se etichettata come tale; se rappresenta latenza/throughput, usa campioni reali e unità. La scritta `All systems operational` richiede i probe configurati e recenti.
- **Trend KPI:** confronto con periodo precedente esplicito; baseline mancante/zero produce valore non disponibile, non crescita percentuale arbitraria.

Linee/nodi decorativi e metriche condividono colori ma restano componenti separati. I grafici dati hanno testo alternativo/valori leggibili, timestamp, stato stale e un comportamento vuoto.

## Prestazioni, riduzione movimento e verifica

Target iniziale: effetti ambientali a 30 fps e interazioni DOM fluide a 60 fps su hardware ordinario; misurare prima di complicare. DPR canvas limitato a 1.5–2 e budget scalato per dimensione. Renderer senza animazioni fuori viewport o in background. Ridurre punti e rimuovere scie prima di sacrificare chat, input e diff.

Rispettare `prefers-reduced-motion` e preferenza Nexus: fermare orbite, drift, pulse e auto-transizioni, mantenendo una composizione statica completa. Lo streaming testuale resta utilizzabile senza cursori lampeggianti. Loading, focus e messaggi di stato rimangono comprensibili.

Per lo screenshot di confronto usare una clock/seed deterministica solo nel percorso di verifica visuale, con dataset di fixture locale isolato e dichiarato; tale percorso non entra nel flusso utente e non sostituisce il backend. Verificare poi movimento normale e ridotto con dati reali. Interrompere l'iterazione quando le differenze materiali sono risolte; registrare eventuali differenze residue invece di aprire loop automatici indefiniti.
