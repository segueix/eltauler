const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

describe('Rival Antídot — integració Stockfish 19', () => {
    const section = src.slice(
        src.indexOf('// Motor: el Stockfish 19 compartit (sf19Submit)'),
        src.indexOf('// ── Preferències del comentari en viu')
    );
    const search = src.slice(
        src.indexOf('function makeAntidoteEngineMove()'),
        src.indexOf('function applyAntidoteAnalysis(')
    );

    test('fa servir el Stockfish 19 compartit, sense cap worker propi', () => {
        expect(src).toContain('const ANTIDOTE_STOCKFISH_URL = HIERO_STOCKFISH_URL;');
        expect(src).toContain('stockfish-19-lite-single.js');
        expect(section).not.toContain('new Worker(');
        expect(section).toContain('void ensureHieroStockfish();');
        // Sortir de la partida atura la cerca i descarta les pendents.
        expect(section).toContain("sf19Cancel('antidote');");
    });

    test('la cerca és una feina «play»: passa davant de tot', () => {
        expect(search).toContain("await sf19Submit('play', async engine => {");
        expect(search).toContain("{ tag: 'antidote' }");
        expect(search).toContain("bail('uci-not-ready')");
    });

    test('una cerca antiga o fallida no pot aplicar cap jugada', () => {
        expect(search).toContain('token !== antidoteSearchToken');
        expect(search).toContain('game.fen() !== fen');
        expect(search).toContain('releaseAntidoteEngine()');
        expect(search).toContain('if (!applied) bail(');
    });
});
