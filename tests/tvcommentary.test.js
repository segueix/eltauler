// Retransmissió de Stockfish TV: comentaris a gairebé cada jugada, amb
// varietat, continuïtat i valor educatiu, sense afirmacions sense fonament.
//
// Les partides de tests/fixtures/tv-games.json les ha jugat el MATEIX
// stockfish.js de l'app (scripts/gen-tv-fixtures.js), amb l'anàlisi
// pedagògica real de cada posició: la cobertura que es mesura aquí és la que
// veuria l'espectador amb aquelles partides.
const path = require('path');
const fs = require('fs');
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const Core = require('../core');
const R = require('../redactor');

const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tv-games.json'), 'utf8')).games;

function sanToUci(startFen, sans) {
    const g = startFen ? new Chess(startFen) : new Chess();
    return sans.map((m) => { const mv = g.move(m); if (!mv) throw new Error('jugada il·legal ' + m); return mv.from + mv.to + (mv.promotion || ''); });
}
function simulateSan(sans, opts) {
    const o = opts || {};
    return TV.tvSimulateCommentary(Chess, Object.assign({ moves: sanToUci(o.startFen, sans) }, o));
}
const MORPHY = ('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 '
    + 'O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#').split(' ');

function simulateFixture(game, tier) {
    return TV.tvSimulateCommentary(Chess, { startFen: game.startFen, moves: game.moves, analyses: game.analyses, prepared: game.prepared, tier: tier || 'mid' });
}

// ---------------------------------------------------------------------------
// 1. Cobertura i proporció de comentaris explicatius
// ---------------------------------------------------------------------------
describe('cobertura de la retransmissió', () => {
    const report = [];
    afterAll(() => {
        // Informe llegible de la cobertura mesurada (es veu amb --verbose).
        // eslint-disable-next-line no-console
        console.log('Cobertura de la retransmissió\n' + report.join('\n'));
    });

    test('partides reals del motor (obertura, mig joc i final): ≈90% de jugades comentades i majoria explicatives', () => {
        let total = 0, commented = 0, explanatory = 0;
        const byPhase = { opening: [0, 0, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] };
        FIXTURES.forEach((game) => {
            const rows = simulateFixture(game, 'mid');
            const st = TV.tvCommentaryStats(rows);
            total += st.plies; commented += st.commented; explanatory += st.explanatory;
            rows.forEach((r) => {
                const ph = Core.phaseFromFen(r.fen);
                byPhase[ph][0]++; if (r.comment) byPhase[ph][1]++; if (r.explanatory) byPhase[ph][2]++;
            });
            report.push(`  ${game.name}: ${st.plies} semijugades · cobertura ${(st.coverage * 100).toFixed(1)}% · explicatius ${(st.explanatoryRatio * 100).toFixed(1)}% de les jugades · silenci màxim ${st.maxSilence} · ${st.distinctTexts}/${st.commented} frases diferents · ${st.avgWords.toFixed(1)} paraules de mitjana`);
            expect(st.coverage).toBeGreaterThanOrEqual(0.85);
            expect(st.maxSilence).toBeLessThanOrEqual(2);
        });
        Object.keys(byPhase).forEach((ph) => {
            const [n, c, e] = byPhase[ph];
            if (n) report.push(`  fase ${ph}: ${n} semijugades · cobertura ${(c / n * 100).toFixed(1)}% · explicatius ${(e / n * 100).toFixed(1)}%`);
        });
        report.push(`  TOTAL: ${total} semijugades · cobertura ${(commented / total * 100).toFixed(1)}% · explicatius ${(explanatory / total * 100).toFixed(1)}% de les jugades (${(explanatory / commented * 100).toFixed(1)}% dels comentaris)`);
        expect(commented / total).toBeGreaterThanOrEqual(0.88);
        // Arribar al 90% només anunciant jugades no val: la majoria han d'explicar.
        expect(explanatory / total).toBeGreaterThanOrEqual(0.55);
        expect(byPhase.endgame[0]).toBeGreaterThan(20);
    });

    test('partida tàctica coneguda (Morphy, 1858): totes les fases comentades', () => {
        const rows = simulateSan(MORPHY);
        const st = TV.tvCommentaryStats(rows);
        report.push(`  Morphy – Duc de Brunswick i comte Isouard (sense anàlisi): cobertura ${(st.coverage * 100).toFixed(1)}% · explicatius ${(st.explanatoryRatio * 100).toFixed(1)}%`);
        expect(st.coverage).toBeGreaterThanOrEqual(0.9);
        expect(rows[rows.length - 1].kind).toBe('mate');
    });

    test('els tres nivells d\'espectador mantenen la cobertura', () => {
        ['basic', 'mid', 'advanced'].forEach((tier) => {
            const st = TV.tvCommentaryStats(simulateFixture(FIXTURES[0], tier));
            expect(st.coverage).toBeGreaterThanOrEqual(0.85);
        });
    });
});

