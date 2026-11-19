#!/usr/bin/env node
// ============================================================================
// scripts/simula-humanitzacio.js — simulació per lots de la lliga de llegendes
// ============================================================================
// Juga partides de la lliga amb els MATEIXOS motors que l'app (Stockfish 19 lite
// i Lozza, carregats com a processos de Node) i la mateixa lògica de la TV
// (stockfishtv.js: pla de la partida, perfils d'estil, defalliment, fase d'atac,
// abandonament, taules per acord i final de partida) en tres configuracions:
//
//   · sense      → motors purs: cap perfil, cap defalliment, cap fase d'atac.
//   · anterior   → el comportament d'abans d'aquesta funcionalitat: perfil
//                  d'estil (MultiPV) a Stockfish, defalliment programat i fase d'atac.
//   · humanitzada→ humanitzacio.js (la configuració nova).
//
// Les tres comparteixen les mateixes parelles de jugadors (les 90 fixtures de
// la lliga: cada parella, una vegada amb cada color), les mateixes obertures
// i les mateixes llavors: la comparació és aparellada. Cada partida és
// reproduïble pel que fa a la humanització (llavor = fixture + índex); els
// motors, en canvi, depenen del temps de càlcul i poden variar entre execucions.
//
// Els pressupostos de càlcul són MOLT més petits que els de l'app (l'objectiu
// és comparar configuracions i no jugar la millor partida): vegeu les opcions.
//
// Ús:
//   node scripts/simula-humanitzacio.js [--games 1000] [--modes sense,anterior,humanitzada]
//        [--workers 4] [--swap-engines] [--analysis-depth 10] [--analysis-ms 300] [--player-ms 20] [--out scripts/simulacions/humanitzacio]
//   node scripts/simula-humanitzacio.js --aggregate-only   (torna a calcular el resum)
// ============================================================================
const fs = require('fs');
const path = require('path');
const { fork, spawn } = require('child_process');
const { Chess } = require('chess.js');

const ROOT = path.join(__dirname, '..');
const TV = require(path.join(ROOT, 'stockfishtv.js'));
const LG = require(path.join(ROOT, 'llegendes.js'));
const H = require(path.join(ROOT, 'humanitzacio.js'));

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const flag = name => args.includes(name);
const GAMES = Number(opt('--games', 1000));
const MODES = String(opt('--modes', 'sense,anterior,humanitzada')).split(',').filter(Boolean);
const WORKERS = Number(opt('--workers', 4));
// L'anàlisi s'atura en arribar a la profunditat fiable de la TV (MIN_RELIABLE_DEPTH = 10) o al límit de temps.
const ANALYSIS_MS = Number(opt('--analysis-ms', 300));
const ANALYSIS_DEPTH = Number(opt('--analysis-depth', 10));
const PLAYER_MS = Number(opt('--player-ms', 20));
const OUT = path.resolve(ROOT, opt('--out', 'scripts/simulacions/humanitzacio'));
const SEED = String(opt('--seed', 'humanitzacio-1'));
// Experiments de calibratge: HUMANITZACIO_CONFIG='{"TAU_MAX":80}' sobreescriu H.CONFIG (no s'usa a l'app).
if (process.env.HUMANITZACIO_CONFIG) Object.assign(H.CONFIG, JSON.parse(process.env.HUMANITZACIO_CONFIG));

// Obertures preparades (8 semijugades) com a la TV: la humanització no hi actua.
const OPENINGS = [
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6',
    'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5',
    'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6',
    'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O', 'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7', 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
    'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4', 'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7', 'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7',
    'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4', 'd4 d5 Nf3 Nf6 Bf4 e6 e3 c5', 'c4 c5 Nf3 Nf6 Nc3 d5 cxd5 Nxd5',
    'e4 g6 d4 Bg7 Nc3 d6 Be3 a6', 'd4 Nf6 Bg5 Ne4 Bf4 c5 e3 Qb6'
];
function openingUci(i) {
    const g = new Chess();
    const uci = [];
    OPENINGS[i % OPENINGS.length].split(' ').forEach((san) => {
        const mv = g.move(san);
        if (!mv) throw new Error('Obertura il·legal: ' + san);
        uci.push(mv.from + mv.to + (mv.promotion || ''));
    });
    return uci;
}

