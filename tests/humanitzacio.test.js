// Humanització dinàmica (humanitzacio.js): llavors, estat de precisió independent
// per jugador, selecció entre candidates, vulnerabilitats per perfil i proteccions.
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const LG = require('../llegendes');
const H = require('../humanitzacio');

// Posició de migjoc oberta (cap final elemental) i quatre línies inventades
// (des de qui mou) amb pèrdues conegudes: les etiquetes les dona un `features` fals.
const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const MOVES = { best: 'e1g1', init: 'f3g5', trade: 'c4f7', passive: 'c4b3' };
const FAKE = {
  [MOVES.best]: { quiet: 1 },
  [MOVES.init]: { check: 1 },
  [MOVES.trade]: { trade: 1, captureValue: 3 },
  [MOVES.passive]: { retreat: 1, quiet: 1 }
};
const fakeFeatures = (Ctor, fen, uci) => Object.assign({}, FAKE[uci] || {});
const lines = (losses) => ['best', 'init', 'trade', 'passive'].map((k, i) => ({ uci: MOVES[k], type: 'cp', value: 30 - (losses[i] || 0), depth: 14 }));

function decideOnce(seed, id, opts) {
  const o = opts || {};
  const game = H.createGame({ seed: seed, players: { w: { id: id, weights: null }, b: { id: 'karpov', weights: null } } });
  return H.decide(game, 'w', Object.assign({ ChessCtor: Chess, fen: FEN, ply: o.ply === undefined ? 40 : o.ply,
    lines: o.lines || lines([0, 60, 60, 60]), engineUci: MOVES.best, features: fakeFeatures }, o.extra || {}));
}
function frequencies(id, n, opts) {
  const f = { best: 0, init: 0, trade: 0, passive: 0, total: 0 };
  const byUci = Object.keys(MOVES).reduce((m, k) => { m[MOVES[k]] = k; return m; }, {});
  for (let s = 0; s < n; s++) { const r = decideOnce('f' + s, id, opts); f[byUci[r.uci]]++; f.total++; }
  return f;
}

describe('Humanització · aleatorietat controlada per llavor', () => {
  test('la mateixa llavor dona la mateixa seqüència i llavors diferents, seqüències diferents', () => {
    const a = H.createRng(H.hashSeed('x')), b = H.createRng(H.hashSeed('x')), c = H.createRng(H.hashSeed('y'));
    const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    sa.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });

  test('la normal té mitjana ≈ 0 i desviació ≈ 1', () => {
    const r = H.createRng(7);
    const xs = Array.from({ length: 20000 }, () => H.gaussian(r));
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });

  test('les decisions són reproduïbles: mateixa llavor i mateixes entrades, mateixes jugades', () => {
    const run = () => {
      const game = H.createGame({ seed: 'partida-1', players: { w: { id: 'morphy' }, b: { id: 'carlsen' } } });
      return Array.from({ length: 30 }, (_, i) => H.decide(game, i % 2 ? 'b' : 'w',
        { ChessCtor: Chess, fen: FEN, ply: 20 + i, lines: lines([0, 20, 40, 60]), engineUci: MOVES.best, features: fakeFeatures }).uci);
    };
    expect(run()).toEqual(run());
  });
});

