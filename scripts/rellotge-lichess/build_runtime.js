// Trets amb les puntuacions de la CERCA REAL del rival (runscores.js), amb el mateix context que l'app.
// Ús (des de l'arrel del repo): node scripts/rellotge-lichess/build_runtime.js runscores.jsonl sample.jsonl runtime-features.jsonl
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const Core = require(path.join(ROOT, 'core.js'));
const { Chess } = require(path.join(ROOT, 'node_modules', 'chess.js'));
const [RS, SAMPLE, OUT] = process.argv.slice(2);
const sample = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const ctxO = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'obertures.js'), 'utf8') + '\n;globalThis.__O = OPENINGS_DATA;', ctxO);
const book = Core.humanBookIndex(ctxO.__O);
const out = fs.createWriteStream(OUT);
let n = 0;
for (const line of fs.readFileSync(RS, 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (!r.scores) continue;
    const s = sample[+r.id.split('|')[2]];
    const c = new Chess();
    for (const san of s.prefix) c.move(san, { sloppy: true });
    const ctx = { moveNumber: s.move,
        lastMove: s.prefix.length ? { to: Core.humanSanTarget(s.prefix[s.prefix.length - 1]) } : null,
        ownLastMove: s.prefix.length > 1 ? { to: Core.humanSanTarget(s.prefix[s.prefix.length - 2]) } : null,
        bookMoves: Core.humanBookMoves(book, s.prefix) };
    const feats = Core.humanMoveFeatures(Chess, c.fen(), r.scores, ctx);
    if (feats.length < 2) continue;
    out.write(JSON.stringify({ id: r.id, band: r.band, tc: r.tc, roc: r.roc, depth: r.depthUsed, moves: feats.map(f => f.move),
        x: feats.map(f => f.x.map(v => +v.toFixed(4))) }) + '\n');
    n++;
}
out.end(() => console.error('FET', n));
