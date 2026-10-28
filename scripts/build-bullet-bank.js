#!/usr/bin/env node
// ============================================================================
// scripts/build-bullet-bank.js — posicions reals per a «Reflexos bullet»
// ============================================================================
// Genera bulletbank.js a partir de la base de dades oberta de problemes de
// Lichess (https://database.lichess.org/#puzzles, domini públic CC0). Cada
// problema es pren just després de la jugada del rival (la primera de la
// columna Moves), que l'app marca al tauler per donar context.
//
//  - Mat en una (tema mateIn1): s'accepten TOTES les jugades que fan mat.
//  - Captura (tema hangingPiece) i sortida d'escac (el jugador està en escac):
//    les respostes són les jugades que compleixen la regla de l'objectiu de
//    bulletpractice.js (guany immediat de material o sortida sense regalar la
//    peça moguda) i que el MATEIX stockfish.js de l'app troba igual de bones
//    que la millor. Si alguna jugada que compleix la regla perd, la posició es
//    descarta: així cap jugada «correcta segons l'objectiu» no es marca com a
//    error. A les captures, a més, la millor jugada ha de guanyar com a mínim
//    1,5 peons.
//
// Ús:
//   curl -O https://database.lichess.org/lichess_db_puzzle.csv.zst
//   zstd -d lichess_db_puzzle.csv.zst          (n'hi ha prou amb un tros)
//   node scripts/build-bullet-bank.js lichess_db_puzzle.csv [--depth 12] [--scale 1] [--out bulletbank.js]
//
// --scale redueix els objectius (p. ex. 0.05) per provar l'script en poca estona.
// Amb el motor en un sol fil, el banc complet triga una bona estona.
// ============================================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Chess } = require('chess.js');
const B = require('../bulletpractice');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const CSV = args[0] && !args[0].startsWith('--') ? args[0] : null;
const DEPTH = Number(opt('--depth', 12));
const SCALE = Number(opt('--scale', 1));
const OUT = path.resolve(ROOT, opt('--out', 'bulletbank.js'));
if (!CSV) { console.error('Ús: node scripts/build-bullet-bank.js <lichess_db_puzzle.csv> [--depth 12] [--scale 1] [--out bulletbank.js]'); process.exit(1); }

// Franges de dificultat (puntuació Lichess) i posicions per franja i objectiu.
const band = r => r < 800 ? 0 : r < 1100 ? 1 : r < 1400 ? 2 : 3;
const TARGET = { mate: [50, 50, 50, 50], capture: [45, 45, 45, 45], escape: [45, 50, 45, 45] };
Object.keys(TARGET).forEach(k => { TARGET[k] = TARGET[k].map(n => Math.max(1, Math.round(n * SCALE))); });
const POOL = 15; // candidats guardats per cada posició que es vol
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const mv = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const pieces = fen => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
let seed = 20261028;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// --- Motor: el mateix stockfish.js de l'app, en aquest procés ---------------
const listeners = [];
global.postMessage = (m) => { listeners.slice().forEach(fn => fn(String(m))); };
require(path.join(ROOT, 'stockfish.js'));
const send = (cmd) => { global.onmessage({ data: cmd }); };
function until(pred) {
    return new Promise(resolve => {
        const fn = (l) => { if (pred(l)) { listeners.splice(listeners.indexOf(fn), 1); resolve(l); } };
        listeners.push(fn);
    });
}
const score = line => {
    const cp = / score cp (-?\d+)/.exec(line), mate = / score mate (-?\d+)/.exec(line);
    if (cp) return +cp[1];
    return +mate[1] > 0 ? 100000 - +mate[1] : -100000 - +mate[1];
};
async function search(fen, moves) {
    send('setoption name MultiPV value ' + (moves ? moves.length : 1));
    const ok = until(l => l === 'readyok'); send('isready'); await ok;
    send('position fen ' + fen);
    const infos = {};
    const handler = (l) => {
        if (!l.startsWith('info') || !l.includes(' pv ') || / (lower|upper)bound/.test(l) || !/ score /.test(l)) return;
        const k = +(/ multipv (\d+)/.exec(l) || [0, 1])[1];
        infos[k] = { score: score(l), move: / pv (\S+)/.exec(l)[1] };
    };
    listeners.push(handler);
    const done = until(l => l.startsWith('bestmove'));
    send('go depth ' + DEPTH + (moves ? ' searchmoves ' + moves.join(' ') : ''));
    await done;
    listeners.splice(listeners.indexOf(handler), 1);
    return Object.values(infos);
}
// Totes les jugades de la regla han de ser tan bones com la millor (tolerància en centipeons).
async function validate(t) {
    const best = (await search(t.fen))[0];
    if (!best || !t.rule.includes(best.move)) return null;
    const scores = {}; (await search(t.fen, t.rule)).forEach(r => { scores[r.move] = r.score; });
    const tol = t.kind === 'capture' ? 80 : 100;
    if (!t.rule.every(m => scores[m] !== undefined && scores[m] >= best.score - tol)) return null;
    if (t.kind === 'capture' ? best.score < 150 : best.score < -150) return null;
    return t.rule;
}