// ---------------------------------------------------------------------------
// Motor UCI (procés de Node)
// ---------------------------------------------------------------------------
class Engine {
    constructor(file, name) {
        this.name = name;
        this.lines = [];
        this.p = spawn(process.execPath, [file], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
        this.buffer = '';
        this.waiter = null;
        this.collect = null;
        this.p.stdout.on('data', (chunk) => {
            this.buffer += chunk.toString();
            let pos;
            while ((pos = this.buffer.indexOf('\n')) >= 0) {
                const line = this.buffer.slice(0, pos).trim();
                this.buffer = this.buffer.slice(pos + 1);
                this.onLine(line);
            }
        });
        this.p.on('exit', () => { if (this.waiter) this.waiter.reject(new Error(name + ' ha acabat')); });
    }
    onLine(line) {
        if (this.collect) this.collect.push(line);
        if (this.waiter && this.waiter.check(line)) { const w = this.waiter; this.waiter = null; clearTimeout(w.timer); w.resolve(line); }
    }
    send(s) { this.p.stdin.write(s + '\n'); }
    wait(check, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.waiter = null; reject(new Error(this.name + ' no respon')); }, ms || 20000);
            this.waiter = { check, resolve, reject, timer };
        });
    }
    async init() {
        this.collect = this.lines;
        let w = this.wait(l => l === 'uciok'); this.send('uci'); await w;
        this.collect = null;
        w = this.wait(l => l === 'readyok'); this.send('isready'); await w;
        this.send('setoption name Hash value 16');
    }
    async ready() { const w = this.wait(l => l === 'readyok'); this.send('isready'); await w; }
    async newGame() { this.send('ucinewgame'); await this.ready(); }
    // job = { position, strength:[], multipv, go }
    async search(job) {
        (job.strength || []).forEach(c => this.send(c));
        this.send('setoption name MultiPV value ' + (job.multipv || 1));
        await this.ready();
        const infos = {};
        const byDepth = {};
        const got = [];
        this.collect = got;
        this.send(job.position);
        const w = this.wait(l => /^bestmove\s/.test(l), 30000);
        this.send(job.go);
        const bm = await w;
        this.collect = null;
        got.forEach((l) => {
            const i = TV.parseInfoLine(l);
            if (i && !i.bound && i.pv.length) { infos[i.multipv] = i; (byDepth[i.depth] = byDepth[i.depth] || {})[i.multipv] = i; }
        });
        const m = /^bestmove\s+(\S+)/.exec(bm);
        return { bestUci: m && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m[1]) ? m[1] : null, infos, byDepth };
    }
    close() { try { this.p.stdin.write('quit\n'); this.p.kill(); } catch (e) { /* res */ } }
}

// ---------------------------------------------------------------------------
// Una partida
// ---------------------------------------------------------------------------
function rngFor(str) { return H.createRng(H.hashSeed(str)); }

// Classificació versemblant a mitja lliga (llavor per partida): jornada, punts dels 10
// jugadors i on queden els dos de la partida.
function fakeStakes(index, plan) {
    const r = rngFor(SEED + ':stakes:' + index);
    const played = Math.floor((index % 90) / 5);
    if (!played) return null;
    const ids = LG.IDS.slice();
    const table = ids.map((id) => {
        let pts = 0;
        for (let k = 0; k < played; k++) { const x = r(); pts += x < 0.4 ? 1 : x < 0.6 ? 0.5 : 0; }
        return { id: id, points: pts, played: played };
    }).sort((a, b) => b.points - a.points);
    table.forEach((row, k) => { row.rank = k + 1; });
    const side = id => Object.assign({}, table.find(x => x.id === id));
    return { played: played * 5, table: table, w: side(plan.ids.w), b: side(plan.ids.b) };
}

