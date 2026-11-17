// Lliga de llegendes TV · integració amb la TV: configuració de cada jugador,
// partit de la lliga, noms als comentaris, classificació i canvi de lliga.
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const LG = require('../llegendes');
const I = require('../tvintro');

const CAPS = TV.tvEngineCapabilities(TV.parseUciOptions([
  'id name Stockfish 19',
  'option name Skill Level type spin default 20 min 0 max 20',
  'option name UCI_LimitStrength type check default false',
  'option name UCI_Elo type spin default 1320 min 1320 max 3190',
  'uciok'
]));
const CAPS_SKILL = TV.tvEngineCapabilities(TV.parseUciOptions([
  'id name Stockfish', 'option name Skill Level type spin default 20 min 0 max 20', 'uciok'
]));
const CAPS_NONE = TV.tvEngineCapabilities(TV.parseUciOptions(['id name Motor', 'uciok']));

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SQUARE = /\b[a-h][1-8]\b/;

describe('Lliga de llegendes TV · configuració de cada jugador', () => {
  test('els jugadors de Lozza juguen per profunditat i els de Stockfish amb nivell i perfil', () => {
    const lozza = TV.tvLegendSide(CAPS, LG.legend('morphy'), true, 0.62);
    expect(lozza).toMatchObject({ engine: 'lozza', preferred: 'lozza', level: 2500, depth: 6, movetime: 203, style: null });
    const sf = TV.tvLegendSide(CAPS, LG.legend('carlsen'), true, 0.62);
    expect(sf).toMatchObject({ engine: 'stockfish', level: 2500 });
    expect(sf.style.weights).toEqual(LG.legend('carlsen').weights);
    expect(sf.style.label).toBe('Carlsen');
  });

  test('si Lozza no es pot carregar, el jugador juga amb Stockfish i el seu perfil', () => {
    const side = TV.tvLegendSide(CAPS, LG.legend('kasparov'), false, 0.62);
    expect(side).toMatchObject({ engine: 'stockfish', preferred: 'lozza' });
    expect(side.style.weights).toEqual(LG.legend('kasparov').weights);
  });

  test('el nivell s’adapta a l’escala que declara el motor', () => {
    const skill = TV.tvLegendSide(CAPS_SKILL, LG.legend('karpov'), true, 0.62);
    expect(skill.level).toBeGreaterThanOrEqual(CAPS_SKILL.min);
    expect(skill.level).toBeLessThanOrEqual(CAPS_SKILL.max);
    expect(skill.level).toBe(Math.round(0.62 * 20));
    const none = TV.tvLegendSide(CAPS_NONE, LG.legend('karpov'), true, 0.62);
    expect(none.level).toBeNull();
    expect(none.style).toBeNull();
    expect(TV.tvLegendSide(null, LG.legend('karpov'), true, 0.62).level).toBeNull();
  });

  test('el pla de la partida duu els noms, els motors i els nivells de cada bàndol', () => {
    const plan = TV.tvLegendPlan(LG, { id: '1:morphy>carlsen', round: 1, white: 'morphy', black: 'carlsen' }, CAPS, true);
    expect(plan).toMatchObject({ legends: true, round: 1, untilMate: false,
      ids: { w: 'morphy', b: 'carlsen' }, names: { w: 'Morphy', b: 'Carlsen' }, engines: { w: 'lozza', b: 'stockfish' } });
    expect(plan.sharp).toBe(true); // Morphy és un jugador d'atac: obertures més tàctiques
    expect(TV.tvLegendLevel(CAPS, plan)).toMatchObject({ value: 2500, label: { short: 'Lliga de llegendes' } });
    const calm = TV.tvLegendPlan(LG, { id: '1:karpov>carlsen', round: 1, white: 'karpov', black: 'carlsen' }, CAPS, true);
    expect(calm.sharp).toBe(false);
  });

  test('un perfil amb pesos propis decideix entre jugades gairebé iguals', () => {
    // Després d'1.e4 f5, Dh5+ és escac i d4 és tranquil·la; el nivell triaria d4.
    const fen = 'rnbqkbnr/ppppp1pp/8/5p2/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const infos = { 1: { type: 'cp', value: 20, pv: ['d2d4'] }, 2: { type: 'cp', value: 10, pv: ['d1h5'] } };
    const attacker = TV.tvPickStyledMove(Chess, fen, infos, 'd2d4', { label: 'Atacant', weights: { check: 5 } });
    expect(attacker).toMatchObject({ uci: 'd1h5', changed: true });
    const prudent = TV.tvPickStyledMove(Chess, fen, infos, 'd2d4', { label: 'Prudent', weights: { check: -5 } });
    expect(prudent).toMatchObject({ uci: 'd2d4', changed: false });
    // Els perfils antics (per identificador) continuen funcionant.
    expect(TV.tvPickStyledMove(Chess, fen, infos, 'd2d4', 'attacker').uci).toBe('d1h5');
    expect(TV.tvStyleProfile('no-existeix')).toBeNull();
    expect(TV.tvStyleProfile({ weights: null })).toBeNull();
  });

  test('el titular diu qui guanya pel nom (i continua igual sense noms)', () => {
    const names = { w: 'Capablanca', b: 'Alekhine' };
    expect(TV.tvResultHeadline({ result: '1-0' }, names)).toBe('1-0 · Guanya Capablanca');
    expect(TV.tvResultHeadline({ result: '0-1' }, names)).toBe('0-1 · Guanya Alekhine');
    expect(TV.tvResultHeadline({ result: '1/2-1/2' }, names)).toBe('½-½ · Taules entre Capablanca i Alekhine');
    expect(TV.tvResultHeadline({ result: '1-0' })).toBe('1-0 · Guanyen les blanques');
  });

  test('la narració de l’obertura diu el nom del jugador, amb l’elisió correcta', () => {
    const common = { canSpeak: true, engines: { w: 'stockfish', b: 'lozza' }, names: { w: 'Capablanca', b: 'Alekhine' } };
    const named = { name: 'Sicilian Defense: Najdorf Variation' };
    const first = I.openingTalk({ ...common, named, color: 'w', ply: 10 });
    const next = I.openingTalk({ ...common, color: 'b', ply: 11 }, first.memory);
    const text = next.turns.map(t => t.text).join(' ');
    expect(text).toContain('Alekhine, amb les negres');
    expect(text).toMatch(/Amb la jugada d’Alekhine|El pla és d’Alekhine/);
    expect(text).not.toContain('Lozza');
    expect(text).not.toMatch(SQUARE);
  });
});

