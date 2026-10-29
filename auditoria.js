// auditoria.js — control lingüístic i mesura reproduïble de les retransmissions.
// Sense serveis externs, sense canvis a les dades d'escacs ni als motors.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerAuditoria = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LIMIT = 12;
    function clean(text) {
        return String(text || '').toLocaleLowerCase('ca')
            .replace(/[“”"«».,:;!?()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function opening(text) {
        return clean(text).split(/\s+/).slice(0, 2).join(' ');
    }
    // Preferim variants amb un començament menys repetit. La semàntica ja
    // ha estat certificada pel detector de motius; no creem frases noves.
    function preferVariety(initial, candidates, recent) {
        const list = Array.isArray(candidates) ? candidates.filter(s => typeof s === 'string' && s.trim()) : [];
        if (list.indexOf(initial) === -1 || list.length < 2) return initial;
        const history = (Array.isArray(recent) ? recent : []).slice(-4)
            .map(x => typeof x === 'string' ? x : x && x.text).filter(Boolean);
        if (!history.length) return initial;
        const last = history.slice(-2);
        const score = (text) => {
            const o = opening(text), n = clean(text);
            let penalty = 0;
            last.forEach((h, i) => {
                if (opening(h) === o) penalty += i === last.length - 1 ? 8 : 4;
                if (clean(h) === n) penalty += 16;
            });
            history.slice(0, -2).forEach(h => {
                if (opening(h) === o) penalty += 2;
                if (clean(h) === n) penalty += 5;
            });
            return penalty;
        };
        const firstScore = score(initial);
        if (firstScore === 0) return initial;
        // Desempat estable: preval la selecció original per mantenir la
        // rotació i no degradar la coherència entre moviments.
        let best = initial, bestScore = firstScore;
        for (const v of list) {
            const val = score(v);
            if (val < bestScore) { best = v; bestScore = val; }
        }
        return best;
    }

    function audit(rows, opts) {
        const a = Array.isArray(rows) ? rows : [];
        const o = opts || {};
        const events = [];
        const entries = a.filter(r => r && typeof r.comment === 'string' && r.comment.trim());
        const openings = new Map();
        const kinds = {};
        let maxSilence = 0, silence = 0, exactRepeat = 0, repeatedOpenings = 0, tooLong = 0, malformed = 0, narration = 0;
        const maxWords = Number.isFinite(o.maxWords) ? o.maxWords : 65;
        a.forEach((r, i) => {
            const text = r && r.comment;
            if (!text) { silence++; maxSilence = Math.max(maxSilence, silence); return; }
            silence = 0;
            const normalized = clean(text);
            const op = opening(text);
            const previous = a.slice(Math.max(0, i - 4), i).filter(x => x && x.comment);
            if (previous.some(x => clean(x.comment) === normalized)) {
                exactRepeat++;
                events.push({ ply: r.ply, code: 'repeat', sample: text.slice(0, 120) });
            }
            if (previous.slice(-2).some(x => opening(x.comment) === op)) {
                repeatedOpenings++;
                events.push({ ply: r.ply, code: 'opening', sample: op });
            }
            const words = text.trim().split(/\s+/).length;
            if (words > maxWords) { tooLong++; events.push({ ply: r.ply, code: 'length', words }); }
            if (/(?:^|\s)(?:de el|a el|de la el)\b/i.test(text) || /([.!?])\1{2,}/.test(text)) {
                malformed++; events.push({ ply: r.ply, code: 'grammar', sample: text.slice(0, 120) });
            }
            if (r.narrative) narration++;
            kinds[r.kind || 'unknown'] = (kinds[r.kind || 'unknown'] || 0) + 1;
            openings.set(op, (openings.get(op) || 0) + 1);
        });
        const n = a.length;
        return {
            plies: n, commented: entries.length,
            coverage: n ? entries.length / n : 0,
            distinct: new Set(entries.map(r => clean(r.comment))).size,
            exactRepeat, repeatedOpenings, tooLong, malformed, maxSilence,
            narrativeLinks: narration, kinds,
            commonOpenings: [...openings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
            events: events.slice(0, LIMIT)
        };
    }
    return { VERSION: 1, opening, preferVariety, audit };
});
