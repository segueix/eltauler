// ============================================================================
// humanitzacio.js — humanització dinàmica de les partides de la TV
// ============================================================================
// LÒGICA PURA (sense DOM, xarxa ni motors): decideix, entre les jugades
// candidates que ha trobat l'anàlisi (MultiPV), quina juga un jugador. El
// motor segueix sent qui calcula; aquest mòdul només tria entre alternatives
// raonables amb criteri humà. Vegeu HUMANITZACIO.md.
//
// Principis (els mateixos per a Stockfish i per a Lozza):
//   · Cap resultat no es fixa abans de la partida: cada jugador té la seva
//     pròpia seqüència pseudoaleatòria, derivada d'una LLAVOR PER PARTIDA i de
//     la seva identitat (no del color ni del motor). Dos jugadors mai no
//     comparteixen estat ni s'alternen els errors.
//   · La precisió de cada jugador és un procés estocàstic amb memòria
//     (fluctuació AR(1) + desgast moderat + «sots» de les fases difícils que
//     es recuperen a la seva velocitat). No hi ha cap moviment fix.
//   · La probabilitat d'una jugada inferior baixa de manera exponencial amb la
//     pèrdua d'avaluació (softmax amb temperatura): les imprecisions petites
//     són habituals; els errors greus, excepcionals i només en posicions
//     complexes (límit de pèrdua que creix amb la complexitat).
//   · El perfil NO decideix la freqüència dels errors sinó SOBRETOT quin tipus
//     d'imprecisions és més temptador per a cada jugador (VULNERABILITIES):
//     són biaixos de probabilitat sobre jugades raonables, mai obligacions.
//   · Es protegeixen els mats forçats, els finals elementals, les posicions
//     guanyades (no es llença una victòria clara) i el principi de partida.
//
// Es carrega com a:
//   - Navegador: <script src="humanitzacio.js"> → window.ElTaulerHumanitzacio
//   - Node/Jest: require('./humanitzacio') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ElTaulerHumanitzacio = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.0.0';

    const CONFIG = {
        // Interruptor general (intern: l'espectador no el veu).
        ENABLED: true,
        // Línies d'anàlisi (MultiPV) de les quals es tria.
        MULTIPV: 4,
        // Temperatura (cp) de la tria: amb precisió màxima s'acosta a TAU_MIN
        // (gairebé sempre la millor); amb precisió baixa, a TAU_MAX.
        TAU_MIN: 12,
        TAU_MAX: 110,
        Q_EXPONENT: 1.3,
        // Precisió de referència (0–1) i fluctuació temporalment correlada:
        // x(t+1) = RHO·x(t) + √(1−RHO²)·SIGMA·ε. RHO alt = canvis suaus.
        BASE_Q: 0.68,
        FLUCT_SIGMA: 0.22,
        FLUCT_RHO: 0.9,
        // Desgast acumulat (per semijugada, més ràpid amb posicions complexes i
        // sobretot en jugadors de poca resistència) amb un sostre moderat.
        WEAR_RATE: 0.0014,
        WEAR_MAX: 0.16,
        // «Sots» després d'una fase difícil (complexa o amb desavantatge): es
        // recupera a una velocitat que depèn de la recuperació del jugador.
        DIP_GAIN: 0.05,
        DIP_MAX: 0.3,
        DIP_DECAY_MIN: 0.08,
        DIP_DECAY_RANGE: 0.28,
        // Pressió del rellotge (0–1, si la partida en té): resta precisió.
        CLOCK_PENALTY: 0.16,
        // Pèrdua màxima admesa (cp) segons la complexitat de la posició: en una
        // posició senzilla no es permet cap error greu.
        CAP_SIMPLE: 55,
        CAP_COMPLEX: 270,
        CAP_EXPONENT: 1.3,
        // No es llença una victòria clara ni es passa de tablas a perdre.
        WIN_GUARD_CP: 250,
        WIN_KEEP_CP: 130,
        LOST_FLOOR_CP: -260,
        // Principi de partida: la teoria no es toca (rampa suau, no un tall fix).
        OPENING_PLIES: 10,
        OPENING_RAMP: 24,
        OPENING_MIN_SCALE: 0.3,
        // Pes dels perfils (trets de tvMoveFeatures) i de les vulnerabilitats.
        PREF_GAIN: 0.3,
        PREF_MAX: 1.2,
        VULN_BASE: 0.5,
        // Fase d'atac (risk = 1): el perfil de progrés pesa molt més.
        RISK_PREF_GAIN: 0.9,
        RISK_PREF_MAX: 3.5,
        // Bonificació de la jugada que el motor hauria fet (conserva el caràcter
        // de cada motor) i penalització a les repeticions en posicions igualades.
        ENGINE_ANCHOR: 0.5,
        EQUAL_CP: 60,
        REPEAT_PENALTY: 1.2,
        BACKTRACK_PENALTY: 0.7,
        // Ambició en posicions igualades (≤ AMBITION_CP) a partir d'AMBITION_FROM_PLY.
        AMBITION_CP: 90,
        AMBITION_FROM_PLY: 30,
        CONTEMPT_TRADE: 0.8,
        TENSION_BONUS: 0.25,
        // Taules mortes (ofegat, falta de material): es dispreuen si no es va per sota.
        DEAD_DRAW_PENALTY: 2.5,
        DEAD_DRAW_FROM_CP: -30,
        // Classes d'error (pèrdua en cp respecte de la millor).
        IMPRECISION_CP: 30,
        MISTAKE_CP: 90,
        BLUNDER_CP: 200,
        // Un final amb tan pocs trets (peces que no són reis) es protegeix.
        ELEMENTARY_PIECES: 2,
        // Registre tècnic intern: màxim d'entrades per partida.
        LOG_MAX: 400
    };

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function smoothstep(x) { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }

    // ------------------------------------------------------------------
    // Aleatorietat controlada per llavor
    // ------------------------------------------------------------------
    // Funció de hash de cadenes (xmur3) → enter de 32 bits.
    function hashSeed(str) {
        const s = String(str);
        let h = 1779033703 ^ s.length;
        for (let i = 0; i < s.length; i++) {
            h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^ (h >>> 16)) >>> 0;
    }

    // mulberry32: generador uniforme [0,1) reproduïble.
    function createRng(seed) {
        let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Normal estàndard (Box-Muller): sempre consumeix dues extraccions.
    function gaussian(rng) {
        const u = Math.max(1e-12, rng()), v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // ------------------------------------------------------------------
    // Perfils
    // ------------------------------------------------------------------
    // Vuit paràmetres (0–1) per jugador. No són forces: tots juguen igual de
    // fort de base; modifiquen la temperatura en situacions concretes
    // (tàctica, estratègia, final, pressió, resistència, recuperació) i quines
    // jugades els resulten temptadores (agressivitat/prudència).
    const ARCHETYPES = ['agressiu', 'defensiu', 'posicional', 'tactic', 'tecnic'];

    // Tria editorial (vegeu LLEGENDES.md): un arquetip i uns trets per jugador.
    // Estan alineats amb els `weights` i el `style` de llegendes.js.
    const PROFILES = Object.freeze({
        morphy:     { archetype: 'agressiu',   agressivitat: 0.85, prudencia: 0.25, tactica: 0.85, estrategica: 0.50, resistencia: 0.55, pressio: 0.50, finals: 0.45, recuperacio: 0.55 },
        steinitz:   { archetype: 'posicional', agressivitat: 0.40, prudencia: 0.65, tactica: 0.50, estrategica: 0.90, resistencia: 0.80, pressio: 0.65, finals: 0.70, recuperacio: 0.60 },
        lasker:     { archetype: 'defensiu',   agressivitat: 0.50, prudencia: 0.60, tactica: 0.70, estrategica: 0.60, resistencia: 0.90, pressio: 0.92, finals: 0.70, recuperacio: 0.85 },
        capablanca: { archetype: 'tecnic',     agressivitat: 0.30, prudencia: 0.70, tactica: 0.60, estrategica: 0.80, resistencia: 0.75, pressio: 0.65, finals: 0.95, recuperacio: 0.60 },
        alekhine:   { archetype: 'tactic',     agressivitat: 0.85, prudencia: 0.30, tactica: 0.92, estrategica: 0.60, resistencia: 0.60, pressio: 0.60, finals: 0.60, recuperacio: 0.60 },
        botvinnik:  { archetype: 'posicional', agressivitat: 0.45, prudencia: 0.60, tactica: 0.55, estrategica: 0.92, resistencia: 0.85, pressio: 0.60, finals: 0.75, recuperacio: 0.60 },
        fischer:    { archetype: 'tactic',     agressivitat: 0.65, prudencia: 0.45, tactica: 0.90, estrategica: 0.70, resistencia: 0.80, pressio: 0.75, finals: 0.80, recuperacio: 0.65 },
        karpov:     { archetype: 'defensiu',   agressivitat: 0.30, prudencia: 0.85, tactica: 0.60, estrategica: 0.88, resistencia: 0.85, pressio: 0.90, finals: 0.85, recuperacio: 0.70 },
        kasparov:   { archetype: 'agressiu',   agressivitat: 0.90, prudencia: 0.25, tactica: 0.90, estrategica: 0.70, resistencia: 0.75, pressio: 0.65, finals: 0.65, recuperacio: 0.65 },
        carlsen:    { archetype: 'tecnic',     agressivitat: 0.50, prudencia: 0.60, tactica: 0.75, estrategica: 0.80, resistencia: 0.95, pressio: 0.80, finals: 0.95, recuperacio: 0.80 }
    });

    const TRAIT_KEYS = ['agressivitat', 'prudencia', 'tactica', 'estrategica', 'resistencia', 'pressio', 'finals', 'recuperacio'];
    const NEUTRAL = Object.freeze({ archetype: null, agressivitat: 0.5, prudencia: 0.5, tactica: 0.65, estrategica: 0.65, resistencia: 0.65, pressio: 0.65, finals: 0.65, recuperacio: 0.65 });

    // Perfil d'un jugador qualsevol (p. ex. els perfils del duel de la TV) a
    // partir dels `weights` de tvMoveFeatures: no es dupliquen sistemes, es
    // dedueix l'arquetip de les mateixes preferències.
    function traitsFromWeights(weights) {
        const w = weights && typeof weights === 'object' ? weights : {};
        const g = k => (isNum(w[k]) ? w[k] : 0);
        const attack = g('check') + g('storm') + g('approach') + g('sacrifice') + g('threat');
        const safe = g('castle') + g('quiet') + g('retreat') + g('tradeAhead') - g('sacrifice') - g('storm');
        const pos = g('centralization') + g('development') + g('rookFile');
        const captures = g('captureValue') + g('threat') + g('promotion');
        const trade = g('trade') + g('tradeAhead');
        const out = Object.assign({}, NEUTRAL);
        out.agressivitat = clamp(0.5 + 0.07 * attack, 0.15, 0.95);
        out.prudencia = clamp(0.5 + 0.07 * safe, 0.15, 0.95);
        out.tactica = clamp(0.62 + 0.04 * (attack + captures), 0.45, 0.95);
        out.estrategica = clamp(0.62 + 0.05 * pos, 0.45, 0.95);
        let archetype = 'posicional';
        if (attack > 5 && captures > 2) archetype = 'tactic';
        else if (attack > 4) archetype = 'agressiu';
        else if (safe > 4 && trade >= 0.5) archetype = 'defensiu';
        else if (trade > 1.5) archetype = 'tecnic';
        out.archetype = archetype;
        return out;
    }

    function profileFor(player) {
        const p = player || {};
        const id = typeof player === 'string' ? player : p.id;
        const base = id && Object.prototype.hasOwnProperty.call(PROFILES, id) ? PROFILES[id]
            : (p.weights ? traitsFromWeights(p.weights) : NEUTRAL);
        return Object.assign({ id: id || null }, base);
    }

    // Vulnerabilitats: biaix (en logaritme de pes) sobre les JUGADES
    // INFERIORS que encaixen amb cada manera de jugar. Positiu = temptació;
    // negatiu = aversió. Només actuen entre candidates raonables i mai no
    // obliguen res (un jugador agressiu no s'equivoca sempre atacant).
    const VULNERABILITIES = Object.freeze({
        // Sobrevalora compensacions, arrisca el rei, rebutja simplificacions favorables.
        agressiu: { iniciativa: 0.7, riscRei: 0.6, materialSac: 0.6, declinaCanvi: 0.7 },
        // Es refugia: perd iniciatives, defensa passivament, simplifica massa aviat.
        defensiu: { passiva: 0.5, declinaIniciativa: 0.7, simplifica: 0.45, riscRei: -0.7, materialSac: -0.7 },
        // Infravalora el cop tàctic puntual i tria maniobres lentes; cuida els peons.
        posicional: { maniobraLenta: 0.8, declinaIniciativa: 0.35, estructura: -0.9 },
        // Sobrevalora el complicat i prefereix la continuació vistosa.
        tactic: { complicacio: 0.7, temptacio: 0.8 },
        // Perd l'ocasió de complicar quan li cal guanyar; prefereix controlar.
        tecnic: { declinaComplicacio: 0.7, simplifica: 0.4, riscRei: -0.5, materialSac: -0.5 }
    });

    // ------------------------------------------------------------------
    // Fets de la posició i de les jugades (chess.js + anàlisi)
    // ------------------------------------------------------------------
    // Línies del motor (des de qui mou) → [{ uci, type, value, depth }] ordenades
    // pel multipv. Descarta les línies amb límit (lowerbound/upperbound).
    function linesFromInfos(infos) {
        return Object.keys(infos || {}).map(k => infos[k])
            .filter(i => i && Array.isArray(i.pv) && i.pv.length && !i.bound && (i.type === 'cp' || i.type === 'mate') && isNum(i.value))
            .sort((a, b) => (a.multipv || 0) - (b.multipv || 0))
            .map(i => ({ uci: i.pv[0], type: i.type, value: i.value, depth: i.depth || 0 }));
    }

    function pieceCounts(chess) {
        let nonKing = 0, nonPawn = 0;
        chess.board().forEach(row => row.forEach((p) => {
            if (!p || p.type === 'k') return;
            nonKing++;
            if (p.type !== 'p') nonPawn++;
        }));
        return { nonKing: nonKing, nonPawn: nonPawn };
    }

    // Final elemental: tan pocs trets (K+Q/R vs K, K+P vs K…) que no s'hi juga
    // amb criteri humà: el motor mana.
    function elementaryEnding(ChessCtor, fen) {
        try { return pieceCounts(new ChessCtor(fen)).nonKing <= CONFIG.ELEMENTARY_PIECES; } catch (e) { return false; }
    }

    // Fets objectius de la posició: densitat tàctica, posició tancada,
    // fase, complexitat (0–1). Tot surt de chess.js i de les línies de l'anàlisi.
    function positionFacts(ChessCtor, fen, lines) {
        let g;
        try { g = new ChessCtor(fen); } catch (e) { return null; }
        const moves = g.moves({ verbose: true });
        const n = Math.max(1, moves.length);
        const captures = moves.filter(m => m.captured).length;
        const checks = moves.filter(m => /[+#]/.test(m.san)).length;
        const pc = pieceCounts(g);
        const cps = (lines || []).filter(l => l.type === 'cp');
        const best = cps.length ? cps[0].value : null;
        const second = cps.length > 1 ? cps[1].value : null;
        const gap = isNum(best) && isNum(second) ? Math.max(0, best - second) : 0;
        const near = cps.filter(l => isNum(best) && best - l.value <= 40).length;
        const spread = cps.length > 1 ? (near - 1) / (cps.length - 1) : 0;
        const density = Math.min(1, (captures + checks) / n * 2.5);
        const onlyMove = clamp(gap / 250, 0, 1);
        const material = Math.min(1, pc.nonPawn / 12);
        const complexity = clamp(0.35 * density + 0.35 * onlyMove + 0.15 * material + 0.15 * spread, 0, 1);
        const phase = pc.nonPawn <= 6 ? 'final' : (pc.nonPawn >= 12 ? 'obertura' : 'migjoc');
        return { complexity: complexity, density: density, onlyMove: onlyMove, gap: gap,
            tactical: onlyMove >= 0.3 || density >= 0.45, closed: captures === 0 && checks === 0 && pc.nonKing >= 12,
            phase: phase, nonPawn: pc.nonPawn, legalMoves: moves.length };
    }

    function pawnTrouble(chess, color) {
        const files = [0, 0, 0, 0, 0, 0, 0, 0];
        chess.board().forEach(row => row.forEach((p, f) => { if (p && p.type === 'p' && p.color === color) files[f]++; }));
        let doubled = 0, isolated = 0;
        for (let f = 0; f < 8; f++) {
            if (files[f] > 1) doubled += files[f] - 1;
            if (files[f] > 0 && !(f > 0 && files[f - 1]) && !(f < 7 && files[f + 1])) isolated += files[f];
        }
        return doubled + isolated;
    }

    // Variació de «problemes» d'estructura de peons del bàndol que mou.
    function pawnDelta(ChessCtor, fen, uci) {
        try {
            const g = new ChessCtor(fen);
            const color = g.turn();
            const before = pawnTrouble(g, color);
            const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
            return mv ? pawnTrouble(g, color) - before : 0;
        } catch (e) { return 0; }
    }

    // La jugada acaba la partida en taules per ofegat o per falta de material?
    function endsInDeadDraw(ChessCtor, fen, uci) {
        try {
            const g = new ChessCtor(fen);
            const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
            return !!mv && (g.in_stalemate() || g.insufficient_material());
        } catch (e) { return false; }
    }

    // Etiquetes d'una jugada (només fets comprovats amb chess.js).
    function moveFlags(f, delta) {
        const x = f || {};
        const forcing = !!(x.check || x.captureValue > 0 || x.threat > 0);
        return {
            forcing: forcing,
            iniciativa: !!(x.check || x.threat > 0 || x.approach >= 1 || x.storm),
            riscRei: !!(x.shield || x.kingMove),
            materialSac: !!x.sacrifice,
            simplifica: !!x.trade,
            passiva: !!(x.retreat || x.kingMove || x.backtrack),
            complicacio: !!(x.sacrifice || (x.check && !x.captureValue) || x.threat > 0),
            estructura: delta > 0,
            tranquila: !!(x.quiet && !x.check && !(x.threat > 0))
        };
    }

    const FLAG_LABELS = ['iniciativa', 'riscRei', 'materialSac', 'simplifica', 'passiva', 'complicacio', 'estructura'];
    function tagList(flags) { return FLAG_LABELS.filter(k => flags && flags[k]); }

    // Classe d'una pèrdua d'avaluació (cp, ≥ 0).
    function classifyLoss(loss) {
        if (!isNum(loss) || loss < CONFIG.IMPRECISION_CP) return 'bona';
        if (loss < CONFIG.MISTAKE_CP) return 'imprecisio';
        if (loss < CONFIG.BLUNDER_CP) return 'error';
        return 'errorGreu';
    }

    // ------------------------------------------------------------------
    // Estat de precisió d'un jugador
    // ------------------------------------------------------------------
    function createPlayer(profile, rng) {
        const p = profile || NEUTRAL;
        // Precisió de referència pràcticament igual per a tothom (només
        // 'respira' el perfil): els perfils canvien COM s'erra, no la força.
        const skill = (p.tactica + p.estrategica + p.finals) / 3;
        const base = clamp(CONFIG.BASE_Q + 0.08 * (skill - 0.7), 0.6, 0.85);
        const sd = CONFIG.FLUCT_SIGMA;
        // L'estat inicial ja és una extracció de la distribució estacionària.
        return { profile: p, rng: rng, base: base, x: gaussian(rng) * sd, wear: 0, dip: 0, lastPly: 0, moves: 0 };
    }

    // Avança l'estat fins a la semijugada `ply` amb una posició de complexitat
    // `complexity` i una avaluació `evalMover` (cp, des de qui mou; null si no
    // en sabem res). Retorna la precisió q (0–1). Consumeix SEMPRE les mateixes
    // extraccions de l'RNG del jugador (2 per la fluctuació).
    function advance(state, ply, complexity, evalMover, clock) {
        const p = state.profile, C = CONFIG;
        const steps = Math.max(1, ply - state.lastPly);
        state.lastPly = ply;
        state.moves++;
        // Fluctuació correlada en el temps (AR(1)); si salta moltes semijugades
        // seguides (jugades preparades), la correlació s'afebleix amb elles.
        const rho = Math.pow(C.FLUCT_RHO, Math.min(steps, 6) / 2);
        const eps = gaussian(state.rng);
        state.x = rho * state.x + Math.sqrt(Math.max(0, 1 - rho * rho)) * C.FLUCT_SIGMA * eps;
        // Desgast moderat: depèn de la resistència i de la complexitat.
        state.wear = Math.min(C.WEAR_MAX, state.wear + C.WEAR_RATE * steps * (0.6 + 0.8 * complexity) * (1.3 - p.resistencia));
        // Sots de les fases difícils i recuperació.
        const behind = isNum(evalMover) && evalMover <= -80;
        const hard = (behind ? 0.6 : 0) + (complexity > 0.55 ? (complexity - 0.55) * 1.4 : 0);
        state.dip = Math.min(C.DIP_MAX, state.dip + C.DIP_GAIN * hard * (1.2 - p.pressio));
        state.dip *= 1 - (C.DIP_DECAY_MIN + C.DIP_DECAY_RANGE * p.recuperacio);
        const q = state.base + state.x - state.wear - state.dip - C.CLOCK_PENALTY * clamp(clock || 0, 0, 1);
        return clamp(q, 0.08, 1);
    }

    function tauFor(q, p, facts, ply, evalMover) {
        const C = CONFIG;
        let tau = C.TAU_MIN + (C.TAU_MAX - C.TAU_MIN) * Math.pow(1 - q, C.Q_EXPONENT);
        // Habilitat segons el tipus de posició.
        if (facts.tactical) tau *= 1.45 - 0.8 * p.tactica;
        else tau *= 1.45 - 0.8 * p.estrategica;
        if (facts.closed) tau *= 1 + 0.8 * Math.max(0, p.tactica - p.estrategica);
        if (facts.phase === 'final') tau *= 1.5 - 0.9 * p.finals;
        if (isNum(evalMover) && evalMover <= -100) tau *= 1.5 - 0.8 * p.pressio;
        // Posicions senzilles → menys errors; complexes → més.
        tau *= 0.75 + 0.9 * facts.complexity;
        // Principi de partida: la teoria no es desvirtua (rampa suau).
        tau *= C.OPENING_MIN_SCALE + (1 - C.OPENING_MIN_SCALE) * smoothstep((ply - C.OPENING_PLIES) / C.OPENING_RAMP);
        return Math.max(1, tau);
    }

    // ------------------------------------------------------------------
    // La partida
    // ------------------------------------------------------------------
    // opts = { seed, players: { w: {id, weights}, b: {...} }, enabled }
    // Cada jugador té un RNG propi derivat de la llavor i de la seva identitat.
    function createGame(opts) {
        const o = opts || {};
        const seed = o.seed === undefined || o.seed === null ? 1 : o.seed;
        const sides = {};
        ['w', 'b'].forEach((color) => {
            const player = (o.players && o.players[color]) || null;
            const profile = profileFor(player);
            const salt = (profile.id || 'anonim') + (o.players && o.players.w && o.players.b && (o.players.w.id || null) === (o.players.b.id || null) ? '|' + color : '');
            sides[color] = createPlayer(profile, createRng(hashSeed(String(seed) + '#' + salt)));
        });
        // Un RNG per a les tries, també per jugador i independent de la fluctuació.
        ['w', 'b'].forEach((color) => {
            sides[color].pick = createRng(hashSeed(String(seed) + '#pick#' + (sides[color].profile.id || 'anonim') + '#' + color));
        });
        return { version: VERSION, seed: seed, enabled: o.enabled !== false && CONFIG.ENABLED, sides: sides, log: [] };
    }

    function decideBypass(game, color, ply, reason, engineUci, extra) {
        const rec = Object.assign({ ply: ply, color: color, id: game.sides[color].profile.id, uci: engineUci || null,
            changed: false, bypass: reason }, extra || {});
        if (game.log.length < CONFIG.LOG_MAX) game.log.push(rec);
        return { uci: engineUci || null, changed: false, bypass: reason, loss: 0, cls: 'bona', tags: [], q: null, tau: null, record: rec };
    }

    // Tria la jugada d'un jugador.
    // input = { ChessCtor, fen, ply, lines (des de qui mou), engineUci,
    //           features (fn: (Chess, fen, uci, evalCp, ctx) → trets),
    //           context, weights (preferències de jugada), clock, windowCp, risk }
    // Torna { uci, changed, loss, cls, tags, q, tau, bypass, record }.
    function decide(game, color, input) {
        const i = input || {};
        const side = game && game.sides && game.sides[color];
        if (!side) return { uci: i.engineUci || null, changed: false, bypass: 'sense-jugador', loss: 0, cls: 'bona', tags: [], q: null, tau: null };
        const C = CONFIG;
        const ply = isNum(i.ply) ? i.ply : 0;
        const lines = Array.isArray(i.lines) ? i.lines : [];
        const cps = lines.filter(l => l.type === 'cp');
        const facts = i.ChessCtor && i.fen ? positionFacts(i.ChessCtor, i.fen, lines) : null;
        const bestVal = cps.length ? cps[0].value : null;
        // L'estat avança SEMPRE (també si després es salta la tria): així el
        // comportament no depèn de quines posicions s'han protegit.
        const q = advance(side, ply, facts ? facts.complexity : 0.4, bestVal, i.clock);
        const pick = side.pick();
        if (!game.enabled) return decideBypass(game, color, ply, 'desactivat', i.engineUci);
        if (!facts || lines.length < 2 || !cps.length) return decideBypass(game, color, ply, 'sense-candidates', i.engineUci, { q: round(q) });
        // Mats (a favor o en contra) i finals elementals: mana el motor.
        if (lines.some(l => l.type === 'mate')) return decideBypass(game, color, ply, 'mat', i.engineUci, { q: round(q) });
        if (elementaryEnding(i.ChessCtor, i.fen)) return decideBypass(game, color, ply, 'final-elemental', i.engineUci, { q: round(q) });
        const p = side.profile;
        const tau = tauFor(q, p, facts, ply, bestVal);
        // Pèrdua màxima admesa (complexitat) i proteccions de resultat.
        let cap = C.CAP_SIMPLE + (C.CAP_COMPLEX - C.CAP_SIMPLE) * Math.pow(facts.complexity, C.CAP_EXPONENT);
        if (isNum(i.windowCp)) cap = Math.max(cap, i.windowCp);
        const guarded = bestVal >= C.WIN_GUARD_CP;
        let cands = cps.map(l => ({ uci: l.uci, value: l.value, loss: bestVal - l.value }))
            .filter((c, idx) => idx === 0 || (c.loss <= cap
                && (!guarded || c.value >= C.WIN_KEEP_CP)
                && !(bestVal >= -50 && c.value < C.LOST_FLOOR_CP)));
        if (cands.length < 2) return decideBypass(game, color, ply, 'sense-alternatives', i.engineUci, { q: round(q), tau: round(tau) });
        // Fets i etiquetes de cada candidata.
        const featuresFn = typeof i.features === 'function' ? i.features : null;
        cands.forEach((c) => {
            const f = featuresFn ? featuresFn(i.ChessCtor, i.fen, c.uci, bestVal, i.context) : null;
            c.f = f;
            c.flags = moveFlags(f, pawnDelta(i.ChessCtor, i.fen, c.uci));
            c.dead = endsInDeadDraw(i.ChessCtor, i.fen, c.uci);
        });
        // Etiquetes relatives al conjunt de candidates.
        const bestFlags = cands[0].flags;
        const anyTrade = cands.some(c => c.flags.simplifica);
        const anyInit = cands.some(c => c.flags.iniciativa);
        const anyComplic = cands.some(c => c.flags.complicacio);
        cands.forEach((c, idx) => {
            const fl = c.flags;
            fl.declinaCanvi = !fl.simplifica && anyTrade;
            fl.declinaIniciativa = !fl.iniciativa && anyInit;
            fl.maniobraLenta = fl.tranquila && !fl.iniciativa && bestFlags.forcing && idx > 0;
            fl.temptacio = idx > 0 && fl.forcing && fl.complicacio && !bestFlags.forcing;
            fl.declinaComplicacio = !fl.complicacio && anyComplic && bestVal <= 40;
        });
        const vul = VULNERABILITIES[p.archetype] || {};
        const vulnScale = C.VULN_BASE + (1 - q);
        const weights = i.weights && typeof i.weights === 'object' ? i.weights : null;
        const equal = Math.abs(bestVal) <= C.EQUAL_CP;
        const ambitious = Math.abs(bestVal) <= C.AMBITION_CP && ply >= C.AMBITION_FROM_PLY;
        // `risk` (0–1): la fase d'atac de la lliga (desencallar la partida) dona molt més
        // pes al perfil de progrés dins del seu marge de pèrdua.
        const risk = clamp(i.risk || 0, 0, 1);
        const prefGain = C.PREF_GAIN + C.RISK_PREF_GAIN * risk, prefMax = C.PREF_MAX + C.RISK_PREF_MAX * risk;
        cands.forEach((c, idx) => {
            let logw = -c.loss / tau;
            // Preferències de jugada del perfil (mateixa fórmula per a tothom).
            if (weights && c.f) {
                const s = Object.keys(weights).reduce((sum, k) => sum + weights[k] * (c.f[k] || 0), 0);
                logw += clamp(prefGain * s, -prefMax, prefMax);
            }
            // Vulnerabilitats: només sobre les alternatives inferiors.
            if (idx > 0) {
                Object.keys(vul).forEach((k) => { if (c.flags[k]) logw += vul[k] * vulnScale; });
            }
            // Ambició: en una posició igualada es castiguen les repeticions i tornar enrere.
            if (equal && c.f) {
                if (c.f.repeat) logw -= C.REPEAT_PENALTY;
                if (c.f.backtrack) logw -= C.BACKTRACK_PENALTY;
            }
            // Ambició en posicions igualades i ja avançada la partida: es prefereix mantenir
            // la tensió que simplificar cap a taules, i buscar la iniciativa (més com més
            // agressiu és el jugador). No és cap error: les jugades són equivalents per a l'anàlisi.
            if (ambitious && c.flags) {
                if (c.flags.simplifica) logw -= C.CONTEMPT_TRADE * (1.2 - p.prudencia);
                if (c.flags.iniciativa) logw += C.TENSION_BONUS * (0.5 + p.agressivitat);
            }
            // Qui no va per sota no es llença a unes taules mortes (ofegat o falta de material)
            // si l'anàlisi en dona una altra de raonable: no s'impedeixen, només es dispreuen.
            if (bestVal >= C.DEAD_DRAW_FROM_CP && c.dead) logw -= C.DEAD_DRAW_PENALTY;
            if (c.uci === i.engineUci) logw += C.ENGINE_ANCHOR;
            c.logw = logw;
        });
        const maxLog = Math.max.apply(null, cands.map(c => c.logw));
        let total = 0;
        cands.forEach((c) => { c.w = Math.exp(c.logw - maxLog); total += c.w; });
        let acc = 0, chosen = cands[0];
        const target = pick * total;
        for (let k = 0; k < cands.length; k++) {
            acc += cands[k].w;
            if (target < acc) { chosen = cands[k]; break; }
        }
        const rec = { ply: ply, color: color, id: p.id, uci: chosen.uci, changed: chosen.uci !== i.engineUci, bypass: null,
            q: round(q), tau: round(tau), complexity: round(facts.complexity), phase: facts.phase,
            loss: chosen.loss, cls: classifyLoss(chosen.loss), tags: tagList(chosen.flags),
            best: cands[0].uci, n: cands.length };
        if (game.log.length < C.LOG_MAX) game.log.push(rec);
        return { uci: chosen.uci, changed: rec.changed, loss: rec.loss, cls: rec.cls, tags: rec.tags, q: rec.q, tau: rec.tau,
            bypass: null, record: rec,
            candidates: cands.map(c => ({ uci: c.uci, loss: c.loss, p: c.w / total })) };
    }

    function round(v) { return isNum(v) ? Math.round(v * 1000) / 1000 : v; }

    // Resum del registre tècnic d'una partida (per a proves i depuració).
    function summarizeLog(log) {
        const out = { moves: 0, changed: 0, bypass: 0, bona: 0, imprecisio: 0, error: 0, errorGreu: 0, qMean: null };
        let qs = 0, nq = 0;
        (log || []).forEach((r) => {
            out.moves++;
            if (r.bypass) { out.bypass++; return; }
            if (r.changed) out.changed++;
            out[r.cls] = (out[r.cls] || 0) + 1;
            if (isNum(r.q)) { qs += r.q; nq++; }
        });
        out.qMean = nq ? Math.round(qs / nq * 1000) / 1000 : null;
        return out;
    }

    // Dades perquè els comentaristes parlin d'un error ja jugat: només fets
    // (la classe, l'etiqueta de la jugada i l'arquetip del jugador).
    // Torna null si el perfil no té relació amb la jugada.
    const STYLE_LINK = {
        agressiu: ['iniciativa', 'riscRei', 'materialSac'],
        defensiu: ['passiva', 'simplifica'],
        posicional: ['estructura', 'tranquila'],
        tactic: ['complicacio', 'iniciativa'],
        tecnic: ['simplifica', 'passiva']
    };
    function styleLink(archetype, flags) {
        const keys = STYLE_LINK[archetype] || [];
        return keys.find(k => flags && flags[k]) || null;
    }

    return {
        VERSION, CONFIG, ARCHETYPES, PROFILES, TRAIT_KEYS, VULNERABILITIES, NEUTRAL,
        hashSeed, createRng, gaussian,
        profileFor, traitsFromWeights,
        linesFromInfos, positionFacts, elementaryEnding, endsInDeadDraw, pawnDelta, moveFlags, tagList, classifyLoss, styleLink,
        createGame, decide, summarizeLog, tauFor, advance, createPlayer
    };
});