describe('Humanització · estat de precisió de cada jugador', () => {
  function series(seed, n, ids) {
    const game = H.createGame({ seed: seed, players: { w: { id: ids[0] }, b: { id: ids[1] } } });
    const out = { w: [], b: [] };
    for (let ply = 0; ply < n; ply++) {
      ['w', 'b'].forEach((c) => out[c].push(H.advance(game.sides[c], ply * 2 + (c === 'b' ? 1 : 0), 0.4, 0, 0)));
    }
    return out;
  }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

  test('cada jugador té la seva evolució: no es reparteixen ni s’alternen les caigudes', () => {
    let differ = 0, oneUp = 0, both = 0;
    for (let s = 0; s < 100; s++) {
      const q = series('p' + s, 80, ['morphy', 'carlsen']);
      expect(q.w).not.toEqual(q.b);
      differ++;
      // Un manté la precisió mentre l'altre passa per dificultats (en algun moment, 0,15 de diferència).
      if (q.w.some((v, i) => v - q.b[i] > 0.15) && q.b.some((v, i) => v - q.w[i] > 0.15)) both++;
      if (q.w.some((v, i) => Math.abs(v - q.b[i]) > 0.15)) oneUp++;
    }
    expect(differ).toBe(100);
    expect(oneUp).toBeGreaterThan(70);
    // I també hi ha partides on cadascun té la seva fase millor: el guanyador no està escrit.
    expect(both).toBeGreaterThan(25);
  });

  test('la seqüència d’un jugador no depèn del color ni de qui té davant', () => {
    const a = series('seed-9', 60, ['morphy', 'carlsen']);
    const gameSwapped = H.createGame({ seed: 'seed-9', players: { w: { id: 'carlsen' }, b: { id: 'morphy' } } });
    const morphyAsBlack = [];
    for (let ply = 0; ply < 60; ply++) morphyAsBlack.push(H.advance(gameSwapped.sides.b, ply * 2 + 1, 0.4, 0, 0));
    // Mateixa identitat i llavor → mateixa fluctuació; només hi canvia el nombre de semijugades que passen.
    const g2 = H.createGame({ seed: 'seed-9', players: { w: { id: 'morphy' }, b: { id: 'carlsen' } } });
    const g3 = H.createGame({ seed: 'seed-9', players: { w: { id: 'carlsen' }, b: { id: 'morphy' } } });
    expect(g2.sides.w.x).toBeCloseTo(g3.sides.b.x, 12);
    expect(g2.sides.b.x).toBeCloseTo(g3.sides.w.x, 12);
    expect(morphyAsBlack).toHaveLength(60);
    expect(a.w).toHaveLength(60);
  });

  test('la fluctuació és correlada en el temps: sense salts absurds entre dues jugades seguides', () => {
    let maxJump = 0, acSum = 0, n = 0;
    for (let s = 0; s < 60; s++) {
      const q = series('c' + s, 120, ['steinitz', 'lasker']).w;
      for (let i = 1; i < q.length; i++) maxJump = Math.max(maxJump, Math.abs(q[i] - q[i - 1]));
      const m = mean(q);
      let num = 0, den = 0;
      for (let i = 1; i < q.length; i++) num += (q[i] - m) * (q[i - 1] - m);
      q.forEach(v => { den += (v - m) ** 2; });
      acSum += num / den; n++;
    }
    expect(acSum / n).toBeGreaterThan(0.5);
    expect(maxJump).toBeLessThan(0.45);
  });

  test('no baixa a cada moviment: la precisió puja i baixa, i el desgast és moderat', () => {
    let ups = 0, steps = 0, early = 0, late = 0, count = 0;
    for (let s = 0; s < 80; s++) {
      const q = series('w' + s, 120, ['kasparov', 'karpov']).w;
      for (let i = 1; i < q.length; i++) { steps++; if (q[i] > q[i - 1]) ups++; }
      early += mean(q.slice(0, 20)); late += mean(q.slice(-20)); count++;
    }
    expect(ups / steps).toBeGreaterThan(0.35);
    expect(ups / steps).toBeLessThan(0.65);
    // Desgast mitjà d'una partida llarga: com a molt uns pocs punts de precisió.
    expect((early - late) / count).toBeGreaterThan(0);
    expect((early - late) / count).toBeLessThan(0.2);
  });

  test('permet recuperar la precisió després d’una fase baixa', () => {
    let recovered = 0;
    for (let s = 0; s < 100; s++) {
      const q = series('r' + s, 120, ['lasker', 'capablanca']).w;
      const low = q.findIndex((v, i) => i > 5 && v < 0.55);
      if (low >= 0 && q.slice(low + 1).some(v => v > 0.72)) recovered++;
    }
    expect(recovered).toBeGreaterThan(40);
  });

  test('les caigudes no estan lligades a números fixos de moviment', () => {
    const bins = {};
    for (let s = 0; s < 300; s++) {
      const q = series('m' + s, 100, ['alekhine', 'botvinnik']).w;
      const worst = q.indexOf(Math.min.apply(null, q));
      bins[Math.floor(worst / 10)] = (bins[Math.floor(worst / 10)] || 0) + 1;
    }
    const total = Object.values(bins).reduce((a, b) => a + b, 0);
    expect(Math.max.apply(null, Object.values(bins)) / total).toBeLessThan(0.3);
    expect(Object.keys(bins).length).toBeGreaterThanOrEqual(5);
  });

  test('els perfils d’igual tipus tenen la mateixa precisió esperada (cap compensació oculta)', () => {
    const avgQ = (id, color) => {
      let t = 0;
      for (let s = 0; s < 1000; s++) {
        const game = H.createGame({ seed: 'e' + s, players: { w: { id: id }, b: { id: id } } });
        for (let ply = 0; ply < 80; ply++) t += H.advance(game.sides[color], ply, 0.4, 0, 0);
      }
      return t / (1000 * 80);
    };
    expect(Math.abs(avgQ('morphy', 'w') - avgQ('morphy', 'b'))).toBeLessThan(0.025);
    expect(Math.abs(avgQ('morphy', 'w') - avgQ('kasparov', 'w'))).toBeLessThan(0.03);
    expect(Math.abs(avgQ('carlsen', 'w') - avgQ('lasker', 'w'))).toBeLessThan(0.04);
  });
});