async function playGame(sf, lozza, caps, index, mode) {
    const season = Math.floor(index / 90) + 1;
    const fixtures = LG.newSeason(season, rngFor(SEED + ':season:' + season)).fixtures;
    const fixture = fixtures[index % 90];
    const prep = openingUci(index);
    const humanize = mode === 'humanitzada';
    const plan = TV.tvLegendPlan(LG, fixture, caps, true, rngFor(SEED + ':plan:' + index), { humanize: humanize });
    // --swap-engines: cada jugador juga amb l'altre motor (separa l'efecte del motor del del perfil).
    if (flag('--swap-engines')) ['w', 'b'].forEach((c) => { plan.engines[c] = plan.engines[c] === 'lozza' ? 'stockfish' : 'lozza'; plan.sides[c] = Object.assign({}, plan.sides[c], { engine: plan.engines[c] }); });
    if (mode === 'sense') { plan.slump = null; ['w', 'b'].forEach((c) => { plan.sides[c].style = null; }); }
    const human = humanize ? H.createGame({ seed: fixture.id + '|' + index, players: {
        w: { id: plan.ids.w, weights: LG.legend(plan.ids.w).weights }, b: { id: plan.ids.b, weights: LG.legend(plan.ids.b).weights } } }) : null;
    // Classificació simulada (la simulació no porta una lliga real): mateixa per a totes les
    // configuracions; només la humanitzada en fa ús (ambició i acord de taules).
    const stakes = fakeStakes(index, plan);
    if (human) H.applyStakes(human, stakes, 18);
    const levelValue = TV.tvLegendLevel(caps, plan).value;
    const chess = new Chess();
    const uci = [];
    const analyses = [];
    const record = { index, mode, fixture: fixture.id, white: plan.ids.w, black: plan.ids.b, engines: plan.engines, plies: 0, result: null,
        reason: null, winner: null, moves: [] };
    if (human) record.ambition = { w: human.sides.w.ambition, b: human.sides.b.ambition };
    let resign = { side: null, plies: 0 }, drawWatch = null, attack = {}, end = null;
    await sf.newGame(); await lozza.newGame();

    const analyze = async (fen, upto) => {
        const res = await sf.search({ position: TV.tvPositionCommand(upto), strength: TV.tvStrengthCommands(caps, 'analysis'),
            multipv: humanize ? H.CONFIG.MULTIPV : 2, go: 'go depth ' + ANALYSIS_DEPTH + ' movetime ' + ANALYSIS_MS });
        const a = TV.tvBuildAnalysis(fen, res.infos, res.bestUci);
        if (humanize) { a.lines = H.linesFromInfos(res.infos); a.perception = H.perceptionFromDepths(res.byDepth); }
        return a;
    };

    while (!end) {
        const ply = uci.length;
        const fen = chess.fen();
        if (!analyses[ply]) analyses[ply] = await analyze(fen, uci);
        const color = chess.turn();
        let move;
        let human_dec = null;
        if (ply < prep.length) move = prep[ply];
        else {
            const side = mode === 'anterior' ? TV.tvSlumpSide(caps, plan.sides[color], plan.slump, color, ply) : plan.sides[color];
            if (mode === 'anterior' && side.slumped && !attack.slumped) attack.slumped = true;
            const lozzaTurn = plan.engines[color] === 'lozza';
            const humanStyle = humanize ? { id: plan.ids[color], label: plan.names[color], weights: LG.legend(plan.ids[color]).weights } : null;
            const late = mode === 'sense' ? null : TV.tvLateAttack({ ChessCtor: Chess, fen, ply, startFen: undefined, history: uci,
                baseStyle: humanStyle || side.style, force: attack[color] || null });
            if (late && !attack[color]) attack[color] = late.reason;
            const style = lozzaTurn || humanize ? null : (late ? late.style : side.style);
            const useLines = humanize && analyses[ply].reliable && analyses[ply].lines && analyses[ply].lines.length > 1;
            const eng = lozzaTurn ? lozza : sf;
            const depth = side.depth + (late ? late.depthBonus : 0);
            const movetime = lozzaTurn ? Math.min(Math.round(side.movetime * (late ? late.movetimeFactor : 1)), PLAYER_MS * 4) : PLAYER_MS;
            let res = await eng.search({ position: TV.tvPositionCommand(uci), strength: lozzaTurn ? [] : TV.tvStrengthCommands(caps, 'player', side.level),
                multipv: style ? TV.TV_CONFIG.STYLE_MULTIPV : 1,
                go: lozzaTurn ? 'go depth ' + depth + ' movetime ' + movetime : 'go movetime ' + movetime });
            if (!res.bestUci) res = { bestUci: analyses[ply].bestUci, infos: {} };
            move = res.bestUci;
            if (useLines) {
                human_dec = H.decide(human, color, { ChessCtor: Chess, fen, ply, lines: analyses[ply].lines, engineUci: res.bestUci,
                    features: TV.tvMoveFeatures, context: late ? late.context : TV.tvMoveContext(Chess, undefined, uci),
                    weights: late ? late.style.weights : humanStyle.weights, windowCp: late ? late.windowCp : undefined, risk: late ? 1 : 0,
                    perception: analyses[ply].perception });
                move = human_dec.uci || move;
            } else if (style) {
                move = TV.tvPickStyledMove(Chess, fen, res.infos, res.bestUci, style, late ? late.windowCp : undefined, late ? late.context : undefined).uci;
            }
        }
        const mv = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.length > 4 ? move[4] : 'q' });
        if (!mv) { record.reason = 'il·legal'; break; }
        uci.push(move);
        const fenAfter = chess.fen();
        record.moves.push({ ply, color, uci: move, prepared: ply < prep.length, fenBefore: fen, human: human_dec && human_dec.record ? {
            q: human_dec.q, tau: human_dec.tau, cls: human_dec.cls, loss: human_dec.loss, tags: human_dec.tags, changed: human_dec.changed, depth: human_dec.depth || null, known: human_dec.record.lossKnown !== false } : null,
            flagsFeatures: null });
        end = TV.tvGameEnd(chess, TV.TV_CONFIG.MAX_PLIES);
        if (!end) {
            analyses[ply + 1] = await analyze(fenAfter, uci);
            const r = TV.tvResignStep(resign, analyses[ply + 1], ply + 1, TV.tvResignThresholdCp(caps, levelValue), TV.TV_CONFIG.LEAGUE_RESIGN_MIN_PLY);
            resign = r.state;
            if (r.end) end = r.end;
            if (!end) {
                const dr = TV.tvAgreedDrawStep(drawWatch, analyses[ply + 1], ply + 1, fenAfter,
                    human ? (c) => H.acceptsDraw(human, c, analyses[ply + 1]) : undefined);
                drawWatch = dr.state;
                if (dr.end) end = dr.end;
            }
        }
    }
    record.plies = uci.length;
    record.result = end ? end.result : null;
    record.winner = end ? end.winner : null;
    record.reason = end ? end.reason : record.reason;
    // Mesura de cada jugada amb l'anàlisi (mateixa vara per a les tres configuracions).
    record.moves.forEach((m) => {
        const before = analyses[m.ply], after = analyses[m.ply + 1];
        const loss = before && after && before.reliable && after.reliable ? TV.tvMoverLossCp(before.best, after.best, m.color) : null;
        m.loss = loss !== null ? Math.max(0, Math.round(loss)) : null;
        m.cls = m.loss === null ? null : H.classifyLoss(m.loss);
        const lines = before && before.lines ? before.lines : null;
        let facts = null;
        try { facts = H.positionFacts(Chess, m.fenBefore, lines || [{ type: 'cp', value: before && before.best ? before.best.value * (m.color === 'w' ? 1 : -1) : 0 }]); } catch (e) { facts = null; }
        m.complexity = facts ? Math.round(facts.complexity * 1000) / 1000 : null;
        m.phase = facts ? facts.phase : null;
        m.elementary = H.elementaryEnding(Chess, m.fenBefore);
        m.mover = before && before.best && before.best.type === 'cp' ? before.best.value * (m.color === 'w' ? 1 : -1) : null;
        if (!m.prepared) {
            const f = TV.tvMoveFeatures(Chess, m.fenBefore, m.uci, m.mover, null);
            m.tags = f ? H.tagList(H.moveFlags(f, H.pawnDelta(Chess, m.fenBefore, m.uci))) : [];
        }
        delete m.fenBefore; delete m.flagsFeatures;
    });
    // Eval mínima de cada bàndol (remuntades): des de qui mou, a partir de la jugada 12.
    const worst = { w: null, b: null };
    analyses.forEach((a, i) => {
        if (!a || !a.best || a.best.type !== 'cp' || i < 24) return;
        ['w', 'b'].forEach((c) => { const v = a.best.value * (c === 'w' ? 1 : -1); if (worst[c] === null || v < worst[c]) worst[c] = v; });
    });
    record.worst = worst;
    if (human) record.humanSummary = H.summarizeLog(human.log);
    return record;
}