describe('Lliga de llegendes TV · flux real del controlador', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const fools = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

  function mockEngine(label, played) {
    return {
      jobs: [], destroyed: 0,
      ready: async () => label === 'lozza-offline' ? null : (label === 'lozza' ? { mode: 'none', engineName: 'Lozza' } : CAPS),
      failed: () => false,
      cancelAll() {},
      newGame() {},
      destroy() { this.destroyed++; },
      request(job) {
        this.jobs.push(job);
        const [start, moveText] = job.position.split(' moves ');
        const g = new Chess(start.startsWith('position fen ') ? start.slice('position fen '.length) : undefined);
        if (moveText) moveText.split(' ').forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
        const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
        const uci = job.tag.kind === 'move' && played[g.history().length] ? played[g.history().length] : legal[0];
        return Promise.resolve({
          bestUci: uci || null,
          infos: uci ? { 1: { depth: 12, multipv: 1, type: 'cp', value: 0, pv: [uci] } } : {}
        });
      }
    };
  }

  // Lliga amb 89 partides jugades; falta només la que enfronta `white` i `black`.
  // Carlsen guanya totes les seves: serà el campió (18 punts) si guanya l'última.
  function lastGameLeague(white, black) {
    let state = LG.newSeason(1, seeded(4));
    const target = state.fixtures.find(f => f.white === white && f.black === black);
    state.fixtures.filter(f => f !== target).forEach((f) => {
      const result = f.white === 'carlsen' ? '1-0' : f.black === 'carlsen' ? '0-1' : '1/2';
      state = LG.record(state, f.id, { result, plies: 60 }, seeded(1)).state;
    });
    expect(state.fixtures.filter(f => !f.result)).toHaveLength(1);
    return state;
  }

  function setup(options) {
    const o = options || {};
    const sf = mockEngine('stockfish', o.played || fools);
    const lz = mockEngine(o.lozza || 'lozza', o.played || fools);
    const saved = [], renders = [];
    const ctl = TV.createTvController({
      ChessCtor: Chess, engine: sf, lozzaEngine: lz, random: seeded(o.seed || 5),
      legends: o.legends === undefined ? LG : o.legends,
      loadLeague: () => o.league || null, saveLeague: s => saved.push(JSON.parse(JSON.stringify(s))),
      loadPrefs: () => ({ speed: 'quick' }), savePrefs: () => {},
      getOpenings: () => [], getViewer: () => ({ calibrated: false, roc: 900 }),
      view: { render: s => renders.push(s) }
    });
    return { ctl, sf, lz, saved, renders };
  }

  async function playUntilEnd(ctl, limitSeconds) {
    for (let i = 0; i < (limitSeconds || 120); i++) {
      await jest.advanceTimersByTimeAsync(1000);
      const g = ctl.state().game;
      if (g && g.end) { await jest.advanceTimersByTimeAsync(1000); return true; }
    }
    return false;
  }

  test('la partida és un partit de la lliga: noms, colors i motors dels jugadors', async () => {
    const { ctl, saved } = setup();
    await ctl.open();
    const st = ctl.state();
    expect(st.legends).toMatchObject({ season: 1, progress: { round: 1, played: 0, total: 90, rounds: 18 } });
    expect(st.legends.table).toHaveLength(10);
    const plan = st.game.matchPlan;
    expect(plan.legends).toBe(true);
    expect(st.game.names).toEqual(plan.names);
    expect(st.legends.fixture).toMatchObject({ white: plan.ids.w, black: plan.ids.b, round: 1 });
    ['w', 'b'].forEach((c) => {
      expect(plan.names[c]).toBe(LG.legend(plan.ids[c]).short);
      expect(st.game.engines[c]).toBe(LG.legend(plan.ids[c]).engine);
    });
    // La presentació diu els dos noms i l'estat de la lliga es desa en triar el partit.
    expect(st.game.comment.kind).toBe('intro');
    expect(st.game.comment.text).toContain(plan.names.w);
    expect(st.game.comment.text).toContain(plan.names.b);
    expect(st.game.comment.text).not.toMatch(SQUARE);
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[0].current).toBe(plan.fixture.id);
    ctl.close();
  });

  test('cada jugador juga amb el seu motor, el seu nivell i el seu perfil', async () => {
    const { ctl, sf, lz } = setup({ league: lastGameLeague('morphy', 'carlsen') });
    await ctl.open();
    const plan = ctl.state().game.matchPlan;
    expect(plan.engines).toEqual({ w: 'lozza', b: 'stockfish' });
    await playUntilEnd(ctl);
    const moves = sf.jobs.concat(lz.jobs).filter(j => j.tag.kind === 'move');
    expect(moves.length).toBeGreaterThanOrEqual(4);
    moves.forEach((job) => {
      const color = job.tag.ply % 2 === 0 ? 'w' : 'b';
      expect(job.tag.engine).toBe(plan.engines[color]);
      if (job.tag.engine === 'lozza') {
        expect(job.go).toBe('go depth ' + plan.sides[color].depth + ' movetime ' + plan.sides[color].movetime);
        expect(job.strength).toEqual([]);
        expect(job.multipv).toBe(1); // Lozza juga amb el seu estil, sense perfil artificial
      } else {
        expect(job.strength).toContain('setoption name UCI_Elo value ' + plan.sides[color].level);
        expect(job.multipv).toBe(TV.TV_CONFIG.STYLE_MULTIPV); // el perfil tria entre jugades gairebé iguals
      }
    });
    expect(lz.jobs.filter(j => j.tag.kind === 'analysis')).toHaveLength(0);
    expect(sf.jobs.some(j => j.tag.kind === 'analysis')).toBe(true);
    ctl.close();
  });

  test('en acabar la partida, el resultat entra a la classificació amb els noms', async () => {
    const league = LG.newSeason(1, seeded(9));
    const { ctl, saved } = setup({ league });
    await ctl.open();
    const plan = ctl.state().game.matchPlan;
    expect(await playUntilEnd(ctl)).toBe(true);
    const st = ctl.state();
    // 1.f3 e5 2.g4 Dh4#: guanyen les negres.
    expect(st.game.end.result).toBe('0-1');
    expect(st.game.leagueNote).toContain('Victòria ' + LG.de(plan.names.b) + ' davant ' + LG.de(plan.names.w));
    expect(st.legends.progress.played).toBe(1);
    const row = st.legends.table.find(r => r.id === plan.ids.b);
    expect(row).toMatchObject({ played: 1, wins: 1, points: 1, rank: 1 });
    expect(TV.tvResultHeadline(st.game.end, st.game.names)).toBe('0-1 · Guanya ' + plan.names.b);
    expect(ctl._league().fixtures.find(f => f.id === plan.fixture.id)).toMatchObject({ result: '0-1', reason: 'checkmate' });
    expect(saved[saved.length - 1].fixtures.filter(f => f.result)).toHaveLength(1);
    // La partida següent és un altre partit de la mateixa jornada, amb els resultats a la presentació.
    await jest.advanceTimersByTimeAsync(15000);
    const next = ctl.state();
    expect(next.game.id).toBe(2);
    expect(next.game.matchPlan.fixture.id).not.toBe(plan.fixture.id);
    expect(next.game.matchPlan.round).toBe(1);
    ctl.close();
  });

  test('quan tothom ha jugat dues vegades amb tothom, s’acaba la lliga i en comença una de nova', async () => {
    const { ctl, saved } = setup({ league: lastGameLeague('morphy', 'carlsen') });
    await ctl.open();
    const plan = ctl.state().game.matchPlan;
    expect(plan.fixture.id).toBe('1:morphy>carlsen');
    expect(ctl.state().legends.progress).toMatchObject({ played: 89, round: plan.round });
    expect(await playUntilEnd(ctl)).toBe(true);
    const st = ctl.state();
    // Carlsen (negres) guanya l'última partida i acaba la lliga amb 18 punts.
    expect(st.game.leagueNote).toContain('Acaba la jornada ' + plan.round + '.');
    expect(st.game.leagueNote).toContain('Acaba la lliga 1: Carlsen és el campió amb 18 punts. Comença la lliga 2.');
    expect(st.legends.season).toBe(2);
    expect(st.legends.progress).toMatchObject({ played: 0, total: 90, round: 1 });
    expect(st.legends.lastSeason).toMatchObject({ season: 1, champion: 'carlsen', points: 18 });
    expect(st.legends.history).toEqual([{ season: 1, champion: 'carlsen', points: 18 }]);
    expect(saved[saved.length - 1].season).toBe(2);
    // La classificació final de la lliga acabada es manté a la partida fins que en comença una de nova.
    expect(st.game.finalSeason).toBe(1);
    expect(st.game.finalTable).toHaveLength(10);
    expect(st.game.finalTable[0]).toMatchObject({ id: 'carlsen', points: 18, played: 18, rank: 1 });
    // La partida següent ja és de la lliga nova i la presentació anuncia el campió.
    await jest.advanceTimersByTimeAsync(15000);
    const next = ctl.state();
    expect(next.game.matchPlan.fixture.id.startsWith('2:')).toBe(true);
    expect(next.game.comment.kind).toBe('intro');
    expect(next.game.comment.text).toContain('la lliga 1 va ser per a Carlsen, amb 18 punts');
    expect(ctl._league().lastSeason.announced).toBe(true);
    ctl.close();
  });

  test('la lliga es desa i, en reobrir la TV, es reprèn el mateix partit', async () => {
    const first = setup({ seed: 3 });
    await first.ctl.open();
    const fixture = first.ctl.state().game.matchPlan.fixture;
    first.ctl.close();
    const again = setup({ seed: 77, league: first.saved[first.saved.length - 1] });
    await again.ctl.open();
    expect(again.ctl.state().game.matchPlan.fixture.id).toBe(fixture.id);
    again.ctl.close();
  });

  test('«Nova partida» abandona el partit en curs sense comptar-lo i en tria un altre de la jornada', async () => {
    const { ctl } = setup();
    await ctl.open();
    const before = ctl.state().game.matchPlan.fixture.id;
    ctl.newGame();
    const after = ctl.state();
    expect(after.game.id).toBe(2);
    expect(after.game.matchPlan.round).toBe(1);
    expect(after.legends.progress.played).toBe(0);
    expect(typeof before).toBe('string');
    ctl.close();
  });

  test('si Lozza no es carrega, tots dos juguen amb Stockfish i el seu perfil, i s’avisa', async () => {
    const { ctl } = setup({ lozza: 'lozza-offline', league: lastGameLeague('morphy', 'carlsen') });
    await ctl.open();
    const st = ctl.state();
    expect(st.duelWarning).toBe(true);
    expect(st.game.engines).toEqual({ w: 'stockfish', b: 'stockfish' });
    expect(st.game.matchPlan.sides.w).toMatchObject({ engine: 'stockfish', preferred: 'lozza' });
    expect(st.game.matchPlan.sides.w.style.weights).toEqual(LG.legend('morphy').weights);
    expect(st.game.comment.text).not.toContain('amb Lozza');
    ctl.close();
  });

  test('sense el mòdul de llegendes, la TV continua amb el duel Stockfish contra Lozza', async () => {
    const { ctl } = setup({ legends: null });
    await ctl.open();
    const st = ctl.state();
    expect(st.legends).toBeNull();
    expect(st.game.matchPlan.legends).toBeUndefined();
    expect(['lozza', 'stockfish'].sort()).toEqual(Object.values(st.game.engines).sort());
    ctl.close();
  });

  test('durant una partida llarga es diuen els noms dels jugadors, amb fets comprovats', async () => {
    // Els dos motors simulats juguen la primera jugada legal: la partida dura.
    const { ctl } = setup({ played: [], seed: 8 });
    await ctl.open();
    const names = Object.values(ctl.state().game.matchPlan.names);
    for (let i = 0; i < 400; i++) {
      await jest.advanceTimersByTimeAsync(1000);
      const g = ctl.state().game;
      if (g.end || g.moves.length >= 60) break;
    }
    const g = ctl.state().game;
    expect(g.moves.length).toBeGreaterThan(20);
    const spoken = g.moves.map(m => m.commentObj).filter(Boolean);
    const remarks = spoken.filter(c => c.kind === 'legend');
    expect(remarks.length).toBeGreaterThan(0);
    remarks.forEach((c) => {
      expect(names.some(n => c.say.startsWith(n))).toBe(true);
      expect(c.say).not.toMatch(SQUARE);
      expect(c.speech).not.toMatch(SQUARE);
    });
    // La primera observació del jugador és el seu motor i perfil, a partir de la semijugada 10.
    expect(remarks[0].ply).toBeGreaterThanOrEqual(LG.CONFIG.REMARK_FIRST_PLY);
    expect(remarks[0].say).toMatch(/ juga amb (Stockfish|Lozza)/);
    expect(remarks.length).toBeLessThanOrEqual(LG.CONFIG.REMARKS_PER_GAME);
    ctl.close();
  });
});
