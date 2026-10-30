const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

describe('Rival Antídot — integració Stockfish 19', () => {
    const section = src.slice(
        src.indexOf('let antidoteEngineReadyPromise = null;'),
        src.indexOf('// ── Preferències del comentari en viu')
    );
    const search = src.slice(
        src.indexOf('function makeAntidoteEngineMove()'),
        src.indexOf('function applyAntidoteAnalysis(')
    );

    test('comparteix binaris Stockfish 19 però no el worker de jeroglífics', () => {
        expect(src).toContain('const ANTIDOTE_STOCKFISH_URL = HIERO_STOCKFISH_URL;');
        expect(src).toContain('stockfish-19-lite-single.js');
        expect(section).toContain('new Worker(ANTIDOTE_STOCKFISH_URL)');
        expect(section).not.toContain('createStockfishWorker()');
        expect(section).toContain('worker.terminate()');
    });

    test('espera la inicialització UCI abans de començar la cerca', () => {
        expect(section).toContain("worker.postMessage('uci')");
        expect(section).toContain("worker.postMessage('isready')");
        expect(section).toContain("event.data.trim() === 'readyok'".replace('event', 'e'));
        expect(search).toContain('await (antidoteEngineReadyPromise || Promise.resolve(false))');
        expect(search).toContain("bail('uci-not-ready')");
    });

    test('una cerca antiga o fallida no pot aplicar cap jugada', () => {
        expect(search).toContain('token !== antidoteSearchToken');
        expect(search).toContain('game.fen() !== fen');
        expect(search).toContain('releaseAntidoteEngine()');
        expect(search).toContain('if (!applied) bail(');
    });
});
