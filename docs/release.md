# Packaging e distribuzione desktop

La versione corrente T18 è **0.17.1**; conserva la procedura di distribuzione introdotta in T16. Il desktop include Electron44.9.0 e il runtime ufficiale Codex0.159.2 per OS e architettura dell'host. Il renderer è incluso nel package; server PostgreSQL/SMTP e account Nexus sono configurati separatamente, come descritto in [self-host.md](self-host.md). Nessun processo Codex gira nel container server.

## Build nativa e file verificabili

Usare Node della `.node-version`, pnpm10.32.1 e Git. Installare prima le dipendenze con `pnpm install --frozen-lockfile`. Il runtime copiato proviene dal package ufficiale fissato dal lockfile, senza download di runtime alternativi. Eseguire il packaging sul relativo OS e architettura; sono supportati host x64/arm64, non package universali che mescolano runtime di architetture diverse.

```powershell
pnpm check
pnpm test
pnpm release:package unsigned
```

L'ultimo comando esegue la build completa, prepara il runtime nativo, crea installer e manifest, senza pubblicare una GitHub Release e senza installare l'app. È valido su Windows, macOS e Linux. I comandi esistenti `pnpm package:win`, `pnpm package:mac` e `pnpm package:linux` restano disponibili sul relativo sistema. Dopo uno di questi comandi, produrre separatamente l'evidenza con `pnpm release:manifest unsigned`; questo comando legge il package già creato e non ripete la build.

| Host | Artefatto in `release/` | Firma nel percorso unsigned |
| --- | --- | --- |
| Windows | `win/Nexus-AI-0.17.1-win-x64.exe` o `arm64.exe` | Nessuna firma sviluppatore richiesta; Authenticode osservata nel manifest |
| macOS | `mac/Nexus-AI-0.17.1-mac-arm64.dmg` o `x64.dmg` | Firma ad-hoc esplicita, hardened runtime disattivato, nessuna notarizzazione |
| Linux | `linux/Nexus-AI-0.17.1-linux-x86_64.AppImage` o `arm64.AppImage` | Firma piattaforma non applicabile |

Gli script release eliminano dall'ambiente dei figli le variabili di firma per `unsigned`; non cercano certificati personali nel portachiavi. La configurazione generata è in `.nexus/release-config`, ignorata da Git. Il comando classico `package:mac` ha anch'esso firma ad-hoc esplicita, senza selezione automatica di identità. Per build riproducibili senza credenziali preferire `release:package unsigned`. Su Linux l'eseguibile è esplicitamente `nexus-ai`, perché il nome scoped del package npm non è un nome eseguibile valido; il target AppImage normalizza `x64` in `x86_64` nel nome artefatto, mantenendo `architecture: x64` nel manifest.

Ogni installer ha accanto `<nome>.manifest.json` e `<nome>.sha256`. Il manifest contiene versione realmente letta da `app.asar`, commit sorgente e stato delle modifiche locali se disponibili, OS/architettura, toolchain, runtime confezionato, hash SHA-256 dell'eseguibile Codex e dell'installer, dimensione e risultato osservato della verifica firma. Rifiuta package e runtime con versione/piattaforma incoerenti. Gli hash permettono di rilevare corruzione; da soli non attestano un'identità del produttore.

In PowerShell verificare l'installer con `Get-FileHash .\release\win\Nexus-AI-0.17.1-win-x64.exe -Algorithm SHA256`. Su macOS usare `shasum -a 256` e su Linux `sha256sum`, confrontando il valore con il file `.sha256` ricevuto dallo stesso artefatto CI.

## Firma richiesta e notarizzazione

`pnpm release:package signed` è un percorso esplicito: su Windows/macOS fallisce prima del packaging se manca una credenziale richiesta, abilita `forceCodeSigning` e rifiuta il manifest se la verifica finale non conferma la firma. Nessuna password o certificato compare negli argomenti del processo o nel manifest.

