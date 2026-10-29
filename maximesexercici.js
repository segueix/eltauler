// maximesexercici.js — màximes de «L’Art de la Guerra» i de «Les 36
// estratagemes» per al botó «Màxima» dels exercicis de dues jugades.
// NO és cap detector d'escacs: reaprofita els fets que la TV ja verifica
// (stockfishtv.js, tvCommentCandidates) sobre la línia FIXA de l'exercici i
// deixa que cada llibre triï la màxima amb el seu propi selector (choose).
//
// forStep({ fen, line, step, Chess, detect, books, lineVerified, exerciseId }, memory)
// -> { maxims: [{ text, role: 'general'|'pas', book, bookLabel, ... }], memory }
//   line          jugades UCI alternades: jugador, rival, jugador...
//   step          pas del jugador (1, 2, 3)
//   lineVerified  la línia ve del motor (o del rebost verificat); sense això
//                 no es parla mai de cessió de material.
// Funció pura: mai no modifica opts ni memory.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerMaximesExercici = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.1.0';
    // Clau LOCAL (fora dels prefixos de sincronització): només serveix per no
    // repetir textos d'un exercici a l'altre en aquest aparell.
    const STORAGE_KEY = 'tauler_maximes_exercici_v1';
    // Només fets que la TV dona per comprovats amb el tauler o les regles.
    // Els que depenen d'una anàlisi del motor no hi són: l'exercici no en té.
    const BOARD_RELIABILITY = new Set(['board', 'rules']);
    const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const SACRIFICE_PRIORITY = 60;
    // Els llibres no parlen sobre els fets urgents de la TV (mat, escac,
    // promoció...) per no endarrerir-ne l'avís. En un exercici no hi ha cap
    // avís a fer: el fet hi arriba amb un nom propi i per sota del llindar.
    const EXERCISE_KIND = Object.freeze({
        mate: 'mate-finish', 'mate-threat': 'mate-finish', 'out-of-check': 'escape-check',
        promotion: 'promotion-step', 'fork-check': 'fork'
    });
    const URGENT_PRIORITY = 85;
    // Fets que la TV no comenta però que les regles comproven: només omplen
    // el buit quan la jugada no té res més a dir (prioritat baixa).
    const MOVE_FACTS = Object.freeze({
        exchange: { priority: 25, text: 'Intercanvi de peces del mateix valor.' },
        retreat: { priority: 22, text: 'La peça torna cap al seu camp.' },
        'quiet-move': { priority: 20, text: 'Jugada tranquil·la: sense captura, escac ni promoció.' }
    });
    const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    // Textos mostrats fa poc, de tots dos llibres: encara que un fet molt
    // freqüent esgoti els textos d'una família, no es repeteixen en aquest marge.
    const LAST_SHOWN = 8;

    const balance = (g, color) => g.board().flat().reduce((n, p) =>
        n + (p ? VALUES[p.type] * (p.color === color ? 1 : -1) : 0), 0);
    const play = (g, u) => (typeof u === 'string' && UCI.test(u))
        ? g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) : null;

    function bookId(book, i) { return (book && book.BOOK_ID) || ('llibre' + i); }

    // L'exercici no té el ritme d'una retransmissió: avança un rellotge
    // sintètic prou llarg perquè la separació mínima de la TV no bloquegi la
    // segona màxima, mentre la memòria de cada llibre continua evitant
    // repeticions literals d'un exercici a l'altre.
    function clockStep(books) {
        let gap = 1;
        books.forEach(b => ['MIN_GAP_PLIES', 'FAMILY_GAP_PLIES', 'STRATAGEM_GAP_PLIES'].forEach(k => {
            if (Number.isInteger(b[k]) && b[k] > gap) gap = b[k];
        }));
        return gap + 1;
    }

    function normalizeMemory(raw, books) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const ids = books.map(bookId);
        const stored = r.books && typeof r.books === 'object' ? r.books : {};
        const out = {};
        ids.forEach(id => { if (stored[id] && typeof stored[id] === 'object') out[id] = stored[id]; });
        return {
            clock: Number.isInteger(r.clock) && r.clock >= 0 ? r.clock : 0,
            next: Number.isInteger(r.next) && r.next >= 0 ? r.next % Math.max(1, books.length) : 0,
            shown: Array.isArray(r.shown) ? r.shown.filter(x => typeof x === 'string').slice(-LAST_SHOWN) : [],
            books: out
        };
    }

    // Què és la jugada, només amb les regles (g ja és la posició d'après):
    // intercanvi (es pren una peça del mateix valor i el rival pot recapturar),
    // retirada (una peça que no és peó ni rei torna cap a la seva primera fila)
    // o jugada tranquil·la (sense captura, escac, promoció ni enroc).
    function moveKind(g, mv, me) {
        const flags = mv.flags || '';
        if (/[+#]/.test(mv.san || '') || mv.promotion) return null;
        if (mv.captured) {
            if (VALUES[mv.captured] !== VALUES[mv.piece]) return null;
            const recapture = g.moves({ verbose: true }).some(m => m.to === mv.to);
            return recapture ? 'exchange' : null;
        }
        if (flags.indexOf('k') !== -1 || flags.indexOf('q') !== -1) return null;
        const back = me === 'w' ? mv.to[1] < mv.from[1] : mv.to[1] > mv.from[1];
        if (back && 'nbrq'.indexOf(mv.piece) !== -1) return 'retreat';
        return 'quiet-move';
    }

    // Fets verificats de cada jugada del jugador dins la línia fixa.
    // Retorna un array per pas: [{ kind, text, priority, evidence }], amb el
    // més destacat primer i sense tipus repetits dins el mateix pas.
    function stepFacts(opts) {
        const o = opts || {};
        const Chess = o.Chess, detect = o.detect;
        const line = Array.isArray(o.line) ? o.line : [];
        if (typeof Chess !== 'function' || typeof detect !== 'function' || !o.fen || !line.length) return [];
        let g;
        try { g = new Chess(o.fen); } catch (e) { return []; }
        const me = g.turn();
        const initial = balance(g, me);
        const steps = [];
        for (let i = 0; i < line.length; i += 2) {
            const fenBefore = g.fen();
            const mv = play(g, line[i]);
            if (!mv) break;
            const fenAfter = g.fen();
            const over = g.game_over();
            // El detector només anuncia el final si porta un text.
            const end = over ? (g.in_checkmate() ? { reason: 'checkmate', text: 'Escac i mat.' }
                : { reason: 'draw', text: 'La partida acaba en taules.' }) : null;
            let cands = [];
            try {
                cands = detect({ ChessCtor: Chess, fenBefore, fenAfter, move: mv, ply: i, tier: 'mid', end }) || [];
            } catch (e) { cands = []; }
            const found = cands.filter(c => c && BOARD_RELIABILITY.has(c.reliability) && typeof c.text === 'string' && c.text.trim())
                .map(c => {
                    const kind = EXERCISE_KIND[c.kind] || c.kind;
                    const priority = c.priority || 0;
                    return { kind, text: c.text, priority: kind !== c.kind ? Math.min(priority, URGENT_PRIORITY - 1) : priority };
                });
            const own = moveKind(g, mv, me);
            if (own) found.push({ kind: own, text: MOVE_FACTS[own].text, priority: MOVE_FACTS[own].priority });
            const facts = [];
            const seen = new Set();
            found.sort((a, b) => b.priority - a.priority).forEach(f => {
                if (seen.has(f.kind)) return;
                seen.add(f.kind);
                facts.push(Object.assign(f, { evidence: { source: 'rules', reliable: true } }));
            });
            // Cessió: la peça (no un peó) que mou el jugador és capturada a la
            // mateixa casella per la rèplica de la línia i el balanç cau almenys
            // dos punts respecte de l'inici. Igual que hieroclosure.materialOffers,
            // però per a línies de qualsevol llargada.
            const reply = !over && i + 1 < line.length ? play(g, line[i + 1]) : null;
            if (reply && o.lineVerified === true && mv.piece !== 'p' && reply.captured &&
                    reply.to === mv.to && reply.captured === (mv.promotion || mv.piece) &&
                    initial - balance(g, me) >= 2 && !g.game_over()) {
                facts.unshift({ kind: 'sacrifice', text: 'Cessió de material verificada a la línia.',
                    priority: SACRIFICE_PRIORITY, evidence: { source: 'certified-line', reliable: true } });
            }
            steps.push(facts);
            if (over || (i + 1 < line.length && !reply)) break;
        }
        return steps;
    }

    // Prova els fets amb cada llibre, començant pel que toca, fins trobar una
    // màxima que no repeteixi família (ni estratagema) de les ja triades.
    // Primera passada: només textos que el llibre no ha dit fa poc (un fet
    // molt freqüent esgotaria de seguida els quatre textos d'un estratagema);
    // segona: cap dels últims mostrats; tercera: també de la mateixa família
    // que l'altra màxima del pas (val més que repetir un text que s'acaba de
    // llegir). Mai no torna un dels últims textos mostrats: si no n'hi ha cap
    // de nou, l'app recorre a les màximes de sempre.
    function pickOne(facts, ctx, memory, books, taken) {
        const gap = clockStep(books);
        for (const pass of ['fresh', 'not-last', 'same-theme']) {
            for (let k = 0; k < books.length; k++) {
                const i = (memory.next + k) % books.length;
                const book = books[i], id = bookId(book, i);
                const bookMemory = memory.books[id];
                const recent = bookMemory && Array.isArray(bookMemory.recentIds) ? bookMemory.recentIds : [];
                for (const fact of facts) {
                    let out = null;
                    try {
                        out = book.choose({
                            gameId: ctx.exerciseId, ply: memory.clock + gap,
                            comment: { kind: fact.kind, text: fact.text, priority: fact.priority },
                            certified: true, evidence: fact.evidence
                        }, bookMemory);
                    } catch (e) { out = null; }
                    const m = out && out.maxim;
                    if (!m || !m.text) continue;
                    if (pass === 'fresh' && recent.includes(m.id)) continue;
                    if (memory.shown.includes(id + ':' + m.id)) continue;
                    const theme = id + ':' + (m.family || m.stratagem || m.id);
                    if (taken.has(m.text) || (taken.has(theme) && pass !== 'same-theme')) continue;
                    taken.add(theme); taken.add(m.text);
                    const next = {
                        clock: memory.clock + gap,
                        next: (i + 1) % books.length,
                        shown: memory.shown.concat(id + ':' + m.id).slice(-LAST_SHOWN),
                        books: Object.assign({}, memory.books, { [id]: out.memory })
                    };
                    return { maxim: Object.assign({}, m, { book: id, bookLabel: book.BOOK_LABEL || m.label || '', fact: fact.kind }), memory: next };
                }
            }
        }
        return { maxim: null, memory };
    }

    function forStep(opts, rawMemory) {
        const o = opts || {};
        const books = (Array.isArray(o.books) ? o.books : []).filter(b => b && typeof b.choose === 'function');
        let memory = normalizeMemory(rawMemory, books);
        if (!books.length) return { maxims: [], memory };
        const all = stepFacts(o);
        const step = Number.isInteger(o.step) && o.step >= 1 ? o.step : 1;
        const own = all[step - 1] || [];
        const ctx = { exerciseId: String(o.exerciseId || o.fen || 'exercici') + ':' + step };
        const taken = new Set();
        const maxims = [];
        // Pas 1: una visió de conjunt (fets de les jugades següents de la
        // línia, i si no n'hi ha, els del mateix pas) i una per a la jugada.
        let general = null;
        if (step === 1) {
            const later = [].concat(...all.slice(1));
            const r = pickOne(later.length ? later : own.slice(1), ctx, memory, books, taken);
            general = r.maxim; memory = r.memory;
        }
        let specific = pickOne(own, ctx, memory, books, taken);
        // Jugada sense cap fet que els llibres reconeguin (una captura o un
        // escac a seques): la màxima surt dels fets de la resta de la línia.
        if (!specific.maxim) {
            const rest = [].concat(...all.filter((_, i) => i !== step - 1));
            specific = pickOne(rest, ctx, specific.memory, books, taken);
        }
        memory = specific.memory;
        if (general) maxims.push(Object.assign(general, { role: 'general' }));
        if (specific.maxim) maxims.push(Object.assign(specific.maxim, { role: 'pas' }));
        return { maxims, memory };
    }

    return Object.freeze({ VERSION, STORAGE_KEY, stepFacts, forStep, normalizeMemory });
});
