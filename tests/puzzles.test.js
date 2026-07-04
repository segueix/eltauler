const Core = require('../core.js');
const { Chess } = require('chess.js');
const H = Core.createHieroglyphicMotifHelpers(Chess);

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

// ── Classificador de FINAL TÀCTIC ───────────────────────────────────────────
describe('classifyPuzzleFinalMotif — motius de final', () => {
    test('1) puzzle que acaba en mat → mate (i puzzleMeetsCriteria l’aprova)', () => {
        const info = H.classifyPuzzleFinalMotif('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8']);
        expect(info.motif).toBe('mate');
        expect(info.motifs).toContain('mate');
        expect(info.motifs).toContain('check');
        expect(info.isMate).toBe(true);
        expect(info.confidence).toBe('high');
        // Un puzzle de 3 jugades que acaba en mat i porta finalMotif=mate s’aprova.
        const p = samplePuzzle({ endsInMate: true, bestMoveMargin: Infinity, finalEval: undefined, theme: ['mate'], finalMotif: 'mate', finalMotifConfidence: 'high' });
        expect(Core.hieroglyphicMeetsFinalMotifCriteria(p)).toBe(true);
    });

    test('2) escac sense avantatge → check, però NO s’aprova sense qualitat', () => {
        const info = H.classifyPuzzleFinalMotif('4k3/8/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8']);
        expect(info.motif).toBe('check');
        expect(info.isCheck).toBe(true);
        expect(info.confidence).toBe('low');
        // Amb confiança baixa no es pot aprovar.
        const p = samplePuzzle({ endsInMate: false, bestMoveMargin: 40, finalEval: 120, finalMotif: 'check', finalMotifConfidence: 'low' });
        expect(Core.hieroglyphicMeetsFinalMotifCriteria(p)).toBe(false);
    });

    test('2b) escac amb avantatge decisiu → check de confiança mitjana', () => {
        const info = H.classifyPuzzleFinalMotif('4k3/8/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'], { finalEval: 700, marginOk: true });
        expect(info.motif).toBe('check');
        expect(info.confidence).toBe('medium');
    });

    test('3) forquilla real rei + dama → fork amb confiança high', () => {
        const info = H.classifyPuzzleFinalMotif('6k1/8/2q5/3N4/8/8/8/6K1 w - - 0 1', ['d5e7']);
        expect(info.motif).toBe('fork');
        expect(info.confidence).toBe('high');
        const fork = H.detectRealForkAfterFinalMove('6k1/8/2q5/3N4/8/8/8/6K1 w - - 0 1', 'd5e7');
        expect(fork.targets).toEqual(expect.arrayContaining(['king', 'queen']));
        expect(fork.piece).toBe('knight');
        expect(fork.square).toBe('e7');
    });

    test('4) falsa forquilla (només ataca peons) → no retorna fork', () => {
        // El cavall a f6 “ataca” dues caselles amb peons: no compta com a forquilla.
        expect(H.detectRealForkAfterFinalMove('6k1/5p2/8/3N4/8/8/8/6K1 w - - 0 1', 'd5f6')).toBeNull();
    });

    test('4b) falsa forquilla: la peça penja a un peó i no dona escac → no fork', () => {
        // Nb3 forquilla les dues torres, però pot ser capturat de franc pel peó
        // c2 sense donar escac: no és una imatge tàctica neta.
        expect(H.detectRealForkAfterFinalMove('6k1/8/8/8/3n4/8/2P5/R1R1K3 b - - 0 1', 'd4b3')).toBeNull();
        // Sense el peó defensor, la mateixa forquilla de dues torres SÍ que val.
        const real = H.detectRealForkAfterFinalMove('6k1/8/8/8/3n4/8/8/R1R1K3 b - - 0 1', 'd4b3');
        expect(real && real.motif).toBe('fork');
        expect(real.confidence).toBe('high');
    });

    test('5) sense cap final permès (posició tranquil·la) → none / rejected', () => {
        const info = H.classifyPuzzleFinalMotif('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', ['e2e3']);
        expect(info.motif).toBe('none');
        const p = samplePuzzle({ finalMotif: 'none' });
        expect(Core.hieroglyphicMeetsFinalMotifCriteria(p)).toBe(false);
    });

    test('6) promoció → promotion', () => {
        const info = H.classifyPuzzleFinalMotif('8/4P1k1/8/8/8/8/8/6K1 w - - 0 1', ['e7e8q']);
        expect(info.motifs).toContain('promotion');
        expect(H.detectPromotionMotif('8/4P1k1/8/8/8/8/8/6K1 w - - 0 1', ['e7e8q']).motif).toBe('promotion');
    });

    test('7) guany de dama o torre → major_win', () => {
        const info = H.detectMajorWinMotif('r5k1/8/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8']);
        expect(info.motif).toBe('major_win');
        expect(info.captured).toBe(true);
        expect(info.confidence).toBe('high');
    });

    test('clavada absoluta al rei → pin high', () => {
        const info = H.detectPinAfterFinalMove('4k3/8/8/4n3/8/8/8/R5K1 w - - 0 1', 'a1e1');
        expect(info.motif).toBe('pin');
        expect(info.against.piece).toBe('king');
        expect(info.confidence).toBe('high');
    });

    test('descoberta (escac descobert) → discovery high', () => {
        const info = H.detectDiscoveryAfterFinalMove('8/6k1/8/8/3N4/8/8/B3K3 w - - 0 1', 'd4c6');
        expect(info.motif).toBe('discovery');
        expect(info.isCheck).toBe(true);
        expect(info.confidence).toBe('high');
    });
});

