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
// Motor o nivell d'un jugador dit en veu alta o a la pantalla.
const ENGINE_TALK = /\b(Stockfish|Stock fish|Lozza|motors?|nivells?|profunditat)\b/i;

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
      // Diàleg Èlia–Grau que diu el nom d'algun dels dos jugadors.
      expect(c.dialogue.length).toBeGreaterThanOrEqual(2);
      expect(names.some(n => c.dialogue.map(t => t.text).join(' ').includes(n))).toBe(true);
      expect(c.say).not.toMatch(SQUARE);
      expect(c.speech).not.toMatch(SQUARE);
    });
    // La primera observació del jugador és el seu estil, a partir de la semijugada 10.
    expect(remarks[0].ply).toBeGreaterThanOrEqual(LG.CONFIG.REMARK_FIRST_PLY);
    expect(remarks[0].say).toMatch(/, en una frase: /);
    // El motor i el nivell de cada jugador són interns: cap comentari no els diu.
    const said = spoken.map(c => [c.say, c.speech].concat((c.dialogue || []).map(t => t.text)).filter(Boolean).join(' '));
    said.forEach(t => expect(t).not.toMatch(ENGINE_TALK));
    expect(remarks.length).toBeLessThanOrEqual(LG.CONFIG.REMARKS_PER_GAME);
    ctl.close();
  });
});

