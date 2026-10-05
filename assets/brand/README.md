# Brand JSync

**Marchio**: una J la cui curva finisce in una freccia di sincronia, con il play nell'occhiello.
Insieme dice: J (Jellyfin, il nome), sync (la freccia che torna), film (il play).

| File | Uso |
|---|---|
| `jsync-icon.svg` | Icona app (sfondo scuro + marchio) |
| `jsync-mark.svg` | Solo marchio, a colori |
| `jsync-mark-mono.svg` | Marchio monocromatico (icone a tema Android, stampa) |
| `jsync-wordmark-on-dark.*` | Logotipo orizzontale per fondo scuro |
| `jsync-wordmark-on-light.*` | Logotipo orizzontale per fondo chiaro |

**Colori**: viola `#8B5CF6` → rosa `#EC4899` (gradiente a 45°), sfondo `#07070A`, testo bianco `#FFFFFF`
oppure `#111118` sul chiaro. **Tagline** `#A78BFA` sullo scuro e `#7C3AED` sul chiaro.
**Font**: Poppins Bold (JSync) e SemiBold spaziato (SYNC YOUR FILMS), licenza OFL, convertito in tracciati.

`src/` contiene i generatori (Node + `@resvg/resvg-js` + `opentype.js`, font Poppins accanto agli script).
Rigenerano anche le icone in `assets/images/`: icona iOS, adattiva Android, splash, favicon, banner TV e `wordmark@1-3x`.