async function worker(k, of) {
    const sf = new Engine(path.join(ROOT, 'stockfish-19-lite-single.js'), 'Stockfish 19');
    const lozza = new Engine(path.join(ROOT, 'lozza.js'), 'Lozza');
    await Promise.all([sf.init(), lozza.init()]);
    const caps = TV.tvEngineCapabilities(TV.parseUciOptions(sf.lines));
    fs.mkdirSync(OUT, { recursive: true });
    const files = {};
    MODES.forEach((m) => { files[m] = fs.createWriteStream(path.join(OUT, 'partides-' + m + '-' + k + '.jsonl'), { flags: 'w' }); });
    for (let i = k; i < GAMES; i += of) {
        for (const mode of MODES) {
            try {
                const rec = await playGame(sf, lozza, caps, i, mode);
                files[mode].write(JSON.stringify(rec) + '\n');
            } catch (e) {
                process.stderr.write('Partida ' + i + ' (' + mode + '): ' + e.message + '\n');
            }
        }
        if (process.send) process.send({ done: i });
    }
    Object.values(files).forEach(f => f.end());
    sf.close(); lozza.close();
}

// ---------------------------------------------------------------------------
// Agregació
// ---------------------------------------------------------------------------
function readGames(mode) {
    const out = [];
    if (!fs.existsSync(OUT)) return out;
    fs.readdirSync(OUT).filter(f => f.startsWith('partides-' + mode + '-') && f.endsWith('.jsonl')).forEach((f) => {
        fs.readFileSync(path.join(OUT, f), 'utf8').split('\n').filter(Boolean).forEach(l => out.push(JSON.parse(l)));
    });
    return out.sort((a, b) => a.index - b.index);
}
const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r2 = v => Math.round(v * 100) / 100;