describe('Lliga de llegendes TV · els noms dins dels comentaris', () => {
  const N = { w: 'Capablanca', b: 'Alekhine' };

  test.each([
    ['Les blanques guanyen espai al centre.', 'Les blanques de Capablanca guanyen espai al centre.'],
    ['Hi veig un avantatge clar per a les negres.', 'Hi veig un avantatge clar per a Alekhine.'],
    ['La iniciativa és de les negres.', 'La iniciativa és d’Alekhine.'],
    ['Dono un avantatge clar a les blanques.', 'Dono un avantatge clar a Capablanca.'],
    ['Veig les negres una mica millor.', 'Veig Alekhine una mica millor.'],
    ['El cavall negre ataca la dama blanca.', 'El cavall d’Alekhine ataca la dama de Capablanca.'],
    ['L’alfil blanc defensa un peó central.', 'L’alfil de Capablanca defensa un peó central.']
  ])('«%s» → «%s» (concordança intacta)', (input, output) => {
    expect(TV.tvNameSides(input, N, { max: 2 })).toBe(output);
  });

  test('no toca les peces que n’identifiquen una altra ni «amb les blanques»', () => {
    ['Les negres capturen el cavall de la dama blanca amb un peó.', 'El peó negre de torre queda aïllat.',
      'El pla és de Capablanca, amb les blanques.'].forEach((text) => {
      const out = TV.tvNameSides(text, N, { max: 2 });
      expect(out).not.toMatch(/dama de Capablanca amb|peó d’Alekhine de torre|amb les blanques de/);
    });
    // Un nom que ja hi és no es repeteix, i el pressupost limita els canvis.
    expect(TV.tvNameSides('Capablanca juga. Les blanques ataquen.', N, { max: 2 })).toBe('Capablanca juga. Les blanques ataquen.');
    expect(TV.tvNameSides('Les blanques ataquen i les negres es defensen.', N, { max: 1 })).toBe('Les blanques de Capablanca ataquen i les negres es defensen.');
    expect(TV.tvNameSides('Les blanques ataquen.', null)).toBe('Les blanques ataquen.');
  });

  test('en un diàleg, cada jugador surt com a molt un cop; el text intern no canvia', () => {
    const chosen = { kind: 'plan', text: 'intern', say: 'Les blanques avancen.', dialogue: [
      { role: 'presenter', text: 'Les blanques avancen el peó. Què guanyen?' },
      { role: 'analyst', text: 'Les blanques guanyen espai i les negres es queden sense joc. Veig les blanques millor.' }] };
    const out = TV.tvNameComment({ ply: 20, move: { color: 'w' }, legends: { names: N } }, chosen, {}).comment;
    const all = out.dialogue.map(t => t.text).join(' ');
    expect(all.split('Capablanca').length - 1).toBe(1);
    expect(all.split('Alekhine').length - 1).toBe(1);
    expect(out.text).toBe('intern');
  });

  test('en els comentaris d’una veu, cada bàndol es nomena una jugada sí i una no', () => {
    let memory = {};
    const said = [];
    for (let ply = 0; ply < 12; ply++) {
      const color = ply % 2 ? 'b' : 'w';
      const say = (color === 'w' ? 'Les blanques' : 'Les negres') + ' treuen el cavall.';
      const out = TV.tvNameComment({ ply, move: { color }, legends: { names: N } }, { kind: 'describe', text: say, say }, memory);
      memory = out.memory;
      said.push(/Capablanca|Alekhine/.test(out.comment.say));
    }
    // Blanques (parells) i negres (senars): una sí, una no, per a cadascú.
    expect(said).toEqual([true, true, false, false, true, true, false, false, true, true, false, false]);
  });

  test('la fórmula del nom varia («de», «Mou», «Torn de»)', () => {
    let memory = {};
    const forms = new Set();
    for (let ply = 0; ply < 24; ply += 4) {
      const out = TV.tvNameComment({ ply, move: { color: 'w' }, legends: { names: N } },
        { kind: 'describe', text: 'Les blanques treuen el cavall.', say: 'Les blanques treuen el cavall.' }, memory);
      memory = out.memory;
      forms.add(out.comment.say.split(' ')[0]);
    }
    expect([...forms].sort()).toEqual(['Les', 'Mou', 'Torn']);
  });

  test('en una partida real, els noms surten sovint, sense caselles ni majúscules perdudes', () => {
    const fs = require('fs');
    const path = require('path');
    const game = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tv-games.json'), 'utf8')).games[0];
    let state = LG.newSeason(1, seeded(2));
    const f = state.fixtures.find(x => x.white === 'capablanca') || state.fixtures[0];
    const legends = { api: LG, ids: { w: f.white, b: f.black }, names: { w: LG.legend(f.white).short, b: LG.legend(f.black).short },
      engines: { w: 'stockfish', b: 'lozza' }, stakes: LG.stakes(state, f.id) };
    const rows = TV.tvSimulateCommentary(Chess, { ...game, gameId: game.name, tier: 'mid', visio: require('../visiograu'), legends });
    const said = rows.filter(r => r.say || r.dialogue);
    const texts = said.map(r => r.dialogue ? r.dialogue.map(t => t.text).join(' ') : r.say);
    const named = texts.filter(t => t.includes(legends.names.w) || t.includes(legends.names.b));
    expect(named.length / said.length).toBeGreaterThan(0.35);
    texts.forEach((t) => {
      expect(t).not.toMatch(/[.!?]\s+[a-zà-ú]/);
      expect(t).not.toMatch(/:[^.?!]*:\s/);
    });
    rows.filter(r => r.dialogue).forEach(r => r.dialogue.forEach(t => expect(t.text).not.toMatch(SQUARE)));
    // Una peça que s'aparta capturant no és una «retirada».
    rows.filter(r => r.dialogue && /x/.test(r.san)).forEach(r => expect(r.dialogue[0].text).not.toContain('La retirada'));
    expect(rows.some(r => r.kind === 'legend')).toBe(true);
  });

  test('les preguntes noves d’en Grau acaben en interrogant i les introduccions no dupliquen els dos punts', () => {
    const T = require('../visiograu').TEXTS;
    T.HIT_NAMED.forEach(q => expect(q({ name: 'Alekhine' })).toMatch(/\?$/));
    T.MISS_NAMED.forEach(q => expect(q({ name: 'Alekhine' })).toMatch(/\?$/));
    T.PROOF_NAMED.forEach(q => expect(q('Alekhine')).toMatch(/\?$/));
    T.PROOF_QUESTIONS.forEach(q => expect(q).toMatch(/\?$/));
    expect(T.ANSWER_OPENERS.length).toBeGreaterThanOrEqual(4);
    expect(T.ANSWER_OPENERS).toContain('');
  });
});

