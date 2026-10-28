// ============================================================================
// narrativa.js — Memòria narrativa LOCAL i factual per a Stockfish vs Lozza TV.
// Fase 2: fils conductors entre jugades, continuïtat i tancament verificable.
// Aquest mòdul NO analitza posicions ni inventa plans: reutilitza únicament
// els motius validats per tvCommentCandidates i els moviments legals.
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerNarrativa = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_THREADS = 16;
    const MAX_AGE = 48; // semijugades; evita connexions amb etapes molt llunyanes
    const MIN_RECALL = 3;
    const NARRATION_GAP = 8;
    const MAX_WORDS = 37;
    const SQUARE = /^[a-h][1-8]$/;
    const KEYS = {
        passed: /^passed:([wb]):([a-h])$/,
        file: /^(?:file|dbl):([wb]):([a-h])$/,
        pressure: /^press:([wb]):([a-h][1-8])$/,
        center: /^(?:center-(?:pawn|pawnctrl|ctrl|piece)):([wb]):/,
        king: /^kzone:([wb]):/,
        majority: /^major:([wb]):(rei|dama)$/
    };
    const TYPE = {
        'passed-new': 'passed', 'passed-advance': 'passed',
        'open-file': 'file', 'doubled-rooks': 'file',
        'pressure': 'pressure', 'center': 'center',
        'king-pressure': 'king', 'majority': 'majority'
    };
    const COLORS = { w: 'les blanques', b: 'les negres' };

    function empty() { return { threads: [], lastNarrationPly: -100 }; }
    function copy(story) {
        if (!story || !Array.isArray(story.threads)) return empty();
        return {
            threads: story.threads.filter(t => t && typeof t.topic === 'string'
                && Number.isFinite(t.ply) && (t.color === 'w' || t.color === 'b'))
                .map(t => Object.assign({}, t)).slice(-MAX_THREADS),
            lastNarrationPly: Number.isFinite(story.lastNarrationPly) ? story.lastNarrationPly : -100
        };
    }
    function describeTopic(candidate) {
        if (!candidate || !TYPE[candidate.kind] || typeof candidate.key !== 'string') return null;
        const group = TYPE[candidate.kind];
        const match = KEYS[group] && KEYS[group].exec(candidate.key);
        if (!match) return null;
        const color = match[1];
        if (!COLORS[color]) return null;
        const loc = match[2] || '';
        const topic = group + ':' + color + ':' + loc;
        const targetType = candidate.payload && candidate.payload.pressure && candidate.payload.pressure.targetType;
        return {
            topic: topic, group: group, color: color, loc: loc,
            kind: candidate.kind, sig: String(candidate.sig || ''),
            targetType: /^[pnbrqk]$/.test(targetType || '') ? targetType : null
        };
    }

    function textFor(previous, current) {
        if (current.group === 'file') {
            if (previous.kind === 'open-file' && current.kind === 'doubled-rooks')
                return 'Recordem la columna ' + current.loc + ': ';
            return 'La columna ' + current.loc + ' torna a ser rellevant: ';
        }
        if (current.group === 'passed') {
            if (previous.kind === 'passed-new' && current.kind === 'passed-advance')
                return 'Tornem al peó passat de la columna ' + current.loc + ': ';
            return 'Aquell peó passat de la columna ' + current.loc + ' torna a aparèixer: ';
        }
        if (current.group === 'pressure') return 'Recordem la pressió sobre ' + current.loc + ': ';
        if (current.group === 'center') return 'Tornem a la lluita pel centre de ' + COLORS[current.color] + ': ';
        if (current.group === 'king') return 'El tema de la seguretat del rei rival reapareix: ';
        if (current.group === 'majority') return 'Reprenem el fil de la majoria de peons del flanc de ' + current.loc + ': ';
        return '';
    }
    function validMove(move) {
        return !!(move && /^[wb]$/.test(move.color || '')
            && SQUARE.test(move.from || '') && SQUARE.test(move.to || ''));
    }
    function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }
    function apply(story, chosen, opts) {
        const o = opts || {};
        const ply = o.ply;
        const previous = copy(story);
        if (!Number.isInteger(ply) || ply < 0 || !validMove(o.move)) {
            return { story: previous, comment: chosen, event: null };
        }
        previous.threads = previous.threads.filter(t => t.ply < ply && ply - t.ply <= MAX_AGE);
        // Només recordem idees efectivament comentades. Ni motius descartats
        // pel selector ni hipòtesis del motor es converteixen en fets narrats.
        if (!chosen || !chosen.text || !chosen.key) {
            return { story: previous, comment: chosen, event: null };
        }

        const selected = (o.candidates || []).find(c =>
            c && c.key === chosen.key && c.kind === chosen.kind);
        const topic = describeTopic(selected);
        const old = topic && previous.threads.find(t => t.topic === topic.topic);
        const gap = ply - previous.lastNarrationPly >= NARRATION_GAP;
        const meaningful = old && ply - old.ply >= MIN_RECALL;
        let preface = null, event = null;
        if (gap && meaningful && (old.kind !== topic.kind || old.sig !== topic.sig
                || ply - old.ply >= 10)) {
            preface = textFor(old, topic);
            event = preface ? 'return' : null;
        }

        // Tancament comprovat per les regles: captura exacta de la peça que
        // s'havia destacat com a objectiu de pressió o peó passat. No assumim
        // que un pla s'ha complert perquè la valoració hagi canviat.
        let closed = null;
        if (gap && o.move.captured && ['capture', 'recapture', 'capture-free'].includes(chosen.kind)) {
            closed = previous.threads.find(t => ply - t.ply >= MIN_RECALL && t.loc === o.move.to && (
                (t.group === 'pressure' && t.color === o.move.color
                    && t.targetType === o.move.captured)
                || (t.group === 'passed' && t.color !== o.move.color
                    && o.move.captured === 'p' && t.lastSquare === o.move.to)
            ));
            if (closed) {
                preface = closed.group === 'passed'
                    ? 'El peó passat que seguíem ha estat capturat: '
                    : 'La pressió que havíem vist sobre ' + closed.loc + ' culmina: ';
                event = 'resolved';
            }
        }

        // L'expressivitat ha de ser BREU. Mai s'afegeixen comentaris a
        // resums de partida ni a fets crítics com mat, error tàctic o escac.
        if (['mate', 'end', 'summary', 'missed', 'allows-mate', 'mate-threat'].includes(chosen.kind)
                || words(chosen.text) + words(preface) > MAX_WORDS) {
            preface = null; event = null; closed = null;
        }

        let comment = chosen;
        if (preface) {
            const combined = preface + chosen.text.charAt(0).toLowerCase() + chosen.text.slice(1);
            comment = Object.assign({}, chosen, {
                text: combined, leadText: combined, extended: true,
                explanatory: true, narrative: { event: event, topic: closed ? closed.topic : topic.topic,
                    previousPly: closed ? closed.ply : old.ply }
            });
            previous.lastNarrationPly = ply;
        }

        if (closed) previous.threads = previous.threads.filter(t => t.topic !== closed.topic);
        if (topic) {
            previous.threads = previous.threads.filter(t => t.topic !== topic.topic);
            previous.threads.push(Object.assign({}, topic, {
                ply: ply, firstPly: old ? old.firstPly : ply,
                lastSquare: selected.tags && Array.isArray(selected.tags.squares)
                    && SQUARE.test(selected.tags.squares[0] || '') ? selected.tags.squares[0] : null
            }));
        }
        previous.threads = previous.threads.slice(-MAX_THREADS);
        return { story: previous, comment: comment, event: event };
    }

    return { VERSION: 2, MAX_THREADS, MAX_AGE, empty, copy, describeTopic, apply };
});