describe('Humanització · perfils', () => {
  test('els 10 jugadors de la lliga tenen perfil, amb els cinc arquetips representats', () => {
    LG.IDS.forEach((id) => {
      const p = H.profileFor(id);
      expect(H.ARCHETYPES).toContain(p.archetype);
      H.TRAIT_KEYS.forEach(k => { expect(p[k]).toBeGreaterThanOrEqual(0); expect(p[k]).toBeLessThanOrEqual(1); });
    });
    expect(new Set(LG.IDS.map(id => H.profileFor(id).archetype)).size).toBe(5);
    Object.keys(H.PROFILES).forEach(id => expect(LG.IDS).toContain(id));
  });

  test('els trets del perfil són coherents amb la descripció de cada arquetip', () => {
    expect(H.profileFor('morphy').agressivitat).toBeGreaterThan(H.profileFor('karpov').agressivitat);
    expect(H.profileFor('karpov').prudencia).toBeGreaterThan(H.profileFor('morphy').prudencia);
    expect(H.profileFor('capablanca').finals).toBeGreaterThanOrEqual(0.9);
    expect(H.profileFor('steinitz').estrategica).toBeGreaterThan(H.profileFor('steinitz').tactica);
    expect(H.profileFor('alekhine').tactica).toBeGreaterThan(H.profileFor('alekhine').estrategica);
    expect(H.profileFor('lasker').pressio).toBeGreaterThanOrEqual(0.9);
  });

  test('els perfils d’estil del duel (sense llegenda) també en reben un a partir dels seus pesos', () => {
    const attacker = H.traitsFromWeights({ check: 3, approach: 1.2, storm: 1.5, sacrifice: 1, threat: 0.6, trade: -1.5, retreat: -0.8 });
    const wall = H.traitsFromWeights({ castle: 3, shield: -2.5, trade: 1.2, tradeAhead: 2, tradeBehind: -1.5, sacrifice: -2.5, kingMove: -1, retreat: 0.6, development: 0.8, check: -0.8, approach: -0.6, storm: -1.5, quiet: 0.4 });
    expect(['agressiu', 'tactic']).toContain(attacker.archetype);
    expect(wall.agressivitat).toBeLessThan(attacker.agressivitat);
    expect(wall.prudencia).toBeGreaterThan(attacker.prudencia);
    expect(H.profileFor({ id: 'inventat', weights: null }).archetype).toBeNull();
  });
});

