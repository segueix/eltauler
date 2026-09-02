const Core = require('../core.js');
const { Chess } = require('chess.js');

// ---------------------------------------------------------------------------
// Sons de partida: la classificació de QUÈ ha de sonar viu a core.js
// (soundKindForMove, resultSoundKind, clockWarningLevel); sons.js només
// sintetitza. Aquí es prova la classificació amb jugades REALS de chess.js
// (mateixa versió que carrega el navegador) i les regles de l'avís de temps.
// ---------------------------------------------------------------------------

function playSan(sans) {
    const chess = new Chess();
    let last = null;
    sans.forEach(san => { last = chess.move(san, { sloppy: true }); });
    return { chess, last };
}

function kindAfter(sans) {
    const { chess, last } = playSan(sans);
    return Core.soundKindForMove(last, { inCheck: chess.in_check(), gameOver: chess.game_over() });
}

describe('soundKindForMove', () => {
    test('jugada normal', () => {
        expect(kindAfter(['e4'])).toBe('move');
        expect(kindAfter(['e4', 'e5', 'Nf3'])).toBe('move');
    });

    test('captura (també al pas)', () => {
        expect(kindAfter(['e4', 'd5', 'exd5'])).toBe('capture');
        expect(kindAfter(['e4', 'a6', 'e5', 'd5', 'exd6'])).toBe('capture');
    });

    test('enroc curt i llarg', () => {
        expect(kindAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])).toBe('castle');
        expect(kindAfter(['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7', 'O-O-O'])).toBe('castle');
    });

    test('escac mana sobre captura i enroc', () => {
        // Escac senzill
        expect(kindAfter(['e4', 'f5', 'Qh5+'])).toBe('check');
        // Captura amb escac (l'alfil pren a f7 i el rei el pot recapturar: no és mat)
        expect(kindAfter(['e4', 'e5', 'Bc4', 'Bc5', 'Bxf7+'])).toBe('check');
    });

    test('coronació (amb i sense captura)', () => {
        const { chess, last } = (() => {
            const c = new Chess('8/P7/8/8/8/8/7k/K7 w - - 0 1');
            return { chess: c, last: c.move('a8=Q') };
        })();
        expect(Core.soundKindForMove(last, { inCheck: chess.in_check(), gameOver: chess.game_over() })).toBe('promote');
        const c2 = new Chess('1n6/P7/8/8/8/8/7k/K7 w - - 0 1');
        const m2 = c2.move('axb8=R');
        expect(Core.soundKindForMove(m2, { inCheck: c2.in_check(), gameOver: c2.game_over() })).toBe('promote');
    });

    test('la jugada que acaba la partida no té so propi (sona el resultat)', () => {
        // Mat del pastor
        expect(kindAfter(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])).toBeNull();
    });

    test('entrades invàlides', () => {
        expect(Core.soundKindForMove(null)).toBeNull();
        expect(Core.soundKindForMove(undefined, {})).toBeNull();
        expect(Core.soundKindForMove('e4')).toBeNull();
        // Sense estat: jugada normal
        expect(Core.soundKindForMove({ san: 'e4', flags: 'b' })).toBe('move');
    });
});

describe('resultSoundKind', () => {
    test('victòria, derrota i taules', () => {
        expect(Core.resultSoundKind('win')).toBe('gameover_win');
        expect(Core.resultSoundKind('loss')).toBe('gameover_loss');
        expect(Core.resultSoundKind('draw')).toBe('gameover_draw');
        expect(Core.resultSoundKind(undefined)).toBe('gameover_draw');
    });

    test('tots els tipus de so són coneguts', () => {
        ['move', 'capture', 'castle', 'check', 'promote', 'gameover_win', 'gameover_loss',
            'gameover_draw', 'lowtime', 'lowtime2', 'success', 'fail'].forEach(k => {
            expect(Core.SOUND_KINDS).toContain(k);
        });
    });
});

describe('clockWarningLevel', () => {
    test('res per sobre de la zona baixa, 1 en entrar-hi, 2 als últims segons', () => {
        expect(Core.clockWarningLevel(60000, 20000)).toBe(0);
        expect(Core.clockWarningLevel(20000, 20000)).toBe(1);
        expect(Core.clockWarningLevel(12000, 20000)).toBe(1);
        expect(Core.clockWarningLevel(5000, 20000)).toBe(2);
        expect(Core.clockWarningLevel(900, 20000)).toBe(2);
    });

    test('al bullet la zona crítica és la meitat de la zona baixa (mai més de 5 s)', () => {
        // Bullet 30 s: zona baixa de 6 s → crítica a 3 s
        expect(Core.clockWarningLevel(5000, 6000)).toBe(1);
        expect(Core.clockWarningLevel(3000, 6000)).toBe(2);
        // Bullet 1+0: zona baixa de 12 s → crítica a 5 s
        expect(Core.clockWarningLevel(7000, 12000)).toBe(1);
        expect(Core.clockWarningLevel(5000, 12000)).toBe(2);
    });

    test('amb el rellotge a zero (bandera) o dades corruptes no avisa', () => {
        expect(Core.clockWarningLevel(0, 20000)).toBe(0);
        expect(Core.clockWarningLevel(-100, 20000)).toBe(0);
        expect(Core.clockWarningLevel(NaN, 20000)).toBe(0);
        expect(Core.clockWarningLevel(1000, 0)).toBe(0);
        expect(Core.clockWarningLevel(1000, 'x')).toBe(0);
    });

    test('els nivells són monòtons quan el temps baixa', () => {
        let prev = 0;
        for (let ms = 30000; ms >= 1; ms -= 250) {
            const level = Core.clockWarningLevel(ms, 20000);
            expect(level).toBeGreaterThanOrEqual(prev);
            prev = level;
        }
    });
});
