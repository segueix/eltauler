// TV duel: Loja independent, Stockfish analyst, adaptive pairings and fallback.
const { Chess } = require('chess.js');
const { spawnSync } = require('child_process');
const path = require('path');
const TV = require('../stockfishtv');

const CAPS = TV.tvEngineCapabilities(TV.parseUciOptions([
  'id name Stockfish',
  'option name Skill Level type spin default 20 min 0 max 20',
  'uciok'
]));
const results = (winners) => winners.map((winner, i) => ({
  winner, lozzaColor: i % 2 ? 'w' : 'b', plies: 42, reason: winner === 'draw' ? 'stalemate' : 'checkmate'
}));

describe('Stockfish vs Lozza TV · decisions del duel següent', () => {
  test('alterna els colors i no atribueix un Elo fals a Lozza', () => {
    const a = TV.tvMatchPlan([], { caps: CAPS, target: 10, unequal: true, random: () => 0.2 });
    const b = TV.tvMatchPlan(results(['stockfish']), { caps: CAPS, target: 10, unequal: true });
    expect(a.engines).toEqual({ w: 'lozza', b: 'stockfish' });
    expect(b.engines).toEqual({ w: 'lozza', b: 'stockfish' });
    expect(a.lozzaDepth).toBeGreaterThanOrEqual(2);
    expect(a.lozzaMovetime).toBeGreaterThan(0);
    expect(a).not.toHaveProperty('lozzaElo');
    expect(b.stockfishLevel).toBe(10);
  });
  test('les taules seguides activen obertures tàctiques i nivells moderadament desiguals', () => {
    const h = results(['draw', 'draw', 'draw', 'draw']);
    const plan = TV.tvMatchPlan(h, { caps: CAPS, target: 9, unequal: true, gameSeq: 1 });
    expect(plan.sharp).toBe(true);
    expect(plan.draws).toBe(4);
    expect(Math.abs(plan.bias)).toBe(2);
    expect(Math.abs(plan.stockfishLevel - 9)).toBe(2);
    expect(plan.reason).toMatch(/taules/);
  });
  test('després de guanyar dos cops Stockfish, el sistema dona opcions a Lozza', () => {
    const plan = TV.tvMatchPlan(results(['stockfish', 'stockfish']),
      { caps: CAPS, target: 8, unequal: true, gameSeq: 1 });
    expect(plan.stockfishLevel).toBe(7);
    expect(plan.bias).toBe(-1);
    expect(plan.lozzaDepth).toBeGreaterThan(TV.tvMatchPlan([], { caps: CAPS, target: 8 }).lozzaDepth);
  });
  test('el selector manual pot desactivar el contrast; l’historial és limitat i validat', () => {
    const h = results(Array(20).fill('draw'));
    const p = TV.tvMatchPlan(h, { caps: CAPS, target: 7, unequal: false });
    expect(p.stockfishLevel).toBe(7);
    expect(TV.tvRecentResults(h)).toHaveLength(TV.TV_CONFIG.RIVALRY_HISTORY);
    expect(TV.tvRecentResults([{ winner: 'invalid', plies: 2, lozzaColor: 'w' }])).toEqual([]);
  });
});

test('el repertori de Fins al mat té deu posicions legals i diferents', () => {
  const scenarios = TV.TV_MATE_SCENARIOS;
  expect(scenarios).toHaveLength(10);
  expect(new Set(scenarios.map(x => x.theme)).size).toBe(10);
  const positions = scenarios.map(scenario => {
    const chess = new Chess();
    if (scenario.fen) expect(chess.load(scenario.fen)).toBe(true);
    else for (const san of scenario.moves) expect(chess.move(san)).toBeTruthy();
    expect(chess.game_over()).toBe(false);
    return chess.fen().split(' ').slice(0, 4).join(' ');
  });
  expect(new Set(positions).size).toBe(scenarios.length);
  expect(scenarios.filter(x => x.fen)).toHaveLength(2);
});

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
      if (moveText) moveText.split(' ').forEach(u =>
        g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
      const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
      const uci = job.tag.kind === 'move' && played[g.history().length]
        ? played[g.history().length] : legal[0];
      return Promise.resolve({
        bestUci: uci || null,
        infos: uci ? { 1: { depth: 12, multipv: 1, type: 'cp', value: 0, pv: [uci] } } : {}
      });
    }
  };
}

