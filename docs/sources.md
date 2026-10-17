# Fonti e tracciabilità

Rilevazione: **17 ottobre 2026**, fuso Europe/Rome.

## Conversazione di prodotto

[Workspace AI condiviso](chatgpt-conversation://6ad33df6-03cc-83eb-bdf1-18366c3f9543), ID `6ad33df6-03cc-83eb-bdf1-18366c3f9543`.

Il lettore ha restituito cinque turni con messaggi utente, senza ulteriori pagine. Le risposte dell'assistente sono riferimenti `chatgpt-content-reference`, non testo leggibile. Non sono state ricostruite o trattate come decisioni approvate. Il primo messaggio leggibile sembra proseguire una discussione precedente: eventuali requisiti non presenti restano da recuperare se emergono divergenze.

| ID | Evidenza leggibile | Implicazione |
| --- | --- | --- |
| U01 | Uso principalmente per coding; colleghi e clienti possono vedere il lavoro e collaborare | Progetti, presenza, sessioni condivise e visibilità per ruolo |
| U02 | Preferenza per account e piani esistenti; API come alternativa opzionale | Account personale principale, nessuna chiave API obbligatoria |
| U03 | Preferenza per un server ospitato per evitare IP, porte e forwarding; inviti a progetto/team | Backend centrale, connessioni in uscita e membership |
| U04 | Chat e attività passano dal server per raggiungere gli altri | Cronologia condivisa ed eventi autorizzati; il server può leggere i dati condivisi |
| U05 | Scelta successiva di utilizzare solo Codex | Niente Claude o framework multiprovider nel perimetro |
| U06 | Interfaccia futuristica, dinamica, lavoro percepito dal vivo | Design live coerente con dati reali e animazioni ambientali |
| U07 | Richiesta corrente: documenti, piano, file agenti, skill, repository open source; sviluppo dopo il via | Preparare e pubblicare la base, poi attendere avvio implementazione |
| U08 | Una cosa alla volta, sviluppo parallelo per fronti, niente versioni di prova o loop infiniti; build eseguite dall'utente | Tranche definitive, ownership e verifiche limitate ai cambiamenti |
| U09 | Reference 1/2/3 da riprodurre in componenti, layout, grafici, dettagli e animazioni | Specifica dettagliata e confronto sul viewport originale |
| U10 | Chiarimento corrente: app Windows, Mac e Linux; build Mac dal Mac più avanti | Target desktop multipiattaforma da subito; evidenze build separate per OS |

## Reference visive

`examples/design/1.png`: vista cliente/team. `2.png`: sessione AI. `3.png`: overview progetto. Tutte **1586 × 992 pixel**. Geometria e colori sono stati ispezionati; i colori CSS sono una sintesi dei pixel con gradienti, non token originali recuperati. Font, frequenza delle particelle, durata animazioni e comportamento responsive non sono determinabili da una PNG: la specifica li definisce come ricostruzione.

## Documentazione ufficiale consultata

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): protocollo, schemi generati dalla CLI, conversazioni, streaming e richieste di approvazione.
- [Autenticazione Codex](https://learn.chatgpt.com/docs/auth): account ChatGPT, alternativa API e credenziali locali.
- [Codex app-server con Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server): percorso alternativo con OAuth gestito dall'app.
- [Sign in with ChatGPT per app open source](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt): identità e uso del piano come permessi distinti. Non implica importare conversazioni ChatGPT.
- [Sicurezza Electron](https://www.electronjs.org/docs/latest/tutorial/security): isolamento del renderer e confine con API native.
- [Better Auth](https://better-auth.com/docs/introduction) e [integrazione Electron](https://better-auth.com/docs/integrations/electron): candidata scelta per l'identità Nexus e accesso via browser desktop.

Queste fonti supportano la fattibilità della proposta, non sostituiscono la verifica della versione che sarà fissata nel lockfile. Il runtime Codex adottato dovrà produrre il proprio schema. Nessun modello, prezzo, quota o diritto di accesso è hardcoded dai mockup.
