// Campionat local de Stockfish contra Lozza. Sense apostes reals ni prediccions probabilístiques.
// Només partides automàtiques completes. Separació per signatura de motor i força.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ElTaulerTvLeague = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const KEY = 'eltauler_tv_league_v1';
    const CHOICES = ['stockfish', 'lozza', 'draw'];
    const valid = x => CHOICES.includes(x);
    const nonnegative = x => Number.isSafeInteger(x) && x >= 0 ? x : 0;
    const tally = x => ({ stockfish: nonnegative(x && x.stockfish),
        lozza: nonnegative(x && x.lozza), draw: nonnegative(x && x.draw) });
    function blank() {
        return { wins: tally(), total: 0, recent: [], seen: [], streak: { winner: null, count: 0 },
            best: { stockfish: 0, lozza: 0 }, forecasts: { correct: 0, total: 0 },
            pending: null, lastForecast: null };
    }
    function normalize(raw) {
        const out = { version: 1, tables: {} };
        if (!raw || typeof raw !== 'object' || !raw.tables || typeof raw.tables !== 'object') return out;
        Object.keys(raw.tables).slice(0, 30).forEach(sig => {
            if (!sig || sig.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(sig)) return;
            const src = raw.tables[sig];
            if (!src || typeof src !== 'object') return;
            const t = blank();
            t.wins = tally(src.wins);
            t.total = t.wins.stockfish + t.wins.lozza + t.wins.draw;
            t.recent = (Array.isArray(src.recent) ? src.recent : []).filter(valid).slice(-24);
            t.seen = (Array.isArray(src.seen) ? src.seen : []).filter(x => typeof x === 'string' && x.length <= 90).slice(-100);
            t.streak = src.streak && valid(src.streak.winner) && src.streak.winner !== 'draw'
                ? { winner: src.streak.winner, count: nonnegative(src.streak.count) } : { winner: null, count: 0 };
            t.best = { stockfish: nonnegative(src.best && src.best.stockfish),
                lozza: nonnegative(src.best && src.best.lozza) };
            t.forecasts = { correct: nonnegative(src.forecasts && src.forecasts.correct),
                total: nonnegative(src.forecasts && src.forecasts.total) };
            if (t.forecasts.correct > t.forecasts.total) t.forecasts.correct = t.forecasts.total;
            t.pending = valid(src.pending) ? src.pending : null;
            t.lastForecast = src.lastForecast && valid(src.lastForecast.choice) && valid(src.lastForecast.winner)
                ? { choice: src.lastForecast.choice, winner: src.lastForecast.winner,
                    correct: src.lastForecast.choice === src.lastForecast.winner } : null;
            Object.defineProperty(out.tables, sig, { value: t, configurable: true, enumerable: true, writable: true });
        });
        return out;
    }
    function table(state, sig) {
        if (!state.tables[sig]) Object.defineProperty(state.tables, sig, {
            value: blank(), enumerable: true, configurable: true, writable: true
        });
        return state.tables[sig];
    }
    function fromRecent(state, sig, recent) {
        const s = normalize(state), t = table(s, sig);
        if (t.total || !Array.isArray(recent)) return s;
        recent.filter(x => x && x.sig === sig && valid(x.winner)).slice(-8).forEach((x, i) => {
            record(s, sig, { id: 'importat-' + i, winner: x.winner });
        });
        return s;
    }
    function predict(state, sig, choice) {
        const s = normalize(state);
        if (choice !== null && !valid(choice)) return s;
        table(s, sig).pending = choice;
        return s;
    }
    function claim(state, sig) {
        const s = normalize(state), t = table(s, sig);
        const choice = t.pending;
        t.pending = null;
        return { state: s, choice: choice };
    }
    function record(state, sig, game) {
        const s = state;
        if (!game || !valid(game.winner) || typeof game.id !== 'string' || !game.id
            || game.id.length > 90 || !sig) return s;
        const t = table(s, sig);
        if (t.seen.includes(game.id)) return s;
        t.seen.push(game.id);
        t.seen = t.seen.slice(-100);
        t.wins[game.winner]++;
        t.total++;
        t.recent.push(game.winner);
        t.recent = t.recent.slice(-24);
        if (game.winner === 'draw') t.streak = { winner: null, count: 0 };
        else {
            t.streak = { winner: game.winner,
                count: t.streak.winner === game.winner ? t.streak.count + 1 : 1 };
            t.best[game.winner] = Math.max(t.best[game.winner], t.streak.count);
        }
        if (valid(game.prediction)) {
            t.forecasts.total++;
            if (game.prediction === game.winner) t.forecasts.correct++;
            t.lastForecast = { choice: game.prediction, winner: game.winner,
                correct: game.prediction === game.winner };
        } else t.lastForecast = null;
        return s;
    }
    function stats(state, sig) {
        const t = table(normalize(state), sig);
        const last = t.recent.slice(-10);
        const recent = tally();
        last.forEach(x => recent[x]++);
        const nextMilestone = (Math.floor(t.total / 10) + 1) * 10;
        return { total: t.total, wins: t.wins, last: last, lastWins: recent,
            streak: t.streak, best: t.best, forecasts: t.forecasts,
            pending: t.pending, lastForecast: t.lastForecast,
            nextMilestone: nextMilestone, remaining: nextMilestone - t.total };
    }
    return { KEY, CHOICES, normalize, fromRecent, predict, claim, record, stats };
});
