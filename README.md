# Rave — player Jellyfin per guardare insieme

App React Native (Expo SDK 57) per **iPhone, Android e Android TV**. Ognuno inserisce il proprio server
Jellyfin, accede col proprio account e guarda **film e serie TV** da solo o in **gruppo**, sincronizzato
al millisecondo con gli altri.

**Non c'è nessun server di Rave.** L'app parla solo col Jellyfin dell'utente. I gruppi sono i gruppi
**SyncPlay** nativi di quel server, e progressi, "continua a guardare" e "salta intro" vivono anch'essi lì.
Niente da ospitare né da mantenere: si pubblica sugli store e basta.

Musica, libri, audiolibri, foto e TV in diretta sono esclusi apposta: si vedono solo librerie video.

## Cosa fa

- **Connessione**: indirizzo del server (prova https, poi http), login con utente e password oppure
  **Quick Connect** (comodo sulla TV). Più account e più server, con passaggio dall'uno all'altro.
- **Home stile Netflix**: in evidenza, continua a guardare, prossimi episodi, aggiunti di recente per libreria.
- **Scheda**: riprendi o ricomincia, stagioni ed episodi, segna come visto, "Guarda nel gruppo".
- **Player**: controlli propri, barra con anteprima e segmenti, ±10 s, scelta audio e sottotitoli,
  **salta intro e riassunto** (Media Segments di Jellyfin 10.10+ o plugin Intro Skipper), **prossimo
  episodio** con conto alla rovescia, orizzontale bloccato, barre di sistema nascoste.
- **Gruppi**: crea, entra, partecipanti; in gruppo play, pausa, salti e prossimo episodio valgono per tutti.
  **Inviti** tramite link `rave://join?...` condiviso da WhatsApp e simili, QR (anche mostrato sulla TV),
  scansione QR o incolla link. Chi apre l'invito entra col **suo** account di quel server.
- **Android TV**: focus del telecomando su ogni elemento, D-pad nel player (sinistra/destra = ±10 s),
  tasti multimediali, banner del launcher.

## Requisiti lato server (dell'utente)

- Jellyfin **10.9 o successivo**. Testato sul server demo ufficiale (12.1.0).
- Per i gruppi l'utente deve avere il permesso SyncPlay: Dashboard → Utenti → "Accesso SyncPlay".
- Per "salta intro": Jellyfin 10.10+ con un provider di Media Segments (es. plugin Intro Skipper).

## Avvio in sviluppo

```bash
npm install
npx expo start --tunnel --go --port 8090   # poi Expo Go → Development servers (stesso account Expo)
```

Comandi utili: `npm run typecheck`, `npx eslint src`, `npx expo-doctor`.

## Build

```bash
npx eas-cli@latest build -p ios --profile production      # App Store (serve account Apple Developer)
npx eas-cli@latest build -p android --profile production  # Play Store (.aab)
npx eas-cli@latest build -p android --profile preview     # APK da installare a mano
npx eas-cli@latest build -p android --profile tv          # APK per Android TV (EXPO_TV=1)
```

Telefoni ed Expo Go usano React Native standard. Solo le build TV passano al fork `react-native-tvos`:
lo fa `scripts/use-tvos.js`, che EAS esegue prima dell'installazione (`eas-build-pre-install`) quando
`EXPO_TV=1`. In locale: `npm run tv:prebuild && npm run tv:android`, poi `git checkout package.json`
per tornare al React Native standard.

## Prima di pubblicare sugli store

- **Nome**: "Rave" è già il nome di un'app di watch party molto nota ("Rave – Watch Party").
  Serve un nome diverso per evitare il rifiuto o un reclamo per il marchio.
- **Revisione Apple**: ai revisori va dato un server di prova. Va bene quello demo pubblico di
  Jellyfin (`https://demo.jellyfin.org/stable`, utente `demo`, senza password), che l'app propone
  anche da un pulsante. Nelle note va spiegato che è un client per server personali, come Swiftfin
  e Infuse.
- **Privacy**: l'app non raccoglie dati, quindi in App Store Connect si dichiara "Dati non raccolti".
  `NSAllowsArbitraryLoads` è attivo perché molti server Jellyfin sono in http su rete locale; ad Apple
  va motivato così.
- **Bundle id** provvisorio: `com.thecomputer07.rave` (in `app.json`).

## Struttura

```
src/
  app/                     rotte expo-router
    (tabs)/                home · search · groups · settings
    connect.tsx login.tsx  ingresso a un server
    item/[id].tsx          scheda film/serie/episodio
    library/[id].tsx       griglia di una libreria
    player.tsx             player + aggancio SyncPlay
    join.tsx scan.tsx      inviti (link e QR)
  lib/jellyfin/            client REST, WebSocket, profilo dispositivo e scelta dello stream
  lib/syncplay/            orologio col server (NTP su /GetUtcTime) e gestore SyncPlay
  state/session.tsx        account, impostazioni, client/socket/gruppo dell'account attivo
  components/              UI (focus TV, copertine, righe, toast, barra del player, tracce)
```

## Come funziona la sincronizzazione

Il server Jellyfin decide, i client eseguono. Play, pausa e seek in gruppo non toccano il player
locale: diventano richieste al server, che rimanda a tutti lo stesso comando con un istante "When"
nel futuro. Ogni app converte quell'istante nel proprio orologio (scarto misurato stile NTP) e parte
lì. Durante la riproduzione la deriva si corregge così:
- **sotto 1,5 s**: variando la velocità entro ±20%, senza strappi;
- **oltre 1,5 s**: con un salto diretto alla posizione giusta.

Chi va in buffering mette in attesa il gruppo. Chi chiude il player smette di bloccarlo
(`SetIgnoreWait`).

### Verifica fatta

Il codice reale (client, socket, orologio, gestore) è stato provato sul server demo ufficiale con
due dispositivi simulati, con l'orologio del server sfasato di 1,4 s:

| Scenario | Scarto fra i due player |
|---|---|
| Partenza | 0 ms |
| Deriva simulata di 1,2 s, dopo la correzione | ≤ 7 ms |
| Pausa, seek, ripresa | ≤ 15 ms |
| Ripresa dopo un buffering | ≤ 17 ms |
| Prossimo film | ≤ 15 ms |

Funzionano anche `IgnoreWait` e l'uscita dal gruppo.

Due compatibilità scoperte durante i test e già gestite:
- dalla 10.11 Jellyfin rifiuta il token in query `api_key` (HTTP 401): l'app manda anche `ApiKey`;
- le date del server hanno 7 decimali: l'app le tronca ai millisecondi prima di leggerle.

Ancora da provare su dispositivi veri: riproduzione nel player nativo, sottotitoli via HLS su
file MKV, e Android TV.
