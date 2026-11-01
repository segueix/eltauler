const fs = require('fs');
const path = require('path');

describe('disposició dels jeroglífics', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    test('la descripció i el tauler comparteixen columna abans dels controls', () => {
        const wrapper = html.indexOf('<div class="game-board-column">');
        const panel = html.indexOf('id="hieroglyphic-panel"', wrapper);
        const board = html.indexOf('id="game-board-stage"', panel);
        const end = html.indexOf('<!-- /game-board-column -->', board);
        const controls = html.indexOf('<div class="controls">', board);
        expect(wrapper).toBeGreaterThan(0);
        expect(panel).toBeGreaterThan(wrapper);
        expect(board).toBeGreaterThan(panel);
        expect(end).toBeGreaterThan(board);
        expect(controls).toBeGreaterThan(end);
    });

    test('Veu i ràdio es mou sota la descripció a ordinador i torna al seu lloc a mòbil', () => {
        const src = fs.readFileSync(path.join(__dirname, '../boardexperience.js'), 'utf8');
        expect(html).toContain('id="myBoard-broadcast-home"');
        expect(html).toContain('body.device-desktop #game-screen.active .game-board-column > #myBoard-broadcast');
        expect(html).toMatch(/\.game-board-column > #myBoard-broadcast \{[^}]*order:\s*2;/);
        expect(html).toMatch(/boardexperience\.js\?v=\d+\.\d+\.\d+/);
        expect(src).toContain("column.appendChild(host)");
        expect(src).toContain("home.insertAdjacentElement('afterend', host)");
        expect(src).toContain("document.body.classList.contains('device-desktop')");
        expect(src).toContain('layoutObserver.disconnect()');
    });

    test('a escriptori el tauler va primer i la descripció queda a sota', () => {
        expect(html).toContain('body.device-desktop #game-screen.active > .game-board-column');
        expect(html).toContain('body.device-desktop #game-screen.active .game-board-column > .board-container');
        expect(html).toContain('body.device-desktop #game-screen.active .game-board-column > #hieroglyphic-panel');
        expect(html).toMatch(/\.game-board-column > \.board-container \{[^}]*order:\s*-1;/);
        expect(html).toContain('body.device-mobile #game-screen > .game-board-column { display: contents; }');
    });

    // La finestra de jeroglífic resolt és molt més alta que el tauler: al mòbil
    // sortia per dalt (tallada) i per baix (damunt del panell, que es veia a través).
    test('al mòbil, la finestra de jeroglífic resolt ocupa la pantalla i es desplaça per dins', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        const rule = (sel) => {
            const at = html.indexOf(sel + ' {');
            expect(at).toBeGreaterThan(0);
            return html.slice(at, html.indexOf('}', at));
        };
        const overlay = rule('body:not(.desktop-results) .bundle-success-overlay.hg-result-overlay');
        expect(overlay).toMatch(/position:\s*fixed;\s*inset:\s*0/);
        expect(overlay).toMatch(/align-items:\s*flex-start/);
        expect(overlay).toMatch(/overflow-y:\s*auto/);
        expect(overlay).toMatch(/background:\s*rgba\(8, 6, 4, 0\.9\d\)/);
        // Centrada quan hi cap i, si no, començant per dalt (mai tallada per dalt)
        expect(rule('body:not(.desktop-results) .hg-result-overlay .bundle-success-content')).toMatch(/margin:\s*auto 0/);
        // Els botons no parteixen paraules
        expect(rule('body:not(.desktop-results) .hg-result-overlay .btn')).toMatch(/overflow-wrap:\s*normal/);

        const show = app.slice(app.indexOf('function showHieroglyphicBundleOverlay()'));
        const body = show.slice(0, show.indexOf('\n}\n'));
        expect(body).toContain("overlay.addClass('hg-result-overlay')");
        expect(body).toContain('overlay.scrollTop(0)');
        // La resta de resultats (tàctiques, repàs, repte diari...) no la porten
        const handle = app.slice(app.indexOf('function handleBundleSuccess()'));
        expect(handle.slice(0, 400)).toContain("removeClass('hg-result-overlay')");
    });

    test('historial de jeroglífics al mòbil: el botó d’anar a l’inici va a la dreta de «Juga’n un de nou»', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        const render = app.slice(app.indexOf('function renderHieroglyphicHistoryScreen()'));
        const cta = render.slice(render.indexOf("$('#hgh-cta').html("), render.indexOf("root.find('[data-hgh-filter-status]')"));
        // A la mateixa filera, la casa després (a la dreta)
        expect(cta).toContain('<div class="hgh-cta-actions">');
        expect(cta.indexOf('id="hgh-play-next"')).toBeGreaterThan(cta.indexOf('hgh-cta-actions'));
        expect(cta.indexOf('id="hgh-cta-home"')).toBeGreaterThan(cta.indexOf('id="hgh-play-next"'));
        expect(cta).toContain('aria-label="Pàgina principal"');
        expect(render).toContain("'#hgh-home, #hgh-cta-home', () => navGoBack()");
        // Només al mòbil; allà el del peu s'amaga, i a l'ordinador queda el del peu
        expect(html).toContain('.hgh-cta .hgh-cta-home { display: none; }');
        expect(html).toMatch(/body\.device-mobile \.hgh-cta \.hgh-cta-home \{ display: inline-flex;/);
        expect(html).toContain('body.device-mobile #hg-history-screen .hgh-foot { display: none; }');
        expect(html).toContain('id="hgh-home"');
    });
});
