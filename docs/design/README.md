# Specifica UI/UX

## Autorità e obiettivo visivo

Riprodurre le PNG in `examples/design/` come composizione finale del prodotto: stessa gerarchia, densità, proporzioni, bordi, luci, particelle e dettagli. Le tre schermate sono viste dello stesso sistema, non temi alternativi. La verifica primaria avviene a **1586 × 992 CSS px, zoom 100%, device scale 1**, confrontando lo screenshot dell'area contenuto con la PNG. La cornice nativa del sistema operativo resta fuori dal confronto.

Le misure seguenti sono ricostruite dalle immagini e arrotondate: tolleranza iniziale 2–4 px sugli ancoraggi principali, poi correzione visiva. La tolleranza non è un permesso per omettere componenti. Font, stati interattivi, movimento e adattamenti responsive sono specifiche progettuali inferite; una PNG non ne dimostra il comportamento originale.

## Identità

Aspetto di una console di lavoro viva, nitida e professionale. Fondo nero/blu petrolio, pannelli leggermente sollevati, glow ciano e blu elettrico confinato a elementi attivi, viola per review/AI e verde menta per stati positivi. La leggibilità e il contenuto prevalgono sulla decorazione.

Logo: simbolo angolare a tre segmenti sovrapposti blu/ciano, wordmark `NEXUS`, microbadge `AI`, payoff su due righe `BUILD TOGETHER / WITH AI`. Sidebar ambientale con pianeta in basso, archi orbitali, connessioni e punti; testo `Human creativity / AI capability / Real progress.` con ultima riga ciano. Ricostruire con asset vettoriali/canvas dedicati, non con l'intera PNG usata come sfondo della pagina.

## Palette e luce

Valori iniziali in [`tokens.css`](tokens.css), da importare nel package UI in T02. Campioni del fondo delle PNG variano da `#020810` a `#0B121C`; gradienti, texture e glow producono variazioni locali.

| Token | Valore iniziale | Uso |
| --- | --- | --- |
| bg/app | `#050B12` | Fondo globale quasi nero |
| bg/sidebar | `#040C13` | Rail laterale, separato da filetto blu scuro |
| bg/surface | `#08121D` | Pannelli primari con lieve gradiente verticale |
| bg/raised | `#101E2D` | Tab file, hover e controlli |
| border/subtle | `#142D40` | Bordi 1 px di card e separatori |
| border/strong | `#31526C` | Controlli, diff e focus secondario |
| text/primary | `#EDF4FF` | Titoli, numeri, messaggi |
| text/secondary | `#B2C4DA` | Corpo secondario e descrizioni |
| text/muted | `#7692AF` | Timestamp, breadcrumb, etichette |
| accent/cyan | `#00B7FF` | Selezione, link, nodi e percorsi |
| accent/blue | `#0866FF` | CTA primaria e progressi |
| accent/violet | `#8355FF` | Review, bordo finale e orbite |
| status/positive | `#00E6A0` | Online, completato, approvato |
| status/warning | `#F5B941` | Attesa/available/task |
| status/danger | `#F34E63` | Stop, errori e rimozioni nel diff |

Bordo normale scuro e sottile; bordo attivo gradiente ciano in alto/sinistra e viola in basso/destra. Realizzare un layer dedicato o maschera CSS senza alterare il padding. Glow esterno a bassa opacità, raggio 8–20 px: non circondare ogni card con un neon. CTA primaria con gradiente blu, bordo ciano e ombra corta; surface interne senza glass blur pesante. Fondo header con alone blu diffuso dall'alto al centro, senza macchie che riducano il contrasto del testo.

## Geometria e tipografia

| Proprietà | Base |
| --- | --- |
| Sidebar | 212 px, altezza viewport, border-right 1 px |
| Area principale | Inizio x≈225–240 px; gutter sinistro 12–26 px secondo vista |
| Header | Breadcrumb y≈31; titolo y≈55–80; sottotitolo y≈94 |
| Navigazione progetto | y≈125–155; testo 13–14 px, underline 3 px |
| Gap card | 10–14 px; padding 12–16 px |
| Raggi | 8–10 px card, 6 px controlli, 999 px badge/presenza |
| Sidebar item | x≈8, larghezza≈196, altezza≈40; passo≈51 px |
| Titolo progetto | 28–30 px, peso 600–700 |
| Titolo sessione | 24–26 px, peso 600 |
| Titoli card | 14–16 px, peso 600 |
| Corpo | 12–14 px, line-height 1.35–1.5 |
| Metadata | 10–11 px; evitare testi nuovi sotto 10 px |
| KPI | 24–28 px; donut 24 px centrale |
| Codice | 11–12 px monospazio, numeri tabulari |