function aggregate(mode, games) {
    const n = games.length;
    const sum = { mode, games: n };
    sum.whiteWins = pct(games.filter(g => g.winner === 'w').length, n);
    sum.blackWins = pct(games.filter(g => g.winner === 'b').length, n);
    sum.draws = pct(games.filter(g => g.winner === null).length, n);
    sum.avgFullMoves = r2(avg(games.map(g => g.plies / 2)));
    const reasons = {};
    games.forEach((g) => { reasons[g.reason] = (reasons[g.reason] || 0) + 1; });
    sum.reasons = Object.keys(reasons).sort().reduce((o, k) => { o[k] = pct(reasons[k], n); return o; }, {});
    const moves = [].concat.apply([], games.map(g => g.moves.filter(m => !m.prepared && m.cls)));
    sum.measuredMoves = moves.length;
    const cls = { bona: 0, imprecisio: 0, error: 0, errorGreu: 0 };
    moves.forEach((m) => { cls[m.cls]++; });
    sum.per100 = Object.keys(cls).reduce((o, k) => { o[k] = r2(100 * cls[k] / Math.max(1, moves.length)); return o; }, {});
    // Errors greus en posicions senzilles (complexitat baixa o final elemental).
    const simple = moves.filter(m => m.elementary || (isFinite(m.complexity) && m.complexity < 0.25));
    sum.simplePositions = simple.length;
    sum.bigInSimplePer1000 = r2(1000 * simple.filter(m => m.cls === 'errorGreu').length / Math.max(1, simple.length));
    sum.mistakeInSimplePer1000 = r2(1000 * simple.filter(m => m.cls === 'error' || m.cls === 'errorGreu').length / Math.max(1, simple.length));
    const elementary = moves.filter(m => m.elementary);
    sum.elementaryMoves = elementary.length;
    sum.elementaryMistakes = elementary.filter(m => m.cls === 'error' || m.cls === 'errorGreu').length;
    // Per jugador i arquetip.
    const byId = {};
    games.forEach((g) => {
        ['w', 'b'].forEach((c) => {
            const id = g[c === 'w' ? 'white' : 'black'];
            const e = byId[id] = byId[id] || { games: 0, points: 0, moves: 0, imp: 0, err: 0, big: 0 };
            e.games++;
            e.points += g.winner === c ? 1 : g.winner === null ? 0.5 : 0;
        });
        g.moves.filter(m => !m.prepared && m.cls).forEach((m) => {
            const e = byId[m.color === 'w' ? g.white : g.black];
            e.moves++;
            if (m.cls === 'imprecisio') e.imp++;
            if (m.cls === 'error') e.err++;
            if (m.cls === 'errorGreu') e.big++;
        });
    });
    sum.players = Object.keys(byId).sort().reduce((o, id) => {
        const e = byId[id];
        o[id] = { archetype: H.profileFor(id).archetype, games: e.games, score: r2(100 * e.points / e.games), impPer100: r2(100 * e.imp / Math.max(1, e.moves)),
            errPer100: r2(100 * e.err / Math.max(1, e.moves)), bigPer100: r2(100 * e.big / Math.max(1, e.moves)) };
        return o;
    }, {});
    // Coherència error ↔ perfil: entre les jugades NO òptimes (imprecisió o pitjor),
    // quina part porta cada etiqueta, per arquetip, i el «lift» sobre la mitjana de tots.
    const inferior = moves.filter(m => m.cls !== 'bona' && m.tags);
    const flagRate = (list, k) => list.length ? list.filter(m => m.tags.includes(k)).length / list.length : 0;
    const tags = H.tagList({ iniciativa: 1, riscRei: 1, materialSac: 1, simplifica: 1, passiva: 1, complicacio: 1, estructura: 1 });
    const arch = {};
    games.forEach((g) => g.moves.forEach((m) => { if (!m.prepared && m.cls && m.cls !== 'bona' && m.tags) { m.arch = H.profileFor(m.color === 'w' ? g.white : g.black).archetype; } }));
    H.ARCHETYPES.forEach((a) => {
        const list = inferior.filter(m => m.arch === a);
        arch[a] = { inferiorMoves: list.length };
        tags.forEach((t) => { arch[a][t] = r2(100 * flagRate(list, t)); });
    });
    arch.tots = { inferiorMoves: inferior.length };
    tags.forEach((t) => { arch.tots[t] = r2(100 * flagRate(inferior, t)); });
    sum.errorTypes = arch;
    // Remuntades: partides guanyades per qui havia estat a −150 cp o pitjor (després de la jugada 12).
    const decided = games.filter(g => g.winner);
    sum.comebacks = pct(decided.filter(g => g.worst && isFinite(g.worst[g.winner]) && g.worst[g.winner] <= -150).length, decided.length);
    // Humanització: resum del registre intern.
    const hs = games.map(g => g.humanSummary).filter(Boolean);
    if (hs.length) {
        const tot = hs.reduce((a, b) => ({ moves: a.moves + b.moves, changed: a.changed + b.changed, bypass: a.bypass + b.bypass }), { moves: 0, changed: 0, bypass: 0 });
        sum.human = { decisions: tot.moves, changedPct: pct(tot.changed, tot.moves), bypassPct: pct(tot.bypass, tot.moves), qMean: r2(avg(hs.map(h => h.qMean).filter(isFinite))) };
    }
    return sum;
}

