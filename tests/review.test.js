const Core = require('../core.js');
const Redactor = require('../redactor.js');

// ---------------------------------------------------------------------------
// Validació forta de les errades de la ressenya (isRenderableReviewError)
// ---------------------------------------------------------------------------
// El validador rep un applyMove injectable (al navegador és chess.js via
// resolveMoveOnFen); als tests fem servir un doble que declara quines jugades
// són legals.
const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const legalMoves = new Set(['e2e4', 'd2d4', 'g1f3']);
const applyMove = (fen, move) => legalMoves.has(String(move).toLowerCase());

function errBase(extra) {
    return Object.assign({
        fen: FEN_INICIAL,
        moveNumber: 2,
        playerMove: 'e2e4',
        bestMove: 'd2d4'
    }, extra || {});
}

describe('isRenderableReviewError — validació forta', () => {
    test('accepta una errada coherent', () => {
        expect(Core.isRenderableReviewError(errBase(), { maxMoveNumber: 10, applyMove })).toBe(true);
    });

    test('una partida de 4 jugades no pot mostrar "Jugada 15"', () => {
        expect(Core.isRenderableReviewError(errBase({ moveNumber: 15 }), { maxMoveNumber: 4, applyMove })).toBe(false);
        expect(Core.isRenderableReviewError(errBase({ moveNumber: 4 }), { maxMoveNumber: 4, applyMove })).toBe(true);
    });

    test('sense FEN o amb FEN inservible no es mostra', () => {
        expect(Core.isRenderableReviewError(errBase({ fen: null }), { applyMove })).toBe(false);
        expect(Core.isRenderableReviewError(errBase({ fen: 'garbage' }), { applyMove })).toBe(false);
    });

    test('una jugada il·legal sobre la FEN no es mostra', () => {
        expect(Core.isRenderableReviewError(errBase({ playerMove: 'e2e5' }), { applyMove })).toBe(false);
        expect(Core.isRenderableReviewError(errBase({ bestMove: 'a1a8' }), { applyMove })).toBe(false);
    });

    test('si la jugada feta és la mateixa que la millor, no és cap error', () => {
        expect(Core.isRenderableReviewError(errBase({ bestMove: 'e2e4' }), { applyMove })).toBe(false);
        expect(Core.isRenderableReviewError(
            errBase({ playerMoveSan: 'Cf3', bestMoveSan: 'Cf3', playerMove: 'g1f3', bestMove: 'g1f3' }),
            { applyMove }
        )).toBe(false);
    });

    test('sense moveNumber no es mostra', () => {
        expect(Core.isRenderableReviewError(errBase({ moveNumber: null }), { applyMove })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Dedupe entre "Moments clau" i "Errades comentades" (reviewErrorKey)
// ---------------------------------------------------------------------------
describe('reviewErrorKey — cap errada repetida entre blocs', () => {
    test('la mateixa jugada té la mateixa clau vingui del moment o de la nota', () => {
        const review = { fen: FEN_INICIAL, moveNumber: 2, playerMove: 'e2e4' };
        const moment = { fen: FEN_INICIAL, moveNumber: 2, playedUci: 'e2e4', played: 'e4' };
        expect(Core.reviewErrorKey(review)).toBe(Core.reviewErrorKey(moment));
    });

    test('jugades diferents sobre la mateixa posició tenen claus diferents', () => {
        const a = { fen: FEN_INICIAL, moveNumber: 2, playerMove: 'e2e4' };
        const b = { fen: FEN_INICIAL, moveNumber: 2, playerMove: 'd2d4' };
        expect(Core.reviewErrorKey(a)).not.toBe(Core.reviewErrorKey(b));
    });

    test('un Set de claus filtra les repeticions', () => {
        const moments = [{ fen: FEN_INICIAL, playedUci: 'e2e4' }];
        const errors = [
            { fen: FEN_INICIAL, playerMove: 'e2e4' },
            { fen: FEN_INICIAL.replace(' w ', ' b '), playerMove: 'g8f6' }
        ];
        const seen = new Set(moments.map(Core.reviewErrorKey));
        const rest = errors.filter(e => !seen.has(Core.reviewErrorKey(e)));
        expect(rest).toHaveLength(1);
        expect(rest[0].playerMove).toBe('g8f6');
    });
});

// ---------------------------------------------------------------------------
// Color del jugador
// ---------------------------------------------------------------------------
describe('playerColorIntro', () => {
    test('amb negres ho diu explícitament', () => {
        expect(Core.playerColorIntro('b')).toBe('Has jugat amb negres. La revisió comenta les teves decisions.');
    });
    test('amb blanques (o color desconegut) diu blanques', () => {
        expect(Core.playerColorIntro('w')).toContain('blanques');
        expect(Core.playerColorIntro(undefined)).toContain('blanques');
    });
});

// ---------------------------------------------------------------------------
// Fases amb nombre de jugades i avís de poques dades
// ---------------------------------------------------------------------------
describe('formatPhaseLine', () => {
    test('inclou percentatge i nombre de jugades', () => {
        expect(Core.formatPhaseLine(70, 10)).toBe('correcció 70% en 10 jugades.');
    });
    test('amb poques jugades afegeix l\'avís', () => {
        expect(Core.formatPhaseLine(100, 2)).toBe('correcció 100% en 2 jugades. Poques dades; no en traiem conclusions fortes.');
        expect(Core.formatPhaseLine(50, 1)).toContain('Poques dades');
    });
    test('sense jugades no diu res', () => {
        expect(Core.formatPhaseLine(null, 0)).toBe('');
    });
    test('singular correcte amb 1 jugada', () => {
        expect(Core.formatPhaseLine(0, 1)).toContain('en 1 jugada.');
    });
});

// ---------------------------------------------------------------------------
// La lliçó d'avui i el pla de 10 minuts
// ---------------------------------------------------------------------------
describe('lessonOfTheDay', () => {
    test('cada família té la seva consigna', () => {
        expect(Core.lessonOfTheDay('material')).toBe('abans de capturar, compta atacants i defensors.');
        expect(Core.lessonOfTheDay('king_attack')).toContain('escacs solts');
        expect(Core.lessonOfTheDay('prophylaxis')).toContain('amenaça real');
        expect(Core.lessonOfTheDay('opening')).toContain('desenvolupa');
        expect(Core.lessonOfTheDay('endgame')).toContain('activa el rei');
    });
    test('un tema desconegut cau al consell general', () => {
        expect(Core.lessonOfTheDay('tema_inventat')).toBe('revisa escacs, captures i amenaces abans de decidir.');
    });
});

describe('buildTenMinutePlan', () => {
    test('sense errades: rejugar l\'obertura', () => {
        expect(Core.buildTenMinutePlan([])).toContain("rejuga l'obertura");
    });
    test('una errada: repetir la posició', () => {
        const t = Core.buildTenMinutePlan([9]);
        expect(t).toContain('jugada 9');
        expect(t).toContain('sense pista');
    });
    test('tres errades: ordre de repàs', () => {
        const t = Core.buildTenMinutePlan([19, 23, 9]);
        expect(t).toContain('primer la jugada 19');
        expect(t).toContain('després la 23');
        expect(t).toContain('la posició de la jugada 9');
    });
    test('cap text del pla acaba amb punts suspensius', () => {
        [[], [9], [19, 23], [19, 23, 9]].forEach(nums => {
            expect(Redactor.esTextIncomplet(Core.buildTenMinutePlan(nums))).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// Redactor — text inacabat i escurçament per frases senceres
// ---------------------------------------------------------------------------
describe('esTextIncomplet', () => {
    test('detecta punts suspensius finals', () => {
        expect(Redactor.esTextIncomplet('en lloc de…')).toBe(true);
        expect(Redactor.esTextIncomplet('i la dama...')).toBe(true);
        expect(Redactor.esTextIncomplet('el peó de la columna…')).toBe(true);
    });

    test('detecta connectors i determinants penjats', () => {
        expect(Redactor.esTextIncomplet('calia defensar i el')).toBe(true);
        expect(Redactor.esTextIncomplet('pressiona la columna')).toBe(true);
        expect(Redactor.esTextIncomplet('la millor era en lloc de')).toBe(true);
        expect(Redactor.esTextIncomplet('havies de jugar amb')).toBe(true);
    });

    test('respecta frases completes', () => {
        expect(Redactor.esTextIncomplet('Obre la columna.')).toBe(false);
        expect(Redactor.esTextIncomplet('Compta atacants i defensors abans de capturar.')).toBe(false);
        expect(Redactor.esTextIncomplet('Quina peça queda sense defensa?')).toBe(false);
    });

    test("l'auditoria descarta el text extern inacabat", () => {
        const audit = Redactor.auditarCatala('Calia jugar la torre a la columna oberta i el');
        expect(audit.ok).toBe(false);
        expect(audit.problemes.some(p => p.codi === 'text_inacabat')).toBe(true);
    });

    test("l'auditoria continua acceptant text complet correcte", () => {
        const audit = Redactor.auditarCatala('Has jugat una bona partida. Revisa els finals amb calma.');
        expect(audit.ok).toBe(true);
    });
});

describe('escurcaFrasesSenceres — mai talla amb "…"', () => {
    test('talla per frases senceres dins del límit', () => {
        const text = 'Primera frase curta. Segona frase una mica més llarga que tampoc no cal. Tercera.';
        expect(Redactor.escurcaFrasesSenceres(text, 8)).toBe('Primera frase curta.');
    });

    test('si la primera frase supera el límit, la retorna sencera', () => {
        const text = 'Una frase llarga amb força paraules que supera clarament el límit fixat pel test.';
        const out = Redactor.escurcaFrasesSenceres(text, 10);
        expect(out).toBe(text);
    });

    test('cap sortida acaba amb punts suspensius', () => {
        const casos = [
            'Frase única molt i molt llarga que sobrepassa el límit de paraules del comentari breu de l\'entrenador i continua i continua.',
            'Una. Dues. Tres. Quatre. Cinc. Sis. Set. Vuit.',
            'Text sense punt final però prou curt'
        ];
        casos.forEach(t => {
            [4, 8, 14, 18].forEach(max => {
                const out = Redactor.escurcaFrasesSenceres(t, max);
                expect(/(\.\.\.|…)$/.test(out)).toBe(false);
            });
        });
    });
});
