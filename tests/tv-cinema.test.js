// Mode cinema de la Lliga de llegendes TV (stockfishtv.js): fons negre i només
// el tauler i els dos jugadors, a l'ordinador i al mòbil. La mida del tauler la
// calcula tvCinemaLayout (lògica pura); la resta es comprova al codi font.
const fs = require('fs');
const path = require('path');
const TV = require('../stockfishtv');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../stockfishtv.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const G = TV.TV_CINEMA.GAP;

describe('tvCinemaLayout: el tauler s\'adapta a la pantalla', () => {
    test('ordinador (1440×900 sense marges): tauler a tota l\'alçada i jugadors a la dreta', () => {
        const l = TV.tvCinemaLayout({ width: 1416, height: 876, playersHeight: 150 });
        expect(l.mode).toBe('side');
        expect(l.size).toBe(876);
        expect(l.sideWidth).toBe(TV.TV_CINEMA.SIDE_MAX);
        expect(l.size + G + l.sideWidth).toBeLessThanOrEqual(1416);
    });

    test('pantalla gran (1920×1080): el tauler creix amb la pantalla', () => {
        const petita = TV.tvCinemaLayout({ width: 1000, height: 616, playersHeight: 150 });
        const gran = TV.tvCinemaLayout({ width: 1896, height: 1056, playersHeight: 150 });
        expect(gran.mode).toBe('side');
        expect(gran.size).toBe(1056);
        expect(gran.size).toBeGreaterThan(petita.size);
    });

    test('mòbil dret: jugadors a dalt i a baix i el tauler tan ample com la pantalla', () => {
        const l = TV.tvCinemaLayout({ width: 366, height: 820, playersHeight: 122 });
        expect(l.mode).toBe('stack');
        expect(l.size).toBe(366);
    });

    test('mòbil apaïsat: tauler a tota l\'alçada i jugadors al costat', () => {
        const l = TV.tvCinemaLayout({ width: 820, height: 366, playersHeight: 122 });
        expect(l.mode).toBe('side');
        expect(l.size).toBe(366);
        expect(l.size + G + l.sideWidth).toBeLessThanOrEqual(820);
    });

    test('apilat, les fitxes dels jugadors i els espais resten alçada al tauler', () => {
        const l = TV.tvCinemaLayout({ width: 700, height: 760, playersHeight: 140 });
        expect(l.mode).toBe('stack');
        expect(l.size).toBe(760 - 140 - 2 * G);
    });

    test('amb poca diferència es manté la disposició d\'ara (no salta en canviar la finestra)', () => {
        // stack = min(820, 1000 - 160 - 20) = 820; side = min(1000, 820 - 197 - 10) = 613 → stack clar.
        expect(TV.tvCinemaLayout({ width: 820, height: 1000, playersHeight: 160, current: 'side' }).mode).toBe('stack');
        // stack = min(900, 720 - 120 - 20) = 580; side = min(720, 900 - 216 - 10) = 674 → side clar.
        expect(TV.tvCinemaLayout({ width: 900, height: 720, playersHeight: 120, current: 'stack' }).mode).toBe('side');
        // Gairebé iguals: stack = min(780, 760 - 150 - 20) = 590; side = min(760, 780 - 187 - 10) = 583.
        const prop = { width: 780, height: 760, playersHeight: 150 };
        expect(TV.tvCinemaLayout(prop).mode).toBe('stack');
        expect(TV.tvCinemaLayout({ ...prop, current: 'side' }).mode).toBe('side');
        expect(TV.tvCinemaLayout({ ...prop, current: 'stack' }).mode).toBe('stack');
    });

    test('mai no dona un tauler més petit que el mínim, ni amb dades absurdes', () => {
        expect(TV.tvCinemaLayout({ width: 50, height: 40, playersHeight: 300 }).size).toBe(TV.TV_CINEMA.MIN_BOARD);
        const l = TV.tvCinemaLayout({ width: 'x', height: undefined });
        expect(['stack', 'side']).toContain(l.mode);
        expect(l.size).toBe(TV.TV_CINEMA.MIN_BOARD);
        expect(TV.tvCinemaLayout().size).toBe(TV.TV_CINEMA.MIN_BOARD);
    });
});

