/* Entrenament de decisions curtes. Estat i rellotge independents de les partides.
 * Les solucions es comproven amb chess.js; no depenen de xarxa ni d'un worker.
 * Cada intent admet UNA jugada: els errors no es poden convertir en encerts
 * repetint, i el temps de revisió/record no es barreja amb el de reacció. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ElTaulerBulletPractice = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const KEY = 'chess_bulletPractice_v1';
    const MODES = {
        scan: { label: 'Lectura ràpida', count: 8, help: 'Mira el torn, comprova el rei i resol una sola jugada abans del límit.' },
        radar: { label: 'Rellotge al radar', count: 8, help: 'Alterna una ullada al tauler i al rellotge. Després de moure, recorda quant temps et quedava.' },
        sprint: { label: 'Sprint combinat', count: 10, help: 'Reparteix 30 o 60 segons entre deu decisions. Hi haurà comprovacions sorpresa del rellotge.' }
    };
    const GOALS = {
        mate: { title: 'Fes mat en una', explanation: 'Busca un escac que no deixi cap resposta legal. S’accepten tots els mats en una.' },
        capture: { title: 'Guanya material en una captura', explanation: 'Captura material amb guany positiu, fins i tot si el rival recaptura immediatament la peça moguda. No s’accepta permetre mat en una. És un exercici de lectura immediata, no una anàlisi de tota la variant.' },
        escape: { title: 'Surt de l’escac sense regalar la peça moguda', explanation: 'Mou el rei, captura o tapa l’escac. La peça moguda no ha de quedar capturable immediatament i el rival no ha de tenir mat en una.' }
    };
    const SEEDS = [
        ['mate', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'],
        ['mate', '7k/3Q4/6K1/8/8/8/8/8 w - - 0 1'],
        ['mate', '7k/4Q3/6K1/8/8/8/8/8 w - - 0 1'],
        ['mate', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4'],
        ['mate', 'rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq g3 0 2'],
        ['mate', '6rk/6pp/8/6N1/8/8/5PPP/6K1 w - - 0 1'],
        ['mate', '7k/5K2/6P1/8/8/8/8/R7 w - - 0 1'],
        ['mate', '7k/5P2/6K1/8/8/8/8/8 w - - 0 1'],
        ['capture', '4k3/8/2q5/8/3N4/8/PPP2PPP/R3K2R w KQ - 0 1'],
        ['capture', 'r3k2r/ppp2ppp/8/3q4/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1'],
        ['capture', 'r3k2r/ppp2ppp/8/6q1/8/8/PPPB1PPP/R3K2R w KQkq - 0 1'],
        ['capture', '4k3/pp3ppp/8/3r4/4P3/8/PP3PPP/4K3 w - - 0 1'],
        ['capture', '4k3/8/8/3pP3/8/8/PPP2PPP/R3K2R w KQ d6 0 2'],
        ['capture', '4k2r/6P1/8/8/8/8/PPP2PPP/R3K2R w KQ - 0 1'],
        ['capture', 'r3k2r/ppp2ppp/n7/4p3/4P3/5N2/PPP2PPP/R3K2R w KQkq - 0 1'],
        ['capture', 'r3k2r/ppp2ppq/3b4/8/8/3B4/PPP2PPP/R3K2R w KQkq - 0 1'],
        ['escape', '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1'],
        ['escape', '4k3/8/8/8/8/8/8/1q2R1K1 b - - 0 1'],
        ['escape', '4k3/8/8/2b5/8/8/8/4R2K b - - 0 1'],
        ['escape', 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5P2/PPPP2PP/RNBQKBNR w KQkq - 0 3'],
        ['escape', 'r1bqkbnr/pppp1Bpp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 3'],
        ['escape', 'r3k2r/ppp2ppp/8/1B6/8/8/PPP2PPP/R3K2R b KQkq - 0 1']
    ];
    const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const uci = m => m.from + m.to + (m.promotion || '');
    function mirrorFen(fen) {
        const p = fen.split(' '), flip = s => s.replace(/[a-zA-Z]/g, c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());
        p[0] = flip(p[0].split('/').reverse().join('/')); p[1] = p[1] === 'w' ? 'b' : 'w';
        const rights = flip(p[2]); p[2] = 'KQkq'.split('').filter(c => rights.includes(c)).join('') || '-';
        if (p[3] !== '-') p[3] = p[3][0] + (9 - Number(p[3][1]));
        return p.join(' ');
    }
    function solutions(Chess, task) {
        const c = new Chess(task.fen);
        if (task.kind === 'escape' && !c.in_check()) return [];
        return c.moves({ verbose: true }).filter(m => {
            c.move(m);
            let ok = c.in_checkmate();
            if (task.kind !== 'mate') {
                const replies = c.moves({ verbose: true });
                const recaptured = replies.some(r => r.to === m.to && r.captured);
                ok = task.kind === 'capture' ? !!m.captured && VALUE[m.captured] + (m.promotion ? VALUE[m.promotion] - 1 : 0) - (recaptured ? VALUE[m.promotion || m.piece] : 0) > 0 : !recaptured;
                if (ok) ok = !replies.some(r => { c.move(r); const mate = c.in_checkmate(); c.undo(); return mate; });
            }
            c.undo(); return ok;
        }).map(uci);
    }
    function buildBank(Chess) {
        const bank = [];
        SEEDS.forEach(([kind, fen], i) => [fen, mirrorFen(fen)].forEach((f, side) => {
            const task = { id: i + '-' + side, family: i, kind, fen: f };
            task.answers = solutions(Chess, task);
            if (!task.answers.length) throw new Error('Exercici sense solució: ' + task.id);
            bank.push(task);
        }));
        return bank;
    }
    function shuffled(items, random = Math.random) {
        const out = items.slice();
        for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
        return out;
    }
    function makeDeck(bank, mode, recent = [], random = Math.random) {
        const used = new Set(), deck = [], count = MODES[mode].count;
        const pool = shuffled(bank, random).sort((a, b) => Number(recent.includes(a.id)) - Number(recent.includes(b.id)));
        // Alterna objectius i evita les dues versions del mateix patró en una sèrie.
        for (let i = 0; i < count; i++) {
            const kind = ['mate', 'capture', 'escape'][i % 3];
            const task = pool.find(t => t.kind === kind && !used.has(t.family)) || pool.find(t => !used.has(t.family));
            used.add(task.family); deck.push(Object.assign({}, task, { clockFraction: .12 + random() * .8, probe: mode === 'radar' }));
        }
        if (mode === 'sprint') shuffled(deck.slice(1), random).slice(0, 3).forEach(t => { t.probe = true; });
        return deck;
    }
    function targetMs(seconds, level) { return Math.round((seconds === 30 ? 4500 : 8000) / (1 + .18 * (level - 1))); }
    function clockChoices(ms, seconds, random = Math.random) {
        const actual = Math.ceil(ms / 1000), gap = seconds === 30 ? 4 : 7;
        const values = new Set([actual, clamp(actual - gap, 0, seconds), clamp(actual + gap, 0, seconds)]);
        for (let n = 1; values.size < 3 && n <= seconds; n++) { values.add(clamp(actual - n, 0, seconds)); if (values.size < 3) values.add(clamp(actual + n, 0, seconds)); }
        return shuffled([...values], random);
    }
    function createSession(opts) {
        const mode = MODES[opts.mode] ? opts.mode : 'scan', seconds = opts.seconds === 30 ? 30 : 60;
        const level = clamp(Math.round(opts.level || 1), 1, 5), now = opts.now || (() => performance.now());
        const deck = opts.deck.slice(0, MODES[mode].count), rows = [];
        let status = 'idle', index = -1, started = 0, remaining = seconds * 1000, initialClock = 0, limit = 0;
        function state() {
            const elapsed = status === 'running' ? Math.max(0, now() - started) : 0;
            return { mode, seconds, level, status, index, count: deck.length, task: deck[index], rows: rows.map(r => ({ ...r })),
                clockMs: Math.max(0, initialClock - elapsed), leftMs: Math.max(0, limit - elapsed), limitMs: limit, remainingMs: remaining };
        }
        function prepare() {
            if (!['idle', 'feedback'].includes(status)) return false;
            if (index + 1 >= deck.length || (mode === 'sprint' && remaining <= 0)) { status = 'done'; return false; }
            index++;
            limit = targetMs(seconds, level);
            if (mode === 'sprint') { initialClock = remaining; limit = Math.min(limit, remaining); }
            else if (mode === 'radar') { initialClock = Math.round(seconds * 1000 * deck[index].clockFraction); limit = Math.min(limit, initialClock); }
            else initialClock = limit;
            status = 'ready'; return true;
        }
        function begin() { if (status !== 'ready') return false; started = now(); status = 'running'; return true; }
        function finish(move, timeout) {
            const elapsed = Math.min(limit, Math.max(0, now() - started));
            initialClock = Math.max(0, initialClock - elapsed);
            if (mode === 'sprint') remaining = initialClock;
            const row = { taskId: deck[index].id, kind: deck[index].kind, uci: move || null, correct: !timeout && deck[index].answers.includes(move),
                timeout, reactionMs: elapsed, targetMs: limit, clockMs: initialClock };
            rows.push(row); status = !timeout && deck[index].probe ? 'recall' : 'feedback'; return row;
        }
        function tick() { if (status === 'running' && now() - started >= limit) return finish(null, true); return null; }
        function submit(move) {
            if (status !== 'running') return null;
            if (tick()) return rows[rows.length - 1];
            return finish(move, false);
        }
        function recall(secondsGuess) {
            if (status !== 'recall' || !Number.isFinite(secondsGuess) || secondsGuess < 0 || secondsGuess > seconds) return false;
            const r = rows[rows.length - 1]; r.clockErrorMs = Math.abs(secondsGuess * 1000 - r.clockMs);
            r.clockCorrect = secondsGuess === Math.ceil(r.clockMs / 1000); status = 'feedback'; return true;
        }
        function abort() { if (status === 'running') tick(); if (status !== 'done') status = 'aborted'; }
        return { state, prepare, begin, submit, recall, tick, abort };
    }
    function median(values) { if (!values.length) return null; const a = values.slice().sort((a, b) => a - b), mid = Math.floor(a.length / 2); return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2; }
    function summary(rows) {
        const good = rows.filter(r => r.correct), probes = rows.filter(r => typeof r.clockCorrect === 'boolean');
        return { attempts: rows.length, correct: good.length, accuracy: rows.length ? good.length / rows.length : 0,
            medianMs: median(good.map(r => r.reactionMs)), timeouts: rows.filter(r => r.timeout).length,
            probes: probes.length, clockAccuracy: probes.length ? probes.filter(r => r.clockCorrect).length / probes.length : null,
            clockErrorMs: probes.length ? probes.reduce((s, r) => s + r.clockErrorMs, 0) / probes.length : null };
    }
    function normalizeProgress(raw) {
        const sessions = (Array.isArray(raw && raw.sessions) ? raw.sessions : []).filter(s => s && typeof s.id === 'string' && Number.isFinite(s.at) && MODES[s.mode] && [30, 60].includes(s.seconds) && Number.isInteger(s.level) && s.level >= 1 && s.level <= 5 && Array.isArray(s.rows))
            .map(s => ({ id: s.id.slice(0, 100), at: s.at, mode: s.mode, seconds: s.seconds, level: s.level, complete: s.complete === true,
                rows: s.rows.filter(r => r && typeof r.taskId === 'string' && GOALS[r.kind] && typeof r.correct === 'boolean' && typeof r.timeout === 'boolean' && Number.isFinite(r.reactionMs) && r.reactionMs >= 0 && r.reactionMs <= 60000 && Number.isFinite(r.targetMs) && r.targetMs > 0 && r.targetMs <= 60000 && Number.isFinite(r.clockMs) && r.clockMs >= 0 && r.clockMs <= 60000).slice(0, 10).map(r => ({
                    taskId: r.taskId, kind: r.kind, correct: r.correct, timeout: r.timeout, reactionMs: r.reactionMs, targetMs: r.targetMs, clockMs: r.clockMs,
                    uci: typeof r.uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(r.uci) ? r.uci : null,
                    ...(typeof r.clockCorrect === 'boolean' && Number.isFinite(r.clockErrorMs) && r.clockErrorMs >= 0 && r.clockErrorMs <= 60000 ? { clockCorrect: r.clockCorrect, clockErrorMs: r.clockErrorMs } : {})
                })) })).filter(s => s.rows.length);
        const unique = new Map(); sessions.forEach(s => unique.set(s.id, s));
        return { version: 1, sessions: [...unique.values()].sort((a, b) => a.at - b.at).slice(-120) };
    }
    function suggestedLevel(progress, mode, seconds) {
        const all = progress.sessions.filter(s => s.complete && s.mode === mode && s.seconds === seconds);
        if (!all.length) return 1;
        const level = all[all.length - 1].level, recent = all.slice(-3);
        if (recent.length < 3 || recent.some(s => s.level !== level)) return level;
        const strong = recent.every(s => { const a = summary(s.rows); return a.attempts === MODES[mode].count && a.accuracy >= .85 && a.timeouts === 0 && (mode === 'scan' || (a.probes >= 2 && a.clockAccuracy >= .75)); });
        const struggling = recent.every(s => summary(s.rows).accuracy < .6);
        return clamp(level + (strong ? 1 : struggling ? -1 : 0), 1, 5);
    }
    const api = { KEY, MODES, GOALS, SEEDS, mirrorFen, solutions, buildBank, makeDeck, targetMs, clockChoices, createSession, summary, median, normalizeProgress, suggestedLevel };

    // UI integrada, sense alterar el ROC, les ratxes ni el rellotge d'una partida.
    let bridge = {}, bank = null, session = null, board = null, chess = null, selected = null;
    let timer = null, frame = null, openingToken = 0, savedId = null, sessionAt = 0, sessionId = '', initialized = false;
    let cancelPieceWaits = [];
    let reviewMove = null, dragAt = -Infinity, dragSquare = null;
    const el = id => document.getElementById('bp-' + id);
    const screen = () => document.getElementById('bullet-screen');
    const fmt = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
    const pct = n => n == null ? '—' : Math.round(n * 100) + '%';
    const clockLabel = ms => { const total = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0'); };
    function load() { try { return normalizeProgress(JSON.parse(localStorage.getItem(KEY))); } catch (_) { return normalizeProgress(null); } }
    function save() {
        if (!session || savedId === sessionId) return;
        const s = session.state(); if (!s.rows.length) return;
        const p = load(); p.sessions.push({ id: sessionId, at: sessionAt, mode: s.mode, seconds: s.seconds, level: s.level, complete: s.status === 'done', rows: s.rows });
        try { localStorage.setItem(KEY, JSON.stringify(normalizeProgress(p))); savedId = sessionId; el('storage').textContent = ''; }
        catch (_) { el('storage').textContent = 'El dispositiu no ha pogut desar aquesta sèrie. Mantén aquesta pantalla oberta per consultar-ne el resultat.'; }
        try { if (window.CloudSync) window.CloudSync.onLocalSave(); } catch (_) {}
    }
    function controls() { return { mode: el('mode').value, seconds: Number(el('seconds').value) }; }
    function setView(next) {
        el('progress').hidden = next === 'practice'; ['setup', 'practice', 'results'].forEach(v => { el(v).hidden = v !== next; });
    }
    function updateSetup() {
        const { mode, seconds } = controls(), p = load(), level = suggestedLevel(p, mode, seconds);
        el('mode-help').textContent = MODES[mode].help;
        el('level').textContent = 'Nivell ' + level + ' de 5 · fins a ' + fmt(targetMs(seconds, level)) + ' per decisió';
        renderProgress(p, mode, seconds, level);
    }
    function renderProgress(p, mode, seconds, level) {
        const all = p.sessions.filter(s => s.mode === mode && s.seconds === seconds), same = all.filter(s => s.complete && s.level === level);
        el('progress-note').textContent = all.length ? all.filter(s => s.complete).length + ' sèries acabades en aquesta modalitat i ritme. Es conserven les 120 sèries més recents.' : 'Encara no hi ha sèries d’aquesta modalitat i ritme. Comença amb lectura ràpida; després afegeix el rellotge i acaba amb un sprint.';
        const tbody = el('history'); tbody.replaceChildren();
        all.slice(-10).reverse().forEach(s => {
            const a = summary(s.rows), tr = document.createElement('tr');
            [new Date(s.at).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' }) + (s.complete ? '' : ' · parcial'), 'N' + s.level, pct(a.accuracy), a.medianMs == null ? '—' : fmt(a.medianMs), pct(a.clockAccuracy)].forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.append(td); }); tbody.append(tr);
        });
        el('history-wrap').hidden = !all.length;
        const recent = same.slice(-3), before = same.slice(-6, -3);
        const a = summary(recent.flatMap(s => s.rows)), b = summary(before.flatMap(s => s.rows));
        let trend = 'La mediana mesura només les decisions correctes. Compara sempre el mateix ritme, modalitat i nivell.';
        if (recent.length === 3 && before.length === 3 && a.medianMs != null && b.medianMs != null) {
            const delta = a.medianMs - b.medianMs;
            trend = 'Últimes 3 sèries respecte de les 3 anteriors del nivell ' + level + ': ' + fmt(Math.abs(delta)) + (delta < 0 ? ' més ràpid' : ' més lent') + ', encerts ' + pct(b.accuracy) + ' → ' + pct(a.accuracy) + ', rellotge ' + pct(b.clockAccuracy) + ' → ' + pct(a.clockAccuracy) + '.';
        }
        el('trend').textContent = trend;
        // Barres amb xifres visibles: no requereixen Chart.js ni amaguen els errors.
        const bars = el('chart'); bars.replaceChildren();
        same.slice(-10).forEach((s, i) => {
            const a = summary(s.rows), item = document.createElement('div'), bar = document.createElement('span'), label = document.createElement('small');
            item.className = 'bp-chart-item'; bar.className = 'bp-chart-bar'; bar.style.height = (a.medianMs == null ? 0 : Math.max(4, a.medianMs / targetMs(seconds, level) * 65)) + 'px';
            label.textContent = (a.medianMs == null ? '—' : fmt(a.medianMs)) + ' · ' + pct(a.accuracy);
            item.title = 'Sèrie ' + (i + 1) + ': ' + label.textContent; item.append(bar, label); bars.append(item);
        });
        el('chart-wrap').hidden = !same.length;
    }
    function clearTimers() {
        clearInterval(timer); timer = null; if (frame !== null) cancelAnimationFrame(frame); frame = null; openingToken++;
        cancelPieceWaits.slice().forEach(cancel => cancel()); cancelPieceWaits = [];
    }
    function destroyBoard() { if (board) board.destroy(); board = null; chess = null; selected = null; }
    function resize() {
        if (!board || screen().style.display === 'none') return;
        const stage = el('stage');
        // El rellotge sempre queda enganxat al tauler, també en un mòbil horitzontal.
        const max = Math.max(168, Math.min(480, window.innerHeight - 240));
        stage.style.width = Math.min(el('practice').clientWidth || 480, max) + 'px';
        board.resize(); paintMarks();
    }
    function square(sq) { return document.querySelector('#bp-board [data-square="' + sq + '"]'); }
    function paintMarks() {
        document.querySelectorAll('#bp-board .square-55d63').forEach(n => n.classList.remove('bp-selected', 'bp-last', 'bp-good', 'bp-bad'));
        if (selected && square(selected)) square(selected).classList.add('bp-selected');
        const s = session && session.state(), r = s && s.rows[s.rows.length - 1];
        const move = reviewMove || (r && ['feedback', 'recall'].includes(s.status) ? r.uci : null);
        if (move) [move.slice(0, 2), move.slice(2, 4)].forEach(q => { if (square(q)) square(q).classList.add(reviewMove ? 'bp-good' : r.correct ? 'bp-good' : 'bp-bad'); });
    }
    function makeBoard(task) {
        destroyBoard(); chess = new window.Chess(task.fen);
        board = window.Chessboard('bp-board', { position: task.fen, orientation: chess.turn() === 'w' ? 'white' : 'black', draggable: true,
            moveSpeed: 120, snapbackSpeed: 100, snapSpeed: 100, pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
            onDragStart: (from, piece) => {
                if (!session || session.state().status !== 'running' || piece[0] !== chess.turn()) return false;
                selected = from; paintMarks();
            },
            onDrop: (from, to) => {
                dragAt = performance.now(); dragSquare = to;
                // chessboard.js també envia un drop sobre l'origen en tocar una
                // peça sense arrossegar-la. És una selecció, no una jugada il·legal.
                if (from !== to) attempt(from, to);
                return 'snapback';
            },
            onSnapEnd: () => { if (board && chess) { board.position(chess.fen(), false); paintMarks(); } }
        });
        resize();
    }
    function piecesReady() {
        // En una primera visita les imatges poden no ser a la cau: aquest temps
        // no ha de formar part de la decisió ni es pot entrenar amb peces invisibles.
        return Promise.all([...el('board').querySelectorAll('img')].map(img => {
            if (img.complete) return Promise.resolve(img.naturalWidth > 0);
            return new Promise(resolve => {
                const finish = ok => {
                    clearTimeout(timeout); img.removeEventListener('load', loaded); img.removeEventListener('error', failed);
                    cancelPieceWaits = cancelPieceWaits.filter(cancel => cancel !== failed); resolve(ok);
                };
                const loaded = () => finish(true), failed = () => finish(false);
                const timeout = setTimeout(failed, 8000);
                cancelPieceWaits.push(failed);
                img.addEventListener('load', loaded, { once: true }); img.addEventListener('error', failed, { once: true });
            });
        })).then(results => results.every(Boolean));
    }
    function renderClock() {
        if (!session) return;
        const s = session.state();
        el('clock-value').textContent = s.status === 'recall' ? '—:—' : clockLabel(s.clockMs);
        el('clock-value').setAttribute('aria-label', s.status === 'recall' ? 'Rellotge ocult durant el record' : 'Temps restant: ' + fmt(s.clockMs));
        el('clock').classList.toggle('bp-urgent', s.status === 'running' && s.clockMs <= s.seconds * 200);
        el('clock-status').textContent = s.status === 'running' ? (s.mode === 'sprint' ? 'Temps de la sèrie' : s.mode === 'radar' ? 'Rellotge simulat' : 'Temps de la decisió') : s.status === 'recall' ? 'Recorda l’última ullada' : 'Rellotge aturat';
        el('budget').textContent = s.status === 'running' ? 'Decideix en ' + fmt(s.leftMs) : '';
        el('meter').style.width = s.status === 'running' ? (100 * s.leftMs / s.limitMs) + '%' : '0%';
    }
    function start() {
        clearTimers(); destroyBoard();
        if (!bank) { el('storage').textContent = 'S’estan preparant els exercicis. Torna-ho a provar en un moment.'; return; }
        const { mode, seconds } = controls(), p = load(), recent = p.sessions.slice(-3).flatMap(s => s.rows.map(r => r.taskId));
        session = createSession({ mode, seconds, level: suggestedLevel(p, mode, seconds), deck: makeDeck(bank, mode, recent) });
        savedId = null; sessionAt = Date.now(); sessionId = sessionAt + '-' + Math.random().toString(36).slice(2);
        setView('practice'); el('storage').textContent = ''; next();
    }
    function next() {
        if (!session || !['idle', 'feedback'].includes(session.state().status)) return;
        clearTimers(); reviewMove = null; selected = null;
        el('promotion').hidden = true; el('recall').hidden = true; el('feedback').hidden = true; el('next').hidden = true; el('solutions').replaceChildren();
        if (!session.prepare()) { results(); return; }
        const s = session.state(), task = s.task;
        el('round').textContent = (s.index + 1) + ' / ' + s.count + ' · ' + (task.fen.split(' ')[1] === 'w' ? 'Jugues amb blanques' : 'Jugues amb negres');
        el('goal').textContent = GOALS[task.kind].title;
        el('stage').style.visibility = 'hidden'; makeBoard(task); renderClock();
        const token = openingToken;
        const roundLabel = el('round').textContent;
        el('round').textContent = roundLabel + ' · Preparant les peces…';
        piecesReady().then(ready => {
            if (token !== openingToken || screen().style.display === 'none') return;
            if (!ready) { interrupt(); el('storage').textContent = 'No s’han pogut carregar totes les peces. Comprova la connexió i torna a començar; aquest temps no s’ha comptat.'; return; }
            frame = requestAnimationFrame(() => {
                if (token !== openingToken || screen().style.display === 'none') return;
                frame = null; el('round').textContent = roundLabel; el('stage').style.visibility = ''; session.begin(); renderClock();
                timer = setInterval(() => { if (session.tick()) finishRound(); else renderClock(); }, 40);
            });
        });
    }
    function attempt(from, to, promotion) {
        if (!session || session.state().status !== 'running') return false;
        if (session.tick()) { finishRound(); return false; }
        const moves = chess.moves({ verbose: true }).filter(m => m.from === from && m.to === to);
        if (!moves.length) { el('input-note').textContent = 'Moviment no legal. El temps continua.'; return false; }
        if (!promotion && moves.some(m => m.promotion)) {
            el('promotion').hidden = false; el('promotion').dataset.from = from; el('promotion').dataset.to = to; return false;
        }
        const move = moves.find(m => !m.promotion || m.promotion === promotion); if (!move) return false;
        session.submit(uci(move));
        // submit comprova també el termini: cap entrada tardana pot convertir-se en encert.
        if (!session.state().rows.at(-1).timeout) chess.move(move);
        board.position(chess.fen(), false); selected = null; finishRound(); return true;
    }
    function finishRound() {
        clearTimers(); el('promotion').hidden = true; el('input-note').textContent = ''; renderClock(); paintMarks();
        const s = session.state();
        if (s.status === 'recall') {
            el('recall').hidden = false; el('recall-options').replaceChildren();
            clockChoices(s.rows.at(-1).clockMs, s.seconds).forEach(n => {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondary'; b.textContent = n + ' s';
                b.onclick = () => { if (!session.recall(n)) return; el('recall').hidden = true; renderFeedback(); }; el('recall-options').append(b);
            });
            el('recall-options').querySelector('button').focus({ preventScroll: true });
        } else renderFeedback();
    }
    function describeMove(task, move) {
        const c = new window.Chess(task.fen), m = c.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        const names = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
        return m ? names[m.piece] + ' ' + m.from + ' → ' + m.to + (m.promotion ? ' = ' + names[m.promotion] : '') : move;
    }
    function renderFeedback() {
        const s = session.state(), row = s.rows.at(-1), task = s.task;
        renderClock(); el('feedback').hidden = false;
        el('feedback-text').textContent = (row.timeout ? 'S’ha acabat el temps d’aquesta decisió.' : row.correct ? 'Objectiu resolt en ' + fmt(row.reactionMs) + '.' : 'Aquesta jugada no resol l’objectiu.') + (typeof row.clockCorrect === 'boolean' ? ' Rellotge: ' + (row.clockCorrect ? 'ben recordat' : 'quedaven ' + Math.ceil(row.clockMs / 1000) + ' s') + '.' : '');
        el('feedback-text').className = row.correct ? 'bp-success' : 'bp-error';
        el('explanation').textContent = GOALS[task.kind].explanation;
        const list = el('solutions'); list.replaceChildren();
        task.answers.forEach(move => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bp-solution'; b.textContent = describeMove(task, move); b.onclick = () => showSolution(task, move); list.append(b); });
        el('next').hidden = false; el('next').textContent = s.index + 1 >= s.count || (s.mode === 'sprint' && s.remainingMs <= 0) ? 'Veure el resultat' : 'Següent posició';
        el('next').focus({ preventScroll: true });
    }
    function showSolution(task, move) {
        reviewMove = move; chess = new window.Chess(task.fen); chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        board.position(chess.fen(), false); paintMarks();
    }
    function results() {
        clearTimers(); save(); destroyBoard(); setView('results');
        const s = session.state(), a = summary(s.rows);
        el('result-title').textContent = s.status === 'done' ? 'Sèrie acabada' : 'Sèrie interrompuda';
        el('result-context').textContent = MODES[s.mode].label + ' · ' + s.seconds + ' s · nivell ' + s.level + ' · ' + a.attempts + ' decisions';
        el('result-accuracy').textContent = a.correct + '/' + a.attempts;
        el('result-speed').textContent = a.medianMs == null ? '—' : fmt(a.medianMs);
        el('result-clock').textContent = pct(a.clockAccuracy);
        el('result-timeouts').textContent = a.timeouts;
        let advice = a.accuracy < .75 ? 'Prioritza encertar: primer comprova si el rei està en escac; després mira captures i mats curts. No acceleris encara.' : a.clockAccuracy != null && a.clockAccuracy < .75 ? 'La lectura del tauler va bé. Ara fes una ullada al rellotge abans de seleccionar la peça i conserva la xifra al cap mentre mous.' : 'Mantén la rutina: torn i rei → rellotge → decisió → moviment. Repeteix sèries curtes amb una pausa entre elles.';
        if (s.status !== 'done') advice = 'Aquesta sèrie parcial queda registrada però no puja el nivell ni entra en la comparació de velocitat. ' + advice;
        el('advice').textContent = advice;
        el('result-clock-note').textContent = a.probes ? a.probes + ' comprovacions · desviació mitjana ' + fmt(a.clockErrorMs) : 'Sense comprovacions del rellotge en aquesta sèrie.';
        const mistakes = el('mistakes'); mistakes.replaceChildren();
        s.rows.filter(r => !r.correct).forEach(r => {
            const task = bank.find(t => t.id === r.taskId); if (!task) return;
            const li = document.createElement('li'); li.textContent = GOALS[task.kind].title + ': ' + describeMove(task, task.answers[0]); mistakes.append(li);
        });
        el('mistakes-wrap').hidden = !mistakes.children.length;
        updateSetup(); el('result-title').focus({ preventScroll: true });
    }
    function interrupt() { if (!session || !['running', 'ready', 'recall', 'feedback'].includes(session.state().status)) return; session.abort(); results(); }
    function close() { clearTimers(); if (session && !['done', 'aborted'].includes(session.state().status)) { session.abort(); save(); } destroyBoard(); screen().style.display = 'none'; }
    function open() {
        if (bridge.beforeOpen) bridge.beforeOpen();
        document.getElementById('start-screen').style.display = 'none'; screen().style.display = '';
        session = null; setView('setup'); updateSetup(); if (bridge.navPush) bridge.navPush('bullet-screen');
        if (!bank) {
            el('start').disabled = true; el('storage').textContent = 'Preparant les posicions…';
            // Preparació fora del rellotge i després de pintar la pantalla.
            setTimeout(() => { try { bank = buildBank(window.Chess); el('storage').textContent = ''; el('start').disabled = false; }
                catch (e) { el('storage').textContent = 'No s’han pogut preparar els exercicis. Torna a obrir aquesta secció.'; console.warn('[Bullet]', e); } }, 0);
        }
    }
    function init(options) {
        bridge = options || {}; if (initialized) return; initialized = true;
        document.getElementById('btn-bullet-practice').onclick = open;
        el('mode').onchange = updateSetup; el('seconds').onchange = updateSetup;
        el('start').onclick = start; el('again').onclick = start; el('next').onclick = next;
        el('configure').onclick = () => { setView('setup'); updateSetup(); };
        el('stop').onclick = interrupt;
        el('back').onclick = () => { if (bridge.goBack) bridge.goBack(); else { close(); document.getElementById('start-screen').style.display = ''; } };
        document.getElementById('bp-board').addEventListener('click', e => {
            if (!session || session.state().status !== 'running') return;
            const sq = e.target.closest('[data-square]'); if (!sq) return;
            const q = sq.dataset.square, piece = chess.get(q);
            if (q === dragSquare && performance.now() - dragAt < 450) { dragSquare = null; return; }
            if (selected && selected !== q && !(piece && piece.color === chess.turn())) { attempt(selected, q); selected = null; }
            else selected = selected === q ? null : piece && piece.color === chess.turn() ? q : null;
            paintMarks();
        });
        el('promotion').querySelectorAll('[data-piece]').forEach(b => { b.onclick = () => attempt(el('promotion').dataset.from, el('promotion').dataset.to, b.dataset.piece); });
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', () => { if (document.hidden && screen().style.display !== 'none') interrupt(); });
        window.addEventListener('pagehide', () => { if (screen().style.display !== 'none') interrupt(); });
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') Object.assign(api, { init, open, close });
    return api;
});
