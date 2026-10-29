// Marcador de la rivalitat Stockfish–Lozza al dispositiu de l'espectador.
// No comparteix dades amb altres espectadors ni accepta diners/apostes reals.
(function(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ElTaulerTvLeagueUI = api;
})(typeof self !== 'undefined' ? self : this, function(root) {
    'use strict';
    function model() {
        if (root && root.ElTaulerTvLeague) return root.ElTaulerTvLeague;
        try { return require('./tvleague'); } catch (_) { return null; }
    }
    const labels = { stockfish: 'Stockfish', lozza: 'Lozza', draw: 'Taules' };
    let ledger = null, sig = null, pageId = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1e9));
    let seenGame = null, currentPick = null, lastAnimated = null, bound = false;
    function read(m) {
        if (ledger) return ledger;
        try { ledger = m.normalize(JSON.parse(root.localStorage.getItem(m.KEY) || 'null')); }
        catch (_) { ledger = m.normalize(null); }
        return ledger;
    }
    function persist(m) {
        try { root.localStorage.setItem(m.KEY, JSON.stringify(m.normalize(ledger))); }
        catch (_) {}
    }
    function text(id, value) {
        const e = root.document.getElementById(id);
        if (e) e.textContent = value;
    }
    function attach() {
        if (bound || !root.document) return;
        const box = root.document.getElementById('sftv-predict');
        if (!box) return;
        bound = true;
        box.addEventListener('click', ev => {
            const b = ev.target && ev.target.closest ? ev.target.closest('button[data-predict]') : null;
            const m = model();
            if (!b || !m || !sig) return;
            const choice = b.getAttribute('data-predict');
            if (!m.CHOICES.includes(choice)) return;
            const old = m.stats(read(m), sig).pending;
            ledger = m.predict(ledger, sig, choice === old ? null : choice);
            persist(m);
            const tv = root.ElTaulerStockfishTV;
            if (tv && tv._controller && tv._controller()) update(tv._controller().state());
        });
    }
    function update(state) {
        const m = model(), document = root.document;
        if (!m || !document || !state) return;
        attach();
        const panel = document.getElementById('sftv-league');
        if (!panel) return;
        const tv = root.ElTaulerStockfishTV;
        // La versió real del motor prové de la resposta UCI, no del selector:
        // si Stockfish 19 cau al motor de reserva, el marcador reflecteix el real.
        const baseSig = state.caps && tv && typeof tv.tvCapsSignature === 'function'
            ? tv.tvCapsSignature(state.caps) : null;
        const engineName = state.caps ? String(state.caps.engineName || 'Stockfish desconegut').slice(0, 55) : '';
        const signature = baseSig ? (baseSig + '@' + engineName).slice(0, 80) : null;
        const duel = !!(state.game && state.game.matchPlan && !state.duelWarning && signature);
        panel.hidden = !signature || !!state.duelWarning;
        if (!signature) return;
        if (sig !== signature) { sig = signature; seenGame = null; currentPick = null; }
        read(m);
        // Els 8 resultats antics no identifiquen amb certesa la versió UCI.
        // Es conserven al resum existent de la TV, sense barrejar-los amb el
        // campionat històric nou que registra cada motor real per separat.
        if (duel && seenGame !== state.game.id) {
            seenGame = state.game.id;
            const claim = m.claim(ledger, sig);
            ledger = claim.state;
            currentPick = claim.choice;
            persist(m);
        }
        const game = state.game;
        const gameId = game ? pageId + '-' + String(game.id) : null;
        if (duel && game.end && game.recorded && !game.hadManualControl) {
            const before = m.stats(ledger, sig).total;
            const winner = game.end.result === '1-0' ? game.engines.w
                : game.end.result === '0-1' ? game.engines.b : 'draw';
            ledger = m.record(ledger, sig, { id: gameId, winner, prediction: currentPick });
            const after = m.stats(ledger, sig).total;
            if (after !== before) {
                persist(m);
                if (lastAnimated !== gameId) {
                    lastAnimated = gameId;
                    panel.classList.remove('sftv-league-celebrate');
                    void panel.offsetWidth;
                    panel.classList.add('sftv-league-celebrate');
                }
            }
        }
        const s = m.stats(ledger, sig);
        text('sftv-league-sf', s.wins.stockfish);
        text('sftv-league-lozza', s.wins.lozza);
        text('sftv-league-draw', s.wins.draw);
        const lastRecorded = duel && game.end && game.recorded && !game.hadManualControl;
        text('sftv-league-round', 'Duel ' + (lastRecorded ? s.total : s.total + 1));
        const leader = s.wins.stockfish === s.wins.lozza ? 'Marcador igualat.'
            : (s.wins.stockfish > s.wins.lozza ? 'Stockfish' : 'Lozza')
                + ' encapçala la rivalitat amb ' + Math.abs(s.wins.stockfish - s.wins.lozza) + ' victòries d’avantatge.';
        const streak = s.streak.count > 1 ? ' Ratxa de ' + s.streak.count
            + ' victòries de ' + labels[s.streak.winner] + '.' : '';
        text('sftv-league-story', leader + streak + ' Falten ' + s.remaining
            + ' duels per arribar a ' + s.nextMilestone + '.');
        text('sftv-league-recent', s.last.length ? s.last.map(w => w === 'stockfish' ? 'S' : w === 'lozza' ? 'L' : '½').join('  ') : '—');
        text('sftv-league-recent-note', 'Últimes ' + s.last.length + ': S ' + s.lastWins.stockfish
            + ' · L ' + s.lastWins.lozza + ' · taules ' + s.lastWins.draw);
        text('sftv-league-forecast', s.forecasts.total
            ? s.forecasts.correct + ' de ' + s.forecasts.total + ' pronòstics encertats'
            : 'Encara no hi ha pronòstics resolts');
        text('sftv-league-feedback', lastRecorded && s.lastForecast
            ? 'Últim pronòstic: ' + labels[s.lastForecast.choice]
                + (s.lastForecast.correct ? ' · encertat!' : ' · aquesta vegada no.')
            : currentPick && game && !game.end
                ? 'Pronòstic d’aquesta partida: ' + labels[currentPick] + '.'
                : 'Tria qui creus que guanyarà el proper duel.');
        text('sftv-league-next', game && game.end
            ? 'A continuació: duel ' + (s.total + 1) + '. Qui trencarà la ratxa?'
            : 'Pronostica el duel següent, abans que comenci.');
        const votes = document.getElementById('sftv-predict');
        if (votes) votes.querySelectorAll('button[data-predict]').forEach(b => {
            const active = b.getAttribute('data-predict') === s.pending;
            b.classList.toggle('is-picked', active);
            b.setAttribute('aria-pressed', String(active));
            b.disabled = !duel;
        });
    }
    return { update, attach };
});