// Equilibri entre oponents amb perfils equivalents (mateix arquetip): puntuació del
// primer jugador (ordre alfabètic) quan juga contra el seu equivalent.
function equivalentBalance(games) {
    const out = {};
    games.forEach((g) => {
        const a = H.profileFor(g.white).archetype, b = H.profileFor(g.black).archetype;
        if (a !== b) return;
        const [x, y] = [g.white, g.black].sort();
        const key = x + '–' + y;
        const e = out[key] = out[key] || { games: 0, firstPoints: 0, whitePoints: 0 };
        e.games++;
        const firstColor = g.white === x ? 'w' : 'b';
        const pts = (c) => g.winner === c ? 1 : g.winner === null ? 0.5 : 0;
        e.firstPoints += pts(firstColor);
        e.whitePoints += pts('w');
    });
    return Object.keys(out).sort().map(k => ({ pair: k, games: out[k].games, firstScore: r2(100 * out[k].firstPoints / out[k].games), whiteScore: r2(100 * out[k].whitePoints / out[k].games) }));
}

function engineBalance(games) {
    const e = { stockfish: { games: 0, points: 0 }, lozza: { games: 0, points: 0 } };
    games.forEach((g) => ['w', 'b'].forEach((c) => {
        const eng = g.engines[c];
        e[eng].games++;
        e[eng].points += g.winner === c ? 1 : g.winner === null ? 0.5 : 0;
    }));
    return { stockfish: r2(100 * e.stockfish.points / Math.max(1, e.stockfish.games)), lozza: r2(100 * e.lozza.points / Math.max(1, e.lozza.games)) };
}

