#!/usr/bin/env node
// ============================================================================
// scripts/gen-tactics-solutions.js — rebost estàtic del banc de tàctiques
// ============================================================================
// Resol fora de línia la línia de cada posició del banc (TACTICS_BANK d'app.js)
// amb el MATEIX Stockfish que carrega l'app (stockfish.js), a més profunditat
// que la preparació en viu, i escriu el resultat dins d'app.js entre els marcadors
//
//     // >>> TACTICS_BANK_SOLUTIONS (generat) >>>
//     ...
//     // <<< TACTICS_BANK_SOLUTIONS <<<
//
// Gràcies a aquest rebost un exercici de tàctiques arrenca a l'instant i la
// secció continua funcionant encara que el motor no arrenqui al dispositiu.
//
// Ús:  node scripts/gen-tactics-solutions.js [--depth 18] [--dry]
// ============================================================================
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
const BEGIN = '// >>> TACTICS_BANK_SOLUTIONS (generat) >>>';
const END = '// <<< TACTICS_BANK_SOLUTIONS <<<';

const args = process.argv.slice(2);
const DEPTH = Number(args[args.indexOf('--depth') + 1]) || 18;
const MOVETIME_MS = 20000;
const PV_KEEP = 8;
const DRY = args.includes('--dry');

// ── Motor: stockfish.js és un worker; a Node n'hi ha prou d'oferir postMessage ──
const listeners = [];
global.postMessage = (m) => { listeners.forEach(fn => fn(String(m))); };
require(path.join(ROOT, 'stockfish.js'));
const send = (cmd) => global.onmessage({ data: cmd });
const onLine = (fn) => {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
};

const ready = () => new Promise(resolve => {
    const off = onLine(l => { if (l.indexOf('readyok') === 0) { off(); resolve(); } });
    send('isready');
});

function parseInfo(line) {
    if (!line.startsWith('info') || !line.includes(' pv ')) return null;
    const info = { depth: null, multipv: 1, score: null, scoreType: 'cp', pv: [] };
    const d = line.match(/\bdepth (\d+)/); if (d) info.depth = parseInt(d[1], 10);
    const m = line.match(/\bmultipv (\d+)/); if (m) info.multipv = parseInt(m[1], 10);
    const cp = line.match(/\bscore cp (-?\d+)/); if (cp) { info.score = parseInt(cp[1], 10); info.scoreType = 'cp'; }
    const mate = line.match(/\bscore mate (-?\d+)/); if (mate) { info.score = parseInt(mate[1], 10); info.scoreType = 'mate'; }
    const pv = line.match(/ pv (.+)$/); if (pv) info.pv = pv[1].trim().split(/\s+/);
    return info;
}

async function analyze(fen, multipv) {
    await ready();
    send(`setoption name MultiPV value ${multipv}`);
    await ready();
    return new Promise(resolve => {
        const best = new Map();
        const timer = setTimeout(() => send('stop'), MOVETIME_MS + 30000);
        const off = onLine(line => {
            if (line.startsWith('info')) {
                const info = parseInfo(line);
                if (!info || info.depth === null) return;
                const prev = best.get(info.multipv);
                if (!prev || info.depth >= prev.depth) best.set(info.multipv, info);
                return;
            }
            if (line.startsWith('bestmove')) {
                clearTimeout(timer);
                off();
                resolve(Array.from(best.values())
                    .sort((a, b) => a.multipv - b.multipv)
                    .map(i => ({ move: i.pv[0] || null, eval: i.score, evalType: i.scoreType, pv: i.pv })));
            }
        });
        send(`position fen ${fen}`);
        send(`go depth ${DEPTH} movetime ${MOVETIME_MS}`);
    });
}

function applyUci(fen, uci) {
    const g = new Chess(fen);
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return mv ? { fen: g.fen(), san: mv.san, over: g.game_over() } : null;
}

// Llegeix els bancs directament d'app.js: així el rebost no se separa mai de les
// posicions reals que serveix l'app.
function readBankFens(src) {
    const readArray = (name) => {
        const start = src.indexOf(`const ${name} = [`);
        if (start < 0) return [];
        const end = src.indexOf('\n];', start);
        return new Function(`${src.slice(start, end + 3)}\n;return ${name};`)();
    };
    const bank = readArray('TACTICS_BANK');
    const daily = readArray('DAILY_PUZZLE_BANK').map(p => (p && p.fen) || p).filter(Boolean);
    return Array.from(new Set(bank.concat(daily)));
}

