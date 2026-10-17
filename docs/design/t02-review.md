# Confronto shell T02

17 ottobre 2026, Electron Windows x64, renderer produzione 0.2.0. Catture dell'area contenuto a **1586 × 992 CSS px, zoom 100%, device scale 1**, con Inter/JetBrains Mono locali. Nessun progetto o contenuto dimostrativo caricato. La cornice nativa Windows è esclusa.

## Catture integrate

| Vista | Reference | Renderer reale |
| --- | --- | --- |
| Client & Team Pulse | [1.png](../../examples/design/1.png) | [T02 Pulse](captures/t02-pulse.png) |
| AI Session | [2.png](../../examples/design/2.png) | [T02 Session](captures/t02-session.png) |
| Project Overview | [3.png](../../examples/design/3.png) | [T02 Overview](captures/t02-overview.png) |

## Composizione controllata

Sidebar 212 px; label Live Sessions su una riga, icone outline, logo originale, payoff sovrapposto alla scena pianeta/orbite. Header e tab hanno altezze distinte per progetto e sessione. Palette da `tokens.css`, bordi sottili e glow ciano/viola sulle card principali. Le card restano nello stesso frame anche senza dati.

Misure arrotondate rilevate da `getBoundingClientRect()` nel renderer, nell'ordine x/y/larghezza/altezza:

| Blocco | Rettangolo CSS px |
| --- | --- |
| Overview — Active AI Session | 230 / 262 / 956 / 278 |
| Overview — Live Activity | 230 / 550 / 558 / 420 |
| Overview — Task Overview | 798 / 550 / 388 / 290 |
| Overview — Project Health | 1198 / 142 / 370 / 170 |
| Pulse — Milestone Progress | 225 / 402 / 380 / 224 |
| Pulse — Activity Summary | 615 / 402 / 390 / 224 |
| Pulse — Active Sessions | 1015 / 402 / 260 / 224 |
| Pulse — Activity Feed | 1286 / 142 / 294 / 450 |
| Session — Repository Context | 915 / 161 / 417 / 148 |
| Session — Environment Status | 1341 / 161 / 228 / 332 |

Corrette durante il confronto due differenze materiali: wrapping della label Live Sessions ed eccedenza verticale di 2 px di Pulse, che introduceva una scrollbar e restringeva la griglia di 17 px. Le tre viste a 1586 × 992 ora mantengono le griglie senza scroll orizzontale.

## Movimento e interazione

Pianeta, orbite, superficie Pulse, wave header e mappa sono canvas/SVG/CSS originali, non ritagli delle reference. L'animazione è una ricostruzione dell'intento delle immagini statiche: non esiste una fonte video per provarne velocità o traiettorie esatte. I canvas hanno cap 30 fps, DPR massimo 1.5, sospensione in background e fuori viewport. Il pianeta usa una texture procedurale memorizzata; nessuna immagine remota.

La preferenza di sistema `prefers-reduced-motion` e quella Nexus fermano il movimento mantenendo la scena completa. La preferenza Nexus è persistita localmente. Gli effetti sono decorativi, separati da connessione/progresso/telemetria reali.

`pnpm verify:shell`, dopo `pnpm build`, cattura le tre viste reali, verifica apertura Ctrl K e focus sull'input, applica la preferenza movimento ridotto, cattura Overview statica e prova Session a 960 × 800 senza overflow orizzontale. A questa larghezza Context e Code si aprono tramite tab; lo scroll verticale è previsto. Il comando ripristina la preferenza precedente e salva report/catture in `.nexus/visual/t02/` (ignorata da Git). Non sostituisce la prova umana del movimento dal vivo, di Tab/Esc e dei diversi sistemi operativi.

## Differenze previste e prossimi collegamenti

- Le reference hanno progetti, membri, sessioni, messaggi, file, diff e metriche compilati. T02 presenta gli stati vuoti corrispondenti; grafici senza fonte mostrano `Not configured` o valori assenti. L'uguaglianza pixel dei contenuti non è ancora dichiarata.
- Avatars, miniature deploy, feed, milestone e output saranno alimentati dalle funzionalità reali T04–T14. Gli spazi strutturali e i componenti sono già presenti. I pulsanti futuri sono disabilitati e motivati.
- La ricerca dell'header naviga tra pagine; ricerca nei dati e notifiche persistenti sono T14. Rotte di progetto senza dati mostrano un pannello vuoto reale.
- Logo, icone, pianeta, font e animazioni sono ricostruzioni originali documentate nel [registro asset](assets.md). La forma dettagliata del globo e le traiettorie non sono asset originali estratti dalle PNG.
- L'accettazione visiva del maintainer è pendente. Mac/Linux condividono il renderer ma richiedono ancora verifica nativa; nessuna equivalenza di rendering tra OS viene dedotta dalla prova Windows.

I passi di build e verifica manuale sono in [CONTRIBUTING.md](../../CONTRIBUTING.md). I contenuti completi delle tre viste restano nei task T06–T10, l'accettazione complessiva in T15.
