# Stato operativo

Aggiornato: **17 ottobre 2026**. **T04 implementato e consegnato per verifica Windows del maintainer** ([issue #4](https://github.com/AndreaZero/nexus-ai/issues/4)). T01–T03 accettati su Windows; il maintainer conferma login e ritorno browser → app dopo `5fa5846`. T05 non avviato.

## Risultato T04

- Workspace e progetti PostgreSQL reali, creazione/modifica, selezione per account, header e contatori reali nella shell T02 approvata. Nessun contenuto iniziale fittizio.
- Workspace owner/member amministrativi; ruoli owner/developer/client/viewer per progetto. Membership ordinaria workspace senza accesso implicito ai progetti. Repository riservato ai ruoli tecnici e email roster oscurate quando previsto.
- Inviti SMTP Mailpit: token SHA-256 nel DB, 72 ore, destinatario verificato, anteprima/accettazione, revoca/replay e issuer attuale. Ultimo owner esplicito protetto anche con mutazioni concorrenti e rimozione dal workspace.
- Renderer Projects/Team/Repos, impostazioni e inviti con sessionStorage per attraversare il login. Account browser sbagliato recuperabile con Use another account; nuovo hash invito rimonta la pagina.
- Bridge di dominio collaborazione validato in preload/main/server, cookie solo nel main. Cartella locale scelta con dialogo nativo e binding atomico per account/progetto/repository/device, nuova autorizzazione dopo dialogo e cancellazione senza scritture.
- Migrazione additiva `0001_collaboration.sql` applicata sul DB dedicato esistente, 15 tabelle totali. Audit nella transazione mutativa; task/milestone/sessioni hanno basi vuote, senza API o runtime anticipati. Nessun allegato scaricabile in T04.
- Versione root/desktop/web/server/contratti/DB **0.4.0**; UI 0.2.0 e Codex bridge 0.1.0. Nessuna nuova dipendenza. App/server precedenti vanno chiusi prima della build e riavviati dopo per API/asset nuovi.

## Ownership concluse

| Fronte | Agente | Percorsi integrati |
| --- | --- | --- |
| API/autorizzazioni | `/root/t04_server` | `apps/server/src/**`: membership, inviti, eventi, SMTP, route e test |
| Renderer | `/root/t04_web` | `apps/web/src/**`: provider/client, pagine, dialoghi, shell e roster |
| Desktop | `/root/t04_desktop` | `apps/desktop/**`: trasporto, binding, main/preload e test |
| DB/contratti/integrazione | Coordinatore | `packages/db/**`, `packages/contracts/**`, manifest/lockfile, script QA, documenti, shell aggiuntive, build/pacchetto e pubblicazione |

Skill `.agents/skills/nexus-coordination/SKILL.md` applicata; agenti integrati e ownership rilasciate. Nessuna nuova chat utente o T05 avviato.

## Evidenze T04

| Ambito | Esito |
| --- | --- |
| Statici | Typecheck completo, ESLint e confini renderer **45 file** passati. Check eseguiti in sequenza con arresto su errore; corretti confronti TS di rotte già gestite ed escape lint, poi completati controlli pertinenti |
| `pnpm test` | **42/42**: DB 3, desktop 16, server 20, web 1, confini 2. Fuori sandbox per SMTP/rename Windows; renderer sandboxed |
| `pnpm build` | Passato, web 292 moduli; manifest/lockfile coerenti senza nuove dipendenze |
| Migrazioni | Applicata e ripetuta senza duplicazioni. Corretto ordine dell'indice composto prima della FK; precedenti tentativi annullati integralmente da PostgreSQL |
| `pnpm verify:collaboration` | **12 scenari reali** HTTP/PG/Mailpit con tre account verificati: recipient/hash/replay, isolamento, proiezioni/ruoli/revoca, owner concorrenti, issuer revocato e rimozione workspace che lascerebbe progetto senza owner |
| Pulizia QA | Verifica finale: **0 account QA, 0 workspace QA**, unico account reale preesistente conservato. Rimossi solo messaggi Mailpit della prova |
| Shell Electron | Tre layout reference a 1586 × 992, quattro gate collaborazione senza account, tastiera/reduced motion e sessione a 960 px passati. Catture locali `.nexus/visual/t02/` dal comando storico |
| Pacchetto Windows | NSIS **0.4.0**, `release/win/Nexus-AI-0.4.0-win-x64.exe`, **115581755 byte**, NotSigned; nessuna installazione automatica |
| Smoke pacchetto | Exit 0: renderer montato, nuovi bridge/IPC validati e Node assente |
| Prova umana Windows T04 | Pendente: form autenticati, due account via invito, persistenza selezione e dialogo cartella nativo secondo `collaboration.md` |
| macOS/Linux | Configurazioni presenti; packaging, protocollo e keyring nativi non provati qui |

L'apertura/ritorno OS Windows T03 è stata confermata dal maintainer; i test automatici restano separati dalle prove manuali. I gate fotografati non sostituiscono la verifica visiva dei form autenticati e non contengono progetti inventati. Il test cartella sostituisce soltanto il selettore nei test e non legge file del repository.

## Prossimo passo

Il maintainer segue [T04 collaborazione](collaboration.md) e [CONTRIBUTING.md](../CONTRIBUTING.md): chiude app/backend precedenti, esegue `pnpm package:win`, riavvia `pnpm start:server` e app aggiornata o `pnpm start:desktop`. Mailpit una sola istanza, inbox `http://127.0.0.1:8025`; DB già migrato su questa macchina, nessun nuovo setup/password richiesto.

Creare workspace e due progetti, invitare un secondo account al primo, accettare con email verificata corrispondente e verificare l'isolamento dal secondo. Cambiare ruolo/rimuovere membro e ricaricare; collegare repository HTTPS e cartella locale, riaprire per controllare persistenza. Registrare feedback/correzioni prima di T05.

Limiti: presenza e sincronizzazione realtime T08, Git/runtime Codex T05/T12, API operative task/sessioni e allegati nei rispettivi task. Firma/notarizzazione e hosting T16; nessun deploy o servizio a pagamento creato. Rimane l'adattamento PKCE fissato al plugin 1.7.10, da rivedere prima degli upgrade.
