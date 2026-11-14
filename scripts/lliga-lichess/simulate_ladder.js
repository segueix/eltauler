// Simula l'escala de lligues (LLIGA.md §6): 21 graons, de Municipal C a
// Mundial A (C → B → A → C del nivell següent), cadascun amb el seu
// desplaçament de la graella (leagueTierShift de core.js). Per a cada graó, el
// podi (puja) i els tres últims (baixa) d'un jugador que juga a la seva
// puntuació desplaçada «rendiment» punts; i carreres senceres: quantes
// temporades calen per arribar a cada nivell i on es passa el temps. Cada partida es resol amb leagueSimulatedResult (Elo i
// taules de Lichess) i la classificació es desempata per punts, victòries i ROC.
// Ús: node scripts/lliga-lichess/simulate_ladder.js [temporades=20000] [ritme=3+2] [referència=1200]
const Core = require('../../core.js');
const N = +(process.argv[2] || 20000);
const TC = process.argv[3] || '3+2';
const BASE = +(process.argv[4] || 1200);
const LEVELS = Core.LEAGUE_LEVELS.length;
const TIERS = Core.LEAGUE_TIER_COUNT;

function season(tier, perf) {
    const shift = Core.leagueTierShift(tier);
    const ps = [{ id: 'me', elo: BASE, real: BASE + perf, pts: 0, pg: 0 }].concat(Core.leagueOpponentOffsets().map((o, i) => {
        const elo = Core.leagueOpponentRating(BASE + shift, o, 200, 2000);
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
    return sorted.findIndex(p => p.id === 'me') + 1;
}

const pc = x => (100 * x).toFixed(1).padStart(5) + '%';
console.log(`${N} temporades per cel·la, ritme ${TC}, referència ${BASE}`);
console.log('\nPer graó, jugant al propi nivell (i amb +100):');
console.log('  graó                   graella  podi (0)  baixa (0)  podi (+100)  baixa (+100)');
for (let t = 0; t < TIERS; t++) {
    const cell = perf => {
        let up = 0, down = 0;
        for (let k = 0; k < N; k++) {
            const r = season(t, perf);
            if (r <= 3) up++;   // a Mundial A, el podi no puja (no hi ha graó de dalt)
            if (r >= 8 && t > 0) down++;
        }
        return [up / N, down / N];
    };
    const a = cell(0), b = cell(100);
    const name = `${Core.leagueLevel(Core.leagueTierLevel(t)).label} ${Core.leagueTierGroup(t)}`;
    console.log(`  ${name.padEnd(22)} ${String(Core.leagueTierShift(t)).padStart(5)}    ${pc(a[0])}    ${pc(a[1])}      ${pc(b[0])}       ${pc(b[1])}`);
}

// Carreres: CAREERS jugadors, SEASONS temporades cadascun, començant on es
// comença (LEAGUE_START_TIER: la lliga del territori, C). Temporades fins a
// arribar a cada nivell (mitjana dels qui hi arriben, i quants hi arriben; als
// de sota, quants hi baixen) i on es passa el temps.
const CAREERS = Math.max(200, Math.round(N / 20));
const SEASONS = 60;
const START = Core.LEAGUE_START_TIER, START_LEVEL = Core.leagueTierLevel(START);
console.log(`\nCarreres: ${CAREERS} jugadors, ${SEASONS} temporades cadascun, des de ${Core.leagueLevel(START_LEVEL).label} ${Core.leagueTierGroup(START)}`);
for (const perf of [0, 50, 100]) {
    const reach = Array(LEVELS).fill(0), reachSum = Array(LEVELS).fill(0), time = Array(LEVELS).fill(0);
    for (let c = 0; c < CAREERS; c++) {
        let t = START;
        const seen = Array(LEVELS).fill(false);
        seen[START_LEVEL] = true; reach[START_LEVEL]++;
        for (let s = 1; s <= SEASONS; s++) {
            time[Core.leagueTierLevel(t)]++;
            t = Core.leagueNextTier(t, season(t, perf), 10);
            const lv = Core.leagueTierLevel(t);
            if (!seen[lv]) { seen[lv] = true; reach[lv]++; reachSum[lv] += s; }
        }
    }
    console.log(`\n  rendiment ${perf >= 0 ? '+' : ''}${perf}:`);
    for (let lv = 0; lv < LEVELS; lv++) {
        const r = reach[lv] / CAREERS;
        const when = lv === START_LEVEL ? '—' : (reach[lv] ? (reachSum[lv] / reach[lv]).toFixed(1) : '—');
        const verb = lv < START_LEVEL ? 'hi baixa ' : 'hi arriba';
        console.log(`    ${Core.leagueLevel(lv).label.padEnd(17)} ${verb} ${pc(r)} · a la temporada ${String(when).padStart(5)} · temps ${pc(time[lv] / (CAREERS * SEASONS))}`);
    }
}
