/* Retransmissió de jugades fetes: cap cerca addicional ni suggeriment en viu. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ElTaulerGameBroadcast = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const names = { p: 'el peó', n: 'el cavall', b: "l’alfil", r: 'la torre', q: 'la dama', k: 'el rei' };
    function preferences(raw) {
        const p = raw || {};
        return { enabled: p.enabled === true, frequency: p.frequency === 'key' ? 'key' : 'all',
            volume: Number.isFinite(p.volume) ? Math.max(0, Math.min(1, p.volume)) : 0.8 };
    }
    function trainingAllowed(s) {
        return !!s && !s.exercise && !s.calibration && !s.timedCalibration
            && ['free', 'positional', 'antidote', 'besso', 'explorer', 'phase_replay'].includes(s.mode);
    }
    function comment(Chess, TV, input) {
        const c = input || {};
        let chess, move;
        try {
            chess = new Chess(c.fenBefore);
            move = chess.move(c.move, { sloppy: true });
        } catch (e) { return null; }
        if (!move || (c.fenAfter && chess.fen() !== c.fenAfter)) return null;
        const color = move.color === 'w' ? 'Blanques' : 'Negres';
        let text;
        if (move.flags.includes('k')) text = color + ': enroc curt.';
        else if (move.flags.includes('q')) text = color + ': enroc llarg.';
        else {
            text = color + ': ' + names[move.piece] + ' de ' + move.from;
            text += move.captured ? ' captura ' + names[move.captured] + ' a ' + move.to : ' va a ' + move.to;
            if (move.flags.includes('e')) text += ', al pas';
            if (move.promotion) text += ' i es converteix en ' + names[move.promotion];
            text += '.';
        }
        const end = TV.tvGameEnd(c.chess || chess, Number.MAX_SAFE_INTEGER);
        const key = !!(move.captured || move.promotion || /[+#]/.test(move.san) || /[kq]/.test(move.flags) || end);
        let detail = '', important = key;
        // En entrenament expliquem només la tàctica que el jugador JA ha fet.
        // La jugada del rival s’anuncia sense destapar amenaces ni respostes.
        if (c.scope === 'history' || move.color === c.playerColor) {
            const candidates = TV.tvCommentCandidates({ ChessCtor: Chess, fenBefore: c.fenBefore,
                fenAfter: chess.fen(), move, end, tier: 'mid', ply: c.ply || 0 });
            const tactical = candidates.filter(x => ['fork', 'fork-check', 'pin', 'skewer', 'discovered-attack', 'remove-defender'].includes(x.kind))
                .sort((a, b) => b.priority - a.priority)[0];
            if (tactical) { detail = tactical.text; important = true; }
            const review = (c.scope === 'history' ? c.reviews || [] : []).find(r => r.fen === c.fenBefore && r.playerMove === move.from + move.to + (move.promotion || ''));
            const quality = review && { blunder: 'L’anàlisi desada marca aquesta jugada com un error greu.',
                mistake: 'L’anàlisi desada marca aquesta jugada com un error.',
                inaccuracy: 'L’anàlisi desada marca aquesta jugada com una imprecisió.' }[review.quality];
            if (quality) { detail = quality + (detail ? ' ' + detail : ''); important = true; }
        }
        if (!detail && /[kq]/.test(move.flags)) detail = 'El rei i la torre es mouen en una sola jugada.';
        if (!detail && move.flags.includes('e')) detail = 'La captura al pas retira el peó que acabava d’avançar dues caselles.';
        const tail = c.chess ? c.chess.history({ verbose: true }).slice(-2) : [];
        const previous = tail.length === 2 ? tail[0] : null;
        if (!detail && move.captured && previous && previous.captured && previous.to === move.to) detail = 'Recaptura: respon a la captura anterior.';
        if (end) detail = end.text;
        else if (chess.in_check()) text += ' Escac.';
        if (detail) text += ' ' + detail;
        return { text, speech: TV.tvSpeechText(text), important };
    }
    // Una sola locució; parar resol també l'espera del reproductor encara que
    // el servei remot trigui a respondre. Cap callback antic pot reprendre'l.
    function createNarrator(voice) {
        let pending = null;
        function stop() {
            if (!pending) return;
            const old = pending;
            pending = null;
            old.resolve({ spoken: false, reason: 'stopped' });
            voice.stop();
        }
        return {
            stop,
            busy: () => !!pending,
            speak(text, options) {
                stop();
                return new Promise(resolve => {
                    const job = { resolve };
                    pending = job;
                    const finish = result => {
                        if (pending !== job) return;
                        pending = null;
                        resolve(result);
                    };
                    try { Promise.resolve(voice.speak(text, options)).then(finish, () => finish({ spoken: false, reason: 'error' })); }
                    catch (e) { finish({ spoken: false, reason: 'error' }); }
                });
            }
        };
    }
    return { preferences, trainingAllowed, comment, createNarrator };
});
