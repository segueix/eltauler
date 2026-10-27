#!/usr/bin/env node
// ============================================================================
// scripts/gen-tv-fixtures.js — partides de prova per a la retransmissió de TV
// ============================================================================
// Fa jugar el MATEIX stockfish.js de l'app contra si mateix (amb «Skill
// Level», com Stockfish TV) i desa, per a cada posició, l'anàlisi pedagògica
// sense límit de força (MultiPV 2). Les proves de cobertura dels comentaris
// (tests/tvcommentary.test.js) repassen aquestes partides amb posicions i
// valoracions reals sense haver de calcular res durant el test.
//
// Ús:  node scripts/gen-tv-fixtures.js [--depth 12] [--out tests/fixtures/tv-games.json]
// ============================================================================
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const DEPTH = Number(opt('--depth', 12));
const OUT = path.resolve(ROOT, opt('--out', 'tests/fixtures/tv-games.json'));
const PLAYER_MS = 200;

const listeners = [];
global.postMessage = (m) => { listeners.slice().forEach(fn => fn(String(m))); };
require(path.join(ROOT, 'stockfish.js'));
const send = (cmd) => { lastCmd = cmd; global.onmessage({ data: cmd }); };
let lastCmd = '';
function until(pred, what) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Sense resposta (' + (what || '?') + ') després de: ' + lastCmd)), (+process.env.TV_FIXTURE_TIMEOUT || 120000));
        const fn = (l) => { if (pred(l)) { clearTimeout(timer); listeners.splice(listeners.indexOf(fn), 1); resolve(l); } };
        listeners.push(fn);
    });
}
async function ready() { const p = until(l => l === 'readyok'); send('isready'); await p; }

function parseInfo(line) {
    if (line.indexOf('info') !== 0 || line.indexOf(' pv ') === -1 || /bound/.test(line)) return null;
    const d = /\bdepth (\d+)/.exec(line);
    const mpv = /\bmultipv (\d+)/.exec(line);
    const cp = /\bscore cp (-?\d+)/.exec(line);
    const mate = /\bscore mate (-?\d+)/.exec(line);
    if (!d || (!cp && !mate)) return null;
    return { depth: +d[1], multipv: mpv ? +mpv[1] : 1, type: mate ? 'mate' : 'cp', value: +(mate || cp)[1],
        pv: / pv (.+)$/.exec(line)[1].trim().split(/\s+/).slice(0, 8) };
}

async function search(position, setup, go) {
    setup.forEach(send);
    await ready();
    send(position);
    const infos = {};
    const handler = (l) => { const i = parseInfo(l); if (i) infos[i.multipv] = i; };
    listeners.push(handler);
    const done = until(l => l.indexOf('bestmove') === 0);
    send(go);
    const bm = await done;
    listeners.splice(listeners.indexOf(handler), 1);
    const m = /^bestmove\s+(\S+)/.exec(bm);
    return { bestUci: m && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m[1]) ? m[1] : null, infos };
}

const ONLY = process.env.TV_FIXTURE_ONLY ? process.env.TV_FIXTURE_ONLY.split(',').map(Number) : null;
const GAMES_ALL = [
    { name: 'Italiana (nivell 6 contra 6)', opening: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'], skill: { w: 6, b: 6 }, maxPlies: 150 },
    { name: 'Gambit de dama refusat (10 contra 3)', opening: ['d2d4', 'd7d5', 'c2c4', 'e7e6'], skill: { w: 10, b: 3 }, maxPlies: 150 },
    { name: 'Siciliana (2 contra 8)', opening: ['e2e4', 'c7c5', 'g1f3', 'd7d6'], skill: { w: 2, b: 8 }, maxPlies: 150 },
    { name: 'Final de rei i peons', fen: '8/pp3kpp/8/2P5/8/1P3K2/P5PP/8 w - - 0 1', skill: { w: 8, b: 8 }, maxPlies: 90 },
    { name: 'Final de torres', fen: '6k1/5pp1/7p/8/2P5/1P6/r4PPP/3R2K1 w - - 0 1', skill: { w: 8, b: 6 }, maxPlies: 90 }
];

const GAMES = ONLY ? GAMES_ALL.filter((g, i) => ONLY.indexOf(i) !== -1) : GAMES_ALL;

(async () => {
    await new Promise(r => setTimeout(r, 50));
    const uciOk = until(l => l === 'uciok');
    send('uci');
    await uciOk;
    const out = [];
    for (const spec of GAMES) {
        const chess = spec.fen ? new Chess(spec.fen) : new Chess();
        const startFen = chess.fen();
        const moves = [];
        const analyses = [];
        send('ucinewgame');
        const posCmd = (list) => 'position fen ' + startFen + (list.length ? ' moves ' + list.join(' ') : '');
        while (!chess.game_over() && moves.length < spec.maxPlies) {
            const a = await search(posCmd(moves), ['setoption name Skill Level value 20', 'setoption name MultiPV value 2'], 'go depth ' + DEPTH);
            analyses.push({ fen: chess.fen(), bestUci: a.bestUci, infos: a.infos });
            let uci = spec.opening && moves.length < spec.opening.length ? spec.opening[moves.length] : null;
            if (!uci) {
                const p = await search(posCmd(moves), ['setoption name Skill Level value ' + spec.skill[chess.turn()], 'setoption name MultiPV value 1'], 'go movetime ' + PLAYER_MS);
                uci = p.bestUci;
            }
            const mv = uci && chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
            if (!mv) break;
            moves.push(uci);
            process.stderr.write(process.env.TV_FIXTURE_DEBUG ? '\n' + moves.length + ' ' + chess.fen() : '.');
        }
        // Aquest motor no respon a «go» en una posició acabada (mat o ofegat).
        const a = chess.game_over() ? { bestUci: null, infos: {} }
            : await search(posCmd(moves), ['setoption name Skill Level value 20', 'setoption name MultiPV value 2'], 'go depth ' + DEPTH);
        analyses.push({ fen: chess.fen(), bestUci: a.bestUci, infos: a.infos });
        out.push({ name: spec.name, startFen, prepared: spec.opening ? spec.opening.length : 0, moves, analyses });
        process.stderr.write('\n' + spec.name + ': ' + moves.length + ' semijugades\n');
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ generatedWith: 'stockfish.js (2019-08-15) · anàlisi depth ' + DEPTH + ' MultiPV 2', games: out }));
    process.stderr.write('Desat a ' + OUT + '\n');
    process.exit(0);
})().catch((e) => { process.stderr.write('\nERROR: ' + e.message + '\n'); process.exit(1); });
