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
      const g = new Chess();
      const moveText = job.position.split(' moves ')[1];
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