describe('filtre per preferència de final', () => {
    test('9) si l’usuari tria fork, un puzzle amb finalMotif check NO passa', () => {
        const p = samplePuzzle({ finalMotif: 'check', finalMotifConfidence: 'medium', finalEval: 700 });
        expect(Core.puzzleMeetsCriteria(p, { requiredFinalMotifs: ['fork'] })).toBe(false);
        expect(Core.puzzleMeetsCriteria(p, { requiredFinalMotifs: ['check'] })).toBe(true);
    });
    test('9b) any accepta qualsevol motiu permès', () => {
        const fork = samplePuzzle({ finalMotif: 'fork', finalMotifConfidence: 'high' });
        const mate = samplePuzzle({ endsInMate: true, bestMoveMargin: Infinity, finalMotif: 'mate', finalMotifConfidence: 'high' });
        expect(Core.hieroglyphicMeetsFinalMotifCriteria(fork, { requiredFinalMotifs: Core.HIERO_ALLOWED_FINAL_MOTIFS })).toBe(true);
        expect(Core.hieroglyphicMeetsFinalMotifCriteria(mate, { requiredFinalMotifs: Core.HIERO_ALLOWED_FINAL_MOTIFS })).toBe(true);
    });
});

describe('8) variant legal des d’una FEN real', () => {
    test('metadades d’origen: game_variant, conserva sourceGameId i sourceFen', () => {
        const entry = { id: 'game_42', pgn: '1. e4 e5', moves: ['e4', 'e5'] };
        const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
        const meta = Core.hieroglyphicVariantMeta(entry, fen, 12);
        expect(meta.origin).toBe('game_variant');
        expect(meta.sourceGameId).toBe('game_42');
        expect(meta.sourceFen).toBe(fen);
        expect(meta.sourceMoveNumber).toBe(12);
        expect(meta.adaptationNote).toMatch(/variant legal/i);
        // No modifica la partida original.
        expect(entry.moves).toEqual(['e4', 'e5']);
        expect(entry.pgn).toBe('1. e4 e5');
    });
});

describe('etiquetes i acceptació de motius', () => {
    test('totes les etiquetes són en català i cobreixen els motius permesos', () => {
        Core.HIERO_ALLOWED_FINAL_MOTIFS.forEach(m => {
            expect(typeof Core.HIERO_FINAL_MOTIF_LABELS[m]).toBe('string');
            expect(Core.HIERO_FINAL_MOTIF_LABELS[m].length).toBeGreaterThan(0);
        });
        expect(Core.HIERO_FINAL_MOTIF_LABELS.mate).toBe('escac i mat');
        expect(Core.HIERO_FINAL_MOTIF_LABELS.fork).toBe('forquilla');
    });
});