describe('Lliga de llegendes TV · tancament de la partida', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const fools = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  function engine(label) {
    return {
      jobs: [], ready: async () => label === 'lozza' ? { mode: 'none', engineName: 'Lozza' } : CAPS,
      failed: () => false, cancelAll() {}, newGame() {}, destroy() {},
      request(job) {
        const [start, moveText] = job.position.split(' moves ');
        const g = new Chess(start.startsWith('position fen ') ? start.slice('position fen '.length) : undefined);
        if (moveText) moveText.split(' ').forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
        const legal = g.moves({ verbose: true }).map(m => m.from + m.to);
        const uci = job.tag.kind === 'move' && fools[g.history().length] ? fools[g.history().length] : legal[0];
        return Promise.resolve({ bestUci: uci || null, infos: uci ? { 1: { depth: 12, multipv: 1, type: 'cp', value: 0, pv: [uci] } } : {} });
      }
    };
  }

  test('la presentació i el tancament són diàlegs amb els noms', async () => {
    const ctl = TV.createTvController({ ChessCtor: Chess, engine: engine('stockfish'), lozzaEngine: engine('lozza'), random: seeded(5),
      legends: LG, loadLeague: () => null, saveLeague: () => {}, loadPrefs: () => ({ speed: 'quick' }), savePrefs: () => {},
      getOpenings: () => [], getViewer: () => ({ calibrated: false, roc: 900 }) });
    await ctl.open();
    const intro = ctl.state().game.comment;
    const names = ctl.state().game.names;
    expect(intro.kind).toBe('intro');
    expect(intro.dialogue).toHaveLength(2);
    expect(intro.dialogue[0].text).toContain(names.w);
    for (let i = 0; i < 120 && !(ctl.state().game.comment && ctl.state().game.comment.kind === 'result'); i++) await jest.advanceTimersByTimeAsync(1000);
    const closing = ctl.state().game.comment;
    expect(closing.kind).toBe('result');
    expect(closing.dialogue).toHaveLength(2);
    expect(closing.dialogue[0].text).toContain('Victòria ' + LG.de(names.b));
    expect(closing.dialogue[1].text).toMatch(/lloc|líder|lidera|comparteix/);
    ctl.close();
  });
});

