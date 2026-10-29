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
5. **Mode «tocar»**: els dos tocs d'una jugada han d'anar separats ≥ 200 ms
   (`enableTapToMove` ignora tocs a menys de 180 ms); amb dos `click` seguits
   el segon es perd i la peça no es mou.
6. **Interruptors de Configuració** (`.epaper-toggle`): l'`<input>` és
   invisible, així que `page.check()` es queda esperant. Clicar l'etiqueta que
   l'embolcalla (`locator('#id').locator('xpath=..').click()`).
7. **Partida en viu**: la instantània per reprendre viu a
   `eltauler_cloud_liveGame` (local, no se sincronitza); recarregar la pàgina a
   mitja partida fa aparèixer `#live-game-banner` a l'inici i
   `#btn-live-game-resume` la reprèn. Sortir amb `#btn-back` l'esborra.
8. **Notificacions**: context amb `permissions: ['notifications']`. Sense SW
   (`serviceWorkers: 'block'`), `navigator.serviceWorker.ready` no es resol
   mai: per provar `fireDailyNotification` cal estubar `navigator.serviceWorker`
   a `undefined` i `window.Notification`, i simular `document.hidden`.

9. **Tutorials** (`tutorial.js`): `#btn-tutorial-banner` obre «Aprèn a jugar»
   (índex `.tutorial-lesson-row[data-lesson=<id>]`, tauler `#tutorial-board`,
   botons `#btn-tutorial-next/-prev/-retry`, home `#btn-back-tutorial`);
   `#btn-guide-banner` obre la guia (`.guide-item-go[data-action=<acció>]`).
   Un pas d'exercici deixa «Següent» desactivat fins que es resol; les jugades
   equivocades restableixen la posició al cap d'1,4 s. Les peces s'animen
   (~0,3 s) abans d'aparèixer a la casella de destinació. Progrés a
   `chess_tutorialProgress`; `?mode=tutorial` i `?mode=guide` són enllaços
   directes.

