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

    test('a escriptori el tauler va primer i la descripció queda a sota', () => {
        expect(html).toContain('body.device-desktop #game-screen.active > .game-board-column');
        expect(html).toContain('body.device-desktop #game-screen.active .game-board-column > .board-container');
        expect(html).toContain('body.device-desktop #game-screen.active .game-board-column > #hieroglyphic-panel');
        expect(html).toMatch(/\.game-board-column > \.board-container \{[^}]*order:\s*-1;/);
        expect(html).toContain('body.device-mobile #game-screen > .game-board-column { display: contents; }');
    });
});
