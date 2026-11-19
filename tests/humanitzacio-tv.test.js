// Humanització · integració amb la TV: la lliga la fa servir per defecte i es pot
// apagar sense que l'espectador ho vegi; els comentaristes distingeixen
// imprecisions i errors per l'anàlisi i mai revelen el mecanisme.
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const LG = require('../llegendes');
const H = require('../humanitzacio');

const CAPS = TV.tvEngineCapabilities(TV.parseUciOptions([
  'id name Stockfish 19',
  'option name Skill Level type spin default 20 min 0 max 20',
  'option name UCI_LimitStrength type check default false',
  'option name UCI_Elo type spin default 1320 min 1320 max 3190',
  'uciok'
]));
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Cap paraula que delati el mecanisme intern, ni el motor, ni caselles.
const REVEALS = /humanitz|aleator|fatiga|artificial|percentatge|algorisme|algoritme|simulad|llavor|programad|probabilitat|\bmotors?\b|Stockfish|Lozza|nivells?\b|profunditat/i;
const SQUARE = /\b[a-h][1-8]\b/;

function fakeEngine(label, jobs) {
  return {
    ready: async () => label === 'lozza' ? { mode: 'none', engineName: 'Lozza' } : CAPS,
    failed: () => false, cancelAll() {}, newGame() {}, destroy() {},
    request(job) {
      jobs.push(job);
      const [start, moveText] = job.position.split(' moves ');
      const g = new Chess(start.startsWith('position fen ') ? start.slice('position fen '.length) : undefined);
      if (moveText) moveText.split(' ').forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
      const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
      const n = Math.min(job.multipv || 1, legal.length);
      const infos = {};
      for (let i = 0; i < n; i++) infos[i + 1] = { depth: 14, multipv: i + 1, type: 'cp', value: 30 - 12 * i, pv: [legal[(i + g.history().length) % legal.length]] };
      return Promise.resolve({ bestUci: n ? infos[1].pv[0] : null, infos });
    }
  };
}

async function runGame(extraDeps, plies) {
  const jobs = [];
  let state = LG.newSeason(1, seeded(4));
  const ctl = TV.createTvController(Object.assign({ ChessCtor: Chess, engine: fakeEngine('stockfish', jobs), lozzaEngine: fakeEngine('lozza', jobs), random: seeded(9),
    legends: LG, loadLeague: () => state, saveLeague: () => {}, loadPrefs: () => ({ speed: 'quick' }), savePrefs: () => {},
    getOpenings: () => [], getViewer: () => ({ calibrated: false, roc: 900 }) }, extraDeps));
  await ctl.open();
  const texts = [];
  const plan = ctl.state().game.matchPlan;
  for (let i = 0; i < 400 && ctl.state().game.moves.length < plies && !ctl.state().game.end; i++) {
    await jest.advanceTimersByTimeAsync(1000);
    const c = ctl.state().game.comment;
    if (c) texts.push([c.text, c.say].concat((c.dialogue || []).map(t => t.text)).filter(Boolean).join(' '));
  }
  const moves = ctl.state().game.moves.length;
  ctl.close();
  return { jobs, plan, texts, moves };
}

describe('Humanització · integració amb la lliga de la TV', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('per defecte: l’anàlisi dona quatre línies (MultiPV) i no hi ha defalliment programat', async () => {
    const r = await runGame({}, 24);
    expect(r.moves).toBeGreaterThanOrEqual(20);
    expect(r.plan.slump).toBeNull();
    const analysis = r.jobs.filter(j => j.tag.kind === 'analysis');
    expect(analysis.length).toBeGreaterThan(10);
    analysis.forEach(j => expect(j.multipv).toBe(H.CONFIG.MULTIPV));
    // Amb línies d'anàlisi, el motor del jugador no ha de calcular MultiPV (no es duplica la feina).
    r.jobs.filter(j => j.tag.kind === 'move' && j.tag.ply >= 12).forEach(j => expect(j.multipv).toBe(1));
  });

  test('l’interruptor intern la desactiva i torna al comportament anterior', async () => {
    const r = await runGame({ humanize: false }, 16);
    const fixture = { id: '1:morphy>carlsen', round: 1, white: 'morphy', black: 'carlsen' };
    expect(TV.tvLegendPlan(LG, fixture, CAPS, true, () => 0.1, { humanize: false }).slump).toMatchObject({ fromPly: expect.any(Number) });
    expect(TV.tvLegendPlan(LG, fixture, CAPS, true, () => 0.1, { humanize: true }).slump).toBeNull();
    expect(r.moves).toBeGreaterThan(8);
    r.jobs.filter(j => j.tag.kind === 'analysis').forEach(j => expect(j.multipv).toBe(TV.TV_CONFIG.ANALYSIS_MULTIPV));
    expect(TV.TV_CONFIG.HUMANIZE.ENABLED).toBe(true);
  });

  test('els comentaris de la partida no revelen mai el mecanisme, el motor ni caselles inventades', async () => {
    const r = await runGame({}, 40);
    expect(r.texts.length).toBeGreaterThan(5);
    r.texts.forEach(t => expect(t).not.toMatch(REVEALS));
  });

  test('és determinista pel que fa a la humanització: la mateixa fixture, la mateixa llavor', async () => {
    const run = async () => {
      const r = await runGame({}, 30);
      return r.jobs.filter(j => j.tag.kind === 'move').map(j => j.tag.ply + j.position.length).slice(0, 10);
    };
    expect(await run()).toEqual(await run());
  });
});

