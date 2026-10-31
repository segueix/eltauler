// Col·lecció de jeroglífics: banc diari acumulat, ordre de prioritat en demanar-ne
// un, finestra final (guardar / eliminar), origen visible i enllaços compartits.
const fs = require('fs');
const vm = require('vm');
const { Chess } = require('chess.js');
const Core = require('../core');
const H = require('../hieroclosure');
const reserve = require('../jeroglifics-reserva.js');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const between = (start, end) => {
    const a = source.indexOf(start);
    if (a < 0) throw new Error('No trobat: ' + start);
    return source.slice(a, source.indexOf(end, a));
};

function setup(opts = {}) {
    const store = { history: opts.history || [] };
    const state = { queue: opts.queue || [], updatedAt: 0, generation: {} };
    const ctx = vm.createContext({
        Chess, Date, JSON, Math, URLSearchParams, console,
        window: { ElTaulerHieroReserve: opts.reserve || [] },
        hgState: state, hgEnsureState: () => state, hgPurgeStale: () => {}, hgSaveState: jest.fn(),
        renderHieroglyphicBanner: () => {}, hieroglyphicStats: { solvedFens: [] }, saveHieroglyphicStats: jest.fn(),
        hgFenKey: f => Core.puzzleFenKey(f), hasVerifiedHieroglyphicConclusion: c => H.matches(c),
        hieroglyphicPreferredFinalMotif: 'any', buildHieroglyphicBundleSequence: c => !!(c && c.fen),
        hgQueueItemToChosen: it => Object.assign({}, it),
        loadHieroglyphicHistory: () => JSON.parse(JSON.stringify(store.history)),
        saveHieroglyphicHistory: list => { store.history = JSON.parse(JSON.stringify(list)); },
        escapeHtml: x => String(x), hieroglyphicDifficultyPercent: () => 50,
        currentHieroglyphicPuzzle: null, currentHieroglyphicWrongMoves: 0,
        HIERO_FINAL_MOTIF_LABELS: Core.HIERO_FINAL_MOTIF_LABELS,
        hieroglyphicFinalLabel: m => (m ? Core.HIERO_FINAL_MOTIF_LABELS[m] || null : null)
    });
    ctx.hgAllKnownFens = () => {
        const set = new Set();
        state.queue.forEach(it => set.add(Core.puzzleFenKey(it.fen)));
        store.history.forEach(e => set.add(Core.puzzleFenKey(e.fen)));
        return set;
    };
    vm.runInContext(between('function hgNewCount(', '// ── Detecció de dispositiu modest')
        + between('function hgReserveItems(', '// Certifica llavors de la reserva')
        + between('const HG_QUEUE_CAP', '// ── Cicle de generació en segon pla')
        + between('function hieroglyphicEntryCleanSolved(', 'function positionHieroglyphicPanelForViewport(')
        + between('function upsertHieroglyphicHistory(', 'function sanitizeHieroglyphicText(')
        + between('function hieroglyphicHistoryStatus(', '// Compatibilitat: abans l\'historial')
        + between('const HG_SHARE_ORIGIN', 'function openSharedHieroglyphic('), ctx);
    return { ctx, store, state, run: code => vm.runInContext(code, ctx) };
}
const entry = (fen, extra = {}) => Object.assign({
    id: 'h_' + fen.slice(0, 12), fen, solved: false, solutionMoves: ['a', 'b', 'c'], replyMoves: ['x', 'y'],
    origin: 'engine_selfplay', ts: 1
}, extra);
const FENS = [
    '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1',
    '6k1/5ppp/8/8/8/8/5PPP/3B2K1 w - - 0 1',
    '6k1/5ppp/8/8/8/8/5PPP/3N2K1 w - - 0 1'
];

