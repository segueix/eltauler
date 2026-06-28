const Core = require('../core.js');

// Puzzle d'exemple: 3 jugades del jugador amb 2 respostes del rival entremig.
function samplePuzzle(overrides = {}) {
    return Object.assign({
        fen: 'r4rk1/ppp2ppp/8/2b5/2Bn1Q2/2N5/PPP2PPP/R3R1K1 w - - 0 1',
        solutionUci: ['f4d4', 'c5d4', 'c4f7'],          // 3 jugades de l'usuari
        engineRepliesUci: ['c5d4', 'g8h8'],             // 2 respostes del rival
        theme: ['fork'],
        endsInMate: false,
        bestMoveMargin: 320,
        finalEval: 650,
        firstMoveIsCapture: true,
        firstMoveIsCheck: false,
        firstMoveQuiet: false
    }, overrides);
}

describe('validació de la solució (3 jugades)', () => {
    test('una solució de 3 jugades es valida correctament', () => {
        const p = samplePuzzle();
        let st = Core.puzzleInitPlay(p);
        st = Core.puzzleSubmitMove(st, 'f4d4');
        expect(st.result).toBe('correct');
        expect(st.solved).toBe(false);
        st = Core.puzzleSubmitMove(st, 'c5d4');
        expect(st.result).toBe('correct');
        st = Core.puzzleSubmitMove(st, 'c4f7');
        expect(st.result).toBe('solved');
        expect(st.solved).toBe(true);
    });

    test('una jugada incorrecta NO avança el puzzle', () => {
        const p = samplePuzzle();
        let st = Core.puzzleInitPlay(p);
        const before = st.step;
        st = Core.puzzleSubmitMove(st, 'a2a3'); // jugada qualsevol incorrecta
        expect(st.result).toBe('incorrect');
        expect(st.step).toBe(before); // segueix al mateix pas
        expect(st.solved).toBe(false);
    });

    test("la resposta automàtica del rival s'executa entre passos", () => {
        const p = samplePuzzle();
        let st = Core.puzzleInitPlay(p);
        st = Core.puzzleSubmitMove(st, 'f4d4');
        expect(st.reply).toBe('c5d4'); // 1a resposta del rival
        st = Core.puzzleSubmitMove(st, 'c5d4');
        expect(st.reply).toBe('g8h8'); // 2a resposta del rival
        st = Core.puzzleSubmitMove(st, 'c4f7');
        expect(st.reply).toBeNull(); // l'última jugada no té resposta
    });
});

describe('criteris d\'acceptació', () => {
    test('accepta un puzzle amb marge i final clars', () => {
        expect(Core.puzzleMeetsCriteria(samplePuzzle())).toBe(true);
    });

    test('NO accepta un puzzle sense avantatge clar (marge petit i final fluix)', () => {
        const p = samplePuzzle({ bestMoveMargin: 40, finalEval: 120, endsInMate: false });
        expect(Core.puzzleMeetsCriteria(p)).toBe(false);
    });

    test('accepta el mat encara que el marge no sigui de cp', () => {
        const p = samplePuzzle({ endsInMate: true, bestMoveMargin: Infinity, finalEval: undefined, theme: ['mate'] });
        expect(Core.puzzleMeetsCriteria(p)).toBe(true);
    });

    test('NO accepta si no són exactament 3 jugades', () => {
        const p = samplePuzzle({ solutionUci: ['f4d4', 'c4f7'] });
        expect(Core.puzzleMeetsCriteria(p)).toBe(false);
    });
});

describe('duplicats per FEN', () => {
    test('no es creen duplicats per FEN (ignorant comptadors)', () => {
        const existing = [samplePuzzle()];
        const sameFenDistintComptadors = samplePuzzle().fen.replace(' 0 1', ' 4 12');
        expect(Core.puzzleIsDuplicateFen(existing, sameFenDistintComptadors)).toBe(true);
        const altra = '8/8/8/8/8/4K3/8/4k2R w - - 0 1';
        expect(Core.puzzleIsDuplicateFen(existing, altra)).toBe(false);
    });
});

describe('dificultat i explicació', () => {
    test('sacrifici → molt_dificil', () => {
        expect(Core.puzzleDifficulty(samplePuzzle({ theme: ['sacrifice'] }))).toBe('molt_dificil');
    });
    test('primera jugada silenciosa → dificil', () => {
        expect(Core.puzzleDifficulty(samplePuzzle({ firstMoveQuiet: true, firstMoveIsCapture: false }))).toBe('dificil');
    });
    test('rating creixent amb la dificultat', () => {
        const facil = Core.puzzleRatingEstimate(samplePuzzle({ theme: ['mate'], endsInMate: true, firstMoveIsCheck: true }));
        const dificil = Core.puzzleRatingEstimate(samplePuzzle({ theme: ['sacrifice'] }));
        expect(dificil).toBeGreaterThan(facil);
    });
    test('explicació no buida i adaptada al tema', () => {
        expect(Core.puzzleExplanation(samplePuzzle({ theme: ['mate'] }))).toMatch(/mat/i);
        expect(Core.puzzleExplanation(samplePuzzle({ theme: ['deflection'] }))).toMatch(/desvi/i);
    });
});
