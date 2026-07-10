# Verificació d'El Tauler (PWA estàtica)

Com arrencar i conduir l'app real per verificar canvis.

## Arrencada

```bash
python3 -m http.server 8877 --bind 127.0.0.1 &   # des de l'arrel del repo
```

Conduir amb Playwright + Chromium preinstal·lat
(`executablePath: '/opt/pw-browsers/chromium'`, headless).

## Gotcha crítics (entorn remot)

1. **Els CDN no carreguen des de Chromium** (jQuery, chess.js, chessboard-js,
   chart.js): el navegador no passa pel proxy de la sessió. Sense jQuery,
   `$(document).ready` d'app.js no s'executa i la pàgina mostra els valors
   estàtics de l'HTML (p. ex. `#current-elo` = "400"). Solució: baixar els
   fitxers amb `curl` (sí que passa pel proxy) i servir-los amb
   `ctx.route(...)` de Playwright.
2. **Ordre de rutes**: Playwright avalua primer l'ÚLTIMA ruta registrada.
   Registrar l'abort-all de peticions externes PRIMER i les rutes específiques
   dels CDN després.
3. **Service worker**: intercepta fetch i se salta les rutes de Playwright.
   Crear el context amb `serviceWorkers: 'block'`.
4. Les imatges de peces (chessboardjs.com) es poden avortar: el tauler es veu
   amb imatges trencades però tota la lògica funciona.

## Fluxos útils

- **Final de partida real per la UI**: `#btn-new-game` → `#btn-resign` →
  `#btn-resign-confirm` → (espera ~2,5 s) → `#review-modal` →
  `#btn-review-close`. En partida de calibratge això completa el calibratge.
- **Estat**: tot viu a localStorage amb prefix `chess_`
  (`chess_calibratgeComplet`, `chess_calibrationProfile`, `chess_userELO`,
  `chess_username`...). Sembrar estats antics amb `ctx.addInitScript`.
- **Sessió de Google**: no es pot fer real en headless; stub
  `window.CloudSync.isSignedIn = () => true` i conduir la UI real.
- **Consentiment**: clicar `#cookie-accept` al primer load (o sembrar
  `eltauler_cloud_consent=1`).
- **Navegació**: usar els botons de l'app (`#btn-settings`,
  `#btn-back-settings`...), no `page.goBack()`.