const LABEL = { sense: 'Sense humanització', anterior: 'Comportament anterior', humanitzada: 'Humanitzada' };
function toMarkdown(result) {
    const ms = Object.keys(result.modes);
    const col = k => LABEL[k] || k;
    const row = (name, f) => '| ' + name + ' | ' + ms.map(m => f(result.modes[m])).join(' | ') + ' |';
    const head = '| | ' + ms.map(col).join(' | ') + ' |\n|---|' + ms.map(() => '---:').join('|') + '|';
    const L = [];
    L.push('### Resultats i durada', '', head);
    L.push(row('Partides', s => s.games), row('Victòries blanques (%)', s => s.whiteWins), row('Victòries negres (%)', s => s.blackWins),
        row('Taules (%)', s => s.draws), row('Durada mitjana (jugades)', s => s.avgFullMoves), row('Remuntades (% de partides decidides)', s => s.comebacks));
    const reasons = Array.from(new Set([].concat.apply([], ms.map(m => Object.keys(result.modes[m].reasons)))));
    reasons.forEach(r => L.push(row('Final: ' + r + ' (%)', s => s.reasons[r] || 0)));
    L.push('', '### Qualitat de les jugades (mesurada amb la mateixa anàlisi per a totes)', '', head);
    L.push(row('Jugades mesurades', s => s.measuredMoves));
    ['bona', 'imprecisio', 'error', 'errorGreu'].forEach(k => L.push(row({ bona: 'Bones (< 30 cp) per 100', imprecisio: 'Imprecisions (30–89 cp) per 100', error: 'Errors (90–199 cp) per 100', errorGreu: 'Errors greus (≥ 200 cp) per 100' }[k], s => s.per100[k])));
    L.push(row('Posicions senzilles (n)', s => s.simplePositions), row('Errors greus en posició senzilla (per 1000)', s => s.bigInSimplePer1000),
        row('Errors o pitjor en posició senzilla (per 1000)', s => s.mistakeInSimplePer1000), row('Jugades en final elemental (n)', s => s.elementaryMoves),
        row('Errors en final elemental (n)', s => s.elementaryMistakes));
    L.push(row('Decisions humanitzades / % que canvien la jugada del motor', s => s.human ? s.human.decisions + ' / ' + s.human.changedPct + ' %' : '—'));
    L.push('', '### Diferències entre jugadors (per 100 jugades) i puntuació', '');
    const ids = Object.keys(result.modes[ms[0]].players);
    L.push('| Jugador | Arquetip | ' + ms.map(m => col(m) + ': imprec. / errors / greus / punts %').join(' | ') + ' |', '|---|---|' + ms.map(() => '---:').join('|') + '|');
    ids.forEach((id) => {
        L.push('| ' + id + ' | ' + result.modes[ms[0]].players[id].archetype + ' | ' + ms.map((m) => {
            const p = result.modes[m].players[id];
            return p ? [p.impPer100, p.errPer100, p.bigPer100, p.score].join(' / ') : '—';
        }).join(' | ') + ' |');
    });
    L.push('', '### Coherència entre el tipus d\'error i el perfil', '',
        'Entre les jugades NO òptimes (imprecisió o pitjor), percentatge que porten cada etiqueta (una jugada pot portar-ne diverses).', '');
    ms.forEach((m) => {
        const t = result.modes[m].errorTypes;
        const tags = Object.keys(t.tots).filter(k => k !== 'inferiorMoves');
        L.push('**' + col(m) + '**', '', '| Arquetip | n | ' + tags.join(' | ') + ' |', '|---|---:|' + tags.map(() => '---:').join('|') + '|');
        Object.keys(t).forEach(a => L.push('| ' + a + ' | ' + t[a].inferiorMoves + ' | ' + tags.map(k => t[a][k]).join(' | ') + ' |'));
        L.push('');
    });
    L.push('### Equilibri entre oponents amb perfils equivalents', '', 'Puntuació (%) del primer jugador de la parella (ordre alfabètic) i de les blanques, jugant les dues vegades amb cada color.', '');
    ms.forEach((m) => {
        L.push('**' + col(m) + '**', '', '| Parella | Partides | Puntuació del primer | Puntuació de les blanques |', '|---|---:|---:|---:|');
        result.modes[m].equivalentBalance.forEach(e => L.push('| ' + e.pair + ' | ' + e.games + ' | ' + e.firstScore + ' | ' + e.whiteScore + ' |'));
        L.push('');
    });
    L.push('### Equilibri entre motors (puntuació %)', '', '| | Stockfish | Lozza |', '|---|---:|---:|');
    ms.forEach(m => L.push('| ' + col(m) + ' | ' + result.modes[m].engineBalance.stockfish + ' | ' + result.modes[m].engineBalance.lozza + ' |'));
    return L.join('\n') + '\n';
}