describe('Humanització · comentaristes: imprecisió, error i error greu', () => {
  const ids = { w: 'morphy', b: 'karpov' };
  const base = (cls, link) => ({ ply: 20, color: 'w', features: null, ids: ids, engines: { w: 'lozza', b: 'stockfish' }, slip: { cls: cls, link: link } });

  test('cada classe té un diàleg amb el nom del jugador i sense caselles ni paraules internes', () => {
    ['imprecisio', 'error', 'errorGreu'].forEach((cls) => {
      const out = LG.remark(base(cls, null), LG.emptyRemarkMemory());
      expect(out.remark.kind).toBe('slip');
      expect(out.remark.turns).toHaveLength(2);
      expect(out.remark.turns[0].text).toContain('Morphy');
      const all = out.remark.turns.map(t => t.text).join(' ');
      expect(all).not.toMatch(REVEALS);
      expect(all).not.toMatch(SQUARE);
    });
    const classes = ['imprecisio', 'error', 'errorGreu'].map(c => LG.remark(base(c, null), LG.emptyRemarkMemory()).remark.turns[1].text);
    expect(new Set(classes).size).toBe(3);
    expect(classes[0]).toMatch(/imprecisi/);
    expect(classes[1]).toMatch(/error/);
    expect(classes[2]).toMatch(/error greu|important/);
  });

  test('el vincle amb l’estil només hi és quan es dona i no atribueix res intern', () => {
    const sense = LG.remark(base('error', null), LG.emptyRemarkMemory()).remark.turns[1].text;
    const amb = LG.remark(base('error', 'iniciativa'), LG.emptyRemarkMemory()).remark.turns[1].text;
    expect(amb.length).toBeGreaterThan(sense.length);
    expect(amb).toMatch(/iniciativa/);
    expect(amb).not.toMatch(REVEALS);
    ['iniciativa', 'riscRei', 'materialSac', 'simplifica', 'passiva', 'complicacio', 'estructura', 'maniobraLenta'].forEach((k) => {
      const t = LG.remark(base('error', k), LG.emptyRemarkMemory()).remark.turns[1].text;
      expect(t).not.toMatch(REVEALS);
      expect(t).not.toMatch(SQUARE);
    });
  });

  test('no se’n comenten massa: separació mínima i màxim per partida', () => {
    let mem = LG.emptyRemarkMemory();
    let said = 0;
    for (let ply = 14; ply < 120; ply += 2) {
      const out = LG.remark(Object.assign(base('error', null), { ply: ply }), mem);
      mem = out.memory;
      if (out.remark && out.remark.kind === 'slip') said++;
    }
    expect(said).toBe(3);
    // Només abans d'arribar-hi no hi ha cap comentari de tipus slip massa aviat.
    expect(LG.remark(Object.assign(base('error', null), { ply: 6 }), LG.emptyRemarkMemory()).remark).toBeNull();
  });

  // Anàlisis fiables inventades a partir de les línies del motor.
  const analysis = (fen, best, uci) => TV.tvBuildAnalysis(fen, { 1: { depth: 16, multipv: 1, type: 'cp', value: best, pv: [uci] }, 2: { depth: 16, multipv: 2, type: 'cp', value: best - 10, pv: ['a2a3'] } }, uci);
  function slipCtx(moveUci, bestUci, evalBefore, evalAfterWhite) {
    const start = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const g = new Chess(start);
    const mv = g.move({ from: moveUci.slice(0, 2), to: moveUci.slice(2, 4) });
    return { ChessCtor: Chess, fenBefore: start, fenAfter: g.fen(), move: mv, ply: 20, tier: 'mid', end: null, prepared: false,
      before: analysis(start, evalBefore, bestUci), after: Object.assign(analysis(g.fen(), -evalAfterWhite, 'e7e5'), { best: { type: 'cp', value: evalAfterWhite } }),
      legends: { api: LG, ids: ids, engines: { w: 'lozza', b: 'stockfish' } }, memory: Object.assign(TV.tvEmptyMemory(), { legend: LG.emptyRemarkMemory() }) };
  }

  const quiet = () => Object.assign(TV.tvEmptyMemory(), { legend: Object.assign(LG.emptyRemarkMemory(), { last: 20, profile: { w: true, b: true } }) });

  test('la classe surt de la variació real de l’avaluació (centipeons, mateix bàndol)', () => {
    const run = (after) => TV.tvLegendStep(slipCtx('f3g5', 'e1g1', 30, after), null, quiet());
    const slight = run(30 - 50), mistake = run(30 - 130), blunder = run(30 - 320), fine = run(30 - 10);
    expect(fine.comment).toBeNull();
    expect(slight.comment.legend.kind).toBe('slip');
    expect(slight.comment.dialogue[1].text).toMatch(/imprecisi/);
    expect(mistake.comment.dialogue[1].text).toMatch(/error/);
    expect(blunder.comment.dialogue[1].text).toMatch(/error greu|important/);
    [slight, mistake, blunder].forEach((o) => { expect(o.comment.text).not.toMatch(REVEALS); expect(o.comment.text).not.toMatch(SQUARE); });
  });

  test('si la jugada era la millor o la posició ja estava decidida, no es parla d’error', () => {
    const ctx = slipCtx('e1g1', 'e1g1', 30, -200);
    expect(TV.tvLegendStep(ctx, null, quiet()).comment).toBeNull();
    const decided = slipCtx('f3g5', 'e1g1', 800, 300);
    expect(TV.tvLegendStep(decided, null, quiet()).comment).toBeNull();
  });
});