describe('Stockfish vs Lozza TV · flux real del controlador', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const fools = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  test('cada motor juga el seu color; totes dues bandes són analitzades per Stockfish', async () => {
    const sf = mockEngine('stockfish', fools), lz = mockEngine('lozza', fools);
    const saved = [];
    const ctl = TV.createTvController({
      ChessCtor: Chess, engine: sf, lozzaEngine: lz, random: () => 0.2,
      loadPrefs: () => ({ speed: 'quick' }), savePrefs: p => saved.push(p),
      getOpenings: () => [], getViewer: () => ({ calibrated: false, roc: 900 })
    });
    await ctl.open();
    expect(ctl.state().game.engines).toEqual({ w: 'lozza', b: 'stockfish' });
    await jest.advanceTimersByTimeAsync(70000);
    expect(lz.jobs.some(j => j.tag.kind === 'move' && j.tag.engine === 'lozza')).toBe(true);
    expect(sf.jobs.some(j => j.tag.kind === 'move' && j.tag.engine === 'stockfish')).toBe(true);
    expect(sf.jobs.some(j => j.tag.kind === 'analysis')).toBe(true);
    expect(lz.jobs.some(j => j.tag.kind === 'analysis')).toBe(false);
    expect(lz.jobs.filter(j => j.tag.kind === 'move').every(j => j.go.startsWith('go depth '))).toBe(true);
    expect(sf.jobs.filter(j => j.tag.kind === 'analysis').every(j => j.strength.includes('setoption name Skill Level value 20'))).toBe(true);
    expect(saved.some(p => p.recent && p.recent.length > 0)).toBe(true);
    ctl.close();
    expect(sf.destroyed).toBe(1);
    expect(lz.destroyed).toBe(1);
  });
  test('Fins al mat aplica el mateix límit de cerca i completa la parella amb els colors intercanviats', async () => {
    const sf = mockEngine('stockfish', []), lz = mockEngine('lozza', []);
    const lozzaLookup = lz.request.bind(lz);
    let retried = false;
    lz.request = (job) => {
      if (!retried && job.tag.kind === 'move' && job.go === 'go depth 6 movetime 70') {
        retried = true;
        lz.jobs.push(job);
        return Promise.resolve({ bestUci: null, infos: {} });
      }
      return lozzaLookup(job);
    };
    const ctl = TV.createTvController({
      ChessCtor: Chess, engine: sf, lozzaEngine: lz, random: () => 0.2,
      loadPrefs: () => ({ speed: 'quick' }), getViewer: () => ({ calibrated: true, roc: 1400 })
    });
    await ctl.open();
    ctl.setUntilMate(true);
    expect(ctl.state().game.matchPlan.untilMate).toBeUndefined();
    ctl.newGame();
    const first = ctl.state().game;
    expect(first.matchPlan).toEqual(expect.objectContaining({ untilMate: true, rematch: false, depth: 6, movetime: 70 }));
    expect(first.styles).toBeNull();
    const start = jest.now();
    while (ctl.state().game.id === first.id && jest.now() - start < 1500000) {
      await jest.advanceTimersByTimeAsync(1000);
    }
    const second = ctl.state().game;
    expect(second.matchPlan).toEqual(expect.objectContaining({ untilMate: true, rematch: true, depth: 6, movetime: 70 }));
    expect(second.opening).toEqual(first.opening);
    expect(second.engines).toEqual({ w: first.engines.b, b: first.engines.w });
    expect(ctl.prefs().recent).toHaveLength(0);
    expect(ctl.prefs().mateRecent).toHaveLength(1);
    const search = 'go depth 6 movetime 70';
    for (const motor of [sf, lz]) {
      expect(motor.jobs.some(j => j.tag.kind === 'move' && j.go === search && j.multipv === 1)).toBe(true);
    }
    expect(lz.jobs.some(j => j.go === 'go depth 4')).toBe(true);
    expect(sf.jobs.filter(j => j.tag.kind === 'move' && j.go === search).every(j => j.strength.includes('setoption name Skill Level value 20'))).toBe(true);
    ctl.close();
  });

  test('els motors reben el mateix final en una revenja i la següent parella canvia de posició', async () => {
    const index = TV.TV_MATE_SCENARIOS.findIndex(x => x.fen);
    const scenario = TV.TV_MATE_SCENARIOS[index];
    const sf = mockEngine('stockfish', []), lz = mockEngine('lozza', []);
    const ctl = TV.createTvController({
      ChessCtor: Chess, engine: sf, lozzaEngine: lz, random: () => 0.2,
      loadPrefs: () => ({ speed: 'quick', untilMate: true, mateSeries: {
        index, returnColor: 'b', firstResult: 'stockfish'
      } }),
      getViewer: () => ({ calibrated: true, roc: 1400 })
    });
    await ctl.open();
    const start = ctl.state().game;
    expect(start.fen).toBe(scenario.fen);
    expect(start.opening).toEqual(expect.objectContaining({ fromPosition: true, plies: 0 }));
    expect(start.comment.text).toContain('Stockfish va guanyar la primera partida.');
    expect(start.engines).toEqual({ w: 'stockfish', b: 'lozza' });

    const time = jest.now();
    let state = start;
    while (!state.end && jest.now() - time < 1000000) {
      await jest.advanceTimersByTimeAsync(1000);
      state = ctl.state().game;
    }
    const position = 'position fen ' + scenario.fen;
    expect(sf.jobs.some(job => job.position === position && job.tag.kind === 'move')).toBe(true);
    expect(lz.jobs.some(job => job.position.startsWith(position + ' moves ') && job.tag.kind === 'move')).toBe(true);
    const expectedFinish = state.end.result === '1-0' ? '2 · Lozza 0'
      : state.end.result === '0-1' ? '1 · Lozza 1' : '1,5 · Lozza 0,5';
    expect(state.pairScore).toBe('Balanç de la parella: Stockfish ' + expectedFinish + '.');
    expect(ctl.prefs().mateSeries).toEqual({ index: index + 1, returnColor: null, firstResult: null });
    await jest.advanceTimersByTimeAsync(12000);
    expect(ctl.state().game.opening.name).toBe(TV.TV_MATE_SCENARIOS[index + 1].name);
    ctl.close();
  });

  test('Fins al mat continua després del llindar d’abandonament amb una valoració decisiva', async () => {
    const line = require('./fixtures/tv-games.json').games[0].moves;
    const sf = mockEngine('stockfish', line), lz = mockEngine('lozza', line);
    const baseRequest = sf.request.bind(sf);
    sf.request = async job => {
      const res = await baseRequest(job);
      if (job.tag.kind === 'analysis' && res.infos[1]) {
        const black = job.tag.fen.split(' ')[1] === 'b';
        res.infos[1].value = black ? -1400 : 1400;
      }
      return res;
    };
    const ctl = TV.createTvController({
      ChessCtor: Chess, engine: sf, lozzaEngine: lz, random: () => 0.2,
      loadPrefs: () => ({ speed: 'quick', untilMate: true }), getViewer: () => ({ calibrated: true, roc: 1400 })
    });
    await ctl.open();
    ctl.pause();
    const g = ctl._internal.game;
    const min = TV.TV_CONFIG.RESIGN_MIN_PLY;
    const streak = TV.TV_CONFIG.RESIGN_PLIES;
    const prior = line.slice(0, min);
    g.uci = prior.slice();
    g.moves = prior.map((u, ply) => {
      const mv = g.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
      expect(mv).not.toBeNull();
      return { ply, verbose: mv };
    });
    g.resign = { side: 'w', plies: streak };
    expect(TV.tvResignStep(g.resign, { reliable: true, best: { type: 'cp', value: 1400 } }, min + 1, 700).end.reason).toBe('resign');
    ctl.resume();
    await jest.advanceTimersByTimeAsync(12000);
    expect(ctl.state().game.id).toBe(g.id);
    expect(ctl.state().game.moves.length).toBeGreaterThan(min);
    expect(ctl.state().game.end).toBeNull();
    ctl.close();
  });

  test('si Lozza falla, Stockfish és el motor dels dos bàndols i s’avisa', async () => {
    const sf = mockEngine('stockfish', fools);
    const lozza = mockEngine('lozza-offline', fools);
    const ctl = TV.createTvController({ ChessCtor: Chess, engine: sf, lozzaEngine: lozza,
      random: () => 0.2, getOpenings: () => [], getViewer: () => null });
    await ctl.open();
    expect(ctl.state().duelWarning).toBe(true);
    expect(ctl.state().game.engines).toEqual({ w: 'stockfish', b: 'stockfish' });
    ctl.close();
  });
  test('el control manual queda exclòs de les estadístiques', async () => {
    const sf = mockEngine('stockfish', fools), lz = mockEngine('lozza', fools);
    const ctl = TV.createTvController({ ChessCtor: Chess, engine: sf, lozzaEngine: lz,
      random: () => 0.2, getOpenings: () => [], getViewer: () => null });
    await ctl.open();
    expect(ctl.takeControl()).toBe(true);
    expect(ctl._internal.game.hadManualControl).toBe(true);
    ctl.releaseControl();
    ctl.close();
  });
});

describe('motor Lozza distribuït', () => {
  test('respon a UCI, isready i una posició legal sense cap servidor', () => {
    const p = spawnSync(process.execPath, [path.join(__dirname, '..', 'lozza.js')], {
      input: 'uci\\nisready\\nucinewgame\\nposition startpos\\ngo depth 2\\nquit\\n'.replace(/\\n/g, '\n'),
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024
    });
    if (p.error) throw p.error;
    expect(p.status).toBe(0);
    expect(p.stdout).toContain('id name Lozza');
    expect(p.stdout).toContain('uciok');
    expect(p.stdout).toContain('readyok');
    expect(p.stdout).toMatch(/bestmove [a-h][1-8][a-h][1-8]/);
  });
});