describe('Lliga de llegendes TV · perquè les partides no s’encallin', () => {
  const play = (moves) => { const g = new Chess(); moves.forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })); return g; };

  test('trets de progrés: peó que avança, peó passat i rei actiu al final', () => {
    const f = TV.tvMoveFeatures(Chess, '8/5k2/8/3P4/8/8/5K2/8 w - - 0 60', 'd5d6', 0);
    expect(f).toMatchObject({ pawnPush: 1, passedPush: 1 });
    expect(TV.tvMoveFeatures(Chess, '8/5k2/8/3P4/8/8/5K2/8 w - - 0 60', 'f2e3', 0).kingCenter).toBe(1);
    expect(TV.tvMoveFeatures(Chess, '8/5k2/8/3P4/8/8/5K2/8 w - - 0 60', 'f2g2', 0).kingCenter).toBe(0);
    // Amb un peó rival davant a la columna del costat, el peó no és passat.
    expect(TV.tvMoveFeatures(Chess, '8/4pk2/8/3P4/8/8/5K2/8 w - - 0 60', 'd5d6', 0).passedPush).toBe(0);
  });

  test('detecta les jugades que desfan l’anterior i les que repeteixen una posició', () => {
    const h = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6'];
    const ctx = TV.tvMoveContext(Chess, undefined, h);
    const fen = play(h).fen();
    expect(TV.tvMoveFeatures(Chess, fen, 'f3g1', 0, ctx)).toMatchObject({ backtrack: 1, repeat: 1 });
    expect(TV.tvMoveFeatures(Chess, fen, 'e2e4', 0, ctx)).toMatchObject({ backtrack: 0, repeat: 0, pawnPush: 1 });
  });

  test('la fase d’atac s’activa quan la partida s’encalla, es repeteix o s’allarga', () => {
    const L = TV.TV_CONFIG.LATE_ATTACK;
    const quiet = '8/5k2/8/3P4/8/8/5K2/8 w - - 4 40';
    expect(TV.tvLateAttack({ ChessCtor: Chess, fen: quiet, ply: L.FROM_PLY + 2, history: [] })).toBeNull();
    const stalled = '8/5k2/8/3P4/8/8/5K2/8 w - - ' + L.STALL_HALFMOVES + ' 40';
    expect(TV.tvLateAttack({ ChessCtor: Chess, fen: stalled, ply: L.FROM_PLY - 2, history: [] })).toBeNull();
    expect(TV.tvLateAttack({ ChessCtor: Chess, fen: stalled, ply: L.FROM_PLY, history: [] }).reason).toBe('stalled');
    expect(TV.tvLateAttack({ ChessCtor: Chess, fen: quiet, ply: L.ALWAYS_FROM_PLY, history: [] }).reason).toBe('long');
    const h = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const rep = TV.tvLateAttack({ ChessCtor: Chess, fen: play(h).fen(), ply: L.REPEAT_FROM_PLY, history: h });
    expect(rep.reason).toBe('repetition');
    expect(rep.windowCp).toBe(L.WINDOW_CP);
    expect(rep.windowCp).toBeGreaterThan(TV.TV_CONFIG.STYLE_WINDOW_CP);
    expect(rep.depthBonus).toBeGreaterThan(0);
    // Amb un motiu ja vist, es manté encara que la posició ja no la justifiqui.
    expect(TV.tvLateAttack({ ChessCtor: Chess, fen: quiet, ply: 2, history: [], force: 'stalled' }).reason).toBe('stalled');
    // El perfil d'atac conserva una part de l'estil del jugador.
    const base = { label: 'Karpov', weights: { quiet: 2, retreat: 1 } };
    const merged = TV.tvLateAttack({ ChessCtor: Chess, fen: quiet, ply: L.ALWAYS_FROM_PLY, history: [], baseStyle: base }).style.weights;
    expect(merged.quiet).toBeCloseTo(2 * L.STYLE_SHARE + L.WEIGHTS.quiet);
    expect(merged.repeat).toBe(L.WEIGHTS.repeat);
    expect(merged.passedPush).toBe(L.WEIGHTS.passedPush);
  });

  test('en fase d’atac, el perfil evita desfer la jugada i prefereix fer avançar un peó', () => {
    const h = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6'];
    const fen = play(h).fen();
    const late = TV.tvLateAttack({ ChessCtor: Chess, fen, ply: 90, history: h });
    // El nivell triaria tornar el cavall (desfer); hi ha un avanç de peó 60 cp pitjor.
    const infos = { 1: { type: 'cp', value: 10, pv: ['f3g1'] }, 2: { type: 'cp', value: -50, pv: ['d2d4'] } };
    expect(TV.tvPickStyledMove(Chess, fen, infos, 'f3g1', late.style, late.windowCp, late.context).uci).toBe('d2d4');
    // Fora de la fase d'atac (marge normal), 60 cp és massa: es manté la jugada del nivell.
    expect(TV.tvPickStyledMove(Chess, fen, infos, 'f3g1', late.style, undefined, late.context).uci).toBe('f3g1');
  });

  test('taules per acord només quan fa estona que la posició és igualada i no avança', () => {
    const C = TV.TV_CONFIG;
    const level = TV.tvBuildAnalysis('8/5k2/8/8/8/8/5K2/R7 w - - 30 90', { 1: { depth: 14, type: 'cp', value: 10, pv: ['a1a2'] } }, 'a1a2');
    const edge = TV.tvBuildAnalysis('8/5k2/8/8/8/8/5K2/R7 w - - 30 90', { 1: { depth: 14, type: 'cp', value: 300, pv: ['a1a2'] } }, 'a1a2');
    let st = null, end = null;
    for (let i = 0; i < C.DRAW_PLIES; i++) ({ state: st, end } = TV.tvAgreedDrawStep(st, level, C.DRAW_FROM_PLY - 30 + i, '8/5k2/8/8/8/8/5K2/R7 w - - 30 90'));
    expect(end).toBeNull(); // massa aviat
    st = null;
    for (let i = 0; i < C.DRAW_PLIES; i++) ({ state: st, end } = TV.tvAgreedDrawStep(st, level, C.DRAW_FROM_PLY + i, '8/5k2/8/8/8/8/5K2/R7 w - - 30 90'));
    expect(end).toMatchObject({ result: '½-½', reason: 'agreed' });
    // Una valoració desequilibrada reinicia el compte; un peó que s'acaba de moure, també ho impedeix.
    expect(TV.tvAgreedDrawStep({ plies: 50 }, edge, 200, '8/5k2/8/8/8/8/5K2/R7 w - - 30 90').state.plies).toBe(0);
    expect(TV.tvAgreedDrawStep({ plies: 50 }, level, 200, '8/5k2/8/8/8/8/5K2/R7 w - - 0 90').end).toBeNull();
  });

  test('a la lliga es pot abandonar abans (el duel heretat manté el mínim de sempre)', () => {
    const lost = TV.tvBuildAnalysis('8/5k2/8/8/8/8/5K2/R7 w - - 0 40', { 1: { depth: 14, type: 'cp', value: 900, pv: ['a1a2'] } }, 'a1a2');
    let st = null, end = null;
    for (let i = 0; i < TV.TV_CONFIG.RESIGN_PLIES; i++) ({ state: st, end } = TV.tvResignStep(st, lost, 70 + i, 500, TV.TV_CONFIG.LEAGUE_RESIGN_MIN_PLY));
    expect(end).toMatchObject({ reason: 'resign', result: '1-0' });
    st = null;
    for (let i = 0; i < TV.TV_CONFIG.RESIGN_PLIES; i++) ({ state: st, end } = TV.tvResignStep(st, lost, 70 + i, 500));
    expect(end).toBeNull();
  });
});

