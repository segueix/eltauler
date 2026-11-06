// Icones de la revisió i de les estadístiques: del joc d'icones SVG de l'app
// (traç, colors del tema), no emojis.
const fs = require('fs');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');

describe('icones de revisió i estadístiques', () => {
    test('existeixen les icones ic-review i ic-stats, només de traç', () => {
        for (const id of ['ic-review', 'ic-stats']) {
            const a = html.indexOf(`<symbol id="${id}" viewBox="0 0 24 24">`);
            expect(a).toBeGreaterThan(-1);
            const sym = html.slice(a, html.indexOf('</symbol>', a));
            expect(sym).not.toMatch(/fill="/);
        }
    });

    test('la finestra de revisió i l\'historial fan servir ic-review', () => {
        expect(html).toContain('<div class="modal-title modal-title--ic"><svg class="modal-title-ic" aria-hidden="true"><use href="#ic-review"/></svg>Revisió de la partida</div>');
        expect(html).toMatch(/<div class="history-review-title"><svg class="btn-ic" aria-hidden="true"><use href="#ic-review"\/><\/svg>Revisió de la partida<\/div>/);
        expect(app).toContain(`const REVIEW_ICON_SVG = '<svg class="btn-ic" aria-hidden="true"><use href="#ic-review"/></svg>';`);
        expect(app).toContain('`${REVIEW_ICON_SVG} Revisió de la partida`');
    });

    test('estadístiques: la capçalera, el mosaic de l\'inici i «Veure evolució» fan servir ic-stats', () => {
        expect(html).toMatch(/<div class="stats-header">\s*<svg class="app-logo-svg" aria-hidden="true"><use href="#ic-stats"\/><\/svg>\s*<h1>Estadístiques<\/h1>/);
        expect(html).toMatch(/id="btn-stats">\s*<svg class="hb-tile-ic" aria-hidden="true"><use href="#ic-stats"\/><\/svg>/);
        expect(html).toContain('id="btn-review-stats"><svg class="btn-ic" aria-hidden="true"><use href="#ic-stats"/></svg>Veure evolució');
    });

    test('ja no queda cap 📈 ni 📊', () => {
        expect(html).not.toMatch(/📈|📊/);
        expect(app).not.toMatch(/📈|📊/);
    });
});