// ---------------------------------------------------------------------------
// 2. Jugades consecutives, jugades tranquil·les i desenvolupament
// ---------------------------------------------------------------------------
describe('sense silencis artificials', () => {
    test('es comenten jugades consecutives de tots dos bàndols', () => {
        const rows = simulateSan('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6'.split(' '));
        expect(rows.slice(0, 6).every(r => r.comment)).toBe(true);
        expect(TV.tvCommentaryStats(rows).coverage).toBeGreaterThanOrEqual(0.9);
    });

    test('desenvolupar un cavall i després un alfil són dos fets diferents', () => {
        // Quatre peces menors blanques seguides: cap no es silencia per ser
        // «també desenvolupament» (abans, el filtre per tipus en callava la segona).
        const rows = simulateSan('Nf3 a6 Nc3 h6 g3 a5 Bg2 h5 b3 Ra7 Bb2'.split(' '));
        const minors = rows.filter(r => r.color === 'w' && /^[NB]/.test(r.san));
        minors.forEach(r => expect(r.comment).toBeTruthy());
        minors.forEach(r => expect(r.candidates).toContain('development'));
        const devKeys = minors.filter(r => r.key && r.key.indexOf('dev:w:') === 0).map(r => r.key);
        expect(new Set(devKeys).size).toBe(devKeys.length);
        expect(devKeys.length).toBeGreaterThanOrEqual(2);
        // A nivell de selecció: haver comentat el cavall no silencia l'alfil.
        let mem = TV.tvEmptyMemory();
        const dev = (key, text) => ({ kind: 'development', priority: 42, text, variants: [text], key, sig: key, family: 'development', tags: { squares: [] }, explanatory: true });
        mem = TV.tvCommitComment(mem, TV.tvSelectComment([dev('dev:w:g1', 'Les blanques desenvolupen el cavall cap a f3.')], mem, { ply: 2 }), { ply: 2 });
        expect(TV.tvSelectComment([dev('dev:w:f1', 'Les blanques desenvolupen l\'alfil cap a c4.')], mem, { ply: 4 }).text).toBe('Les blanques desenvolupen l\'alfil cap a c4.');
    });

    test('una jugada tranquil·la sense res a explicar rep una descripció factual, sense intencions', () => {
        const g = new Chess();
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'.split(' ').forEach(m => g.move(m));
        const fenBefore = g.fen();
        const mv = g.move('h3');
        const step = TV.tvBroadcastStep({ ChessCtor: Chess, fenBefore, fenAfter: g.fen(), move: mv, ply: 16, memory: TV.tvEmptyMemory(), tier: 'mid' });
        expect(step.comment).toBeTruthy();
        expect(step.comment.kind).toBe('describe');
        expect(step.comment.text).toMatch(/h3/);
        // Sense intencions inventades per a una jugada de peó tranquil·la.
        expect(step.comment.text).not.toMatch(/\b(prepara|vol|per evitar|amb la idea|pla|amenaça)\b/);
    });

    test('les descripcions seguides no s\'acumulen: després de dues, una jugada tranquil·la passa en silenci', () => {
        const mem = TV.tvEmptyMemory();
        mem.plainStreak = 2;
        const describe = { kind: 'describe', priority: 10, text: 'Peó blanc a h3.', variants: ['Peó blanc a h3.'], key: 'describe:9', sig: 'h3', family: 'describe-pawn', tags: { squares: ['h3'] }, explanatory: false };
        expect(TV.tvSelectComment([describe], mem, { ply: 9 })).toBeNull();
        mem.plainStreak = 1;
        expect(TV.tvSelectComment([describe], mem, { ply: 9 }).text).toBe('Peó blanc a h3.');
    });
});