describe('Lliga de llegendes TV · fase d’atac al controlador', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('passat el llindar, Stockfish tria amb el perfil d’atac i Lozza calcula més profund', async () => {
    const L = TV.TV_CONFIG.LATE_ATTACK;
    const saved = L.ALWAYS_FROM_PLY;
    L.ALWAYS_FROM_PLY = 16;
    try {
      const jobs = [];
      const engine = (label) => ({
        ready: async () => label === 'lozza' ? { mode: 'none', engineName: 'Lozza' } : CAPS,
        failed: () => false, cancelAll() {}, newGame() {}, destroy() {},
        request(job) {
          jobs.push(job);
          const [start, moveText] = job.position.split(' moves ');
          const g = new Chess(start.startsWith('position fen ') ? start.slice('position fen '.length) : undefined);
          if (moveText) moveText.split(' ').forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
          const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
          const pick = legal[(g.history().length * 7) % legal.length];
          return Promise.resolve({ bestUci: pick || null, infos: pick ? { 1: { depth: 12, multipv: 1, type: 'cp', value: 0, pv: [pick] } } : {} });
        }
      });
      let state = LG.newSeason(1, seeded(4));
      const target = state.fixtures.find(f => f.white === 'morphy' && f.black === 'carlsen');
      state.current = target.id;
      state.fixtures = state.fixtures.map(f => f.id === target.id ? f : Object.assign({}, f));
      // Fem que la jornada en curs sigui la del partit volgut.
      const ctl = TV.createTvController({ ChessCtor: Chess, engine: engine('stockfish'), lozzaEngine: engine('lozza'), random: seeded(5),
        legends: LG, loadLeague: () => lastRound(state, target), saveLeague: () => {}, loadPrefs: () => ({ speed: 'quick' }), savePrefs: () => {},
        getOpenings: () => [], getViewer: () => ({ calibrated: false, roc: 900 }) });
      await ctl.open();
      const plan = ctl.state().game.matchPlan;
      expect(plan.engines).toEqual({ w: 'lozza', b: 'stockfish' });
      for (let i = 0; i < 200 && ctl.state().game.moves.length < 24 && !ctl.state().game.end; i++) await jest.advanceTimersByTimeAsync(1000);
      const moves = jobs.filter(j => j.tag.kind === 'move');
      const early = moves.filter(j => j.tag.ply < 16), late = moves.filter(j => j.tag.ply >= 16);
      expect(late.length).toBeGreaterThan(2);
      early.filter(j => j.tag.engine === 'lozza').forEach(j => expect(j.go).toBe('go depth ' + plan.sides.w.depth + ' movetime ' + plan.sides.w.movetime));
      late.filter(j => j.tag.engine === 'lozza').forEach(j =>
        expect(j.go).toBe('go depth ' + (plan.sides.w.depth + L.LOZZA_DEPTH_BONUS) + ' movetime ' + Math.round(plan.sides.w.movetime * L.LOZZA_TIME_FACTOR)));
      late.filter(j => j.tag.engine === 'stockfish').forEach(j => expect(j.multipv).toBe(TV.TV_CONFIG.STYLE_MULTIPV));
      expect(ctl.state().game.attack).toMatchObject({ w: 'long', b: 'long' });
      // Un cop ha començat, la fase d'atac es manté encara que deixi de complir-se la condició.
      L.ALWAYS_FROM_PLY = 999;
      const seen = jobs.length;
      for (let i = 0; i < 100 && jobs.slice(seen).filter(j => j.tag.kind === 'move').length < 4 && !ctl.state().game.end; i++) await jest.advanceTimersByTimeAsync(1000);
      const after = jobs.slice(seen).filter(j => j.tag.kind === 'move');
      expect(after.length).toBeGreaterThan(1);
      after.filter(j => j.tag.engine === 'lozza').forEach(j =>
        expect(j.go).toBe('go depth ' + (plan.sides.w.depth + L.LOZZA_DEPTH_BONUS) + ' movetime ' + Math.round(plan.sides.w.movetime * L.LOZZA_TIME_FACTOR)));
      after.filter(j => j.tag.engine === 'stockfish').forEach(j => expect(j.multipv).toBe(TV.TV_CONFIG.STYLE_MULTIPV));
      ctl.close();
    } finally { L.ALWAYS_FROM_PLY = saved; }
  });

  // Lliga amb totes les partides jugades menys la indicada (perquè sigui la següent).
  function lastRound(state, target) {
    let s = state;
    s.fixtures.filter(f => f.id !== target.id).forEach((f) => { s = LG.record(s, f.id, { result: '1/2' }, seeded(1)).state; });
    return s;
  }
});