describe('banc diari acumulat i ordre dels nous', () => {
    test('tot el banc diari que encara no s\'ha jugat compta com a nou (no només uns quants)', () => {
        const app = setup({ reserve: reserve.slice(0, 12) });
        expect(app.run('hgNewCount()')).toBe(12);
        expect(app.state.queue).toHaveLength(0);
    });

    test('primer els de les partides del jugador; després els més recents', () => {
        const daily = reserve.slice(0, 2).map((it, i) => Object.assign({}, it, { publishedAt: 1000 + i }));
        const app = setup({
            reserve: daily,
            queue: [
                { id: 'q_auto', fen: FENS[0], status: 'new', origin: 'engine_selfplay', source: 'selfplay', createdAt: 5000 },
                { id: 'q_player', fen: FENS[1], status: 'new', origin: 'game_real', source: 'postgame', createdAt: 10 }
            ]
        });
        expect(app.run('hgNewEntries().map(e => e.item.id)')).toEqual(['q_player', 'q_auto', daily[1].id, daily[0].id]);
        const first = app.run('hgConsumeNext("any")');
        expect(first.id).toBe('q_player');
        expect(app.state.queue.map(it => it.id)).toEqual(['q_auto']);
        // Els del banc es serveixen com a còpia i queden marcats com a vistos.
        app.run('hgConsumeNext("any")');
        const daily1 = app.run('hgConsumeNext("any")');
        expect(daily1.id).toBe(daily[1].id);
        expect(daily1.source).toBe('reserve');
        expect(app.ctx.hieroglyphicStats.seenKeys).toHaveLength(3);
        expect(app.run('hgNewEntries().map(e => e.item.id)')).toEqual([daily[0].id]);
    });

    test('«Un altre jeroglífic» no torna a servir el que s\'acaba de jugar', () => {
        const app = setup({ queue: [{ id: 'a', fen: FENS[0], status: 'new', origin: 'game_real', createdAt: 2 }] });
        expect(app.run(`hgConsumeNext("any", { excludeFen: ${JSON.stringify(FENS[0])} })`)).toBeNull();
    });

    test('la cua té límit i en sobrar treu primer els auto-generats més antics', () => {
        const queue = [];
        for (let i = 0; i < 31; i++) queue.push({ id: 'q' + i, fen: FENS[0].replace('0 1', '0 ' + (i + 1)), status: 'new', createdAt: i, origin: i === 0 ? 'game_real' : 'engine_selfplay' });
        const app = setup({ queue });
        app.run('hgPruneQueue()');
        expect(app.state.queue).toHaveLength(30);
        expect(app.state.queue.some(it => it.id === 'q0')).toBe(true);   // el del jugador es conserva
        expect(app.state.queue.some(it => it.id === 'q1')).toBe(false);  // l'auto-generat més antic surt
    });
});

describe('historial: prioritat, guardar i eliminar', () => {
    test('sense nous: primer els pendents, després els resolts a mitges i finalment els resolts a la primera', () => {
        const history = [
            entry(FENS[0], { id: 'clean', solved: true, cleanSolved: true, saved: true, ts: 1 }),
            entry(FENS[1], { id: 'half', solved: true, wrongMoves: 2, ts: 5 }),
            entry(FENS[2], { id: 'pending', solved: false, ts: 9 }),
            entry(FENS[3], { id: 'deleted', solved: true, wrongMoves: 1, deleted: true, ts: 0 })
        ];
        const app = setup({ history });
        expect(app.run('hgPickFromHistory().id')).toBe('pending');
        expect(app.run(`hgPickFromHistory({ excludeFen: ${JSON.stringify(FENS[2])} }).id`)).toBe('half');
        app.store.history = app.store.history.filter(e => e.id !== 'pending' && e.id !== 'half');
        expect(app.run('hgPickFromHistory().id')).toBe('clean');
        app.store.history = app.store.history.filter(e => e.id === 'deleted');
        expect(app.run('hgPickFromHistory()')).toBeNull();   // els eliminats no tornen
    });

    test('resolt a la primera: s\'elimina directament tret que es guardi', () => {
        const app = setup();
        app.ctx.currentHieroglyphicPuzzle = { id: 'p1', fen: FENS[0], solutionMoves: ['a', 'b', 'c'], replyMoves: ['x', 'y'], origin: 'engine_selfplay', source: 'reserve' };
        app.ctx.currentHieroglyphicWrongMoves = 0;
        app.run('upsertHieroglyphicHistory({ solved: false, keepIfExists: true })');
        expect(app.run('hieroglyphicHistoryStatus(visibleHieroglyphicHistory()[0])')).toBe('pending');
        app.run('upsertHieroglyphicHistory({ solved: true })');
        expect(app.run('visibleHieroglyphicHistory().length')).toBe(0);
        expect(app.store.history[0]).toMatchObject({ deleted: true, saved: false, cleanSolved: true, source: 'reserve' });
        app.run(`saveHieroglyphicInHistory(${JSON.stringify(FENS[0])})`);
        expect(app.run('visibleHieroglyphicHistory().length')).toBe(1);
        expect(app.run('hieroglyphicHistoryStatus(visibleHieroglyphicHistory()[0])')).toBe('clean');
        // Si ja estava guardat i es torna a resoldre a la primera, es conserva.
        app.run('upsertHieroglyphicHistory({ solved: true })');
        expect(app.store.history[0]).toMatchObject({ deleted: false, saved: true });
    });

    test('resolt a mitges: queda a l\'historial i es pot eliminar (amb marca perquè no reaparegui)', () => {
        const app = setup();
        app.ctx.currentHieroglyphicPuzzle = { id: 'p2', fen: FENS[1], solutionMoves: ['a', 'b', 'c'], replyMoves: ['x', 'y'], origin: 'game_real' };
        app.ctx.currentHieroglyphicWrongMoves = 2;
        app.run('upsertHieroglyphicHistory({ solved: true })');
        expect(app.run('hieroglyphicHistoryStatus(visibleHieroglyphicHistory()[0])')).toBe('half');
        app.run(`deleteHieroglyphicFromHistory(${JSON.stringify(FENS[1])})`);
        expect(app.run('visibleHieroglyphicHistory().length')).toBe(0);
        expect(app.store.history[0].deleted).toBe(true);
        expect(app.ctx.hieroglyphicStats.seenKeys).toHaveLength(1);
    });

    test('la fusió amb el núvol respecta l\'eliminació més recent i la unió dels vistos', () => {
        const old = entry(FENS[1], { solved: true, wrongMoves: 2, ts: 100, deleted: false });
        const removed = Object.assign({}, old, { deleted: true, saved: false, ts: 200 });
        const merged = JSON.parse(Core.mergeSyncSnapshots(
            { eltauler_hieroglyphic_history: JSON.stringify([removed]), eltauler_hieroglyphic_stats: JSON.stringify({ seenKeys: ['aaaa0001'] }) },
            { eltauler_hieroglyphic_history: JSON.stringify([old]), eltauler_hieroglyphic_stats: JSON.stringify({ seenKeys: ['aaaa0002'] }) }
        ).eltauler_hieroglyphic_history);
        expect(merged).toHaveLength(1);
        expect(merged[0].deleted).toBe(true);
        const stats = JSON.parse(Core.mergeSyncSnapshots(
            { eltauler_hieroglyphic_stats: JSON.stringify({ seenKeys: ['aaaa0001'] }) },
            { eltauler_hieroglyphic_stats: JSON.stringify({ seenKeys: ['aaaa0002'] }) }
        ).eltauler_hieroglyphic_stats);
        expect(stats.seenKeys.sort()).toEqual(['aaaa0001', 'aaaa0002']);
    });
});