// ---------------------------------------------------------------------------
// 3. Memòria d'idees: repeticions, evolució i continuïtat
// ---------------------------------------------------------------------------
describe('memòria i continuïtat del relat', () => {
    const press = (sig, text) => ({ kind: 'pressure', priority: 48, text: text, variants: [text], key: 'press:w:d5', sig: sig, family: 'pressure', tags: { squares: ['d5'] }, explanatory: true });

    test('la mateixa idea en el mateix estat no es repeteix; si evoluciona, sí', () => {
        let mem = TV.tvEmptyMemory();
        const first = TV.tvSelectComment([press('2/2', 'Les blanques pressionen el peó de d5.')], mem, { ply: 10 });
        mem = TV.tvCommitComment(mem, first, { ply: 10 });
        // Mateix estat (2 atacants contra 2 defensors) amb altres paraules: res de nou.
        expect(TV.tvSelectComment([press('2/2', 'Més pressió sobre el peó de d5.')], mem, { ply: 12 })).toBeNull();
        // Ara són 3 contra 2: la idea ha evolucionat i es pot tornar a comentar.
        const evolved = TV.tvSelectComment([press('3/2', 'Més pressió sobre el peó de d5.')], mem, { ply: 12 });
        expect(evolved.text).toBe('Més pressió sobre el peó de d5.');
        expect(evolved.evolved).toBe(true);
    });

    test('resposta a una amenaça comentada: la peça atacada s\'aparta', () => {
        // El cavall blanc ataca la torre de c8; les negres l'aparten.
        const rows = simulateSan(['Nb6', 'Rc7'], { startFen: '2r1k3/8/8/3N4/8/8/8/4K3 w - - 0 1' });
        expect(rows[0].kind).toBe('threat');
        expect(rows[0].comment).toMatch(/ataca la torre negra/);
        expect(rows[1].kind).toBe('reply');
        expect(rows[1].comment).toMatch(/aparten la torre de l'atac|s'aparta de l'atac/);
    });

    test('resposta a una amenaça: defensar la peça atacada', () => {
        const rows = simulateSan(['Bc4', 'e6'], { startFen: '4k3/4p3/8/3n4/8/8/8/4KB2 w - - 0 1' });
        expect(rows[0].comment).toBe('L\'alfil blanc ataca el cavall negre, que no està defensat.');
        expect(rows[1].kind).toBe('reply');
        expect(rows[1].comment).toMatch(/cavall de d5/);
    });

    test('pressió sobre un peó i reforç de la defensa', () => {
        // La torre ja apunta a d5; el cavall s'hi suma (2 contra 1) i les
        // negres hi afegeixen un defensor.
        const rows = simulateSan(['Nc3', 'Nf6'], { startFen: '1n2k1n1/8/4p3/3p4/8/8/8/1N1RK3 w - - 0 1' });
        expect(rows[0].kind).toBe('pressure');
        expect(rows[0].comment).toMatch(/^(Les blanques pressionen el peó de d5\.|Més pressió sobre el peó de d5\.)/);
        expect(rows[1].kind).toBe('reply');
        expect(rows[1].comment).toMatch(/reforcen la defensa del peó de d5|Ara el peó de d5 té un defensor més/);
    });

    test('el canvi que elimina un atacant es relaciona amb la pressió explicada', () => {
        const mem = TV.tvEmptyMemory();
        mem.pressures.push({ color: 'w', targetSq: 'd5', targetType: 'p', attackers: 2, defenders: 1, ply: 6 });
        const fen = '4k3/8/4p3/3p4/1b3N2/2N5/8/4K3 b - - 0 1';
        const g = new Chess(fen);
        const mv = g.move('Bxc3');
        const step = TV.tvBroadcastStep({ ChessCtor: Chess, fenBefore: fen, fenAfter: g.fen(), move: mv, ply: 9, memory: mem, tier: 'mid' });
        expect(step.comment.kind).toBe('reply');
        // Primer el fet (captura amb escac), després la relació amb la pressió.
        expect(step.comment.text).toBe('Les negres capturen el cavall de c3 amb l\'alfil, amb escac. El canvi elimina un dels atacants del peó de d5.');
    });

    test('les idees que ja no són certes surten de la memòria', () => {
        let mem = TV.tvEmptyMemory();
        mem.threats.push({ attackerSq: 'd5', attackerType: 'n', attackerColor: 'w', targetSq: 'c7', targetType: 'r', mode: 'value', ply: 3, targetColor: 'b' });
        // La torre ja no és a c7: l'amenaça es descarta en revalidar.
        mem = TV.tvCommitComment(mem, null, { ply: 4, fenAfter: '2r1k3/8/8/3N4/8/8/8/4K3 w - - 0 1', move: { color: 'b', flags: 'n' } });
        expect(mem.threats).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 4. Fets correctes per als dos bàndols i cap afirmació sense fonament
// ---------------------------------------------------------------------------
describe('fets correctes i prudència', () => {
    const cands = (fen, san, extra) => {
        const g = new Chess(fen);
        const mv = g.move(san);
        return TV.tvCommentCandidates(Object.assign({ ChessCtor: Chess, fenBefore: fen, fenAfter: g.fen(), move: mv, ply: 30, tier: 'mid', memory: TV.tvEmptyMemory() }, extra || {}));
    };
    const find = (list, kind) => list.find(c => c.kind === kind);

    test('columna oberta i semioberta, per a blanques i per a negres', () => {
        expect(find(cands('4k3/pp6/8/8/8/8/PP6/R3K3 w - - 0 1', 'Rd1'), 'open-file').text).toBe('La torre blanca ocupa la columna d, que està oberta.');
        expect(find(cands('r3k3/pp6/8/8/8/8/PP6/4K3 b - - 0 1', 'Rd8'), 'open-file').text).toBe('La torre negra ocupa la columna d, que està oberta.');
        expect(find(cands('4k3/2p5/8/8/8/8/8/R3K3 w - - 0 1', 'Rc1'), 'open-file').text).toBe('La torre blanca s\'instal·la a la columna c, semioberta.');
    });

    test('peó passat nou i avanç del peó passat, per a tots dos bàndols', () => {
        expect(find(cands('4k3/8/8/2p5/1P6/8/8/4K3 w - - 0 1', 'bxc5'), 'passed-new').text).toBe('Les blanques tenen un peó passat a c5.');
        const adv = find(cands('4k3/8/3P4/8/8/8/8/4K3 w - - 0 1', 'd7'), 'passed-advance');
        expect(adv.text).toBe('El peó passat blanc avança fins a d7: li falta una casella per coronar.');
        const advB = find(cands('4k3/8/8/8/8/2p5/8/4K3 b - - 0 1', 'c2'), 'passed-advance');
        expect(advB.text).toBe('El peó passat negre avança fins a c2: li falta una casella per coronar.');
    });

    test('peons doblats i aïllats nous després d\'una captura', () => {
        const list = cands('4k3/5p2/4p1p1/5N2/8/8/8/4K3 b - - 0 1', 'exf5');
        expect(list.map(c => c.text)).toEqual(expect.arrayContaining(['Les negres queden amb peons doblats a la columna f.']));
        const iso = cands('4k3/2p5/8/3p4/3PP3/8/8/4K3 b - - 0 1', 'dxe4');
        expect(iso.some(c => /queda aïllat|peó aïllat/.test(c.text))).toBe(true);
    });

    test('atacada no vol dir guanyable: sense anàlisi mai no es diu que es guanya', () => {
        const list = cands('4k3/8/4p3/3n4/8/8/8/4KB2 w - - 0 1', 'Bc4');
        list.forEach(c => expect(c.text).not.toMatch(/guany|perd/));
        // Peça penjada: el fet sí; que l'han de capturar ho diu només l'anàlisi.
        const fen = '4k3/8/2p5/8/8/2N5/8/4K3 w - - 0 1';
        const plain = cands(fen, 'Nd5');
        expect(find(plain, 'hanging').text).toBe('El cavall blanc de d5 queda atacat i sense defensa.');
        const g = new Chess(fen); const mv = g.move('Nd5');
        const analysed = TV.tvCommentCandidates({ ChessCtor: Chess, fenBefore: fen, fenAfter: g.fen(), move: mv, ply: 30, tier: 'mid',
            after: TV.tvBuildAnalysis(g.fen(), { 1: { depth: 12, type: 'cp', value: -300, pv: ['c6d5'] } }, 'c6d5') });
        expect(find(analysed, 'hanging').text).toBe('El cavall blanc de d5 queda atacat i sense defensa. L\'anàlisi recomana a les negres capturar-lo.');
        // I la peça que ha mogut, si queda penjada, no «amenaça» res.
        expect(plain.map(c => c.kind)).not.toContain('threat');
    });

    test('canvi de peces normal: la peça que captura una d\'igual valor no es dona per penjada', () => {
        const list = cands('4k3/8/8/4n3/8/5N2/8/4K3 w - - 0 1', 'Nxe5');
        expect(list.map(c => c.kind)).not.toContain('hanging');
    });

    test('el balanç de material no es diu a mig canvi', () => {
        // Bxe5: el cavall de d7 pot recuperar a e5 → encara no hi ha balanç.
        const mem = TV.tvEmptyMemory();
        const fen = '4k3/3n4/8/4p3/8/8/1B6/4K3 w - - 0 1';
        const g = new Chess(fen); const mv = g.move('Bxe5');
        const list = TV.tvCommentCandidates({ ChessCtor: Chess, fenBefore: fen, fenAfter: g.fen(), move: mv, ply: 30, memory: mem });
        expect(list.map(c => c.kind)).not.toContain('material');
    });

    test('al final, el rei que s\'acosta al centre o a un peó passat', () => {
        const toCenter = cands('8/8/8/5k2/8/8/p7/7K w - - 0 1', 'Kg2');
        expect(toCenter.map(c => c.kind)).toEqual(expect.arrayContaining(['king-activity']));
    });

    test('cap afirmació de pla, sacrifici correcte o jugada brillant sense anàlisi', () => {
        const forbidden = /(brillant|decisiv|sacrifici correcte|pla guanyador|prepara una penetració|garanteix|guanya la partida)/i;
        FIXTURES.concat([{ startFen: null, moves: sanToUci(null, MORPHY), analyses: [], prepared: 0 }]).forEach((game) => {
            simulateFixture(game).forEach((r) => {
                if (!r.comment) return;
                expect(r.comment).not.toMatch(forbidden);
                // «Guanyar», «perdre» o «guanyadora» només quan ho diu l'anàlisi
                // (o quan la partida ja ha acabat).
                if (/guany|\bperd/.test(r.comment) && !/Guanyen les/.test(r.comment)) expect(r.comment).toMatch(/anàlisi/);
            });
        });
    });

    test('les amenaces comentades a les partides reals són certes al tauler', () => {
        let checked = 0;
        FIXTURES.forEach((game) => {
            simulateFixture(game).forEach((r) => {
                const threats = r.payload && r.payload.threats;
                if (!threats) return;
                const grid = Core.antidoteParseBoard(r.fen).grid;
                threats.forEach((t) => {
                    const fr = (sq) => ({ file: 'abcdefgh'.indexOf(sq[0]), rank: +sq[1] - 1 });
                    const a = fr(t.attackerSq), tg = fr(t.targetSq);
                    const hits = Core.antidoteTargetsOf(grid, a.file, a.rank).some(x => x.file === tg.file && x.rank === tg.rank);
                    expect(hits).toBe(true);
                    if (t.mode === 'loose') expect(Core.antidoteAttackersOf(grid, tg.file, tg.rank, t.attackerColor === 'w' ? 'b' : 'w')).toHaveLength(0);
                    checked++;
                });
            });
        });
        expect(checked).toBeGreaterThan(5);
    });
});

// ---------------------------------------------------------------------------
// 5. Redacció: català correcte, varietat i cap contradicció evident
// ---------------------------------------------------------------------------
describe('redacció i monotonia', () => {
    const allRows = () => FIXTURES.map(g => simulateFixture(g)).concat([simulateSan(MORPHY)]);

    test('tots els comentaris passen l\'auditoria de català del redactor i el text parlat no té SAN', () => {
        allRows().forEach((rows) => rows.forEach((r) => {
            if (!r.comment) return;
            const audit = R.auditarCatala(r.comment);
            expect({ text: r.comment, problemes: audit.problemes }).toEqual({ text: r.comment, problemes: [] });
            expect(r.speech).not.toMatch(/\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8]/);
            expect(r.speech).not.toMatch(/\b[a-h][1-8]\b/);
        }));
    });

    test('varietat: cap frase repetida seguida, poques repeticions i famílies alternades', () => {
        allRows().forEach((rows) => {
            const texts = rows.filter(r => r.comment).map(r => r.comment);
            for (let i = 1; i < texts.length; i++) expect(texts[i]).not.toBe(texts[i - 1]);
            expect(new Set(texts).size / texts.length).toBeGreaterThanOrEqual(0.9);
            // Mai més de tres comentaris seguits del mateix tipus.
            let run = 1;
            const kinds = rows.filter(r => r.comment).map(r => r.kind);
            for (let i = 1; i < kinds.length; i++) { run = kinds[i] === kinds[i - 1] ? run + 1 : 1; expect(run).toBeLessThanOrEqual(3); }
        });
    });

    test('la majoria de comentaris són breus i les explicacions llargues són l\'excepció', () => {
        allRows().forEach((rows) => {
            const st = TV.tvCommentaryStats(rows);
            const comments = rows.filter(r => r.comment).map(r => r.comment);
            const words = comments.map(t => t.split(/\s+/).length).sort((a, b) => a - b);
            const oneSentence = comments.filter(t => t.split(/(?<=[.!?])\s+/).length === 1).length;
            // La majoria, d'una sola frase; mediana de paraules de comentari breu.
            expect(oneSentence / comments.length).toBeGreaterThanOrEqual(0.6);
            expect(words[Math.floor(words.length / 2)]).toBeLessThanOrEqual(14);
            expect(Math.max.apply(null, words)).toBeLessThanOrEqual(45);
            expect(st.longComments / st.commented).toBeLessThanOrEqual(0.4);
        });
    });

    test('les definicions bàsiques no es repeteixen dins de la mateixa partida', () => {
        const defs = ['Desenvolupar és treure', 'Una columna oberta no té', 'Un peó passat no té', 'Un peó aïllat no té', 'Enrocar posa el rei'];
        FIXTURES.forEach((g) => {
            const rows = simulateFixture(g, 'basic');
            defs.forEach(d => expect(rows.filter(r => r.comment && r.comment.indexOf(d) !== -1).length).toBeLessThanOrEqual(1));
        });
    });

    test('resum estratègic: com a molt cada 5 jugades completes, substitueix el comentari i no es repeteix igual', () => {
        FIXTURES.forEach((g) => {
            const rows = simulateFixture(g);
            const summaries = rows.filter(r => r.kind === 'summary');
            for (let i = 1; i < summaries.length; i++) {
                expect(summaries[i].ply - summaries[i - 1].ply).toBeGreaterThanOrEqual(TV.TV_CONFIG.SUMMARY_EVERY_PLIES);
                expect(summaries[i].comment).not.toBe(summaries[i - 1].comment);
            }
            summaries.forEach(sm => {
                const intro = TV.TV_SUMMARY_INTROS.find(i => i && sm.comment.indexOf(i) === 0);
                expect(intro !== undefined || /^[A-ZÀ-Ú]/.test(sm.comment)).toBe(true);
                // Res de «la qualitat de més» ni de la coma abans d'«i».
                expect(sm.comment).not.toMatch(/qualitat de més|, i /);
            });
            // Dos resums seguits no comencen igual.
            for (let i = 1; i < summaries.length; i++) {
                expect(summaries[i].comment.split(/[:,]/)[0]).not.toBe(summaries[i - 1].comment.split(/[:,]/)[0]);
            }
        });
    });

    test('resum estratègic amb varietat: introduccions i maneres de dir-ho diferents', () => {
        const all = [];
        FIXTURES.forEach((g) => simulateFixture(g).filter(r => r.kind === 'summary').forEach(r => all.push(r.comment)));
        const starts = new Set(all.map(t => t.split(/[:,]/)[0]));
        expect(all.length).toBeGreaterThan(5);
        expect(starts.size).toBeGreaterThanOrEqual(Math.min(6, all.length - 1));
        expect(new Set(all).size).toBe(all.length);
    });
});

// ---------------------------------------------------------------------------
// 6. Integració amb el controlador: text, veu i posició sincronitzats
// ---------------------------------------------------------------------------
describe('controlador amb la retransmissió nova (motor fals, temps simulat)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function fakeEngine(script) {
        const pending = new Set();
        const engine = {
            jobs: [],
            ready: () => Promise.resolve(TV.tvEngineCapabilities(TV.parseUciOptions(['option name Skill Level type spin default 20 min 0 max 20']))),
            failed: () => false, newGame() {}, cancelAll() { pending.forEach(e => { e.cancelled = true; }); }, destroy() {},
            request(job) {
                engine.jobs.push(job);
                return new Promise((resolve) => {
                    const entry = { cancelled: false };
                    pending.add(entry);
                    setTimeout(() => {
                        pending.delete(entry);
                        if (entry.cancelled) { resolve(null); return; }
                        const g = new Chess();
                        const tail = job.position.split(' moves ')[1];
                        (tail ? tail.split(' ') : []).forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
                        const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).sort();
                        const best = job.tag.kind === 'move' ? script[g.history().length] : legal[0];
                        resolve({ bestUci: best, infos: { 1: { depth: 12, multipv: 1, type: 'cp', value: 0, bound: null, pv: [legal[0]] } } });
                    }, 150);
                });
            }
        };
        return engine;
    }

    test('gairebé cada jugada es comenta, lligada a la posició visible, i la veu llegeix el mateix sense cues', async () => {
        const script = sanToUci(null, MORPHY);
        const engine = fakeEngine(script);
        const spoken = [];
        let active = 0;
        let maxActive = 0;
        const voice = {
            isOn: () => true, status: () => 'ready', stop: () => {}, prefetch: () => {},
            speak: (text) => {
                active++; maxActive = Math.max(maxActive, active);
                spoken.push(text);
                return new Promise((res) => setTimeout(() => { active--; res({ spoken: true, reason: 'end' }); }, 2500));
            }
        };
        const renders = [];
        const ctl = TV.createTvController({
            ChessCtor: Chess, engine, voice, view: { render: s => renders.push(s) },
            getViewer: () => ({ calibrated: true, roc: 1500 }), getOpenings: () => [], loadPrefs: () => null, savePrefs: () => {}, random: () => 0.5
        });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
        const lastGame = renders.filter(r => r.game && r.game.id === 1).pop().game;
        expect(lastGame.end).toEqual(expect.objectContaining({ reason: 'checkmate' }));
        const moves = lastGame.moves;
        expect(moves).toHaveLength(script.length);
        const commented = moves.filter(m => m.comment).length;
        expect(commented / moves.length).toBeGreaterThanOrEqual(0.85);
        // Cada render amb comentari: el comentari és de la partida i la posició visibles.
        renders.filter(r => r.game && r.game.comment && r.game.comment.kind !== 'intro').forEach((r) => {
            expect(r.game.comment.fen).toBe(r.game.fen);
            expect(r.game.comment.gameId).toBe(r.game.id);
        });
        // La veu llegeix exactament el text parlat dels comentaris mostrats, en ordre.
        const expected = moves.filter(m => m.comment).map(m => TV.tvSpeechText(m.comment));
        expect(spoken.slice(0, expected.length)).toEqual(expected);
        expect(maxActive).toBe(1);
        // No es demana mai anàlisi d'una posició acabada (el motor no hi respon).
        engine.jobs.filter(j => j.tag.kind === 'analysis').forEach(j => expect(new Chess(j.tag.fen).game_over()).toBe(false));
        ctl.close();
    });
});


describe('Simulació Art de la Guerra a TV',()=>{
    test('el mòdul és optatiu: no canvia els comentaris factuals',()=>{
        const Art=require('../artdelaguerra');
        const {Chess}=require('chess.js');
        const moves=['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','d2d3','f8c5'];
        const basic=TV.tvSimulateCommentary(Chess,{moves,prepared:0});
        const rich=TV.tvSimulateCommentary(Chess,{moves,prepared:0,art:Art});
        expect(rich.map(x=>x.comment)).toEqual(basic.map(x=>x.comment));
        for(const r of rich) {
            if(r.maxim) expect(r.comment).toBeTruthy();
        }
    });
});

describe('balanç de material amb paraules naturals', () => {
    const grid = fen => {
        const rows = fen.split(' ')[0].split('/');
        return rows.map(r => { const out = []; for (const ch of r) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null); else out.push({ c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() }); } return out; });
    };
    const material = fen => { const m = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
        grid(fen).forEach(r => r.forEach(p => { if (p && p.t !== 'k') m[p.c][p.t]++; })); return m; };

    test('la qualitat es diu amb les peces: torre per cavall o per alfil', () => {
        const knight = TV.materialPhrase(material('4k3/8/8/8/8/8/n7/R3K3 w - - 0 1'));
        expect(knight).toMatchObject({ leader: 'w', kind: 'exchange', desc: 'una torre per un cavall' });
        const bishop = TV.materialPhrase(material('4k3/8/8/8/8/8/b7/R3K3 w - - 0 1'));
        expect(bishop.desc).toBe('una torre per un alfil');
        const withPawn = TV.materialPhrase(material('4k3/8/8/8/8/8/n6P/R3K3 w - - 0 1'));
        expect(withPawn.desc).toBe('una torre per un cavall i un peó de més');
        const all = TV.materialClauses(knight).concat(TV.materialClauses(withPawn));
        all.forEach(t => expect(t).not.toMatch(/qualitat de més/));
        expect(all).toContain('les blanques tenen torre contra cavall');
        expect(all).toContain('les blanques han guanyat la qualitat (torre per cavall)');
    });

    test('cada balanç té més d’una manera de dir-se', () => {
        expect(TV.materialClauses(null).length).toBeGreaterThanOrEqual(3);
        const pawn = TV.materialPhrase(material('4k3/8/8/8/8/8/P7/4K3 w - - 0 1'));
        expect(TV.materialClauses(pawn)).toEqual(expect.arrayContaining(['les blanques tenen un peó de més', 'les negres tenen un peó de menys']));
        const piece = TV.materialPhrase(material('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1'));
        expect(TV.materialClauses(piece).length).toBeGreaterThanOrEqual(3);
        expect(TV.materialPhrase(material('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1')).desc).toBe('una dama de més');
    });

    test('«però» quan el material i l’anàlisi no apunten al mateix bàndol, i sense «, i»', () => {
        const all = [];
        FIXTURES.forEach((g) => simulateFixture(g).filter(r => r.kind === 'summary').forEach(r => all.push(r.comment)));
        const contrast = all.filter(t => / però/.test(t));
        expect(contrast.length).toBeGreaterThan(0);
        contrast.forEach(t => expect(t).not.toMatch(/(tenen|van|porten) [^,]* (de més|per davant|d'avantatge)[^.]*però[^.]*(també)/));
        all.forEach(t => expect(t).not.toMatch(/, i /));
    });
});
