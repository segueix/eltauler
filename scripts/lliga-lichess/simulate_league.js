// Simula temporades de lliga (10 jugadors, 9 jornades, tots contra tots) per
// decidir la dispersió dels ROC dels rivals (LLIGA.md §3). El jugador juga a
// la seva puntuació desplaçada «rendiment» punts; cada partida —seva o entre
// rivals— es resol amb leagueSimulatedResult de core.js (Elo i taules de
// Lichess) i la classificació es desempata com a l'app (punts, victòries, ROC).
// Ús: node scripts/lliga-lichess/simulate_league.js [temporades=30000] [ritme=3+2] [referència=1200]
const Core = require('../../core.js');
const N = +(process.argv[2] || 30000);
const TC = process.argv[3] || '3+2';
const BASE = +(process.argv[4] || 1200);

function season(offsets, perf) {
    const ps = [{ id: 'me', elo: BASE, real: BASE + perf, pts: 0, pg: 0 }].concat(offsets.map((o, i) => {
        const elo = Core.leagueOpponentRating(BASE, o, 200, 2000);
        return { id: 'b' + i, elo, real: elo, pts: 0, pg: 0 };
    }));
    for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
            const r = Core.leagueSimulatedResult(ps[i].real, ps[j].real, TC);
            const s = r === 'A' ? 1 : r === 'B' ? 0 : 0.5;
            ps[i].pts += s; ps[j].pts += 1 - s;
            if (s === 1) ps[i].pg++; else if (s === 0) ps[j].pg++;
        }
    }
    const sorted = ps.slice().sort((x, y) => y.pts - x.pts || y.pg - x.pg || y.elo - x.elo || x.id.localeCompare(y.id));
    return { rank: sorted.findIndex(p => p.id === 'me') + 1, champPts: sorted[0].pts, champOff: sorted[0].elo - BASE };
}

const spreads = {
    '±25 (antic)': () => Array.from({ length: 9 }, () => Math.floor(Math.random() * 51) - 25),
    '±100': () => Core.leagueOpponentOffsets().map(o => o / 2),
    '±150': () => Core.leagueOpponentOffsets().map(o => o * 0.75),
    '±200 (app)': () => Core.leagueOpponentOffsets(),
    '±300': () => Core.leagueOpponentOffsets().map(o => o * 1.5)
};
const pc = (x) => (100 * x / N).toFixed(1).padStart(5) + '%';
console.log(`${N} temporades per cel·la, ritme ${TC}, referència ${BASE}`);
for (const [name, sp] of Object.entries(spreads)) {
    const rows = [];
    for (const perf of [-200, -100, 0, 100, 200]) {
        let first = 0, top3 = 0, last = 0, s = 0, s2 = 0, champ = 0, fav = 0;
        for (let k = 0; k < N; k++) {
            const r = season(sp(), perf);
            if (r.rank === 1) first++;
            if (r.rank <= 3) top3++;
            if (r.rank === 10) last++;
            s += r.rank; s2 += r.rank * r.rank; champ += r.champPts;
            if (r.champOff >= 100) fav++;
        }
        const m = s / N;
        rows.push({ perf, first, top3, last, m, sd: Math.sqrt(s2 / N - m * m), champ: champ / N, fav });
    }
    const slope = (rows[0].m - rows[4].m) / 4;
    console.log(`\n${name}: ${slope.toFixed(2)} posicions per cada 100 punts de rendiment; senyal/soroll ${(slope / rows[2].sd).toFixed(2)}`);
    console.log('  rendiment  campió   podi  últim  posició  (desv.)  punts del campió  campió de +100 o més');
    rows.forEach(r => console.log(`  ${String(r.perf).padStart(9)} ${pc(r.first)} ${pc(r.top3)} ${pc(r.last)}  ${r.m.toFixed(2).padStart(6)}   (${r.sd.toFixed(2)})        ${r.champ.toFixed(2)}          ${pc(r.fav)}`));
}