(async () => {
    await new Promise(r => setTimeout(r, 50));
    const uciOk = until(l => l === 'uciok'); send('uci'); await uciOk;
    const cand = { mate: [[], [], [], []], capture: [[], [], [], []], escape: [[], [], [], []] }, seen = new Set();
    const full = (kind, b) => cand[kind][b].length >= TARGET[kind][b] * POOL;
    const rl = readline.createInterface({ input: fs.createReadStream(CSV) });
    let header = true;
    for await (const line of rl) {
        if (header) { header = false; continue; }
        const f = line.split(',');
        if (f.length < 8) continue;
        const [id, fen0, moves, rating, rd, pop, plays, themes] = f, list = moves.split(' '), r = +rating, th = themes.split(' ');
        if (+rd > 90 || +pop < 80 || +plays < 200 || r < 400 || r > 1900 || !(list.length === 2 || list.length === 4) || !list.every(u => UCI.test(u))) continue;
        const b = band(r), mateTheme = th.includes('mateIn1') && list.length === 2;
        if (mateTheme ? full('mate', b) : full('capture', b) && full('escape', b)) continue;
        const g = new Chess(fen0);
        if (!g.move(mv(list[0]))) continue;
        const fen = g.fen(), key = fen.split(' ').slice(0, 2).join(' ');
        if (seen.has(key) || pieces(fen) < 8) continue;
        const kind = mateTheme ? 'mate' : g.in_check() ? 'escape' : th.includes('hangingPiece') ? 'capture' : null;
        if (!kind || full(kind, b)) continue;
        const rule = B.solutions(Chess, { kind, fen });
        if (!rule.includes(list[1]) || rule.length > (kind === 'mate' ? 3 : kind === 'escape' ? 6 : 8)) continue;
        seen.add(key);
        cand[kind][b].push({ id, kind, fen, last: list[0], rule, rating: r });
    }
    const picked = [];
    for (const kind of ['mate', 'capture', 'escape']) {
        for (let b = 0; b < 4; b++) {
            const pool = cand[kind][b].map(t => [random(), t]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
            let kept = 0;
            for (const t of pool) {
                if (kept >= TARGET[kind][b]) break;
                const answers = kind === 'mate' ? t.rule : await validate(t);
                if (!answers) continue;
                picked.push([t.id, kind[0], t.fen, t.last, answers.join(' '), t.rating]); kept++;
            }
            console.log(kind, 'franja', b, kept + '/' + TARGET[kind][b], '(' + pool.length + ' candidats)');
        }
    }
    const order = { m: 0, c: 1, e: 2 };
    picked.sort((a, b) => order[a[1]] - order[b[1]] || a[5] - b[5] || (a[0] < b[0] ? -1 : 1));
    const counts = { m: 0, c: 0, e: 0 }; picked.forEach(r => counts[r[1]]++);
    const out = `/* Posicions reals per a Reflexos bullet (bulletpractice.js).
 * Problemes d'una jugada de la base de dades oberta de Lichess
 * (https://database.lichess.org/#puzzles, domini públic CC0), presos just
 * després de la jugada del rival. Generat amb scripts/build-bullet-bank.js:
 *  - mats en una: totes les jugades que fan mat, comprovades amb chess.js;
 *  - captures i sortides d'escac: totes les jugades que compleixen la regla de
 *    l'objectiu i que Stockfish (profunditat ${DEPTH}) troba igual de bones que la
 *    millor; si alguna jugada que compleix la regla perd, la posició es descarta.
 * Camps: [id del problema a Lichess, objectiu (m mat · c captura · e escac),
 *         FEN, jugada anterior del rival, respostes acceptades, dificultat].
 * ${counts.m} mats · ${counts.c} captures · ${counts.e} sortides d'escac. */
(function (root, factory) {
    const bank = factory();
    if (typeof module === 'object' && module.exports) module.exports = bank;
    else root.ElTaulerBulletBank = bank;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return [
${picked.map(r => '        ' + JSON.stringify(r)).join(',\n')}
    ];
});
`;
    fs.writeFileSync(OUT, out);
    console.log('Escrit', path.relative(ROOT, OUT), counts);
    process.exit(0);
})();