describe('Humanització · selecció natural de jugades', () => {
  test('la jugada triada sempre és una de les candidates de l’anàlisi (mai absurda)', () => {
    for (let s = 0; s < 200; s++) {
      const r = decideOnce('a' + s, 'fischer');
      expect(Object.values(MOVES)).toContain(r.uci);
    }
  });

  test('la probabilitat d’una alternativa baixa a mesura que augmenta la pèrdua', () => {
    const l = [0, 15, 40, 80];
    const total = [0, 0, 0, 0];
    let k = 0;
    for (let s = 0; s < 400; s++) {
      const r = decideOnce('b' + s, 'carlsen', { lines: lines(l), extra: { features: () => ({}) } });
      if (!r.candidates) continue;
      k++;
      r.candidates.forEach((c, i) => { total[i] += c.p; });
    }
    expect(k).toBeGreaterThan(300);
    expect(total[0]).toBeGreaterThan(total[1]);
    expect(total[1]).toBeGreaterThan(total[2]);
    expect(total[2]).toBeGreaterThan(total[3]);
  });

  test('les imprecisions petites són més freqüents que els errors importants, que són excepcionals', () => {
    const cls = { bona: 0, imprecisio: 0, error: 0, errorGreu: 0 };
    for (let s = 0; s < 1500; s++) {
      const r = decideOnce('d' + s, 'fischer', { lines: lines([0, 35, 100, 220]), extra: { features: () => ({}) } });
      cls[r.cls]++;
    }
    expect(cls.bona).toBeGreaterThan(cls.imprecisio);
    expect(cls.imprecisio).toBeGreaterThan(cls.error);
    expect(cls.errorGreu / 1500).toBeLessThan(0.02);
  });

  test('els errors greus només són possibles en posicions realment complexes', () => {
    const quiet = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const ls = [{ uci: 'e2e4', type: 'cp', value: 25, depth: 14 }, { uci: 'd2d4', type: 'cp', value: 24, depth: 14 },
      { uci: 'g1f3', type: 'cp', value: 22, depth: 14 }, { uci: 'a2a3', type: 'cp', value: -250, depth: 14 }];
    let bigQuiet = 0;
    for (let s = 0; s < 800; s++) {
      const game = H.createGame({ seed: 'q' + s, players: { w: { id: 'morphy' }, b: { id: 'karpov' } } });
      const r = H.decide(game, 'w', { ChessCtor: Chess, fen: quiet, ply: 30, lines: ls, engineUci: 'e2e4', features: () => ({}) });
      if (r.cls === 'errorGreu') bigQuiet++;
    }
    expect(bigQuiet).toBe(0);
  });

  test('protegeix els mats, els finals elementals i les posicions clarament guanyades', () => {
    const mate = decideOnce('m', 'morphy', { lines: [{ uci: MOVES.best, type: 'mate', value: 3, depth: 14 }, { uci: MOVES.init, type: 'cp', value: 0, depth: 14 }] });
    expect(mate).toMatchObject({ uci: MOVES.best, bypass: 'mat', changed: false });
    const against = decideOnce('m2', 'morphy', { lines: [{ uci: MOVES.best, type: 'cp', value: -90, depth: 14 }, { uci: MOVES.init, type: 'mate', value: -4, depth: 14 }] });
    expect(against.bypass).toBe('mat');
    const kqk = H.decide(H.createGame({ seed: 1, players: { w: { id: 'morphy' }, b: { id: 'karpov' } } }), 'w',
      { ChessCtor: Chess, fen: '8/8/8/4k3/8/8/8/KQ6 w - - 0 1', ply: 90, lines: [{ uci: 'b1b5', type: 'cp', value: 900, depth: 14 }, { uci: 'b1c2', type: 'cp', value: 850, depth: 14 }], engineUci: 'b1b5' });
    expect(kqk).toMatchObject({ bypass: 'final-elemental', uci: 'b1b5' });
    expect(H.elementaryEnding(Chess, '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1')).toBe(true);
    expect(H.elementaryEnding(Chess, FEN)).toBe(false);
    // Una victòria clara (+400) no es llença: només s'admeten alternatives que la conserven.
    for (let s = 0; s < 300; s++) {
      const r = decideOnce('g' + s, 'fischer', { lines: [{ uci: MOVES.best, type: 'cp', value: 400, depth: 14 }, { uci: MOVES.init, type: 'cp', value: 330, depth: 14 },
        { uci: MOVES.trade, type: 'cp', value: 90, depth: 14 }, { uci: MOVES.passive, type: 'cp', value: -50, depth: 14 }], extra: { features: () => ({}) } });
      expect([MOVES.best, MOVES.init]).toContain(r.uci);
    }
  });

  test('no s’impedeixen les taules, però qui no va per sota no es llença a un ofegat si hi ha una alternativa raonable', () => {
    const FEN_STALE = '7k/8/6K1/8/8/8/PP6/5Q2 w - - 0 1';
    expect(H.endsInDeadDraw(Chess, FEN_STALE, 'f1f7')).toBe(true);
    expect(H.endsInDeadDraw(Chess, FEN_STALE, 'f1b5')).toBe(false);
    const ls = [{ uci: 'f1b5', type: 'cp', value: 800, depth: 14 }, { uci: 'f1f7', type: 'cp', value: 790, depth: 14 }, { uci: 'f1f2', type: 'cp', value: 780, depth: 14 }];
    const share = () => {
      let stale = 0;
      for (let s = 0; s < 600; s++) {
        const game = H.createGame({ seed: 'st' + s, players: { w: { id: 'carlsen' }, b: { id: 'karpov' } } });
        if (H.decide(game, 'w', { ChessCtor: Chess, fen: FEN_STALE, ply: 80, lines: ls, engineUci: 'f1b5', features: () => ({}) }).uci === 'f1f7') stale++;
      }
      return stale / 600;
    };
    const withPenalty = share();
    const saved = H.CONFIG.DEAD_DRAW_PENALTY;
    H.CONFIG.DEAD_DRAW_PENALTY = 0;
    const without = share();
    H.CONFIG.DEAD_DRAW_PENALTY = saved;
    expect(withPenalty).toBeLessThan(without);
    // I tampoc no és prohibit: continua sent possible.
    expect(H.CONFIG.DEAD_DRAW_PENALTY).toBeGreaterThan(0);
  });

  test('en una posició igualada i avançada es prefereix mantenir la tensió abans que simplificar cap a taules', () => {
    const share = (ply) => {
      let trade = 0;
      for (let s = 0; s < 800; s++) {
        const game = H.createGame({ seed: 'amb' + s, players: { w: { id: 'carlsen' }, b: { id: 'karpov' } } });
        const r = H.decide(game, 'w', { ChessCtor: Chess, fen: FEN, ply: ply, lines: lines([0, 20, 20, 20]).map((l, i) => Object.assign(l, { value: 10 - (i ? 20 : 0) })),
          engineUci: MOVES.best, features: fakeFeatures });
        if (r.uci === MOVES.trade) trade++;
      }
      return trade / 800;
    };
    // Mateixa posició: abans de la semijugada 20 no hi ha ambició; després, simplificar costa.
    expect(share(60)).toBeLessThan(share(12));
    const saved = H.CONFIG.CONTEMPT_TRADE;
    H.CONFIG.CONTEMPT_TRADE = 0;
    const without = share(60);
    H.CONFIG.CONTEMPT_TRADE = saved;
    expect(share(60)).toBeLessThan(without);
  });

  test('en les primeres jugades la teoria es respecta més que al migjoc', () => {
    const early = frequencies('morphy', 500, { ply: 12 });
    const mid = frequencies('morphy', 500, { ply: 60 });
    expect(early.best / early.total).toBeGreaterThan(mid.best / mid.total);
  });

  test('amb la humanització desactivada o sense candidates, mana el motor', () => {
    const off = H.createGame({ seed: 1, enabled: false, players: { w: { id: 'morphy' }, b: { id: 'karpov' } } });
    expect(H.decide(off, 'w', { ChessCtor: Chess, fen: FEN, ply: 40, lines: lines([0, 20, 40, 60]), engineUci: MOVES.passive, features: fakeFeatures }))
      .toMatchObject({ uci: MOVES.passive, bypass: 'desactivat' });
    expect(decideOnce('z', 'morphy', { lines: [{ uci: MOVES.best, type: 'cp', value: 0, depth: 14 }] }).bypass).toBe('sense-candidates');
  });

  test('línies del motor → candidates (sense límits ni mats mal formats)', () => {
    const out = H.linesFromInfos({ 2: { multipv: 2, type: 'cp', value: 10, pv: ['d2d4'], depth: 12 }, 1: { multipv: 1, type: 'cp', value: 20, pv: ['e2e4'], depth: 12 },
      3: { multipv: 3, type: 'cp', value: 5, pv: ['g1f3'], bound: 'lower' }, 4: { multipv: 4, type: 'cp', value: 5, pv: [] } });
    expect(out.map(l => l.uci)).toEqual(['e2e4', 'd2d4']);
  });

  test('classes d’error segons la variació real de l’avaluació', () => {
    expect(H.classifyLoss(10)).toBe('bona');
    expect(H.classifyLoss(45)).toBe('imprecisio');
    expect(H.classifyLoss(120)).toBe('error');
    expect(H.classifyLoss(350)).toBe('errorGreu');
  });
});