describe('origen visible i enllaços compartits', () => {
    test('marca d\'origen: partida del jugador, auto-generat (banc diari o aparell) i compartit', () => {
        const app = setup();
        expect(app.run('hieroglyphicOriginKind({ origin: "game_real" })')).toBe('player');
        expect(app.run('hieroglyphicOriginKind({ origin: "game_variant" })')).toBe('player');
        expect(app.run('hieroglyphicOriginKind({ origin: "engine_selfplay", source: "reserve" })')).toBe('auto');
        expect(app.run('hieroglyphicOriginKind({ origin: "shared", source: "shared" })')).toBe('shared');
        expect(app.run('hieroglyphicOriginMark({ origin: "engine_selfplay", source: "reserve" }).label')).toBe('Auto-generat');
        expect(app.run('hieroglyphicOriginMark({ origin: "game_real" }).label')).toBe('Partida del jugador');
        expect(app.run('hieroglyphicOriginMarkHtml({ origin: "engine_selfplay" })')).toContain('hg-origin-mark--auto');
        expect(app.run('hieroglyphicOriginMarkHtml({ origin: "game_real" })')).toContain('hg-origin-mark--player');
    });

    test('l\'enllaç per WhatsApp o missatgeria apunta a eltauler.cat i es pot tornar a obrir', () => {
        const item = reserve[0];
        const app = setup();
        app.ctx.item = item;
        const url = app.run('hieroglyphicShareUrl(item)');
        expect(url.startsWith('https://eltauler.cat/?mode=jeroglific&')).toBe(true);
        app.ctx.params = new URL(url).searchParams;
        const parsed = app.run('sharedHieroglyphicFromParams(params)');
        expect(parsed.fen).toBe(item.fen);
        expect(parsed.solutionMoves).toEqual(item.solutionMoves);
        expect(parsed.replyMoves).toEqual(item.replyMoves);
        expect(parsed.source).toBe('shared');
        expect(app.run('hieroglyphicShareText(item, { firstTry: true })')).toContain('a la primera');
        // Una línia il·legal o incompleta no s'obre.
        app.ctx.bad = new URLSearchParams('mode=jeroglific&fen=' + encodeURIComponent(item.fen) + '&linia=a1a2.a2a3');
        expect(app.run('sharedHieroglyphicFromParams(bad)')).toBeNull();
    });
});

describe('caràtula i finestra final', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    test('la caràtula no mostra quants jeroglífics nous hi ha', () => {
        expect(html).not.toContain('id="hg-banner-count"');
        const render = between('function renderHieroglyphicBanner(', '// ── Generació manual');
        expect(render).not.toMatch(/nous esperant/);
    });
    test('l\'historial és una pantalla completa amb els tres estats', () => {
        expect(html).toContain('id="hg-history-screen"');
        expect(html).toContain('data-hgh-filter-status="pending"');
        expect(html).toContain('data-hgh-filter-status="half"');
        expect(html).toContain('data-hgh-filter-status="clean"');
        expect(source).toContain("'hg-history-screen'");
    });
    test('la finestra final ofereix guardar, rejugar, eliminar, un altre i compartir', () => {
        const fn = between('function renderHieroglyphicResultActions(', '// ── Compartir jeroglífics');
        ['Guardar', 'Rejugar', 'Eliminar', 'Un altre jeroglífic', 'WhatsApp', 'Missatgeria'].forEach(t => expect(fn).toContain(t));
    });
    test('després de cada partida es programa una passada de creació', () => {
        expect(source).toMatch(/recordGameHistory\(msg[^\n]*\n[\s\S]{0,300}hgQueuePostGamePass\(/);
        expect(source).toContain('await hgPostGameTick(');
        expect(source).toContain('await hgSelfPlayPeriodicTick(');
    });
});
