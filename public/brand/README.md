# Fervent — Brand Assets

Marchio: **Onda termica** + logotipo **Fervent.**
Palette termica: freddo #2F6CF0 → #9A55B8 → caldo #FFB24A · accento punto #F06A2A
Sfondo squircle: #13243F → #0A1220

## Contenuto

### Icona app
- `Fervent-icon.svg` — master vettoriale (1024, full-bleed squircle)
- `Fervent-icon-mono.svg` — versione monocromo (bianco su scuro)
- `png/Fervent-icon-{16..1024}.png` — set PNG pronto all'uso
- `favicon/` — favicon.svg + PNG 16/32/48 per il web

### macOS .icns
- `Fervent.iconset/` — cartella pronta per iconutil.
  Genera il .icns con:
  ```
  iconutil -c icns Fervent.iconset
  ```
  (comando incluso nello script `make-icns.sh`)

### Logotipo & lockup
- `Fervent-wordmark-{dark,light}.svg` — solo testo, per fondo chiaro/scuro
- `Fervent-lockup-{dark,light}.svg` — icona + testo
- `png/*-2x.png` — render PNG trasparenti @2x

## Note
Il logotipo usa Helvetica Neue Light (font di sistema macOS). Per ambienti
senza Helvetica Neue, sostituibile con Inter Light / Arial mantenendo il peso 300.
