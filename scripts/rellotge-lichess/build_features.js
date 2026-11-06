// Trets de totes les jugades de cada posició per ajustar el model de tria humana (§17).
// Fa servir humanMoveFeatures de core.js, la mateixa funció que l'app, amb el mateix context:
// casella d'arribada de les dues darreres jugades i jugades de teoria (obertures.js) des de l'inici.
// Ús (des de l'arrel del repo): node scripts/rellotge-lichess/build_features.js all10.jsonl sample.jsonl features.jsonl
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const Core = require(path.join(ROOT, 'core.js'));
const { Chess } = require(path.join(ROOT, 'node_modules', 'chess.js'));
const [TABLE, SAMPLE, OUT] = process.argv.slice(2);
const sample = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const ctxO = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'obertures.js'), 'utf8') + '\n;globalThis.__O = OPENINGS_DATA;', ctxO);
const book = Core.humanBookIndex(ctxO.__O);
const out = fs.createWriteStream(OUT);
let n = 0, skipped = 0;
for (const line of fs.readFileSync(TABLE, 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (!r.scores || r.error) { skipped++; continue; }
    const s = sample[+r.id.split('|')[2]];
    const ctx = { moveNumber: r.move,
        lastMove: s.prefix.length ? { to: Core.humanSanTarget(s.prefix[s.prefix.length - 1]) } : null,
        ownLastMove: s.prefix.length > 1 ? { to: Core.humanSanTarget(s.prefix[s.prefix.length - 2]) } : null,
        bookMoves: Core.humanBookMoves(book, s.prefix) };
    const feats = Core.humanMoveFeatures(Chess, r.fen, r.scores, ctx);
    const hi = feats.findIndex(f => f.move === r.human);
    if (hi < 0 || feats.length < 2) { skipped++; continue; }
    out.write(JSON.stringify({ id: r.id, tc: r.tc, band: r.band, elo: r.elo, oppElo: r.oppElo, sec: r.sec, move: r.move, human: hi,
        moves: feats.map(f => f.move), scores: feats.map(f => f.score), x: feats.map(f => f.x.map(v => +v.toFixed(4))) }) + '\n');
    if (++n % 2000 === 0) console.error(n);
}
out.end(() => console.error(`FET ${n} posicions (${skipped} descartades: forçades o sense taula)`));