UI font proposto **Inter**; codice **JetBrains Mono**, self-host con licenze incluse quando aggiunti. Le PNG non permettono di identificarli con certezza: confrontare larghezza righe e wrapping prima di fissare il font. Spaziatura wordmark ampia, etichette micro in uppercase con tracking leggero. Evitare di sostituire tutto con un font display futuristico.

## Componenti comuni

| Componente | Dettagli richiesti |
| --- | --- |
| Navigation item | Icona outline 20 px, label, badge numerico; selezione blu navy, rail ciano 2 px, icona piena/illuminata |
| Search field | Compatto in alto a destra, lente a sinistra, hint `⌘ K` su Mac / `Ctrl K` altrove, bordo tenue |
| Live badge | Dot verde con alone, label e sfondo verde scuro; solo per connessione e dati correnti |
| Card / active card | Header compatto con azione secondaria; bordi/raggi coerenti; active con bordo ciano/viola |
| Avatar / stack | Foto reale o iniziali, ring colorato, dot stato; stack sovrapposto e contatore `+N` |
| Button | Primary blue, secondary scuro outline, ghost e destructive rosso; icona outline, disabled/focus/loading |
| Tabs / filter chips | Underline ciano per navigazione; pill compatte per filtri feed; tab file con icona tipo e close |
| Progress bar | Track blu grigio, fill blu/ciano o verde, numero adiacente; nessun valore se scope sconosciuto |
| Donut | Track scuro spesso, arco con estremità tonde, centro percentuale/stato, legenda separata |
| Timeline row | Asse verticale, punto luminoso, ora, avatar/icona, titolo, dettaglio e azione; colori semantici |
| Task card | Colonna stato, titolo multilinea breve, assegnatario, progresso reale; no task statici di esempio |
| File chip | Icona tipo TS/Vue/etc, path o filename, stato, close opzionale; path completo in tooltip |
| Diff viewer | Header filename, additions/deletions, numeri linea, sfondi rosso/verde, split view e scroll |
| Output/test panel | Tab output/problems/console, orari e stream, report test distinto dal semplice exit code |
| Feed/notification | Icona circolare colorata, titolo, descrizione troncata, timestamp e stato letto |
| Environment row | Icona, servizio, stato, fonte/endpoint e ultima osservazione; unknown/offline espliciti |
| Outcome/deliverable | Tipo file, titolo, descrizione, provenienza, timestamp, stato e menu contestuale |
| Popover/modal | Stesse surface e bordi; focus trap, escape, ritorno focus e azioni comprensibili |

Le icone di navigazione appartengono a una famiglia outline coerente da 1.5–1.75 px; proposta Lucide con brand asset separati. I loghi dei provider mantengono proporzioni e origine dichiarata. Niente emoji come sostituti casuali di icone strutturali; il razzo della riga deploy può diventare l'icona illustrata coerente della reference.

## Comportamento e accessibilità

- Contrasto leggibile sui valori effettivi; le label informative non dipendono dal solo colore. Focus ciano netto anche senza glow. Tooltip accessibili per icone e troncamenti.
- Target visivo compatto come reference, hit area ampliata dove possibile. Tastiera per tab, board, menu e dialoghi; dragging dei task con alternativa menu/tastiera.
- Stati di ogni blocco: loading con skeleton discreto, empty con azione utile, errore con recupero, offline/stale con timestamp, denied senza dati interni. Il layout mantiene le proporzioni quando il contenuto è vuoto.
- Nessun auto-scroll se l'utente sta leggendo messaggi precedenti; badge per nuovi eventi e azione per tornare al live. Non annunciare ogni delta ai lettori schermo; annunciare stato e messaggio completato.
- La lingua iniziale UI segue le label inglesi delle PNG per il confronto; date, scorciatoie e numeri sono localizzabili. Le stringhe devono essere centralizzate per aggiungere italiano senza cambiare componenti.
- Login, onboarding, impostazioni e dialoghi non mostrati nelle PNG usano lo stesso sistema, senza introdurre un altro tema.

## Adattamento viewport

Il desktop di riferimento resta la priorità. Sotto ≈1440 px la colonna destra si riduce senza comprimere codice e testi sotto la soglia leggibile; sotto ≈1200 passa sotto il contenuto. Sotto ≈1024 la sidebar diventa rail compatto o drawer; la sessione alterna chat/contesto/codice tramite tab. Sul web stretto le card diventano una colonna, il feed resta completo e il diff può passare a unified con scroll orizzontale locale. Non scalare l'intera app con `transform: scale()`.

Questi breakpoint sono un'estensione progettuale, non una proprietà verificabile delle PNG. Layout specifici e coordinate sono in [`screens.md`](screens.md); movimento in [`motion.md`](motion.md); asset in [`assets.md`](assets.md).