function serialize(solutions) {
    const q = (s) => `'${String(s).replace(/'/g, "\\'")}'`;
    const alt = (a) => `{ move: ${q(a.move)}, eval: ${a.eval}, evalType: ${q(a.evalType)} }`;
    const lines = [];
    lines.push('const TACTICS_BANK_SOLUTIONS = {');
    const fens = Object.keys(solutions);
    fens.forEach((fen, idx) => {
        const sol = solutions[fen];
        lines.push(`    ${q(fen)}: {`);
        lines.push(`        totalSteps: ${sol.totalSteps},`);
        lines.push(`        sanLine: [${sol.sanLine.map(q).join(', ')}],`);
        lines.push('        steps: [');
        sol.steps.forEach((s, i) => {
            lines.push('            {');
            lines.push(`                move: ${q(s.move)}, eval: ${s.eval}, evalType: ${q(s.evalType)},`);
            lines.push(`                pv: [${s.pv.map(q).join(', ')}],`);
            lines.push(`                alternatives: [${s.alternatives.map(alt).join(', ')}]`);
            lines.push(`            }${i < sol.steps.length - 1 ? ',' : ''}`);
        });
        lines.push('        ],');
        lines.push(`        replies: [${sol.replies.map(r => `{ move: ${q(r.move)}, eval: ${r.eval}, evalType: ${q(r.evalType)} }`).join(', ')}]`);
        lines.push(`    }${idx < fens.length - 1 ? ',' : ''}`);
    });
    lines.push('};');
    return lines.join('\n');
}

(async () => {
    const src = fs.readFileSync(APP, 'utf8');
    const fens = readBankFens(src);
    if (!fens.length) { console.error('No s\'ha pogut llegir cap banc d\'app.js'); process.exit(1); }

    send('uci');
    await ready();

    const solutions = {};
    for (const fen of fens) {
        process.stderr.write('\n== ' + fen + '\n');
        let probe;
        try { probe = new Chess(fen); } catch (e) { probe = null; }
        if (!probe || probe.game_over() || !probe.moves().length) {
            process.stderr.write('  !! posició ja acabada o il·legible: no pot ser exercici\n');
            continue;
        }
        const steps = [];
        const replies = [];
        const sanLine = [];
        let curFen = fen;
        for (let i = 0; i < 2; i++) {
            const a = await analyze(curFen, 2);
            if (!a.length || !a[0].move) { process.stderr.write('  !! sense millor jugada al pas ' + (i + 1) + '\n'); break; }
            const r = applyUci(curFen, a[0].move);
            if (!r) { process.stderr.write('  !! jugada il·legal ' + a[0].move + '\n'); break; }
            process.stderr.write(`  pas${i + 1} ${a[0].move} (${r.san}) ${a[0].evalType} ${a[0].eval}\n`);
            steps.push({
                move: a[0].move, eval: a[0].eval, evalType: a[0].evalType,
                pv: (a[0].pv || []).slice(0, PV_KEEP),
                alternatives: a.filter(x => x && x.move).map(x => ({ move: x.move, eval: x.eval, evalType: x.evalType }))
            });
            sanLine.push(r.san);
            curFen = r.fen;
            if (r.over) { process.stderr.write('  ·· la línia acaba aquí (mat o taules)\n'); break; }
            if (i === 1) break;

            const o = await analyze(curFen, 1);
            if (!o.length || !o[0].move) { process.stderr.write('  !! sense resposta del rival\n'); break; }
            const ro = applyUci(curFen, o[0].move);
            if (!ro) { process.stderr.write('  !! resposta il·legal ' + o[0].move + '\n'); break; }
            process.stderr.write(`  rival ${o[0].move} (${ro.san})\n`);
            replies.push({ move: o[0].move, eval: o[0].eval, evalType: o[0].evalType });
            sanLine.push(ro.san);
            curFen = ro.fen;
            if (ro.over) { process.stderr.write('  ·· la línia acaba amb la resposta del rival\n'); break; }
        }
        if (!steps.length) { process.stderr.write('  !! cap pas jugable: es descarta\n'); continue; }
        // Cada pas (llevat de l'últim) necessita la rèplica fixa del rival.
        if (steps.length === 1) { replies.length = 0; sanLine.length = 1; }
        solutions[fen] = { totalSteps: steps.length, sanLine, steps, replies };
    }

    const block = serialize(solutions);
    if (DRY) { console.log(block); process.exit(0); }

    const begin = src.indexOf(BEGIN);
    const end = src.indexOf(END);
    if (begin < 0 || end < 0) { console.error('No s\'han trobat els marcadors a app.js'); process.exit(1); }
    const patched = src.slice(0, begin + BEGIN.length) + '\n' + block + '\n' + src.slice(end);
    fs.writeFileSync(APP, patched);
    process.stderr.write(`\nEscrites ${Object.keys(solutions).length} posicions a app.js\n`);
    process.exit(0);
})();
