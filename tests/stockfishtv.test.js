// Stockfish TV (stockfishtv.js): rang de nivell segons el motor REAL, objectiu
// de l'espectador, valoracions normalitzades, finals, comentaris verificats,
// text parlat, veu catalana (amb una speechSynthesis simulada) i el bucle de
// la partida (amb un motor fals i temporitzadors simulats).
const path = require('path');
const { execFileSync } = require('child_process');
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const Core = require('../core');

const C = TV.TV_CONFIG;

function caps(lines) { return TV.tvEngineCapabilities(TV.parseUciOptions(lines)); }
const ELO_LINES = (min, max) => [
    'id name Stockfish de prova',
    'option name Skill Level type spin default 20 min 0 max 20',
    `option name UCI_Elo type spin default ${min} min ${min} max ${max}`,
    'option name UCI_LimitStrength type check default false',
    'uciok'
];
const SKILL_CAPS = caps(['option name Skill Level type spin default 20 min 0 max 20', 'uciok']);

// ---------------------------------------------------------------------------
// 1. Opcions UCI i rang de la TV
// ---------------------------------------------------------------------------
describe('rang de nivell a partir del que declara el motor', () => {
    test('motor REAL (stockfish.js de l\'app): es llegeix la resposta a `uci`, no cap constant', () => {
        const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'engine-uci-options.js')], { encoding: 'utf8', timeout: 30000 });
        const report = JSON.parse(out);
        expect(report.lines).toContain('uciok');
        const parsed = TV.parseUciOptions(report.lines);
        const real = TV.tvEngineCapabilities(parsed);
        const elo = parsed.options.UCI_Elo;
        if (elo && parsed.options.UCI_LimitStrength) {
            // Si el motor declara UCI_Elo, el mínim de la TV és max(800, mínim natiu).
            expect(real.mode).toBe('elo');
            expect(real.min).toBe(Math.max(800, elo.min));
            expect(real.max).toBe(elo.max);
        } else {
            // El binari inclòs (Stockfish 2019-08-15 Multi-Variant) NO declara
            // UCI_Elo ni UCI_LimitStrength: la TV ho tracta com a incompatibilitat
            // explícita i no inventa cap Elo.
            expect(real.mode).not.toBe('elo');
            expect(real.missing).toEqual(expect.arrayContaining(['UCI_Elo']));
            expect(real.engineEloMin).toBeNull();
            expect(TV.tvCompatibilityNote(real)).toMatch(/no declara UCI_Elo/);
            if (parsed.options['Skill Level']) {
                expect(real.mode).toBe('skill');
                expect(real.min).toBe(parsed.options['Skill Level'].min);
                expect(real.max).toBe(parsed.options['Skill Level'].max);
                // Mai «Elo del motor»: només un Elo ESTIMAT, presentat com a tal.
                expect(TV.tvLevelLabel(real, 4).long).toMatch(/Elo estimat/);
                expect(TV.tvLevelLabel(real, 4).long).not.toMatch(/Elo aproximat del motor/);
            }
        }
    });

    test('parseUciOptionLine llegeix nom amb espais, tipus, default, min i max', () => {
        const o = TV.parseUciOptionLine('option name Skill Level type spin default 20 min 0 max 20');
        expect(o).toEqual(expect.objectContaining({ name: 'Skill Level', type: 'spin', default: '20', min: 0, max: 20 }));
        expect(TV.parseUciOptionLine('option name Clear Hash type button')).toEqual(expect.objectContaining({ name: 'Clear Hash', type: 'button', min: null }));
        expect(TV.parseUciOptionLine('info depth 3')).toBeNull();
    });

    test('mínim de la TV = max(800, mínim natiu); màxim = màxim natiu', () => {
        expect(caps(ELO_LINES(1350, 2850))).toEqual(expect.objectContaining({ mode: 'elo', min: 1350, max: 2850, engineEloMin: 1350 }));
        expect(caps(ELO_LINES(1320, 3190))).toEqual(expect.objectContaining({ mode: 'elo', min: 1320, max: 3190 }));
        expect(caps(ELO_LINES(800, 2850))).toEqual(expect.objectContaining({ mode: 'elo', min: 800 }));
        // Un motor que baixa de 800 no fa baixar la TV per sota de 800.
        expect(caps(ELO_LINES(500, 2850))).toEqual(expect.objectContaining({ mode: 'elo', min: 800, engineEloMin: 500 }));
    });

    test('sense UCI_LimitStrength (o amb UCI_Elo sota 800) no hi ha mode Elo', () => {
        const noLimit = caps(['option name UCI_Elo type spin default 1350 min 1350 max 2850', 'option name Skill Level type spin default 20 min 0 max 20']);
        expect(noLimit.mode).toBe('skill');
        expect(noLimit.missing).toEqual(['UCI_LimitStrength']);
        const tooLow = caps(ELO_LINES(100, 700));
        expect(tooLow.mode).toBe('skill');
        expect(tooLow.eloOutOfRange).toEqual({ min: 100, max: 700 });
        expect(TV.tvCompatibilityNote(tooLow)).toMatch(/per sota del mínim de la TV/);
        const nothing = caps(['option name Hash type spin default 16 min 16 max 16']);
        expect(nothing.mode).toBe('none');
        expect(TV.tvCompatibilityNote(nothing)).toMatch(/força plena/);
    });

    test('ordres UCI: jugadors amb UCI_LimitStrength + UCI_Elo; anàlisi sense límit', () => {
        const elo = caps(ELO_LINES(1350, 2850));
        expect(TV.tvStrengthCommands(elo, 'player', 1550)).toEqual([
            'setoption name UCI_LimitStrength value true', 'setoption name UCI_Elo value 1550']);
        expect(TV.tvStrengthCommands(elo, 'analysis')).toEqual([
            'setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20']);
        expect(TV.tvStrengthCommands(SKILL_CAPS, 'player', 3)).toEqual(['setoption name Skill Level value 3']);
        expect(TV.tvStrengthCommands(SKILL_CAPS, 'analysis')).toEqual(['setoption name Skill Level value 20']);
        expect(TV.tvStrengthCommands(caps([]), 'player', 3)).toEqual([]);
    });

    test('etiqueta: «Elo aproximat del motor» només en mode Elo', () => {
        const elo = caps(ELO_LINES(1350, 2850));
        expect(TV.tvLevelLabel(elo, 1550).long).toBe('Elo aproximat del motor: 1550');
        expect(TV.tvLevelLabel(SKILL_CAPS, 4).long).toBe('Nivell 4 de 20 · Elo estimat ≈ ' + TV.tvSkillEloEstimate(4));
        expect(TV.tvLevelLabel(SKILL_CAPS, 4).short).toBe('Nivell 4 · ≈' + TV.tvSkillEloEstimate(4));
    });

    test('Elo estimat per a cadascun dels nivells 0–20 (relació de Stockfish 11)', () => {
        const scale = TV.tvLevelScale(SKILL_CAPS);
        expect(scale).toHaveLength(21);
        expect(scale[0]).toEqual({ value: 0, elo: 1350 });
        expect(scale[20]).toEqual({ value: 20, elo: 2950 });
        for (let i = 1; i < scale.length; i++) expect(scale[i].elo).toBeGreaterThan(scale[i - 1].elo);
        // Inversa exacta de la fórmula de SF11: Skill Level = ((Elo − 1346,6) / 143,4)^(1/0,806).
        [1, 5, 10, 18].forEach((l) => {
            const back = Math.pow((TV.tvSkillEloEstimate(l) - 1346.6) / 143.4, 1 / 0.806);
            expect(Math.abs(back - l)).toBeLessThan(0.15);
        });
        // En mode Elo natiu la barra va de centenar en centenar, amb els extrems declarats.
        const elo = TV.tvLevelScale(caps(ELO_LINES(1350, 2850)));
        expect(elo[0].value).toBe(1350);
        expect(elo[1].value).toBe(1400);
        expect(elo[elo.length - 1].value).toBe(2850);
        expect(elo[elo.length - 2].value).toBe(2800);
        expect(TV.tvLevelScale(caps([]))).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2. Espectador, objectiu i ajustos
// ---------------------------------------------------------------------------
describe('objectiu adaptat a l\'espectador', () => {
    const elo1350 = caps(ELO_LINES(1350, 2850));
    const elo800 = caps(ELO_LINES(800, 2850));

    test('objectiu inicial = nivell + 200 amb la conversió existent, dins del rang', () => {
        const v = (roc) => TV.tvViewerProfile({ calibrated: true, roc: roc }, elo800);
        expect(TV.tvBaseTarget(elo800, v(900))).toBe(Core.rocToEngineElo(1100, 800, 2850));
        expect(TV.tvBaseTarget(elo800, v(900))).toBe(1100);
        expect(TV.tvBaseTarget(elo800, v(500))).toBe(800);
        expect(TV.tvBaseTarget(elo800, v(2800))).toBe(2850);
        const w = (roc) => TV.tvViewerProfile({ calibrated: true, roc: roc }, elo1350);
        expect(TV.tvBaseTarget(elo1350, w(1000))).toBe(1350);
        expect(TV.tvBaseTarget(elo1350, w(1400))).toBe(1600);
    });

    test('escala nativa: objectiu = nivell amb l\'Elo estimat més proper a nivell + 200', () => {
        const v = (roc) => TV.tvViewerProfile({ calibrated: true, roc: roc }, SKILL_CAPS);
        expect(TV.tvBaseTarget(SKILL_CAPS, v(1400))).toBe(2);          // 1600 → nivell 2 (≈1600)
        expect(TV.tvBaseTarget(SKILL_CAPS, v(900))).toBe(0);           // 1100 → per sota: nivell 0
        expect(TV.tvBaseTarget(SKILL_CAPS, v(2900))).toBe(20);
        // El mínim estimat del motor (≈1350) marca qui rep explicacions senzilles.
        expect(v(1200).belowEngineMin).toBe(true);
        expect(v(1200).tier).toBe('basic');
        expect(v(1500).tier).toBe('mid');
    });

    test('barra de nivell: fixa el valor de la partida següent dins dels límits', () => {
        const v = TV.tvViewerProfile({ calibrated: true, roc: 1400 }, SKILL_CAPS);
        let prefs = TV.tvSetTargetPrefs(SKILL_CAPS, v, null, 8);
        expect(TV.tvResolveTarget(SKILL_CAPS, v, prefs).value).toBe(8);
        prefs = TV.tvSetTargetPrefs(SKILL_CAPS, v, prefs, 25);
        expect(TV.tvResolveTarget(SKILL_CAPS, v, prefs).value).toBe(20);
        prefs = TV.tvSetTargetPrefs(SKILL_CAPS, v, prefs, -3);
        expect(TV.tvResolveTarget(SKILL_CAPS, v, prefs).value).toBe(0);
        prefs = TV.tvAdjustPrefs(SKILL_CAPS, v, prefs, 'harder');
        expect(TV.tvResolveTarget(SKILL_CAPS, v, prefs).value).toBe(1);
    });

    test('sense nivell conegut es comença pel mínim de la TV', () => {
        const unknown = TV.tvViewerProfile({ calibrated: false, roc: 1700 }, elo1350);
        expect(unknown.known).toBe(false);
        expect(TV.tvBaseTarget(elo1350, unknown)).toBe(1350);
        expect(TV.tvBaseTarget(SKILL_CAPS, unknown)).toBe(0);
        expect(TV.tvBaseTarget(elo1350, TV.tvViewerProfile(null, elo1350))).toBe(1350);
    });

    test('per sota del mínim del motor: llenguatge senzill i ritme més lent', () => {
        const low = TV.tvViewerProfile({ calibrated: true, roc: 1200 }, elo1350);
        expect(low.belowEngineMin).toBe(true);
        expect(low.tier).toBe('basic');
        expect(TV.tvViewerProfile({ calibrated: true, roc: 1400 }, elo1350).tier).toBe('mid');
        expect(TV.tvViewerProfile({ calibrated: true, roc: 1900 }, elo1350).tier).toBe('advanced');
        const basic = TV.tvMoveDelayMs('calm', { tier: 'basic', random: 0.5 });
        const mid = TV.tvMoveDelayMs('calm', { tier: 'mid', random: 0.5 });
        expect(basic).toBeGreaterThan(mid);
    });

    test('ritme tranquil: entre 5 i 8 segons; les jugades preparades són més àgils', () => {
        expect(TV.tvMoveDelayMs('calm', { random: 0 })).toBe(5000);
        expect(TV.tvMoveDelayMs('calm', { random: 1 })).toBe(8000);
        expect(TV.tvMoveDelayMs('calm', { random: 0.5, prepared: true })).toBeLessThan(5000);
        expect(TV.tvMoveDelayMs('quick', { random: 1 })).toBeLessThan(TV.tvMoveDelayMs('calm', { random: 0 }));
    });

    test('«Massa fàcil» / «Massa difícil»: passos de 100 dins dels límits, desats només a la TV', () => {
        const viewerInput = { calibrated: true, roc: 1400 };
        const v = TV.tvViewerProfile(viewerInput, elo1350);
        let prefs = TV.tvNormalizePrefs(null);
        expect(TV.tvResolveTarget(elo1350, v, prefs).value).toBe(1600);
        prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'harder');
        expect(TV.tvResolveTarget(elo1350, v, prefs).value).toBe(1700);
        prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'easier');
        prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'easier');
        prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'easier');
        expect(TV.tvResolveTarget(elo1350, v, prefs).value).toBe(1400);
        for (let i = 0; i < 10; i++) prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'easier');
        expect(TV.tvResolveTarget(elo1350, v, prefs).value).toBe(1350);
        // Tocar fons no acumula deute: un sol «massa fàcil» ja torna a pujar,
        // fins al centenar rodó següent de l'escala (1350 → 1400).
        prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'harder');
        expect(TV.tvResolveTarget(elo1350, v, prefs).value).toBe(1400);
        prefs = TV.tvAdjustPrefs(elo1350, v, prefs, 'harder');
        expect(TV.tvResolveTarget(elo1350, v, prefs).value).toBe(1500);
        // L'escala nativa puja d'un en un.
        const s = TV.tvAdjustPrefs(SKILL_CAPS, TV.tvViewerProfile(null, SKILL_CAPS), null, 'harder');
        expect(TV.tvResolveTarget(SKILL_CAPS, TV.tvViewerProfile(null, SKILL_CAPS), s).value).toBe(1);
        // El nivell de l'usuari no es toca mai.
        expect(viewerInput).toEqual({ calibrated: true, roc: 1400 });
        // Clau pròpia de la TV, fora dels prefixos que sincronitza el núvol.
        expect(C.PREFS_KEY.indexOf('chess_')).not.toBe(0);
        expect(C.PREFS_KEY.indexOf('eltauler_')).not.toBe(0);
    });

    test('una preferència desada amb un altre motor no s\'aplica al motor actual', () => {
        const v = TV.tvViewerProfile({ calibrated: true, roc: 1400 }, elo1350);
        const prefs = TV.tvAdjustPrefs(elo1350, v, null, 'harder');
        expect(TV.tvResolveTarget(SKILL_CAPS, TV.tvViewerProfile({ calibrated: true, roc: 1400 }, SKILL_CAPS), prefs).offset).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Valoracions i finals
// ---------------------------------------------------------------------------
describe('valoracions normalitzades i finals de partida', () => {
    test('parseInfoLine: cp, mat, límits i PV', () => {
        const a = TV.parseInfoLine('info depth 14 seldepth 19 multipv 2 score cp -35 nodes 1 pv e7e5 g1f3');
        expect(a).toEqual(expect.objectContaining({ depth: 14, multipv: 2, type: 'cp', value: -35, bound: null, pv: ['e7e5', 'g1f3'] }));
        expect(TV.parseInfoLine('info depth 9 score mate -3 pv h7h6').type).toBe('mate');
        expect(TV.parseInfoLine('info depth 11 score cp 108 upperbound pv b1c3').bound).toBe('upper');
        expect(TV.parseInfoLine('info string hola')).toBeNull();
    });

    test('tot es porta al punt de vista de les blanques abans de comparar', () => {
        expect(TV.tvScoreWhite({ type: 'cp', value: 50 }, 'b')).toEqual({ type: 'cp', value: -50 });
        expect(TV.tvScoreWhite({ type: 'mate', value: 2 }, 'b')).toEqual({ type: 'mate', value: -2 });
        expect(TV.tvMateFor({ type: 'mate', value: -2 }, 'b')).toBe(2);
        expect(TV.tvMateFor({ type: 'mate', value: -2 }, 'w')).toBeNull();
    });

    test('centipeons i mats mai es barregen', () => {
        expect(TV.tvMoverLossCp({ type: 'cp', value: 30 }, { type: 'cp', value: -250 }, 'w')).toBe(280);
        expect(TV.tvMoverLossCp({ type: 'cp', value: -30 }, { type: 'cp', value: 250 }, 'b')).toBe(280);
        expect(TV.tvMoverLossCp({ type: 'mate', value: 3 }, { type: 'cp', value: 100 }, 'w')).toBeNull();
        expect(TV.tvMoverLossCp({ type: 'cp', value: 0 }, { type: 'mate', value: -1 }, 'w')).toBeNull();
    });

    test('anàlisi poc profunda: no fiable', () => {
        const fen = new Chess().fen();
        const deep = TV.tvBuildAnalysis(fen, { 1: { depth: 12, type: 'cp', value: 20, pv: ['e2e4'] } }, 'e2e4');
        const shallow = TV.tvBuildAnalysis(fen, { 1: { depth: 6, type: 'cp', value: 20, pv: ['e2e4'] } }, 'e2e4');
        expect(deep.reliable).toBe(true);
        expect(shallow.reliable).toBe(false);
        expect(TV.tvBuildAnalysis(fen, {}, null).reliable).toBe(false);
    });

    test('finals: mat, ofegat, material insuficient, repetició i cinquanta jugades', () => {
        const mate = new Chess();
        ['f3', 'e5', 'g4', 'Qh4#'].forEach(m => mate.move(m));
        expect(TV.tvGameEnd(mate)).toEqual(expect.objectContaining({ result: '0-1', reason: 'checkmate' }));
        expect(TV.tvGameEnd(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual(expect.objectContaining({ result: '½-½', reason: 'stalemate' }));
        expect(TV.tvGameEnd(new Chess('8/8/4k3/8/8/4K3/8/8 w - - 0 1')).reason).toBe('insufficient');
        const rep = new Chess();
        ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(m => rep.move(m));
        expect(TV.tvGameEnd(rep).reason).toBe('repetition');
        expect(TV.tvGameEnd(new Chess('8/8/4k3/8/8/4K3/4R3/8 w - - 100 80')).reason).toBe('fifty');
        expect(TV.tvGameEnd(new Chess())).toBeNull();
        expect(TV.tvResultHeadline({ result: '1-0' })).toMatch(/Guanyen les blanques/);
    });
    test('durada màxima de 100 jugades (200 semijugades)', () => {
        expect(C.MAX_PLIES).toBe(200);
        const g = new Chess();
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'].forEach(m => g.move(m));
        expect(TV.tvGameEnd(g, 13)).toBeNull();
        expect(TV.tvGameEnd(g, 12)).toEqual(expect.objectContaining({ result: '½-½', reason: 'length' }));
        expect(TV.tvGameEnd(g, 12).text).toContain('6 jugades');
    });
});

describe('partides decidides: abandonament i ritme', () => {
    const cp = (value, depth = 16) => ({ reliable: depth >= C.MIN_RELIABLE_DEPTH, best: { type: 'cp', value } });
    const mate = value => ({ reliable: true, best: { type: 'mate', value } });
    function run(list, startPly = C.RESIGN_MIN_PLY, threshold = 500) {
        let state = null, end = null, at = null;
        list.forEach((a, i) => { const r = TV.tvResignStep(state, a, startPly + i, threshold); state = r.state; if (r.end && !end) { end = r.end; at = startPly + i; } });
        return { state, end, at };
    }
    test('bàndol decisiu: centipeons a partir del llindar o un mat, des del punt de vista de les blanques', () => {
        expect(TV.tvDecisiveSide({ type: 'cp', value: 520 }, 500)).toBe('w');
        expect(TV.tvDecisiveSide({ type: 'cp', value: -500 }, 500)).toBe('b');
        expect(TV.tvDecisiveSide({ type: 'cp', value: 499 }, 500)).toBeNull();
        expect(TV.tvDecisiveSide({ type: 'mate', value: -3 }, 500)).toBe('b');
        expect(TV.tvDecisiveSide({ type: 'mate', value: 2 }, 500)).toBe('w');
        expect(TV.tvDecisiveSide(null, 500)).toBeNull();
    });
    test('abandona qui perd després de sis semijugades seguides amb el mateix bàndol clarament guanyador', () => {
        const r = run([cp(600), cp(650), cp(700), mate(5), cp(800), cp(900)]);
        expect(r.at).toBe(C.RESIGN_MIN_PLY + 5);
        expect(r.end).toEqual(expect.objectContaining({ result: '1-0', winner: 'w', reason: 'resign' }));
        expect(r.end.text).toBe('Les negres abandonen: l\'avantatge de les blanques ja és decisiu. Guanyen les blanques.');
        expect(TV.tvResultHeadline(r.end)).toMatch(/Guanyen les blanques/);
        expect(run([cp(-600), cp(-600), cp(-600), cp(-600), cp(-600), cp(-600)]).end.winner).toBe('b');
    });
    test('una remuntada, un bàndol diferent o massa poc avantatge reinicien la sèrie', () => {
        expect(run([cp(600), cp(600), cp(600), cp(300), cp(600), cp(600), cp(600)]).end).toBeNull();
        expect(run([cp(600), cp(600), cp(600), cp(-600), cp(600), cp(600)]).end).toBeNull();
        expect(run([cp(600), cp(600), cp(600), cp(-600), cp(600), cp(600)]).state).toEqual({ side: 'w', plies: 2 });
    });
    test('una anàlisi poc fiable o absent no compta, però tampoc no trenca la sèrie', () => {
        const r = run([cp(600), cp(600), cp(600, 6), null, cp(600), cp(600), cp(600)]);
        expect(r.state).toEqual({ side: 'w', plies: 5 });
        expect(r.end).toBeNull();
        expect(run([cp(600), cp(600), cp(600, 6), null, cp(600), cp(600), cp(600), cp(600)]).end).not.toBeNull();
    });
    test('mai abans de la jugada 65, encara que la partida ja estigui decidida', () => {
        expect(C.RESIGN_MIN_PLY).toBe(129);
        // Decidida des de la jugada 20: cap abandonament fins a la 65.
        expect(run(Array.from({ length: 88 }, () => cp(900)), 40).end).toBeNull();
        expect(run(Array.from({ length: 100 }, () => cp(900)), 40).at).toBe(129);
        expect(run(Array.from({ length: 12 }, () => cp(-900)), 115).end).toBeNull();
        expect(run(Array.from({ length: 16 }, () => cp(-900)), 115)).toMatchObject({ at: 129, end: expect.objectContaining({ winner: 'b' }) });
    });
    test('als nivells baixos es demana més marge per abandonar', () => {
        expect(TV.tvResignThresholdCp(SKILL_CAPS, 2)).toBe(C.RESIGN_CP_LOW);
        expect(TV.tvResignThresholdCp(SKILL_CAPS, 10)).toBe(C.RESIGN_CP);
        const eloCaps = caps(ELO_LINES(1320, 3190));
        expect(TV.tvResignThresholdCp(eloCaps, 1500)).toBe(C.RESIGN_CP_LOW);
        expect(TV.tvResignThresholdCp(eloCaps, 2200)).toBe(C.RESIGN_CP);
        expect(run(Array.from({ length: 6 }, () => cp(600)), 40, C.RESIGN_CP_LOW).end).toBeNull();
    });
    test('partida decidida: ritme àgil sigui quin sigui el ritme triat', () => {
        expect(TV.tvIsDecided(cp(350))).toBe(true);
        expect(TV.tvIsDecided(cp(-350))).toBe(true);
        expect(TV.tvIsDecided(cp(200))).toBe(false);
        expect(TV.tvIsDecided(cp(900, 6))).toBe(false);
        expect(TV.tvMoveDelayMs('slow', { random: 1, decided: true })).toBe(C.SPEEDS.quick.max);
        expect(TV.tvMoveDelayMs('calm', { random: 0, decided: true })).toBe(C.SPEEDS.quick.min);
        expect(TV.tvMoveDelayMs('calm', { random: 0 })).toBe(C.SPEEDS.calm.min);
    });
});

describe('nivells desiguals', () => {
    test('per defecte activats; es poden apagar i es desen a les preferències de la TV', () => {
        expect(TV.tvNormalizePrefs(null).unequal).toBe(true);
        expect(TV.tvNormalizePrefs({ unequal: false }).unequal).toBe(false);
        expect(TV.tvNormalizePrefs({ unequal: 'x' }).unequal).toBe(true);
    });
    test('Skill Level: el més fluix juga el nivell triat i el més fort, dos per sobre; als extrems es desplacen', () => {
        expect(C.UNEQUAL_SKILL_GAP).toBe(2);
        expect(TV.tvGameLevels(SKILL_CAPS, 3, true, () => 0.2)).toEqual({ w: 5, b: 3, stronger: 'w' });
        expect(TV.tvGameLevels(SKILL_CAPS, 3, true, () => 0.7)).toEqual({ w: 3, b: 5, stronger: 'b' });
        expect(TV.tvGameLevels(SKILL_CAPS, 20, true, () => 0.7)).toEqual({ w: 18, b: 20, stronger: 'b' });
        expect(TV.tvGameLevels(SKILL_CAPS, 19, true, () => 0.7)).toEqual({ w: 18, b: 20, stronger: 'b' });
        expect(TV.tvGameLevels(SKILL_CAPS, 0, true, () => 0.2)).toEqual({ w: 2, b: 0, stronger: 'w' });
        expect(TV.tvGameLevels(SKILL_CAPS, 5, false)).toEqual({ w: 5, b: 5, stronger: null });
        expect(TV.tvGameLevels(caps([]), 5, true)).toBeNull();
    });
    test('Elo: 200 de diferència centrats en l\'objectiu i dins del rang del motor', () => {
        const elo = caps(ELO_LINES(1320, 3190));
        expect(TV.tvGameLevels(elo, 1500, true, () => 0.1)).toEqual({ w: 1600, b: 1400, stronger: 'w' });
        expect(TV.tvGameLevels(elo, elo.min, true, () => 0.9)).toEqual({ w: elo.min, b: elo.min + 200, stronger: 'b' });
        expect(TV.tvGameLevels(elo, elo.max, true, () => 0.1)).toEqual({ w: elo.max, b: elo.max - 200, stronger: 'w' });
    });
    test('durant la partida es mostra la mitjana sense dir qui és el més fort; al final es revela', () => {
        const levels = TV.tvGameLevels(SKILL_CAPS, 3, true, () => 0.7);
        const label = TV.tvGameLevelLabel(SKILL_CAPS, levels, 3);
        const avg = Math.round((TV.tvSkillEloEstimate(3) + TV.tvSkillEloEstimate(5)) / 2 / 10) * 10;
        expect(label.short).toBe('Nivell mitjà · ≈' + avg);
        expect(label.long).toContain('un dels dos juga 2 nivells per sobre');
        expect(label.long).not.toMatch(/blanques|negres/);
        expect(TV.tvLevelReveal(SKILL_CAPS, levels)).toBe('Les negres jugaven una mica més fort: nivell 5 contra nivell 3.');
        expect(TV.tvGameLevelLabel(SKILL_CAPS, TV.tvGameLevels(SKILL_CAPS, 3, false), 3)).toEqual(TV.tvLevelLabel(SKILL_CAPS, 3));
        expect(TV.tvLevelReveal(SKILL_CAPS, TV.tvGameLevels(SKILL_CAPS, 3, false))).toBeNull();
    });
    test('cada bàndol rep el seu nivell segons el torn de la posició', () => {
        const level = { value: 3, sides: { w: 3, b: 4 } };
        expect(TV.tvSideLevel(level, new Chess().fen())).toBe(3);
        expect(TV.tvSideLevel(level, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(4);
        expect(TV.tvSideLevel({ value: 7, sides: null }, new Chess().fen())).toBe(7);
    });
});

describe('perfils de joc', () => {
    const CASTLED = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 1 6';
    const RUY = 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const feats = (fen, uci, ev = 0) => TV.tvMoveFeatures(Chess, fen, uci, ev);
    const info = (uci, value, type = 'cp') => ({ depth: 12, type, value, pv: [uci], bound: null });
    test('quatre perfils, dos de diferents per partida i activats per defecte', () => {
        expect(Object.keys(TV.TV_STYLES)).toEqual(['attacker', 'wall', 'hunter', 'strategist']);
        expect(TV.TV_STYLES.attacker.label).toBe('L\'Atacant');
        for (let r = 0; r < 1; r += 0.05) {
            const st = TV.tvPickStyles(() => r);
            expect(st.w).not.toBe(st.b);
            expect(TV.TV_STYLES[st.w] && TV.TV_STYLES[st.b]).toBeTruthy();
        }
        expect(TV.tvNormalizePrefs(null).profiles).toBe(true);
        expect(TV.tvNormalizePrefs({ profiles: false }).profiles).toBe(false);
        expect(TV.tvStylesLine({ w: 'attacker', b: 'wall' })).toBe('L\'Atacant (blanques) contra El Mur (negres)');
    });
    test('trets de jugada: escac, captura, enroc, peons contra el rei enrocat, canvi, sacrifici, columna oberta', () => {
        expect(feats(CASTLED, 'h2h4')).toEqual(expect.objectContaining({ storm: 1, quiet: 1 }));
        expect(feats(CASTLED, 'd3d4').storm).toBe(0);
        expect(feats(CASTLED, 'e1g1')).toEqual(expect.objectContaining({ castle: 1, kingMove: 0 }));
        expect(feats(CASTLED, 'c1g5')).toEqual(expect.objectContaining({ development: 1, approach: 3 }));
        expect(feats(RUY, 'b5c6')).toEqual(expect.objectContaining({ captureValue: 3, trade: 1, tradeAhead: 0 }));
        expect(feats(RUY, 'b5c6', 150).tradeAhead).toBe(1);
        expect(feats('rnbqkb1r/ppp2ppp/3p1n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 4', 'f3e5')).toEqual(expect.objectContaining({ sacrifice: 1, captureValue: 1 }));
        expect(feats('4k3/pp3ppp/8/8/8/8/PP3PPP/R3K3 w - - 0 20', 'a1d1').rookFile).toBe(2);
        expect(feats('4k3/8/8/8/8/8/8/4K2R w K - 0 30', 'e1e2')).toEqual(expect.objectContaining({ kingMove: 1, castle: 0 }));
        expect(feats('4k3/8/8/8/8/8/8/4K2R w K - 0 30', 'h1h8')).toEqual(expect.objectContaining({ check: 1 }));
        expect(feats(RUY, 'a1a8')).toBeNull();
    });
    test('cada perfil prefereix les jugades del seu estil', () => {
        const pick = (style, fen, list) => list.slice().sort((a, b) => TV.tvStyleScore(style, feats(fen, b)) - TV.tvStyleScore(style, feats(fen, a)))[0];
        expect(pick('attacker', CASTLED, ['h2h4', 'e1g1', 'a2a3'])).toBe('h2h4');
        expect(pick('wall', CASTLED, ['h2h4', 'e1g1', 'a2a3'])).toBe('e1g1');
        expect(pick('hunter', RUY, ['b5c6', 'e1g1', 'b1c3'])).toBe('b5c6');
        expect(pick('strategist', RUY, ['b5c6', 'a2a3', 'b1c3'])).toBe('b1c3');
        expect(TV.tvStyleScore('desconegut', feats(RUY, 'b1c3'))).toBe(0);
    });
    test('el perfil tria només entre jugades d\'una qualitat semblant a la del nivell', () => {
        const infos = { 1: info('b1c3', 60), 2: info('e1g1', 45), 3: info('b5c6', 30), 4: info('a2a3', -40) };
        // Jugada del nivell: Cc3 (60). Dins de la finestra de 40: O-O i Axc6; a3 (-40) queda fora.
        expect(TV.tvPickStyledMove(Chess, RUY, infos, 'b1c3', 'wall')).toEqual(expect.objectContaining({ uci: 'e1g1', changed: true }));
        expect(TV.tvPickStyledMove(Chess, RUY, infos, 'b1c3', 'hunter').uci).toBe('b5c6');
        expect(TV.tvPickStyledMove(Chess, RUY, infos, 'b1c3', 'strategist')).toEqual(expect.objectContaining({ uci: 'b1c3', changed: false }));
        expect(TV.tvPickStyledMove(Chess, RUY, infos, 'b1c3', 'hunter', 20).uci).toBe('b1c3');
        // Si el nivell ha triat una jugada fluixa, el perfil no la millora fora de la finestra.
        expect(TV.tvPickStyledMove(Chess, RUY, infos, 'a2a3', 'hunter').uci).toBe('a2a3');
    });
    test('amb mats, una jugada del nivell que no és a les línies o sense perfil, mana el nivell', () => {
        const mate = { 1: info('b5c6', 3, 'mate'), 2: info('b1c3', 50) };
        expect(TV.tvPickStyledMove(Chess, RUY, mate, 'b1c3', 'hunter').uci).toBe('b1c3');
        expect(TV.tvPickStyledMove(Chess, RUY, { 1: info('b1c3', 50) }, 'e1g1', 'wall').uci).toBe('e1g1');
        expect(TV.tvPickStyledMove(Chess, RUY, { 1: info('b1c3', 50), 2: info('e1g1', 50) }, 'b1c3', null).uci).toBe('b1c3');
        expect(TV.tvPickStyledMove(Chess, RUY, {}, 'b1c3', 'wall').uci).toBe('b1c3');
    });
});

describe('obertures que desequilibren aviat', () => {
    const list = [
        { name: 'Obertura Catalana', eco: 'E01', moves: ['d4'] },
        { name: 'Gambit de Dama Refusat', eco: 'D06', moves: ['d4'] },
        { name: 'Gambit de Rei', eco: 'C21', moves: ['e4'] },
        { name: 'Sistema Londres', eco: 'D02', moves: ['d4'] },
        { name: 'Siciliana Najdorf', eco: 'B90', moves: ['e4'] }
    ];
    test('gambits, partides obertes i sicilianes, sí; el Gambit de Dama i les posicionals, no', () => {
        expect(list.map(TV.tvIsSharpOpening)).toEqual([false, false, true, false, true]);
        expect(TV.tvIsSharpOpening({ name: 'Contragambit Albin', eco: 'D08' })).toBe(true);
        expect(TV.tvIsSharpOpening(null)).toBe(false);
    });
    test('amb sharp, la rotació salta a la següent obertura que desequilibra; sense, segueix igual', () => {
        expect(TV.tvPickOpening(list, 0)).toEqual({ opening: list[0], nextIndex: 1 });
        expect(TV.tvPickOpening(list, 0, { sharp: true })).toEqual({ opening: list[2], nextIndex: 3 });
        expect(TV.tvPickOpening(list, 3, { sharp: true })).toEqual({ opening: list[4], nextIndex: 0 });
        const quiet = list.filter(o => !TV.tvIsSharpOpening(o));
        expect(TV.tvPickOpening(quiet, 1, { sharp: true })).toEqual({ opening: quiet[1], nextIndex: 2 });
    });
});

// ---------------------------------------------------------------------------
// 4. Comentaris verificats
// ---------------------------------------------------------------------------
function play(fen, uci) {
    const g = new Chess(fen);
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    if (!mv) throw new Error('jugada il·legal ' + uci);
    return { move: mv, fenAfter: g.fen(), chess: g };
}
function candidates(fen, uci, extra) {
    const p = play(fen, uci);
    return TV.tvCommentCandidates(Object.assign({
        ChessCtor: Chess, fenBefore: fen, fenAfter: p.fenAfter, move: p.move, tier: 'mid', ply: 30,
        end: TV.tvGameEnd(p.chess)
    }, extra || {}));
}
function analysis(fen, scoreW, bestUci, depth, pv) {
    const turn = fen.split(' ')[1];
    const raw = turn === 'b' ? { type: scoreW.type, value: -scoreW.value } : scoreW;
    return TV.tvBuildAnalysis(fen, { 1: { depth: depth || 12, type: raw.type, value: raw.value, pv: pv || [bestUci] } }, bestUci);
}
const kinds = (list) => list.map(c => c.kind);

describe('comentaris basats en fets verificats', () => {
    test('forquilla amb escac: «El cavall ataca alhora el rei i la dama»', () => {
        const list = candidates('q3k3/8/8/3N4/8/8/8/6K1 w - - 0 1', 'd5c7');
        expect(list[0].kind).toBe('fork-check');
        expect(list[0].text).toBe('Forquilla amb escac: el cavall blanc ataca el rei i la dama.');
        // Sense anàlisi no es diu que es guanyi res.
        expect(list[0].text).not.toMatch(/guanyar/);
    });

    test('el guany de la peça només es diu si l\'anàlisi l\'avala', () => {
        const fen = 'q3k3/8/8/3N4/8/8/8/6K1 w - - 0 1';
        const p = play(fen, 'd5c7');
        const before = analysis(fen, { type: 'cp', value: 0 }, 'd5c7');
        const after = analysis(p.fenAfter, { type: 'cp', value: 650 }, 'e8d8', 14, ['e8d8', 'c7a8']);
        const list = candidates(fen, 'd5c7', { before: before, after: after });
        expect(list[0].text).toMatch(/Segons l'anàlisi, les blanques poden guanyar la dama\./);
    });

    test('enroc: torres connectades només si ho estan de debò', () => {
        expect(candidates('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1g1').find(c => c.kind === 'castle').text)
            .toBe('Les blanques han enrocat curt i han connectat les torres.');
        expect(candidates('4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1', 'e1g1').find(c => c.kind === 'castle').text)
            .toBe('Les blanques han enrocat curt.');
        expect(candidates('4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1', 'e1g1', { tier: 'basic' }).find(c => c.kind === 'castle').text)
            .toMatch(/el rei s'aparta del centre/);
    });

    test('peça atacada però defensada: cap amenaça ni cap «guany»', () => {
        const defended = candidates('4k3/8/4p3/3n4/8/8/8/4KB2 w - - 0 1', 'f1c4');
        expect(kinds(defended)).not.toContain('threat');
        defended.forEach(c => expect(c.text).not.toMatch(/guany|perd/));
        const loose = candidates('4k3/8/8/3n4/8/8/8/4KB2 w - - 0 1', 'f1c4');
        const threat = loose.find(c => c.kind === 'threat');
        expect(threat.text).toBe('L\'alfil blanc ataca el cavall negre, que no està defensat.');
    });

    test('una peça clavada al rei no amenaça res', () => {
        // La torre d'e4 «veu» el cavall de b4, però capturar-lo deixaria el rei
        // en escac de la torre d'e8 (defensada pel rei negre): no és cap amenaça.
        const list = candidates('4rk2/8/8/8/1n6/3P4/4R3/4K3 w - - 0 1', 'e2e4');
        expect(kinds(list)).not.toContain('threat');
        // Amb la torre negra indefensa, en canvi, sí que n'hi ha una de real.
        const loose = candidates('4r1k1/8/8/8/1n6/3P4/4R3/4K3 w - - 0 1', 'e2e4');
        expect(loose.find(c => c.kind === 'threat').text).toBe('La torre blanca ataca la torre negra, que no està defensada.');
    });

    test('atac doble sense escac: el peó ataca alhora dues peces', () => {
        const list = candidates('4k3/8/8/2n1b3/8/2PP4/8/4K3 w - - 0 1', 'd3d4');
        expect(list.find(c => c.kind === 'fork').text).toBe('Forquilla del peó: ataca alhora el cavall i l\'alfil.');
        // Si el peó queda penjat (l'alfil se'l menja sense resposta), no es ven com a amenaça.
        expect(kinds(candidates('4k3/8/8/2n1b3/8/3P4/8/4K3 w - - 0 1', 'd3d4'))).not.toContain('threat');
        expect(kinds(candidates('4k3/8/8/2n1b3/8/3P4/8/4K3 w - - 0 1', 'd3d4'))).not.toContain('fork');
    });

    test('recaptura: «és un canvi de cavalls»', () => {
        const start = '4k3/8/2n5/4N3/3P4/8/8/4K3 b - - 0 1';
        const first = play(start, 'c6e5');
        const list = TV.tvCommentCandidates({
            ChessCtor: Chess, fenBefore: first.fenAfter, fenAfter: play(first.fenAfter, 'd4e5').fenAfter,
            move: play(first.fenAfter, 'd4e5').move, prevMove: first.move, tier: 'mid', ply: 30
        });
        expect(list.find(c => c.kind === 'recapture').text).toBe('Les blanques tornen a capturar a e5: és un canvi de cavalls.');
    });

    test('captura que es pot recuperar: només amb la millor resposta de l\'anàlisi', () => {
        const fen = '3qk3/8/8/3p4/4P3/8/8/4K3 w - - 0 1';
        const p = play(fen, 'e4d5');
        const reliable = candidates(fen, 'e4d5', { after: analysis(p.fenAfter, { type: 'cp', value: 0 }, 'd8d5') });
        expect(reliable.find(c => c.kind === 'capture-recoverable').text)
            .toBe('Les blanques capturen el peó; les negres el poden recuperar.');
        const shallow = candidates(fen, 'e4d5', { after: analysis(p.fenAfter, { type: 'cp', value: 0 }, 'd8d5', 6) });
        expect(kinds(shallow)).not.toContain('capture-recoverable');
    });

    test('peça capturada sense cap defensa', () => {
        const list = candidates('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd1d5');
        expect(list.find(c => c.kind === 'capture-free').text).toBe('Les blanques capturen el cavall negre, que no estava defensat.');
        const defended = candidates('4k3/8/4p3/3n4/8/8/8/3RK3 w - - 0 1', 'd1d5');
        expect(kinds(defended)).not.toContain('capture-free');
    });

    test('alternativa millor: només amb anàlisi fiable i valoracions del mateix bàndol', () => {
        const fen = new Chess().fen();
        const p = play(fen, 'g2g4');
        const before = analysis(fen, { type: 'cp', value: 30 }, 'e2e4');
        const after = analysis(p.fenAfter, { type: 'cp', value: -250 }, 'e7e5');
        const ok = candidates(fen, 'g2g4', { before: before, after: after, ply: 0 });
        expect(ok.find(c => c.kind === 'missed').text).toMatch(/^Per a les blanques, l'anàlisi preferia .+\.$/);
        expect(ok.find(c => c.kind === 'missed').text).not.toMatch(/[a-h][1-8][a-h][1-8]/);
        const shallow = candidates(fen, 'g2g4', { before: before, after: analysis(p.fenAfter, { type: 'cp', value: -250 }, 'e7e5', 7), ply: 0 });
        expect(kinds(shallow)).not.toContain('missed');
        // Pèrdua petita: res a dir.
        const small = candidates(fen, 'g2g4', { before: before, after: analysis(p.fenAfter, { type: 'cp', value: -60 }, 'e7e5'), ply: 0 });
        expect(kinds(small)).not.toContain('missed');
    });

    test('les negres també es mesuren des del seu bàndol', () => {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const p = play(fen, 'g7g5');
        const before = analysis(fen, { type: 'cp', value: 30 }, 'e7e5');
        const after = analysis(p.fenAfter, { type: 'cp', value: 320 }, 'd2d4');
        expect(candidates(fen, 'g7g5', { before: before, after: after, ply: 1 }).find(c => c.kind === 'missed').text)
            .toMatch(/^Per a les negres/);
        // Si l'avantatge blanc es redueix, les negres NO han perdut res.
        const better = analysis(p.fenAfter, { type: 'cp', value: -300 }, 'd2d4');
        expect(kinds(candidates(fen, 'g7g5', { before: before, after: better, ply: 1 }))).not.toContain('missed');
    });

    test('mats anunciats per l\'anàlisi, tractats a part', () => {
        const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
        const p = play(fen, 'g2g3');
        const before = analysis(fen, { type: 'mate', value: 1 }, 'd1d8');
        const after = analysis(p.fenAfter, { type: 'cp', value: 450 }, 'h7h6');
        const list = candidates(fen, 'g2g3', { before: before, after: after });
        expect(list.find(c => c.kind === 'missed-mate').text).toMatch(/^L'anàlisi veia mat en 1 per a les blanques amb una altra jugada: /);
        expect(kinds(list)).not.toContain('missed');
    });

    test('coronació i escac i mat', () => {
        expect(candidates('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', 'e7e8q')[0].text).toBe('El peó blanc corona a e8 i es converteix en dama.');
        const g = new Chess();
        ['f3', 'e5', 'g4'].forEach(m => g.move(m));
        const list = candidates(g.fen(), 'd8h4');
        expect(list[0].kind).toBe('mate');
        expect(list[0].text).toBe('Escac i mat. Guanyen les negres.');
    });

    test('desenvolupament: cada peça que surt de casa és un fet propi, amb la casella', () => {
        const fen = new Chess().fen();
        expect(candidates(fen, 'g1f3', { ply: 0 }).find(c => c.kind === 'development').text).toBe('Les blanques desenvolupen el cavall cap a f3, que controla les caselles centrals d4 i e5.');
        expect(candidates(fen, 'b2b3', { ply: 0 }).map(c => c.kind)).not.toContain('development');
        // Una peça que ja havia sortit no «es desenvolupa» de nou.
        const later = new Chess();
        ['Nf3', 'e5', 'Ng5', 'd6'].forEach(m => later.move(m));
        expect(kinds(candidates(later.fen(), 'g5f3', { ply: 4 }))).not.toContain('development');
    });

    test('selecció: es poden comentar jugades consecutives; la mateixa idea no es repeteix', () => {
        const dev = { kind: 'development', priority: 42, text: 'Les blanques desenvolupen el cavall cap a f3.', variants: ['Les blanques desenvolupen el cavall cap a f3.'], key: 'dev:w:g1', sig: 'f3', family: 'development', tags: { squares: ['f3'] }, explanatory: true };
        const check = { kind: 'check', priority: 36, text: 'L\'alfil blanc fa escac des de b5.', variants: ['L\'alfil blanc fa escac des de b5.'], key: 'check:w:b5', sig: 'b5', family: 'check', tags: { squares: ['b5'] }, explanatory: false };
        const mate = { kind: 'mate', priority: 100, text: 'Escac i mat. Guanyen les blanques.', variants: ['Escac i mat. Guanyen les blanques.'], key: 'mate', sig: 'x', family: 'mate', tags: { squares: [] }, explanatory: true };
        expect(TV.tvChooseComment([dev], [], 0, 'w').text).toBe(dev.text);
        // Just després d'un altre comentari: ja NO hi ha silenci obligatori.
        expect(TV.tvChooseComment([check], [{ ply: 0, kind: 'development', text: 'x', color: 'w' }], 1, 'b').text).toBe(check.text);
        // La mateixa idea en el mateix estat, dins de la finestra: no aporta res.
        expect(TV.tvChooseComment([dev], [{ ply: 0, kind: 'development', text: 'altra', key: 'dev:w:g1', sig: 'f3' }], 4, 'w')).toBeNull();
        // La mateixa frase dita fa poc: tampoc.
        expect(TV.tvChooseComment([dev], [{ ply: 0, kind: 'development', text: dev.text }], 6, 'w')).toBeNull();
        // Els importants passen sempre.
        expect(TV.tvChooseComment([mate], [{ ply: 9, kind: 'check', text: 'z' }], 10, 'w').text).toBe(mate.text);
        expect(TV.tvChooseComment([], [], 3, 'w')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 5. Text parlat
// ---------------------------------------------------------------------------
describe('text parlat sense codis SAN ni símbols', () => {
    test('jugades amb número, SAN amb peça, enrocs i coronacions', () => {
        expect(TV.tvSpeechText('1.d4 ocupa el centre.')).toBe('peó a d 4 ocupa el centre.');
        expect(TV.tvSpeechText('...Nf6 desenvolupa una peça.')).toBe('cavall a f 6 desenvolupa una peça.');
        expect(TV.tvSpeechText('6.O-O completa el desenvolupament.')).toBe('enroc curt completa el desenvolupament.');
        expect(TV.tvSpeechText('3...exd4 i Nxd4+')).toBe('peó de la columna e captura a d 4 i cavall captura a d 4 amb escac');
        expect(TV.tvSpeechText('e8=Q#')).toBe('peó a e 8 i corona dama amb escac i mat');
        expect(TV.tvSpeechText('Siciliana: Rossolimo (Bb5)')).toBe('Siciliana: Rossolimo alfil a b 5');
        expect(TV.tvSpeechText('½-½ · Taules')).toBe('taules Taules');
    });

    test('la lectura tradueix pawn i pawns també dins dels textos rebuts', () => {
        expect(TV.tvSpeechText('Pawn a e4: captura un pawn i defensa dos pawns.'))
            .toBe('Peó a e 4: captura un peó i defensa dos peons.');
    });

    test('cap comentari generat no deixa SAN ni símbols al text parlat', () => {
        const samples = [
            candidates('q3k3/8/8/3N4/8/8/8/6K1 w - - 0 1', 'd5c7'),
            candidates('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1g1'),
            candidates('4k3/8/8/3n4/8/8/8/4KB2 w - - 0 1', 'f1c4'),
            candidates('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', 'e7e8q')
        ];
        // Frases reals del repertori (porten SAN).
        const repertoireLike = ['1.d4 ocupa el centre i prepara una partida posicional amb espai estable.',
            '...O-O posa el rei negre segur abans de decidir la tensió de c4 i d5.'];
        const texts = samples.flat().map(c => c.text).concat(repertoireLike);
        texts.forEach((t) => {
            const spoken = TV.tvSpeechText(t);
            expect(spoken).not.toMatch(/\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8]/);
            expect(spoken).not.toMatch(/\b[a-h][1-8]\b/);
            expect(spoken).not.toMatch(/O-O|[+#=·→]/);
        });
    });
});

// ---------------------------------------------------------------------------
// 6. Veu catalana (speechSynthesis simulada: NO és una prova de veu real)
// ---------------------------------------------------------------------------
function fakeSynth(voices) {
    const s = {
        voices: voices || [],
        spoken: [],
        cancelCount: 0,
        current: null,
        listeners: {},
        getVoices() { return this.voices; },
        addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
        speak(u) { this.spoken.push(u); this.current = u; },
        cancel() {
            this.cancelCount++;
            const u = this.current;
            this.current = null;
            if (u && u.onerror) setTimeout(() => u.onerror({ error: 'interrupted' }), 0);
        },
        finish() { const u = this.current; this.current = null; if (u && u.onend) u.onend(); },
        fire(ev) { (this.listeners[ev] || []).forEach(fn => fn()); }
    };
    return s;
}
class FakeUtterance { constructor(text) { this.text = text; } }
const CA = { name: 'Montserrat', lang: 'ca-ES', localService: true };
const ES = { name: 'Mónica', lang: 'es-ES', localService: true };
const EN = { name: 'Samantha', lang: 'en-US', localService: true };

describe('veu catalana opcional', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function voice(synth, pref) {
        let saved = pref;
        const v = TV.createTvVoice({
            speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance,
            loadPref: () => saved, savePref: (p) => { saved = p; }
        });
        v._saved = () => saved;
        return v;
    }

    test('selecció: només codis ca / variants catalanes', () => {
        expect(TV.tvPickCatalanVoice([ES, EN])).toBeNull();
        expect(TV.tvPickCatalanVoice([ES, CA, EN])).toBe(CA);
        expect(TV.tvIsCatalanVoice({ lang: 'ca-ES-valencia' })).toBe(true);
        expect(TV.tvIsCatalanVoice({ lang: 'ca_AD' })).toBe(true);
        expect(TV.tvIsCatalanVoice({ lang: 'ca' })).toBe(true);
        expect(TV.tvIsCatalanVoice({ lang: 'cs-CZ' })).toBe(false);
        expect(TV.tvIsCatalanVoice({ name: 'Català', lang: 'es-ES' })).toBe(false);
    });

    test('primer accés: cal activar-la; la preferència es recorda', () => {
        const v = voice(fakeSynth([CA]), null);
        expect(v.needsActivation()).toBe(true);
        expect(v.isOn()).toBe(false);
        v.setOn(true);
        expect(v._saved()).toBe('on');
        expect(voice(fakeSynth([CA]), 'on').isOn()).toBe(true);
    });

    test('sense veu catalana: no parla i mai no tria una veu castellana', async () => {
        const synth = fakeSynth([ES, EN]);
        const v = voice(synth, 'on');
        expect(v.status()).toBe('no-voice');
        const r = await v.speak('Escac al rei negre.');
        expect(r).toEqual({ spoken: false, reason: 'no-voice' });
        expect(synth.spoken).toHaveLength(0);
    });

    test('veus que arriben tard (voiceschanged)', async () => {
        const synth = fakeSynth([]);
        const v = voice(synth, 'on');
        expect(v.status()).toBe('loading');
        synth.voices = [ES, CA];
        synth.fire('voiceschanged');
        expect(v.status()).toBe('ready');
        const p = v.speak('Les blanques han enrocat curt.');
        expect(synth.spoken).toHaveLength(1);
        expect(synth.spoken[0].voice).toBe(CA);
        expect(synth.spoken[0].lang).toBe('ca-ES');
        synth.finish();
        await expect(p).resolves.toEqual({ spoken: true, reason: 'end' });
    });

    test('navegador sense cap veu ni voiceschanged: passat el marge, «cap veu catalana»', () => {
        const synth = fakeSynth([]);
        const v = voice(synth, 'on');
        expect(v.status()).toBe('loading');
        jest.advanceTimersByTime(3500);
        expect(v.status()).toBe('no-voice');
        // Si després n'arriba una de catalana, es fa servir.
        synth.voices = [CA];
        synth.fire('voiceschanged');
        expect(v.status()).toBe('ready');
    });

    test('veus que arriben tard sense cap esdeveniment: es tornen a consultar', () => {
        const synth = fakeSynth([]);
        synth.addEventListener = undefined;
        const v = voice(synth, 'on');
        synth.voices = [CA];
        jest.advanceTimersByTime(1300);
        expect(v.status()).toBe('ready');
    });

    test('mai no s\'acumulen locucions: la nova talla l\'anterior', async () => {
        const synth = fakeSynth([CA]);
        const v = voice(synth, 'on');
        const first = v.speak('Primer comentari.');
        const second = v.speak('Segon comentari.');
        await expect(first).resolves.toEqual({ spoken: false, reason: 'stopped' });
        expect(synth.cancelCount).toBeGreaterThanOrEqual(1);
        expect(synth.current.text).toBe('Segon comentari.');
        // L'error «interrupted» de la primera no resol la segona.
        jest.advanceTimersByTime(1);
        expect(v.isSpeaking()).toBe(true);
        synth.finish();
        await expect(second).resolves.toEqual({ spoken: true, reason: 'end' });
    });

    test('apagar la veu la silencia a l\'instant', async () => {
        const synth = fakeSynth([CA]);
        const v = voice(synth, 'on');
        const p = v.speak('Un comentari llarg que no s\'ha d\'acabar.');
        v.setOn(false);
        await expect(p).resolves.toEqual({ spoken: false, reason: 'stopped' });
        expect(synth.current).toBeNull();
        expect(v._saved()).toBe('off');
        await expect(v.speak('Res.')).resolves.toEqual({ spoken: false, reason: 'off' });
    });

    test('temps màxim: si el navegador no avisa del final, no es bloqueja', async () => {
        const synth = fakeSynth([CA]);
        const v = voice(synth, 'on');
        const p = v.speak('Comentari.', { maxWaitMs: 5000 });
        const cancelsBefore = synth.cancelCount;
        jest.advanceTimersByTime(4999);
        expect(v.isSpeaking()).toBe(true);
        jest.advanceTimersByTime(1);
        await expect(p).resolves.toEqual({ spoken: false, reason: 'timeout' });
        expect(synth.cancelCount).toBe(cancelsBefore + 1);
        expect(v.isSpeaking()).toBe(false);
    });

    test('una fallada de veu (not-allowed) no bloqueja res i queda indicada', async () => {
        const synth = fakeSynth([CA]);
        const v = voice(synth, 'on');
        const p = v.speak('Comentari.');
        synth.current.onerror({ error: 'not-allowed' });
        await expect(p).resolves.toEqual({ spoken: false, reason: 'not-allowed' });
        expect(v.status()).toBe('blocked');
    });

    function fakeNeural(behaviour) {
        const n = {
            calls: [], prefetched: [], stops: 0, ok: true, speaking: false,
            available: () => n.ok,
            prefetch: (t, id) => n.prefetched.push([t, id]),
            speak: (t, id, o) => { n.calls.push([t, id, o]); return Promise.resolve(behaviour ? behaviour(t) : { spoken: true, reason: 'end' }); },
            stop: () => { n.stops++; },
            isSpeaking: () => n.speaking
        };
        return n;
    }

    test('veu neuronal Matxa del perfil: té prioritat sobre la del dispositiu', async () => {
        const synth = fakeSynth([CA]);
        const neural = fakeNeural();
        const v = TV.createTvVoice({ speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance, loadPref: () => 'on',
            neural: neural, getNeuralVoiceId: () => 'matxa:central:elia', getNeuralRate: () => 1.1,
            getNeuralEffects: () => ({ profile: 'radio', intensity: 0.7, clarity: 0.6, volume: 0.8 }) });
        expect(v.engine()).toBe('neural');
        await expect(v.speak('Escac al rei negre.')).resolves.toEqual({ spoken: true, reason: 'end' });
        expect(neural.calls[0][1]).toBe('matxa:central:elia');
        expect(neural.calls[0][2].rate).toBe(1.1);
        expect(neural.calls[0][2].effects).toEqual({ profile: 'radio', intensity: 0.7, clarity: 0.6, volume: 0.8 });
        expect(synth.spoken).toHaveLength(0);
        v.prefetch('Les blanques han enrocat curt.');
        expect(neural.prefetched[0]).toEqual(['Les blanques han enrocat curt.', 'matxa:central:elia']);
        v.setOn(false);
        expect(neural.stops).toBeGreaterThan(0);
    });

    test('si Matxa falla, es llegeix amb la veu catalana del dispositiu (mai una altra llengua)', async () => {
        const synth = fakeSynth([CA, ES]);
        const neural = fakeNeural(() => ({ spoken: false, reason: 'network' }));
        const v = TV.createTvVoice({ speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance, loadPref: () => 'on',
            neural: neural, getNeuralVoiceId: () => 'matxa:central:elia' });
        const p = v.speak('Escac al rei negre.');
        await Promise.resolve(); await Promise.resolve();
        expect(synth.spoken).toHaveLength(1);
        expect(synth.spoken[0].voice).toBe(CA);
        expect(v.engine()).toBe('system'); // el fons de Matxa s'atura durant l'alternativa local
        synth.finish();
        await expect(p).resolves.toEqual({ spoken: true, reason: 'end' });
        // Sense veu catalana al dispositiu i amb Matxa caigut: només text.
        const neural2 = fakeNeural();
        neural2.ok = false;
        const v2 = TV.createTvVoice({ speechSynthesis: fakeSynth([ES]), SpeechSynthesisUtterance: FakeUtterance, loadPref: () => 'on',
            neural: neural2, getNeuralVoiceId: () => 'matxa:central:elia' });
        expect(v2.status()).toBe('no-voice');
        expect(v2.neuralUnavailable()).toBe(true);
        await expect(v2.speak('Hola.')).resolves.toEqual({ spoken: false, reason: 'no-voice' });
        expect(neural2.calls).toHaveLength(0);
    });

    test('sense perfil neuronal: es manté la veu del dispositiu', () => {
        const neural = fakeNeural();
        const v = TV.createTvVoice({ speechSynthesis: fakeSynth([CA]), SpeechSynthesisUtterance: FakeUtterance, loadPref: () => 'on',
            neural: neural, getNeuralVoiceId: () => null });
        expect(v.engine()).toBe('system');
        v.prefetch('Hola');
        expect(neural.prefetched).toHaveLength(0);
    });

    test('sense speechSynthesis: no suportada i sense errors', async () => {
        const v = TV.createTvVoice({});
        expect(v.status()).toBe('unsupported');
        await expect(v.speak('Hola')).resolves.toEqual({ spoken: false, reason: 'unsupported' });
        expect(() => v.stop()).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 7. Bucle de la partida (motor fals, temporitzadors simulats)
// ---------------------------------------------------------------------------
function fakeEngine(opts) {
    const o = opts || {};
    const pending = new Set();
    const engine = {
        jobs: [],
        newGames: 0,
        destroyed: 0,
        ready: () => Promise.resolve(o.caps || SKILL_CAPS),
        failed: () => false,
        newGame() { engine.newGames++; },
        request(job) {
            engine.jobs.push(job);
            return new Promise((resolve) => {
                const entry = { job: job, cancelled: false };
                pending.add(entry);
                setTimeout(() => {
                    pending.delete(entry);
                    if (entry.cancelled && !o.ignoreCancel) { resolve(null); return; }
                    const g = new Chess();
                    const tail = job.position.split(' moves ')[1];
                    (tail ? tail.split(' ') : []).forEach(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
                    if (job.tag.kind === 'move' && o.moveInfos) { const r = o.moveInfos(g); if (r) { resolve(r); return; } }
                    const legal = g.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).sort();
                    let best = legal[0] || null;
                    if (job.tag.kind === 'move' && o.script && o.script[g.history().length]) best = o.script[g.history().length];
                    // Valoració (des de qui mou) que torna l'anàlisi; per defecte, igualada.
                    const value = job.tag.kind === 'analysis' && o.evalWhite ? o.evalWhite(g.history().length) * (g.turn() === 'w' ? 1 : -1) : 0;
                    resolve({ bestUci: best, infos: best ? { 1: { depth: 12, multipv: 1, type: 'cp', value: value, bound: null, pv: [best] } } : {} });
                }, o.delay || 200);
            });
        },
        cancelAll() { pending.forEach(e => { e.cancelled = true; }); },
        destroy() { engine.destroyed++; pending.forEach(e => { e.cancelled = true; }); },
        pendingCount: () => pending.size
    };
    return engine;
}

function makeController(extra) {
    const renders = [];
    const results = [];
    let savedPrefs = null;
    const viewerInput = { calibrated: false, roc: 900 };
    const ctl = TV.createTvController(Object.assign({
        ChessCtor: Chess,
        engine: fakeEngine(),
        voice: null,
        view: { render: s => renders.push(s), result: r => results.push(r) },
        getViewer: () => viewerInput,
        getOpenings: () => [],
        loadPrefs: () => savedPrefs,
        savePrefs: (p) => { savedPrefs = JSON.parse(JSON.stringify(p)); },
        random: () => 0.5
    }, extra || {}));
    return { ctl, renders, results, viewerInput, prefs: () => savedPrefs };
}

const FOOLS = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

describe('bucle de Stockfish TV', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test.each(['slow', 'calm', 'quick'])('marca la peça durant 1500 ms abans de moure-la, amb ritme %s', async speed => {
        const { ctl, renders } = makeController({ engine: fakeEngine({ script: FOOLS }), loadPrefs: () => ({ speed }) });
        await ctl.open();
        const fen = ctl.state().game.fen;
        await jest.advanceTimersByTimeAsync(C.INTRO_DELAY_MS - 1);
        expect(ctl.state().movePreview).toBeNull();
        await jest.advanceTimersByTimeAsync(1);
        expect(ctl.state().movePreview).toEqual({ from: 'f2', piece: 'p', color: 'w' });
        expect(ctl.state().game.fen).toBe(fen);
        await jest.advanceTimersByTimeAsync(1499);
        expect(ctl.state().game.moves).toHaveLength(0);
        expect(ctl.state().movePreview.from).toBe('f2');
        await jest.advanceTimersByTimeAsync(1);
        expect(ctl.state().movePreview).toBeNull();
        expect(ctl.state().game.moves.map(m => m.uci)).toEqual(['f2f3']);
        expect(renders.some(s => s.movePreview && s.game.fen === fen)).toBe(true);
        ctl.close();
    });

    test.each(['pause', 'hide', 'close', 'newGame', 'takeControl'])('cancel·la el marcatge i la jugada pendent en fer %s', async action => {
        const { ctl } = makeController({ engine: fakeEngine({ script: FOOLS, ignoreCancel: true }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(C.INTRO_DELAY_MS + 500);
        expect(ctl.state().movePreview.from).toBe('f2');
        if (action === 'hide') ctl.setHidden(true); else ctl[action]();
        expect(ctl.state().movePreview).toBeNull();
        await jest.advanceTimersByTimeAsync(1500);
        expect(ctl.state().game.moves).toHaveLength(0);
        expect(ctl.state().movePreview).toBeNull();
        ctl.close();
    });

    test('reprendre després del marcatge torna a mostrar 1500 ms complets, sense duplicar la jugada', async () => {
        const { ctl } = makeController({ engine: fakeEngine({ script: FOOLS }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(C.INTRO_DELAY_MS + 1000);
        ctl.pause();
        await jest.advanceTimersByTimeAsync(5000);
        ctl.resume();
        await jest.advanceTimersByTimeAsync(C.RESUME_DELAY_MS);
        expect(ctl.state().movePreview.from).toBe('f2');
        await jest.advanceTimersByTimeAsync(1499);
        expect(ctl.state().game.moves).toHaveLength(0);
        await jest.advanceTimersByTimeAsync(1);
        expect(ctl.state().game.moves.map(m => m.uci)).toEqual(['f2f3']);
        ctl.close();
    });

    test('cada partida té el nivell FIXAT; els ajustos s\'apliquen a la següent', async () => {
        const engine = fakeEngine({ script: FOOLS });
        const { ctl, results, viewerInput } = makeController({ engine: engine, loadPrefs: () => ({ unequal: false }) });
        await ctl.open();
        expect(ctl.state().game.level.value).toBe(0);
        await jest.advanceTimersByTimeAsync(6000);
        ctl.adjust('harder');
        ctl.adjust('harder');
        expect(ctl.state().game.level.value).toBe(0);
        expect(ctl.state().nextLevel).toBe(2);
        // Totes les peticions de jugada de la partida 1 van amb el nivell 0.
        await jest.advanceTimersByTimeAsync(40000);
        const g1Moves = engine.jobs.filter(j => j.tag.kind === 'move' && j.tag.gameId === 1);
        expect(g1Moves.length).toBeGreaterThan(0);
        g1Moves.forEach(j => expect(j.strength).toEqual(['setoption name Skill Level value 0']));
        // Final i resultat.
        expect(results[0].end).toEqual(expect.objectContaining({ result: '0-1', reason: 'checkmate' }));
        // L'anàlisi va SEMPRE sense límit.
        engine.jobs.filter(j => j.tag.kind === 'analysis').forEach(j => expect(j.strength).toEqual(['setoption name Skill Level value 20']));
        // Pausa breu i partida següent amb el nivell nou.
        await jest.advanceTimersByTimeAsync(C.NEXT_GAME_DELAY_MS * 1.2 + 100);
        expect(ctl.state().game.id).toBe(2);
        expect(ctl.state().game.level.value).toBe(2);
        expect(ctl.state().game.end).toBeNull();
        expect(engine.newGames).toBe(2);
        // El nivell de l'usuari no s'ha tocat.
        expect(viewerInput).toEqual({ calibrated: false, roc: 900 });
        ctl.close();
    });

    test('una partida decidida acaba amb l\'abandonament del bàndol que perd i passa al ritme àgil', async () => {
        // Una línia legal sense repeticions; les negres tenen un avantatge
        // decisiu a partir de la semijugada 30.
        const line = [], g0 = new Chess(), seen = new Set([g0.fen().split(' ').slice(0, 4).join(' ')]);
        while (line.length < 150) {
            const next = g0.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).sort().find(u => {
                g0.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
                const key = g0.fen().split(' ').slice(0, 4).join(' '), fresh = !seen.has(key) && !g0.game_over();
                g0.undo(); return fresh;
            });
            g0.move({ from: next.slice(0, 2), to: next.slice(2, 4), promotion: next[4] });
            seen.add(g0.fen().split(' ').slice(0, 4).join(' ')); line.push(next);
        }
        const engine = fakeEngine({ script: line, delay: 20, evalWhite: plies => plies >= 30 ? -800 : 0 });
        const { ctl, results } = makeController({ engine, loadPrefs: () => ({ speed: 'slow' }) });
        await ctl.open();
        for (let t = 0; t < 500 && !ctl.state().game.end; t++) await jest.advanceTimersByTimeAsync(5000);
        const g = ctl.state().game;
        expect(g.end).toEqual(expect.objectContaining({ result: '0-1', winner: 'b', reason: 'resign' }));
        expect(g.end.text).toMatch(/^Les blanques abandonen/);
        expect(g.moves.length).toBe(C.RESIGN_MIN_PLY);
        expect(results[0].end.reason).toBe('resign');
        ctl.close();
    });

    test('el ritme àgil només quan la partida està decidida', async () => {
        const engine = fakeEngine({ delay: 20, evalWhite: plies => plies >= 4 ? 900 : 0 });
        const { ctl } = makeController({ engine, loadPrefs: () => ({ speed: 'slow' }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(C.INTRO_DELAY_MS + 200);
        const times = [];
        let last = ctl.state().game.moves.length;
        for (let t = 0; t < 2000 && times.length < 6; t++) {
            await jest.advanceTimersByTimeAsync(100);
            const n = ctl.state().game.moves.length;
            if (n !== last) { times.push({ ply: n, at: t * 100 }); last = n; }
        }
        const gaps = times.slice(1).map((x, i) => ({ ply: x.ply, gap: x.at - times[i].at }));
        // Amb la partida igualada, el ritme «Lent»; quan ja està decidida, l'«Àgil».
        gaps.filter(x => x.ply <= 4).forEach(x => expect(x.gap).toBeGreaterThanOrEqual(C.SPEEDS.slow.min));
        gaps.filter(x => x.ply >= 6).forEach(x => expect(x.gap).toBeLessThan(C.SPEEDS.slow.min));
        expect(gaps.some(x => x.ply >= 6)).toBe(true);
        ctl.close();
    });

    test('nivells desiguals: cada bàndol juga el seu nivell, la pantalla en mostra la mitjana i al final es revela', async () => {
        const engine = fakeEngine({ script: FOOLS });
        const { ctl, renders } = makeController({ engine });
        await ctl.open();
        const lv = ctl.state().game.level;
        // Amb random() = 0.5 el més fort és el negre: nivell 2 contra 0.
        expect(lv).toEqual(expect.objectContaining({ value: 0, sides: { w: 0, b: 2 }, stronger: 'b' }));
        expect(lv.label.short).toMatch(/^Nivell mitjà/);
        await jest.advanceTimersByTimeAsync(40000);
        const moves = engine.jobs.filter(j => j.tag.kind === 'move' && j.tag.gameId === 1);
        moves.filter(j => j.tag.ply % 2 === 0).forEach(j => expect(j.strength).toEqual(['setoption name Skill Level value 0']));
        moves.filter(j => j.tag.ply % 2 === 1).forEach(j => expect(j.strength).toEqual(['setoption name Skill Level value 2']));
        expect(moves.some(j => j.tag.ply % 2 === 1)).toBe(true);
        expect(ctl.state().game.end).toBeTruthy();
        expect(ctl.state().game.level.reveal).toBe('Les negres jugaven una mica més fort: nivell 2 contra nivell 0.');
        expect(renders.some(s => s.game && !s.game.end && /blanques|negres/i.test(s.game.level.label.long))).toBe(false);
        // Apagar-los s'aplica a la partida següent.
        ctl.setUnequal(false);
        expect(ctl.state().unequal).toBe(false);
        expect(ctl.state().game.level.sides).toEqual({ w: 0, b: 2 });
        ctl.newGame();
        expect(ctl.state().game.level.sides).toBeNull();
        expect(ctl.state().game.level.reveal).toBeNull();
        ctl.close();
    });

    test('perfils de joc: cada bàndol en té un de diferent, sense espòilers a la presentació, i trien la jugada del seu estil', async () => {
        const seq = [0.8, 0.1];
        const random = () => (seq.length ? seq.shift() : 0.5);
        const line = (uci, value) => ({ depth: 12, multipv: 1, type: 'cp', value, bound: null, pv: [uci] });
        const engine = fakeEngine({ delay: 20, moveInfos: g => g.history().length === 0
            ? { bestUci: 'a2a3', infos: { 1: line('a2a3', 20), 2: line('g1f3', 10), 3: line('h2h4', 5) } } : null });
        const openings = [{ eco: 'A00', name: 'Prova', moves: ['xx'] }];
        const { ctl } = makeController({ engine, random, getOpenings: () => openings, loadPrefs: () => ({ openingIndex: 0, unequal: false }) });
        await ctl.open();
        const g = ctl.state().game;
        // 0.8 → L'Estratega amb blanques; 0.1 → L'Atacant amb negres.
        expect(g.styles).toEqual({ w: 'strategist', b: 'attacker' });
        expect(g.comment.text).toContain('Stockfish');
        expect(g.comment.text).not.toContain("L'Estratega");
        expect(g.comment.text).not.toContain("L'Atacant");
        for (let t = 0; t < 40 && !ctl.state().game.moves.length; t++) await jest.advanceTimersByTimeAsync(1000);
        // El nivell volia a3; L'Estratega, entre jugades de qualitat semblant, desenvolupa el cavall.
        expect(ctl.state().game.moves[0].uci).toBe('g1f3');
        const job = engine.jobs.find(j => j.tag.kind === 'move');
        expect(job.multipv).toBe(C.STYLE_MULTIPV);
        // Apagar-los: la partida següent juga «com Stockfish», sense perfils.
        ctl.setProfiles(false);
        expect(ctl.state().profiles).toBe(false);
        ctl.newGame();
        expect(ctl.state().game.styles).toBeNull();
        ctl.close();
    });

    test('el comentari sempre correspon a la posició visible', async () => {
        const { ctl, renders } = makeController({ engine: fakeEngine({ script: FOOLS }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(40000);
        const withComment = renders.filter(s => s.game && s.game.comment && s.game.comment.kind !== 'intro');
        expect(withComment.length).toBeGreaterThan(0);
        withComment.forEach((s) => {
            expect(s.game.comment.fen).toBe(s.game.fen);
            expect(s.game.comment.gameId).toBe(s.game.id);
        });
        const last = withComment[withComment.length - 1];
        expect(last.game.comment.kind).toBe('mate');
        ctl.close();
    });

    test('pausa: atura càlcul i temporitzadors; en reprendre, sense jugades duplicades', async () => {
        // Motor que ignora la cancel·lació: el controlador ha de descartar igualment
        // el resultat obsolet.
        const engine = fakeEngine({ ignoreCancel: true, delay: 300 });
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(4200);
        const movesBefore = ctl.state().game.moves.length;
        ctl.pause();
        const jobsAtPause = engine.jobs.length;
        await jest.advanceTimersByTimeAsync(60000);
        expect(ctl.state().game.moves.length).toBe(movesBefore);
        expect(engine.jobs.length).toBe(jobsAtPause);
        expect(ctl.isActive()).toBe(false);
        ctl.resume();
        await jest.advanceTimersByTimeAsync(30000);
        const g = ctl.state().game;
        expect(g.moves.length).toBeGreaterThan(movesBefore);
        // L'historial mostrat és exactament el de la partida (cap jugada repetida
        // ni cap resultat antic colat).
        const replay = new Chess();
        g.moves.forEach(m => expect(replay.move(m.san)).not.toBeNull());
        expect(replay.fen()).toBe(g.fen);
        g.moves.forEach((m, i) => expect(m.ply).toBe(i));
        ctl.close();
    });

    test('pestanya oculta: res no calcula; en tornar es reprèn ordenadament', async () => {
        const engine = fakeEngine();
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(5000);
        ctl.setHidden(true);
        const jobs = engine.jobs.length;
        const moves = ctl.state().game.moves.length;
        await jest.advanceTimersByTimeAsync(120000);
        expect(engine.jobs.length).toBe(jobs);
        expect(ctl.state().game.moves.length).toBe(moves);
        ctl.setHidden(false);
        await jest.advanceTimersByTimeAsync(20000);
        expect(ctl.state().game.moves.length).toBeGreaterThan(moves);
        ctl.close();
        expect(engine.destroyed).toBe(1);
    });

    test('sortir i tornar: continua la mateixa partida', async () => {
        const { ctl } = makeController();
        await ctl.open();
        await jest.advanceTimersByTimeAsync(10000);
        const id = ctl.state().game.id;
        const n = ctl.state().game.moves.length;
        ctl.close();
        await jest.advanceTimersByTimeAsync(30000);
        expect(ctl.state().game.moves.length).toBe(n);
        await ctl.open();
        expect(ctl.state().game.id).toBe(id);
        await jest.advanceTimersByTimeAsync(15000);
        expect(ctl.state().game.moves.length).toBeGreaterThan(n);
        ctl.close();
    });

    test('obertura preparada: s\'identifica com a obertura de partida i alterna', async () => {
        const openings = [
            { eco: 'C60', name: 'Obertura Espanyola (Ruy López)', idea: 'Pressiona el cavall.', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
            { eco: 'D06', name: 'Gambit de Dama Refusat', moves: ['d4', 'd5', 'c4', 'e6'] }
        ];
        const { ctl, prefs } = makeController({ getOpenings: () => openings, loadPrefs: () => ({ openingIndex: 0, profiles: false }) });
        await ctl.open();
        const st = ctl.state();
        expect(st.game.opening).toEqual(expect.objectContaining({ name: 'Obertura Espanyola (Ruy López)', plies: 5 }));
        expect(st.game.comment.kind).toBe('intro');
        expect(st.game.comment.text).toContain('Stockfish');
        expect(st.game.comment.text).not.toContain('Obertura Espanyola');
        expect(st.game.comment.text).not.toContain('Pressiona el cavall');
        expect(st.game.comment.text).not.toMatch(/\be4\b|\be5\b|\bNf3\b/);
        await jest.advanceTimersByTimeAsync(30000 + 5 * C.MOVE_PREVIEW_MS);
        const g = ctl.state().game;
        expect(g.moves.slice(0, 5).map(m => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
        expect(g.moves.slice(0, 5).every(m => m.prepared)).toBe(true);
        // Les jugades preparades no demanen res al motor.
        expect(prefs().openingIndex).toBe(1);
        ctl.newGame();
        expect(ctl.state().game.opening.name).toBe('Gambit de Dama Refusat');
        ctl.close();
    });

    test('veu: l\'avanç espera el final de la locució (amb temps màxim) i apagar-la la talla', async () => {
        const synth = fakeSynth([CA]);
        const voice = TV.createTvVoice({ speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance, loadPref: () => 'on' });
        const openings = [{ eco: 'C60', name: 'Obertura Espanyola', idea: 'Pressiona el cavall.', moves: ['e4', 'e5'] }];
        const { ctl } = makeController({ voice: voice, getOpenings: () => openings, loadPrefs: () => ({ openingIndex: 0, profiles: false }) });
        await ctl.open();
        expect(synth.spoken).toHaveLength(1);
        expect(synth.spoken[0].text).toMatch(/Stockfish/);
        expect(synth.spoken[0].text).not.toContain('Obertura Espanyola');
        // La presentació s'està llegint: la primera jugada no surt.
        await jest.advanceTimersByTimeAsync(C.INTRO_DELAY_MS + 1000);
        expect(ctl.state().game.moves.length).toBe(0);
        synth.finish();
        // El nou text varia de longitud: la previsualització respecta
        // el temps necessari per llegir-lo, sense encallar el rellotge.
        const introTime = Math.max(C.INTRO_DELAY_MS,
            TV.tvReadingTimeMs(ctl.state().game.comment.text, ctl.state().viewer.tier));
        const remaining = Math.max(0, introTime - (C.INTRO_DELAY_MS + 1000));
        await jest.advanceTimersByTimeAsync(remaining + C.POST_SPEECH_PAUSE_MS + 50);
        expect(ctl.state().game.moves.length).toBe(0);
        expect(ctl.state().movePreview).toEqual({ from: 'e2', piece: 'p', color: 'w' });
        await jest.advanceTimersByTimeAsync(C.MOVE_PREVIEW_MS);
        expect(ctl.state().game.moves.length).toBe(1);
        // Apagar la veu: silenci immediat, i la partida continua.
        voice.setOn(false);
        expect(synth.current).toBeNull();
        await jest.advanceTimersByTimeAsync(20000);
        expect(ctl.state().game.moves.length).toBeGreaterThan(1);
        // Sortir cancel·la qualsevol parla.
        voice.setOn(true);
        ctl.close();
        expect(synth.current).toBeNull();
    });

    test('barra de nivell durant la partida: només canvia la següent', async () => {
        const { ctl } = makeController({ engine: fakeEngine({ script: FOOLS }), loadPrefs: () => ({ unequal: false }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(5000);
        ctl.setNextLevel(9);
        expect(ctl.state().game.level.value).toBe(0);
        expect(ctl.state().nextLevel).toBe(9);
        ctl.newGame();
        expect(ctl.state().game.level.value).toBe(9);
        expect(ctl.state().game.level.label.long).toBe('Nivell 9 de 20 · Elo estimat ≈ ' + TV.tvSkillEloEstimate(9));
        ctl.close();
    });

    test('l\'àudio del comentari es prepara ABANS de mostrar la jugada', async () => {
        const events = [];
        const voice = {
            isOn: () => true, status: () => 'ready', stop: () => events.push('stop'),
            prefetch: (t) => events.push('prefetch:' + t),
            speak: (t) => { events.push('speak:' + t); return Promise.resolve({ spoken: true, reason: 'end' }); }
        };
        const { ctl } = makeController({ engine: fakeEngine({ script: FOOLS }), voice: voice });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(40000);
        const spoken = events.filter(e => e.indexOf('speak:') === 0);
        expect(spoken.length).toBeGreaterThan(0);
        spoken.forEach((sp) => {
            const text = sp.slice(6);
            const pre = events.indexOf('prefetch:' + text);
            expect(pre).toBeGreaterThan(-1);
            expect(pre).toBeLessThan(events.indexOf(sp));
        });
        ctl.close();
    });

    test('motor que no arrenca: error explícit, sense bucle', async () => {
        const engine = fakeEngine();
        engine.ready = () => Promise.resolve(null);
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        expect(ctl.state().error).toBe('engine');
        expect(ctl.state().game).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 7b. Jugada enrere i control manual
// ---------------------------------------------------------------------------
describe('jugada enrere i control manual', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const replayOk = (g) => {
        const replay = new Chess();
        g.moves.forEach((m, i) => { expect(m.ply).toBe(i); expect(replay.move(m.san)).not.toBeNull(); });
        expect(replay.fen()).toBe(g.fen);
    };

    test('tirar enrere desfà semijugades, atura el motor i dona el torn a l\'usuari', async () => {
        const engine = fakeEngine();
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(30000);
        const n = ctl.state().game.moves.length;
        expect(n).toBeGreaterThanOrEqual(3);
        const internal = ctl._internal.game;
        const memoryBeforeLast = internal.moves[n - 1].undo.memory;
        const undone = internal.moves[n - 1];
        expect(ctl.stepBack()).toBe(true);
        let st = ctl.state();
        expect(st.game.moves.length).toBe(n - 1);
        // L'usuari mou el bàndol de la jugada desfeta.
        expect(st.control).toEqual(expect.objectContaining({ color: undone.color, yourTurn: true, thinking: false }));
        expect(st.game.turn).toBe(undone.color);
        expect(st.game.fen).toBe(undone.undo.fenBefore);
        expect(ctl._internal.game.memory).toBe(memoryBeforeLast);
        expect(ctl._internal.game.comments.every(c => c.ply < n - 1)).toBe(true);
        replayOk(st.game);
        // Una altra vegada: ara mou l'altre bàndol.
        expect(ctl.stepBack()).toBe(true);
        st = ctl.state();
        expect(st.game.moves.length).toBe(n - 2);
        expect(st.control.color).toBe(st.game.turn);
        // El comentari visible, si n'hi ha, és el de la posició visible.
        if (st.game.comment && st.game.comment.kind !== 'intro') expect(st.game.comment.fen).toBe(st.game.fen);
        // Amb el control, el motor no juga sol.
        const jobs = engine.jobs.length;
        await jest.advanceTimersByTimeAsync(60000);
        expect(ctl.state().game.moves.length).toBe(n - 2);
        expect(engine.jobs.length).toBe(jobs);
        // Fins a l'inici, i no més enllà.
        while (ctl.state().game.moves.length) expect(ctl.stepBack()).toBe(true);
        expect(ctl.stepBack()).toBe(false);
        expect(ctl.state().game.fen).toBe(new Chess().fen());
        expect(ctl.state().canUndo).toBe(false);
        ctl.close();
    });

    test('l\'usuari mou el seu color; Stockfish respon amb l\'altre al nivell de la partida', async () => {
        const engine = fakeEngine({ script: { 1: 'e7e5', 3: 'b8c6' } });
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        expect(ctl.takeControl()).toBe(true);
        expect(ctl.state().control).toEqual(expect.objectContaining({ color: 'w', yourTurn: true }));
        // Peça del rival, destí il·legal o casella buida: rebutjades.
        expect(ctl.userMoves('e7')).toEqual([]);
        expect(ctl.userMove('e7', 'e5')).toBe(false);
        expect(ctl.userMove('e2', 'e5')).toBe(false);
        expect(ctl.userMove('e4', 'e5')).toBe(false);
        expect(ctl.userMoves('g1').map(m => m.to).sort()).toEqual(['f3', 'h3']);
        expect(ctl.userMove('e2', 'e4')).toBe(true);
        // La jugada surt a l'instant; el comentari, quan acaba l'anàlisi.
        let st = ctl.state();
        expect(st.game.moves.map(m => m.san)).toEqual(['e4']);
        expect(st.game.moves[0].byUser).toBe(true);
        expect(st.control).toEqual(expect.objectContaining({ yourTurn: false, analyzing: true, thinking: true }));
        // Mentre s'analitza, cap altra jugada de l'usuari.
        expect(ctl.userMove('d2', 'd4')).toBe(false);
        await jest.advanceTimersByTimeAsync(C.CONTROL_REPLY_MAX_MS + 3000);
        st = ctl.state();
        expect(st.game.moves.map(m => m.san)).toEqual(['e4', 'e5']);
        expect(st.game.moves[1].byUser).toBe(false);
        expect(st.control).toEqual(expect.objectContaining({ color: 'w', yourTurn: true, analyzing: false }));
        // El motor ha jugat les negres amb el nivell FIXAT de la partida.
        const moveJobs = engine.jobs.filter(j => j.tag.kind === 'move');
        expect(moveJobs.length).toBe(1);
        expect(moveJobs[0].tag.ply).toBe(1);
        expect(moveJobs[0].strength).toEqual(['setoption name Skill Level value ' + (st.game.level.sides ? st.game.level.sides.b : st.game.level.value)]);
        // I no torna a moure fins que l'usuari mou.
        await jest.advanceTimersByTimeAsync(60000);
        expect(ctl.state().game.moves.length).toBe(2);
        expect(ctl.userMove('g1', 'f3')).toBe(true);
        await jest.advanceTimersByTimeAsync(C.CONTROL_REPLY_MAX_MS + 3000);
        expect(ctl.state().game.moves.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
        replayOk(ctl.state().game);
        ctl.close();
    });

    test('tornar el control: Stockfish juga els dos bàndols des de la posició actual', async () => {
        const openings = [{ eco: 'C60', name: 'Obertura Espanyola', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'] }];
        const engine = fakeEngine();
        const { ctl } = makeController({ engine: engine, getOpenings: () => openings, loadPrefs: () => ({ openingIndex: 0 }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(9000);
        while (ctl.state().game.moves.length < 3) await jest.advanceTimersByTimeAsync(500);
        // Enrere fins al torn de les negres de la segona jugada i surt de la línia preparada.
        while (ctl.state().game.moves.length > 3) ctl.stepBack();
        ctl.stepBack();
        expect(ctl.state().game.moves.map(m => m.san)).toEqual(['e4', 'e5']);
        expect(ctl.state().control.color).toBe('w');
        expect(ctl.userMove('d2', 'd4')).toBe(true);
        await jest.advanceTimersByTimeAsync(C.CONTROL_REPLY_MAX_MS + 3000);
        expect(ctl.state().game.moves.length).toBe(4);
        expect(ctl.releaseControl()).toBe(true);
        expect(ctl.state().control).toBeNull();
        await jest.advanceTimersByTimeAsync(40000);
        const g = ctl.state().game;
        expect(g.moves.length).toBeGreaterThan(6);
        replayOk(g);
        // Fora de la línia preparada, cap jugada no es marca com a preparada
        // (i el motor calcula totes les jugades dels dos bàndols).
        expect(g.moves.slice(2).every(m => !m.prepared)).toBe(true);
        expect(g.moves.slice(3).every(m => !m.byUser)).toBe(true);
        const colors = new Set(engine.jobs.filter(j => j.tag.kind === 'move' && j.tag.ply >= 4).map(j => j.tag.ply % 2));
        expect(colors).toEqual(new Set([0, 1]));
        ctl.close();
    });

    test('agafar el control mentre el motor calcula descarta la jugada pendent', async () => {
        const engine = fakeEngine({ ignoreCancel: true, delay: 300 });
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(4200);
        const n = ctl.state().game.moves.length;
        const turn = ctl.state().game.turn;
        expect(ctl.takeControl()).toBe(true);
        expect(ctl.takeControl()).toBe(false);
        await jest.advanceTimersByTimeAsync(30000);
        expect(ctl.state().game.moves.length).toBe(n);
        expect(ctl.state().control).toEqual(expect.objectContaining({ color: turn, yourTurn: true }));
        // La pausa no s'aplica amb el control manual.
        ctl.pause();
        expect(ctl.state().paused).toBe(false);
        ctl.close();
    });

    test('final de partida: tirar enrere el reprèn i no comença cap partida sola', async () => {
        const { ctl } = makeController({ engine: fakeEngine({ script: FOOLS }) });
        await ctl.open();
        await jest.advanceTimersByTimeAsync(40000);
        expect(ctl.state().game.end).toEqual(expect.objectContaining({ reason: 'checkmate' }));
        expect(ctl.takeControl()).toBe(false);
        expect(ctl.stepBack()).toBe(true);
        const st = ctl.state();
        expect(st.game.end).toBeNull();
        expect(st.game.nextGameAt).toBeNull();
        expect(st.control).toEqual(expect.objectContaining({ color: 'b', yourTurn: true }));
        await jest.advanceTimersByTimeAsync(C.NEXT_GAME_DELAY_MS * 2);
        expect(ctl.state().game.id).toBe(1);
        // L'usuari torna a fer el mat: tampoc no comença cap partida sola.
        expect(ctl.userMove('d8', 'h4')).toBe(true);
        await jest.advanceTimersByTimeAsync(5000);
        expect(ctl.state().game.end).toEqual(expect.objectContaining({ result: '0-1', reason: 'checkmate' }));
        expect(ctl.state().game.comment).toEqual(expect.objectContaining({ kind: 'mate', byUser: true }));
        await jest.advanceTimersByTimeAsync(C.NEXT_GAME_DELAY_MS * 2);
        expect(ctl.state().game.id).toBe(1);
        // En tornar el control, la partida següent arriba després de la pausa habitual.
        ctl.releaseControl();
        await jest.advanceTimersByTimeAsync(C.NEXT_GAME_DELAY_MS * 1.2 + 500);
        expect(ctl.state().game.id).toBe(2);
        expect(ctl.state().control).toBeNull();
        ctl.close();
    });

    test('coronació triada per l\'usuari i comentaris lligats a la posició', async () => {
        // 1.e4 d5 2.exd5 c6 3.dxc6 Nf6 4.cxb7 Nbd7 5.bxa8=C
        const engine = fakeEngine({ script: { 1: 'd7d5', 3: 'c7c6', 5: 'g8f6', 7: 'b8d7' } });
        const { ctl, renders } = makeController({ engine: engine });
        await ctl.open();
        ctl.takeControl();
        for (const [from, to] of [['e2', 'e4'], ['e4', 'd5'], ['d5', 'c6'], ['c6', 'b7']]) {
            expect(ctl.userMove(from, to)).toBe(true);
            await jest.advanceTimersByTimeAsync(C.CONTROL_REPLY_MAX_MS + 3000);
        }
        expect(ctl.userMoves('b7').filter(m => m.to === 'a8').every(m => m.promotion)).toBe(true);
        expect(ctl.userMove('b7', 'a8', 'n')).toBe(true);
        const g = ctl.state().game;
        expect(g.moves[8]).toEqual(expect.objectContaining({ san: 'bxa8=N', uci: 'b7a8n', byUser: true }));
        replayOk(g);
        renders.filter(s => s.game && s.game.comment && s.game.comment.kind !== 'intro').forEach((s) => {
            expect(s.game.comment.fen).toBe(s.game.fen);
        });
        ctl.close();
    });

    test('pestanya oculta durant la resposta: no calcula res i en tornar respon', async () => {
        const engine = fakeEngine();
        const { ctl } = makeController({ engine: engine });
        await ctl.open();
        ctl.takeControl();
        expect(ctl.userMove('d2', 'd4')).toBe(true);
        ctl.setHidden(true);
        const jobs = engine.jobs.length;
        await jest.advanceTimersByTimeAsync(60000);
        expect(engine.jobs.length).toBe(jobs);
        expect(ctl.state().game.moves.length).toBe(1);
        ctl.setHidden(false);
        await jest.advanceTimersByTimeAsync(10000);
        expect(ctl.state().game.moves.length).toBe(2);
        expect(ctl.state().control.yourTurn).toBe(true);
        ctl.close();
    });

    test('nova partida: surt del control manual', async () => {
        const { ctl } = makeController();
        await ctl.open();
        await jest.advanceTimersByTimeAsync(10000);
        ctl.stepBack();
        expect(ctl.state().control).not.toBeNull();
        ctl.newGame();
        expect(ctl.state().control).toBeNull();
        expect(ctl.state().game.id).toBe(2);
        await jest.advanceTimersByTimeAsync(15000);
        expect(ctl.state().game.moves.length).toBeGreaterThan(0);
        ctl.close();
    });
});

// ---------------------------------------------------------------------------
// 8. Motor propi de la TV (worker simulat)
// ---------------------------------------------------------------------------
function makeWorkerFactory(opts) {
    const o = opts || {};
    const workers = [];
    const factory = () => {
        const w = {
            sent: [], terminated: false, onmessage: null, searchTimer: null, hang: !!o.hang,
            emit(line) { if (!w.terminated && w.onmessage) w.onmessage({ data: line }); },
            postMessage(cmd) {
                if (w.terminated) return;
                w.sent.push(cmd);
                if (cmd === 'uci') {
                    setTimeout(() => {
                        (o.uciLines || ['id name Fals', 'option name Skill Level type spin default 20 min 0 max 20']).forEach(l => w.emit(l));
                        w.emit('uciok');
                    }, 5);
                } else if (cmd === 'isready') setTimeout(() => w.emit('readyok'), 1);
                else if (cmd.indexOf('go ') === 0) {
                    if (w.hang) return;
                    const ms = parseInt((/movetime (\d+)/.exec(cmd) || [0, 100])[1], 10);
                    const tag = w.sent.length;
                    w.searchTimer = setTimeout(() => {
                        w.emit('info depth 12 seldepth 14 multipv 1 score cp 25 nodes 10 pv e2e4 e7e5');
                        w.emit('bestmove e2e4 ponder e7e5 #' + tag);
                    }, ms);
                } else if (cmd === 'stop') {
                    clearTimeout(w.searchTimer);
                    setTimeout(() => w.emit('bestmove d2d4'), 1);
                }
            },
            terminate() { w.terminated = true; clearTimeout(w.searchTimer); }
        };
        workers.push(w);
        return w;
    };
    return { factory, workers };
}
const JOB = (extra) => Object.assign({
    tag: { gameId: 1, ply: 0, kind: 'move' }, position: 'position startpos',
    strength: ['setoption name Skill Level value 3'], multipv: 1, go: 'go movetime 500', movetime: 500
}, extra || {});

describe('motor dedicat de la TV', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('llegeix les opcions amb `uci` i configura cada petició abans de calcular', async () => {
        const wf = makeWorkerFactory();
        const engine = TV.createTvEngine({ createWorker: wf.factory });
        const p = engine.ready();
        await jest.advanceTimersByTimeAsync(20);
        const c = await p;
        expect(c.mode).toBe('skill');
        const r = engine.request(JOB());
        await jest.advanceTimersByTimeAsync(600);
        const res = await r;
        expect(res.bestUci).toBe('e2e4');
        expect(res.infos[1]).toEqual(expect.objectContaining({ depth: 12, type: 'cp', value: 25 }));
        const sent = wf.workers[0].sent;
        expect(sent.indexOf('setoption name Skill Level value 3')).toBeLessThan(sent.indexOf('go movetime 500'));
        expect(sent.indexOf('ucinewgame')).toBeGreaterThan(-1);
    });

    test('cancel·lació: la cerca aturada es descarta i la següent rep el seu propi resultat', async () => {
        const wf = makeWorkerFactory();
        const engine = TV.createTvEngine({ createWorker: wf.factory });
        const a = engine.request(JOB());
        await jest.advanceTimersByTimeAsync(100);
        engine.cancelAll();
        const b = engine.request(JOB({ go: 'go movetime 300', movetime: 300 }));
        await jest.advanceTimersByTimeAsync(400);
        await expect(a).resolves.toBeNull();
        const rb = await b;
        // El «bestmove d2d4» de la cerca aturada no es cola a la petició nova.
        expect(rb.bestUci).toBe('e2e4');
    });

    test('sortir amb una cerca en marxa i tornar de seguida: cap bloqueig ni reinici tardà', async () => {
        const wf = makeWorkerFactory();
        const engine = TV.createTvEngine({ createWorker: wf.factory });
        const a = engine.request(JOB());
        await jest.advanceTimersByTimeAsync(100);
        engine.destroy();
        await expect(a).resolves.toBeNull();
        expect(wf.workers[0].terminated).toBe(true);
        const b = engine.request(JOB());
        await jest.advanceTimersByTimeAsync(600);
        expect((await b).bestUci).toBe('e2e4');
        // Passat el temporitzador de seguretat de la cerca vella, el worker nou continua viu.
        await jest.advanceTimersByTimeAsync(20000);
        expect(wf.workers).toHaveLength(2);
        expect(wf.workers[1].terminated).toBe(false);
        const c = engine.request(JOB());
        await jest.advanceTimersByTimeAsync(600);
        expect((await c).bestUci).toBe('e2e4');
    });

    test('worker penjat: temps màxim i reinici en la petició següent', async () => {
        const wf = makeWorkerFactory({ hang: true });
        const engine = TV.createTvEngine({ createWorker: wf.factory });
        const a = engine.request(JOB());
        await jest.advanceTimersByTimeAsync(500 + 10000 + 50);
        await expect(a).resolves.toBeNull();
        expect(wf.workers[0].terminated).toBe(true);
        engine.request(JOB());
        await jest.advanceTimersByTimeAsync(50);
        expect(wf.workers).toHaveLength(2);
    });

    test('worker que no es pot crear: el motor queda marcat com a fallat', async () => {
        const engine = TV.createTvEngine({ createWorker: () => { throw new Error('no'); } });
        await expect(engine.ready()).resolves.toBeNull();
        expect(engine.failed()).toBe(true);
    });
});

describe('Integració de la retransmissió a dues veus', () => {
    test('la interfície ofereix un control per al duet Elia/Grau amb estat persistent', () => {
        const html=require('fs').readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
        expect(html).toContain('id="sftv-duo"');
        expect(html).toContain('Elia (narradora) i Grau (analista)');
        const js=require('fs').readFileSync(require.resolve('../stockfishtv'),'utf8');
        expect(js).toContain("on('sftv-duo', 'change'");
        expect(js).toContain('controller.setDuo(ev.target.checked)');
        expect(js).toContain('spokenTurns(planned)');
    });
});

// ---------------------------------------------------------------------------
// Matxa caiguda a mitja partida: la TV s'atura fins que la veu torna
// ---------------------------------------------------------------------------
describe('Matxa caiguda: la partida espera la veu', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function fakeNeural(result) {
        const n = { calls: [], ok: true, available: () => n.ok, prefetch() {}, stop() {}, isSpeaking: () => false,
            speak: (t, id, o) => { n.calls.push([t, id, o]); return Promise.resolve(result()); } };
        return n;
    }
    const holdingVoice = (neural, extra) => TV.createTvVoice(Object.assign({ speechSynthesis: fakeSynth([CA]),
        SpeechSynthesisUtterance: FakeUtterance, loadPref: () => 'on', neural, holdNeural: true,
        getNeuralVoiceId: () => 'matxa:central:elia' }, extra || {}));

    test('amb holdNeural no es llegeix amb la veu del dispositiu: es diu que Matxa ha caigut', async () => {
        const synth = fakeSynth([CA]);
        const neural = fakeNeural(() => ({ spoken: false, reason: 'network' }));
        const v = holdingVoice(neural, { speechSynthesis: synth });
        await expect(v.speak('Escac al rei negre.')).resolves.toEqual({ spoken: false, reason: 'neural-down' });
        expect(synth.spoken).toHaveLength(0);
        // En pausa de Matxa: no es truca el servei si no es força l'intent.
        neural.ok = false;
        expect(v.status()).toBe('ready');
        expect(v.engine()).toBe('neural');
        expect(v.holdsForNeural()).toBe(true);
        await expect(v.speak('Hola.')).resolves.toEqual({ spoken: false, reason: 'neural-down' });
        expect(neural.calls).toHaveLength(1);
        await v.speak('Hola.', { force: true });
        expect(neural.calls[1][2].force).toBe(true);
    });

    test('sense holdNeural, o sense Matxa al perfil, no canvia res', async () => {
        const neural = fakeNeural(() => ({ spoken: false, reason: 'network' }));
        const plain = holdingVoice(neural, { holdNeural: false });
        expect(plain.holdsForNeural()).toBe(false);
        const system = holdingVoice(neural, { getNeuralVoiceId: () => null });
        expect(system.holdsForNeural()).toBe(false);
        expect(system.engine()).toBe('system');
    });

    // La presentació es mostra el temps de lectura abans que s'esperi la veu.
    const waitIntro = ctl => jest.advanceTimersByTimeAsync(Math.max(C.INTRO_DELAY_MS,
        TV.tvReadingTimeMs(ctl.state().game.comment.text, ctl.state().viewer.tier)) + 500);
    const OPENINGS = [{ eco: 'C60', name: 'Obertura Espanyola', idea: 'Pressiona el cavall.', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }];
    function controllableVoice() {
        const v = { down: true, on: true, spoken: [], forced: [],
            isOn: () => v.on, status: () => 'ready', stop() {}, prefetch() {}, holdsForNeural: () => true,
            speak(text, o) {
                (o && o.force ? v.forced : v.spoken).push(text);
                return Promise.resolve(v.down ? { spoken: false, reason: 'neural-down' } : { spoken: true, reason: 'end' });
            } };
        return v;
    }

    test('cap jugada mentre Matxa no respon; quan torna, repeteix el comentari i continua', async () => {
        const voice = controllableVoice();
        const { ctl } = makeController({ voice, getOpenings: () => OPENINGS, loadPrefs: () => ({ openingIndex: 0, profiles: false, unequal: false }) });
        await ctl.open();
        const intro = ctl.state().game.comment.text;
        await waitIntro(ctl);
        expect(ctl.state().game.moves).toHaveLength(0);
        expect(ctl.state().voiceHold).toMatchObject({ attempts: 0, trying: false });
        await jest.advanceTimersByTimeAsync(C.VOICE_RETRY_MS * 3);
        expect(ctl.state().game.moves).toHaveLength(0);
        expect(ctl.state().voiceHold.attempts).toBeGreaterThanOrEqual(2);
        expect(voice.forced.every(t => t === voice.spoken[0])).toBe(true);
        // Matxa torna: el següent intent sona i la partida continua.
        voice.down = false;
        await jest.advanceTimersByTimeAsync(C.VOICE_RETRY_MS + 100);
        expect(ctl.state().voiceHold).toBeNull();
        expect(voice.forced.at(-1)).toBe(voice.spoken[0]);
        expect(voice.spoken[0]).toBeTruthy();
        expect(intro).toBeTruthy();
        await jest.advanceTimersByTimeAsync(C.POST_SPEECH_PAUSE_MS + C.MOVE_PREVIEW_MS + 500);
        expect(ctl.state().game.moves.length).toBeGreaterThan(0);
        ctl.close();
    });

    test('apagar la veu durant l’espera deixa continuar la partida sense comentaris', async () => {
        const voice = controllableVoice();
        const { ctl } = makeController({ voice, getOpenings: () => OPENINGS, loadPrefs: () => ({ openingIndex: 0, profiles: false, unequal: false }) });
        await ctl.open();
        await waitIntro(ctl);
        expect(ctl.state().voiceHold).not.toBeNull();
        voice.on = false;
        await jest.advanceTimersByTimeAsync(1100);
        expect(ctl.state().voiceHold).toBeNull();
        await jest.advanceTimersByTimeAsync(C.MOVE_PREVIEW_MS + 500);
        expect(ctl.state().game.moves.length).toBeGreaterThan(0);
        ctl.close();
    });

    test('pausar durant l’espera l’anul·la; en reprendre, si Matxa continua caiguda, torna a esperar', async () => {
        const voice = controllableVoice();
        const { ctl } = makeController({ voice, getOpenings: () => OPENINGS, loadPrefs: () => ({ openingIndex: 0, profiles: false, unequal: false }) });
        await ctl.open();
        await waitIntro(ctl);
        expect(ctl.state().voiceHold).not.toBeNull();
        ctl.pause();
        expect(ctl.state().voiceHold).toBeNull();
        expect(ctl.state().paused).toBe(true);
        ctl.resume();
        await jest.advanceTimersByTimeAsync(20000);
        // La partida avança fins al comentari següent i s'hi torna a aturar.
        const moves = ctl.state().game.moves.length;
        expect(ctl.state().voiceHold).not.toBeNull();
        await jest.advanceTimersByTimeAsync(C.VOICE_RETRY_MS * 2);
        expect(ctl.state().game.moves.length).toBe(moves);
        ctl.close();
    });
});

describe('Interfície de veu Matxa: només Ràdio, equalitzador i música de fons', () => {
    const html = require('fs').readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
    test('cap opció Natural ni Càlida: el perfil de so és sempre Ràdio', () => {
        expect(html).not.toMatch(/<option value="(natural|warm)">/);
        expect(html).toContain('<strong id="sftv-matxa-profile">Ràdio</strong>');
        expect(html).toContain('<strong id="tts-matxa-profile">Ràdio</strong>');
    });
    test.each(['sftv-matxa', 'tts-matxa'])('equalitzador de cinc bandes sota la configuració de Matxa (%s)', prefix => {
        expect(html).toContain('id="' + prefix + '-eq"');
        ['low', 'lowmid', 'mid', 'presence', 'high'].forEach(band => {
            expect(html).toMatch(new RegExp('id="' + prefix + '-eq-' + band + '"[^>]*type="range" min="-12" max="12"'));
            expect(html).toContain('id="' + prefix + '-eq-' + band + '-value"');
        });
        expect(html).toContain('id="' + prefix + '-eq-reset"');
    });
    test('música de fons: sense música o una melodia a l’atzar a cada partida', () => {
        const select = html.slice(html.indexOf('id="sftv-radio-sound"'), html.indexOf('</select>', html.indexOf('id="sftv-radio-sound"')));
        expect([...select.matchAll(/<option value="([^"]+)"/g)].map(m => m[1])).toEqual(['off', 'music']);
        expect(html).toContain('Jardí oriental');
    });
    test('avís visible mentre la partida espera Matxa', () => {
        expect(html).toContain('id="sftv-voice-hold"');
    });
});

// ---------------------------------------------------------------------------
// Prova pilot: Stockfish 19 (2026) a la TV, amb el clàssic de reserva
// ---------------------------------------------------------------------------
describe('Stockfish 19 a la TV (prova pilot)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    // Opcions tal com les declara Stockfish oficial (engine.cpp i search.h).
    const SF19_LINES = [
        'id name Stockfish 19',
        'option name Skill Level type spin default 20 min 0 max 20',
        'option name UCI_LimitStrength type check default false',
        'option name UCI_Elo type spin default 1320 min 1320 max 3190',
        'uciok'
    ];
    const SF19_CAPS = caps(SF19_LINES);

    test('el motor nou passa sol a l’escala d’Elo 1320–3190', () => {
        expect(SF19_CAPS).toMatchObject({ mode: 'elo', min: 1320, max: 3190, engineEloMin: 1320, engineEloMax: 3190, skillMax: 20, engineName: 'Stockfish 19' });
        expect(TV.tvStrengthCommands(SF19_CAPS, 'player', 1700)).toEqual(['setoption name UCI_LimitStrength value true', 'setoption name UCI_Elo value 1700']);
        expect(TV.tvStrengthCommands(SF19_CAPS, 'analysis')).toEqual(['setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20']);
        // Vint esglaons: els extrems del motor i els centenars rodons entremig.
        const scale = TV.tvLevelScale(SF19_CAPS);
        expect(scale.map(t => t.value)).toEqual([1320, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300,
            2400, 2500, 2600, 2700, 2800, 2900, 3000, 3100, 3190]);
        expect(TV.tvSnapLevel(SF19_CAPS, 1734)).toBe(1700);
        expect(TV.tvSnapLevel(SF19_CAPS, 1360)).toBe(1320);
        expect(TV.tvSnapLevel(SKILL_CAPS, 7)).toBe(7);
        // La barra i «Massa fàcil» van d'esglaó en esglaó.
        const viewer = TV.tvViewerProfile({ calibrated: true, roc: 1534 }, SF19_CAPS);
        let p = TV.tvNormalizePrefs(null);
        expect(TV.tvResolveTarget(SF19_CAPS, viewer, p).value % 100).toBe(0);
        p = TV.tvSetTargetPrefs(SF19_CAPS, viewer, p, 2468);
        expect(TV.tvResolveTarget(SF19_CAPS, viewer, p).value).toBe(2500);
        p = TV.tvAdjustPrefs(SF19_CAPS, viewer, p, 'harder');
        expect(TV.tvResolveTarget(SF19_CAPS, viewer, p).value).toBe(2600);
        p = TV.tvSetTargetPrefs(SF19_CAPS, viewer, p, 3170);
        p = TV.tvAdjustPrefs(SF19_CAPS, viewer, p, 'harder');
        expect(TV.tvResolveTarget(SF19_CAPS, viewer, p).value).toBe(3190);
        expect(TV.tvLevelLabel(SF19_CAPS, 1800).long).toBe('Elo aproximat del motor: 1800');
        expect(TV.tvCompatibilityNote(SF19_CAPS)).toBeNull();
        // Un espectador de 1100 rep l'objectiu mínim; un de 1700, nivell + 200.
        expect(TV.tvBaseTarget(SF19_CAPS, { known: true, roc: 1100 })).toBe(1320);
        expect(TV.tvBaseTarget(SF19_CAPS, { known: true, roc: 1700 })).toBeGreaterThan(1320);
    });

    test('Stockfish 19 és l’únic motor de TV, fins i tot amb preferències antigues', () => {
        expect(TV.tvNormalizePrefs({}).engine).toBe('sf19');
        expect(TV.tvNormalizePrefs({ engine: 'sf19' }).engine).toBe('sf19');
        expect(TV.tvNormalizePrefs({ engine: 'classic' }).engine).toBe('sf19');
        expect(TV.tvNormalizePrefs({ engine: 'stockfish-99' }).engine).toBe('sf19');
        expect(Object.keys(TV.TV_ENGINES)).toEqual(['sf19']);
    });

    test('el worker de Stockfish 19 porta la versió també al .wasm (fragment de l’URL)', () => {
        expect(TV.tvEngineWorkerUrl('sf19', '1.0.55')).toBe('stockfish-19-lite-single.js?v=1.0.55#' + encodeURIComponent('stockfish-19-lite-single.wasm?v=1.0.55'));
        expect(TV.tvEngineWorkerUrl('classic', '1.0.55')).toBe(TV.tvEngineWorkerUrl('sf19', '1.0.55'));
        expect(TV.tvEngineWorkerUrl('sf19')).toBe('stockfish-19-lite-single.js#stockfish-19-lite-single.wasm');
        // Els fitxers del motor són al repositori, al costat de l'app.
        const fs = require('fs');
        expect(fs.statSync(path.join(__dirname, '../stockfish-19-lite-single.js')).size).toBeGreaterThan(10000);
        expect(fs.statSync(path.join(__dirname, '../stockfish-19-lite-single.wasm')).size).toBeGreaterThan(1000000);
    });

    test('si el motor Stockfish 19 no es pot crear, no hi ha substitució silenciosa', async () => {
        const engine = TV.createTvEngine({ createWorker: () => { throw new Error('no wasm'); } });
        await expect(engine.ready()).resolves.toBeNull();
        expect(engine.usingFallback()).toBe(false);
        expect(engine.failed()).toBe(true);
    });

    test('si falla el worker de Stockfish 19, la TV no arrenca un motor antic', async () => {
        let broken;
        const engine = TV.createTvEngine({
            createWorker: () => {
                broken = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
                setTimeout(() => broken.onerror && broken.onerror(new Event('error')), 10);
                return broken;
            }
        });
        const ready = engine.ready();
        await jest.advanceTimersByTimeAsync(100);
        await expect(ready).resolves.toBeNull();
        expect(engine.usingFallback()).toBe(false);
        expect(engine.failed()).toBe(true);
    });

    test('Stockfish 19 inicia amb els seus nivells Elo sense motor alternatiu', async () => {
        const sf19 = makeWorkerFactory({ uciLines: SF19_LINES.slice(0, -1) });
        const engine = TV.createTvEngine({ createWorker: sf19.factory });
        const ready = engine.ready();
        await jest.advanceTimersByTimeAsync(50);
        await expect(ready).resolves.toMatchObject({ mode: 'elo', min: 1320, max: 3190 });
        expect(engine.usingFallback()).toBe(false);
    });

    test('la rivalitat amb Lozza només compta les partides del mateix motor', () => {
        const items = [
            { winner: 'stockfish', lozzaColor: 'w', plies: 80 },
            { winner: 'stockfish', lozzaColor: 'b', plies: 70, sig: 'skill:0-20' },
            { winner: 'lozza', lozzaColor: 'w', plies: 90, sig: TV.tvCapsSignature(SF19_CAPS) }
        ];
        expect(TV.tvRivalryHistory(items, SKILL_CAPS).map(x => x.winner)).toEqual(['stockfish', 'stockfish']);
        expect(TV.tvRivalryHistory(items, SF19_CAPS).map(x => x.winner)).toEqual(['lozza']);
    });

    test('canviar de motor deixa la partida en curs i en comença una amb l’escala nova', async () => {
        const old = fakeEngine();
        const { ctl } = makeController({ engine: old, loadPrefs: () => ({ unequal: false, profiles: false }) });
        await ctl.open();
        expect(ctl.state().caps.mode).toBe('skill');
        const firstId = ctl.state().game.id;
        const sf19 = fakeEngine({ caps: SF19_CAPS });
        await ctl.replaceEngine(sf19);
        expect(old.destroyed).toBe(1);
        const st = ctl.state();
        expect(st.caps.mode).toBe('elo');
        expect(st.game.id).not.toBe(firstId);
        expect(st.game.level.value).toBeGreaterThanOrEqual(1320);
        await jest.advanceTimersByTimeAsync(20000);
        expect(sf19.jobs.some(j => j.strength.includes('setoption name UCI_LimitStrength value true'))).toBe(true);
        ctl.close();
    });

    test('la interfície no ofereix Stockfish 2019 ni un selector; sempre arrenca 19', () => {
        const html = require('fs').readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        expect(html).not.toContain('id="sftv-engine"');
        expect(html).not.toContain('<option value="classic">');
        expect(html).toContain('Motor únic: Stockfish 19 (2026)');
        const js = require('fs').readFileSync(require.resolve('../stockfishtv'), 'utf8');
        expect(js).not.toContain("on('sftv-engine', 'change'");
        expect(js).not.toContain('createFallbackWorker: classicWorker');
        expect(js).toContain("createWorker: () => new Worker(tvEngineWorkerUrl('sf19', root.APP_VERSION))");
    });
});

describe('vocabulari planer: cap «fianchetto» als textos de la partida', () => {
    // Els identificadors interns ('fianchetto', 'fianchetto_prep') es mantenen;
    // cap text que vegi o senti l'usuari no fa servir la paraula. Els noms
    // oficials en anglès de la base d'obertures (obertures.js) no hi compten.
    test.each(['stockfishtv.js', 'patrons.js', 'expressivitat.js', 'app.js', 'core.js', 'gamebroadcast.js', 'index.html'])('%s', file => {
        const src = require('fs').readFileSync(path.join(__dirname, '..', file), 'utf8');
        const literals = [...src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*?fian(?:chet|quet)(?:\\.|(?!\1)[^\\\n])*?)\1/gi)].map(m => m[2]);
        expect(literals.filter(t => !/^fianchetto(_prep)?$/.test(t))).toEqual([]);
        if (file === 'index.html') expect(src).not.toMatch(/fian(chet|quet)/i);
    });
    test('l’alfil a la gran diagonal es comenta amb paraules planeres', () => {
        const { Chess } = require('chess.js');
        const P = require('../patrons');
        expect(P.INDEX.fianchetto.name).toBe('alfil a la diagonal llarga');
        const fen = '4k3/8/8/8/8/1P6/8/2B1K3 w - - 0 1';
        const g = new Chess(fen);
        const move = g.move({ from: 'c1', to: 'b2' });
        const hit = P.detect({ ChessCtor: Chess, fenBefore: fen, fenAfter: g.fen(), move, tier: 'mid', ply: 0 }).find(x => x.id === 'fianchetto');
        expect(hit.text).toBe('L’alfil s’instal·la a la diagonal llarga.');
        expect(hit.pattern.name + ' ' + hit.text).not.toMatch(/fian(chet|quet)/i);
    });
});
