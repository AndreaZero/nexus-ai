# Asset e verifica visiva

## Originali

Non modificare le PNG di riferimento. Il loro uso è confronto e specifica, non sostituzione dell'interfaccia con screenshot. Tutte hanno dimensioni 1586 × 992.

| File | SHA-256 |
| --- | --- |
| `examples/design/1.png` | `CA090679B861F4CFDCE889650907C7D07E0C64F944AD7FF4A59B7546E76D5057` |
| `examples/design/2.png` | `082A86A3E68364367227A4B4527DE53D022175573B4D10E4D858B16182B400B0` |
| `examples/design/3.png` | `8D8CDF91BDE8EB84C5ADB01765A65144C2E18DB38732D423A15CE2EE665A5A2B` |

Le immagini sono state fornite dal maintainer come mockup. Non dedurre il loro font, motore grafico o licenza di singoli brand dai pixel. Gli asset introdotti nell'app avranno provenienza registrata nella tabella seguente e relativo avviso/licenza quando necessario.

## Asset da costruire nei task di design

| ID | Asset | Percorso previsto | Fonte/stato |
| --- | --- | --- | --- |
| A01 | Simbolo Nexus, wordmark e app icon per OS | `packages/ui/assets/brand/`, icone packaging desktop | Ricostruzione vettoriale dai tratti della reference; da realizzare |
| A02 | Pianeta, orbite e rete sidebar | `packages/ui/effects/sidebar-planet/` | Procedurale originale, T02 |
| A03 | Superficie pulse e percorsi nodi | `packages/ui/effects/project-pulse/` | Procedurale originale, T10 |
| A04 | Mappa schematica e nodi presenza | `packages/ui/effects/presence-map/` | Procedurale, senza geolocalizzazione implicita, T09 |
| A05 | Sparkline, waveform e microdecorazione | `packages/ui/charts/` e `effects/` | Componenti SVG/canvas, T02/T09/T10 |
| A06 | UI font Inter e codice JetBrains Mono | `packages/ui/assets/fonts/` | Proposta; scaricare font ufficiali e registrare licenza quando aggiunti |
| A07 | Icone outline, tipi file e brand Codex/GitHub | `packages/ui/icons/` | Famiglia coerente/asset ufficiali quando inseriti, provenienza da registrare |
| A08 | Avatar e miniature preview | Risorse per utente/progetto | Dati veri, iniziali come fallback; non ritagliare volti casuali dalla PNG |

Non esistono ancora questi asset: la tabella è assegnazione del lavoro, non inventario di file già prodotti. Evitare risorse remote obbligatorie per font/decorazioni a runtime. Le miniature deploy possono provenire da immagine caricata o fonte configurata, mai da uno screenshot fittizio presentato come produzione.

## Confronto di accettazione

Per ciascuna reference verificare, in questo ordine: frame/sidebar/header, rettangoli e griglia, dimensione e wrapping testo, padding/bordi, contenuti e icone, grafici, effetti ambientali, hover/focus e movimento. Utilizzare viewport e contenuto comparabili, con nomi/lunghezze di fixture isolati quando serve il confronto deterministico.

Registrare uno screenshot per vista a ogni tranche che ne completa la composizione, più annotazione breve delle differenze materiali. Non imporre screenshot a ogni commit. Le schermate finali devono poi essere provate con dati veri, titoli lunghi, liste vuote e permessi diversi. Un confronto statico non prova streaming, accessibilità, prestazioni o build native.

La fedeltà resta da verificare fino all'implementazione: non è dimostrata dalla sola presenza di questi documenti o dal token CSS.