10. **Stockfish TV** (`stockfishtv.js`): `#btn-sftv-banner` (o `?mode=tv`)
    obre `#sftv-screen`. Estat: `ElTaulerStockfishTV._controller().state()`
    (`caps` amb les línies `uci` reals, `game.moves`, `game.comment`,
    `game.end`). Per accelerar una partida sencera, abans d'obrir-la es pot
    retocar `ElTaulerStockfishTV.TV_CONFIG` (`SPEEDS.quick`,
    `NEXT_GAME_DELAY_MS`, `ANALYSIS_MOVETIME_MS`) i triar «Àgil» a
    `#sftv-speed`. El Chromium headless no té cap veu (`getVoices()` buit):
    la veu catalana només es pot provar substituint `window.speechSynthesis`
    amb un `addInitScript`. La pestanya oculta es simula redefinint
    `document.visibilityState` i llançant `visibilitychange`. **Control
    manual**: `#sftv-undo` (jugada enrere) i `#sftv-control` (agafa/torna el
    control); l'estat és `state().control` (`color`, `yourTurn`,
    `analyzing`). Les jugades es fan clicant `#sftv-board [data-square="e2"]`
    i després la casella de destí (sense espera mínima entre tocs) o
    arrossegant amb `page.mouse` en mode «arrossegar» (escriptori).
    `_controller().userMoves(casella)` dona els destins legals.
    **Abandonament**: una partida decidida acaba amb `game.end.reason ===
    'resign'`; la sèrie és a `_controller()._internal.game.resign`. Per veure-ho
    en pocs minuts, abans d'obrir la TV baixar `TV_CONFIG.RESIGN_MIN_PLY` (p. ex.
    16), `MOVE_PREVIEW_MS`, `INTRO_DELAY_MS`, `SPEEDS.quick` i
    `PLAYER_MOVETIME_MS.skill`, i esperar `game.end` (el resultat surt a
    `.sftv-result-head` / `.sftv-result-text`). **Nivells desiguals**:
    `state().game.level.sides` (`{ w, b }` o `null`) i `level.reveal`; la
    pantalla mostra la mitjana fins al final. L'interruptor és `#sftv-unequal`
    (clicar l'etiqueta pare) i es desa a `tauler_tv_prefs.unequal`. **Perfils
    de joc**: `state().game.styles` (`{ w, b }` amb `attacker`, `wall`,
    `hunter` o `strategist`), els noms als xips dels jugadors i a `#sftv-styles`;
    interruptor `#sftv-profiles` (`tauler_tv_prefs.profiles`). Per mesurar si es
    nota l'estil cal jugar partides senceres amb el motor des de Node
    (`TV.tvPickStyledMove` + `TV.tvMoveFeatures`), no n'hi ha prou amb una.
    **Motor de Stockfish** (`#sftv-engine`, `tauler_tv_prefs.engine`:
    `classic` o `sf19`): Stockfish 19 és `stockfish-19-lite-single.js` + `.wasm`
    (vegeu `STOCKFISH-19.md`). Per provar la interfície sense executar el motor
    real, servir amb `ctx.route(/stockfish-19-lite-single\.js/)` un worker
    propi que respongui `uci` amb `option name UCI_Elo type spin default 1320
    min 1320 max 3190` i `UCI_LimitStrength`, i jugades legals (pot fer
    `importScripts` de chess.js servit amb una altra ruta). Amb un 404 s'hi veu
    el retorn al clàssic (`#sftv-engine-status`). En mode Elo, la barra té els
    esglaons 1320, 1400 … 3100, 3190.
11. **Veu neuronal Matxa** (`veuneural.js`, demo del BSC a
    `projecte-aina-matxa-alvocat-tts-ca.hf.space`): el Chromium no hi arriba
    directament, però es pot redirigir amb `ctx.route(/\.hf\.space\//, …)` i
    fer la petició des de Node amb `NODE_USE_ENV_PROXY=1
    NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` (el `fetch` de Node llavors
    passa pel proxy). Per saber si sona, embolcallar `window.Audio` en un
    `addInitScript` i escoltar `playing`/`ended`.
    **Matxa caiguda a la TV**: per provar l'espera sense xarxa, substituir
    `ElTaulerVeuNeural.sharedSpeaker` en un `addInitScript` (abans d'obrir la
    TV) per un parlant fals (`available`, `speak`, `stop`, `prefetch`,
    `unlock`, `isSpeaking`) que torni `{ spoken: false, reason: 'network' }`
    mentre una variable global ho digui. L'espera és a `state().voiceHold`
    (`attempts`, `nextTryAt`, `trying`) i a l'avís `#sftv-voice-hold`; baixar
    `TV_CONFIG.VOICE_RETRY_MS` per no esperar 8 s per intent. **Equalitzador**:
    `#sftv-matxa-eq-<banda>` i `#tts-matxa-eq-<banda>` (`low`, `lowmid`, `mid`,
    `presence`, `high`; cal disparar `input`), restablir amb `…-eq-reset`; es
    desa a `matxaEffects.eq` del perfil. **Música de fons**:
    `tauler_tv_prefs.radioBackground = { sound: 'music' }`; la melodia que
    sona surt a `#sftv-radio-status` («Ara sona: …») i canvia amb
    `_controller().newGame()`. **Mòbil**: el disseny de la TV depèn de
    `body.device-desktop`; per veure'l com en un telèfon cal un context amb
    `hasTouch: true, isMobile: true` (si no, a 420 px surt la graella
    d'escriptori i el tauler fa 0 px d'amplada).

12. **Inici (bàners per seccions)**: `#start-screen.home-d` agrupa els
    bàners en `.home-sec--juga/avui/entrena/comunitat/apren/final`; els
    identificadors dels botons són els de sempre (`#btn-new-game`,
    `#btn-settings`, `#btn-guide-banner`...). Tota la web fa servir una sola
    lletra, Plus Jakarta Sans (`--font-ui`), i cap botó no és verd. Les Google
    Fonts tampoc no carreguen des de Chromium: per veure la lletra real cal
    baixar el CSS de `fonts.googleapis.com/css2` i els `.woff2` amb `curl` i
    servir-los amb `ctx.route`. Per al mode dia o
    paper electrònic: `eltauler_day_mode` / `eltauler_epaper_mode` = `on`.
    **Portada publicada**: el desplegament hi afegeix l'accés a Remigi i el
    text SEO (`scripts/inject-remigi-link.py` i `scripts/inject-seo.py`, que
    busquen `.home-topbar` i `<!-- seo-home -->`). Per veure-la com a
    eltauler.cat, aplicar tots dos scripts a una còpia del repo i servir-la
    (la icona és `/remigi/icona-192.png`).

13. **Taulers amb veu i ràdio** (`boardexperience.js`): `#myBoard`,
    `opening-board`, `explorer-board`, `daily-board` i `tv-board` es creen amb
    `createExperienceBoard`, que embolcalla `board.position`. Un `RangeError:
    Maximum call stack size exceeded` aquí deixa la partida a «Preparat...»,
    sense rellotge (`#game-clocks` amb `display:none`) i sense poder moure.
    Per veure la pila sencera, registrar `page.on('pageerror')` amb
    `e.stack`. L'historial (`#history-board`, `historytv.js`) reprodueix al
    ritme de TV («Tranquil», 5–8 s per jugada més 1,5 s de marca), i
    «Reprodueix» només falla si abans s'ha obert una partida: cal provar-ho
    jugant primer (`#btn-new-game` → `#btn-back`) i obrint després
    `#btn-history`.

14. **Reflexos bullet** (`bulletpractice.js`, posicions a `bulletbank.js`):
    `#btn-bullet-practice` obre `#bullet-screen`. Modalitat `#bp-mode`
    (`scan`, `radar`, `sprint`, `rush` = contrarellotge) i ritme `#bp-seconds`;
    `#bp-start` o el pas del pla `#bp-plan-go`. L'estat és
    `ElTaulerBulletPractice._state()` (`status`, `task.answers`, `rows`,
    `remainingMs`): esperar `status === 'running'` (el rellotge no arrenca fins
    que les peces han carregat) i clicar origen i destí a
    `#bp-board [data-square]`. Al radar, `#bp-recall-options` demana el temps
    i després `#bp-next`; la contrarellotge passa sola a la posició següent i
    acaba als resultats (`#bp-results`, rècord a `#bp-record`). El progrés és
    a `chess_bulletPractice_v1`.

15. **Jeroglífics** (`hieroclosure.js` + generador d'app.js): sempre tres
    jugades del jugador i dues rèpliques. Per no esperar el motor, sembrar la
    cua `eltauler_hieroglyphics_state` amb un ítem que porti `conclusion`
    (generada amb `ElTaulerHieroClosure.createVerifier(Chess, anàlisi
    simulada).verify(...)`, línia de 5 mitges jugades) i obrir-lo amb
    `#btn-hieroglyphic-banner`; un ítem d'1 o 2 jugades desapareix de la cua
    en carregar. Si la FEN de l'ítem és a l'historial
    (`eltauler_hieroglyphic_history`) com a resolta, també es descarta. Els
    jeroglífics d'obertura: `startOpeningTheoryHieroglyphic()` i l'exercici
    és a `currentOpeningHieroglyphic`.

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
- **Jugar moviments reals**: context amb `hasTouch: true` (activa el mode
  tap) i clicar `.square-e2` → `.square-e4`. Per forçar jugar amb blanques,
  estubar `Math.random = () => 0.1` just abans de `#btn-new-game` i
  restaurar-lo ~1 s després. Confirmar que la jugada s'ha aplicat mirant
  `.square-<destí> img[data-piece^="w"]`; deixar ~6 s per resposta del motor
  i avaluació de la jugada (comptador `goodMoves`).
