#!/usr/bin/env node
// Auditoria reproduïble de la qualitat del català en partides completes.
// Ús: node scripts/audit-commentary.js
// Les partides són simulacions DETERMINISTES de jugades legals; no són
// emparellaments reals de Stockfish vs Lozza ni estimacions d'Elo.
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const Expression = require('../expressivitat');
const Narrative = require('../narrativa');
const Audit = require('../auditoria');

function seedRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
function fromSan(sans) {
    const game = new Chess();
    const moves = [];
    for (const san of sans) {
        const move = game.move(san, { sloppy: true });
        if (!move) throw new Error('Jugada il·legal a l’escenari: ' + san);
        moves.push(move.from + move.to + (move.promotion || ''));
    }
    return { moves, ended: game.game_over(), fen: game.fen() };
}
function playSeed(seed, maxPlies = 360) {
    const random = seedRng(seed);
    const g = new Chess(), moves = [];
    while (!g.game_over() && moves.length < maxPlies) {
        const possibilities = g.moves({ verbose: true });
        if (!possibilities.length) break;
        // Leves preferències de captura (partides amb contingut tàctic), però
        // sense calcular jugades amb Stockfish: aquest és un banc de prova.
        const weights = possibilities.map(m => m.captured ? 2.2 : 1);
        const total = weights.reduce((a,b)=>a+b,0);
        let pick = random() * total, idx = 0;
        for (; idx < possibilities.length - 1; idx++) {
            pick -= weights[idx];
            if (pick < 0) break;
        }
        const m = g.move(possibilities[idx].san, { sloppy: true });
        if (!m) throw new Error('Jugada il·legal generada');
        moves.push(m.from + m.to + (m.promotion || ''));
    }
    return { moves, ended: g.game_over(), fen: g.fen(), seed };
}

const miniatures = [
    { name: 'mat del boig', ...fromSan(['f3','e5','g4','Qh4#']) },
    { name: 'mat del pastor', ...fromSan(['e4','e5','Qh5','Nc6','Bc4','Nf6','Qxf7#']) },
    { name: 'defensa del pastor', ...fromSan(['e4','e5','Qh5','Nc6','Bc4','g6','Qf3','Nf6']) }
];
function scenarios() {
    const random = [21,69,2026,2027].map(seed => ({ name: 'simulació legal ' + seed, ...playSeed(seed) }));
    return miniatures.concat(random);
}
function report() {
    return scenarios().map(s => {
        const start = process.hrtime.bigint();
        const rows = TV.tvSimulateCommentary(Chess, {
            moves: s.moves, tier: 'mid', expression: Expression, narrative: Narrative, quality: Audit
        });
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1000000;
        const metrics = Audit.audit(rows);
        return {
            name: s.name, plies: s.moves.length, ended: s.ended, elapsedMs: Math.round(elapsedMs),
            metrics: {
                coverage: +metrics.coverage.toFixed(3), unique: metrics.distinct,
                exactRepeat: metrics.exactRepeat, repeatedOpenings: metrics.repeatedOpenings,
                malformed: metrics.malformed, tooLong: metrics.tooLong,
                maxSilence: metrics.maxSilence, narrativeLinks: metrics.narrativeLinks
            },
            events: metrics.events
        };
    });
}
if (require.main === module) {
    const rows = report();
    console.log(JSON.stringify({ note: 'Partides simulades legalment, sense jugadors humans ni motor Stockfish', rows }, null, 2));
    if (rows.some(r => !r.ended || r.metrics.malformed || r.metrics.tooLong)) process.exitCode = 1;
}
module.exports = { fromSan, playSeed, scenarios, report };
