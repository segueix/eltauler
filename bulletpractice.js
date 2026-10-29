/* Reflexos bullet: entrenament de decisions curtes per a partides de 30 s i 1 min.
 * Estat i rellotge independents de les partides: no toca el ROC ni les ratxes.
 * Les solucions es comproven amb chess.js; no depenen de xarxa ni d'un worker.
 * Cada intent admet UNA jugada: els errors no es poden convertir en encerts
 * repetint, i el temps de revisió/record no es barreja amb el de reacció.
 * Les posicions reals (bulletbank.js) són problemes d'una jugada de la base de
 * dades oberta de Lichess (CC0) amb les respostes validades amb Stockfish. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ElTaulerBulletPractice = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const KEY = 'chess_bulletPractice_v1';
    const MODES = {
        scan: { label: 'Lectura ràpida', count: 8, help: 'Escalfament: una posició cada vegada, amb el seu propi temps. Mira de qui és el torn, si hi ha escac i què pots capturar o fer mat.' },
        radar: { label: 'Rellotge al radar', count: 8, help: 'Cada posició arriba amb un rellotge de partida simulat. Després de moure, digues quant temps et quedava: obliga a mirar el rellotge sense perdre el tauler.' },
        sprint: { label: 'Sprint combinat', count: 10, help: 'Deu decisions comparteixen 30 o 60 segons, com una partida curta. Hi haurà preguntes sorpresa sobre el rellotge.' },
        rush: { label: 'Contrarellotge', count: 40, help: 'Tantes posicions com puguis abans que s’acabi el temps, de més fàcil a més difícil. Cada error resta temps. És la mesura de la teva velocitat real.' }
    };
    const GOALS = {
        mate: { title: 'Fes mat en una', explanation: 'Busca un escac que no deixi cap resposta legal. S’accepten tots els mats en una.' },
        capture: { title: 'Guanya material en una captura', explanation: 'Captura material amb guany positiu, fins i tot si el rival recaptura immediatament la peça moguda. No s’accepta permetre mat en una. És un exercici de lectura immediata, no una anàlisi de tota la variant.' },
        escape: { title: 'Surt de l’escac sense regalar la peça moguda', explanation: 'Mou el rei, captura o tapa l’escac. La peça moguda no ha de quedar capturable immediatament i el rival no ha de tenir mat en una.' }
    };
    const KINDS = ['mate', 'capture', 'escape'];
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
    // Dificultat orientativa de les posicions bàsiques (escala Lichess).
    const SEED_RATING = 600;
    // Sostre de dificultat de cada nivell; cada nivell també escurça el temps.
    const LEVEL_CAP = [0, 900, 1150, 1400, 1650, 2000];
    // Contrarellotge: penalització per error i encerts que demana per pujar de nivell.
    const PENALTY_MS = { 30: 3000, 60: 5000 };
    const RUSH_GOAL = { 30: 5, 60: 9 };
    const MAX_ROWS = 60;
    const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    const KIND_CODE = { m: 'mate', c: 'capture', e: 'escape' };
    // El pla diari: d'escalfar la vista a la velocitat real, en uns cinc minuts.
    const ROUTINE = [
        { mode: 'scan', times: 1, title: 'Escalfa la vista', text: 'Una sèrie de lectura ràpida.' },
        { mode: 'radar', times: 1, title: 'Mira el rellotge', text: 'Una sèrie amb el rellotge al radar.' },
        { mode: 'sprint', times: 1, title: 'Combina-ho', text: 'Un sprint de deu decisions.' },
        { mode: 'rush', times: 2, title: 'Bat el teu rècord', text: 'Dues contrarellotges.' }
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
    // Una entrada del banc real: [id Lichess, m|c|e, FEN, jugada del rival, respostes, dificultat].
    function realTask(entry) {
        if (!Array.isArray(entry) || entry.length < 6) return null;
        const [id, code, fen, last, answers, rating] = entry, kind = KIND_CODE[code];
        if (!kind || typeof id !== 'string' || !/^\w{4,8}$/.test(id) || typeof fen !== 'string' || !UCI.test(last)) return null;
        const list = String(answers).split(' ').filter(u => UCI.test(u));
        if (!list.length || !Number.isFinite(rating)) return null;
        return { id: 'lc-' + id, family: 'lc-' + id, kind, fen, answers: list, last, rating, puzzle: id };
    }
    function buildBank(Chess, real) {
        const bank = [];
        SEEDS.forEach(([kind, fen], i) => [fen, mirrorFen(fen)].forEach((f, side) => {
            const task = { id: i + '-' + side, family: i, kind, fen: f, rating: SEED_RATING };
            task.answers = solutions(Chess, task);
            if (!task.answers.length) throw new Error('Exercici sense solució: ' + task.id);
            bank.push(task);
        }));
        // Les respostes del banc real ja venen validades (tests/bulletpractice.test.js).
        (Array.isArray(real) ? real : []).forEach(entry => { const task = realTask(entry); if (task) bank.push(task); });
        return bank;
    }
    function shuffled(items, random = Math.random) {
        const out = items.slice();
        for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
        return out;
    }
    function levelPool(bank, level) {
        const n = clamp(Math.round(level || 1), 1, 5), cap = LEVEL_CAP[n], floor = n > 1 ? LEVEL_CAP[n - 1] - 250 : 0;
        return bank.filter(t => t.rating <= cap && t.rating >= floor);
    }
    function makeDeck(bank, mode, recent = [], random = Math.random, level = 1) {
        const m = MODES[mode] ? mode : 'scan', count = MODES[m].count, recentSet = new Set(recent);
        let pool = levelPool(bank, level);
        if (new Set(pool.map(t => t.family)).size < count) pool = bank;
        const ordered = shuffled(pool, random).sort((a, b) => Number(recentSet.has(a.id)) - Number(recentSet.has(b.id)));
        const used = new Set(), deck = [];
        // Alterna objectius i colors, i evita les dues versions del mateix patró en una sèrie.
        for (let i = 0; i < count; i++) {
            const kind = KINDS[i % 3], color = i % 2 ? 'b' : 'w', free = t => !used.has(t.family);
            const task = ordered.find(t => free(t) && t.kind === kind && t.fen.split(' ')[1] === color)
                || ordered.find(t => free(t) && t.kind === kind) || ordered.find(free);
            if (!task) break;
            used.add(task.family); deck.push(Object.assign({}, task, { clockFraction: .12 + random() * .8, probe: m === 'radar' }));
        }
        if (m === 'sprint') shuffled(deck.slice(1), random).slice(0, 3).forEach(t => { t.probe = true; });
        // A la contrarellotge la dificultat creix a mesura que avances.
        if (m === 'rush') deck.sort((a, b) => a.rating - b.rating);
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
        const deck = opts.deck.slice(0, MODES[mode].count), rows = [], shared = mode === 'sprint' || mode === 'rush';
        let status = 'idle', index = -1, started = 0, remaining = seconds * 1000, initialClock = 0, limit = 0;
        function state() {
            const elapsed = status === 'running' ? Math.max(0, now() - started) : 0;
            return { mode, seconds, level, status, index, count: deck.length, task: deck[index], rows: rows.map(r => ({ ...r })),
                clockMs: Math.max(0, initialClock - elapsed), leftMs: Math.max(0, limit - elapsed), limitMs: limit, remainingMs: remaining };
        }
        function prepare() {
            if (!['idle', 'feedback'].includes(status)) return false;
            if (index + 1 >= deck.length || (shared && remaining <= 0)) { status = 'done'; return false; }
            index++;
            // La contrarellotge no té límit per posició: només el temps que queda.
            limit = mode === 'rush' ? remaining : targetMs(seconds, level);
            if (shared) { initialClock = remaining; limit = Math.min(limit, remaining); }
            else if (mode === 'radar') { initialClock = Math.round(seconds * 1000 * deck[index].clockFraction); limit = Math.min(limit, initialClock); }
            else initialClock = limit;
            status = 'ready'; return true;
        }
        function begin() { if (status !== 'ready') return false; started = now(); status = 'running'; return true; }
        function finish(move, timeout) {
            const elapsed = Math.min(limit, Math.max(0, now() - started));
            initialClock = Math.max(0, initialClock - elapsed);
            const correct = !timeout && deck[index].answers.includes(move);
            const row = { taskId: deck[index].id, kind: deck[index].kind, uci: move || null, correct,
                timeout, reactionMs: elapsed, targetMs: limit, clockMs: initialClock };
            if (mode === 'rush' && !correct && !timeout) {
                row.penaltyMs = Math.min(initialClock, PENALTY_MS[seconds]);
                initialClock -= row.penaltyMs;
            }
            if (shared) remaining = initialClock;
            // A la contrarellotge, la posició que queda a mitges quan s'acaba el
            // rellotge és el final de la prova, no una decisió: no compta com a error.
            if (!(mode === 'rush' && timeout)) rows.push(row);
            status = !timeout && deck[index].probe ? 'recall' : 'feedback'; return row;
        }
        function tick() { if (status === 'running' && now() - started >= limit) return finish(null, true); return null; }
        function submit(move) {
            if (status !== 'running') return null;
            const late = tick();
            return late || finish(move, false);
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
            penaltyMs: rows.reduce((s, r) => s + (r.penaltyMs || 0), 0),
            probes: probes.length, clockAccuracy: probes.length ? probes.filter(r => r.clockCorrect).length / probes.length : null,
            clockErrorMs: probes.length ? probes.reduce((s, r) => s + r.clockErrorMs, 0) / probes.length : null };
    }
    const msOk = (n, max = 60000) => Number.isFinite(n) && n >= 0 && n <= max;
    function normalizeProgress(raw) {
        const sessions = (Array.isArray(raw && raw.sessions) ? raw.sessions : []).filter(s => s && typeof s.id === 'string' && Number.isFinite(s.at) && MODES[s.mode] && [30, 60].includes(s.seconds) && Number.isInteger(s.level) && s.level >= 1 && s.level <= 5 && Array.isArray(s.rows))
            .map(s => ({ id: s.id.slice(0, 100), at: s.at, mode: s.mode, seconds: s.seconds, level: s.level, complete: s.complete === true,
                rows: s.rows.filter(r => r && typeof r.taskId === 'string' && GOALS[r.kind] && typeof r.correct === 'boolean' && typeof r.timeout === 'boolean' && msOk(r.reactionMs) && Number.isFinite(r.targetMs) && r.targetMs > 0 && r.targetMs <= 60000 && msOk(r.clockMs)).slice(0, MAX_ROWS).map(r => ({
                    taskId: r.taskId.slice(0, 40), kind: r.kind, correct: r.correct, timeout: r.timeout, reactionMs: r.reactionMs, targetMs: r.targetMs, clockMs: r.clockMs,
                    uci: typeof r.uci === 'string' && UCI.test(r.uci) ? r.uci : null,
                    ...(typeof r.clockCorrect === 'boolean' && msOk(r.clockErrorMs) ? { clockCorrect: r.clockCorrect, clockErrorMs: r.clockErrorMs } : {}),
                    ...(msOk(r.penaltyMs, 10000) && r.penaltyMs > 0 ? { penaltyMs: r.penaltyMs } : {})
                })) })).filter(s => s.rows.length);
        const unique = new Map(); sessions.forEach(s => unique.set(s.id, s));
        return { version: 1, sessions: [...unique.values()].sort((a, b) => a.at - b.at).slice(-120) };
    }
    function suggestedLevel(progress, mode, seconds) {
        const all = progress.sessions.filter(s => s.complete && s.mode === mode && s.seconds === seconds);
        if (!all.length) return 1;
        const level = all[all.length - 1].level, recent = all.slice(-3);
        if (recent.length < 3 || recent.some(s => s.level !== level)) return level;
        const strong = recent.every(s => {
            const a = summary(s.rows);
            if (mode === 'rush') return a.accuracy >= .85 && a.correct >= RUSH_GOAL[seconds];
            return a.attempts === MODES[mode].count && a.accuracy >= .85 && a.timeouts === 0 && (mode === 'scan' || (a.probes >= 2 && a.clockAccuracy >= .75));
        });
        const struggling = recent.every(s => summary(s.rows).accuracy < .6);
        return clamp(level + (strong ? 1 : struggling ? -1 : 0), 1, 5);
    }
    // Millor contrarellotge acabada de cada ritme: més encerts i, si empaten, menys temps per encert.
    function records(progress) {
        const out = { 30: null, 60: null };
        progress.sessions.filter(s => s.complete && s.mode === 'rush').forEach(s => {
            const a = summary(s.rows), best = out[s.seconds];
            if (!best || a.correct > best.score || (a.correct === best.score && a.medianMs != null && (best.medianMs == null || a.medianMs < best.medianMs))) {
                out[s.seconds] = { score: a.correct, medianMs: a.medianMs, accuracy: a.accuracy, level: s.level, at: s.at, id: s.id };
            }
        });
        return out;
    }
    function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function planToday(progress, now = Date.now()) {
        const today = dayKey(now), done = {};
        progress.sessions.filter(s => s.complete && dayKey(s.at) === today).forEach(s => { done[s.mode] = (done[s.mode] || 0) + 1; });
        const steps = ROUTINE.map(step => ({ ...step, done: Math.min(step.times, done[step.mode] || 0) }));
        const next = steps.find(s => s.done < s.times);
        return { steps, next: next ? next.mode : null, complete: !next };
    }
    // Dies seguits amb almenys una sèrie acabada. Si avui encara no hi ha res, compta fins ahir.
    function streak(progress, now = Date.now()) {
        const days = new Set(progress.sessions.filter(s => s.complete).map(s => dayKey(s.at)));
        const d = new Date(now); let count = 0;
        if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
        while (days.has(dayKey(d.getTime()))) { count++; d.setDate(d.getDate() - 1); }
        return count;
    }
    function activeDays(progress, now = Date.now(), span = 30) {
        const from = now - span * 864e5;
        return new Set(progress.sessions.filter(s => s.complete && s.at >= from && s.at <= now).map(s => dayKey(s.at))).size;
    }
    // On és l'usuari dins l'estratègia: primer precisió, després rellotge, després velocitat.
    function phase(progress, seconds) {
        const last = mode => progress.sessions.filter(s => s.complete && s.mode === mode && s.seconds === seconds).slice(-3);
        const scan = summary(last('scan').flatMap(s => s.rows)), radar = summary(last('radar').flatMap(s => s.rows));
        if (last('scan').length < 3 || scan.accuracy < .85) return { step: 1, mode: 'scan', title: 'Fase 1 · Precisió', text: 'Primer encerta: torn, rei en escac, captures i mats curts. Busca tres sèries seguides de lectura ràpida amb un 85% d’encerts.' };
        if (last('radar').length < 3 || (radar.clockAccuracy || 0) < .75) return { step: 2, mode: 'radar', title: 'Fase 2 · Rellotge', text: 'Fes una ullada al rellotge abans de tocar la peça i guarda la xifra al cap. Busca un 75% d’encerts del rellotge en tres sèries seguides.' };
        const best = records(progress)[seconds];
        if (seconds === 60 && best && best.score >= 12) return { step: 4, mode: 'rush', title: 'Fase 4 · Passa a 30 segons', text: 'Al minut ja resols ' + best.score + ' posicions. Canvia el ritme a 30 segons i torna a començar la rutina.' };
        return { step: 3, mode: 'rush', title: 'Fase 3 · Velocitat', text: 'La lectura i el rellotge ja van bé. Ara suma encerts al mateix temps: sprints i contrarellotges.' };
    }
    // Encerts i mediana per tipus d'objectiu de les sèries recents: assenyala el punt feble.
    function kindStats(progress, now = Date.now(), span = 30) {
        const from = now - span * 864e5, rows = progress.sessions.filter(s => s.at >= from && s.at <= now).flatMap(s => s.rows);
        const out = {};
        KINDS.forEach(kind => { out[kind] = summary(rows.filter(r => r.kind === kind)); });
        const ranked = KINDS.filter(k => out[k].attempts >= 6).sort((a, b) => out[a].accuracy - out[b].accuracy);
        return { byKind: out, weakest: ranked.length > 1 && out[ranked[0]].accuracy < out[ranked[ranked.length - 1]].accuracy ? ranked[0] : null };
    }
    const api = { KEY, MODES, GOALS, KINDS, SEEDS, LEVEL_CAP, PENALTY_MS, RUSH_GOAL, ROUTINE, mirrorFen, solutions, realTask, buildBank, levelPool, makeDeck, targetMs, clockChoices, createSession, summary, median, normalizeProgress, suggestedLevel, records, dayKey, planToday, streak, activeDays, phase, kindStats };

    // UI integrada, sense alterar el ROC, les ratxes ni el rellotge d'una partida.
    let bridge = {}, bank = null, session = null, board = null, chess = null, selected = null;
    let timer = null, frame = null, flashTimer = null, openingToken = 0, savedId = null, sessionAt = 0, sessionId = '', initialized = false;
    let cancelPieceWaits = [];
    let reviewMove = null, lastRow = null, dragAt = -Infinity, dragSquare = null, recordBefore = null;
    const el = id => document.getElementById('bp-' + id);
    const screen = () => document.getElementById('bullet-screen');
    const fmt = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
    const pct = n => n == null ? '—' : Math.round(n * 100) + '%';
    const clockLabel = ms => { const total = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0'); };
    const paceLabel = seconds => seconds === 30 ? '30 s' : '1 min';
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
        el('progress').hidden = next === 'practice'; el('home-row').hidden = next === 'practice';
        ['setup', 'practice', 'results'].forEach(v => { el(v).hidden = v !== next; });
        screen().classList.toggle('bp-is-practicing', next === 'practice');
    }
    function updateSetup() {
        const { mode, seconds } = controls(), p = load(), level = suggestedLevel(p, mode, seconds);
        el('mode-help').textContent = MODES[mode].help;
        el('level').textContent = 'Nivell ' + level + ' de 5 · ' + (mode === 'rush'
            ? paceLabel(seconds) + ' en total · cada error resta ' + PENALTY_MS[seconds] / 1000 + ' s'
            : 'fins a ' + fmt(targetMs(seconds, level)) + ' per decisió');
        renderPlan(p, seconds); renderProgress(p, mode, seconds, level);
    }
    function renderPlan(p, seconds) {
        const plan = planToday(p), ph = phase(p, seconds), days = streak(p);
        el('streak').textContent = days ? days + (days === 1 ? ' dia seguit' : ' dies seguits') : 'Comença la ratxa avui';
        el('phase-title').textContent = ph.title; el('phase-text').textContent = ph.text;
        const list = el('plan-steps'); list.replaceChildren();
        plan.steps.forEach(step => {
            const li = document.createElement('li'), done = step.done >= step.times;
            li.className = done ? 'bp-step-done' : step.mode === plan.next ? 'bp-step-next' : '';
            const mark = document.createElement('span'); mark.className = 'bp-step-mark'; mark.setAttribute('aria-hidden', 'true');
            mark.textContent = done ? '✓' : step.times > 1 ? step.done + '/' + step.times : '';
            const text = document.createElement('span'); text.className = 'bp-step-text';
            const title = document.createElement('strong'); title.textContent = step.title;
            const sub = document.createElement('small'); sub.textContent = MODES[step.mode].label + ' · ' + step.text;
            text.append(title, sub); li.append(mark, text);
            li.setAttribute('aria-label', step.title + ': ' + (done ? 'fet' : step.done + ' de ' + step.times));
            list.append(li);
        });
        const nextMode = plan.next || ph.mode;
        el('plan-go').dataset.mode = nextMode;
        el('plan-go').textContent = plan.complete ? 'Rutina feta · una altra ' + MODES[nextMode].label.toLowerCase() : 'Fes el pas següent: ' + MODES[nextMode].label.toLowerCase();
        el('plan-note').textContent = plan.complete ? 'Has completat la rutina d’avui. Si continues, fes-ho amb pauses curtes: la velocitat millora amb sèries fresques.' : 'Uns cinc minuts al dia. Fes la rutina en ordre al ritme triat (' + paceLabel(seconds) + ').';
    }
    function tile(value, label, extra) {
        const div = document.createElement('div'), strong = document.createElement('strong'), span = document.createElement('span');
        strong.textContent = value; span.textContent = label; div.append(strong, span);
        if (extra) { const small = document.createElement('small'); small.textContent = extra; div.append(small); }
        return div;
    }
    function renderProgress(p, mode, seconds, level) {
        const rec = records(p), days = streak(p), dateLabel = at => new Date(at).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
        const tiles = el('tiles'); tiles.replaceChildren(
            tile(String(days), days === 1 ? 'dia seguit' : 'dies seguits'),
            tile(String(activeDays(p)), 'dies actius', 'últims 30 dies'),
            tile(rec[60] ? String(rec[60].score) : '—', 'rècord contrarellotge 1 min', rec[60] ? 'nivell ' + rec[60].level + ' · ' + dateLabel(rec[60].at) : 'encara sense marca'),
            tile(rec[30] ? String(rec[30].score) : '—', 'rècord contrarellotge 30 s', rec[30] ? 'nivell ' + rec[30].level + ' · ' + dateLabel(rec[30].at) : 'encara sense marca'));
        const ks = kindStats(p), kinds = el('kinds'); kinds.replaceChildren();
        KINDS.forEach(kind => {
            const a = ks.byKind[kind], li = document.createElement('li');
            if (kind === ks.weakest) li.className = 'bp-kind-weak';
            const name = document.createElement('span'); name.textContent = GOALS[kind].title;
            const value = document.createElement('strong'); value.textContent = a.attempts ? pct(a.accuracy) + (a.medianMs == null ? '' : ' · ' + fmt(a.medianMs)) : '—';
            const bar = document.createElement('span'); bar.className = 'bp-kind-bar'; bar.style.setProperty('--w', a.attempts ? Math.round(a.accuracy * 100) + '%' : '0%');
            li.append(name, value, bar); kinds.append(li);
        });
        el('kinds-note').textContent = ks.weakest ? 'Punt feble: «' + GOALS[ks.weakest].title.toLowerCase() + '». Fixa-t’hi a la lectura ràpida abans d’accelerar.' : 'Encerts i mediana dels encerts dels últims 30 dies, de totes les modalitats.';
        const all = p.sessions.filter(s => s.mode === mode && s.seconds === seconds), same = all.filter(s => s.complete && s.level === level);
        el('progress-note').textContent = all.length ? all.filter(s => s.complete).length + ' sèries acabades de ' + MODES[mode].label.toLowerCase() + ' a ' + paceLabel(seconds) + '. Es conserven les 120 sèries més recents.' : 'Encara no hi ha sèries de ' + MODES[mode].label.toLowerCase() + ' a ' + paceLabel(seconds) + '.';
        const tbody = el('history'); tbody.replaceChildren();
        all.slice(-10).reverse().forEach(s => {
            const a = summary(s.rows), tr = document.createElement('tr');
            [dateLabel(s.at) + (s.complete ? '' : ' · parcial'), 'N' + s.level, mode === 'rush' ? a.correct + ' (' + pct(a.accuracy) + ')' : pct(a.accuracy), a.medianMs == null ? '—' : fmt(a.medianMs), mode === 'rush' ? (a.penaltyMs ? '−' + Math.round(a.penaltyMs / 1000) + ' s' : '—') : pct(a.clockAccuracy)]
                .forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.append(td); }); tbody.append(tr);
        });
        el('history-head-clock').textContent = mode === 'rush' ? 'Penalització' : 'Rellotge';
        el('history-head-score').textContent = mode === 'rush' ? 'Encerts' : 'Encerts (%)';
        el('history-wrap').hidden = !all.length;
        const recent = same.slice(-3), before = same.slice(-6, -3);
        const a = summary(recent.flatMap(s => s.rows)), b = summary(before.flatMap(s => s.rows));
        let trend = 'La mediana mesura només les decisions correctes. Compara sempre el mateix ritme, modalitat i nivell.';
        if (recent.length === 3 && before.length === 3 && a.medianMs != null && b.medianMs != null) {
            const delta = a.medianMs - b.medianMs;
            trend = 'Últimes 3 sèries respecte de les 3 anteriors del nivell ' + level + ': ' + fmt(Math.abs(delta)) + (delta < 0 ? ' més ràpid' : ' més lent') + ', encerts ' + pct(b.accuracy) + ' → ' + pct(a.accuracy) + (mode === 'rush' ? '' : ', rellotge ' + pct(b.clockAccuracy) + ' → ' + pct(a.clockAccuracy)) + '.';
        }
        el('trend').textContent = trend;
        // Barres amb xifres visibles: no requereixen Chart.js ni amaguen els errors.
        const bars = el('chart'); bars.replaceChildren();
        const series = same.slice(-10), maxScore = Math.max(1, ...series.map(s => summary(s.rows).correct));
        series.forEach((s, i) => {
            const a = summary(s.rows), item = document.createElement('div'), bar = document.createElement('span'), label = document.createElement('small');
            item.className = 'bp-chart-item'; bar.className = 'bp-chart-bar';
            const h = mode === 'rush' ? a.correct / maxScore * 65 : (a.medianMs == null ? 0 : a.medianMs / targetMs(seconds, level) * 65);
            bar.style.height = Math.max(a.correct || a.medianMs ? 4 : 0, Math.min(80, h)) + 'px';
            label.textContent = mode === 'rush' ? a.correct + ' · ' + pct(a.accuracy) : (a.medianMs == null ? '—' : fmt(a.medianMs)) + ' · ' + pct(a.accuracy);
            item.title = 'Sèrie ' + (i + 1) + ': ' + label.textContent; item.append(bar, label); bars.append(item);
        });
        el('chart-caption').textContent = mode === 'rush'
            ? 'Encerts de cada contrarellotge al nivell ' + level + ' · una barra més alta és millor.'
            : 'Temps dels encerts al mateix nivell · una barra més baixa significa menys temps. A sota, els encerts de cada sèrie.';
        el('chart-wrap').hidden = !same.length;
    }
    function clearTimers() {
        clearInterval(timer); timer = null; if (frame !== null) cancelAnimationFrame(frame); frame = null; openingToken++;
        clearTimeout(flashTimer); flashTimer = null;
        cancelPieceWaits.slice().forEach(cancel => cancel()); cancelPieceWaits = [];
    }
    function destroyBoard() { if (board) board.destroy(); board = null; chess = null; selected = null; }
    function resize() {
        if (!board || screen().style.display === 'none') return;
        const stage = el('stage'), boardEl = el('board');
        // El rellotge sempre queda enganxat al tauler, també en un mòbil horitzontal:
        // el tauler ocupa l'alçada que deixen lliures el rellotge, l'objectiu i els botons.
        const chrome = el('practice').offsetHeight - boardEl.offsetHeight;
        const max = Math.max(168, Math.min(560, window.innerHeight - chrome - 20));
        stage.style.width = Math.min(el('practice').clientWidth || 480, max) + 'px';
        board.resize(); paintMarks();
    }
    function square(sq) { return document.querySelector('#bp-board [data-square="' + sq + '"]'); }
    function paintMarks() {
        document.querySelectorAll('#bp-board .square-55d63').forEach(n => n.classList.remove('bp-selected', 'bp-last', 'bp-good', 'bp-bad'));
        const s = session && session.state(), r = lastRow;
        const move = reviewMove || (r && ['feedback', 'recall'].includes(s.status) ? r.uci : null);
        // La darrera jugada del rival dona context, com en una partida.
        if (!move && s && s.task && s.task.last) [s.task.last.slice(0, 2), s.task.last.slice(2, 4)].forEach(q => { if (square(q)) square(q).classList.add('bp-last'); });
        if (selected && square(selected)) square(selected).classList.add('bp-selected');
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
    function roundLabel(s) {
        const side = s.task.fen.split(' ')[1] === 'w' ? 'Jugues amb blanques' : 'Jugues amb negres';
        if (s.mode !== 'rush') return (s.index + 1) + ' / ' + s.count + ' · ' + side;
        const a = summary(s.rows);
        return 'Encerts ' + a.correct + ' · errors ' + (a.attempts - a.correct) + ' · ' + side;
    }
    function renderClock() {
        if (!session) return;
        const s = session.state();
        el('clock-value').textContent = s.status === 'recall' ? '—:—' : clockLabel(s.clockMs);
        el('clock-value').setAttribute('aria-label', s.status === 'recall' ? 'Rellotge ocult durant el record' : 'Temps restant: ' + fmt(s.clockMs));
        // Vermell en l'últim tram: el 30% del temps d'una decisió o el 20% del rellotge de la partida.
        const urgent = s.mode === 'scan' ? s.clockMs <= s.limitMs * .3 : s.clockMs <= s.seconds * 200;
        el('clock').classList.toggle('bp-urgent', s.status === 'running' && urgent);
        el('clock').classList.toggle('bp-running', s.status === 'running');
        el('clock-status').textContent = s.status === 'running'
            ? (s.mode === 'sprint' || s.mode === 'rush' ? 'El teu temps' : s.mode === 'radar' ? 'Rellotge de la partida' : 'Temps de la decisió')
            : s.status === 'ready' ? 'Llegeix l’enunciat · prem ▶'
            : s.status === 'recall' ? 'Recorda l’última ullada' : 'Rellotge aturat';
        el('budget').textContent = s.status === 'ready' ? 'El temps encara no compta.'
            : s.status !== 'running' ? ''
            : s.mode === 'rush' ? 'Errors: −' + PENALTY_MS[s.seconds] / 1000 + ' s'
            : 'Decideix en ' + fmt(s.leftMs);
        const fraction = s.mode === 'rush' ? s.clockMs / (s.seconds * 1000) : s.leftMs / (s.limitMs || 1);
        el('meter').style.width = s.status === 'running' ? (100 * fraction) + '%' : '0%';
    }
    function start(modeOverride) {
        clearTimers(); hideStartOverlay(); destroyBoard();
        if (!bank) { el('storage').textContent = 'S’estan preparant els exercicis. Torna-ho a provar en un moment.'; return; }
        if (modeOverride && MODES[modeOverride]) el('mode').value = modeOverride;
        const { mode, seconds } = controls(), p = load(), recent = p.sessions.slice(-4).flatMap(s => s.rows.map(r => r.taskId));
        const level = suggestedLevel(p, mode, seconds);
        session = createSession({ mode, seconds, level, deck: makeDeck(bank, mode, recent, Math.random, level) });
        recordBefore = records(p)[seconds];
        savedId = null; sessionAt = Date.now(); sessionId = sessionAt + '-' + Math.random().toString(36).slice(2);
        setView('practice'); el('storage').textContent = ''; next();
    }
    function hideStartOverlay() {
        el('start-overlay').hidden = true;
        el('board-wrap').classList.remove('bp-awaiting-start');
    }
    function beginRound() {
        if (!session || session.state().status !== 'ready'
            || el('stage').style.visibility === 'hidden'
            || screen().style.display === 'none') return false;
        if (!session.begin()) return false;
        // Descobreix tota la posició només quan el jugador prem ▶.
        hideStartOverlay();
        renderClock(); paintMarks();
        timer = setInterval(() => {
            const late = session.tick();
            if (late) finishRound(late);
            else renderClock();
        }, 40);
        return true;
    }
    function next() {
        if (!session || !['idle', 'feedback'].includes(session.state().status)) return;
        clearTimers(); hideStartOverlay(); reviewMove = null; lastRow = null; selected = null;
        el('promotion').hidden = true; el('recall').hidden = true; el('feedback').hidden = true; el('next').hidden = true; el('solutions').replaceChildren();
        el('flash').textContent = ''; el('flash').className = 'bp-flash';
        if (!session.prepare()) { results(); return; }
        const s = session.state(), task = s.task;
        el('round').textContent = roundLabel(s);
        el('goal').textContent = GOALS[task.kind].title;
        el('stage').style.visibility = 'hidden'; makeBoard(task); renderClock();
        const token = openingToken, label = el('round').textContent;
        el('round').textContent = label + ' · Preparant les peces…';
        piecesReady().then(ready => {
            if (token !== openingToken || screen().style.display === 'none') return;
            if (!ready) { interrupt(); el('storage').textContent = 'No s’han pogut carregar totes les peces. Comprova la connexió i torna a començar; aquest temps no s’ha comptat.'; return; }
            frame = requestAnimationFrame(() => {
                if (token !== openingToken || screen().style.display === 'none') return;
                frame = null;
                el('round').textContent = label;
                // L'enunciat és llegible sense pressa; les peces no es poden
                // inspeccionar ni moure sota la capa. El clic a ▶ revela el
                // tauler i inicia el cronòmetre en el mateix gest.
                el('board-wrap').classList.add('bp-awaiting-start');
                el('start-overlay').hidden = false;
                el('stage').style.visibility = '';
                renderClock(); paintMarks();
            });
        });
    }
    function attempt(from, to, promotion) {
        if (!session || session.state().status !== 'running') return false;
        const late = session.tick();
        if (late) { finishRound(late); return false; }
        const moves = chess.moves({ verbose: true }).filter(m => m.from === from && m.to === to);
        if (!moves.length) { el('input-note').textContent = 'Moviment no legal. El temps continua.'; return false; }
        if (!promotion && moves.some(m => m.promotion)) {
            el('promotion').hidden = false; el('promotion').dataset.from = from; el('promotion').dataset.to = to; return false;
        }
        const move = moves.find(m => !m.promotion || m.promotion === promotion); if (!move) return false;
        const row = session.submit(uci(move));
        // submit comprova també el termini: cap entrada tardana pot convertir-se en encert.
        if (!row.timeout) chess.move(move);
        board.position(chess.fen(), false); selected = null; finishRound(row); return true;
    }
    function finishRound(row) {
        lastRow = row;
        clearTimers(); hideStartOverlay(); el('promotion').hidden = true; el('input-note').textContent = ''; renderClock(); paintMarks();
        const s = session.state();
        if (s.mode === 'rush') { flashAndContinue(s, row); return; }
        if (s.status === 'recall') {
            el('recall').hidden = false; el('recall-options').replaceChildren();
            clockChoices(s.rows.at(-1).clockMs, s.seconds).forEach(n => {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondary'; b.textContent = n + ' s';
                b.onclick = () => { if (!session.recall(n)) return; el('recall').hidden = true; renderFeedback(); }; el('recall-options').append(b);
            });
            el('recall-options').querySelector('button').focus({ preventScroll: true });
        } else renderFeedback();
    }
    // Contrarellotge: sense pausa de revisió. Un senyal breu i la posició següent;
    // el rellotge resta aturat mentre canvia el tauler.
    function flashAndContinue(s, row) {
        const flash = el('flash');
        flash.textContent = row.timeout ? 'Temps!' : row.correct ? '+1' : '−' + Math.round((row.penaltyMs || 0) / 1000) + ' s';
        flash.className = 'bp-flash ' + (row.correct ? 'bp-flash-good' : 'bp-flash-bad');
        el('round').textContent = roundLabel(s);
        flashTimer = setTimeout(() => { flashTimer = null; next(); }, row.correct ? 380 : 650);
    }
    function describeMove(task, move) {
        const c = new window.Chess(task.fen), m = c.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        const names = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
        return m ? names[m.piece] + ' ' + m.from + ' → ' + m.to + (m.promotion ? ' = ' + names[m.promotion] : '') : move;
    }
    function renderFeedback() {
        const s = session.state(), row = lastRow, task = s.task;
        renderClock(); el('feedback').hidden = false;
        el('feedback-text').textContent = (row.timeout ? 'S’ha acabat el temps d’aquesta decisió.' : row.correct ? 'Objectiu resolt en ' + fmt(row.reactionMs) + '.' : 'Aquesta jugada no resol l’objectiu.') + (typeof row.clockCorrect === 'boolean' ? ' Rellotge: ' + (row.clockCorrect ? 'ben recordat' : 'quedaven ' + Math.ceil(row.clockMs / 1000) + ' s') + '.' : '');
        el('feedback-text').className = row.correct ? 'bp-success' : 'bp-error';
        el('explanation').textContent = GOALS[task.kind].explanation;
        const list = el('solutions'); list.replaceChildren();
        task.answers.forEach(move => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bp-solution'; b.textContent = describeMove(task, move); b.onclick = () => showSolution(task, move); list.append(b); });
        const source = el('source'); source.replaceChildren();
        if (task.puzzle) {
            const a = document.createElement('a'); a.href = 'https://lichess.org/training/' + task.puzzle; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = 'Posició d’una partida real (problema ' + task.puzzle + ' de Lichess)'; source.append(a);
        }
        el('next').hidden = false; el('next').textContent = s.index + 1 >= s.count || (s.mode === 'sprint' && s.remainingMs <= 0) ? 'Veure el resultat' : 'Següent posició';
        el('next').focus({ preventScroll: true });
    }
    function showSolution(task, move) {
        reviewMove = move; chess = new window.Chess(task.fen); chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        board.position(chess.fen(), false); paintMarks();
    }
    function results() {
        clearTimers(); hideStartOverlay(); save(); destroyBoard(); setView('results');
        const s = session.state(), a = summary(s.rows), rush = s.mode === 'rush';
        el('result-title').textContent = s.status === 'done' ? (rush ? 'Contrarellotge acabada' : 'Sèrie acabada') : 'Sèrie interrompuda';
        el('result-context').textContent = MODES[s.mode].label + ' · ' + paceLabel(s.seconds) + ' · nivell ' + s.level + ' · ' + a.attempts + ' decisions';
        el('result-accuracy').textContent = rush ? String(a.correct) : a.correct + '/' + a.attempts;
        el('result-accuracy-label').textContent = rush ? 'Posicions resoltes' : 'Decisions correctes';
        el('result-speed').textContent = a.medianMs == null ? '—' : fmt(a.medianMs);
        el('result-clock').textContent = rush ? pct(a.accuracy) : pct(a.clockAccuracy);
        el('result-clock-label').textContent = rush ? 'Precisió' : 'Record del rellotge';
        el('result-timeouts').textContent = rush ? (a.penaltyMs ? '−' + Math.round(a.penaltyMs / 1000) + ' s' : '0 s') : String(a.timeouts);
        el('result-timeouts-label').textContent = rush ? 'Temps perdut per errors' : 'Temps exhaurits';
        const record = el('record'); record.hidden = true;
        if (rush && s.status === 'done' && a.correct > 0 && (!recordBefore || a.correct > recordBefore.score)) {
            record.hidden = false; record.textContent = recordBefore ? 'Nou rècord a ' + paceLabel(s.seconds) + ': ' + a.correct + ' (abans ' + recordBefore.score + ')' : 'Primera marca a ' + paceLabel(s.seconds) + ': ' + a.correct + ' posicions';
        }
        let advice = a.accuracy < .75 ? 'Prioritza encertar: primer comprova si el rei està en escac; després mira captures i mats curts. No acceleris encara.'
            : !rush && a.clockAccuracy != null && a.clockAccuracy < .75 ? 'La lectura del tauler va bé. Ara fes una ullada al rellotge abans de seleccionar la peça i conserva la xifra al cap mentre mous.'
            : rush ? 'Bona precisió. Per sumar més posicions, decideix el tipus d’objectiu en la primera ullada (escac, captura o mat) i mou sense repassar-ho dues vegades.'
            : 'Mantén la rutina: torn i rei → rellotge → decisió → moviment. Repeteix sèries curtes amb una pausa entre elles.';
        if (s.status !== 'done') advice = 'Aquesta sèrie parcial queda registrada però no puja el nivell ni compta per al pla ni per als rècords. ' + advice;
        el('advice').textContent = advice;
        el('result-clock-note').textContent = rush ? 'Cada error ha restat ' + PENALTY_MS[s.seconds] / 1000 + ' s. La dificultat ha pujat a cada posició.' : a.probes ? a.probes + ' comprovacions · desviació mitjana ' + fmt(a.clockErrorMs) : 'Sense comprovacions del rellotge en aquesta sèrie.';
        const mistakes = el('mistakes'); mistakes.replaceChildren();
        s.rows.filter(r => !r.correct).forEach(r => {
            const task = bank.find(t => t.id === r.taskId); if (!task) return;
            const li = document.createElement('li'); li.textContent = GOALS[task.kind].title + ': ' + describeMove(task, task.answers[0]); mistakes.append(li);
        });
        el('mistakes-wrap').hidden = !mistakes.children.length;
        const plan = planToday(load());
        el('again').textContent = plan.next && plan.next !== s.mode ? 'Següent pas del pla: ' + MODES[plan.next].label.toLowerCase() : rush ? 'Una altra contrarellotge' : 'Una altra sèrie';
        el('again').dataset.mode = plan.next && plan.next !== s.mode ? plan.next : s.mode;
        updateSetup(); el('result-title').focus({ preventScroll: true });
    }
    function interrupt() { if (!session || !['running', 'ready', 'recall', 'feedback'].includes(session.state().status)) return; session.abort(); results(); }
    function close() { clearTimers(); hideStartOverlay(); if (session && !['done', 'aborted'].includes(session.state().status)) { session.abort(); save(); } destroyBoard(); screen().style.display = 'none'; }
    function open() {
        if (bridge.beforeOpen) bridge.beforeOpen();
        document.getElementById('start-screen').style.display = 'none'; screen().style.display = '';
        session = null; setView('setup'); updateSetup(); if (bridge.navPush) bridge.navPush('bullet-screen');
        if (!bank) {
            el('start').disabled = true; el('plan-go').disabled = true; el('storage').textContent = 'Preparant les posicions…';
            // Preparació fora del rellotge i després de pintar la pantalla.
            setTimeout(() => { try { bank = buildBank(window.Chess, window.ElTaulerBulletBank); el('storage').textContent = ''; el('start').disabled = false; el('plan-go').disabled = false; }
                catch (e) { el('storage').textContent = 'No s’han pogut preparar els exercicis. Torna a obrir aquesta secció.'; console.warn('[Bullet]', e); } }, 0);
        }
    }
    function init(options) {
        bridge = options || {}; if (initialized) return; initialized = true;
        document.getElementById('btn-bullet-practice').onclick = open;
        el('mode').onchange = updateSetup; el('seconds').onchange = updateSetup;
        el('start').onclick = () => start(); el('next').onclick = next;
        el('start-play').onclick = beginRound;
        el('again').onclick = () => start(el('again').dataset.mode);
        el('plan-go').onclick = () => start(el('plan-go').dataset.mode);
        el('configure').onclick = () => { setView('setup'); updateSetup(); };
        el('stop').onclick = interrupt;
        el('home').onclick = () => { if (bridge.goBack) bridge.goBack(); else { close(); document.getElementById('start-screen').style.display = ''; } };
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
    // _state: només lectura, per a la verificació al navegador (com _controller de Stockfish TV).
    if (typeof window !== 'undefined' && typeof document !== 'undefined') Object.assign(api, { init, open, close, _state: () => session && session.state() });
    return api;
});