Per Windows fornire nell'ambiente `WIN_CSC_LINK` (PFX locale o contenuto base64 secondo electron-builder) e `WIN_CSC_KEY_PASSWORD`. Il manifest esegue `Get-AuthenticodeSignature` sull'installer e richiede `Valid`. Usa Windows PowerShell del sistema con il modulo Security del sistema, anche quando pnpm parte da PowerShell7: il percorso moduli della shell genitore non viene ereditato. Il certificato non viene creato dal progetto e non è previsto alcun acquisto o fallback automatico.

Per macOS fornire `CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_NAME` (nome completo dell'identità Developer ID Application), `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`. La firma usa il certificato importato esplicitamente, hardened runtime e le entitlements Electron predefinite di electron-builder26.15.3. Lo script individua tutti i Mach-O nel runtime Codex e li passa a `mac.binaries`, inclusi gli helper forniti nel package ufficiale. Dopo la notarizzazione integrata esegue `codesign --verify --deep --strict` e `xcrun stapler validate` sulla `.app`; un risultato mancante non viene descritto come release notarizzata. Prima di distribuire, provare comunque l'app scaricata su un Mac distinto, con Gatekeeper e flusso browser→desktop effettivi. Le build ad-hoc non sostituiscono questa verifica e possono essere bloccate da Gatekeeper.

Per Linux non è configurata una firma GPG o un servizio di aggiornamenti: il manifest indica `not_applicable`. Anche una run CI richiesta come signed crea l'AppImage senza sostenere che sia firmata.

Le opzioni applicate seguono [electron-builder v26 macOS](https://www.electron.build/v26/docs/mac/) e [firma Windows v26](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/), oltre al codice della versione26.15.3 installata. Non sono utilizzate opzioni di una major diversa.

## CI e pubblicazione

Il workflow `Workspace checks` controlla ogni push/PR su Windows/macOS/Linux. La run [39100475642](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475642) ha superato check/test/build sul commit08679f4. La pipeline [39100475946](https://github.com/AndreaZero/nexus-ai/actions/runs/39100475946) ha prodotto effettivamente NSIS Windows x64 unsigned, DMG macOS ARM64 ad-hoc e AppImage Linux x64 con manifest e hash. Questi package CI sono distinti dall’esecuzione GUI personale e dalla distribuzione firmata/notarizzata.

`Native desktop packages` è attivabile manualmente da Actions oppure con tag `v*`. Il dispatch offre unsigned/signed; i tag usano sempre unsigned. Ogni job installa il lockfile, esegue check/test, build e packaging sul proprio host, poi conserva installer/manifest/hash come artifact14giorni. Mac usa l'architettura effettiva del runner, registrata nel manifest; una build Intel e una Apple Silicon si producono su host distinti.

Per il percorso CI signed configurare i secrets Windows indicati sopra e, per Mac, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `MAC_CSC_NAME` più i tre secrets `APPLE_*`. Il job mappa i nomi Mac nelle variabili standard di electron-builder. Le Actions sono fissate a versioni ufficiali verificate; il workflow ha permesso `contents: read`, nessun token di pubblicazione e nessuna creazione automatica di Release.

Prima di pubblicare una release: controllare [acceptance.md](acceptance.md), changelog e report dei tre job, verificare gli hash, provare l'installer e il runtime locale, distinguere chiaramente unsigned/ad-hoc/signed, quindi allegare manualmente installer/manifest/hash alla Release. Non includere `.env`, backup, `.nexus`, sessioni personali o `builder-debug.yml`. Mancanza di certificati e prove native personali resta un limite esplicito, non un successo implicito.

Per upgrade desktop chiudere Nexus, eseguire backup separato di database e configurazione come in self-host, quindi installare la nuova versione preservando userData del profilo. Migrazioni server sono una procedura operatore esplicita, non parte dell'installer o dell'avvio. Non esiste auto-update silenzioso; un downgrade richiede compatibilità schema verificata e un backup coerente.
