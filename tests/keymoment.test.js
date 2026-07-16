const Core = require('../core.js');

// Moment clau de la partida: puntuació i selecció (funcions pures). Totes les
// avaluacions en perspectiva de l'usuari (cp; mat = ±10000).

// Ajudant: crea un candidat amb valors per defecte raonables i sobreescriptura.
function cand(over) {
    return Object.assign({
        moveNumber: 10, ply: 19, playerColor: 'w', phase: 'middlegame',
        fenBefore: 'fen-' + Math.random().toString(36).slice(2),
        fenAfter: 'fenA', playedMoveUci: 'a2a3', playedMoveSan: 'a3',
        bestMoveUci: 'd2d4', bestMoveSan: 'd4', bestPv: ['d2d4'],
        evalBefore: 0, evalAfter: 0, cpLoss: 0, classification: 'mistake',
        legalCount: 25, depth: 16,
        alternatives: [{ uci: 'd2d4', eval: 0, evalType: 'cp' }, { uci: 'e2e4', eval: -300, evalType: 'cp' }],
        forcingInfo: null
    }, over || {});
}

describe('scoreKeyMomentCandidate + selectKeyMoment', () => {
    test('1. guanyadora → igualada se selecciona (lost_advantage)', () => {
        const c = cand({ moveNumber: 12, ply: 23, evalBefore: 320, evalAfter: 20, cpLoss: 300,
            alternatives: [{ uci: 'd2d4', eval: 320, evalType: 'cp' }, { uci: 'e2e4', eval: 40, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km).not.toBeNull();
        expect(km.reasonCode).toBe('lost_advantage');
        expect(km.fen).toBe(c.fenBefore);
    });

    test('2. igualada → perduda se selecciona (turned_losing)', () => {
        const c = cand({ moveNumber: 18, ply: 35, evalBefore: 20, evalAfter: -250, cpLoss: 270,
            alternatives: [{ uci: 'd2d4', eval: 20, evalType: 'cp' }, { uci: 'e2e4', eval: -200, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km.reasonCode).toBe('turned_losing');
        expect(km.evalBefore).toBe(20);
        expect(km.evalAfter).toBe(-250);
    });

    test('3. oportunitat tàctica no aprofitada (mat deixat escapar)', () => {
        const c = cand({ moveNumber: 22, ply: 43, evalBefore: 10000, evalAfter: 60, cpLoss: 9940,
            bestPv: ['d1h5', 'g6h5', 'f3g5'], forcingInfo: { isLineForced: true },
            alternatives: [{ uci: 'd1h5', eval: 10000, evalType: 'mate' }, { uci: 'e2e4', eval: 120, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km.reasonCode).toBe('missed_win');
        expect(km.score).toBeGreaterThan(30);
    });

    test('4. error en un final (endgame_turning_point)', () => {
        const c = cand({ phase: 'endgame', moveNumber: 44, ply: 87, evalBefore: 40, evalAfter: -400, cpLoss: 440,
            alternatives: [{ uci: 'd2d4', eval: 40, evalType: 'cp' }, { uci: 'e2e4', eval: -350, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km.reasonCode).toBe('endgame_turning_point');
    });

    test('5. penalitza una errada en una posició JA perduda (recompensa la recuperable)', () => {
        // Errada recuperable: igualada (+30) → -370, pèrdua 400.
        const recoverable = cand({ moveNumber: 15, ply: 29, evalBefore: 30, evalAfter: -370, cpLoss: 400,
            alternatives: [{ uci: 'd2d4', eval: 30, evalType: 'cp' }, { uci: 'e2e4', eval: -300, evalType: 'cp' }] });
        // Errada en posició ja perduda: -1000 → -1600, pèrdua 600.
        const alreadyLost = cand({ moveNumber: 30, ply: 59, evalBefore: -1000, evalAfter: -1600, cpLoss: 600,
            alternatives: [{ uci: 'd2d4', eval: -1000, evalType: 'cp' }, { uci: 'e2e4', eval: -1700, evalType: 'cp' }] });
        const sRec = Core.scoreKeyMomentCandidate(recoverable, {});
        const sLost = Core.scoreKeyMomentCandidate(alreadyLost, {});
        expect(sRec.score).toBeGreaterThan(sLost.score);
        const km = Core.selectKeyMoment([alreadyLost, recoverable], {});
        expect(km.fen).toBe(recoverable.fenBefore);
    });

    test('6. rebutja una partida sense cap moment prou rellevant (retorna null)', () => {
        const small = [
            cand({ moveNumber: 3, ply: 5, evalBefore: 20, evalAfter: 0, cpLoss: 20 }),   // obertura, diferència mínima
            cand({ moveNumber: 4, ply: 7, evalBefore: 10, evalAfter: -10, cpLoss: 20 })
        ];
        expect(Core.selectKeyMoment(small, {})).toBeNull();
    });

    test('7. només es consideren jugades de l\'usuari (les entrades ja ho són; candidats buits → null)', () => {
        expect(Core.selectKeyMoment([], {})).toBeNull();
        expect(Core.selectKeyMoment(null, {})).toBeNull();
    });

    test('8. perspectiva correcta amb NEGRES (avaluacions ja normalitzades a l\'usuari)', () => {
        // L'usuari juga amb negres; evalBefore/After ja són en la seva perspectiva.
        const c = cand({ playerColor: 'b', moveNumber: 20, ply: 39, evalBefore: 260, evalAfter: -30, cpLoss: 290,
            alternatives: [{ uci: 'd7d5', eval: 260, evalType: 'cp' }, { uci: 'e7e5', eval: 30, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km.playerColor).toBe('b');
        expect(km.orientation).toBe('black');
        expect(km.reasonCode).toBe('lost_advantage');
    });

    test('9. gestió d\'avaluacions de mat (mat en contra permès no domina indegudament)', () => {
        // Deixar que el rival tingui mat: evalAfter mate en contra (-10000).
        const c = cand({ moveNumber: 25, ply: 49, evalBefore: 50, evalAfter: -10000, cpLoss: 10050,
            alternatives: [{ uci: 'd2d4', eval: 50, evalType: 'cp' }, { uci: 'e2e4', eval: -500, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km).not.toBeNull();
        expect(km.reasonCode).toBe('turned_losing');
        // La puntuació és alta però acotada (el mat no la dispara a milers).
        expect(km.score).toBeLessThan(120);
    });

    test('10. desempat: un error PRIMERENC significatiu no és substituït per un de posterior derivat', () => {
        // Error primerenc: guanyadora (+300) → igualada (0), pèrdua 300, recuperable.
        const early = cand({ moveNumber: 14, ply: 27, evalBefore: 300, evalAfter: 0, cpLoss: 300,
            alternatives: [{ uci: 'd2d4', eval: 300, evalType: 'cp' }, { uci: 'e2e4', eval: 60, evalType: 'cp' }] });
        // Error posterior DERIVAT (posició ja perduda): -250 → -750, pèrdua 500.
        const later = cand({ moveNumber: 28, ply: 55, evalBefore: -250, evalAfter: -750, cpLoss: 500,
            alternatives: [{ uci: 'd2d4', eval: -250, evalType: 'cp' }, { uci: 'e2e4', eval: -800, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([later, early], {});
        expect(km.fen).toBe(early.fenBefore);
        expect(km.moveNumber).toBe(14);
    });

    test('11. compatibilitat amb candidats sense totes les dades (es descarten)', () => {
        const incomplete = cand({ evalAfter: null, cpLoss: null });         // falta evalAfter
        const forced = cand({ legalCount: 1, evalBefore: 200, evalAfter: -200, cpLoss: 400 }); // única legal
        expect(Core.scoreKeyMomentCandidate(incomplete, {}).disqualified).toBe(true);
        expect(Core.scoreKeyMomentCandidate(forced, {}).disqualified).toBe(true);
        expect(Core.selectKeyMoment([incomplete, forced], {})).toBeNull();
    });

    test('12. conserva EXACTAMENT fenBefore i les jugades', () => {
        const c = cand({ fenBefore: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
            evalBefore: 300, evalAfter: -50, cpLoss: 350, playedMoveUci: 'f3g5', playedMoveSan: 'Ng5',
            bestMoveUci: 'c2c3', bestMoveSan: 'c3',
            alternatives: [{ uci: 'c2c3', eval: 300, evalType: 'cp' }, { uci: 'd2d3', eval: 80, evalType: 'cp' }] });
        const km = Core.selectKeyMoment([c], {});
        expect(km.fen).toBe('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
        expect(km.playedMove).toEqual({ uci: 'f3g5', san: 'Ng5' });
        expect(km.bestMove).toEqual({ uci: 'c2c3', san: 'c3' });
    });

    test('evita una jugada amb totes les alternatives pràcticament iguals (claredat baixa)', () => {
        const flat = cand({ moveNumber: 16, ply: 31, evalBefore: 40, evalAfter: -20, cpLoss: 60,
            alternatives: [{ uci: 'd2d4', eval: 40, evalType: 'cp' }, { uci: 'e2e4', eval: 25, evalType: 'cp' }] });
        // pèrdua petita + alternatives ~iguals → per sota del llindar.
        expect(Core.selectKeyMoment([flat], {})).toBeNull();
    });

    test('anàlisi massa superficial: penalitza la profunditat baixa', () => {
        const deep = cand({ moveNumber: 12, evalBefore: 260, evalAfter: -20, cpLoss: 280, depth: 18,
            alternatives: [{ uci: 'd2d4', eval: 260, evalType: 'cp' }, { uci: 'e2e4', eval: 30, evalType: 'cp' }] });
        const shallow = Object.assign({}, deep, { depth: 4 });
        expect(Core.scoreKeyMomentCandidate(deep, {}).score)
            .toBeGreaterThan(Core.scoreKeyMomentCandidate(shallow, {}).score);
    });
});

describe('classifyPracticeAttempt (mode pràctica)', () => {
    const base = { bestUci: 'd2d4', bestCpUser: 300, playedGameUci: 'a2a3', playedGameCpUser: -20,
        alternatives: [{ uci: 'g1f3', cpUser: 275 }], equivalentCp: 40 };

    test('15a. la millor jugada exacta', () => {
        expect(Core.classifyPracticeAttempt(Object.assign({}, base, { attemptUci: 'd2d4', attemptCpUser: 300 })).code).toBe('best');
    });
    test('15b. alternativa gairebé equivalent (per llista i per avaluació)', () => {
        expect(Core.classifyPracticeAttempt(Object.assign({}, base, { attemptUci: 'g1f3', attemptCpUser: 275 })).code).toBe('equivalent');
        expect(Core.classifyPracticeAttempt(Object.assign({}, base, { attemptUci: 'c1f4', attemptCpUser: 270 })).code).toBe('equivalent');
    });
    test('repeteix la jugada de la partida', () => {
        expect(Core.classifyPracticeAttempt(Object.assign({}, base, { attemptUci: 'a2a3', attemptCpUser: -20 })).code).toBe('repeated');
    });
    test('millor que la partida però no la millor', () => {
        expect(Core.classifyPracticeAttempt(Object.assign({}, base, { attemptUci: 'b1c3', attemptCpUser: 120 })).code).toBe('better_not_best');
    });
    test('continua perdent l\'oportunitat', () => {
        expect(Core.classifyPracticeAttempt(Object.assign({}, base, { attemptUci: 'h2h4', attemptCpUser: -30 })).code).toBe('still_missing');
    });
});
