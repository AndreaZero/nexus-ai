# Asset e verifica visiva

## Originali

Non modificare le PNG di riferimento. Il loro uso è confronto e specifica, non sostituzione dell'interfaccia con screenshot. Tutte hanno dimensioni 1586 × 992.

| File | SHA-256 |
| --- | --- |
| `examples/design/1.png` | `CA090679B861F4CFDCE889650907C7D07E0C64F944AD7FF4A59B7546E76D5057` |
| `examples/design/2.png` | `082A86A3E68364367227A4B4527DE53D022175573B4D10E4D858B16182B400B0` |
| `examples/design/3.png` | `8D8CDF91BDE8EB84C5ADB01765A65144C2E18DB38732D423A15CE2EE665A5A2B` |

Le immagini sono state fornite dal maintainer come mockup. Non dedurre il loro font, motore grafico o licenza di singoli brand dai pixel. Gli asset introdotti nell'app avranno provenienza registrata nella tabella seguente e relativo avviso/licenza quando necessario.

## Inventario dopo T02

| ID | Asset | Percorso previsto | Fonte/stato |
| --- | --- | --- | --- |
| A01 | Simbolo Nexus, wordmark e app icon per OS | `packages/ui/assets/brand/`, `apps/desktop/resources/` | SVG originale costruito in T02; PNG 1024, ICO 16–256 e ICNS esportati dallo stesso SVG, licenza MIT del repository |
| A02 | Pianeta, orbite e rete sidebar | `packages/ui/src/effects/SidebarPlanet.tsx` | Canvas procedurale originale, texture calcolata localmente e memorizzata; MIT |
| A03 | Superficie pulse e percorsi nodi | `packages/ui/src/effects/AmbientWave.tsx` | Scena originale T02 con punti deterministici e curve; label ambientali, collegamento a dati reali in T10 |
| A04 | Mappa schematica e nodi presenza | `packages/ui/src/effects/PresenceMap.tsx` | Scena originale T02, senza geolocalizzazione o utenti simulati; conteggi reali in T09 |
| A05 | Sparkline, waveform e microdecorazione | `packages/ui/src/effects/`, `apps/web/src/views/` | Canvas/SVG/CSS originali; le griglie dei grafici dati rimangono vuote quando manca la fonte |
| A06 | UI font Inter e codice JetBrains Mono | Dipendenze `@fontsource/inter@5.3.0`, `@fontsource/jetbrains-mono@5.3.0`; `apps/web/public/licenses/` | Font locali dal pacchetto Fontsource, SIL Open Font License 1.1 allegata; nessuna richiesta CDN |
| A07 | Icone outline | `packages/ui/src/icons.tsx` | Tracciati SVG originali coerenti, MIT; nessuna dipendenza Lucide introdotta. Simboli generici per capacità, nessun logo provider copiato dalle PNG |
| A08 | Avatar e miniature preview | Risorse per utente/progetto | Dati veri, iniziali come fallback; non ritagliare volti casuali dalla PNG |

I file A01–A07 sono presenti in T02; A08 richiede dati utente/progetto nei task successivi. Le icone native sono esportazioni dell'asset originale, senza una dipendenza di conversione a runtime. Le miniature deploy possono provenire da immagine caricata o fonte configurata, mai da uno screenshot fittizio presentato come produzione. Licenze incluse nel bundle in `/licenses/Inter-OFL.txt` e `/licenses/JetBrainsMono-OFL.txt`.

## Confronto di accettazione

Per ciascuna reference verificare, in questo ordine: frame/sidebar/header, rettangoli e griglia, dimensione e wrapping testo, padding/bordi, contenuti e icone, grafici, effetti ambientali, hover/focus e movimento. Utilizzare viewport e contenuto comparabili, con nomi/lunghezze di fixture isolati quando serve il confronto deterministico.

Registrare uno screenshot per vista a ogni tranche che ne completa la composizione, più annotazione breve delle differenze materiali. Non imporre screenshot a ogni commit. Le schermate finali devono poi essere provate con dati veri, titoli lunghi, liste vuote e permessi diversi. Un confronto statico non prova streaming, accessibilità, prestazioni o build native.

La composizione T02 è stata confrontata nel renderer reale: [catture, misure e limiti](t02-review.md). La corrispondenza dei contenuti completi richiede i dati e le capacità dei task T06–T14; accettazione visiva finale in T15.