describe('Lliga de llegendes TV · defalliment d’un dels dos jugadors', () => {
  const S = TV.TV_CONFIG.SLUMP;

  test('el sorteig tria si hi ha defalliment, quin bàndol i des de quina jugada', () => {
    const plans = Array.from({ length: 400 }, (_, i) => TV.tvPlanSlump(seeded(100 + i)));
    const some = plans.filter(Boolean);
    expect(some.length / plans.length).toBeGreaterThan(S.CHANCE - 0.1);
    expect(some.length / plans.length).toBeLessThan(S.CHANCE + 0.1);
    expect(new Set(some.map(p => p.color))).toEqual(new Set(['w', 'b']));
    some.forEach((p) => {
      expect(p.fromPly).toBeGreaterThanOrEqual(S.FROM_MIN_PLY);
      expect(p.fromPly).toBeLessThanOrEqual(S.FROM_MAX_PLY);
    });
    // Amb la mateixa llavor, el mateix sorteig.
    expect(TV.tvPlanSlump(seeded(7))).toEqual(TV.tvPlanSlump(seeded(7)));
  });

  test('a partir de la jugada triada, Stockfish baixa d’Elo i Lozza calcula menys', () => {
    const sf = TV.tvLegendSide(CAPS, LG.legend('carlsen'), true, 0.62);
    const lz = TV.tvLegendSide(CAPS, LG.legend('morphy'), true, 0.62);
    const slump = { color: 'w', fromPly: 50 };
    expect(TV.tvSlumpSide(CAPS, sf, slump, 'w', 49)).toMatchObject({ level: sf.level, slumped: false });
    expect(TV.tvSlumpSide(CAPS, sf, slump, 'w', 50)).toMatchObject({ level: TV.tvSnapLevel(CAPS, sf.level - S.ELO_DROP), slumped: true });
    expect(TV.tvSlumpSide(CAPS, sf, slump, 'b', 90)).toMatchObject({ level: sf.level, slumped: false });
    const weak = TV.tvSlumpSide(CAPS, lz, slump, 'w', 60);
    expect(weak.depth).toBe(lz.depth - S.LOZZA_DEPTH_DROP);
    expect(weak.movetime).toBeLessThan(lz.movetime);
    expect(TV.tvSlumpSide(CAPS_SKILL, TV.tvLegendSide(CAPS_SKILL, LG.legend('karpov'), true, 0.62), slump, 'w', 60).level)
      .toBe(Math.round(0.62 * 20) - S.SKILL_DROP);
    expect(TV.tvSlumpSide(CAPS, sf, null, 'w', 120).slumped).toBe(false);
  });

  test('en Grau explica el defalliment una sola vegada, amb la jugada on comença', () => {
    const ids = { w: 'karpov', b: 'kasparov' }, engines = { w: 'stockfish', b: 'lozza' };
    let m = LG.remark({ ply: 10, color: 'w', ids, engines }, null).memory;
    m = LG.remark({ ply: 20, color: 'b', ids, engines }, m).memory;
    expect(LG.remark({ ply: 40, color: 'w', ids, engines, slump: { color: 'b', fromPly: 54 } }, m).remark).toBeFalsy();
    const out = LG.remark({ ply: 56, color: 'w', ids, engines, slump: { color: 'b', fromPly: 54 } }, m);
    expect(out.remark).toMatchObject({ kind: 'slump', id: 'kasparov' });
    expect(out.remark.turns[0].text).toContain('Kasparov');
    expect(out.remark.turns[1].text).toContain('Des de la jugada 28, Kasparov juga amb menys precisió');
    expect(out.remark.turns[1].text).not.toMatch(SQUARE);
    const again = LG.remark({ ply: 70, color: 'b', ids, engines, slump: { color: 'b', fromPly: 54 } }, out.memory);
    expect(again.remark === null || again.remark.kind !== 'slump').toBe(true);
  });

  describe('al controlador', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('el bàndol del defalliment juga amb menys nivell des de la jugada triada', async () => {
      const saved = Object.assign({}, S);
      Object.assign(S, { CHANCE: 1, FROM_MIN_PLY: 14, FROM_MAX_PLY: 14 });
      try {
        const jobs = [];
        const engine = (label) => ({
          ready: async () => label === 'lozza' ? { mode: 'none', engineName: 'Lozza' } : CAPS,
          failed: () => false, cancelAll() {}, newGame() {}, destroy() {},
          request(job) {
            jobs.push(job);
            const [start, moveText] = job.position.split(' moves ');
            const g = new Chess(start.startsWith('position fen ') ? start.slice('position fen '.length) : undefined);
            if (moveText) moveText.split(' ').forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
            const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
            const pick = legal[(g.history().length * 5) % legal.length];
            return Promise.resolve({ bestUci: pick || null, infos: pick ? { 1: { depth: 12, multipv: 1, type: 'cp', value: 0, pv: [pick] } } : {} });
          }
        });
        let state = LG.newSeason(1, seeded(4));
        const target = state.fixtures.find(f => f.white === 'carlsen' && f.black === 'karpov');
        state.fixtures.filter(f => f.id !== target.id).forEach((f) => { state = LG.record(state, f.id, { result: '1/2' }, seeded(1)).state; });
        const ctl = TV.createTvController({ ChessCtor: Chess, engine: engine('stockfish'), lozzaEngine: engine('lozza'), random: seeded(9),
          legends: LG, loadLeague: () => state, saveLeague: () => {}, loadPrefs: () => ({ speed: 'quick' }), savePrefs: () => {},
          getOpenings: () => [], getViewer: () => ({ calibrated: false, roc: 900 }) });
        await ctl.open();
        const plan = ctl.state().game.matchPlan;
        expect(plan.slump).toMatchObject({ fromPly: 14 });
        const weak = plan.slump.color;
        for (let i = 0; i < 200 && ctl.state().game.moves.length < 22 && !ctl.state().game.end; i++) await jest.advanceTimersByTimeAsync(1000);
        const level = (j) => Number((j.strength.find(x => /UCI_Elo value/.test(x)) || '').split(' ').pop());
        const moves = jobs.filter(j => j.tag.kind === 'move' && (j.tag.ply % 2 === 0 ? 'w' : 'b') === weak);
        const before = moves.filter(j => j.tag.ply < 14), after = moves.filter(j => j.tag.ply >= 14);
        expect(before.length).toBeGreaterThan(2);
        expect(after.length).toBeGreaterThan(1);
        before.forEach(j => expect(level(j)).toBe(plan.sides[weak].level));
        after.forEach(j => expect(level(j)).toBe(TV.tvSnapLevel(CAPS, plan.sides[weak].level - S.ELO_DROP)));
        // L'altre bàndol no canvia.
        jobs.filter(j => j.tag.kind === 'move' && (j.tag.ply % 2 === 0 ? 'w' : 'b') !== weak)
          .forEach(j => expect(level(j)).toBe(plan.sides[weak === 'w' ? 'b' : 'w'].level));
        expect(ctl.state().game.slumped).toEqual({ color: weak, fromPly: 14 });
        ctl.close();
      } finally { Object.assign(S, saved); }
    });
  });
});

