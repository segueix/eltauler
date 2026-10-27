// ============================================================================
// stockfishtv.js — «Stockfish TV»: Stockfish contra Stockfish amb comentaris
// ============================================================================
// Cada dispositiu GENERA la seva pròpia partida en temps real (no és cap
// emissió compartida): dos jugadors Stockfish al mateix nivell, una anàlisi
// independent sense límit de força i comentaris breus en català basats en
// fets verificats (regles amb chess.js i anàlisi fiable del motor).
//
// Peces del mòdul:
//   · LÒGICA PURA (exportada a Node per als tests): lectura de les opcions
//     UCI que declara el motor real (UCI_Elo, UCI_LimitStrength, Skill
//     Level), rang de la TV, objectiu de nivell segons l'espectador,
//     normalització de valoracions, final de partida i redacció dels
//     comentaris i del text parlat.
//   · MOTOR (createTvEngine): un worker PROPI de la TV, diferent del de les
//     partides personals, amb una cua de peticions serialitzada. Cada petició
//     porta la partida, la posició i el torn; una pausa, una partida nova o la
//     sortida invaliden les pendents.
//   · VEU (createTvVoice): speechSynthesis amb una veu CATALANA o cap. Mai
//     no s'acumulen locucions i sempre hi ha un temps màxim d'espera.
//   · CONTROLADOR (createTvController): el bucle de la partida, independent
//     del DOM (es prova amb un motor fals i temporitzadors simulats).
//   · INTERFÍCIE (init/open/close): només al navegador.
//
// La TV té ESTAT PROPI: no toca la partida personal (`game`), ni el nivell
// de l'usuari, ni l'historial, ni el calibratge. Les seves preferències es
// desen a TV_CONFIG.PREFS_KEY, una clau sense prefix chess_/eltauler_ perquè
// la sincronització al núvol no la reculli.
//
// Es carrega com a:
//   - Navegador: <script src="stockfishtv.js"> → window.ElTaulerStockfishTV
//   - Node/Jest: require('./stockfishtv') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerStockfishTV = api;
    }
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    function getCore() {
        if (root && root.ElTaulerCore) return root.ElTaulerCore;
        try { if (typeof require === 'function') return require('./core'); } catch (e) {}
        return null;
    }
    function getRedactor() {
        if (root && root.ElTaulerRedactor) return root.ElTaulerRedactor;
        try { if (typeof require === 'function') return require('./redactor'); } catch (e) {}
        return null;
    }

    // ------------------------------------------------------------------
    // Configuració
    // ------------------------------------------------------------------
    const TV_CONFIG = {
        // Mínim de la TV quan el motor permet fixar l'Elo: max(800, mínim natiu).
        ELO_FLOOR: 800,
        // Marge inicial sobre el nivell de l'espectador (regla ajustable).
        VIEWER_MARGIN: 200,
        // Passos de «Massa fàcil» / «Massa difícil».
        ELO_STEP: 100,
        SKILL_STEP: 1,
        // Anàlisi pedagògica: sense límit de força i amb un pressupost raonable.
        ANALYSIS_MOVETIME_MS: 900,
        ANALYSIS_MAX_DEPTH: 16,
        ANALYSIS_MULTIPV: 2,
        // Per sota d'aquesta profunditat no es fa cap comentari interpretatiu.
        MIN_RELIABLE_DEPTH: 10,
        // Temps de càlcul dels jugadors (separat del temps de visualització).
        PLAYER_MOVETIME_MS: { elo: 600, skill: 500, none: 300 },
        // Temps de visualització entre jugades (ms).
        SPEEDS: {
            slow: { label: 'Lent', min: 7500, max: 10000 },
            calm: { label: 'Tranquil', min: 5000, max: 8000 },
            quick: { label: 'Àgil', min: 2500, max: 4000 }
        },
        DEFAULT_SPEED: 'calm',
        // Espectadors per sota del mínim del motor: ritme més lent.
        BASIC_PACE_FACTOR: 1.3,
        // Jugades preparades de l'obertura: més àgils (ja són teoria).
        PREPARED_PACE_FACTOR: 0.55,
        // Pausa curta després d'una locució abans de la jugada següent.
        POST_SPEECH_PAUSE_MS: 900,
        // Pausa en reprendre (sense jugades acumulades).
        RESUME_DELAY_MS: 1500,
        // Presentació de l'obertura abans de la primera jugada.
        INTRO_DELAY_MS: 3500,
        // Pausa breu entre una partida acabada i la següent.
        NEXT_GAME_DELAY_MS: 10000,
        // Límit de durada de la TV (en semijugades): taules si s'hi arriba.
        MAX_PLIES: 400,
        // Pèrdua mínima (cp, mateix bàndol) per comentar una alternativa.
        MISSED_LOSS_CP: { basic: 250, mid: 200, advanced: 150 },
        // Amb una posició ja decidida no es comenten matisos.
        DECIDED_CP: 600,
        // Mat anunciat: només si és curt.
        MATE_ANNOUNCE_MAX: 3,
        MISSED_MATE_MAX: 5,
        // Cadència dels comentaris: entre dos comentaris ordinaris hi ha
        // d'haver almenys aquestes semijugades, i un mateix tipus no es
        // repeteix dins de la finestra.
        COMMENT_GAP_PLIES: 2,
        SAME_KIND_WINDOW_PLIES: 6,
        HIGH_PRIORITY: 70,
        DEVELOPMENT_MAX_PLY: 20,
        DEVELOPMENT_MAX_PER_COLOR: 2,
        PREFS_KEY: 'tauler_tv_prefs'
    };

    const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const PIECE_NAME = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
    const PIECE_PLURAL = { p: 'peons', n: 'cavalls', b: 'alfils', r: 'torres', q: 'dames', k: 'reis' };
    const PIECE_FEMININE = { r: true, q: true };
    const COLOR = {
        w: { pl: 'les blanques', Pl: 'Les blanques', adj: 'blanc', adjF: 'blanca' },
        b: { pl: 'les negres', Pl: 'Les negres', adj: 'negre', adjF: 'negra' }
    };
    const HOME_SQUARES = { w: { b1: 'n', g1: 'n', c1: 'b', f1: 'b' }, b: { b8: 'n', g8: 'n', c8: 'b', f8: 'b' } };

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function other(color) { return color === 'w' ? 'b' : 'w'; }
    function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    // ------------------------------------------------------------------
    // Opcions UCI del motor real
    // ------------------------------------------------------------------
    // "option name UCI_Elo type spin default 1350 min 1350 max 2850"
    function parseUciOptionLine(line) {
        const m = /^option name (.+?) type (\S+)(.*)$/.exec(String(line || '').trim());
        if (!m) return null;
        const rest = m[3] || '';
        const num = (key) => {
            const r = new RegExp('\\b' + key + ' (-?\\d+)').exec(rest);
            return r ? parseInt(r[1], 10) : null;
        };
        const def = /\bdefault (\S*)/.exec(rest);
        const vars = [];
        rest.replace(/\bvar (\S+)/g, (all, v) => { vars.push(v); return all; });
        return { name: m[1], type: m[2], default: def ? def[1] : null, min: num('min'), max: num('max'), vars: vars };
    }

    function parseUciOptions(lines) {
        const out = { name: null, options: {}, uciok: false };
        (Array.isArray(lines) ? lines : String(lines || '').split(/\r?\n/)).forEach((raw) => {
            const line = String(raw || '').trim();
            if (line.indexOf('id name ') === 0) out.name = line.slice(8).trim();
            else if (line === 'uciok') out.uciok = true;
            else if (line.indexOf('option name ') === 0) {
                const opt = parseUciOptionLine(line);
                if (opt) out.options[opt.name] = opt;
            }
        });
        return out;
    }

    // Capacitats de la TV segons el que el motor DECLARA (mai segons
    // constants del projecte):
    //   mode 'elo'   → UCI_Elo + UCI_LimitStrength: min = max(800, mínim natiu)
    //   mode 'skill' → el motor no declara l'Elo: s'usa l'opció nativa
    //                  «Skill Level» i el nivell NO s'etiqueta com a Elo
    //   mode 'none'  → cap opció de força: els jugadors van a força plena
    function tvEngineCapabilities(parsed) {
        const p = parsed || { options: {} };
        const o = p.options || {};
        const elo = o.UCI_Elo;
        const limit = o.UCI_LimitStrength;
        const skill = o['Skill Level'];
        const missing = [];
        if (!elo) missing.push('UCI_Elo');
        if (!limit) missing.push('UCI_LimitStrength');
        const base = { engineName: p.name || null, missing: missing, hasSkill: !!(skill && skill.type === 'spin' && isNum(skill.max)) };
        if (elo && elo.type === 'spin' && isNum(elo.min) && isNum(elo.max) && limit && limit.type === 'check') {
            const min = Math.max(TV_CONFIG.ELO_FLOOR, elo.min);
            if (min <= elo.max) {
                return Object.assign(base, {
                    mode: 'elo', engineEloMin: elo.min, engineEloMax: elo.max,
                    min: min, max: elo.max, step: TV_CONFIG.ELO_STEP,
                    skillMax: base.hasSkill ? skill.max : null
                });
            }
            base.eloOutOfRange = { min: elo.min, max: elo.max };
        }
        if (base.hasSkill && isNum(skill.min)) {
            return Object.assign(base, {
                mode: 'skill', engineEloMin: null, engineEloMax: null,
                min: skill.min, max: skill.max, step: TV_CONFIG.SKILL_STEP, skillMax: skill.max
            });
        }
        return Object.assign(base, { mode: 'none', engineEloMin: null, engineEloMax: null, min: null, max: null, step: 0, skillMax: null });
    }

    // Text de la incompatibilitat (o null si el motor admet l'Elo).
    function tvCompatibilityNote(caps) {
        if (!caps || caps.mode === 'elo') return null;
        const missing = (caps.missing && caps.missing.length) ? caps.missing.join(' i ') : 'UCI_Elo';
        if (caps.eloOutOfRange) {
            return 'El motor declara UCI_Elo entre ' + caps.eloOutOfRange.min + ' i ' + caps.eloOutOfRange.max
                + ', per sota del mínim de la TV (' + TV_CONFIG.ELO_FLOOR + '): no s\'hi pot fixar cap Elo.'
                + (caps.mode === 'skill' ? ' Els jugadors fan servir l\'opció nativa «Skill Level» (' + caps.min + '–' + caps.max + '), que no és cap Elo.' : '');
        }
        if (caps.mode === 'skill') {
            return 'Aquest motor no declara ' + missing + ', així que no se li pot fixar cap Elo. Els jugadors fan servir l\'opció nativa «Skill Level» (' + caps.min + '–' + caps.max + '): és una escala del motor, no cap Elo.';
        }
        return 'Aquest motor no declara ' + missing + ' ni «Skill Level»: els dos jugadors juguen a força plena i el nivell no es pot ajustar.';
    }

    function tvLevelLabel(caps, value) {
        if (!caps || caps.mode === 'none' || !isNum(value)) return { short: 'Força plena', long: 'Força del motor sense limitar' };
        if (caps.mode === 'elo') return { short: '≈ ' + value, long: 'Elo aproximat del motor: ' + value };
        return { short: 'Habilitat ' + value + '/' + caps.max, long: 'Habilitat del motor: ' + value + ' de ' + caps.max };
    }

    // Ordres UCI per configurar un jugador o l'anàlisi (sempre explícites:
    // cada petició deixa el motor com li cal, sense dependre de l'anterior).
    function tvStrengthCommands(caps, role, value) {
        if (!caps) return [];
        if (caps.mode === 'elo') {
            if (role === 'player') {
                return ['setoption name UCI_LimitStrength value true', 'setoption name UCI_Elo value ' + Math.round(value)];
            }
            const cmds = ['setoption name UCI_LimitStrength value false'];
            if (isNum(caps.skillMax)) cmds.push('setoption name Skill Level value ' + caps.skillMax);
            return cmds;
        }
        if (caps.mode === 'skill') {
            return ['setoption name Skill Level value ' + Math.round(role === 'player' ? value : caps.max)];
        }
        return [];
    }

    // ------------------------------------------------------------------
    // Espectador i objectiu de nivell
    // ------------------------------------------------------------------
    // input: { calibrated, roc } (nivell intern d'El Tauler). Mirar la TV no
    // modifica mai aquest nivell: només es llegeix.
    function tvViewerProfile(input, caps) {
        const known = !!(input && input.calibrated && isNum(input.roc));
        const roc = known ? Math.round(input.roc) : null;
        // «Mínim del motor»: l'Elo mínim de la TV si n'hi ha; si el motor no
        // admet Elo, el mínim nominal de la TV (800).
        const floor = (caps && caps.mode === 'elo') ? caps.min : TV_CONFIG.ELO_FLOOR;
        const belowEngineMin = known && roc < floor;
        let tier;
        if (!known || belowEngineMin) tier = 'basic';
        else if (roc < 1600) tier = 'mid';
        else tier = 'advanced';
        return { known: known, roc: roc, floor: floor, belowEngineMin: belowEngineMin, tier: tier };
    }

    // Objectiu automàtic, abans de la preferència de l'espectador.
    //   elo   → conversió existent ROC→UCI_Elo (rocToEngineElo de core.js) sobre
    //           nivell + 200, dins del rang DECLARAT. Per sota del mínim, la
    //           conversió el deixa al mínim: el ROC no es fa passar per Elo.
    //   skill → ordenació HEURÍSTICA sobre l'escala nativa (un pas per cada 100
    //           punts per sobre de 800): no és cap equivalència d'Elo.
    function tvBaseTarget(caps, viewer) {
        if (!caps || caps.mode === 'none') return null;
        if (!viewer || !viewer.known) return caps.min;
        const wanted = viewer.roc + TV_CONFIG.VIEWER_MARGIN;
        if (caps.mode === 'elo') {
            const Core = getCore();
            if (Core && typeof Core.rocToEngineElo === 'function') return Core.rocToEngineElo(wanted, caps.min, caps.max);
            return clamp(Math.round(wanted), caps.min, caps.max);
        }
        return clamp(Math.round((wanted - TV_CONFIG.ELO_FLOOR) / 100), caps.min, caps.max);
    }

    function tvCapsSignature(caps) {
        if (!caps || caps.mode === 'none') return 'none';
        return caps.mode + ':' + caps.min + '-' + caps.max;
    }

    function tvNormalizePrefs(raw) {
        const p = (raw && typeof raw === 'object') ? raw : {};
        const voice = (p.voice === 'on' || p.voice === 'off') ? p.voice : null;
        const speed = TV_CONFIG.SPEEDS[p.speed] ? p.speed : TV_CONFIG.DEFAULT_SPEED;
        const offsets = {};
        if (p.offsets && typeof p.offsets === 'object') {
            Object.keys(p.offsets).forEach((k) => { if (isNum(p.offsets[k])) offsets[k] = Math.round(p.offsets[k]); });
        }
        const openingIndex = isNum(p.openingIndex) ? Math.max(0, Math.floor(p.openingIndex)) : null;
        return { voice: voice, speed: speed, offsets: offsets, openingIndex: openingIndex };
    }

    function tvResolveTarget(caps, viewer, prefs) {
        const base = tvBaseTarget(caps, viewer);
        if (base === null) return { value: null, base: null, offset: 0 };
        const p = tvNormalizePrefs(prefs);
        const offset = p.offsets[tvCapsSignature(caps)] || 0;
        const value = clamp(base + offset, caps.min, caps.max);
        return { value: value, base: base, offset: value - base };
    }

    // «Massa fàcil» puja el nivell; «Massa difícil» l'abaixa. Retorna les
    // preferències noves (no toca la partida en curs: s'aplica a la següent).
    function tvAdjustPrefs(caps, viewer, prefs, direction) {
        const p = tvNormalizePrefs(prefs);
        if (!caps || caps.mode === 'none') return p;
        const current = tvResolveTarget(caps, viewer, p);
        const delta = direction === 'harder' ? caps.step : (direction === 'easier' ? -caps.step : 0);
        const next = clamp(current.value + delta, caps.min, caps.max);
        const offsets = Object.assign({}, p.offsets);
        offsets[tvCapsSignature(caps)] = next - current.base;
        return Object.assign({}, p, { offsets: offsets });
    }

    // ------------------------------------------------------------------
    // Ritme
    // ------------------------------------------------------------------
    function tvMoveDelayMs(speedId, opts) {
        const o = opts || {};
        const speed = TV_CONFIG.SPEEDS[speedId] || TV_CONFIG.SPEEDS[TV_CONFIG.DEFAULT_SPEED];
        const r = isNum(o.random) ? clamp(o.random, 0, 1) : 0.5;
        let ms = speed.min + (speed.max - speed.min) * r;
        if (o.tier === 'basic') ms *= TV_CONFIG.BASIC_PACE_FACTOR;
        if (o.prepared) ms *= TV_CONFIG.PREPARED_PACE_FACTOR;
        return Math.round(ms);
    }

    // Temps per llegir un comentari quan no es pronuncia.
    function tvReadingTimeMs(text, tier) {
        const chars = String(text || '').length;
        const ms = Math.max(2500, chars * 55);
        return Math.round(tier === 'basic' ? ms * 1.3 : ms);
    }

    // Temps màxim d'espera d'una locució (si el navegador no avisa del final).
    function tvSpeechMaxWaitMs(text) {
        const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
        return clamp(2500 + words * 600, 4000, 20000);
    }

    // ------------------------------------------------------------------
    // Valoracions del motor
    // ------------------------------------------------------------------
    function parseInfoLine(line) {
        const s = String(line || '');
        if (s.indexOf('info') !== 0 || s.indexOf(' score ') === -1) return null;
        const num = (re) => { const m = re.exec(s); return m ? parseInt(m[1], 10) : null; };
        const cp = /\bscore cp (-?\d+)/.exec(s);
        const mate = /\bscore mate (-?\d+)/.exec(s);
        if (!cp && !mate) return null;
        const pv = / pv (.+)$/.exec(s);
        return {
            depth: num(/\bdepth (\d+)/),
            multipv: num(/\bmultipv (\d+)/) || 1,
            type: mate ? 'mate' : 'cp',
            value: parseInt((mate || cp)[1], 10),
            bound: /\blowerbound\b/.test(s) ? 'lower' : (/\bupperbound\b/.test(s) ? 'upper' : null),
            pv: pv ? pv[1].trim().split(/\s+/) : []
        };
    }

    // El motor dona la valoració des del punt de vista de qui mou. Aquí es
    // porta SEMPRE al punt de vista de les blanques abans de comparar res.
    function tvScoreWhite(score, sideToMove) {
        if (!score || !isNum(score.value) || (score.type !== 'cp' && score.type !== 'mate')) return null;
        const sign = sideToMove === 'b' ? -1 : 1;
        return { type: score.type, value: score.value * sign };
    }

    // Té `color` un mat a favor segons aquesta valoració (punt de vista blanc)?
    function tvMateFor(scoreW, color) {
        if (!scoreW || scoreW.type !== 'mate' || scoreW.value === 0) return null;
        const forWhite = scoreW.value > 0;
        if ((color === 'w') !== forWhite) return null;
        return Math.abs(scoreW.value);
    }

    // Construeix l'anàlisi d'una posició a partir de les línies rebudes.
    function tvBuildAnalysis(fen, infosByPv, bestUci) {
        const turn = String(fen || '').split(' ')[1] === 'b' ? 'b' : 'w';
        const first = infosByPv && infosByPv[1];
        const second = infosByPv && infosByPv[2];
        const depth = first && isNum(first.depth) ? first.depth : 0;
        const best = first ? tvScoreWhite(first, turn) : null;
        return {
            fen: fen,
            turn: turn,
            depth: depth,
            best: best,
            bestUci: bestUci || (first && first.pv[0]) || null,
            pv: first ? first.pv.slice(0, 8) : [],
            second: second ? { score: tvScoreWhite(second, turn), uci: second.pv[0] || null, depth: second.depth } : null,
            reliable: !!(best && depth >= TV_CONFIG.MIN_RELIABLE_DEPTH)
        };
    }

    // Pèrdua de la jugada per a qui l'ha feta (cp ≥ 0), només entre dues
    // valoracions en centipeons. Amb anuncis de mat es retorna null: els mats
    // es tracten a part i mai es barregen aritmèticament amb els centipeons.
    function tvMoverLossCp(beforeW, afterW, moverColor) {
        if (!beforeW || !afterW || beforeW.type !== 'cp' || afterW.type !== 'cp') return null;
        const sign = moverColor === 'w' ? 1 : -1;
        return (beforeW.value - afterW.value) * sign;
    }

    // ------------------------------------------------------------------
    // Final de partida (regles de chess.js, com la resta de l'app)
    // ------------------------------------------------------------------
    function tvGameEnd(chess, maxPlies) {
        if (!chess) return null;
        const limit = isNum(maxPlies) ? maxPlies : TV_CONFIG.MAX_PLIES;
        if (chess.in_checkmate()) {
            const winner = chess.turn() === 'w' ? 'b' : 'w';
            return { result: winner === 'w' ? '1-0' : '0-1', winner: winner, reason: 'checkmate',
                text: 'Escac i mat. Guanyen ' + COLOR[winner].pl + '.' };
        }
        const draw = (reason, text) => ({ result: '½-½', winner: null, reason: reason, text: text });
        if (chess.in_stalemate()) {
            return draw('stalemate', 'Ofegat: ' + COLOR[chess.turn()].pl + ' no tenen cap jugada legal i el rei no està en escac. Taules.');
        }
        if (chess.insufficient_material()) return draw('insufficient', 'Taules: no queda prou material per fer mat.');
        if (chess.in_threefold_repetition()) return draw('repetition', 'Taules per repetició: la mateixa posició ha aparegut tres vegades.');
        if (chess.in_draw()) return draw('fifty', 'Taules per la regla de les cinquanta jugades: ni captures ni moviments de peó.');
        if (chess.history().length >= limit) {
            return draw('length', 'Partida aturada per la durada màxima de la TV (' + Math.round(limit / 2) + ' jugades): es dona per taules.');
        }
        return null;
    }

    function tvResultHeadline(end) {
        if (!end) return '';
        if (end.result === '1-0') return '1-0 · Guanyen les blanques';
        if (end.result === '0-1') return '0-1 · Guanyen les negres';
        return '½-½ · Taules';
    }

    // ------------------------------------------------------------------
    // Obertures del repertori
    // ------------------------------------------------------------------
    // Rotació: cada partida nova agafa la següent obertura de la llista.
    function tvPickOpening(curated, index) {
        const list = Array.isArray(curated) ? curated.filter(o => o && Array.isArray(o.moves) && o.moves.length) : [];
        if (!list.length) return { opening: null, nextIndex: 0 };
        const i = ((isNum(index) ? Math.floor(index) : 0) % list.length + list.length) % list.length;
        return { opening: list[i], nextIndex: (i + 1) % list.length };
    }

    // Jugades preparades legals (s'aturen a la primera que no ho sigui).
    function tvPreparedLine(ChessCtor, opening, maxPlies) {
        if (!opening || typeof ChessCtor !== 'function') return [];
        const g = new ChessCtor();
        const out = [];
        const limit = isNum(maxPlies) ? maxPlies : 12;
        for (let i = 0; i < opening.moves.length && out.length < limit; i++) {
            let mv = null;
            try { mv = g.move(opening.moves[i], { sloppy: true }); } catch (e) { mv = null; }
            if (!mv) break;
            out.push({ san: mv.san, uci: mv.from + mv.to + (mv.promotion || ''), phrase: (opening.movePhrases && opening.movePhrases[i]) || null });
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Fets del tauler
    // ------------------------------------------------------------------
    function pieceNP(type, color) {
        const name = PIECE_NAME[type];
        const fem = !!PIECE_FEMININE[type];
        const adj = color ? ' ' + (fem ? COLOR[color].adjF : COLOR[color].adj) : '';
        const article = fem ? 'la ' : (/^[aeiouàèéíòóú]/i.test(name) ? 'l\'' : 'el ');
        return article + name + adj;
    }
    function pieceShort(type) { return pieceNP(type, null); }
    function piecePronoun(type) { return PIECE_FEMININE[type] ? 'la' : 'el'; }

    function squareOf(file, rank) { return 'abcdefgh'.charAt(file) + (rank + 1); }
    function fileRank(square) {
        const f = 'abcdefgh'.indexOf(String(square || '').charAt(0));
        const r = parseInt(String(square || '').charAt(1), 10) - 1;
        return (f < 0 || !(r >= 0 && r <= 7)) ? null : { file: f, rank: r };
    }

    function boardHelpers() {
        const Core = getCore();
        if (!Core || typeof Core.antidoteParseBoard !== 'function') return null;
        return {
            parse: Core.antidoteParseBoard,
            attackers: Core.antidoteAttackersOf,
            targets: Core.antidoteTargetsOf
        };
    }

    // FEN amb el torn canviat (per comprovar que una amenaça és una captura
    // LEGAL: una peça clavada al rei no amenaça res).
    function swapTurnFen(fen) {
        const parts = String(fen || '').split(' ');
        if (parts.length < 4) return null;
        parts[1] = parts[1] === 'w' ? 'b' : 'w';
        parts[3] = '-';
        return parts.join(' ');
    }

    function legalCaptureExists(ChessCtor, fen, from, to) {
        const swapped = swapTurnFen(fen);
        if (!swapped) return false;
        try {
            const g = new ChessCtor();
            if (!g.load(swapped)) return false;
            return g.moves({ square: from, verbose: true }).some(m => m.to === to && m.captured);
        } catch (e) { return false; }
    }

    function rooksConnected(grid, color) {
        const rank = color === 'w' ? 0 : 7;
        const files = [];
        for (let f = 0; f < 8; f++) {
            const p = grid[rank][f];
            if (p && p.c === color && p.t === 'r') files.push(f);
        }
        if (files.length !== 2) return false;
        for (let f = files[0] + 1; f < files[1]; f++) if (grid[rank][f]) return false;
        return true;
    }

    // Jugada legal (UCI) aplicada sobre una FEN: retorna el moviment verbós.
    function applyUci(ChessCtor, fen, uci) {
        if (!uci || uci.length < 4) return null;
        try {
            const g = new ChessCtor(fen);
            const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            return mv ? { move: mv, fen: g.fen() } : null;
        } catch (e) { return null; }
    }

    // Acció en infinitiu d'una jugada («portar el cavall a f3»), validada.
    function moveAction(ChessCtor, fen, uci) {
        const Core = getCore();
        const R = getRedactor();
        if (!Core || !R || typeof Core.createPvBoardHelpers !== 'function') return null;
        const helpers = Core.createPvBoardHelpers(ChessCtor);
        const facts = helpers ? helpers.moveFacts(fen, uci) : null;
        if (!facts) return null;
        const veu = R.descriuJugadaPerVeu ? R.descriuJugadaPerVeu(facts, { estil: 'casual' }) : null;
        return veu && veu.accio ? veu.accio : null;
    }

    // ------------------------------------------------------------------
    // Comentaris
    // ------------------------------------------------------------------
    const KIND_PRIORITY = {
        'mate': 100, 'end': 95, 'promotion': 90, 'fork-check': 85, 'missed-mate': 80,
        'allows-mate': 78, 'mate-threat': 75, 'missed': 70, 'opening-phrase': 65,
        'castle': 60, 'capture-free': 55, 'capture-recoverable': 50, 'recapture': 45,
        'threat': 40, 'check': 30, 'development': 20
    };

    // Llista de comentaris candidats d'una jugada, de més a menys prioritari.
    // ctx = { ChessCtor, fenBefore, fenAfter, move (verbós de chess.js),
    //         prevMove, before, after (anàlisis), tier, prepared, phrase,
    //         end (final de partida o null) }
    function tvCommentCandidates(ctx) {
        const c = ctx || {};
        const mv = c.move;
        if (!mv || !c.ChessCtor) return [];
        const tier = c.tier || 'mid';
        const color = mv.color;
        const opp = other(color);
        const me = COLOR[color];
        const them = COLOR[opp];
        const uci = mv.from + mv.to + (mv.promotion || '');
        const out = [];
        const add = (kind, text) => { if (text) out.push({ kind: kind, priority: KIND_PRIORITY[kind] || 0, text: text }); };
        const helpers = boardHelpers();
        const before = helpers ? helpers.parse(c.fenBefore) : null;
        const after = helpers ? helpers.parse(c.fenAfter) : null;
        const isCheck = /[+#]/.test(mv.san);
        const reliable = !!(c.before && c.before.reliable && c.after && c.after.reliable);

        // 1) Final de partida.
        if (c.end) {
            if (c.end.reason === 'checkmate') {
                add('mate', tier === 'basic'
                    ? 'Escac i mat: el rei ' + COLOR[opp].adj + ' està atacat i no té cap manera d\'escapar. Guanyen ' + me.pl + '.'
                    : c.end.text);
            } else {
                add('end', c.end.text);
            }
        }

        // 2) Coronació.
        if (mv.promotion) {
            const noun = PIECE_NAME[mv.promotion] || 'dama';
            add('promotion', tier === 'basic'
                ? 'El peó ' + me.adj + ' arriba a l\'última fila i es converteix en ' + noun + '.'
                : 'El peó ' + me.adj + ' corona a ' + mv.to + ' i es converteix en ' + noun + (isCheck ? ', amb escac.' : '.'));
        }

        // 3) Escac i atac doble de la peça que ha mogut (forquilla amb escac).
        if (isCheck && helpers && after && !c.end) {
            const to = fileRank(mv.to);
            const moved = to ? after.grid[to.rank][to.file] : null;
            if (moved) {
                const hits = helpers.targets(after.grid, to.file, to.rank)
                    .map(t => ({ sq: squareOf(t.file, t.rank), p: after.grid[t.rank][t.file] }))
                    .filter(t => t.p && t.p.c === opp);
                const givesCheck = hits.some(t => t.p.t === 'k');
                const valuable = hits.filter(t => (t.p.t === 'q' || t.p.t === 'r') && PIECE_VALUE[t.p.t] > PIECE_VALUE[moved.t])
                    .sort((a, b) => PIECE_VALUE[b.p.t] - PIECE_VALUE[a.p.t]);
                if (givesCheck && valuable.length) {
                    const target = valuable[0];
                    let text = capFirst(pieceNP(moved.t, color)) + ' ataca alhora el rei i ' + pieceShort(target.p.t) + '.';
                    // Que es GUANYI és una altra cosa: només si l'anàlisi ho avala
                    // (la línia principal hi captura i l'avantatge creix).
                    const pv = c.after && c.after.pv ? c.after.pv : [];
                    const gain = tvMoverLossCp(c.after && c.after.best, c.before && c.before.best, color);
                    if (reliable && pv[1] && pv[1].slice(2, 4) === target.sq && isNum(gain) && gain >= 300) {
                        text += ' Segons l\'anàlisi, ' + me.pl + ' poden guanyar ' + pieceShort(target.p.t) + '.';
                    }
                    add('fork-check', text);
                }
            }
        }

        // 4) Mats segons l'anàlisi (mai barrejats amb centipeons).
        if (reliable && !c.end) {
            const mateMine = tvMateFor(c.after.best, color);
            const mateTheirs = tvMateFor(c.after.best, opp);
            const hadMate = tvMateFor(c.before.best, color);
            const theyHadMate = tvMateFor(c.before.best, opp);
            const bestUci = c.before.bestUci;
            if (hadMate && hadMate <= TV_CONFIG.MISSED_MATE_MAX && !mateMine && bestUci && bestUci !== uci) {
                const accio = moveAction(c.ChessCtor, c.fenBefore, bestUci);
                if (accio) {
                    add('missed-mate', tier === 'basic'
                        ? capFirst(me.pl) + ' tenien un mat a l\'abast amb una altra jugada: ' + accio + '.'
                        : 'L\'anàlisi veia mat en ' + hadMate + ' per a ' + me.pl + ' amb una altra jugada: ' + accio + '.');
                }
            }
            if (mateTheirs && mateTheirs <= TV_CONFIG.MATE_ANNOUNCE_MAX && !theyHadMate) {
                add('allows-mate', tier === 'basic'
                    ? 'Compte: ara ' + them.pl + ' tenen un mat a prop.'
                    : 'Aquesta jugada permet a ' + them.pl + ' un mat en ' + mateTheirs + ', segons l\'anàlisi.');
            }
            if (mateMine && mateMine <= TV_CONFIG.MATE_ANNOUNCE_MAX) {
                add('mate-threat', tier === 'basic'
                    ? capFirst(me.pl) + ' tenen un mat a prop.'
                    : 'L\'anàlisi veu mat en ' + mateMine + ' per a ' + me.pl + '.');
            }
        }

        // 5) Alternativa millor avalada per l'anàlisi (centipeons, mateix bàndol).
        if (reliable && !c.end && c.before.bestUci && c.before.bestUci !== uci) {
            const loss = tvMoverLossCp(c.before.best, c.after.best, color);
            const threshold = TV_CONFIG.MISSED_LOSS_CP[tier] || TV_CONFIG.MISSED_LOSS_CP.mid;
            const moverBefore = c.before.best.type === 'cp' ? c.before.best.value * (color === 'w' ? 1 : -1) : null;
            if (isNum(loss) && loss >= threshold && isNum(moverBefore) && Math.abs(moverBefore) <= TV_CONFIG.DECIDED_CP) {
                const accio = moveAction(c.ChessCtor, c.fenBefore, c.before.bestUci);
                if (accio) {
                    if (tier === 'basic') add('missed', 'Hi havia una jugada millor per a ' + me.pl + ': ' + accio + '.');
                    else if (tier === 'advanced') {
                        const pawns = (Math.round(loss / 10) / 10).toFixed(1).replace('.', ',');
                        add('missed', 'Per a ' + me.pl + ', l\'anàlisi preferia ' + accio + ': segons el motor, la jugada feta cedeix uns ' + pawns + ' peons.');
                    } else add('missed', 'Per a ' + me.pl + ', l\'anàlisi preferia ' + accio + '.');
                }
            }
        }

        // 6) Frase del repertori per a les jugades preparades.
        if (c.prepared && c.phrase) add('opening-phrase', c.phrase);

        // 7) Enroc.
        if (mv.flags && (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1)) {
            const side = mv.flags.indexOf('k') !== -1 ? 'curt' : 'llarg';
            if (tier === 'basic') {
                add('castle', me.Pl + ' han enrocat: el rei s\'aparta del centre i la torre entra en joc.');
            } else {
                const connected = after && rooksConnected(after.grid, color);
                add('castle', me.Pl + ' han enrocat ' + side + (connected ? ' i han connectat les torres.' : '.'));
            }
        }

        // 8) Captures.
        if (mv.captured && helpers && before && after && mv.flags.indexOf('e') === -1) {
            const to = fileRank(mv.to);
            const prev = c.prevMove;
            const isRecapture = !!(prev && prev.captured && prev.to === mv.to && prev.color === opp);
            if (isRecapture) {
                add('recapture', prev.captured === mv.captured
                    ? me.Pl + ' tornen a capturar a ' + mv.to + ': és un canvi de ' + PIECE_PLURAL[mv.captured] + '.'
                    : me.Pl + ' tornen a capturar a ' + mv.to + ' i recuperen material.');
            }
            // Peça sense cap defensa (abans i després de la captura).
            const defendersBefore = helpers.attackers(before.grid, to.file, to.rank, opp).length;
            const defendersAfter = helpers.attackers(after.grid, to.file, to.rank, opp).length;
            if (!isRecapture && PIECE_VALUE[mv.captured] >= 3 && defendersBefore === 0 && defendersAfter === 0) {
                add('capture-free', me.Pl + ' capturen ' + pieceNP(mv.captured, opp) + ', que no estava defensa' + (PIECE_FEMININE[mv.captured] ? 'da.' : 't.'));
            }
            // Recuperable: la millor resposta de l'anàlisi hi torna a capturar.
            if (!isRecapture && c.after && c.after.reliable && c.after.bestUci && c.after.bestUci.slice(2, 4) === mv.to) {
                const reply = applyUci(c.ChessCtor, c.fenAfter, c.after.bestUci);
                if (reply && reply.move.captured) {
                    add('capture-recoverable', me.Pl + ' capturen ' + pieceShort(mv.captured) + ', però ' + them.pl + ' '
                        + piecePronoun(mv.captured) + ' poden recuperar a la jugada següent.');
                }
            }
        }

        // 9) Amenaça concreta de la peça que ha mogut (atacada ≠ guanyada).
        if (!isCheck && !c.end && helpers && after && mv.piece !== 'k') {
            const to = fileRank(mv.to);
            const moved = to ? after.grid[to.rank][to.file] : null;
            const movedValue = moved ? PIECE_VALUE[moved.t] : 0;
            // Si la peça que ha mogut queda penjada, l'«amenaça» no diu res.
            const oppAttackers = moved ? helpers.attackers(after.grid, to.file, to.rank, opp) : [];
            const myDefenders = moved ? helpers.attackers(after.grid, to.file, to.rank, color) : [];
            const exposed = oppAttackers.length > 0
                && (myDefenders.length === 0 || oppAttackers.some(a => PIECE_VALUE[a.t] < movedValue));
            if (moved && !exposed) {
                const threats = helpers.targets(after.grid, to.file, to.rank)
                    .map(t => ({ sq: squareOf(t.file, t.rank), file: t.file, rank: t.rank, p: after.grid[t.rank][t.file] }))
                    .filter(t => t.p && t.p.c === opp && t.p.t !== 'k')
                    .map(t => Object.assign(t, { defended: helpers.attackers(after.grid, t.file, t.rank, opp).length > 0 }))
                    .filter(t => (PIECE_VALUE[t.p.t] > movedValue) || (!t.defended && PIECE_VALUE[t.p.t] >= 3))
                    .filter(t => legalCaptureExists(c.ChessCtor, c.fenAfter, mv.to, t.sq))
                    .sort((a, b) => PIECE_VALUE[b.p.t] - PIECE_VALUE[a.p.t]);
                if (threats.length >= 2) {
                    add('threat', capFirst(pieceNP(moved.t, color)) + ' ataca alhora ' + pieceShort(threats[0].p.t) + ' i ' + pieceShort(threats[1].p.t) + '.');
                } else if (threats.length === 1) {
                    const t = threats[0];
                    add('threat', capFirst(pieceNP(moved.t, color)) + ' ataca ' + pieceNP(t.p.t, opp)
                        + (t.defended ? '.' : (', que no està defensa' + (PIECE_FEMININE[t.p.t] ? 'da.' : 't.'))));
                }
            }
        }

        // 10) Escac simple.
        if (isCheck && !c.end) {
            add('check', tier === 'basic'
                ? 'Escac al rei ' + COLOR[opp].adj + ': ' + them.pl + ' l\'han de protegir a la jugada següent.'
                : 'Escac al rei ' + COLOR[opp].adj + '.');
        }

        // 11) Desenvolupament d'una peça menor a l'obertura.
        if (!mv.captured && tier !== 'advanced' && isNum(c.ply) && c.ply < TV_CONFIG.DEVELOPMENT_MAX_PLY
            && HOME_SQUARES[color][mv.from] === mv.piece) {
            add('development', tier === 'basic'
                ? me.Pl + ' treuen ' + pieceShort(mv.piece) + ' de la casella inicial: és el desenvolupament, posar les peces en joc.'
                : me.Pl + ' desenvolupen ' + pieceShort(mv.piece) + '.');
        }

        out.sort((a, b) => b.priority - a.priority);
        return out;
    }

    // Tria el comentari (o cap) respectant la cadència: els comentaris
    // importants passen sempre; la resta, ocasionals i sense repetir-se.
    // history = [{ ply, kind, text, color }] dels comentaris ja fets.
    function tvChooseComment(candidates, history, ply, color) {
        const list = Array.isArray(candidates) ? candidates : [];
        const past = Array.isArray(history) ? history : [];
        const last = past.length ? past[past.length - 1] : null;
        for (const cand of list) {
            if (past.some(h => h.text === cand.text)) continue;
            if (cand.priority < TV_CONFIG.HIGH_PRIORITY) {
                if (last && isNum(ply) && ply - last.ply < TV_CONFIG.COMMENT_GAP_PLIES) continue;
                if (cand.kind !== 'opening-phrase'
                    && past.some(h => h.kind === cand.kind && isNum(ply) && ply - h.ply < TV_CONFIG.SAME_KIND_WINDOW_PLIES)) continue;
                if (cand.kind === 'development'
                    && past.filter(h => h.kind === 'development' && h.color === color).length >= TV_CONFIG.DEVELOPMENT_MAX_PER_COLOR) continue;
            } else if (cand.kind === 'mate-threat' && past.some(h => h.kind === 'mate-threat' && isNum(ply) && ply - h.ply < 4)) {
                continue;
            }
            return cand;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Text parlat: cap codi SAN, símbol ni abreviatura incomprensible
    // ------------------------------------------------------------------
    const SPEECH_PIECES = { K: 'rei', Q: 'dama', R: 'torre', B: 'alfil', N: 'cavall' };
    function spokenSquare(sq) { return sq.charAt(0) + ' ' + sq.charAt(1); }
    function spokenSan(token) {
        let t = token.replace(/[!?]+$/, '');
        const suffix = /#$/.test(t) ? ' amb escac i mat' : (/\+$/.test(t) ? ' amb escac' : '');
        t = t.replace(/[+#]$/, '');
        if (/^O-O-O$|^0-0-0$/.test(t)) return 'enroc llarg' + suffix;
        if (/^O-O$|^0-0$/.test(t)) return 'enroc curt' + suffix;
        let m = /^([KQRBN])([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/.exec(t);
        if (m) {
            return SPEECH_PIECES[m[1]] + (m[2] || m[3] ? ' de ' + (m[2] || '') + (m[3] ? (m[2] ? ' ' : '') + m[3] : '') : '')
                + (m[4] ? ' captura a ' : ' a ') + spokenSquare(m[5]) + suffix;
        }
        m = /^([a-h])x([a-h][1-8])(?:=([QRBN]))?$/.exec(t);
        if (m) {
            return 'peó de la columna ' + m[1] + ' captura a ' + spokenSquare(m[2])
                + (m[3] ? ' i corona ' + SPEECH_PIECES[m[3]] : '') + suffix;
        }
        m = /^([a-h][1-8])(?:=([QRBN]))?$/.exec(t);
        if (m) return 'peó a ' + spokenSquare(m[1]) + (m[2] ? ' i corona ' + SPEECH_PIECES[m[2]] : '') + suffix;
        return null;
    }

    function tvSpeechText(text) {
        let t = String(text || '');
        // Jugades amb número («1.d4», «3...Bc5», «...Nf6») i SAN amb peça.
        t = t.replace(/(?:\b\d+\s*\.(?:\s*\.\.)?\s*|\.\.\.\s*)(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)/g,
            (all, san) => spokenSan(san) || all);
        t = t.replace(/\b(O-O-O|O-O)([+#]?)/g, (all) => spokenSan(all) || all);
        t = t.replace(/\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?/g, (all) => spokenSan(all) || all);
        t = t.replace(/\b[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?/g, (all) => spokenSan(all) || all);
        t = t.replace(/\b[a-h][18]=[QRBN][+#]?/g, (all) => spokenSan(all) || all);
        // Caselles soltes: lletra i número separats perquè es llegeixin bé.
        t = t.replace(/\b([a-h])([1-8])\b/g, '$1 $2');
        t = t.replace(/½-½/g, 'taules').replace(/\b1-0\b/g, 'victòria de les blanques').replace(/\b0-1\b/g, 'victòria de les negres');
        t = t.replace(/[≈~·•→←↑↓«»"“”()[\]{}#+=*_|<>]/g, ' ');
        t = t.replace(/\bvs\b\.?/gi, 'contra');
        return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.:;!?])/g, '$1').trim();
    }

    // ------------------------------------------------------------------
    // Veu catalana
    // ------------------------------------------------------------------
    // Només llengua catalana (ca, ca-ES, ca-AD, ca-ES-valencia…). Mai una
    // veu d'una altra llengua, encara que no n'hi hagi cap de catalana.
    function tvIsCatalanVoice(v) {
        return !!(v && /^ca(?:[-_]|$)/i.test(String(v.lang || '').trim()));
    }
    function tvPickCatalanVoice(voices) {
        const list = (Array.isArray(voices) ? voices : []).filter(tvIsCatalanVoice);
        if (!list.length) return null;
        const score = (v) => (/^ca[-_]es$/i.test(v.lang) ? 4 : 0) + (v.localService ? 2 : 0) + (v.default ? 1 : 0);
        return list.slice().sort((a, b) => score(b) - score(a))[0];
    }

    // env = { speechSynthesis, SpeechSynthesisUtterance, setTimeout,
    //         clearTimeout, loadPref(), savePref(v), onChange() }
    function createTvVoice(env) {
        const e = env || {};
        const synth = e.speechSynthesis || null;
        const Utter = e.SpeechSynthesisUtterance || null;
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        const supported = !!(synth && typeof synth.speak === 'function' && typeof Utter === 'function');
        let pref = typeof e.loadPref === 'function' ? e.loadPref() : null;
        if (pref !== 'on' && pref !== 'off') pref = null;
        let voice = null;
        let voicesSeen = false;
        // Alguns navegadors no tenen cap veu i mai no envien voiceschanged:
        // passat el darrer intent, una llista buida vol dir «cap veu».
        let voicesSettled = false;
        let blocked = false;
        let current = null;
        const emit = () => { try { if (typeof e.onChange === 'function') e.onChange(api.status()); } catch (err) {} };

        function refreshVoices() {
            if (!supported) return;
            let list = [];
            try { list = synth.getVoices() || []; } catch (err) { list = []; }
            if (list.length) voicesSeen = true;
            voice = tvPickCatalanVoice(list);
            emit();
        }

        function finish(entry, spoken, reason) {
            if (!entry || current !== entry) return;
            current = null;
            clearT(entry.timer);
            entry.resolve({ spoken: spoken, reason: reason });
        }

        function stop() {
            const entry = current;
            if (entry) finish(entry, false, 'stopped');
            if (supported) { try { synth.cancel(); } catch (err) {} }
        }

        function speak(text, opts) {
            const o = opts || {};
            if (!supported) return Promise.resolve({ spoken: false, reason: 'unsupported' });
            if (pref !== 'on') return Promise.resolve({ spoken: false, reason: 'off' });
            if (!voice) return Promise.resolve({ spoken: false, reason: 'no-voice' });
            if (!text) return Promise.resolve({ spoken: false, reason: 'empty' });
            // Una sola locució viva: la nova substitueix l'anterior.
            stop();
            return new Promise((resolve) => {
                let u;
                try { u = new Utter(text); } catch (err) { resolve({ spoken: false, reason: 'exception' }); return; }
                const entry = { resolve: resolve, timer: null, utterance: u };
                u.voice = voice;
                u.lang = voice.lang || 'ca-ES';
                u.rate = isNum(o.rate) ? o.rate : 1;
                u.onend = () => { blocked = false; finish(entry, true, 'end'); };
                u.onerror = (ev) => {
                    const reason = (ev && ev.error) || 'error';
                    if (reason === 'not-allowed') { blocked = true; emit(); }
                    finish(entry, false, reason);
                };
                current = entry;
                entry.timer = setT(() => {
                    if (current !== entry) return;
                    try { synth.cancel(); } catch (err) {}
                    finish(entry, false, 'timeout');
                }, isNum(o.maxWaitMs) ? o.maxWaitMs : tvSpeechMaxWaitMs(text));
                try { synth.speak(u); } catch (err) { finish(entry, false, 'exception'); }
            });
        }

        const api = {
            supported: supported,
            status() {
                if (!supported) return 'unsupported';
                if (!voice) return (voicesSeen || voicesSettled) ? 'no-voice' : 'loading';
                return blocked ? 'blocked' : 'ready';
            },
            pref() { return pref; },
            isOn() { return pref === 'on'; },
            needsActivation() { return pref === null; },
            voiceName() { return voice ? (voice.name || voice.lang) : null; },
            isSpeaking() { return !!current; },
            setOn(on) {
                pref = on ? 'on' : 'off';
                if (typeof e.savePref === 'function') { try { e.savePref(pref); } catch (err) {} }
                if (!on) stop();
                blocked = false;
                emit();
            },
            refreshVoices: refreshVoices,
            speak: speak,
            stop: stop
        };

        if (supported) {
            refreshVoices();
            // Les veus sovint arriben tard: escolta voiceschanged sense trepitjar
            // els altres oients de l'app i torna a mirar uns quants cops.
            try {
                if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
            } catch (err) {}
            [300, 1200].forEach(ms => setT(() => { if (!voice) refreshVoices(); }, ms));
            setT(() => { voicesSettled = true; if (!voice) refreshVoices(); else emit(); }, 3500);
        }
        return api;
    }

    // ------------------------------------------------------------------
    // Motor propi de la TV (worker dedicat i cua serialitzada)
    // ------------------------------------------------------------------
    // env = { createWorker, setTimeout, clearTimeout }
    function createTvEngine(env) {
        const e = env || {};
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        let worker = null;
        let readyPromise = null;
        let caps = null;
        let lineHandler = null;
        let queue = [];
        let current = null;
        let newGamePending = true;
        let failed = false;
        // Cada worker és una generació: res d'una generació antiga (respostes,
        // temporitzadors de seguretat) no pot tocar el worker nou.
        let generation = 0;

        function send(cmd) { if (worker) { try { worker.postMessage(cmd); } catch (err) {} } }
        function onMessage(gen, ev) {
            if (gen !== generation) return;
            const data = ev && ev.data !== undefined ? ev.data : ev;
            String(data == null ? '' : data).split(/\r?\n/).forEach((l) => {
                const line = l.trim();
                if (line && lineHandler) lineHandler(line);
            });
        }
        // Escolta línies fins que `onLine` retorni un valor (≠ undefined) o
        // passi el temps; el temporitzador només desmunta el seu propi oient.
        function listen(onLine, ms) {
            return new Promise((resolve) => {
                let timer = null;
                const handler = (line) => {
                    const out = onLine(line);
                    if (out === undefined) return;
                    clearT(timer);
                    if (lineHandler === handler) lineHandler = null;
                    resolve(out);
                };
                timer = setT(() => { if (lineHandler === handler) lineHandler = null; resolve(null); }, ms);
                lineHandler = handler;
            });
        }
        function waitFor(pred, ms) { return listen(line => (pred(line) ? line : undefined), ms); }

        function boot() {
            failed = false;
            const gen = ++generation;
            try { worker = e.createWorker(); } catch (err) { worker = null; }
            if (!worker) { failed = true; return Promise.resolve(null); }
            worker.onmessage = (ev) => onMessage(gen, ev);
            const lines = [];
            const done = listen((line) => { lines.push(line); return line === 'uciok' ? lines : undefined; }, 20000);
            send('uci');
            return done.then((got) => {
                if (gen !== generation) return null;
                if (!got) { failed = true; return null; }
                caps = tvEngineCapabilities(parseUciOptions(got));
                caps.uciLines = got.filter(l => l.indexOf('option name') === 0 || l.indexOf('id name') === 0);
                const r = waitFor(l => l === 'readyok', 10000);
                send('isready');
                return r.then(ok => {
                    if (gen !== generation) return null;
                    if (!ok) { failed = true; return null; }
                    return caps;
                });
            });
        }

        function ready() {
            if (!readyPromise) readyPromise = boot();
            return readyPromise;
        }

        function pump() {
            if (current || !queue.length) return;
            const job = queue.shift();
            if (job.cancelled) { job.resolve(null); pump(); return; }
            current = job;
            const gen = generation;
            run(job).then((res) => {
                job.resolve(job.cancelled ? null : res);
                // Si mentrestant s'ha destruït el motor, la cua ja és d'una altra generació.
                if (current === job) current = null;
                if (gen === generation || !current) pump();
            });
        }

        function run(job) {
            return ready().then((c) => {
                if (!c || failed || job.cancelled) return null;
                const gen = generation;
                if (newGamePending) { send('ucinewgame'); newGamePending = false; }
                job.strength.forEach(send);
                send('setoption name MultiPV value ' + (job.multipv || 1));
                const readyOk = waitFor(l => l === 'readyok', 10000);
                send('isready');
                return readyOk.then((ok) => {
                    if (!ok || job.cancelled || gen !== generation) return null;
                    send(job.position);
                    const infos = {};
                    const result = listen((line) => {
                        if (line.indexOf('info') === 0) {
                            const info = parseInfoLine(line);
                            if (info && !info.bound && info.pv.length) infos[info.multipv] = info;
                            return undefined;
                        }
                        if (line.indexOf('bestmove') !== 0) return undefined;
                        const m = /^bestmove\s+(\S+)/.exec(line);
                        const best = m && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m[1]) ? m[1] : null;
                        return { bestUci: best, infos: infos };
                    }, (job.movetime || 1000) + 10000);
                    send(job.go);
                    return result.then((res) => {
                        // Cap bestmove a temps: el worker s'ha penjat i es reinicia.
                        if (!res && gen === generation) restart();
                        return res;
                    });
                });
            });
        }

        function restart() {
            generation++;
            try { if (worker) worker.terminate(); } catch (err) {}
            worker = null;
            readyPromise = null;
            lineHandler = null;
            newGamePending = true;
        }

        return {
            ready: ready,
            caps() { return caps; },
            failed() { return failed; },
            // job = { tag, position, strength:[], multipv, go, movetime }
            request(job) {
                return new Promise((resolve) => {
                    queue.push(Object.assign({}, job, { resolve: resolve, cancelled: false }));
                    pump();
                });
            },
            // Invalida totes les peticions: les pendents no arriben a sortir i
            // la que calcula s'atura (el seu bestmove es descarta).
            cancelAll() {
                queue.forEach(j => { j.cancelled = true; });
                if (current) { current.cancelled = true; send('stop'); }
            },
            newGame() { newGamePending = true; },
            busy() { return !!current || queue.length > 0; },
            destroy() {
                queue.forEach(j => { j.cancelled = true; j.resolve(null); });
                queue = [];
                const job = current;
                current = null;
                try { if (worker) worker.postMessage('quit'); } catch (err) {}
                restart();
                if (job) { job.cancelled = true; job.resolve(null); }
            }
        };
    }

    function tvPositionCommand(uciMoves) {
        return (Array.isArray(uciMoves) && uciMoves.length) ? 'position startpos moves ' + uciMoves.join(' ') : 'position startpos';
    }

    // ------------------------------------------------------------------
    // Controlador (independent del DOM)
    // ------------------------------------------------------------------
    // deps = { ChessCtor, engine, voice, view, getViewer, getOpenings,
    //          getOpeningGraph, loadPrefs, savePrefs, random, now,
    //          setTimeout, clearTimeout }
    function createTvController(deps) {
        const d = deps || {};
        const setT = d.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = d.clearTimeout || ((id) => clearTimeout(id));
        const now = d.now || (() => Date.now());
        const random = d.random || Math.random;
        const view = d.view || {};
        const notify = (name, payload) => { try { if (typeof view[name] === 'function') view[name](payload); } catch (err) {} };

        const S = {
            open: false,
            userPaused: false,
            hidden: false,
            epoch: 0,
            gameSeq: 0,
            caps: null,
            game: null,
            timers: new Set(),
            nextRevealAt: 0,
            speech: null,
            error: null,
            loopRunning: false
        };

        let prefs = tvNormalizePrefs(typeof d.loadPrefs === 'function' ? d.loadPrefs() : null);
        function savePrefs() { if (typeof d.savePrefs === 'function') { try { d.savePrefs(prefs); } catch (err) {} } }

        function viewer() {
            const v = typeof d.getViewer === 'function' ? d.getViewer() : null;
            return tvViewerProfile(v, S.caps);
        }

        function alive(epoch) { return S.open && !S.userPaused && !S.hidden && epoch === S.epoch && !S.error; }

        function sleep(ms, epoch) {
            return new Promise((resolve) => {
                if (!alive(epoch)) { resolve(false); return; }
                const entry = { id: null, resolve: resolve };
                entry.id = setT(() => { S.timers.delete(entry); resolve(alive(epoch)); }, Math.max(0, ms));
                S.timers.add(entry);
            });
        }

        // Atura TOT el que estigui en marxa (temporitzadors, càlcul i veu).
        function halt() {
            S.epoch++;
            S.timers.forEach((t) => { clearT(t.id); t.resolve(false); });
            S.timers.clear();
            if (d.engine) d.engine.cancelAll();
            if (d.voice) d.voice.stop();
            S.speech = null;
        }

        function snapshot() {
            const g = S.game;
            const v = viewer();
            const next = S.caps ? tvResolveTarget(S.caps, v, prefs) : { value: null };
            return {
                open: S.open,
                paused: S.userPaused,
                hidden: S.hidden,
                error: S.error,
                caps: S.caps,
                viewer: v,
                speed: prefs.speed,
                nextLevel: next.value,
                game: g ? {
                    id: g.id,
                    fen: g.chess.fen(),
                    turn: g.chess.turn(),
                    moves: g.moves.slice(),
                    level: g.level,
                    opening: g.opening ? { name: g.opening.name, eco: g.opening.eco, idea: g.opening.idea || null, plies: g.prepared.length } : null,
                    identified: g.identified,
                    lastMove: g.moves.length ? g.moves[g.moves.length - 1] : null,
                    end: g.end,
                    nextGameAt: g.nextGameAt || null,
                    comment: g.comment
                } : null
            };
        }
        function render() { notify('render', snapshot()); }

        function identifyOpening(g) {
            const Core = getCore();
            const graph = typeof d.getOpeningGraph === 'function' ? d.getOpeningGraph() : null;
            if (!Core || !graph || typeof Core.analyzeGameOpeningByPositions !== 'function') return null;
            try {
                const replay = new d.ChessCtor();
                const fens = [];
                const sans = [];
                for (const m of g.moves) {
                    const mv = replay.move(m.san, { sloppy: true });
                    if (!mv) break;
                    fens.push(replay.fen());
                    sans.push(mv.san);
                    if (fens.length >= 30) break;
                }
                const res = Core.analyzeGameOpeningByPositions(graph, fens, sans);
                return res && res.name ? { name: res.name, eco: res.eco || null } : null;
            } catch (err) { return null; }
        }

        function startGame() {
            halt();
            const epoch = S.epoch;
            const pick = tvPickOpening(typeof d.getOpenings === 'function' ? d.getOpenings() : [],
                prefs.openingIndex !== null ? prefs.openingIndex : Math.floor(random() * 1000));
            prefs = Object.assign({}, prefs, { openingIndex: pick.nextIndex });
            savePrefs();
            const v = viewer();
            const target = tvResolveTarget(S.caps, v, prefs);
            S.game = {
                id: ++S.gameSeq,
                chess: new d.ChessCtor(),
                moves: [],
                uci: [],
                // El nivell queda FIXAT per a tota la partida (els dos jugadors).
                level: { value: target.value, label: tvLevelLabel(S.caps, target.value), mode: S.caps ? S.caps.mode : 'none' },
                tier: v.tier,
                opening: pick.opening,
                prepared: tvPreparedLine(d.ChessCtor, pick.opening, 12),
                identified: null,
                analyses: {},
                comments: [],
                comment: null,
                end: null,
                nextGameAt: null
            };
            if (d.engine) d.engine.newGame();
            S.nextRevealAt = now() + TV_CONFIG.INTRO_DELAY_MS;
            if (pick.opening) {
                const intro = 'Obertura de partida: ' + pick.opening.name + '.' + (pick.opening.idea ? ' ' + pick.opening.idea : '');
                S.game.comment = { kind: 'intro', text: intro, speech: tvSpeechText(intro), ply: 0, gameId: S.game.id };
                S.nextRevealAt = Math.max(S.nextRevealAt, now() + tvReadingTimeMs(intro, v.tier));
                notify('comment', S.game.comment);
            }
            render();
            if (S.game.comment) S.speech = speakComment(S.game.comment, epoch);
            runLoop(epoch);
        }

        function speakComment(comment, epoch) {
            if (!d.voice || !d.voice.isOn() || d.voice.status() === 'no-voice' || d.voice.status() === 'unsupported') return null;
            const started = now();
            return d.voice.speak(comment.speech, { maxWaitMs: tvSpeechMaxWaitMs(comment.speech) })
                .then(r => ({ spoken: !!(r && r.spoken), endedAt: now(), startedAt: started, epoch: epoch }))
                .catch(() => ({ spoken: false, endedAt: now(), startedAt: started, epoch: epoch }));
        }

        function analysisJob(g, uciMoves, ply, fen) {
            return {
                tag: { gameId: g.id, ply: ply, fen: fen, kind: 'analysis' },
                position: tvPositionCommand(uciMoves),
                strength: tvStrengthCommands(S.caps, 'analysis'),
                multipv: TV_CONFIG.ANALYSIS_MULTIPV,
                go: 'go depth ' + TV_CONFIG.ANALYSIS_MAX_DEPTH + ' movetime ' + TV_CONFIG.ANALYSIS_MOVETIME_MS,
                movetime: TV_CONFIG.ANALYSIS_MOVETIME_MS
            };
        }

        function analyze(g, uciMoves, ply, fen, epoch) {
            const key = ply + '|' + fen;
            if (g.analyses[key]) return Promise.resolve(g.analyses[key]);
            if (!d.engine) return Promise.resolve(null);
            return d.engine.request(analysisJob(g, uciMoves, ply, fen)).then((res) => {
                // Resultat obsolet (pausa, partida nova o sortida): es descarta.
                if (!res || !alive(epoch) || S.game !== g) return null;
                const a = tvBuildAnalysis(fen, res.infos, res.bestUci);
                g.analyses[key] = a;
                return a;
            });
        }

        function playerMove(g, uciMoves, ply, fen, epoch) {
            if (!d.engine) return Promise.resolve(null);
            const mode = S.caps ? S.caps.mode : 'none';
            const movetime = TV_CONFIG.PLAYER_MOVETIME_MS[mode] || 500;
            return d.engine.request({
                tag: { gameId: g.id, ply: ply, fen: fen, kind: 'move' },
                position: tvPositionCommand(uciMoves),
                strength: tvStrengthCommands(S.caps, 'player', g.level.value),
                multipv: 1,
                go: 'go movetime ' + movetime,
                movetime: movetime
            }).then((res) => (res && alive(epoch) && S.game === g) ? res.bestUci : null);
        }

        async function runLoop(epoch) {
            const g = S.game;
            if (!g) return;
            while (alive(epoch) && S.game === g && !g.end) {
                const ply = g.moves.length;
                const fenBefore = g.chess.fen();
                const prepared = ply < g.prepared.length ? g.prepared[ply] : null;
                let uci = null;
                let before = null;
                if (prepared) {
                    uci = prepared.uci;
                } else {
                    before = await analyze(g, g.uci, ply, fenBefore, epoch);
                    if (!alive(epoch) || S.game !== g) return;
                    uci = await playerMove(g, g.uci, ply, fenBefore, epoch);
                    if (!alive(epoch) || S.game !== g) return;
                    if (!uci) {
                        if (d.engine && d.engine.failed && d.engine.failed()) { fail('engine'); return; }
                        // Sense resposta vàlida: es torna a provar més tard.
                        if (!(await sleep(1000, epoch))) return;
                        continue;
                    }
                }
                const applied = applyUci(d.ChessCtor, fenBefore, uci);
                if (!applied) { fail('illegal'); return; }
                const afterUci = g.uci.concat([uci]);
                let after = null;
                if (!prepared) {
                    after = await analyze(g, afterUci, ply + 1, applied.fen, epoch);
                    if (!alive(epoch) || S.game !== g) return;
                }

                // Espera la visualització de la jugada anterior i la seva locució.
                const waitMs = S.nextRevealAt - now();
                if (waitMs > 0 && !(await sleep(waitMs, epoch))) return;
                if (S.speech) {
                    const sp = await S.speech;
                    if (!alive(epoch) || S.game !== g) return;
                    S.speech = null;
                    if (sp && sp.spoken && !(await sleep(TV_CONFIG.POST_SPEECH_PAUSE_MS, epoch))) return;
                }
                // La posició visible ha de ser exactament la del càlcul.
                if (g.chess.fen() !== fenBefore) return;
                reveal(g, uci, fenBefore, prepared, before, after, epoch);
            }
            if (alive(epoch) && S.game === g && g.end) scheduleNextGame(g, epoch);
        }

        function reveal(g, uci, fenBefore, prepared, before, after, epoch) {
            const ply = g.moves.length;
            const prevMove = ply ? g.moves[ply - 1].verbose : null;
            const mv = g.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            if (!mv) { fail('illegal'); return; }
            const fenAfter = g.chess.fen();
            g.uci.push(uci);
            const end = tvGameEnd(g.chess);
            const entry = { ply: ply, san: mv.san, uci: uci, color: mv.color, from: mv.from, to: mv.to, prepared: !!prepared, fen: fenAfter, verbose: mv };
            g.moves.push(entry);
            if (!g.identified || ply < 30) g.identified = identifyOpening(g) || g.identified;
            const candidates = tvCommentCandidates({
                ChessCtor: d.ChessCtor, fenBefore: fenBefore, fenAfter: fenAfter, move: mv, prevMove: prevMove,
                before: before, after: after, tier: g.tier, prepared: !!prepared, phrase: prepared ? prepared.phrase : null,
                end: end, ply: ply
            });
            const chosen = tvChooseComment(candidates, g.comments, ply, mv.color);
            g.end = end;
            g.comment = null;
            if (chosen) {
                // El comentari queda LLIGAT a aquesta posició (partida + ply + FEN).
                g.comment = { kind: chosen.kind, text: chosen.text, speech: tvSpeechText(chosen.text), ply: ply, fen: fenAfter, gameId: g.id };
                g.comments.push({ ply: ply, kind: chosen.kind, text: chosen.text, color: mv.color });
                entry.comment = chosen.text;
            }
            const shownAt = now();
            let delay = tvMoveDelayMs(prefs.speed, { tier: g.tier, prepared: !!prepared, random: random() });
            if (g.comment) delay = Math.max(delay, tvReadingTimeMs(g.comment.text, g.tier));
            S.nextRevealAt = shownAt + delay;
            notify('move', { gameId: g.id, move: entry, comment: g.comment });
            if (g.comment) notify('comment', g.comment);
            render();
            if (g.comment) S.speech = speakComment(g.comment, epoch);
        }

        async function scheduleNextGame(g, epoch) {
            if (S.speech) {
                await S.speech;
                if (!alive(epoch) || S.game !== g) return;
                S.speech = null;
            }
            const delay = Math.round(TV_CONFIG.NEXT_GAME_DELAY_MS * (g.tier === 'basic' ? 1.2 : 1));
            g.nextGameAt = now() + delay;
            notify('result', { gameId: g.id, end: g.end, nextGameAt: g.nextGameAt });
            render();
            if (!(await sleep(delay, epoch))) return;
            if (S.game === g) startGame();
        }

        function fail(reason) {
            halt();
            S.error = reason;
            notify('error', reason);
            render();
        }

        function resumeLoop() {
            halt();
            const epoch = S.epoch;
            const g = S.game;
            if (!g) { startGame(); return; }
            if (g.end) {
                g.nextGameAt = null;
                scheduleNextGame(g, epoch);
                return;
            }
            S.nextRevealAt = now() + TV_CONFIG.RESUME_DELAY_MS;
            render();
            runLoop(epoch);
        }

        const api = {
            state: snapshot,
            prefs() { return Object.assign({}, prefs); },
            // Obre la secció: arrenca el motor i continua (o comença) la partida.
            open() {
                S.open = true;
                S.error = null;
                render();
                const engine = d.engine;
                if (!engine) { fail('engine'); return Promise.resolve(); }
                return engine.ready().then((caps) => {
                    if (!S.open) return;
                    if (!caps) { fail('engine'); return; }
                    S.caps = caps;
                    notify('caps', caps);
                    if (S.userPaused || S.hidden) { render(); return; }
                    if (!S.game) startGame(); else resumeLoop();
                });
            },
            close() {
                halt();
                S.open = false;
                if (d.engine) d.engine.destroy();
                render();
            },
            pause() {
                if (S.userPaused) return;
                S.userPaused = true;
                halt();
                render();
            },
            resume() {
                if (!S.userPaused) return;
                S.userPaused = false;
                if (S.open && !S.hidden && S.caps) resumeLoop(); else render();
            },
            setHidden(hidden) {
                const h = !!hidden;
                if (h === S.hidden) return;
                S.hidden = h;
                if (h) { halt(); render(); return; }
                if (S.open && !S.userPaused && S.caps) resumeLoop(); else render();
            },
            newGame() {
                if (!S.open || !S.caps) return;
                S.userPaused = false;
                if (S.hidden) return;
                startGame();
            },
            setSpeed(id) {
                if (!TV_CONFIG.SPEEDS[id]) return;
                prefs = Object.assign({}, prefs, { speed: id });
                savePrefs();
                render();
            },
            // Només canvia l'objectiu de la PARTIDA SEGÜENT.
            adjust(direction) {
                if (!S.caps) return;
                prefs = tvAdjustPrefs(S.caps, viewer(), prefs, direction);
                savePrefs();
                render();
            },
            currentFen() { return S.game ? S.game.chess.fen() : null; },
            isActive() { return S.open && !S.userPaused && !S.hidden; },
            // Per als tests i el diagnòstic.
            _internal: S
        };
        return api;
    }

    // ------------------------------------------------------------------
    // Interfície del navegador
    // ------------------------------------------------------------------
    const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';
    let bridge = {};
    let controller = null;
    let voice = null;
    let board = null;
    let lastHighlight = null;
    let countdownTimer = null;
    let uiReady = false;

    function $id(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
    function loadPrefsRaw() {
        try { return JSON.parse(localStorage.getItem(TV_CONFIG.PREFS_KEY) || 'null'); } catch (e) { return null; }
    }
    function savePrefsRaw(p) {
        try {
            const current = loadPrefsRaw() || {};
            localStorage.setItem(TV_CONFIG.PREFS_KEY, JSON.stringify(Object.assign({}, current, p)));
        } catch (e) {}
    }

    function escapeHtml(text) {
        return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function screenVisible() {
        const el = $id('sftv-screen');
        return !!(el && el.style.display !== 'none');
    }

    function buildBoard() {
        if (board || typeof root.Chessboard !== 'function' || !$id('sftv-board')) return;
        board = root.Chessboard('sftv-board', { position: 'start', draggable: false, pieceTheme: PIECE_THEME, moveSpeed: 350 });
    }
    function destroyBoard() {
        try { if (board && board.destroy) board.destroy(); } catch (e) {}
        board = null;
    }
    function applyHighlight() {
        const el = $id('sftv-board');
        if (!el) return;
        el.querySelectorAll('.sftv-hl').forEach(sq => sq.classList.remove('sftv-hl'));
        if (!lastHighlight) return;
        [lastHighlight.from, lastHighlight.to].forEach((sq) => {
            const node = el.querySelector('[data-square="' + sq + '"]');
            if (node) node.classList.add('sftv-hl');
        });
    }
    function resizeBoard() {
        if (!board || !screenVisible()) return;
        try { board.resize(); } catch (e) {}
        applyHighlight();
    }

    function renderVoice() {
        if (!voice) return;
        const status = voice.status();
        const activate = $id('sftv-voice-activate');
        const toggle = $id('sftv-voice-toggle');
        const note = $id('sftv-voice-note');
        const on = voice.isOn();
        if (activate) activate.style.display = (voice.supported && voice.needsActivation()) ? '' : 'none';
        if (toggle) {
            toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
            toggle.classList.toggle('is-on', on);
            toggle.textContent = on ? '🔊 Veu activada' : '🔇 Veu apagada';
            toggle.title = on ? 'Apaga la veu' : 'Activa la veu';
            toggle.disabled = !voice.supported;
        }
        if (note) {
            let text = '';
            if (!voice.supported) text = 'Aquest navegador no pot llegir els comentaris en veu alta.';
            else if (status === 'no-voice' && on) text = 'No hi ha cap veu catalana disponible en aquest dispositiu';
            else if (status === 'blocked' && on) text = 'El navegador ha aturat la veu: toca el botó de veu per tornar-la a activar.';
            note.textContent = text;
            note.style.display = text ? '' : 'none';
        }
    }

    function renderLevel(state) {
        const caps = state.caps;
        const g = state.game;
        const levelText = g ? g.level.label.short : '—';
        const playerLine = (color) => (color === 'w' ? '♔ Blanques' : '♚ Negres') + ' · Stockfish · ' + levelText;
        const pw = $id('sftv-player-white');
        const pb = $id('sftv-player-black');
        if (pw) pw.textContent = playerLine('w');
        if (pb) pb.textContent = playerLine('b');
        pw && pw.classList.toggle('is-turn', !!(g && !g.end && g.turn === 'w'));
        pb && pb.classList.toggle('is-turn', !!(g && !g.end && g.turn === 'b'));
        const cur = $id('sftv-level-current');
        const next = $id('sftv-level-next');
        const help = $id('sftv-level-help');
        const easy = $id('sftv-too-easy');
        const hard = $id('sftv-too-hard');
        if (cur) cur.textContent = g ? (g.level.label.long + (caps && caps.mode !== 'none' ? ' (tots dos jugadors)' : '')) : 'Preparant el motor…';
        if (next) {
            const pending = caps && caps.mode !== 'none' && g && state.nextLevel !== null && state.nextLevel !== g.level.value;
            next.textContent = pending ? 'Partida següent: ' + tvLevelLabel(caps, state.nextLevel).short : '';
            next.style.display = pending ? '' : 'none';
        }
        if (help) {
            let text = '';
            if (caps && caps.mode === 'elo') text = 'És un objectiu de força configurat al motor (UCI_Elo ' + caps.min + '–' + caps.max + '), no una equivalència garantida amb l\'Elo FIDE.';
            else if (caps) text = tvCompatibilityNote(caps) || '';
            help.textContent = text;
        }
        const adjustable = !!(caps && caps.mode !== 'none');
        if (easy) easy.disabled = !adjustable || state.nextLevel === null || state.nextLevel >= caps.max;
        if (hard) hard.disabled = !adjustable || state.nextLevel === null || state.nextLevel <= caps.min;
        const viewerNote = $id('sftv-viewer-note');
        if (viewerNote) {
            const v = state.viewer;
            let t = '';
            if (!v.known) t = 'Encara no tenim el teu nivell: comencem pel mínim de la TV, amb explicacions senzilles i ritme pausat.';
            else if (v.belowEngineMin) t = 'El motor no juga més fluix que aquest mínim: per això els comentaris són més senzills i el ritme més pausat.';
            viewerNote.textContent = t;
            viewerNote.style.display = t ? '' : 'none';
        }
    }

    function renderMoves(g) {
        const box = $id('sftv-moves');
        if (!box) return;
        if (!g || !g.moves.length) { box.innerHTML = '<span class="sftv-moves-empty">Encara no s\'ha fet cap jugada.</span>'; return; }
        let html = '';
        g.moves.forEach((m, i) => {
            if (m.color === 'w') html += '<span class="sftv-move-num">' + (Math.floor(i / 2) + 1) + '.</span>';
            else if (i === 0) html += '<span class="sftv-move-num">1…</span>';
            const cls = 'sftv-move' + (m.prepared ? ' is-prepared' : '') + (i === g.moves.length - 1 ? ' is-last' : '') + (m.comment ? ' has-comment' : '');
            html += '<span class="' + cls + '"' + (m.comment ? ' title="' + escapeHtml(m.comment) + '"' : '') + '>' + escapeHtml(m.san) + '</span> ';
        });
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
    }

    function renderOpening(g) {
        const el = $id('sftv-opening');
        if (!el) return;
        if (!g) { el.textContent = ''; el.style.display = 'none'; return; }
        const parts = [];
        if (g.opening) {
            const playedPrepared = g.moves.filter(m => m.prepared).length;
            parts.push('<span class="sftv-opening-kicker">Obertura de partida</span> <strong>' + escapeHtml(g.opening.name) + '</strong>'
                + (g.opening.eco ? ' <span class="sftv-eco">' + escapeHtml(g.opening.eco) + '</span>' : '')
                + '<span class="sftv-opening-sub">Jugades preparades del repertori: ' + playedPrepared + ' de ' + g.opening.plies + '</span>');
        }
        if (g.identified && (!g.opening || g.identified.name !== g.opening.name)) {
            parts.push('<span class="sftv-opening-sub">Línia identificada: ' + escapeHtml(g.identified.name) + (g.identified.eco ? ' (' + escapeHtml(g.identified.eco) + ')' : '') + '</span>');
        }
        el.innerHTML = parts.join('');
        el.style.display = parts.length ? '' : 'none';
    }

    function renderStatus(state) {
        const el = $id('sftv-status');
        const g = state.game;
        let text = '';
        if (state.error) text = state.error === 'engine' ? 'No s\'ha pogut arrencar el motor en aquest dispositiu.' : 'La partida s\'ha aturat per un error intern.';
        else if (!g) text = 'Preparant el motor…';
        else if (g.end) text = tvResultHeadline(g.end);
        else {
            const last = g.lastMove;
            text = (g.turn === 'w' ? 'Mouen les blanques' : 'Mouen les negres')
                + (last && last.prepared ? ' · jugada preparada de l\'obertura' : '');
        }
        if (state.paused) text += ' · En pausa';
        if (el) el.textContent = text;
        const pauseBtn = $id('sftv-pause');
        if (pauseBtn) {
            pauseBtn.innerHTML = state.paused
                ? '<svg class="btn-ic" aria-hidden="true"><use href="#ic-play"/></svg>Continua'
                : '<svg class="btn-ic" aria-hidden="true"><use href="#ic-pause"/></svg>Pausa';
            pauseBtn.disabled = !g || !!state.error;
        }
        const tryBtn = $id('sftv-try');
        if (tryBtn) tryBtn.disabled = !g || !!(g && g.end) || !bridge.openExplorer;
        const speed = $id('sftv-speed');
        if (speed && speed.value !== state.speed) speed.value = state.speed;
        const engineNote = $id('sftv-engine-note');
        if (engineNote) {
            // Què ha declarat el motor real en respondre a `uci` (la explicació
            // de la incompatibilitat ja surt a la targeta del nivell).
            const caps = state.caps;
            let note = '';
            if (caps) {
                const range = caps.mode === 'elo'
                    ? 'UCI_Elo ' + caps.engineEloMin + '–' + caps.engineEloMax + ' i UCI_LimitStrength (mínim de la TV: ' + caps.min + ')'
                    : (caps.mode === 'skill' ? 'Skill Level ' + caps.min + '–' + caps.max + '; sense ' + caps.missing.join(' ni ') : 'cap opció de força');
                note = 'Motor: ' + (caps.engineName || 'Stockfish') + ' · opcions declarades: ' + range + '.';
            }
            engineNote.textContent = note;
            engineNote.style.display = note ? '' : 'none';
        }
    }

    function renderResult(state) {
        const el = $id('sftv-result');
        const g = state.game;
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (!el) return;
        if (!g || !g.end) { el.style.display = 'none'; return; }
        const paint = () => {
            const left = g.nextGameAt && !state.paused ? Math.max(0, Math.ceil((g.nextGameAt - Date.now()) / 1000)) : null;
            el.innerHTML = '<div class="sftv-result-head">' + escapeHtml(tvResultHeadline(g.end)) + '</div>'
                + '<div class="sftv-result-text">' + escapeHtml(g.end.text) + '</div>'
                + '<div class="sftv-result-next">' + (left !== null ? 'La partida següent comença d\'aquí a ' + left + ' s.' : (state.paused ? 'En pausa.' : '')) + '</div>';
        };
        paint();
        el.style.display = '';
        if (g.nextGameAt && !state.paused) countdownTimer = setInterval(paint, 500);
    }

    function renderComment(state) {
        const el = $id('sftv-comment');
        if (!el) return;
        const g = state.game;
        const c = g && g.comment;
        // Només es mostra si és de la partida i la posició visibles.
        const valid = c && c.gameId === g.id && (c.kind === 'intro' || c.fen === g.fen);
        el.textContent = valid ? c.text : '';
        el.classList.toggle('is-empty', !valid);
    }

    const viewApi = {
        render(state) {
            if (!uiReady) return;
            const g = state.game;
            if (board && g) {
                const pos = g.fen.split(' ')[0];
                if (board.fen() !== pos) board.position(pos, true);
                lastHighlight = g.lastMove ? { from: g.lastMove.from, to: g.lastMove.to } : null;
                applyHighlight();
            }
            renderLevel(state);
            renderMoves(g);
            renderOpening(g);
            renderStatus(state);
            renderComment(state);
            renderResult(state);
            renderVoice();
        }
    };

    function onVisibility() {
        if (!controller) return;
        controller.setHidden(document.visibilityState === 'hidden' || !screenVisible());
    }

    function ensureController() {
        if (controller) return controller;
        if (typeof root.Chess !== 'function') return null;
        voice = createTvVoice({
            speechSynthesis: root.speechSynthesis,
            SpeechSynthesisUtterance: root.SpeechSynthesisUtterance,
            loadPref: () => tvNormalizePrefs(loadPrefsRaw()).voice,
            savePref: (v) => savePrefsRaw({ voice: v }),
            onChange: () => renderVoice()
        });
        const engine = createTvEngine({
            createWorker: () => (typeof bridge.createWorker === 'function' ? bridge.createWorker() : new Worker('stockfish.js'))
        });
        controller = createTvController({
            ChessCtor: root.Chess,
            engine: engine,
            voice: voice,
            view: viewApi,
            getViewer: () => { try { return typeof bridge.getViewer === 'function' ? bridge.getViewer() : null; } catch (e) { return null; } },
            getOpenings: () => { try { return typeof bridge.getCuratedOpenings === 'function' ? bridge.getCuratedOpenings() : []; } catch (e) { return []; } },
            getOpeningGraph: () => { try { return typeof bridge.getOpeningGraph === 'function' ? bridge.getOpeningGraph() : null; } catch (e) { return null; } },
            loadPrefs: loadPrefsRaw,
            savePrefs: (p) => savePrefsRaw({ speed: p.speed, offsets: p.offsets, openingIndex: p.openingIndex })
        });
        return controller;
    }

    function open() {
        const c = ensureController();
        const screen = $id('sftv-screen');
        if (!c || !screen) return;
        if (root.jQuery) root.jQuery('#start-screen').hide(); else { const s = $id('start-screen'); if (s) s.style.display = 'none'; }
        screen.style.display = '';
        try { if (typeof bridge.navPush === 'function') bridge.navPush('sftv-screen'); } catch (e) {}
        try { if (typeof bridge.onOpen === 'function') bridge.onOpen(); } catch (e) {}
        uiReady = true;
        buildBoard();
        setTimeout(resizeBoard, 0);
        if (voice) voice.refreshVoices();
        c.setHidden(document.visibilityState === 'hidden');
        c.open();
        viewApi.render(c.state());
    }

    // Tanca la pantalla (sense tornar a l'inici): atura motor, temporitzadors i veu.
    function closeScreen() {
        if (controller) controller.close();
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        uiReady = false;
        destroyBoard();
        const screen = $id('sftv-screen');
        if (screen) screen.style.display = 'none';
    }

    function goHome() {
        closeScreen();
        if (root.jQuery) root.jQuery('#start-screen').show(); else { const s = $id('start-screen'); if (s) s.style.display = ''; }
        try { if (typeof bridge.popNav === 'function') bridge.popNav(); } catch (e) {}
    }

    function tryPosition() {
        if (!controller || typeof bridge.openExplorer !== 'function') return;
        const st = controller.state();
        if (!st.game) return;
        const fen = st.game.fen;
        const moveNo = Math.floor(st.game.moves.length / 2) + 1;
        controller.pause();
        closeScreen();
        try { if (typeof bridge.popNav === 'function') bridge.popNav(); } catch (e) {}
        bridge.openExplorer(fen, {
            importNote: 'Posició de Stockfish TV (jugada ' + moveNo + ', ' + (st.game.turn === 'w' ? 'mouen les blanques' : 'mouen les negres')
                + '). És una pràctica independent: pots analitzar-la o jugar-la contra Stockfish sense puntuar ni tocar les teves partides.'
        });
    }

    function init(options) {
        bridge = options || {};
        if (typeof document === 'undefined') return;
        const on = (id, ev, fn) => { const el = $id(id); if (el) el.addEventListener(ev, fn); };
        on('btn-sftv-banner', 'click', open);
        on('btn-back-sftv', 'click', () => {
            // Mateix camí que el gest d'enrere (navGoBack) si l'app el té.
            if (typeof bridge.goBack === 'function') bridge.goBack(); else goHome();
        });
        on('sftv-pause', 'click', () => { if (!controller) return; const st = controller.state(); if (st.paused) controller.resume(); else controller.pause(); });
        on('sftv-new', 'click', () => { if (controller) controller.newGame(); });
        on('sftv-try', 'click', tryPosition);
        on('sftv-too-easy', 'click', () => { if (controller) controller.adjust('harder'); });
        on('sftv-too-hard', 'click', () => { if (controller) controller.adjust('easier'); });
        on('sftv-speed', 'change', (ev) => { if (controller) controller.setSpeed(ev.target.value); });
        // Activar la veu és sempre fruit d'un toc de l'usuari (requisit dels
        // navegadors): la primera locució surt dins del mateix gest.
        on('sftv-voice-activate', 'click', () => {
            if (!voice) return;
            voice.setOn(true);
            if (voice.status() === 'ready') voice.speak('Veu activada.');
            renderVoice();
        });
        on('sftv-voice-toggle', 'click', () => {
            if (!voice) return;
            const turnOn = !voice.isOn() || voice.status() === 'blocked';
            voice.setOn(turnOn);
            if (turnOn && voice.status() === 'ready') voice.speak('Veu activada.');
            renderVoice();
        });
        document.addEventListener('visibilitychange', onVisibility);
        root.addEventListener && root.addEventListener('pagehide', () => { if (controller && screenVisible()) controller.setHidden(true); });
        root.addEventListener && root.addEventListener('resize', () => { setTimeout(resizeBoard, 80); });
    }

    return {
        TV_CONFIG,
        parseUciOptionLine,
        parseUciOptions,
        tvEngineCapabilities,
        tvCompatibilityNote,
        tvLevelLabel,
        tvStrengthCommands,
        tvViewerProfile,
        tvBaseTarget,
        tvCapsSignature,
        tvNormalizePrefs,
        tvResolveTarget,
        tvAdjustPrefs,
        tvMoveDelayMs,
        tvReadingTimeMs,
        tvSpeechMaxWaitMs,
        parseInfoLine,
        tvScoreWhite,
        tvMateFor,
        tvBuildAnalysis,
        tvMoverLossCp,
        tvGameEnd,
        tvResultHeadline,
        tvPickOpening,
        tvPreparedLine,
        tvCommentCandidates,
        tvChooseComment,
        tvSpeechText,
        tvIsCatalanVoice,
        tvPickCatalanVoice,
        tvPositionCommand,
        createTvVoice,
        createTvEngine,
        createTvController,
        // Navegador
        init,
        open,
        close: goHome,
        closeScreen,
        isActive() { return !!(controller && controller.isActive() && screenVisible()); },
        _controller() { return controller; }
    };
});