describe('Humanització · els errors reflecteixen la personalitat', () => {
  // Cada perfil és un biaix probabilístic: es compara la freqüència amb què cada
  // arquetip tria cada alternativa inferior amb la mateixa posició i les mateixes pèrdues.
  const N = 1500;
  const F = {
    agressiu: frequencies('morphy', N), defensiu: frequencies('karpov', N),
    posicional: frequencies('steinitz', N), tactic: frequencies('alekhine', N), tecnic: frequencies('capablanca', N)
  };
  const share = (a, k) => F[a][k] / F[a].total;

  test('les vulnerabilitats canvien QUIN error es comet, no QUANTS: la massa de les alternatives inferiors no depèn del perfil', () => {
    // Sense especialització (tots els arquetips amb els mateixos trets d'habilitat), només les
    // vulnerabilitats els distingeixen: la probabilitat d'alguna alternativa és la mateixa.
    const flat = (archetype) => ({ id: 'x-' + archetype, archetype });
    const frac = (archetype) => {
      let inferior = 0;
      for (let s = 0; s < 1200; s++) {
        const game = H.createGame({ seed: 'v' + s, players: { w: { id: 'x' }, b: { id: 'y' } } });
        game.sides.w.profile = Object.assign({}, H.NEUTRAL, flat(archetype));
        const r = H.decide(game, 'w', { ChessCtor: Chess, fen: FEN, ply: 12, lines: lines([0, 60, 60, 60]), engineUci: MOVES.best, features: fakeFeatures });
        if (r.uci !== MOVES.best) inferior++;
      }
      return inferior / 1200;
    };
    const f = H.ARCHETYPES.map(frac);
    expect(Math.max.apply(null, f) - Math.min.apply(null, f)).toBeLessThan(0.05);
  });

  test('l’especialització no canvia la força global: la temperatura mitjana entre posició tàctica i estratègica és semblant per a tots els perfils', () => {
    const facts = t => ({ complexity: 0.5, tactical: t, closed: false, phase: 'migjoc' });
    const avg = id => (H.tauFor(0.7, H.profileFor(id), facts(true), 60, 0) + H.tauFor(0.7, H.profileFor(id), facts(false), 60, 0)) / 2;
    const taus = LG.IDS.map(avg);
    expect(Math.max.apply(null, taus) / Math.min.apply(null, taus)).toBeLessThan(1.12);
    // I cada perfil és millor allà on és fort.
    expect(H.tauFor(0.7, H.profileFor('alekhine'), facts(true), 60, 0)).toBeLessThan(H.tauFor(0.7, H.profileFor('alekhine'), facts(false), 60, 0));
    expect(H.tauFor(0.7, H.profileFor('steinitz'), facts(false), 60, 0)).toBeLessThan(H.tauFor(0.7, H.profileFor('steinitz'), facts(true), 60, 0));
  });

  test('el jugador agressiu tria més la jugada amb iniciativa que el defensiu o el tècnic', () => {
    expect(share('agressiu', 'init')).toBeGreaterThan(share('defensiu', 'init'));
    expect(share('agressiu', 'init')).toBeGreaterThan(share('tecnic', 'init'));
  });

  test('el defensiu i el tècnic simplifiquen més que l’agressiu, i el defensiu cau més en la jugada passiva', () => {
    expect(share('defensiu', 'trade')).toBeGreaterThan(share('agressiu', 'trade'));
    expect(share('tecnic', 'trade')).toBeGreaterThan(share('agressiu', 'trade'));
    expect(share('defensiu', 'passive')).toBeGreaterThan(share('agressiu', 'passive'));
  });

  test('el jugador tàctic és més temptat per la continuació amb escac que el posicional', () => {
    expect(share('tactic', 'init')).toBeGreaterThan(share('posicional', 'init'));
  });

  test('les vulnerabilitats són probabilístiques: la millor jugada continua sent la més triada i hi ha de tot', () => {
    Object.keys(F).forEach((a) => {
      // Amb tres alternatives a 60 cp (imprecisions), la millor continua sent la més triada.
      ['init', 'trade', 'passive'].forEach(k => expect(share(a, 'best')).toBeGreaterThan(share(a, k)));
      expect(share(a, 'best')).toBeGreaterThan(0.3);
      expect(F[a].best + F[a].init + F[a].trade + F[a].passive).toBe(N);
    });
    // Un agressiu no s'equivoca sempre atacant: de les alternatives que tria, bona part no és la d'iniciativa.
    const inferior = F.agressiu.init + F.agressiu.trade + F.agressiu.passive;
    expect(F.agressiu.init / inferior).toBeLessThan(0.85);
    expect(F.agressiu.init).toBeGreaterThan(0);
    expect(F.defensiu.init).toBeGreaterThan(0);
  });

  test('un jugador defensiu també troba la combinació quan és l’única bona jugada', () => {
    let found = 0;
    for (let s = 0; s < 300; s++) {
      const r = decideOnce('t' + s, 'karpov', { lines: [{ uci: MOVES.init, type: 'cp', value: 120, depth: 14 }, { uci: MOVES.best, type: 'cp', value: -140, depth: 14 },
        { uci: MOVES.trade, type: 'cp', value: -150, depth: 14 }, { uci: MOVES.passive, type: 'cp', value: -160, depth: 14 }],
        extra: { engineUci: MOVES.init, features: fakeFeatures } });
      if (r.uci === MOVES.init) found++;
    }
    expect(found).toBe(300);
  });

  test('etiquetes de jugada: només fets comprovats', () => {
    const f = TV.tvMoveFeatures(Chess, 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1', 0);
    expect(H.tagList(H.moveFlags(f, 0))).toEqual(expect.not.arrayContaining(['iniciativa']));
    const g = TV.tvMoveFeatures(Chess, 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', 'f3e5', 0);
    expect(H.moveFlags(g, 0).forcing).toBe(true);
    // Un peó doblat és empitjorament de l'estructura.
    expect(H.pawnDelta(Chess, '4k3/8/8/8/8/3P4/2P5/4K3 w - - 0 1', 'c2c3')).toBeGreaterThanOrEqual(0);
    expect(H.pawnDelta(Chess, '4k3/8/8/2p5/1P6/2P5/8/4K3 w - - 0 1', 'b4b5')).toBeLessThanOrEqual(0);
  });

  test('vincle estil–jugada només si la jugada és compatible amb el perfil', () => {
    expect(H.styleLink('agressiu', { iniciativa: true })).toBe('iniciativa');
    expect(H.styleLink('agressiu', { passiva: true })).toBeNull();
    expect(H.styleLink('defensiu', { simplifica: true })).toBe('simplifica');
    expect(H.styleLink(null, { iniciativa: true })).toBeNull();
  });
});

describe('Humanització · equitat entre jugadors i registre tècnic', () => {
  test('els dos bàndols reben el mateix tractament estadístic en una posició idèntica', () => {
    const share = (color) => {
      let best = 0;
      for (let s = 0; s < 800; s++) {
        const game = H.createGame({ seed: 'n' + s, players: { w: { id: 'carlsen' }, b: { id: 'carlsen' } } });
        const r = H.decide(game, color, { ChessCtor: Chess, fen: FEN, ply: 40, lines: lines([0, 25, 25, 25]), engineUci: MOVES.best, features: fakeFeatures });
        if (r.uci === MOVES.best) best++;
      }
      return best / 800;
    };
    expect(Math.abs(share('w') - share('b'))).toBeLessThan(0.05);
  });

  test('el registre tècnic desa cada decisió i el resum n’agrupa les classes', () => {
    const game = H.createGame({ seed: 'log', players: { w: { id: 'morphy' }, b: { id: 'karpov' } } });
    for (let i = 0; i < 20; i++) H.decide(game, i % 2 ? 'b' : 'w', { ChessCtor: Chess, fen: FEN, ply: 30 + i, lines: lines([0, 30, 60, 100]), engineUci: MOVES.best, features: fakeFeatures });
    expect(game.log).toHaveLength(20);
    game.log.forEach(r => expect(r).toEqual(expect.objectContaining({ ply: expect.any(Number), color: expect.stringMatching(/^[wb]$/), id: expect.any(String) })));
    const sum = H.summarizeLog(game.log);
    expect(sum.moves).toBe(20);
    expect(sum.bona + sum.imprecisio + sum.error + sum.errorGreu + sum.bypass).toBe(20);
  });
});