describe('Lliga de llegendes TV · el motor i el nivell són interns', () => {
  const fs = require('fs');
  const path = require('path');
  const js = fs.readFileSync(path.join(__dirname, '../stockfishtv.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  test('la fitxa de cada jugador només diu classificació i què passa a la partida', () => {
    const meta = js.slice(js.indexOf('const legendText = legends'), js.indexOf('if (meta) meta.textContent'));
    expect(meta.length).toBeGreaterThan(50);
    expect(meta).not.toMatch(/sideText|engines|Motor|tvLevelLabel/);
    expect(meta).toContain("'Fase d\\'atac'");
    expect(meta).toContain("'Menys precisió'");
  });

  test('ni la classificació, ni els perfils, ni les notes de la lliga no diuen el motor', () => {
    expect(js).not.toContain('sftv-legends-eng');
    expect(html).not.toContain('sftv-legends-eng');
    expect(html).not.toContain('SF = Stockfish, LZ = Lozza');
    expect(js).toContain("li.appendChild(document.createTextNode(p.bio + ' Estil: ' + p.style + '.'));");
    expect(js).toContain("return p.short + ': ' + p.style + '.';");
    expect(js).toContain("legends ? 'Lliga de llegendes: cada jugador juga amb el seu estil.'");
    expect(js).toContain("help.textContent = state.legends || nextMate ? '' : text;");
    const plan = TV.tvLegendLevel(CAPS, TV.tvLegendPlan(LG, { id: 'x', round: 1, white: 'morphy', black: 'karpov' }, CAPS, true, seeded(1)));
    expect(plan.label.long).not.toMatch(ENGINE_TALK);
    expect(plan.reveal).toBeNull();
  });

  test('la línia d’estat diu qui juga pel seu nom', () => {
    expect(js).toContain("text = (mover ? 'Juga ' + mover + ' · ' + (g.turn === 'w' ? 'blanques' : 'negres')");
    expect(js).toContain("if (state.duelWarning && !state.legends)");
    expect(js).toContain("if (caps && !state.legends) {");
    expect(js).toContain("document.querySelector('#sftv-screen .sftv-engine-row')");
    expect(js).toContain("if (engineStatus) engineStatus.style.display = 'none';");
  });
});