function report() {
    const result = { generated: new Date().toISOString(), version: H.VERSION, settings: { games: GAMES, modes: MODES, analysisMs: ANALYSIS_MS, analysisDepth: ANALYSIS_DEPTH,
        playerMs: PLAYER_MS, seed: SEED }, modes: {} };
    MODES.forEach((m) => {
        const games = readGames(m);
        if (!games.length) return;
        const s = aggregate(m, games);
        s.equivalentBalance = equivalentBalance(games);
        s.engineBalance = engineBalance(games);
        result.modes[m] = s;
    });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'resum.json'), JSON.stringify(result, null, 2) + '\n');
    fs.writeFileSync(path.join(OUT, 'resum.md'), toMarkdown(result));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
if (flag('--aggregate-only')) report();
else if (flag('--worker')) {
    worker(Number(opt('--k', 0)), Number(opt('--of', 1))).then(() => process.exit(0)).catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
} else {
    fs.mkdirSync(OUT, { recursive: true });
    let finished = 0, done = 0;
    const started = Date.now();
    for (let k = 0; k < WORKERS; k++) {
        const child = fork(__filename, process.argv.slice(2).concat(['--worker', '--k', String(k), '--of', String(WORKERS)]));
        child.on('message', () => {
            done++;
            if (done % 10 === 0) process.stderr.write('Partides acabades (cada una en ' + MODES.length + ' configuracions): ' + done + '/' + GAMES + ' · ' + Math.round((Date.now() - started) / 1000) + ' s\n');
        });
        child.on('exit', () => { if (++finished === WORKERS) report(); });
    }
}