describe('Mode cinema a la pantalla de la TV', () => {
    test('el botó «Mode cinema» substitueix el d\'ampliar i també surt al mòbil', () => {
        expect(html).toMatch(/<button type="button" class="sftv-cinema-btn" id="sftv-cinema"[^>]*>.*<span>Mode cinema<\/span><\/button>/);
        expect(html).not.toContain('sftv-expand');
        expect(html).not.toContain('is-expanded');
        expect(html).not.toMatch(/body\.device-mobile #sftv-cinema\b[^{]*\{[^}]*display:\s*none/);
        expect(js).toContain("on('sftv-cinema', 'click', enterCinema);");
    });

    test('fons completament negre i només el tauler i els dos jugadors', () => {
        const rule = html.match(/#sftv-screen\.is-cinema \{([^}]*)\}/);
        expect(rule).not.toBeNull();
        expect(rule[1]).toContain('background: #000;');
        expect(rule[1]).toContain('position: fixed; inset: 0;');
        expect(html).toContain('#sftv-screen::backdrop { background: #000; }');
        // S'amaga tot menys el tauler i les fitxes dels jugadors (i el botó de sortida).
        expect(html).toContain('#sftv-screen.is-cinema > :not(.sftv-layout):not(.sftv-cinema-exit),');
        expect(html).toContain('#sftv-screen.is-cinema .sftv-side, #sftv-screen.is-cinema .sftv-ladder,');
        expect(html).toContain('#sftv-screen.is-cinema .sftv-board-col > :not(.sftv-player):not(.sftv-board-wrap) { display: none !important; }');
    });

    test('el límit d\'escriptori del tauler no s\'imposa al mode cinema (abans l\'ampliació no el feia créixer)', () => {
        // body.device-desktop #sftv-screen #sftv-board (0,2,1,1) limitava l'amplada a
        // 100vh - 330px; la regla del mode cinema és més específica (0,2,2,1).
        expect(html).toContain('body.device-desktop #sftv-screen #sftv-board,');
        expect(html).toContain('body.sftv-cinema #sftv-screen.is-cinema #sftv-board { width: 100%; max-width: none; margin: 0; }');
        expect(html).toContain('grid-template-columns: var(--sftv-cinema-size, min(92vw, 62vh));');
        expect(html).toContain('grid-template-columns: var(--sftv-cinema-size) var(--sftv-cinema-side, 240px);');
        expect(js).toContain("screen.style.setProperty('--sftv-cinema-size', layout.size + 'px');");
        expect(js).toContain("screen.classList.toggle('is-cinema-side', layout.mode === 'side');");
    });

    test('se\'n surt amb el botó, amb Esc, en deixar la pantalla completa o amb el gest d\'enrere', () => {
        expect(html).toContain('id="sftv-cinema-exit" aria-label="Surt del mode cinema"');
        expect(js).toContain("on('sftv-cinema-exit', 'click', () => exitCinema());");
        expect(js).toMatch(/ev\.key === 'Escape' && cinema\) \{[\s\S]{0,120}exitCinema\(\);/);
        expect(js).toMatch(/else if \(nativeFullscreen\) \{[\s\S]{0,200}exitCinema\(\);/);
        // El gest d'enrere només surt del mode cinema: la TV no es tanca.
        const back = app.slice(app.indexOf("} else if (current === 'sftv-screen') {"));
        expect(back.indexOf('ElTaulerStockfishTV.handleBack()')).toBeGreaterThan(-1);
        expect(back.indexOf('ElTaulerStockfishTV.handleBack()')).toBeLessThan(back.indexOf('ElTaulerStockfishTV.closeScreen()'));
        expect(js).toContain("root.history.pushState({ screen: 'sftv-screen', sftvCinema: true }, '', root.location.href);");
    });

    test('sense pantalla de la TV ni historial propi, «enrere» segueix el camí de sempre', () => {
        expect(TV.handleBack()).toBe(false);
        expect(TV.isCinema()).toBe(false);
    });

    test('tancar la TV en surt sense tocar l\'historial', () => {
        const close = js.slice(js.indexOf('function closeScreen() {'));
        expect(close.split('\n')[1].trim()).toBe('exitCinema({ closing: true });');
    });
});
