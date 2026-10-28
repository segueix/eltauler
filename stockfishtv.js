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
        // Mostra la peça que mourà abans de modificar la posició visible.
        MOVE_PREVIEW_MS: 1500,
        MOVE_ANIMATION_MS: 750,
        // Espectadors per sota del mínim del motor: ritme més lent.
        BASIC_PACE_FACTOR: 1.3,
        // Jugades preparades de l'obertura: més àgils (ja són teoria).
        PREPARED_PACE_FACTOR: 0.55,
        // Pausa curta després d'una locució abans de la jugada següent.
        POST_SPEECH_PAUSE_MS: 900,
        // Pausa en reprendre (sense jugades acumulades).
        RESUME_DELAY_MS: 1500,
        // Control manual: espera mínima i màxima abans que el motor respongui
        // la jugada de l'usuari (dona temps a llegir-ne el comentari).
        CONTROL_REPLY_DELAY_MS: 1200,
        CONTROL_REPLY_MAX_MS: 4500,
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
        // Retransmissió: es poden comentar jugades consecutives. El control
        // de repeticions és per IDEA concreta (clau + estat): una idea igual no
        // es repeteix dins d'aquesta finestra, i una frase idèntica tampoc.
        IDEA_MEMORY_PLIES: 16,
        TEXT_MEMORY_PLIES: 24,
        // Resum estratègic cada 5 jugades completes (si aporta res de nou).
        SUMMARY_EVERY_PLIES: 10,
        // Explicació ampliada: com a molt aquestes paraules en total.
        EXTENDED_MAX_WORDS: 26,
        // Entre dues explicacions ampliades (definició, ampliació o fets
        // combinats) hi ha d'haver almenys aquestes semijugades.
        EXTENDED_GAP_PLIES: 3,
        // Fet de la jugada (captura o escac) + conseqüència: marge propi.
        LEAD_MAX_WORDS: 32,
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
            return 'Aquest motor no declara ' + missing + ', així que no se li pot fixar cap Elo. Els jugadors fan servir l\'opció nativa «Skill Level» (' + caps.min + '–' + caps.max + '). L\'Elo de cada nivell és una estimació orientativa (la relació que Stockfish 11 fa servir entre UCI_Elo i Skill Level), no un Elo FIDE.';
        }
        return 'Aquest motor no declara ' + missing + ' ni «Skill Level»: els dos jugadors juguen a força plena i el nivell no es pot ajustar.';
    }

    // Elo ESTIMAT de cada nivell de l'escala nativa «Skill Level». El motor
    // inclòs no declara cap Elo; com a referència orientativa s'usa la relació
    // que Stockfish 11 (gener del 2020, la versió publicada més propera al
    // binari del 2019, amb el mateix algorisme de Skill Level) fa servir per
    // convertir UCI_Elo en Skill Level: nivell = ((Elo − 1346,6) / 143,4)^(1/0,806).
    // Aquí s'aplica a la inversa i s'arrodoneix a la desena. No és cap Elo FIDE
    // ni una mesura d'aquest binari amb aquest temps de reflexió.
    function tvSkillEloEstimate(level) {
        const l = clamp(isNum(level) ? level : 0, 0, 20);
        return Math.round((1346.6 + 143.4 * Math.pow(l, 0.806)) / 10) * 10;
    }

    // Elo (natiu o estimat) d'un valor de nivell, per a les etiquetes.
    function tvLevelElo(caps, value) {
        if (!caps || caps.mode === 'none' || !isNum(value)) return null;
        return caps.mode === 'elo' ? Math.round(value) : tvSkillEloEstimate(value);
    }

    // Graella de valors de la barra de nivell.
    function tvLevelScale(caps) {
        if (!caps || caps.mode === 'none') return [];
        const out = [];
        if (caps.mode === 'elo') {
            for (let v = caps.min; v <= caps.max; v += 50) out.push({ value: v, elo: v });
            if (out[out.length - 1].value !== caps.max) out.push({ value: caps.max, elo: caps.max });
            return out;
        }
        for (let v = caps.min; v <= caps.max; v++) out.push({ value: v, elo: tvSkillEloEstimate(v) });
        return out;
    }

    function tvLevelLabel(caps, value) {
        if (!caps || caps.mode === 'none' || !isNum(value)) return { short: 'Força plena', long: 'Força del motor sense limitar' };
        if (caps.mode === 'elo') return { short: '≈ ' + value, long: 'Elo aproximat del motor: ' + value };
        const elo = tvSkillEloEstimate(value);
        return { short: 'Nivell ' + value + ' · ≈' + elo, long: 'Nivell ' + value + ' de ' + caps.max + ' · Elo estimat ≈ ' + elo };
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
        const floor = (caps && caps.mode === 'elo') ? caps.min
            : ((caps && caps.mode === 'skill') ? Math.max(TV_CONFIG.ELO_FLOOR, tvSkillEloEstimate(caps.min)) : TV_CONFIG.ELO_FLOOR);
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
    //   skill → la mateixa conversió sobre el rang d'Elo ESTIMAT de l'escala
    //           nativa i el nivell amb l'Elo estimat més proper.
    function tvBaseTarget(caps, viewer) {
        if (!caps || caps.mode === 'none') return null;
        if (!viewer || !viewer.known) return caps.min;
        const wanted = viewer.roc + TV_CONFIG.VIEWER_MARGIN;
        const Core = getCore();
        const convert = (v, min, max) => (Core && typeof Core.rocToEngineElo === 'function')
            ? Core.rocToEngineElo(v, min, max) : clamp(Math.round(v), min, max);
        if (caps.mode === 'elo') return convert(wanted, caps.min, caps.max);
        const target = convert(wanted, tvSkillEloEstimate(caps.min), tvSkillEloEstimate(caps.max));
        let best = caps.min;
        for (let l = caps.min; l <= caps.max; l++) {
            if (Math.abs(tvSkillEloEstimate(l) - target) < Math.abs(tvSkillEloEstimate(best) - target)) best = l;
        }
        return best;
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
    // Fixa directament l'objectiu de la partida següent (barra de nivell).
    function tvSetTargetPrefs(caps, viewer, prefs, value) {
        const p = tvNormalizePrefs(prefs);
        if (!caps || caps.mode === 'none' || !isNum(value)) return p;
        const current = tvResolveTarget(caps, viewer, p);
        const step = caps.mode === 'elo' ? 1 : caps.step;
        const next = clamp(Math.round(value / step) * step, caps.min, caps.max);
        const offsets = Object.assign({}, p.offsets);
        offsets[tvCapsSignature(caps)] = next - current.base;
        return Object.assign({}, p, { offsets: offsets });
    }

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

    // Acció en infinitiu d'una jugada («portar el cavall a f3»), validada
    // sobre la FEN amb els fets de core.js. A la TV no hi ha cap «tu»: la
    // redacció és impersonal (el redactor de les ressenyes parla a l'usuari).
    function moveAction(ChessCtor, fen, uci) {
        const Core = getCore();
        if (!Core || typeof Core.createPvBoardHelpers !== 'function') return null;
        const helpers = Core.createPvBoardHelpers(ChessCtor);
        const f = helpers ? helpers.moveFacts(fen, uci) : null;
        if (!f) return null;
        const check = f.mat ? ' amb escac i mat' : (f.escac ? ' amb escac' : '');
        if (f.enroc) return 'enrocar ' + (f.enroc === 'k' ? 'curt' : 'llarg') + check;
        const origin = f.desambigua ? ' ' + deSq(f.origen) : '';
        if (f.coronacio) return 'coronar el peó a ' + f.desti + check;
        if (f.captura) {
            const withPiece = f.peca === 'p' ? 'el peó de la columna ' + f.origen[0] : pieceShort(f.peca) + origin;
            return 'capturar ' + pieceShort(f.captura) + ' a ' + f.desti + ' amb ' + withPiece + check;
        }
        if (f.peca === 'p') return 'avançar el peó de la columna ' + f.origen[0] + ' fins a ' + f.desti + check;
        return 'portar ' + pieceShort(f.peca) + origin + ' a ' + f.desti + check;
    }

    // ------------------------------------------------------------------
    // Retransmissió: fets del tauler, candidats, selecció i memòria
    // ------------------------------------------------------------------
    // Objectiu: acompanyar gairebé cada jugada amb una frase curta i CERTA.
    // Cada candidat surt d'un fet comprovable (regles de chess.js, atacs i
    // defenses del tauler o una anàlisi fiable) i porta:
    //   kind      → tipus d'idea (per a les estadístiques i el to)
    //   priority  → urgència: tàctica > estratègia verificada > descripció
    //   key/sig   → identitat de la idea concreta i del seu estat: es pot
    //               tornar a comentar quan l'estat canvia, mai per repetir-la
    //   variants  → maneres de dir el mateix (varietat sense canviar el fet)
    //   extra     → frase opcional per a l'explicació ampliada
    //   explanatory → si explica alguna cosa més enllà d'anunciar la jugada
    // Si no hi ha res prou fonamentat, la jugada es descriu sense atribuir-li
    // cap intenció («Les negres porten el cavall a f6»).
    const KIND_PRIORITY = {
        'mate': 100, 'end': 96, 'promotion': 94, 'double-check': 92, 'fork-check': 90,
        'missed-mate': 86, 'allows-mate': 85, 'mate-threat': 82, 'out-of-check': 80,
        'fork': 84, 'skewer': 81, 'pin': 79, 'remove-defender': 79, 'tactic-reply': 79,
        'discovered-attack': 78, 'threat': 76, 'hanging': 74, 'reply': 72, 'missed': 70,
        'capture-free': 68, 'only-move': 67, 'capture-recoverable': 66, 'recapture': 64,
        'opening-phrase': 62, 'queens-off': 60, 'endgame': 59, 'passed-new': 58, 'passed-advance': 57, 'opposition': 57,
        'castle': 56, 'structure': 55, 'material': 54, 'defend': 53, 'open-file': 52,
        'doubled-rooks': 50, 'seventh': 49, 'pressure': 48, 'threat-pawn': 47, 'king-pressure': 47, 'majority': 46, 'center': 46, 'diagonal': 45,
        'blocked': 44, 'tension': 43,
        'development': 42, 'king-activity': 40, 'activation': 38, 'check': 36, 'capture': 30,
        'describe': 10
    };
    const NON_EXPLANATORY = { describe: true, capture: true, check: true };
    // Comentaris que expliquen una conseqüència però no diuen la captura o
    // l'escac de la jugada: van precedits d'aquest fet.
    const LEAD_WITH_FACT = ['hanging', 'threat', 'threat-pawn', 'discovered-attack', 'structure', 'passed-new', 'open-file',
        'center', 'diagonal', 'pressure', 'defend', 'material', 'queens-off', 'endgame', 'fork-check', 'seventh', 'doubled-rooks',
        'only-move', 'missed', 'tension', 'king-pressure', 'majority', 'blocked', 'king-activity', 'opposition', 'reply', 'mate-threat', 'fork', 'pin', 'skewer'];
    const CENTER_SQUARES = ['d4', 'e4', 'd5', 'e5'];
    const NUM_WORDS = { 1: ['un', 'una'], 2: ['dos', 'dues'], 3: ['tres', 'tres'], 4: ['quatre', 'quatre'], 5: ['cinc', 'cinc'], 6: ['sis', 'sis'], 7: ['set', 'set'], 8: ['vuit', 'vuit'] };
    function numWord(n, fem) { const w = NUM_WORDS[n]; return w ? w[fem ? 1 : 0] : String(n); }

    // «de» davant d'una casella: s'apostrofa davant de les lletres que es
    // pronuncien amb vocal (a, e, efa, hac): «el peó d'e4», «la torre de d1».
    function deSq(sq) { return (/^[aefh]/.test(sq) ? 'd\'' : 'de ') + sq; }
    function deWord(w) { return (/^[aeiouàèéíòóú]/i.test(w) ? 'd\'' : 'de ') + w; }
    function delPiece(type) { return PIECE_FEMININE[type] ? 'de la ' + PIECE_NAME[type] : (/^[aeiou]/.test(PIECE_NAME[type]) ? 'de l\'' : 'del ') + PIECE_NAME[type]; }
    function pieceOn(type, color, sq) { return pieceNP(type, color) + ' ' + deSq(sq); }
    // «per» + article: «pel peó», «per la torre», «per l'alfil».
    function perNP(np) { return /^el /.test(np) ? 'pel ' + np.slice(3) : 'per ' + np; }
    function shortOn(type, sq) { return pieceShort(type) + ' ' + deSq(sq); }
    function pieceTitle(type, color) { return capFirst(PIECE_NAME[type]) + ' ' + (PIECE_FEMININE[type] ? COLOR[color].adjF : COLOR[color].adj); }
    function agree(type, masc, fem) { return PIECE_FEMININE[type] ? fem : masc; }

    function gridAt(grid, sq) { const fr = fileRank(sq); return fr ? grid[fr.rank][fr.file] : null; }
    function attackersAt(H, grid, sq, color) { const fr = fileRank(sq); return fr ? H.attackers(grid, fr.file, fr.rank, color) : []; }
    function targetsFrom(H, grid, sq) {
        const fr = fileRank(sq);
        return fr ? H.targets(grid, fr.file, fr.rank).map(t => squareOf(t.file, t.rank)) : [];
    }
    function piecesOf(grid, color, type) {
        const out = [];
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            const p = grid[r][f];
            if (p && p.c === color && (!type || p.t === type)) out.push({ sq: squareOf(f, r), t: p.t });
        }
        return out;
    }
    function materialOf(grid) {
        const m = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            const p = grid[r][f];
            if (p && p.t !== 'k') m[p.c][p.t]++;
        }
        return m;
    }
    function materialSig(m) { return ['p', 'n', 'b', 'r', 'q'].map(t => m.w[t] - m.b[t]).join(','); }
    // Descripció del desequilibri material des del bàndol que en té més.
    function materialPhrase(m) {
        const d = {};
        ['p', 'n', 'b', 'r', 'q'].forEach(t => { d[t] = m.w[t] - m.b[t]; });
        const pts = d.p + 3 * (d.n + d.b) + 5 * d.r + 9 * d.q;
        if (!pts) return null;
        const leader = pts > 0 ? 'w' : 'b';
        const s = pts > 0 ? 1 : -1;
        const p = d.p * s, minor = (d.n + d.b) * s, r = d.r * s, q = d.q * s;
        let desc;
        if (!minor && !r && !q) desc = p === 1 ? 'un peó de més' : numWord(p) + ' peons de més';
        else if (r === 1 && minor === -1 && !q) desc = 'la qualitat de més' + (p > 0 ? ' i ' + (p === 1 ? 'un peó' : numWord(p) + ' peons') : '');
        else if (minor === 1 && !r && !q && p <= 0) desc = p === 0 ? 'una peça de més' : 'una peça per ' + (p === -1 ? 'un peó' : numWord(-p) + ' peons');
        else if (r === 1 && !minor && !q && p >= 0) desc = 'una torre de més';
        else if (q === 1 && !minor && !r) desc = 'la dama de més';
        else {
            const items = [];
            const dd = { q: d.q * s, r: d.r * s, b: d.b * s, n: d.n * s, p: d.p * s };
            const allPositive = Object.keys(dd).every(t => dd[t] >= 0);
            if (allPositive) {
                ['q', 'r', 'b', 'n', 'p'].forEach((t) => {
                    if (dd[t] === 1) items.push((PIECE_FEMININE[t] ? 'una ' : 'un ') + PIECE_NAME[t]);
                    else if (dd[t] > 1) items.push(numWord(dd[t], PIECE_FEMININE[t]) + ' ' + PIECE_PLURAL[t]);
                });
                const R = getRedactor();
                desc = (R && R.llistaEnCatala ? R.llistaEnCatala(items) : items.join(' i ')) + ' de més';
            } else {
                desc = 'l\'equivalent a ' + (pts * s === 1 ? 'un peó' : numWord(pts * s) + ' peons') + ' de més';
            }
        }
        return { leader: leader, desc: desc, pts: pts * s };
    }
    function pieceListPhrase(m, color) {
        const parts = [];
        const add = (t) => { const n = m[color][t]; if (n === 1) parts.push(PIECE_NAME[t]); else if (n > 1) parts.push(numWord(n, PIECE_FEMININE[t]) + ' ' + PIECE_PLURAL[t]); };
        ['q', 'r', 'b', 'n'].forEach(add);
        const R = getRedactor();
        return parts.length ? (R && R.llistaEnCatala ? R.llistaEnCatala(parts) : parts.join(' i ')) : 'només peons';
    }
    function pawnStructure(grid, color) {
        const Core = getCore();
        const passed = new Set((Core && Core.antidotePassedPawns ? Core.antidotePassedPawns(grid, color) : []).map(p => p.square));
        const isoFiles = Core && Core.antidoteIsolatedPawns ? Core.antidoteIsolatedPawns(grid, color) : [];
        const isolated = new Set();
        const perFile = [0, 0, 0, 0, 0, 0, 0, 0];
        piecesOf(grid, color, 'p').forEach((p) => {
            const f = 'abcdefgh'.indexOf(p.sq[0]);
            perFile[f]++;
            if (isoFiles.indexOf(f) !== -1) isolated.add(p.sq);
        });
        const doubled = new Set();
        perFile.forEach((n, f) => { if (n >= 2) doubled.add('abcdefgh'[f]); });
        return { passed: passed, isolated: isolated, doubled: doubled };
    }
    function fileCounts(grid, f) {
        const c = { w: 0, b: 0 };
        for (let r = 0; r < 8; r++) { const p = grid[r][f]; if (p && p.t === 'p') c[p.c]++; }
        return c;
    }
    function chebyshev(a, b) {
        const x = fileRank(a), y = fileRank(b);
        return (x && y) ? Math.max(Math.abs(x.file - y.file), Math.abs(x.rank - y.rank)) : 99;
    }
    function centerDistance(sq) { return Math.min.apply(null, CENTER_SQUARES.map(c => chebyshev(sq, c))); }
    // Final, a efectes del relat: la fase de final de core.js o, com a molt,
    // quatre peces (sense comptar reis ni peons) entre tots dos bàndols.
    function isPhaseEndgame(fen) {
        const Core = getCore();
        if (Core && Core.phaseFromFen && Core.phaseFromFen(fen) === 'endgame') return true;
        const placement = String(fen || '').split(' ')[0];
        return (placement.match(/[nbrqNBRQ]/g) || []).length <= 4;
    }
    function kingSq(grid, color) { const k = piecesOf(grid, color, 'k')[0]; return k ? k.sq : null; }
    // Peces «penjades» d'un color: atacades i sense defensa, o atacades per
    // una peça més barata. Atacada NO vol dir guanyable: és només un fet.
    function hangingSet(H, grid, color) {
        const out = {};
        piecesOf(grid, color).forEach((p) => {
            if (p.t === 'k') return;
            const att = attackersAt(H, grid, p.sq, other(color));
            if (!att.length) return;
            const def = attackersAt(H, grid, p.sq, color);
            const cheapest = Math.min.apply(null, att.map(a => PIECE_VALUE[a.t]));
            if (!def.length || cheapest < PIECE_VALUE[p.t]) out[p.sq] = { t: p.t, defended: def.length > 0, cheapest: cheapest };
        });
        return out;
    }
    function developedMinors(grid, color) {
        const home = HOME_SQUARES[color];
        let atHome = 0;
        Object.keys(home).forEach((sq) => { const p = gridAt(grid, sq); if (p && p.c === color && p.t === home[sq]) atHome++; });
        const minors = piecesOf(grid, color).filter(p => p.t === 'n' || p.t === 'b').length;
        return { out: Math.max(0, minors - atHome), atHome: atHome, minors: minors };
    }

    // Captures legals del bàndol indicat, també quan encara no té el torn.
    // No confon les línies geomètriques d'una peça clavada amb amenaces reals.
    function tacticalCapture(ChessCtor, fen, color, from, to) {
        try {
            const parts = fen.split(' ');
            if (parts[1] !== color) { parts[1] = color; parts[3] = '-'; }
            const g = new ChessCtor(parts.join(' '));
            return g.moves({ square: from, verbose: true }).some(m => m.to === to && m.captured);
        } catch (e) { return false; }
    }

    function lineTactics(ChessCtor, fen, grid, color, geometryOnly) {
        const Core = getCore();
        if (!Core || !Core.antidotePinsAndSkewers) return [];
        return Core.antidotePinsAndSkewers(grid, color).filter(t => {
            const front = gridAt(grid, t.front), back = gridAt(grid, t.back);
            // Dues peces del mateix valor alineades no són una clavada.
            if (t.kind === 'pin' && PIECE_VALUE[back.t] <= PIECE_VALUE[front.t]) return false;
            if (t.kind === 'skewer' && PIECE_VALUE[back.t] < 3) return false;
            return geometryOnly || front.t === 'k' || tacticalCapture(ChessCtor, fen, color, t.from, t.front);
        });
    }

    function tacticalTarget(grid, sq) {
        const p = gridAt(grid, sq);
        return { sq: sq, type: p.t, color: p.c };
    }

    function tacticData(kind, grid, color, from, squares, extra) {
        return Object.assign({ kind: kind, color: color, attackerSq: from, attackerType: gridAt(grid, from).t,
            targets: squares.map(sq => tacticalTarget(grid, sq)) }, extra || {});
    }

    // Només seguim motius que la veu HA explicat. La resposta immediata i
    // la captura següent es descriuen com a fets, mai com un guany assegurat.
    function tacticalReplies(c, H, after, add) {
        const mv = c.move;
        const names = { fork: 'forquilla', pin: 'clavada', skewer: 'enfilada',
            'discovered-attack': 'atac a la descoberta', 'remove-defender': 'eliminació del defensor' };
        (c.memory && c.memory.tactics || []).forEach(t => {
            const age = c.ply - t.ply;
            if (age !== 1 && age !== 2) return;
            const name = names[t.kind];
            const attacker = gridAt(after.grid, t.attackerSq);
            const intact = attacker && attacker.t === t.attackerType && attacker.c === t.color;
            const targets = t.targets || [];
            const emit = variants => add('tactic-reply', variants, {
                key: 'tactic-reply:' + t.kind + ':' + t.attackerSq + ':' + c.ply,
                family: 'reply-' + t.kind, reliability: 'rules',
                tags: { color: mv.color, squares: [mv.to, t.attackerSq].concat(targets.map(x => x.sq)) }
            });
            if (mv.color === t.color) {
                const victim = targets.find(x => x.sq === mv.to && x.type === mv.captured);
                if (age === 2 && victim && mv.from === t.attackerSq) emit([
                    'Després de ' + (name.startsWith('eliminació') || name.startsWith('enfilada') || name.startsWith('atac') ? "l'" : 'la ') + name + ', ' + pieceNP(mv.piece, mv.color) + ' captura ' + shortOn(mv.captured, mv.to) + '.',
                    'La seqüència tàctica continua: ' + pieceNP(mv.piece, mv.color) + ' captura ' + shortOn(mv.captured, mv.to) + '.'
                ]);
                return;
            }
            if (age !== 1) return;
            if (mv.to === t.attackerSq && mv.captured === t.attackerType) {
                emit([t.kind === 'remove-defender'
                    ? COLOR[mv.color].Pl + ' eliminen l’atacant capturant ' + pieceShort(t.attackerType) + '.'
                    : COLOR[mv.color].Pl + ' neutralitzen ' + (['skewer', 'discovered-attack'].includes(t.kind) ? "l'" : 'la ') + name + ' capturant ' + pieceShort(t.attackerType) + '.']);
                return;
            }
            if (!intact) return;
            const remaining = targets.filter(x => {
                const sq = mv.from === x.sq ? mv.to : x.sq;
                const p = gridAt(after.grid, sq);
                return p && p.t === x.type && p.c === x.color && p.t !== 'k'
                    && tacticalCapture(c.ChessCtor, c.fenAfter, t.color, t.attackerSq, sq);
            });
            const stillAttacked = targets.some(x => {
                const sq = mv.from === x.sq ? mv.to : x.sq;
                const p = gridAt(after.grid, sq);
                return p && p.t === x.type && p.c === x.color && p.t !== 'k'
                    && targetsFrom(H, after.grid, t.attackerSq).includes(sq);
            });
            // Un contraescac pot ajornar la captura sense haver desfet l'atac.
            if (!remaining.length && stillAttacked) return;
            const movedTarget = targets.find(x => x.sq === mv.from);
            if (t.kind === 'pin') {
                const frontSq = mv.from === t.front ? mv.to : t.front;
                const stillPinned = lineTactics(c.ChessCtor, c.fenAfter, after.grid, t.color, true)
                    .some(p => p.kind === 'pin' && p.from === t.attackerSq && p.front === frontSq);
                if (stillPinned) return;
                const back = targets.find(x => x.sq === t.back);
                if (movedTarget && movedTarget.sq === t.front && remaining.some(x => x.sq === t.back)) {
                    emit(['La peça surt de la clavada, però deixa ' + pieceShort(back.type) + ' sota atac.']);
                } else emit([COLOR[mv.color].Pl + ' desfan la clavada movent ' + pieceShort(mv.piece) + ' a ' + mv.to + '.']);
            } else if (movedTarget && remaining.some(x => x.sq !== movedTarget.sq)) {
                const target = remaining.find(x => x.sq !== movedTarget.sq);
                // No diem que s'ha evitat tota la tàctica si queda una víctima.
                emit([capFirst(pieceNP(movedTarget.type, mv.color)) + " s'aparta, però " + shortOn(target.type, target.sq) + ' continua sota atac.',
                    'La resposta mou ' + pieceShort(movedTarget.type) + ', però manté ' + shortOn(target.type, target.sq) + ' sota atac.']);
            } else if (!remaining.length && t.kind === 'remove-defender' && movedTarget) {
                emit([capFirst(pieceNP(movedTarget.type, mv.color)) + ' s’aparta de l’atac després de quedar sense defensor.']);
            } else if (!remaining.length && t.kind !== 'remove-defender') {
                emit([COLOR[mv.color].Pl + ' neutralitzen ' + (t.kind === 'fork' ? 'la ' : "l'") + name + ': les peces ja no queden atacades per ' + pieceShort(t.attackerType) + '.']);
            }
        });
    }

    function tvEmptyMemory() {
        return {
            ideas: {}, texts: [], templates: {}, plainStreak: 0, lastExtendedPly: -99, lastCommentPly: -99,
            focus: [], threats: [], pressures: [], tactics: [], defined: {}, lastSummaryPly: 0, summarySig: null,
            materialSig: '0,0,0,0,0', endgame: false, queensOff: false, castled: { w: false, b: false }
        };
    }
    function cloneMemory(m) { return JSON.parse(JSON.stringify(m || tvEmptyMemory())); }

    // Descripció factual de la jugada, sense intencions ni valoracions.
    function describeMove(mv, extraCheck) {
        const me = COLOR[mv.color];
        const ps = pieceShort(mv.piece);
        const check = extraCheck ? (/#/.test(mv.san) ? ', escac i mat' : (/\+/.test(mv.san) ? ', amb escac' : '')) : '';
        const end = (s) => s.replace(/\.$/, '') + check + '.';
        if (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1) {
            const side = mv.flags.indexOf('k') !== -1 ? 'curt' : 'llarg';
            return { family: 'describe-castle', variants: [end(me.Pl + ' enroquen ' + side + '.'), end('Enroc ' + side + ' de ' + me.pl + '.')] };
        }
        if (mv.captured) {
            const victim = shortOn(mv.captured, mv.to);
            const enPassant = mv.flags.indexOf('e') !== -1 ? ' al pas' : '';
            if (mv.piece === 'p') {
                return { family: 'describe-capture-p', variants: [
                    end(me.Pl + ' capturen ' + victim + enPassant + ' amb el peó de la columna ' + mv.from[0] + '.'),
                    end('El peó ' + me.adj + ' de la columna ' + mv.from[0] + ' captura' + enPassant + ' a ' + mv.to + '.'),
                    end('Captura de peó a ' + mv.to + enPassant + ': ' + me.pl + ' prenen ' + pieceShort(mv.captured) + '.')
                ] };
            }
            return { family: 'describe-capture', variants: [
                end(me.Pl + ' capturen ' + victim + ' amb ' + ps + '.'),
                end(capFirst(pieceNP(mv.piece, mv.color)) + ' captura ' + pieceShort(mv.captured) + ' a ' + mv.to + '.'),
                end('Captura a ' + mv.to + ': ' + pieceNP(mv.piece, mv.color) + ' pren ' + pieceShort(mv.captured) + '.')
            ] };
        }
        if (mv.piece === 'p') {
            const file = mv.from[0];
            const two = Math.abs(parseInt(mv.to[1], 10) - parseInt(mv.from[1], 10)) === 2;
            return { family: 'describe-pawn', variants: [
                end(two ? me.Pl + ' avancen dues caselles el peó de la columna ' + file + '.' : me.Pl + ' avancen el peó de la columna ' + file + ' fins a ' + mv.to + '.'),
                end('Peó ' + me.adj + ' a ' + mv.to + '.'),
                end(me.Pl + ' juguen el peó a ' + mv.to + '.'),
                end('Ara, el peó ' + me.adj + ' arriba a ' + mv.to + '.')
            ] };
        }
        if (mv.piece === 'k') {
            return { family: 'describe-king', variants: [
                end('El rei ' + me.adj + ' passa a ' + mv.to + '.'),
                end(me.Pl + ' mouen el rei a ' + mv.to + '.'),
                end('Rei ' + me.adj + ' a ' + mv.to + '.')
            ] };
        }
        return { family: 'describe-piece', variants: [
            end(me.Pl + ' porten ' + ps + ' a ' + mv.to + '.'),
            end(pieceTitle(mv.piece, mv.color) + ' a ' + mv.to + '.'),
            end(me.Pl + ' juguen ' + ps + ' a ' + mv.to + '.'),
            end('Ara, ' + pieceNP(mv.piece, mv.color) + ' va a ' + mv.to + '.')
        ] };
    }

    // Llista de comentaris candidats d'una jugada, de més a menys prioritari.
    // ctx = { ChessCtor, fenBefore, fenAfter, move (verbós de chess.js),
    //         prevMove, before, after (anàlisis), tier, prepared, phrase,
    //         end (final de partida o null), ply, memory (opcional) }
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
        const memory = c.memory || null;
        const out = [];
        // add(kind, variants|text, opts{key, sig, extra, tags, payload})
        const add = (kind, text, o) => {
            const variants = (Array.isArray(text) ? text : [text]).filter(Boolean);
            if (!variants.length) return null;
            const opts = o || {};
            const cand = {
                kind: kind, priority: KIND_PRIORITY[kind] || 0, text: variants[0], variants: variants,
                key: opts.key || (kind + ':' + color + ':' + mv.to), sig: opts.sig || mv.to,
                family: opts.family || kind, extra: opts.extra || null, define: opts.define || null,
                tags: opts.tags || { color: color, squares: [mv.to] }, payload: opts.payload || null,
                explanatory: !NON_EXPLANATORY[kind], reliability: opts.reliability || 'board'
            };
            out.push(cand);
            return cand;
        };
        const H = boardHelpers();
        const before = H ? H.parse(c.fenBefore) : null;
        const after = H ? H.parse(c.fenAfter) : null;
        const isCheck = /[+#]/.test(mv.san);
        const reliable = !!(c.before && c.before.reliable && c.after && c.after.reliable);
        const isCastle = mv.flags && (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1);
        const toFR = fileRank(mv.to);
        const moved = (after && toFR) ? after.grid[toFR.rank][toFR.file] : null;
        const movedValue = moved ? PIECE_VALUE[moved.t] : 0;

        // 1) Final de partida.
        if (c.end) {
            if (c.end.reason === 'checkmate') {
                add('mate', tier === 'basic'
                    ? 'Escac i mat: el rei ' + COLOR[opp].adj + ' està atacat i no té cap manera d\'escapar. Guanyen ' + me.pl + '.'
                    : c.end.text, { reliability: 'rules' });
            } else {
                add('end', c.end.text, { reliability: 'rules' });
            }
        }

        // 2) Coronació.
        if (mv.promotion) {
            const noun = PIECE_NAME[mv.promotion] || 'dama';
            add('promotion', tier === 'basic'
                ? 'El peó ' + me.adj + ' arriba a l\'última fila i es converteix en ' + noun + '.'
                : 'El peó ' + me.adj + ' corona a ' + mv.to + ' i es converteix en ' + noun + (isCheck ? ', amb escac.' : '.'), { reliability: 'rules' });
        }

        // 3) Escacs: doble, a la descoberta, amb atac doble o simple.
        let checkers = [];
        if (isCheck && H && after && !c.end) {
            const ks = kingSq(after.grid, opp);
            checkers = ks ? attackersAt(H, after.grid, ks, color).map(a => ({ sq: squareOf(a.file, a.rank), t: a.t })) : [];
            const discovered = checkers.find(k => k.sq !== mv.to);
            if (checkers.length >= 2) {
                add('double-check', tier === 'basic'
                    ? 'Escac doble: dues peces ataquen el rei ' + COLOR[opp].adj + ', i l\'única defensa és moure el rei.'
                    : 'Escac doble: el rei ' + COLOR[opp].adj + ' està obligat a moure\'s.', { reliability: 'rules' });
            } else if (discovered) {
                add('check', ['Escac a la descoberta ' + delPiece(discovered.t) + ' ' + COLOR[color].adj + (PIECE_FEMININE[discovered.t] ? 'a' : '') + ' des ' + deSq(discovered.sq) + '.'],
                    { reliability: 'rules', family: 'check-discovered' });
            }
            if (moved && checkers.some(k => k.sq === mv.to)) {
                const hits = targetsFrom(H, after.grid, mv.to)
                    .map(sq => ({ sq: sq, p: gridAt(after.grid, sq) }))
                    .filter(t => t.p && t.p.c === opp);
                const valuable = hits.filter(t => (t.p.t === 'q' || t.p.t === 'r') && PIECE_VALUE[t.p.t] > movedValue)
                    .filter(t => tacticalCapture(c.ChessCtor, c.fenAfter, color, mv.to, t.sq))
                    .sort((a, b) => PIECE_VALUE[b.p.t] - PIECE_VALUE[a.p.t]);
                if (valuable.length) {
                    const target = valuable[0];
                    const variants = [
                        'Forquilla amb escac: ' + pieceNP(moved.t, color) + ' ataca el rei i ' + pieceShort(target.p.t) + '.',
                        capFirst(pieceNP(moved.t, color)) + ' fa una forquilla al rei i ' + pieceShort(target.p.t) + '.',
                        'Escac i atac doble: ' + pieceNP(moved.t, color) + ' també ataca ' + pieceShort(target.p.t) + '.'
                    ];
                    // Que es GUANYI és una altra cosa: només si l'anàlisi ho avala
                    // (la línia principal hi captura i l'avantatge creix).
                    const pv = c.after && c.after.pv ? c.after.pv : [];
                    const gain = tvMoverLossCp(c.after && c.after.best, c.before && c.before.best, color);
                    const reply = reliable && pv[0] ? applyUci(c.ChessCtor, c.fenAfter, pv[0]) : null;
                    const capture = reply && pv[1] ? applyUci(c.ChessCtor, reply.fen, pv[1]) : null;
                    if (capture && capture.move.from === mv.to && capture.move.to === target.sq && capture.move.captured === target.p.t && isNum(gain) && gain >= 300) {
                        variants.forEach((text, i) => { variants[i] = text + ' Segons l\'anàlisi, ' + me.pl + ' poden guanyar ' + pieceShort(target.p.t) + '.'; });
                    }
                    add('fork-check', variants, { key: 'fork:' + color + ':' + target.sq,
                        payload: { tactic: tacticData('fork', after.grid, color, mv.to, [ks, target.sq]) },
                        tags: { color: color, squares: [mv.to, target.sq] } });
                }
                const name = pieceNP(moved.t, color);
                const checkTexts = mv.captured ? describeMove(mv, true).variants : [
                    capFirst(name) + ' fa escac des ' + deSq(mv.to) + '.',
                    'Escac amb ' + pieceShort(moved.t) + ' a ' + mv.to + '.',
                    capFirst(me.pl) + ' fan escac amb ' + pieceShort(moved.t) + ' a ' + mv.to + '.'
                ];
                add('check', checkTexts.map(s => tier === 'basic' ? s.replace(/\.$/, ': ' + them.pl + ' han de protegir el rei.') : s), { reliability: 'rules', family: mv.captured ? 'check-capture' : 'check' });
            }
        }

        // 4) Sortir de l'escac (la jugada anterior feia escac).
        if (before && H && !c.end) {
            const ksBefore = kingSq(before.grid, color);
            const checkersBefore = ksBefore ? attackersAt(H, before.grid, ksBefore, opp) : [];
            if (checkersBefore.length) {
                const chk = squareOf(checkersBefore[0].file, checkersBefore[0].rank);
                if (mv.piece === 'k') add('out-of-check', [me.Pl + ' surten de l\'escac amb el rei a ' + mv.to + '.', 'El rei ' + me.adj + ' s\'aparta de l\'escac cap a ' + mv.to + '.',
                    'Per sortir de l\'escac, ' + me.pl + ' porten el rei a ' + mv.to + '.', capFirst(me.pl) + ' responen a l\'escac amb el rei a ' + mv.to + '.'], { reliability: 'rules', key: 'outcheck:' + color + ':' + c.ply });
                else if (mv.captured && mv.to === chk) add('out-of-check', [me.Pl + ' capturen la peça que feia escac.', 'La captura a ' + mv.to + ' elimina la peça que feia escac.'], { reliability: 'rules', key: 'outcheck:' + color + ':' + c.ply });
                else add('out-of-check', [me.Pl + ' tapen l\'escac amb ' + pieceShort(mv.piece) + ' a ' + mv.to + '.', 'L\'escac queda tapat: ' + pieceNP(mv.piece, color) + ' s\'interposa a ' + mv.to + '.'], { reliability: 'rules', key: 'outcheck:' + color + ':' + c.ply });
            }
        }

        // 5) Mats segons l'anàlisi (mai barrejats amb centipeons).
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
                        : 'L\'anàlisi veia mat en ' + hadMate + ' per a ' + me.pl + ' amb una altra jugada: ' + accio + '.', { reliability: 'analysis' });
                }
            }
            if (mateTheirs && mateTheirs <= TV_CONFIG.MATE_ANNOUNCE_MAX && !theyHadMate) {
                add('allows-mate', tier === 'basic'
                    ? 'Compte: ara ' + them.pl + ' tenen un mat a prop.'
                    : 'Aquesta jugada permet a ' + them.pl + ' un mat en ' + mateTheirs + ', segons l\'anàlisi.', { reliability: 'analysis' });
            }
            const prevMate = memory && memory.ideas && memory.ideas['mate:' + color];
            const longer = prevMate && isNum(c.ply) && c.ply - prevMate.ply < 8 && +prevMate.sig <= mateMine;
            if (mateMine && mateMine <= TV_CONFIG.MATE_ANNOUNCE_MAX && !longer) {
                add('mate-threat', tier === 'basic'
                    ? capFirst(me.pl) + ' tenen un mat a prop.'
                    : 'L\'anàlisi veu mat en ' + mateMine + ' per a ' + me.pl + '.', { reliability: 'analysis', key: 'mate:' + color, sig: String(mateMine) });
            }
        }

        // 6) Alternativa millor avalada per l'anàlisi (centipeons, mateix bàndol).
        if (reliable && !c.end && c.before.bestUci && c.before.bestUci !== uci) {
            const loss = tvMoverLossCp(c.before.best, c.after.best, color);
            const threshold = TV_CONFIG.MISSED_LOSS_CP[tier] || TV_CONFIG.MISSED_LOSS_CP.mid;
            const moverBefore = c.before.best.type === 'cp' ? c.before.best.value * (color === 'w' ? 1 : -1) : null;
            if (isNum(loss) && loss >= threshold && isNum(moverBefore) && Math.abs(moverBefore) <= TV_CONFIG.DECIDED_CP) {
                const accio = moveAction(c.ChessCtor, c.fenBefore, c.before.bestUci);
                if (accio) {
                    const pawns = (Math.round(loss / 10) / 10).toFixed(1).replace('.', ',');
                    const tail = tier === 'advanced' ? ': segons el motor, la jugada feta cedeix uns ' + pawns + ' peons.' : '.';
                    const variants = tier === 'basic'
                        ? ['Hi havia una jugada millor per a ' + me.pl + ': ' + accio + '.', capFirst(me.pl) + ' tenien una opció millor: ' + accio + '.']
                        : ['Per a ' + me.pl + ', l\'anàlisi preferia ' + accio + tail, 'L\'anàlisi recomanava ' + accio + tail,
                            'Segons l\'anàlisi, era millor ' + accio + tail, capFirst(me.pl) + ' tenien una opció millor: ' + accio + tail];
                    add('missed', variants, { reliability: 'analysis', key: 'missed:' + c.ply, family: 'missed' });
                }
            }
        }

        // 7) Única bona jugada segons l'anàlisi (MultiPV 2: la segona opció
        //    perd clarament). Només amb centipeons als dos costats.
        if (reliable && !c.end && c.before.bestUci === uci && c.before.second && c.before.second.score
            && c.before.best.type === 'cp' && c.before.second.score.type === 'cp' && c.before.second.depth >= TV_CONFIG.MIN_RELIABLE_DEPTH) {
            const gap = tvMoverLossCp(c.before.best, c.before.second.score, color);
            if (isNum(gap) && gap >= 150) {
                add('only-move', tier === 'advanced'
                    ? 'Era l\'única bona jugada segons l\'anàlisi: la segona opció cedia uns ' + (Math.round(gap / 10) / 10).toFixed(1).replace('.', ',') + ' peons.'
                    : 'Era la millor jugada segons l\'anàlisi, i les alternatives eren clarament pitjors.', { reliability: 'analysis', key: 'only:' + c.ply });
            }
        }

        // 8) Frase del repertori per a les jugades preparades.
        if (c.prepared && c.phrase) add('opening-phrase', c.phrase, { key: 'phrase:' + c.ply, reliability: 'rules' });

        // 9) Enroc.
        if (isCastle) {
            const side = mv.flags.indexOf('k') !== -1 ? 'curt' : 'llarg';
            const connected = after && rooksConnected(after.grid, color);
            add('castle', tier === 'basic'
                ? [me.Pl + ' han enrocat: el rei s\'aparta del centre i la torre entra en joc.']
                : [me.Pl + ' han enrocat ' + side + (connected ? ' i han connectat les torres.' : '.'),
                    'Enroc ' + side + ' de ' + me.pl + (connected ? ': les torres ja es veuen.' : ': el rei queda a ' + mv.to + '.')],
                { key: 'castle:' + color, reliability: 'rules', payload: { castled: color },
                  define: tier === 'mid' ? { term: 'castle', text: 'Enrocar posa el rei lluny del centre i acosta una torre a les columnes centrals.' } : null });
        }

        // 10) Captures (si la captura fa escac, es diu).
        const withCheck = (t) => {
            if (!isCheck || c.end) return t;
            if (/\bcapturen /.test(t)) return t.replace(/\bcapturen /, 'capturen amb escac ');
            if (t.indexOf('a ' + mv.to) !== -1) return t.replace('a ' + mv.to, 'a ' + mv.to + ' amb escac');
            return t.replace(/\.$/, ', amb escac.');
        };
        if (mv.captured && H && before && after) {
            const prev = c.prevMove;
            const isRecapture = !!(prev && prev.captured && prev.to === mv.to && prev.color === opp);
            const enPassant = mv.flags.indexOf('e') !== -1;
            if (isRecapture) {
                add('recapture', (prev.captured === mv.captured
                    ? [me.Pl + ' tornen a capturar a ' + mv.to + ': és un canvi ' + deWord(PIECE_PLURAL[mv.captured]) + '.',
                        'Canvi ' + deWord(PIECE_PLURAL[mv.captured]) + ' a ' + mv.to + ': ' + me.pl + ' recuperen la peça.']
                    : [me.Pl + ' tornen a capturar a ' + mv.to + ' i recuperen material.']).map(withCheck), { key: 'recap:' + c.ply, reliability: 'rules' });
            }
            if (!enPassant) {
                const defendersBefore = attackersAt(H, before.grid, mv.to, opp).length;
                const defendersAfter = attackersAt(H, after.grid, mv.to, opp).length;
                if (!isRecapture && PIECE_VALUE[mv.captured] >= 3 && defendersBefore === 0 && defendersAfter === 0) {
                    add('capture-free', [me.Pl + ' capturen ' + pieceNP(mv.captured, opp) + ', que no estava ' + agree(mv.captured, 'defensat', 'defensada') + '.',
                        capFirst(pieceNP(mv.captured, opp)) + ' no estava ' + agree(mv.captured, 'defensat', 'defensada') + ', i ' + me.pl + ' ' + piecePronoun(mv.captured) + ' capturen.'].map(withCheck),
                    { key: 'free:' + c.ply });
                }
                // Recuperable: la millor resposta de l'anàlisi hi torna a capturar.
                if (!isRecapture && c.after && c.after.reliable && c.after.bestUci && c.after.bestUci.slice(2, 4) === mv.to) {
                    const reply = applyUci(c.ChessCtor, c.fenAfter, c.after.bestUci);
                    if (reply && reply.move.captured) {
                        add('capture-recoverable', [withCheck(me.Pl + ' capturen ' + pieceShort(mv.captured) + '; ' + them.pl + ' '
                            + piecePronoun(mv.captured) + ' poden recuperar.'), withCheck(me.Pl + ' capturen ' + pieceShort(mv.captured) + ', que ' + them.pl + ' poden recuperar.')], { key: 'recov:' + c.ply, reliability: 'analysis' });
                    }
                }
            }
            const d = describeMove(mv, true);
            add('capture', d.variants, { family: d.family, key: 'capture:' + c.ply, reliability: 'rules' });
        }

        // 11) Amenaça concreta de la peça que ha mogut (atacada ≠ guanyada).
        let movedExposed = false;
        if (H && after && moved) {
            const oppAttackers = attackersAt(H, after.grid, mv.to, opp);
            const myDefenders = attackersAt(H, after.grid, mv.to, color);
            movedExposed = oppAttackers.length > 0 && moved.t !== 'k'
                && (myDefenders.length === 0 || oppAttackers.some(a => PIECE_VALUE[a.t] < movedValue));
        }
        if (!isCheck && !c.end && H && after && moved && !movedExposed) {
            // El rei només «amenaça» peces sense defensa (no en pot capturar cap
            // de defensada); la resta de peces, també les de més valor.
            const threats = targetsFrom(H, after.grid, mv.to)
                .map(sq => ({ sq: sq, p: gridAt(after.grid, sq) }))
                .filter(t => t.p && t.p.c === opp && t.p.t !== 'k')
                .map(t => Object.assign(t, { defended: attackersAt(H, after.grid, t.sq, opp).length > 0 }))
                .filter(t => mv.piece === 'k' ? (!t.defended && PIECE_VALUE[t.p.t] >= 3) : ((PIECE_VALUE[t.p.t] > movedValue) || (!t.defended && PIECE_VALUE[t.p.t] >= 3)))
                .filter(t => legalCaptureExists(c.ChessCtor, c.fenAfter, mv.to, t.sq))
                .sort((a, b) => PIECE_VALUE[b.p.t] - PIECE_VALUE[a.p.t]);
            const payload = threats.slice(0, 2).map(t => ({ attackerSq: mv.to, attackerType: moved.t, attackerColor: color, targetSq: t.sq, targetType: t.p.t, mode: t.defended ? 'value' : 'loose' }));
            if (threats.length >= 2) {
                add('fork', ['Forquilla ' + delPiece(moved.t) + ': ataca alhora ' + pieceShort(threats[0].p.t) + ' i ' + pieceShort(threats[1].p.t) + '.',
                    'Atac doble a ' + mv.to + ': ' + shortOn(threats[0].p.t, threats[0].sq) + ' i ' + shortOn(threats[1].p.t, threats[1].sq) + ' queden sota atac.',
                    capFirst(pieceNP(moved.t, color)) + ' fa una forquilla contra ' + pieceShort(threats[0].p.t) + ' i ' + pieceShort(threats[1].p.t) + '.'],
                { key: 'fork:' + color + ':' + threats[0].sq + '+' + threats[1].sq, sig: mv.to,
                  define: { term: 'fork', text: 'Una sola peça crea dues amenaces alhora.' },
                  payload: { threats: payload, tactic: tacticData('fork', after.grid, color, mv.to, threats.slice(0, 2).map(t => t.sq)) },
                  tags: { color: color, squares: [mv.to, threats[0].sq, threats[1].sq] } });
            } else if (!threats.length) {
                // Peó sense defensa a l'abast (fet; si es guanya ho dirà l'anàlisi).
                const pawns = targetsFrom(H, after.grid, mv.to)
                    .filter(sq => { const p = gridAt(after.grid, sq); return p && p.c === opp && p.t === 'p' && !attackersAt(H, after.grid, sq, opp).length; })
                    .filter(sq => legalCaptureExists(c.ChessCtor, c.fenAfter, mv.to, sq));
                if (pawns.length && mv.piece !== 'p' && mv.piece !== 'k') {
                    add('threat-pawn', [capFirst(pieceNP(moved.t, color)) + ' ataca el peó ' + deSq(pawns[0]) + ', que no està defensat.',
                        'El peó ' + COLOR[opp].adj + ' ' + deSq(pawns[0]) + ' queda atacat i sense defensa.'],
                    { key: 'threat:' + color + ':' + pawns[0], sig: mv.to + '>' + pawns[0],
                      payload: { threats: [{ attackerSq: mv.to, attackerType: moved.t, attackerColor: color, targetSq: pawns[0], targetType: 'p', mode: 'loose' }] },
                      tags: { color: color, squares: [mv.to, pawns[0]] } });
                }
            } else if (threats.length === 1) {
                const t = threats[0];
                const loose = t.defended ? '' : ', que no està ' + agree(t.p.t, 'defensat', 'defensada');
                const v = [capFirst(pieceNP(moved.t, color)) + ' ataca ' + pieceNP(t.p.t, opp) + loose + '.'];
                if (moved.t !== t.p.t) v.push(capFirst(me.pl) + ' ataquen amb ' + pieceShort(moved.t) + ' ' + shortOn(t.p.t, t.sq) + loose + '.');
                else v.push(capFirst(pieceNP(moved.t, color)) + ' apunta ara a ' + shortOn(t.p.t, t.sq) + loose + '.');
                add('threat', v,
                { key: 'threat:' + color + ':' + t.sq, sig: mv.to + '>' + t.sq, payload: { threats: payload },
                  tags: { color: color, squares: [mv.to, t.sq] } });
            }
        }

        // 12) Atac a la descoberta: una peça que ja era al seu lloc ataca ara
        //     una peça penjada, perquè la que ha mogut li ha obert la línia.
        if (!c.end && H && before && after && !isCheck) {
            const hangBefore = hangingSet(H, before.grid, opp);
            const hangAfter = hangingSet(H, after.grid, opp);
            Object.keys(hangAfter).forEach((sq) => {
                if (hangBefore[sq] || hangAfter[sq].t === 'p') return;
                const attackers = attackersAt(H, after.grid, sq, color).map(a => squareOf(a.file, a.rank));
                const liner = attackers.find(a => a !== mv.to && ['b', 'r', 'q'].indexOf(gridAt(after.grid, a).t) !== -1
                    && attackersAt(H, before.grid, sq, color).every(b => squareOf(b.file, b.rank) !== a));
                const oldLiner = liner && gridAt(before.grid, liner);
                if (!oldLiner || oldLiner.c !== color || oldLiner.t !== gridAt(after.grid, liner).t || !legalCaptureExists(c.ChessCtor, c.fenAfter, liner, sq)) return;
                const lt = gridAt(after.grid, liner).t;
                add('discovered-attack', ['Atac a la descoberta: ' + pieceNP(lt, color) + ' ataca ara ' + shortOn(hangAfter[sq].t, sq) + '.',
                    'En apartar ' + pieceShort(mv.piece) + ', queda oberta la línia ' + delPiece(lt) + ' contra ' + shortOn(hangAfter[sq].t, sq) + '.',
                    capFirst(pieceNP(lt, color)) + ' entra en acció amb un atac a la descoberta sobre ' + shortOn(hangAfter[sq].t, sq) + '.'],
                    { key: 'disc:' + color + ':' + sq, sig: liner,
                      define: { term: 'discovered-attack', text: 'Una peça es mou i destapa l’atac d’una altra.' },
                      payload: { tactic: tacticData('discovered-attack', after.grid, color, liner, [sq]),
                        threats: [{ attackerSq: liner, attackerType: lt, attackerColor: color, targetSq: sq, targetType: hangAfter[sq].t, mode: hangAfter[sq].defended ? 'value' : 'loose' }] },
                      tags: { color: color, squares: [liner, sq] } });
            });
        }

        // Clavades i enfilades NOVES: alineació verificada i captura legal.
        // La clavada absoluta impedeix sortir de la línia, no tot moviment.
        if (!c.end && H && before && after) {
            const signature = t => [t.kind, t.from, t.front, t.back].join(':');
            const oldLines = new Set(lineTactics(c.ChessCtor, c.fenBefore, before.grid, color).map(signature));
            lineTactics(c.ChessCtor, c.fenAfter, after.grid, color).filter(t => !oldLines.has(signature(t))).forEach(t => {
                const attacker = gridAt(after.grid, t.from), front = gridAt(after.grid, t.front), back = gridAt(after.grid, t.back);
                const pinned = shortOn(front.t, t.front), behind = shortOn(back.t, t.back);
                const absolute = back.t === 'k';
                const variants = t.kind === 'pin' ? [
                    'Clavada: ' + pieceNP(attacker.t, color) + ' clava ' + pinned + ' contra ' + behind + '.',
                    capFirst(pinned) + ' queda ' + agree(front.t, 'clavat', 'clavada') + ' contra ' + behind + '.',
                    'Nova clavada ' + delPiece(attacker.t) + ': ' + pinned + ' té ' + behind + ' al darrere.'
                ] : [
                    'Enfilada: ' + pinned + ' està sota atac, amb ' + behind + ' al darrere.',
                    capFirst(pieceNP(attacker.t, color)) + ' crea una enfilada sobre ' + pinned + ' i ' + behind + '.',
                    'Dues peces en línia: ' + pinned + ' rep l’atac i ' + behind + ' queda al darrere.'
                ];
                add(t.kind, variants, { key: signature(t), sig: signature(t),
                    define: t.kind === 'pin'
                        ? { term: absolute ? 'pin-absolute' : 'pin-relative', text: absolute ? 'No pot abandonar la línia i deixar el rei en escac.' : 'Sortir de la línia exposaria una peça més valuosa.' }
                        : { term: 'skewer', text: 'La peça més valuosa és davant de l’altra.' },
                    payload: { tactic: tacticData(t.kind, after.grid, color, t.from, [t.front, t.back], { front: t.front, back: t.back }) },
                    tags: { color: color, squares: [t.from, t.front, t.back] }
                });
            });

            // El defensor capturat havia de poder RECAPTURAR legalment abans.
            // Després de la captura, la víctima continua atacada i sense defensa.
            if (mv.captured) {
                const defenderSq = mv.flags.includes('e') ? mv.to[0] + mv.from[1] : mv.to;
                piecesOf(after.grid, opp).filter(p => PIECE_VALUE[p.t] >= 3 && p.t !== 'k' && p.sq !== mv.to).forEach(p => {
                    const defenders = attackersAt(H, before.grid, p.sq, opp);
                    if (!defenders.some(d => squareOf(d.file, d.rank) === defenderSq) || attackersAt(H, after.grid, p.sq, opp).length) return;
                    const attackers = attackersAt(H, after.grid, p.sq, color).map(a => squareOf(a.file, a.rank))
                        .filter(sq => tacticalCapture(c.ChessCtor, c.fenAfter, color, sq, p.sq));
                    if (!attackers.length) return;
                    const wasDefended = attackersAt(H, before.grid, p.sq, color).some(a => {
                        const capture = applyUci(c.ChessCtor, c.fenBefore, squareOf(a.file, a.rank) + p.sq);
                        return capture && tacticalCapture(c.ChessCtor, capture.fen, opp, defenderSq, p.sq);
                    });
                    if (!wasDefended) return;
                    add('remove-defender', [
                        'Eliminació del defensor: captura ' + pieceShort(mv.captured) + ' i deixa ' + shortOn(p.t, p.sq) + ' sota atac i sense defensa.',
                        capFirst(shortOn(p.t, p.sq)) + ' queda sense defensor: ' + pieceShort(mv.captured) + ' acaba de ser ' + agree(mv.captured, 'capturat', 'capturada') + '.',
                        'La captura elimina el defensor ' + delPiece(p.t) + ': ara ' + shortOn(p.t, p.sq) + ' queda sota atac i sense defensa.'
                    ], { key: 'remove-defender:' + color + ':' + p.sq, sig: mv.to,
                        payload: { tactic: tacticData('remove-defender', after.grid, color, attackers[0], [p.sq]) },
                        tags: { color: color, squares: [mv.to, p.sq, attackers[0]] }
                    });
                });
            }
            tacticalReplies(c, H, after, add);
        }

        // 13) Peces pròpies que queden atacades i sense prou defensa després de
        //     la jugada (fet del tauler). Que es puguin perdre només ho diu
        //     l'anàlisi, si recomana capturar-les.
        if (!c.end && H && before && after) {
            const mineBefore = hangingSet(H, before.grid, color);
            const mineAfter = hangingSet(H, after.grid, color);
            // Una peça que acaba de capturar-ne una d'igual o més valor no està
            // «penjada»: és un canvi normal.
            const isTrade = (sq) => sq === mv.to && mv.captured && PIECE_VALUE[mv.captured] >= movedValue;
            const fresh = Object.keys(mineAfter).filter(sq => !mineBefore[sq] && !(sq === mv.to && mineBefore[mv.from]) && mineAfter[sq].t !== 'p' && !isTrade(sq));
            if (fresh.length) {
                const sq = fresh.sort((a, b) => PIECE_VALUE[mineAfter[b].t] - PIECE_VALUE[mineAfter[a].t])[0];
                const h = mineAfter[sq];
                const at = agree(h.t, 'atacat', 'atacada');
                let variants = h.defended
                    ? [capFirst(pieceOn(h.t, color, sq)) + ' queda ' + at + ' per una peça de menys valor.',
                        'Una peça de menys valor ataca ara ' + pieceOn(h.t, color, sq) + '.',
                        capFirst(pieceOn(h.t, color, sq)) + ' queda a l\'abast d\'una peça de menys valor.']
                    : [capFirst(pieceOn(h.t, color, sq)) + ' queda ' + at + ' i sense defensa.',
                        'Ara ' + pieceOn(h.t, color, sq) + ' està ' + at + ' i ningú no ' + (PIECE_FEMININE[h.t] ? 'la' : 'el') + ' defensa.',
                        me.Pl + ' deixen ' + shortOn(h.t, sq) + ' ' + at + ' i sense defensa.'];
                if (c.after && c.after.reliable && c.after.bestUci) {
                    const pron = PIECE_FEMININE[h.t] ? 'la' : 'lo';
                    const tail = c.after.bestUci.slice(2, 4) === sq ? ' L\'anàlisi recomana a ' + them.pl + ' capturar-' + pron + '.'
                        : ' Tot i així, l\'anàlisi no recomana capturar-' + pron + ' de seguida.';
                    variants = variants.map(v => v + tail);
                }
                add('hanging', variants, { key: 'hang:' + color + ':' + sq, sig: h.defended ? 'd' : 'u', reliability: c.after && c.after.reliable ? 'analysis' : 'board',
                    tags: { color: color, squares: [sq] } });
            }
        }

        // 14) Continuïtat: respostes a amenaces i pressions ja comentades.
        if (memory && H && before && after) {
            (memory.threats || []).forEach((t) => {
                if (t.targetColor === undefined) t.targetColor = other(t.attackerColor);
                if (t.targetColor !== color) return;
                const target = gridAt(after.grid, t.targetSq);
                const attacker = gridAt(after.grid, t.attackerSq);
                if (mv.to === t.attackerSq && mv.captured) {
                    add('reply', [mv.from === t.targetSq
                        ? capFirst(pieceNP(t.targetType, color)) + ' atacada captura la peça que l\'atacava.'.replace('atacada', agree(t.targetType, 'atacat', 'atacada'))
                        : 'La captura elimina la peça que atacava ' + pieceShort(t.targetType) + '.',
                    me.Pl + ' eliminen l\'atacant capturant-lo a ' + mv.to + '.'],
                        { key: 'reply:' + t.targetSq + ':' + c.ply, tags: { color: color, squares: [t.attackerSq, t.targetSq] } });
                } else if (mv.from === t.targetSq) {
                    const stillHit = attacker && attacker.c === t.attackerColor && targetsFrom(H, after.grid, t.attackerSq).indexOf(mv.to) !== -1;
                    if (!stillHit) add('reply', [me.Pl + ' aparten ' + pieceShort(t.targetType) + ' de l\'atac.', capFirst(pieceNP(t.targetType, color)) + ' s\'aparta de l\'atac cap a ' + mv.to + '.'],
                        { key: 'reply:' + t.targetSq + ':' + c.ply, tags: { color: color, squares: [mv.to, t.targetSq] } });
                } else if (target && target.t === t.targetType && attacker && attacker.t === t.attackerType
                    && targetsFrom(H, after.grid, t.attackerSq).indexOf(t.targetSq) === -1) {
                    add('reply', [me.Pl + ' tapen la línia d\'atac sobre ' + shortOn(t.targetType, t.targetSq) + '.'],
                        { key: 'reply:' + t.targetSq + ':' + c.ply, tags: { color: color, squares: [mv.to, t.targetSq] } });
                } else if (t.mode === 'loose' && target && target.t === t.targetType
                    && attackersAt(H, before.grid, t.targetSq, color).length === 0 && attackersAt(H, after.grid, t.targetSq, color).length > 0) {
                    add('reply', [me.Pl + ' defensen ara ' + shortOn(t.targetType, t.targetSq) + '.', 'Ara ' + shortOn(t.targetType, t.targetSq) + ' ja té defensa.'],
                        { key: 'reply:' + t.targetSq + ':' + c.ply, tags: { color: color, squares: [mv.to, t.targetSq] } });
                }
            });
            (memory.pressures || []).forEach((p) => {
                const target = gridAt(after.grid, p.targetSq);
                if (!target || target.t !== p.targetType || target.c === p.color) return;
                const att = attackersAt(H, after.grid, p.targetSq, p.color).length;
                const def = attackersAt(H, after.grid, p.targetSq, target.c).length;
                if (color === target.c && def > p.defenders) {
                    add('reply', [me.Pl + ' reforcen la defensa ' + delPiece(p.targetType) + ' ' + deSq(p.targetSq) + '.', 'Ara ' + shortOn(p.targetType, p.targetSq) + ' té un defensor més.'],
                        { key: 'pdef:' + p.targetSq + ':' + def, tags: { color: color, squares: [p.targetSq] } });
                } else if (mv.captured && att < p.attackers && color === target.c) {
                    add('reply', ['El canvi elimina un dels atacants ' + delPiece(p.targetType) + ' ' + deSq(p.targetSq) + '.'],
                        { key: 'patt:' + p.targetSq + ':' + att, tags: { color: color, squares: [p.targetSq] } });
                }
            });
        }

        // 15) Pressió: la peça que ha mogut s'afegeix als atacants d'una peça
        //     o peó defensat (recompte d'atacants i defensors, sense prometre res).
        if (!c.end && H && before && after && moved && !movedExposed && mv.piece !== 'k') {
            const newly = targetsFrom(H, after.grid, mv.to).filter((sq) => {
                const p = gridAt(after.grid, sq);
                return p && p.c === opp && p.t !== 'k' && attackersAt(H, after.grid, sq, opp).length > 0;
            });
            newly.forEach((sq) => {
                const p = gridAt(after.grid, sq);
                const a = attackersAt(H, after.grid, sq, color).length;
                const aBefore = attackersAt(H, before.grid, sq, color).length;
                const dCount = attackersAt(H, after.grid, sq, opp).length;
                if (a < 2 || a <= aBefore) return;
                const fem = PIECE_FEMININE[p.t];
                add('pressure', [me.Pl + ' pressionen ' + shortOn(p.t, sq) + '.', 'Més pressió sobre ' + shortOn(p.t, sq) + '.'],
                    { key: 'press:' + color + ':' + sq, sig: a + '/' + dCount, payload: { pressure: { color: color, targetSq: sq, targetType: p.t, attackers: a, defenders: dCount } },
                      extra: 'Ara ' + (fem ? 'l\'ataquen ' : 'l\'ataquen ') + numWord(a, true) + ' peces i ' + (fem ? 'la' : 'el') + ' ' + (dCount === 1 ? 'defensa una' : 'defensen ' + numWord(dCount, true)) + '.',
                      tags: { color: color, squares: [sq] } });
            });
        }

        // 16) Defensa nova d'una peça pròpia que estava atacada.
        if (!c.end && H && before && after && moved) {
            targetsFrom(H, after.grid, mv.to).forEach((sq) => {
                const p = gridAt(after.grid, sq);
                if (!p || p.c !== color || p.t === 'k' || sq === mv.to) return;
                const attacked = attackersAt(H, after.grid, sq, opp).length;
                const defBefore = attackersAt(H, before.grid, sq, color).length;
                const defAfter = attackersAt(H, after.grid, sq, color).length;
                if (attacked && defAfter > defBefore && PIECE_VALUE[p.t] <= 5) {
                    add('defend', [capFirst(pieceNP(moved.t, color)) + ' defensa ' + shortOn(p.t, sq) + ', que estava ' + agree(p.t, 'atacat', 'atacada') + '.', me.Pl + ' protegeixen ' + shortOn(p.t, sq) + '.'],
                        { key: 'defend:' + color + ':' + sq, sig: attacked + '/' + defAfter, tags: { color: color, squares: [sq] } });
                }
            });
        }

        // 17) Columnes obertes i semiobertes, torres doblades i setena fila.
        if (H && after && moved && (moved.t === 'r' || moved.t === 'q') && !isCastle) {
            const f = 'abcdefgh'.indexOf(mv.to[0]);
            const fc = fileCounts(after.grid, f);
            const changedFile = mv.from[0] !== mv.to[0];
            if (changedFile && fc[color] === 0) {
                const open = fc[opp] === 0;
                const name = pieceNP(moved.t, color);
                add('open-file', open
                    ? [capFirst(name) + ' ocupa la columna ' + mv.to[0] + ', que està oberta.', capFirst(me.pl) + ' prenen la columna ' + mv.to[0] + ' oberta amb ' + pieceShort(moved.t) + '.']
                    : [capFirst(name) + ' s\'instal·la a la columna ' + mv.to[0] + ', semioberta.', capFirst(me.pl) + ' situen ' + pieceShort(moved.t) + ' a la columna ' + mv.to[0] + ', sense peons propis.'],
                { key: 'file:' + color + ':' + mv.to[0], sig: moved.t + (open ? 'o' : 's'),
                  define: open ? { term: 'open-file', text: 'Una columna oberta no té cap peó, i les torres hi poden actuar de punta a punta.' }
                      : { term: 'semi-file', text: 'Semioberta vol dir sense peons propis: la peça hi pot pressionar el peó contrari.' },
                  tags: { color: color, squares: [mv.to] }, payload: { plan: { piece: moved.t, sq: mv.to } } });
            }
            const heavies = piecesOf(after.grid, color).filter(p => (p.t === 'r' || p.t === 'q') && p.sq[0] === mv.to[0]);
            const heaviesBefore = piecesOf(before.grid, color).filter(p => (p.t === 'r' || p.t === 'q') && p.sq[0] === mv.to[0]);
            if (heavies.filter(p => p.t === 'r').length >= 2 && heaviesBefore.filter(p => p.t === 'r').length < 2) {
                add('doubled-rooks', [me.Pl + ' dupliquen les torres a la columna ' + mv.to[0] + '.', 'Torres doblades de ' + me.pl + ' a la columna ' + mv.to[0] + '.'],
                    { key: 'dbl:' + color + ':' + mv.to[0] });
            }
            const seventh = color === 'w' ? '7' : '2';
            if (moved.t === 'r' && mv.to[1] === seventh && mv.from[1] !== seventh) {
                const hitsPawns = targetsFrom(H, after.grid, mv.to).filter(sq => { const p = gridAt(after.grid, sq); return p && p.c === opp && p.t === 'p'; }).length;
                add('seventh', [capFirst(pieceNP('r', color)) + ' entra a la fila ' + seventh + (hitsPawns ? ', on ataca peons de ' + them.pl + '.' : '.')],
                    { key: 'seventh:' + color });
            }
        }

        // 18) Diagonals: peó que obre o tanca la diagonal d'un alfil propi,
        //     i fianchetto.
        if (H && before && after && mv.piece === 'p' && !mv.captured) {
            piecesOf(after.grid, color, 'b').forEach((b) => {
                const mobB = targetsFrom(H, before.grid, b.sq).length;
                const mobA = targetsFrom(H, after.grid, b.sq).length;
                if (mobA - mobB >= 3) add('diagonal', ['Aquest avanç obre la diagonal de l\'alfil ' + deSq(b.sq) + '.', 'L\'alfil ' + deSq(b.sq) + ' té ara la diagonal oberta gràcies a aquest peó.'], { key: 'diag:' + b.sq, sig: 'o' + mobA });
                else if (mobB - mobA >= 3) add('diagonal', ['Aquest peó tanca la diagonal del propi alfil ' + deSq(b.sq) + '.'], { key: 'diag:' + b.sq, sig: 'c' + mobA });
            });
        }
        if (mv.piece === 'b' && ['b2', 'g2', 'b7', 'g7'].indexOf(mv.to) !== -1 && after) {
            const pawnSq = mv.to[0] + (color === 'w' ? '3' : '6');
            const p = gridAt(after.grid, pawnSq);
            if (p && p.c === color && p.t === 'p') {
                add('diagonal', ['Fianchetto: l\'alfil ' + me.adj + ' s\'instal·la a la gran diagonal.', 'L\'alfil ' + me.adj + ' es col·loca en fianchetto a ' + mv.to + '.'],
                    { key: 'fianchetto:' + color + ':' + mv.to, define: { term: 'fianchetto', text: 'La gran diagonal és la més llarga del tauler, d\'una cantonada a l\'altra.' } });
            }
        }

        // 19) Centre: ocupació amb peons i control de caselles centrals (no als
        //     finals, on el que compta és l'activitat del rei i dels peons).
        if (H && before && after && moved && !c.end && !isPhaseEndgame(c.fenAfter)) {
            const pawnCtrl = mv.piece === 'p' && CENTER_SQUARES.indexOf(mv.to) === -1
                ? targetsFrom(H, after.grid, mv.to).filter(sq => CENTER_SQUARES.indexOf(sq) !== -1) : [];
            if (pawnCtrl.length && !mv.captured) {
                add('center', ['El peó ' + me.adj + ' ' + deSq(mv.to) + ' controla la casella central ' + pawnCtrl[0] + '.', 'Amb aquest peó, ' + me.pl + ' vigilen la casella central ' + pawnCtrl[0] + '.'],
                    { key: 'center-pawnctrl:' + color + ':' + mv.to, define: { term: 'center', text: 'Les caselles centrals, d4, e4, d5 i e5, donen espai i mobilitat a les peces.' } });
            }
            if (mv.piece === 'p' && CENTER_SQUARES.indexOf(mv.to) !== -1) {
                add('center', [me.Pl + ' ocupen el centre amb el peó ' + deSq(mv.to) + '.', 'Peó ' + me.adj + ' al centre, a ' + mv.to + '.'],
                    { key: 'center-pawn:' + color + ':' + mv.to,
                      define: { term: 'center', text: 'Les caselles centrals, d4, e4, d5 i e5, donen espai i mobilitat a les peces.' } });
            } else if ((mv.piece === 'n' || mv.piece === 'b') && HOME_SQUARES[color][mv.from] !== mv.piece) {
                // (Si la peça surt de casa, el control del centre va dins del
                // comentari de desenvolupament.)
                const ctrl = targetsFrom(H, after.grid, mv.to).filter(sq => CENTER_SQUARES.indexOf(sq) !== -1);
                const ctrlBefore = targetsFrom(H, before.grid, mv.from).filter(sq => CENTER_SQUARES.indexOf(sq) !== -1);
                if (ctrl.length >= 2 && ctrl.length > ctrlBefore.length) {
                    const R = getRedactor();
                    const list = R && R.llistaEnCatala ? R.llistaEnCatala(ctrl) : ctrl.join(' i ');
                    add('center', [capFirst(pieceNP(moved.t, color)) + ' controla ara les caselles centrals ' + list + '.'],
                        { key: 'center-ctrl:' + color + ':' + mv.to, sig: ctrl.join(','), define: { term: 'center', text: 'Les caselles centrals, d4, e4, d5 i e5, donen espai i mobilitat a les peces.' } });
                }
            }
        }

        // 20) Estructura de peons: peons passats, doblats i aïllats nous.
        if (before && after) {
            ['w', 'b'].forEach((side) => {
                const sb = pawnStructure(before.grid, side);
                const sa = pawnStructure(after.grid, side);
                const S = COLOR[side];
                sa.passed.forEach((sq) => {
                    if (sb.passed.has(sq)) return;
                    if (side === color && mv.piece === 'p' && mv.from && sb.passed.has(mv.from) && sq === mv.to) {
                        const left = side === 'w' ? 8 - parseInt(sq[1], 10) : parseInt(sq[1], 10) - 1;
                        const rest = left === 1 ? 'una casella' : numWord(left, true) + ' caselles';
                        if (left >= 1) add('passed-advance', ['El peó passat ' + S.adj + ' avança fins a ' + sq + ': li ' + (left === 1 ? 'falta ' : 'falten ') + rest + ' per coronar.',
                            'Un pas més del peó passat ' + S.adj + ', que arriba a ' + sq + ': ' + (left === 1 ? 'queda ' : 'queden ') + rest + ' fins a coronar.',
                            S.Pl + ' empenyen el peó passat fins a ' + sq + '; ' + (left === 1 ? 'en falta una' : 'en falten ' + numWord(left, true)) + ' per coronar.'],
                            { key: 'passed:' + side + ':' + sq[0], sig: sq, tags: { color: side, squares: [sq] } });
                        return;
                    }
                    add('passed-new', [S.Pl + ' tenen un peó passat a ' + sq + '.', 'Apareix un peó passat ' + S.adj + ' a ' + sq + '.'],
                        { key: 'passed:' + side + ':' + sq[0], sig: sq, tags: { color: side, squares: [sq] },
                          define: { term: 'passed', text: 'Un peó passat no té cap peó contrari al davant ni a les columnes del costat que l\'aturi.' } });
                });
                sa.doubled.forEach((file) => {
                    if (sb.doubled.has(file)) return;
                    add('structure', [S.Pl + ' queden amb peons doblats a la columna ' + file + '.'],
                        { key: 'doubled:' + side + ':' + file, define: { term: 'doubled', text: 'Dos peons a la mateixa columna es tapen l\'un a l\'altre i costen més de defensar.' }, tags: { color: side, squares: [] } });
                });
                sa.isolated.forEach((sq) => {
                    if (sb.isolated.has(sq) || (side === color && sq === mv.to && sb.isolated.has(mv.from))) return;
                    if (sa.passed.has(sq) && !sb.passed.has(sq)) return;
                    add('structure', ['El peó ' + S.adj + ' ' + deSq(sq) + ' queda aïllat.', S.Pl + ' tenen ara un peó aïllat a ' + sq + '.'],
                        { key: 'isolated:' + side + ':' + sq, define: { term: 'isolated', text: 'Un peó aïllat no té peons propis a les columnes del costat que el puguin defensar.' }, tags: { color: side, squares: [sq] } });
                });
            });
        }

        // 21) Material: canvi de dames, balanç després dels canvis i final.
        if (before && after) {
            const mb = materialOf(before.grid);
            const ma = materialOf(after.grid);
            const queensBefore = mb.w.q + mb.b.q;
            const queensAfter = ma.w.q + ma.b.q;
            if (queensBefore > 0 && queensAfter === 0) {
                add('queens-off', ['Ja no queden dames al tauler.', 'S\'han canviat les dames.'], { key: 'queens-off',
                    define: { term: 'queens-off', text: 'Sense dames, els reis corren menys perill d\'atac.' } });
            }
            // El balanç només es diu quan la captura no es pot recuperar de seguida.
            const sigNow = materialSig(ma);
            // Canvi encara obert: el rival pot recuperar a la casella, té una
            // peça penjada per capturar o l'anàlisi recomana una captura.
            const recapturable = mv.captured && H && attackersAt(H, after.grid, mv.to, opp).length > 0;
            const pendingCapture = (H && (Object.keys(hangingSet(H, after.grid, color)).length > 0 || Object.keys(hangingSet(H, after.grid, opp)).length > 0))
                || (c.after && c.after.reliable && c.after.bestUci && !!gridAt(after.grid, c.after.bestUci.slice(2, 4)));
            if (memory && sigNow !== memory.materialSig && !recapturable && !pendingCapture && (mv.captured || (c.prevMove && c.prevMove.captured))) {
                const ph = materialPhrase(ma);
                add('material', ph ? ['Després dels canvis, ' + COLOR[ph.leader].pl + ' tenen ' + ph.desc + '.', 'Balanç de material: ' + COLOR[ph.leader].pl + ' tenen ' + ph.desc + '.']
                    : ['Després dels canvis, el material torna a estar igualat.', 'Material igualat després dels canvis.'],
                { key: 'material', sig: sigNow, payload: { materialSig: sigNow }, reliability: 'rules' });
            }
            if (memory && !memory.endgame && isPhaseEndgame(c.fenAfter) && !isPhaseEndgame(c.fenBefore)) {
                const wList = pieceListPhrase(ma, 'w');
                const bList = pieceListPhrase(ma, 'b');
                add('endgame', wList === 'només peons' && bList === 'només peons'
                    ? ['Entrem en un final de reis i peons.']
                    : ['Entrem en el final: ' + wList + ' de les blanques contra ' + bList + ' de les negres.'],
                { key: 'endgame', payload: { endgame: true },
                  define: { term: 'endgame', text: 'En el final, el rei deixa d\'amagar-se i passa a ser una peça activa.' } });
            }
        }

        // 22) Rei actiu al final.
        if (mv.piece === 'k' && !isCastle && after && isPhaseEndgame(c.fenAfter)) {
            const passedAll = [].concat(Array.from(pawnStructure(after.grid, 'w').passed), Array.from(pawnStructure(after.grid, 'b').passed));
            const near = passedAll.find(sq => chebyshev(mv.to, sq) < chebyshev(mv.from, sq) && chebyshev(mv.to, sq) <= 2);
            if (near) {
                add('king-activity', ['El rei ' + me.adj + ' s\'acosta al peó passat ' + deSq(near) + '.'], { key: 'kact:' + color + ':' + near, sig: mv.to });
            } else if (centerDistance(mv.to) < centerDistance(mv.from)) {
                add('king-activity', ['El rei ' + me.adj + ' s\'acosta al centre.', 'El rei ' + me.adj + ' s\'activa cap al centre.'],
                    { key: 'kact:' + color + ':center', sig: mv.to,
                      define: { term: 'endgame', text: 'En el final, el rei deixa d\'amagar-se i passa a ser una peça activa.' } });
            }
        }

        // 22b) Finals: oposició, rei i peons passats, rei contra els peons.
        if (mv.piece === 'k' && !isCastle && before && after && isPhaseEndgame(c.fenAfter)) {
            const oppKing = kingSq(after.grid, opp);
            const onlyPawns = ['n', 'b', 'r', 'q'].every(t => !piecesOf(after.grid, 'w', t).length && !piecesOf(after.grid, 'b', t).length);
            if (oppKing && onlyPawns) {
                const a = fileRank(mv.to), b = fileRank(oppKing);
                const facing = (a.file === b.file && Math.abs(a.rank - b.rank) === 2) || (a.rank === b.rank && Math.abs(a.file - b.file) === 2);
                if (facing) add('opposition', ['Els reis queden cara a cara: ' + me.pl + ' prenen l\'oposició.', capFirst(me.pl) + ' prenen l\'oposició: ara el rei ' + COLOR[opp].adj + ' ha de cedir.'],
                    { key: 'opp:' + color + ':' + mv.to, define: { term: 'opposition', text: 'Amb l\'oposició, el rei contrari ha de moure i cedir el pas.' }, tags: { color: color, squares: [mv.to, oppKing] } });
            }
            const enemyPassed = Array.from(pawnStructure(after.grid, opp).passed);
            enemyPassed.forEach((sq) => {
                const promo = sq[0] + (opp === 'w' ? '8' : '1');
                const front = sq[0] + (parseInt(sq[1], 10) + (opp === 'w' ? 1 : -1));
                if (mv.to === front) {
                    add('king-activity', ['El rei ' + me.adj + ' es col·loca davant del peó passat ' + deSq(sq) + '.', 'El rei ' + me.adj + ' bloqueja el peó passat ' + deSq(sq) + '.'],
                        { key: 'kblock:' + color + ':' + sq, sig: mv.to, tags: { color: color, squares: [sq] } });
                } else if (chebyshev(mv.to, promo) < chebyshev(mv.from, promo) && chebyshev(mv.to, promo) <= 3) {
                    add('king-activity', ['El rei ' + me.adj + ' s\'acosta a ' + promo + ', la casella de coronació del peó passat ' + deSq(sq) + '.'],
                        { key: 'kpromo:' + color + ':' + sq, sig: mv.to, tags: { color: color, squares: [sq, promo] } });
                }
            });
            Array.from(pawnStructure(after.grid, color).passed).forEach((sq) => {
                if (chebyshev(mv.to, sq) === 1 && chebyshev(mv.from, sq) > 1) {
                    add('king-activity', ['El rei ' + me.adj + ' acompanya el seu peó passat ' + deSq(sq) + '.'], { key: 'kescort:' + color + ':' + sq, sig: mv.to, tags: { color: color, squares: [sq] } });
                }
            });
            const enemyPawns = piecesOf(after.grid, opp, 'p').map(p => p.sq);
            const nearest = (from) => Math.min.apply(null, enemyPawns.map(sq => chebyshev(from, sq)).concat([99]));
            if (enemyPawns.length && nearest(mv.to) < nearest(mv.from) && nearest(mv.to) <= 2) {
                add('king-activity', ['El rei ' + me.adj + ' s\'acosta als peons de ' + them.pl + '.', 'El rei ' + me.adj + ' va a buscar els peons de ' + them.pl + '.'],
                    { key: 'kpawns:' + color, sig: mv.to });
            }
        }

        // 22c) Peons: majoria en un flanc, peó bloquejat i contacte de peons.
        if (mv.piece === 'p' && before && after && H) {
            const fileIdx = 'abcdefgh'.indexOf(mv.to[0]);
            const flankFiles = fileIdx <= 3 ? [0, 1, 2, 3] : [4, 5, 6, 7];
            const countOn = (side) => piecesOf(after.grid, side, 'p').filter(p => flankFiles.indexOf('abcdefgh'.indexOf(p.sq[0])) !== -1).length;
            const flank = fileIdx <= 3 ? 'de dama' : 'de rei';
            if (!mv.captured && countOn(color) > countOn(opp) && countOn(color) >= 2 && (isPhaseEndgame(c.fenAfter) || (memory && memory.queensOff))) {
                add('majority', [me.Pl + ' fan avançar la majoria de peons del flanc ' + flank + '.', 'Al flanc ' + flank + ', ' + me.pl + ' tenen més peons i els avancen.'],
                    { key: 'major:' + color + ':' + flank, sig: mv.to, define: { term: 'majority', text: 'Una majoria de peons en un flanc pot acabar creant un peó passat.' } });
            }
            const ahead = mv.to[0] + (parseInt(mv.to[1], 10) + (color === 'w' ? 1 : -1));
            const blocker = gridAt(after.grid, ahead);
            const Cph = getCore();
            const inOpening = !!(Cph && Cph.phaseFromFen && Cph.phaseFromFen(c.fenAfter) === 'opening');
            if (blocker && blocker.c === opp && !inOpening) {
                add('blocked', ['El peó ' + me.adj + ' ' + deSq(mv.to) + ' queda bloquejat ' + perNP(pieceOn(blocker.t, opp, ahead)) + '.', 'El peó ' + me.adj + ' ja no pot avançar: ' + pieceOn(blocker.t, opp, ahead) + ' li barra el pas.'],
                    { key: 'blocked:' + mv.to, tags: { color: color, squares: [mv.to, ahead] } });
            }
            const contacts = targetsFrom(H, after.grid, mv.to).filter(sq => { const q = gridAt(after.grid, sq); return q && q.c === opp && q.t === 'p'; });
            if (contacts.length && !mv.captured) {
                add('tension', ['Els peons entren en contacte: el peó ' + me.adj + ' ' + deSq(mv.to) + ' pot capturar a ' + contacts[0] + '.', 'Contacte de peons: el peó ' + deSq(mv.to) + ' i el peó ' + deSq(contacts[0]) + ' es poden capturar.'],
                    { key: 'tension:' + mv.to + ':' + contacts[0], tags: { color: color, squares: [mv.to, contacts[0]] } });
            }
        }

        // 22d) Peça que apunta a la zona del rei contrari (caselles veïnes atacades).
        if (moved && before && after && H && ['q', 'r', 'b', 'n'].indexOf(moved.t) !== -1 && !isCheck && !movedExposed) {
            const ks = kingSq(after.grid, opp);
            if (ks) {
                const zone = (grid, from) => targetsFrom(H, grid, from).filter(sq => chebyshev(sq, ks) <= 1).length;
                const nowZ = zone(after.grid, mv.to);
                const thenZ = zone(before.grid, mv.from);
                if (nowZ >= 2 && nowZ > thenZ) {
                    add('king-pressure', [capFirst(pieceNP(moved.t, color)) + ' apunta a la zona del rei ' + COLOR[opp].adj + '.', capFirst(pieceNP(moved.t, color)) + ' s\'acosta al rei ' + COLOR[opp].adj + ': controla caselles del seu voltant.'],
                        { key: 'kzone:' + color + ':' + moved.t + ':' + mv.to, tags: { color: color, squares: [mv.to, ks] } });
                }
            }
        }

        // 22e) Peça que s'instal·la al centre.
        if (moved && ['n', 'b', 'q'].indexOf(moved.t) !== -1 && CENTER_SQUARES.indexOf(mv.to) !== -1 && !movedExposed && !mv.captured && !isPhaseEndgame(c.fenAfter)) {
            add('center', [capFirst(pieceNP(moved.t, color)) + ' s\'instal·la al centre, a ' + mv.to + '.', capFirst(me.pl) + ' centralitzen ' + pieceShort(moved.t) + ' a ' + mv.to + '.'],
                { key: 'center-piece:' + color + ':' + mv.to });
        }

        // 23) Desenvolupament i activació de peces.
        if (!mv.captured && before && after && HOME_SQUARES[color][mv.from] === mv.piece) {
            const dev = developedMinors(after.grid, color);
            const ctrl = H ? targetsFrom(H, after.grid, mv.to).filter(sq => CENTER_SQUARES.indexOf(sq) !== -1) : [];
            const R = getRedactor();
            const ctrlTxt = ctrl.length >= 2 ? ', que controla les caselles centrals ' + (R && R.llistaEnCatala ? R.llistaEnCatala(ctrl) : ctrl.join(' i ')) : '';
            const variants = [me.Pl + ' desenvolupen ' + pieceShort(mv.piece) + ' cap a ' + mv.to + ctrlTxt + '.',
                me.Pl + ' treuen ' + pieceShort(mv.piece) + ' a ' + mv.to + ctrlTxt + '.',
                'Una altra peça en joc: ' + pieceNP(mv.piece, color) + ' a ' + mv.to + ctrlTxt + '.'];
            const extra = dev.atHome === 0 ? 'Ja tenen totes les peces menors fora de casa.'
                : (dev.out >= 2 ? 'Ja en tenen ' + numWord(dev.out, true) + ' de les quatre peces menors en joc.' : null);
            add('development', variants, { key: 'dev:' + color + ':' + mv.from, extra: extra,
                define: { term: 'development', text: 'Desenvolupar és treure les peces de la casella inicial perquè participin en el joc.' } });
        }
        if (mv.piece === 'q' && mv.from === (color === 'w' ? 'd1' : 'd8')) {
            add('activation', ['La dama ' + me.adjF + ' surt per primera vegada.', 'Primera jugada de la dama ' + me.adjF + ', que va a ' + mv.to + '.'], { key: 'qout:' + color });
        }
        if (mv.piece === 'r' && !isCastle && ['a1', 'h1', 'a8', 'h8'].indexOf(mv.from) !== -1) {
            add('activation', ['La torre ' + me.adjF + ' entra en joc des ' + deSq(mv.from) + '.', 'La torre ' + me.adjF + ' deixa la cantonada i va a ' + mv.to + '.'], { key: 'rout:' + color + ':' + mv.from });
        }

        // 24) Descripció factual (sempre disponible).
        if (!mv.captured) {
            const d = describeMove(mv, true);
            add('describe', d.variants, { family: d.family, key: 'describe:' + c.ply, reliability: 'rules' });
        }

        // Continuació possible segons l'anàlisi per a les idees de pla: la
        // mateixa peça torna a jugar a la variant principal (i es presenta
        // només com a possibilitat).
        if (reliable && c.after.pv && c.after.pv.length >= 2) {
            const nextMine = c.after.pv[1];
            if (nextMine && nextMine.slice(0, 2) === mv.to) {
                const afterReply = applyUci(c.ChessCtor, c.fenAfter, c.after.pv[0]);
                const accio = afterReply ? moveAction(c.ChessCtor, afterReply.fen, nextMine) : null;
                if (accio) out.filter(x => ['open-file', 'seventh', 'pressure', 'passed-advance', 'passed-new', 'king-activity', 'center', 'development'].indexOf(x.kind) !== -1 && !x.extra)
                    .forEach((x) => { x.extra = 'Una continuació possible, segons l\'anàlisi: ' + accio + '.'; });
            }
        }

        out.sort((a, b) => b.priority - a.priority);
        return out;
    }

    function wordCount(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }

    // Tria el comentari segons importància, fiabilitat, novetat, relació amb
    // el que s'estava explicant i nivell de l'espectador. Retorna null quan
    // l'únic que es podria dir és una descripció que faria monòton el relat.
    // info = { ply, color, tier, prepared }
    function tvSelectComment(candidates, memory, info) {
        const list = Array.isArray(candidates) ? candidates : [];
        const mem = memory || tvEmptyMemory();
        const o = info || {};
        const ply = isNum(o.ply) ? o.ply : 0;
        const recentTexts = new Set((mem.texts || []).filter(t => ply - t.ply < TV_CONFIG.TEXT_MEMORY_PLIES).map(t => t.text));
        const focus = new Set(mem.focus || []);
        let best = null;
        let bestScore = -Infinity;
        list.forEach((cand) => {
            let score = cand.priority;
            let evolved = false;
            const idea = cand.key ? mem.ideas[cand.key] : null;
            if (idea && ply - idea.ply < TV_CONFIG.IDEA_MEMORY_PLIES) {
                // La mateixa idea en el mateix estat no aporta res de nou.
                if (idea.sig === cand.sig) { if (cand.priority < 90) return; score -= 40; }
                else { evolved = true; score -= 4; }
            }
            const variants = cand.variants.filter(v => !recentTexts.has(v));
            if (!variants.length) return;
            if (cand.reliability === 'analysis') score += 2;
            if (cand.tags && cand.tags.squares && cand.tags.squares.some(sq => focus.has(sq))) score += 6;
            // Nivell: per a l'espectador avançat, el desenvolupament i el centre
            // són obvis; per al bàsic, les pressions numèriques pesen menys.
            if (o.tier === 'advanced' && (cand.kind === 'development' || cand.kind === 'center')) score -= 20;
            if (o.tier === 'basic' && cand.kind === 'pressure') score -= 6;
            if (score > bestScore) { bestScore = score; best = { cand: cand, variants: variants, evolved: evolved }; }
        });
        if (!best) return null;
        const cand = best.cand;
        // Monotonia: després de dues descripcions seguides, o just després
        // d'una explicació llarga, una jugada tranquil·la passa en silenci.
        if (cand.kind === 'describe' && (mem.plainStreak >= 2 || mem.lastExtendedPly === ply - 1)) return null;

        // Variant que no s'hagi fet servir fa poc en aquesta família.
        const recent = ((mem.templates && mem.templates[cand.family]) || []).slice(0, Math.max(0, cand.variants.length - 1));
        const start = ply % best.variants.length;
        let text = best.variants[start];
        for (let i = 0; i < best.variants.length; i++) {
            const v = best.variants[(start + i) % best.variants.length];
            const id = cand.variants.indexOf(v);
            if (recent.indexOf(id) === -1) { text = v; break; }
        }
        // Si la jugada captura o fa escac i el comentari triat només n'explica
        // la conseqüència, primer es diu què ha passat.
        let leadFact = null;
        let leadFamily = null;
        if (LEAD_WITH_FACT.indexOf(cand.kind) !== -1 && !(cand.kind === 'reply' && /captur/.test(text))) {
            const checkFact = cand.kind === 'fork-check' ? null : list.find(x => x.kind === 'check' && x.family !== 'check-discovered');
            const fact = checkFact || list.find(x => x.kind === 'capture');
            if (fact && fact !== cand && wordCount(fact.text) + wordCount(text) <= TV_CONFIG.LEAD_MAX_WORDS) {
                const recentFact = ((mem.templates && mem.templates[fact.family]) || []).slice(0, Math.max(0, fact.variants.length - 1));
                const startF = ply % fact.variants.length;
                const order = fact.variants.map((v, i) => (startF + i) % fact.variants.length);
                const pickF = order.find(i => recentFact.indexOf(i) === -1 && !recentTexts.has(fact.variants[i]));
                leadFact = fact.variants[pickF !== undefined ? pickF : startF];
                leadFamily = fact.family;
                // Dues frases seguides no han de començar igual («Les blanques…
                // Les blanques…»): es tria una variant del comentari amb un altre inici.
                const opening = (t) => t.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
                if (opening(leadFact) === opening(text)) {
                    const alt = best.variants.find(v => opening(v) !== opening(leadFact));
                    if (alt) text = alt;
                    else {
                        const altFact = fact.variants.find(v => opening(v) !== opening(text));
                        if (altFact) leadFact = altFact;
                    }
                }
            }
        }
        const variantId = cand.variants.indexOf(text);
        const parts = leadFact ? [leadFact, text] : [text];
        // Si la jugada fa escac i el comentari no ho diu, s'afegeix a la frase.
        if (o.isCheck && !parts.some(p => /escac/i.test(p))) parts[0] = parts[0].replace(/\.$/, ', amb escac.');
        let extended = !!leadFact;
        const canExtend = !leadFact && mem.lastExtendedPly < ply - TV_CONFIG.EXTENDED_GAP_PLIES;
        // Definició bàsica: una sola vegada per partida i només si cal.
        if (canExtend && cand.define && o.tier !== 'advanced' && !mem.defined[cand.define.term] && !best.evolved) {
            parts.push(cand.define.text);
            extended = true;
        } else if (canExtend && cand.extra && !best.evolved && o.tier !== 'basic') {
            parts.push(cand.extra);
            extended = true;
        }
        // Explicació ampliada: un fet de captura o una descripció es completa
        // amb una conseqüència estratègica nova i comprovada (estructura,
        // material, columnes...), si cap en poques paraules.
        let secondary = null;
        if (!extended && canExtend && ['capture', 'recapture', 'describe', 'check', 'castle', 'capture-free', 'development'].indexOf(cand.kind) !== -1) {
            secondary = list.find((x) => x !== cand && x.explanatory && x.priority >= 50 && x.priority < 70 && x.family !== cand.family
                && ['recapture', 'capture-free', 'capture-recoverable'].indexOf(x.kind) === -1
                && !(mem.ideas[x.key] && mem.ideas[x.key].sig === x.sig && ply - mem.ideas[x.key].ply < TV_CONFIG.IDEA_MEMORY_PLIES)
                && !recentTexts.has(x.text) && wordCount(text) + wordCount(x.text) <= TV_CONFIG.EXTENDED_MAX_WORDS);
            if (secondary) { parts.push(secondary.text); extended = true; }
        }
        return {
            kind: cand.kind, text: parts.join(' '), leadText: text, explanatory: cand.explanatory || !!secondary,
            key: cand.key, sig: cand.sig, family: cand.family, variantId: variantId, extended: extended,
            defined: (parts.length > 1 && cand.define && parts[1] === cand.define.text) ? cand.define.term : null,
            tags: cand.tags, payload: cand.payload, evolved: best.evolved,
            lead: leadFact ? { family: leadFamily, text: leadFact } : null,
            secondary: secondary ? { key: secondary.key, sig: secondary.sig, kind: secondary.kind, payload: secondary.payload } : null
        };
    }

    // Compatibilitat: la selecció antiga rebia l'historial de comentaris.
    function tvChooseComment(candidates, history, ply, color, tier) {
        const mem = tvEmptyMemory();
        (Array.isArray(history) ? history : []).forEach((h) => {
            mem.texts.push({ text: h.text, ply: h.ply });
            if (h.key) mem.ideas[h.key] = { ply: h.ply, sig: h.sig };
        });
        return tvSelectComment(candidates, mem, { ply: ply, color: color, tier: tier });
    }

    // Revalida les idees obertes amb la posició nova: les amenaces que ja no
    // existeixen i les pressions que s'han desfet surten de la memòria.
    function reviseMemory(mem, H, grid) {
        if (!H || !grid) return;
        mem.threats = (mem.threats || []).filter((t) => {
            const a = gridAt(grid, t.attackerSq);
            const tg = gridAt(grid, t.targetSq);
            if (!a || !tg || a.t !== t.attackerType || a.c !== t.attackerColor || tg.t !== t.targetType || tg.c === t.attackerColor) return false;
            if (targetsFrom(H, grid, t.attackerSq).indexOf(t.targetSq) === -1) return false;
            if (t.mode === 'loose' && attackersAt(H, grid, t.targetSq, tg.c).length > 0) return false;
            return true;
        });
        mem.pressures = (mem.pressures || []).map((p) => {
            const tg = gridAt(grid, p.targetSq);
            if (!tg || tg.t !== p.targetType || tg.c === p.color) return null;
            const attackers = attackersAt(H, grid, p.targetSq, p.color).length;
            if (attackers < 2) return null;
            return Object.assign({}, p, { attackers: attackers, defenders: attackersAt(H, grid, p.targetSq, tg.c).length });
        }).filter(Boolean);
    }

    // Desa a la memòria el comentari fet (o el silenci) i revalida les idees.
    function tvCommitComment(memory, chosen, info) {
        const mem = cloneMemory(memory);
        const o = info || {};
        const ply = isNum(o.ply) ? o.ply : 0;
        const H = boardHelpers();
        const grid = (H && o.fenAfter) ? H.parse(o.fenAfter).grid : null;
        if (o.move && (o.move.flags.indexOf('k') !== -1 || o.move.flags.indexOf('q') !== -1)) mem.castled[o.move.color] = true;
        if (grid) {
            const ma = materialOf(grid);
            if (ma.w.q + ma.b.q === 0) mem.queensOff = true;
            if (isPhaseEndgame(o.fenAfter)) mem.endgame = true;
        }
        const applyPayload = (payload) => {
            if (!payload) return;
            if (payload.tactic) {
                mem.tactics = (mem.tactics || []).concat(Object.assign({ ply: ply }, payload.tactic));
            }
            if (payload.threats) payload.threats.forEach(t => mem.threats.push(Object.assign({ ply: ply, targetColor: other(t.attackerColor) }, t)));
            if (payload.pressure) {
                mem.pressures = mem.pressures.filter(p => p.targetSq !== payload.pressure.targetSq);
                mem.pressures.push(Object.assign({ ply: ply }, payload.pressure));
            }
            if (payload.materialSig) mem.materialSig = payload.materialSig;
        };
        if (chosen) {
            if (chosen.key) mem.ideas[chosen.key] = { ply: ply, sig: chosen.sig };
            if (chosen.secondary && chosen.secondary.key) mem.ideas[chosen.secondary.key] = { ply: ply, sig: chosen.secondary.sig };
            mem.texts.push({ text: chosen.leadText || chosen.text, ply: ply });
            mem.templates[chosen.family] = [chosen.variantId].concat(mem.templates[chosen.family] || []).slice(0, 2);
            if (chosen.lead && chosen.lead.family) {
                const fam = chosen.lead.family;
                const cand = (info && info.candidates) ? info.candidates.find(x => x.family === fam) : null;
                const id = cand ? cand.variants.indexOf(chosen.lead.text) : -1;
                if (id >= 0) mem.templates[fam] = [id].concat(mem.templates[fam] || []).slice(0, 2);
            }
            mem.plainStreak = chosen.kind === 'describe' || chosen.kind === 'capture' ? mem.plainStreak + 1 : 0;
            if (chosen.extended) mem.lastExtendedPly = ply;
            if (chosen.defined) mem.defined[chosen.defined] = true;
            if (chosen.kind === 'summary') { mem.lastSummaryPly = ply; mem.summarySig = chosen.sig; }
            mem.lastCommentPly = ply;
            mem.focus = (chosen.tags && chosen.tags.squares) ? chosen.tags.squares.slice(0, 3) : [];
            applyPayload(chosen.payload);
            if (chosen.secondary) applyPayload(chosen.secondary.payload);
        } else {
            mem.plainStreak = 0;
        }
        mem.texts = mem.texts.filter(t => ply - t.ply < TV_CONFIG.TEXT_MEMORY_PLIES);
        mem.tactics = (mem.tactics || []).filter(t => ply - t.ply < 2);
        Object.keys(mem.ideas).forEach((k) => { if (ply - mem.ideas[k].ply >= TV_CONFIG.IDEA_MEMORY_PLIES * 2) delete mem.ideas[k]; });
        reviseMemory(mem, H, grid);
        return mem;
    }

    // Bandes de valoració (punt de vista blanc) per al resum.
    function tvEvalBand(scoreW) {
        if (!scoreW || scoreW.type !== 'cp' || !isNum(scoreW.value)) return null;
        const v = scoreW.value;
        const a = Math.abs(v);
        const side = v > 0 ? 'w' : 'b';
        if (a < 60) return 'equal';
        if (a < 150) return side + '-slight';
        if (a < 350) return side + '-clear';
        return side + '-decisive';
    }

    // Resum estratègic (cada 4-6 jugades completes, només si aporta res de
    // nou): material, valoració fiable, seguretat del rei i peons passats.
    function tvStrategicSummary(ctx, memory) {
        const c = ctx || {};
        const mem = memory || tvEmptyMemory();
        const H = boardHelpers();
        if (!H) return null;
        const grid = H.parse(c.fenAfter).grid;
        const ma = materialOf(grid);
        const mp = materialPhrase(ma);
        const parts = [];
        const sigParts = [];
        parts.push(mp ? COLOR[mp.leader].pl + ' tenen ' + mp.desc : 'el material està igualat');
        sigParts.push(materialSig(ma));
        const band = c.after && c.after.reliable ? tvEvalBand(c.after.best) : null;
        if (band) {
            const who = band[0] === 'w' ? 'les blanques' : 'les negres';
            const pawns = c.tier === 'advanced' ? ' (uns ' + (Math.round(Math.abs(c.after.best.value) / 10) / 10).toFixed(1).replace('.', ',') + ' peons)' : '';
            const txt = band === 'equal' ? 'segons l\'anàlisi, la posició està equilibrada'
                : band.slice(2) === 'slight' ? 'segons l\'anàlisi, ' + who + ' estan una mica millor' + pawns
                    : band.slice(2) === 'clear' ? 'segons l\'anàlisi, ' + who + ' tenen un avantatge clar' + pawns
                        : 'segons l\'anàlisi, ' + who + ' tenen una posició guanyadora' + pawns;
            parts.push(txt);
        }
        sigParts.push(band || '-');
        const second = [];
        if (!mem.endgame && c.ply < 50) {
            const kw = mem.castled.w, kb = mem.castled.b;
            if (kw !== kb) second.push((kw ? 'les blanques' : 'les negres') + ' ja han enrocat i ' + (kw ? 'les negres' : 'les blanques') + ' encara tenen el rei al centre');
            sigParts.push((kw ? 'W' : '-') + (kb ? 'B' : '-'));
        }
        ['w', 'b'].forEach((side) => {
            const passed = Array.from(pawnStructure(grid, side).passed).sort();
            if (passed.length) second.push(COLOR[side].pl + ' tenen ' + (passed.length === 1 ? 'un peó passat a ' + passed[0] : numWord(passed.length) + ' peons passats'));
            sigParts.push(side + passed.join(''));
        });
        // La novetat es mesura pel CONTINGUT redactat (no per l'encapçalament ni
        // per detalls que no es diuen, com la casella exacta dels peons passats).
        const sig = parts.join('|') + '#' + second.slice(0, 2).join('|');
        if (sig === mem.summarySig) return null;
        // «Material igualat» tot sol no és cap novetat.
        if (!mp && !band && !second.length) return null;
        const intros = ['Balanç de la partida: ', 'Com està la partida: ', 'Situació de la partida: '];
        let text = intros[Math.floor((c.ply || 0) / TV_CONFIG.SUMMARY_EVERY_PLIES) % intros.length] + parts.join(', i ') + '.';
        if (second.length) text += ' ' + capFirst(second.slice(0, 2).join('; ')) + '.';
        return { kind: 'summary', text: text, leadText: text, explanatory: true, key: 'summary', sig: sig, family: 'summary', variantId: 0,
            extended: second.length > 0 || parts.length > 1, defined: null, tags: { color: null, squares: [] }, payload: null, evolved: false, secondary: null };
    }

    // Un pas complet de la retransmissió: candidats, selecció, resum
    // periòdic i memòria nova. El fan servir el controlador i les proves, de
    // manera que la cobertura que es mesura és la que veu l'espectador.
    function tvBroadcastStep(ctx) {
        const c = ctx || {};
        const memory = cloneMemory(c.memory);
        const candidates = tvCommentCandidates(Object.assign({}, c, { memory: memory }));
        let chosen = tvSelectComment(candidates, memory, { ply: c.ply, color: c.move && c.move.color, tier: c.tier, prepared: c.prepared,
            isCheck: !!(c.move && /\+$/.test(c.move.san) && !c.end) });
        const urgent = chosen && KIND_PRIORITY[chosen.kind] >= 70;
        const mvq = c.move || {};
        const quiet = !mvq.captured && !/[+#]/.test(mvq.san || '') && !mvq.promotion && (mvq.flags || '').indexOf('k') === -1 && (mvq.flags || '').indexOf('q') === -1;
        if (!urgent && quiet && !c.prepared && !c.end && isNum(c.ply) && c.ply - memory.lastSummaryPly >= TV_CONFIG.SUMMARY_EVERY_PLIES) {
            // El resum SUBSTITUEIX el comentari ordinari d'aquesta jugada.
            const summary = tvStrategicSummary(c, memory);
            if (summary) chosen = summary;
        }
        const next = tvCommitComment(memory, chosen, { ply: c.ply, fenAfter: c.fenAfter, move: c.move, candidates: candidates });
        return { comment: chosen, memory: next, candidates: candidates };
    }

    // Repassa una partida sencera amb el mateix pas de retransmissió (per a
    // les proves de cobertura i per revisar seqüències de comentaris).
    // spec = { startFen, moves:[uci], analyses:[{fen,bestUci,infos}], prepared, tier }
    function tvSimulateCommentary(ChessCtor, spec) {
        const s = spec || {};
        const chess = s.startFen ? new ChessCtor(s.startFen) : new ChessCtor();
        let memory = tvEmptyMemory();
        if (isNum(s.lastSummaryPly)) memory.lastSummaryPly = s.lastSummaryPly;
        let prevMove = null;
        const rows = [];
        const analysisAt = (i) => {
            const a = s.analyses && s.analyses[i];
            return a ? tvBuildAnalysis(a.fen, a.infos, a.bestUci) : null;
        };
        (s.moves || []).forEach((uci, i) => {
            const fenBefore = chess.fen();
            const mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            if (!mv) return;
            const prepared = i < (s.prepared || 0);
            const step = tvBroadcastStep({
                ChessCtor: ChessCtor, fenBefore: fenBefore, fenAfter: chess.fen(), move: mv, prevMove: prevMove,
                before: prepared ? null : analysisAt(i), after: prepared ? null : analysisAt(i + 1),
                tier: s.tier || 'mid', prepared: prepared, phrase: s.phrases ? s.phrases[i] : null, end: tvGameEnd(chess), ply: i, memory: memory
            });
            memory = step.memory;
            rows.push({ ply: i, san: mv.san, color: mv.color, fen: chess.fen(), comment: step.comment ? step.comment.text : null,
                kind: step.comment ? step.comment.kind : null, explanatory: !!(step.comment && step.comment.explanatory), extended: !!(step.comment && step.comment.extended),
                key: step.comment ? step.comment.key : null, payload: step.comment ? step.comment.payload : null, speech: step.comment ? tvSpeechText(step.comment.text) : null,
                candidates: step.candidates.map(x => x.kind) });
            prevMove = mv;
        });
        return rows;
    }

    function tvCommentaryStats(rows) {
        const n = rows.length;
        const commented = rows.filter(r => r.comment);
        const explanatory = commented.filter(r => r.explanatory);
        const kinds = {};
        commented.forEach((r) => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
        let maxSilence = 0, run = 0;
        rows.forEach((r) => { run = r.comment ? 0 : run + 1; maxSilence = Math.max(maxSilence, run); });
        const words = commented.map(r => wordCount(r.comment));
        return {
            plies: n, commented: commented.length, coverage: n ? commented.length / n : 0,
            explanatory: explanatory.length, explanatoryRatio: n ? explanatory.length / n : 0,
            explanatoryShare: commented.length ? explanatory.length / commented.length : 0,
            distinctTexts: new Set(commented.map(r => r.comment)).size, maxSilence: maxSilence, kinds: kinds,
            avgWords: words.length ? words.reduce((a, b) => a + b, 0) / words.length : 0,
            longComments: commented.filter(r => r.extended).length
        };
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
        const redactor = getRedactor();
        let t = redactor ? redactor.corregirCatala(text) : String(text || '');
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
    //         clearTimeout, loadPref(), savePref(v), onChange(),
    //         neural (veuneural.js), getNeuralVoiceId(), getNeuralRate() }
    // Si el perfil de veu per defecte de la Configuració és una veu neuronal
    // Matxa, es fa servir aquesta; si falla (sense xarxa, servei aturat), es
    // torna a la veu catalana del dispositiu i, si tampoc n'hi ha, només text.
    function createTvVoice(env) {
        const e = env || {};
        const synth = e.speechSynthesis || null;
        const Utter = e.SpeechSynthesisUtterance || null;
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        const neural = e.neural || null;
        const neuralId = () => {
            try { return (neural && typeof e.getNeuralVoiceId === 'function') ? (e.getNeuralVoiceId() || null) : null; } catch (err) { return null; }
        };
        const neuralRate = () => { try { return typeof e.getNeuralRate === 'function' ? e.getNeuralRate() : 1; } catch (err) { return 1; } };
        const neuralEffects = () => { try { return typeof e.getNeuralEffects === 'function' ? e.getNeuralEffects() : null; } catch (err) { return null; } };
        const neuralReady = () => !!(neuralId() && neural.available());
        const synthSupported = !!(synth && typeof synth.speak === 'function' && typeof Utter === 'function');
        const supported = synthSupported || !!neural;
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
            if (!synthSupported) return;
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
            emit();
        }

        let speakSeq = 0;
        function stop() {
            speakSeq++;
            const entry = current;
            if (entry) finish(entry, false, 'stopped');
            if (neural) { try { neural.stop(); } catch (err) {} }
            if (synthSupported) { try { synth.cancel(); } catch (err) {} }
        }

        function speak(text, opts) {
            const o = opts || {};
            if (!supported) return Promise.resolve({ spoken: false, reason: 'unsupported' });
            if (pref !== 'on') return Promise.resolve({ spoken: false, reason: 'off' });
            if (!text) return Promise.resolve({ spoken: false, reason: 'empty' });
            // Una sola locució viva: la nova substitueix l'anterior.
            stop();
            const seq = speakSeq;
            if (neuralReady()) {
                return neural.speak(text, neuralId(), { rate: neuralRate(), effects: neuralEffects(), maxWaitMs: (isNum(o.maxWaitMs) ? o.maxWaitMs : tvSpeechMaxWaitMs(text)) + 9000 })
                    .then((r) => {
                        if (r && (r.spoken || r.reason === 'stopped' || seq !== speakSeq)) return r;
                        if (r && r.reason === 'not-allowed') { blocked = true; emit(); return r; }
                        emit();
                        // La veu neuronal ha fallat: veu del dispositiu, si n'hi ha.
                        return voice ? speakSystem(text, o) : { spoken: false, reason: 'neural-failed' };
                    });
            }
            if (!voice) return Promise.resolve({ spoken: false, reason: 'no-voice' });
            return speakSystem(text, o);
        }

        function speakSystem(text, o) {
            if (!synthSupported || !voice) return Promise.resolve({ spoken: false, reason: 'no-voice' });
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
                emit();
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
                if (blocked) return 'blocked';
                if (neuralReady()) return 'ready';
                if (!voice) return (!synthSupported || voicesSeen || voicesSettled) ? 'no-voice' : 'loading';
                return 'ready';
            },
            // Quina veu sonarà ara: 'neural', 'system' o null.
            engine() { return current ? 'system' : (neuralReady() ? 'neural' : (voice ? 'system' : null)); },
            // La veu neuronal triada no està disponible (sense xarxa o servei aturat).
            neuralUnavailable() { return !!(neuralId() && !neural.available()); },
            prefetch(text) { if (pref === 'on' && text && neuralReady()) neural.prefetch(text, neuralId(), { rate: neuralRate() }); },
            pref() { return pref; },
            isOn() { return pref === 'on'; },
            needsActivation() { return pref === null; },
            voiceName() {
                if (!current && neuralReady()) {
                    const V = root && root.ElTaulerVeuNeural;
                    return (V && V.voiceLabel(neuralId())) || 'Matxa';
                }
                return voice ? (voice.name || voice.lang) : null;
            },
            isSpeaking() { return !!current || !!(neural && neural.isSpeaking()); },
            setOn(on) {
                pref = on ? 'on' : 'off';
                if (on && neuralId() && neural.unlock) neural.unlock();
                if (typeof e.savePref === 'function') { try { e.savePref(pref); } catch (err) {} }
                if (!on) stop();
                blocked = false;
                emit();
            },
            refreshVoices: refreshVoices,
            unlock() { if (neuralId() && neural.unlock) neural.unlock(); },
            speak: speak,
            stop: stop
        };

        if (synthSupported) {
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
            movePreview: null,
            error: null,
            loopRunning: false,
            // Control manual: { color } del bàndol que mou l'usuari (l'altre el
            // juga el motor). null: Stockfish juga els dos bàndols.
            control: null,
            // La jugada de l'usuari ja és al tauler i se n'està preparant el comentari.
            pendingUser: false
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
            S.pendingUser = false;
            S.movePreview = null;
        }

        function userTurn(g) { return !!(S.control && g && !g.end && g.chess.turn() === S.control.color); }

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
                movePreview: S.movePreview ? Object.assign({}, S.movePreview) : null,
                nextLevel: next.value,
                control: S.control && g ? {
                    color: S.control.color,
                    yourTurn: userTurn(g) && !S.pendingUser,
                    analyzing: S.pendingUser,
                    thinking: !g.end && (S.pendingUser || !userTurn(g))
                } : null,
                canUndo: !!(g && g.moves.length && !S.error),
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
            S.control = null;
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
                memory: tvEmptyMemory(),
                comment: null,
                intro: null,
                end: null,
                nextGameAt: null
            };
            if (d.engine) d.engine.newGame();
            S.nextRevealAt = now() + TV_CONFIG.INTRO_DELAY_MS;
            if (pick.opening) {
                const intro = 'Obertura de partida: ' + pick.opening.name + '.' + (pick.opening.idea ? ' ' + pick.opening.idea : '');
                S.game.comment = { kind: 'intro', text: intro, speech: tvSpeechText(intro), ply: 0, gameId: S.game.id };
                S.game.intro = S.game.comment;
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
            // Amb control manual, el motor només juga el bàndol que no és de l'usuari.
            while (alive(epoch) && S.game === g && !g.end && !userTurn(g)) {
                const ply = g.moves.length;
                const fenBefore = g.chess.fen();
                const prepared = preparedAt(g, ply);
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
                // Una posició acabada (mat, ofegat, material insuficient) no
                // s'analitza: aquest motor no respon a «go» en aquests casos i el
                // worker quedaria penjat fins al temporitzador de seguretat.
                let finished = false;
                try { finished = new d.ChessCtor(applied.fen).game_over(); } catch (err) { finished = false; }
                if (!prepared && !finished) {
                    after = await analyze(g, afterUci, ply + 1, applied.fen, epoch);
                    if (!alive(epoch) || S.game !== g) return;
                }
                // El comentari es decideix ARA (no depèn de res que passi durant
                // l'espera) i així la veu es pot preparar mentre es veu la jugada
                // anterior: quan surti la jugada, l'àudio ja hi és.
                const plan = planMove(g, uci, fenBefore, prepared, before, after);
                if (!plan) { fail('illegal'); return; }
                if (plan.chosen && d.voice && typeof d.voice.prefetch === 'function') d.voice.prefetch(tvSpeechText(plan.chosen.text));

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
                const piece = g.chess.get(uci.slice(0, 2));
                S.movePreview = { from: uci.slice(0, 2), piece: piece.type, color: piece.color };
                render();
                if (!(await sleep(TV_CONFIG.MOVE_PREVIEW_MS, epoch))) return;
                if (!alive(epoch) || S.game !== g || g.chess.fen() !== fenBefore) return;
                S.movePreview = null;
                reveal(g, uci, prepared, plan, epoch);
            }
            if (alive(epoch) && S.game === g && g.end && !S.control) scheduleNextGame(g, epoch);
        }

        // La línia preparada només val mentre la partida la segueix: si l'usuari
        // n'ha sortit (o s'hi ha tornat a entrar tirant enrere), mana el motor.
        function preparedAt(g, ply) {
            if (ply >= g.prepared.length) return null;
            for (let i = 0; i < ply; i++) if (g.uci[i] !== g.prepared[i].uci) return null;
            return g.prepared[ply];
        }

        // Calcula la jugada i el seu comentari sense tocar la partida visible
        // (sobre una còpia amb tot l'historial, per a la repetició i els finals).
        function planMove(g, uci, fenBefore, prepared, before, after) {
            const ply = g.moves.length;
            const prevMove = ply ? g.moves[ply - 1].verbose : null;
            const copy = new d.ChessCtor();
            for (const u of g.uci) {
                if (!copy.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : 'q' })) return null;
            }
            const mv = copy.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            if (!mv) return null;
            const fenAfter = copy.fen();
            const end = tvGameEnd(copy);
            // La memòria de la retransmissió només s'actualitza quan la jugada
            // es mostra de debò (reveal): si una pausa descarta aquest pla, la
            // memòria visible continua intacta.
            const step = tvBroadcastStep({
                ChessCtor: d.ChessCtor, fenBefore: fenBefore, fenAfter: fenAfter, move: mv, prevMove: prevMove,
                before: before, after: after, tier: g.tier, prepared: !!prepared, phrase: prepared ? prepared.phrase : null,
                end: end, ply: ply, memory: g.memory
            });
            return { ply: ply, fenAfter: fenAfter, end: end, chosen: step.comment, memory: step.memory };
        }

        function reveal(g, uci, prepared, plan, epoch) {
            const entry = commitMove(g, uci, prepared, plan, false);
            if (!entry) return;
            const shownAt = now();
            let delay = tvMoveDelayMs(prefs.speed, { tier: g.tier, prepared: !!prepared, random: random() });
            if (g.comment) delay = Math.max(delay, tvReadingTimeMs(g.comment.text, g.tier));
            S.nextRevealAt = shownAt + delay;
            notify('move', { gameId: g.id, move: entry, comment: g.comment });
            if (g.comment) notify('comment', g.comment);
            render();
            if (g.comment) S.speech = speakComment(g.comment, epoch);
        }

        // Aplica la jugada a la partida visible i desa el que cal per desfer-la.
        function commitMove(g, uci, prepared, plan, byUser) {
            const ply = g.moves.length;
            const fenBefore = g.chess.fen();
            const undo = { fenBefore: fenBefore, memory: g.memory, identified: g.identified };
            const mv = g.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            if (!mv || ply !== plan.ply) { fail('illegal'); return null; }
            const fenAfter = g.chess.fen();
            g.uci.push(uci);
            const entry = { ply: ply, san: mv.san, uci: uci, color: mv.color, from: mv.from, to: mv.to, prepared: !!prepared, fen: fenAfter, verbose: mv,
                byUser: !!byUser, commentObj: null, undo: undo };
            g.moves.push(entry);
            if (!g.identified || ply < 30) g.identified = identifyOpening(g) || g.identified;
            g.end = plan.end;
            g.comment = null;
            g.memory = plan.memory;
            if (plan.chosen) attachComment(g, entry, plan.chosen);
            return entry;
        }

        function attachComment(g, entry, chosen) {
            // El comentari queda LLIGAT a aquesta posició (partida + ply + FEN).
            g.comment = { kind: chosen.kind, text: chosen.text, speech: tvSpeechText(chosen.text), ply: entry.ply, fen: entry.fen, gameId: g.id,
                explanatory: !!chosen.explanatory, extended: !!chosen.extended, byUser: entry.byUser };
            g.comments.push({ ply: entry.ply, kind: chosen.kind, text: chosen.text, color: entry.color, key: chosen.key, sig: chosen.sig });
            entry.comment = chosen.text;
            entry.commentObj = g.comment;
        }

        // Jugada de l'usuari: surt al tauler a l'instant i el comentari arriba
        // quan l'anàlisi (sense límit) ha valorat la posició d'abans i la d'ara.
        // Després, si la partida continua, respon el motor amb l'altre bàndol.
        async function userMoveFlow(g, entry, epoch) {
            const ply = entry.ply;
            const history = g.uci.slice(0, ply);
            const current = () => alive(epoch) && S.game === g && g.moves.length === ply + 1 && g.moves[ply] === entry;
            const before = await analyze(g, history, ply, entry.undo.fenBefore, epoch);
            if (!current()) return;
            const after = g.end ? null : await analyze(g, history.concat([entry.uci]), ply + 1, entry.fen, epoch);
            if (!current()) return;
            const step = tvBroadcastStep({
                ChessCtor: d.ChessCtor, fenBefore: entry.undo.fenBefore, fenAfter: entry.fen, move: entry.verbose,
                prevMove: ply ? g.moves[ply - 1].verbose : null, before: before, after: after, tier: g.tier, prepared: false, phrase: null,
                end: g.end, ply: ply, memory: entry.undo.memory
            });
            S.pendingUser = false;
            g.memory = step.memory;
            let delay = TV_CONFIG.CONTROL_REPLY_DELAY_MS;
            if (step.comment) {
                attachComment(g, entry, step.comment);
                delay = clamp(tvReadingTimeMs(g.comment.text, g.tier), delay, TV_CONFIG.CONTROL_REPLY_MAX_MS);
                notify('comment', g.comment);
            }
            S.nextRevealAt = now() + delay;
            render();
            if (g.comment) S.speech = speakComment(g.comment, epoch);
            if (!g.end) runLoop(epoch);
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

        function rebuildChess(g) {
            const chess = new d.ChessCtor();
            g.uci.forEach(u => chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : 'q' }));
            g.chess = chess;
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
                // Amb control manual no comença cap partida sola: l'usuari pot
                // tirar enrere o tornar el control al motor.
                if (S.control) render(); else scheduleNextGame(g, epoch);
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
                if (S.userPaused || S.control) return;
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
            // Barra de nivell: fixa l'objectiu de la PARTIDA SEGÜENT.
            setNextLevel(value) {
                if (!S.caps) return;
                prefs = tvSetTargetPrefs(S.caps, viewer(), prefs, value);
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
            // Tira enrere l'última semijugada i dona el control a l'usuari: mou
            // el bàndol de la jugada desfeta (es pot repetir fins a l'inici).
            stepBack() {
                const g = S.game;
                if (!S.open || !g || !g.moves.length || S.error) return false;
                halt();
                S.userPaused = false;
                const entry = g.moves.pop();
                g.uci.pop();
                const undone = g.chess.undo();
                if (!undone || g.chess.fen() !== entry.undo.fenBefore) rebuildChess(g);
                g.memory = entry.undo.memory;
                g.identified = entry.undo.identified;
                g.comments = g.comments.filter(c => c.ply < g.moves.length);
                g.end = null;
                g.nextGameAt = null;
                const prev = g.moves[g.moves.length - 1];
                g.comment = prev ? prev.commentObj : g.intro;
                S.control = { color: g.chess.turn() };
                notify('undo', { gameId: g.id, move: entry });
                render();
                return true;
            },
            // L'usuari passa a moure el bàndol que té el torn; l'altre, el motor.
            takeControl() {
                const g = S.game;
                if (!S.open || !g || g.end || S.control || S.error) return false;
                halt();
                S.userPaused = false;
                S.control = { color: g.chess.turn() };
                render();
                return true;
            },
            // Torna els dos bàndols a Stockfish des de la posició actual.
            releaseControl() {
                if (!S.control) return false;
                S.control = null;
                if (S.open && !S.hidden && S.caps && !S.error) resumeLoop(); else { halt(); render(); }
                return true;
            },
            // Jugades legals de la peça de la casella (només al torn de l'usuari).
            userMoves(square) {
                const g = S.game;
                if (!userTurn(g) || S.pendingUser || S.error) return [];
                try { return g.chess.moves({ square: square, verbose: true }); } catch (err) { return []; }
            },
            userMove(from, to, promotion) {
                const g = S.game;
                if (!S.open || !userTurn(g) || S.pendingUser || S.error) return false;
                const legal = api.userMoves(from).filter(m => m.to === to);
                if (!legal.length) return false;
                const promo = legal[0].promotion ? (/^[qrbn]$/.test(promotion || '') ? promotion : 'q') : '';
                const uci = from + to + promo;
                halt();
                const epoch = S.epoch;
                const entry = commitMove(g, uci, null, { ply: g.moves.length, end: null, chosen: null, memory: g.memory }, true);
                if (!entry) return false;
                // Final de partida amb tot l'historial (repetició inclosa).
                g.end = tvGameEnd(g.chess);
                S.pendingUser = true;
                notify('move', { gameId: g.id, move: entry, comment: null });
                render();
                userMoveFlow(g, entry, epoch);
                return true;
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
    let radioAmbience = null;
    let board = null;
    let lastHighlight = null;
    let countdownTimer = null;
    let uiReady = false;
    let expanded = false;
    let nativeFullscreen = false;
    let fullscreenRequest = 0;
    let savedScroll = null;
    // Control manual: peça triada (tocar-tocar), destins legals i jugada
    // arrossegada pendent del final de l'animació.
    let selectedSquare = null;
    let previewHighlight = null;
    let selectedTargets = [];
    let pendingDrop = null;
    let promoPending = null;

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

    let boardObserver = null;
    let boardWidth = 0;
    let boardRenderedWidth = 0;
    function buildBoard() {
        if (board || typeof root.Chessboard !== 'function' || !$id('sftv-board')) return;
        // Les peces només es poden moure amb el control manual i al torn de
        // l'usuari. Amb el mode «Tocar» de l'app no s'arrossega (tocar-tocar).
        const tapOnly = !!(document.body && document.body.classList.contains('control-tap'));
        board = root.Chessboard('sftv-board', {
            position: 'start', draggable: !tapOnly, pieceTheme: PIECE_THEME, moveSpeed: TV_CONFIG.MOVE_ANIMATION_MS,
            onMoveEnd: applyHighlight,
            onDragStart: onBoardDragStart,
            onDrop: onBoardDrop,
            onSnapEnd: onBoardSnapEnd
        });
        boardRenderedWidth = Math.round($id('sftv-board').getBoundingClientRect().width);
        // El tauler es torna a mesurar sempre que canvia l'amplada disponible
        // (p. ex. quan apareix la barra de nivell o es gira el mòbil).
        const wrap = $id('sftv-board') && $id('sftv-board').parentElement;
        if (wrap && typeof root.ResizeObserver === 'function') {
            boardObserver = new root.ResizeObserver((entries) => {
                const w = Math.round(entries[0].contentRect.width);
                if (w && w !== boardWidth) { boardWidth = w; resizeBoard(); }
            });
            boardObserver.observe(wrap);
        }
    }
    function destroyBoard() {
        try { if (boardObserver) boardObserver.disconnect(); } catch (e) {}
        boardObserver = null;
        boardWidth = 0;
        boardRenderedWidth = 0;
        try { if (board && board.destroy) board.destroy(); } catch (e) {}
        board = null;
    }
    function applyHighlight() {
        const el = $id('sftv-board');
        if (!el) return;
        // Conservar les classes si la jugada no canvia: els renders d'estat no
        // han de reiniciar el pols de la peça ni esborrar el destí després d'animar.
        el.querySelectorAll('[data-square]').forEach((sq) => {
            const name = sq.getAttribute('data-square');
            sq.classList.toggle('sftv-from', !previewHighlight && !!lastHighlight && name === lastHighlight.from);
            sq.classList.toggle('sftv-to', !previewHighlight && !!lastHighlight && name === lastHighlight.to);
            sq.classList.toggle('sftv-preview', name === previewHighlight);
            sq.classList.toggle('sftv-sel', name === selectedSquare);
            sq.classList.toggle('sftv-target', selectedTargets.indexOf(name) !== -1);
        });
    }

    // ---- Control manual: moure peces al tauler de la TV ----
    function yourTurnState() {
        const st = controller ? controller.state() : null;
        return st && st.control && st.control.yourTurn ? st : null;
    }
    function clearSelection() {
        if (!selectedSquare && !selectedTargets.length) return;
        selectedSquare = null;
        selectedTargets = [];
        applyHighlight();
    }
    function selectSquare(square) {
        const moves = controller ? controller.userMoves(square) : [];
        if (!moves.length) { clearSelection(); return false; }
        selectedSquare = square;
        selectedTargets = moves.map(m => m.to).filter((sq, i, all) => all.indexOf(sq) === i);
        applyHighlight();
        return true;
    }
    function playUserMove(from, to) {
        const moves = controller ? controller.userMoves(from).filter(m => m.to === to) : [];
        if (!moves.length) return false;
        clearSelection();
        if (moves.some(m => m.promotion)) { askPromotion(from, to); return false; }
        return controller.userMove(from, to);
    }
    function onBoardDragStart(source, piece) {
        const st = yourTurnState();
        if (!st || String(piece).charAt(0) !== st.control.color) return false;
        return selectSquare(source);
    }
    function onBoardDrop(source, target) {
        // Deixar-la a la mateixa casella és un toc: la peça queda triada.
        if (target === source || target === 'offboard') return 'snapback';
        const moves = controller ? controller.userMoves(source).filter(m => m.to === target) : [];
        if (!moves.length) return 'snapback';
        clearSelection();
        if (moves.some(m => m.promotion)) { askPromotion(source, target); return 'snapback'; }
        pendingDrop = { from: source, to: target };
        return undefined;
    }
    function onBoardSnapEnd() {
        const drop = pendingDrop;
        pendingDrop = null;
        if (drop && controller && !controller.userMove(drop.from, drop.to) && board) {
            // Jugada rebutjada (el torn ha canviat): el tauler torna a la partida.
            const st = controller.state();
            if (st.game) board.position(st.game.fen.split(' ')[0], false);
        }
    }
    function onBoardClick(ev) {
        const sqEl = ev.target && ev.target.closest ? ev.target.closest('[data-square]') : null;
        if (!sqEl) return;
        if (!yourTurnState()) { clearSelection(); return; }
        const square = sqEl.getAttribute('data-square');
        if (selectedSquare && selectedTargets.indexOf(square) !== -1) { playUserMove(selectedSquare, square); return; }
        if (!selectSquare(square)) clearSelection();
    }
    const PROMO_PIECES = [['q', 'dama'], ['r', 'torre'], ['b', 'alfil'], ['n', 'cavall']];
    function askPromotion(from, to) {
        const box = $id('sftv-promo');
        const st = yourTurnState();
        if (!st) return;
        if (!box) { controller.userMove(from, to, 'q'); return; }
        promoPending = { from: from, to: to };
        const color = st.control.color;
        box.innerHTML = '<div class="sftv-promo-title">Corona el peó a ' + escapeHtml(to) + ':</div><div class="sftv-promo-row">'
            + PROMO_PIECES.map(p => '<button type="button" class="sftv-promo-piece" data-piece="' + p[0] + '" aria-label="Corona ' + (p[0] === 'q' || p[0] === 'r' ? 'una ' : 'un ') + p[1] + '" title="' + capFirst(p[1]) + '">'
                + '<img src="' + PIECE_THEME.replace('{piece}', color + p[0].toUpperCase()) + '" alt=""></button>').join('')
            + '</div><button type="button" class="sftv-link-btn sftv-promo-cancel" data-piece="">Cancel·la</button>';
        box.style.display = '';
        const first = box.querySelector('.sftv-promo-piece');
        if (first) first.focus({ preventScroll: true });
    }
    function hidePromo() {
        promoPending = null;
        const box = $id('sftv-promo');
        if (box && box.style.display !== 'none') { box.style.display = 'none'; box.innerHTML = ''; }
    }
    function onPromoClick(ev) {
        const button = ev.target && ev.target.closest ? ev.target.closest('button[data-piece]') : null;
        if (!button) return;
        const pending = promoPending;
        const piece = button.getAttribute('data-piece');
        hidePromo();
        if (pending && piece && controller) controller.userMove(pending.from, pending.to, piece);
    }
    function resizeBoard() {
        if (!board || !screenVisible()) return;
        const screen = $id('sftv-screen');
        if (expanded && screen) {
            const layout = screen.querySelector('.sftv-layout');
            const col = screen.querySelector('.sftv-board-col');
            const wrap = screen.querySelector('.sftv-board-wrap');
            const side = screen.querySelector('.sftv-side');
            if (layout && col && wrap && side) {
                const stacked = !root.matchMedia('(min-width: 760px) and (min-aspect-ratio: 4/3)').matches;
                const css = root.getComputedStyle(screen);
                const available = screen.clientHeight - (layout.getBoundingClientRect().top - screen.getBoundingClientRect().top)
                    - parseFloat(css.paddingBottom || 0);
                const chrome = col.getBoundingClientRect().height - wrap.getBoundingClientRect().height;
                const sideHeight = stacked ? side.getBoundingClientRect().height + 12 : 0;
                const size = Math.max(120, Math.floor(Math.min(col.clientWidth, available - chrome - sideHeight - 2)));
                screen.style.setProperty('--sftv-board-size', size + 'px');
            }
        }
        const width = Math.round($id('sftv-board').getBoundingClientRect().width);
        if (width && width !== boardRenderedWidth) {
            try { board.resize(); boardRenderedWidth = width; } catch (e) {}
        }
        applyHighlight();
    }

    function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }

    function setExpanded(value) {
        const screen = $id('sftv-screen');
        if (!screen || expanded === value) return;
        expanded = value;
        if (value) savedScroll = { x: root.scrollX, y: root.scrollY };
        screen.classList.toggle('is-expanded', value);
        document.body.classList.toggle('sftv-expanded', value);
        document.documentElement.classList.toggle('sftv-expanded', value);
        const button = $id('sftv-expand');
        if (button) {
            button.setAttribute('aria-expanded', String(value));
            button.setAttribute('title', value ? 'Torna a la mida normal (Esc)' : 'Amplia el tauler a pantalla completa');
            const label = button.querySelector('span');
            if (label) label.textContent = value ? 'Minimitza' : 'Amplia el tauler';
        }
        if (!value) {
            screen.style.removeProperty('--sftv-board-size');
            if (savedScroll) root.scrollTo(savedScroll.x, savedScroll.y);
            savedScroll = null;
        }
        setTimeout(resizeBoard, 0);
    }

    function exitNativeFullscreen() {
        if (fullscreenElement() !== $id('sftv-screen')) return;
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        try { if (exit) return Promise.resolve(exit.call(document)).catch(() => {}); } catch (e) {}
    }

    function minimizeBoard() {
        fullscreenRequest++;
        exitNativeFullscreen();
        setExpanded(false);
    }

    function toggleExpanded() {
        if (expanded) { minimizeBoard(); return; }
        const screen = $id('sftv-screen');
        if (!screen || !screenVisible()) return;
        setExpanded(true);
        const requestId = ++fullscreenRequest;
        const request = screen.requestFullscreen || screen.webkitRequestFullscreen;
        // Si el navegador no admet pantalla completa, o la denega, el mateix
        // tauler omple la finestra i conserva el botó de minimitzar.
        if (!request || fullscreenElement()) return;
        try {
            Promise.resolve(request.call(screen)).then(() => {
                if (requestId !== fullscreenRequest || !expanded || !screenVisible()) {
                    exitNativeFullscreen();
                    return;
                }
                nativeFullscreen = fullscreenElement() === screen;
                resizeBoard();
            }).catch(() => {});
        } catch (e) {}
    }

    function onFullscreenChange() {
        const ownsFullscreen = fullscreenElement() === $id('sftv-screen');
        if (ownsFullscreen) {
            nativeFullscreen = true;
            if (!expanded || !screenVisible()) exitNativeFullscreen();
        } else if (nativeFullscreen) {
            nativeFullscreen = false;
            setExpanded(false);
            const button = $id('sftv-expand');
            if (button && screenVisible()) button.focus({ preventScroll: true });
        }
        setTimeout(resizeBoard, 0);
    }

    function syncRadioAmbience(unlock = false) {
        const api = root.ElTaulerRadioAmbient;
        if (!api) return;
        const state = controller ? controller.state() : {};
        const matxa = typeof bridge.getNeuralVoiceId === 'function' && bridge.getNeuralVoiceId();
        const effects = typeof bridge.getNeuralEffects === 'function' ? bridge.getNeuralEffects() : null;
        const prefs = api.normalize((loadPrefsRaw() || {}).radioBackground);
        const active = api.canPlay({ matxa, profile: effects && effects.profile,
            voiceOn: voice && voice.isOn(), engine: voice && voice.engine(), blocked: voice && voice.status() === 'blocked',
            open: state.open, paused: state.paused, hidden: state.hidden || document.visibilityState === 'hidden',
            visible: screenVisible(), error: state.error });
        if (!radioAmbience && active && prefs.sound !== 'off' && prefs.volume > 0) radioAmbience = api.createPlayer();
        if (radioAmbience) {
            radioAmbience.update(prefs, active);
            if (unlock && active) radioAmbience.unlock();
        }
        const status = $id('sftv-radio-status');
        if (status) status.textContent = radioAmbience && radioAmbience.status() === 'unavailable'
            ? 'El so de fons no està disponible en aquest navegador. La veu continua funcionant.' : '';
    }

    function renderRadioControls(matxa, profile) {
        const panel = $id('sftv-radio-controls');
        if (!panel) return;
        panel.hidden = !matxa || profile !== 'radio';
        const api = root.ElTaulerRadioAmbient;
        if (!api) return;
        const prefs = api.normalize((loadPrefsRaw() || {}).radioBackground);
        const sound = $id('sftv-radio-sound'), volume = $id('sftv-radio-volume'), label = $id('sftv-radio-volume-value');
        if (sound) sound.value = prefs.sound;
        if (volume) { volume.value = prefs.volume; volume.disabled = prefs.sound === 'off'; }
        if (label) label.textContent = prefs.volume + '%';
    }

    function changeRadioControl(key, value) {
        const api = root.ElTaulerRadioAmbient;
        if (!api) return;
        const prefs = api.normalize((loadPrefsRaw() || {}).radioBackground);
        prefs[key] = key === 'volume' ? Number(value) : value;
        savePrefsRaw({ radioBackground: api.normalize(prefs) });
        renderMatxaControls();
        syncRadioAmbience(true);
    }

    function renderMatxaControls() {
        const panel = $id('sftv-matxa-controls');
        if (!panel) return;
        const selected = typeof bridge.getNeuralVoiceId === 'function' && bridge.getNeuralVoiceId();
        panel.hidden = !selected;
        if (!selected) { renderRadioControls(false, null); return; }
        const effects = typeof bridge.getNeuralEffects === 'function' ? bridge.getNeuralEffects() : null;
        const settings = Object.assign({ profile: 'natural', intensity: 0.6, clarity: 0.5, volume: 1 }, effects || {});
        renderRadioControls(true, settings.profile);
        const profile = $id('sftv-matxa-profile');
        if (profile) profile.value = settings.profile;
        settings.rate = typeof bridge.getNeuralRate === 'function' ? bridge.getNeuralRate() : 1;
        ['intensity', 'clarity', 'volume', 'rate'].forEach(key => {
            const control = $id('sftv-matxa-' + key);
            const value = $id('sftv-matxa-' + key + '-value');
            const percent = Math.round(settings[key] * 100);
            if (control) {
                control.value = percent;
                control.disabled = settings.profile === 'natural' && (key === 'intensity' || key === 'clarity');
            }
            if (value) value.textContent = percent + '%';
        });
        const help = $id('sftv-matxa-help');
        if (help) help.textContent = (settings.profile === 'natural' ? 'Natural no aplica filtres. Tria Càlida o Ràdio per ajustar la intensitat i la claredat. ' : '')
            + 'Els canvis es desen al teu perfil i s’escolten a partir del comentari següent.';
    }

    function changeMatxaControl(key, value) {
        if (typeof bridge.updateNeuralSettings !== 'function') return;
        const changes = key === 'rate' ? { rate: Number(value) / 100 }
            : { effects: { [key]: key === 'profile' ? value : Number(value) / 100 } };
        bridge.updateNeuralSettings(changes);
        renderMatxaControls();
        syncRadioAmbience(true);
    }

    function renderVoice() {
        renderMatxaControls();
        syncRadioAmbience();
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
            else if (status === 'no-voice' && on) {
                text = voice.neuralUnavailable()
                    ? 'La veu neuronal Matxa no respon ara mateix i no hi ha cap veu catalana disponible en aquest dispositiu'
                    : 'No hi ha cap veu catalana disponible en aquest dispositiu';
            } else if (status === 'blocked' && on) text = 'El navegador ha aturat la veu: toca el botó de veu per tornar-la a activar.';
            else if (on && voice.neuralUnavailable() && voice.engine() === 'system') text = 'La veu neuronal Matxa no respon ara mateix: es llegeix amb la veu del dispositiu.';
            else if (on && voice.engine()) {
                text = 'Veu: ' + voice.voiceName() + (voice.engine() === 'neural' ? ' · en línia (BSC). Es canvia a Configuració › Veus de lectura.' : ' · del dispositiu.');
            }
            note.textContent = text;
            note.style.display = text ? '' : 'none';
        }
    }

    function renderLevel(state) {
        const caps = state.caps;
        const g = state.game;
        const levelText = g ? g.level.label.short : '—';
        const mine = (color) => !!(state.control && state.control.color === color);
        const playerLine = (color) => (color === 'w' ? '♔ Blanques' : '♚ Negres') + (mine(color) ? ' · Tu (control manual)' : ' · Stockfish · ' + levelText);
        const pw = $id('sftv-player-white');
        const pb = $id('sftv-player-black');
        if (pw) pw.textContent = playerLine('w');
        if (pb) pb.textContent = playerLine('b');
        pw && pw.classList.toggle('is-turn', !!(g && !g.end && g.turn === 'w'));
        pb && pb.classList.toggle('is-turn', !!(g && !g.end && g.turn === 'b'));
        pw && pw.classList.toggle('is-user', mine('w'));
        pb && pb.classList.toggle('is-user', mine('b'));
        const cur = $id('sftv-level-current');
        const next = $id('sftv-level-next');
        const help = $id('sftv-level-help');
        const easy = $id('sftv-too-easy');
        const hard = $id('sftv-too-hard');
        if (cur) cur.textContent = g ? ('Aquesta partida: ' + g.level.label.long + (caps && caps.mode !== 'none' ? ' (tots dos jugadors)' : '')) : 'Preparant el motor…';
        if (next) {
            const pending = caps && caps.mode !== 'none' && g && state.nextLevel !== null && state.nextLevel !== g.level.value;
            const nextText = $id('sftv-level-next-text');
            if (nextText) nextText.textContent = pending ? 'Partida següent: ' + tvLevelLabel(caps, state.nextLevel).long + '.' : '';
            next.style.display = pending ? '' : 'none';
        }
        renderLadder(state);
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

    let ladderSignature = null;
    function renderLadder(state) {
        const caps = state.caps;
        const ladder = $id('sftv-ladder');
        const range = $id('sftv-level-range');
        const scaleBox = $id('sftv-ladder-scale');
        const value = $id('sftv-ladder-value');
        if (!ladder || !range || !scaleBox) return;
        const scale = tvLevelScale(caps);
        ladder.style.display = scale.length ? '' : 'none';
        if (!scale.length) return;
        const sig = tvCapsSignature(caps);
        if (sig !== ladderSignature) {
            ladderSignature = sig;
            range.min = String(caps.min);
            range.max = String(caps.max);
            range.step = caps.mode === 'elo' ? '50' : '1';
            const every = Math.max(1, Math.round(scale.length / 5));
            scaleBox.innerHTML = scale.map((t, i) => {
                const major = i === 0 || i === scale.length - 1 || i % every === 0;
                const num = caps.mode === 'elo' ? '' : '<span class="sftv-tick-num">' + t.value + '</span>';
                return '<button type="button" tabindex="-1" class="sftv-tick' + (major ? '' : ' is-minor') + '" data-level="' + t.value + '">'
                    + num + '<span class="sftv-tick-elo">≈' + t.elo + '</span></button>';
            }).join('');
        }
        const g = state.game;
        const nextVal = state.nextLevel;
        if (nextVal !== null && document.activeElement !== range) range.value = String(nextVal);
        scaleBox.querySelectorAll('.sftv-tick').forEach((el) => {
            const v = Number(el.getAttribute('data-level'));
            el.classList.toggle('is-current', !!(g && g.level.value === v));
            el.classList.toggle('is-next', v === nextVal);
        });
        range.setAttribute('aria-valuetext', tvLevelLabel(caps, Number(range.value)).long);
        if (value) {
            const shown = Number(range.value);
            value.textContent = 'Següent: ' + tvLevelLabel(caps, shown).short;
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
            const cls = 'sftv-move' + (m.prepared ? ' is-prepared' : '') + (m.byUser ? ' is-user' : '') + (i === g.moves.length - 1 ? ' is-last' : '') + (m.comment ? ' has-comment' : '');
            const title = (m.byUser ? 'Jugada teva' + (m.comment ? ': ' : '') : '') + (m.comment || '');
            html += '<span class="' + cls + '"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + escapeHtml(m.san) + '</span> ';
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
        else if (g.end) text = tvResultHeadline(g.end) + (state.control ? ' · control manual' : '');
        else if (state.control) {
            const ctl = state.control;
            if (ctl.yourTurn) text = 'Et toca: mous ' + COLOR[ctl.color].pl;
            else if (ctl.analyzing) text = 'Analitzant la teva jugada…';
            else text = 'Stockfish pensa la resposta amb ' + COLOR[other(ctl.color)].pl + '…';
        } else {
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
            pauseBtn.disabled = !g || !!state.error || !!state.control;
        }
        renderControl(state);
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

    function renderControl(state) {
        const g = state.game;
        const ctl = state.control;
        const undo = $id('sftv-undo');
        if (undo) undo.disabled = !state.canUndo;
        const button = $id('sftv-control');
        if (button) {
            button.innerHTML = ctl
                ? '<svg class="btn-ic" aria-hidden="true"><use href="#ic-play"/></svg>Torna el control al motor'
                : '<svg class="btn-ic" aria-hidden="true"><use href="#ic-pawn"/></svg>Agafa el control';
            button.classList.toggle('is-active', !!ctl);
            button.setAttribute('aria-pressed', ctl ? 'true' : 'false');
            button.title = ctl ? 'Stockfish torna a jugar els dos bàndols des d\'aquesta posició'
                : 'Mou tu el bàndol que té el torn; Stockfish jugarà l\'altre';
            button.disabled = !g || !!state.error || (!ctl && !!g.end);
        }
        const note = $id('sftv-control-note');
        if (note) {
            let text = '';
            if (ctl && g) {
                const mine = COLOR[ctl.color].pl;
                const tapOnly = !!(document.body && document.body.classList.contains('control-tap'));
                if (g.end) text = 'La partida s\'ha acabat. Pots tirar enrere per provar una altra jugada o tornar el control al motor perquè comenci la partida següent.';
                else if (ctl.yourTurn) {
                    text = 'Control manual: mous ' + mine + '. ' + (tapOnly ? 'Toca una peça i després la casella de destí.' : 'Arrossega una peça, o toca-la i després toca la casella de destí.')
                        + ' Stockfish respon amb ' + COLOR[other(ctl.color)].pl + '.';
                } else text = 'Control manual: mous ' + mine + '. Stockfish respon amb ' + COLOR[other(ctl.color)].pl + '.';
            }
            note.textContent = text;
            note.style.display = text ? '' : 'none';
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
                + '<div class="sftv-result-next">' + (left !== null ? 'La partida següent comença d\'aquí a ' + left + ' s.'
                    : (state.control ? 'Control manual: tira enrere o torna el control al motor.' : (state.paused ? 'En pausa.' : ''))) + '</div>';
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
            const ctl = state.control;
            const screen = $id('sftv-screen');
            if (screen) {
                screen.classList.toggle('is-control', !!ctl);
                screen.classList.toggle('is-your-turn', !!(ctl && ctl.yourTurn));
            }
            if (!ctl || !ctl.yourTurn) {
                selectedSquare = null;
                selectedTargets = [];
                hidePromo();
            }
            if (board && g && !pendingDrop) {
                previewHighlight = state.movePreview ? state.movePreview.from : null;
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
            const caption = $id('sftv-last-move');
            if (caption) {
                const last = g && g.lastMove;
                const mv = last && last.verbose;
                const preview = state.movePreview;
                caption.textContent = preview ? 'Es mourà: ' + pieceNP(preview.piece, preview.color) + ' de ' + preview.from
                    : (last ? (last.byUser ? 'La teva jugada · ' : '') + (mv ? capFirst(pieceNP(mv.promotion || mv.piece, mv.color)) + ': ' : '')
                    + last.from + ' → ' + last.to : 'La peça es marca durant 1,5 segons abans de moure’s');
            }
            if (expanded) resizeBoard();
        }
    };

    function onVisibility() {
        if (!controller) return;
        controller.setHidden(document.visibilityState === 'hidden' || !screenVisible());
        if (radioAmbience) syncRadioAmbience(document.visibilityState !== 'hidden');
    }

    function ensureController() {
        if (controller) return controller;
        if (typeof root.Chess !== 'function') return null;
        voice = createTvVoice({
            speechSynthesis: root.speechSynthesis,
            SpeechSynthesisUtterance: root.SpeechSynthesisUtterance,
            neural: (root.ElTaulerVeuNeural && typeof root.Audio === 'function') ? root.ElTaulerVeuNeural.sharedSpeaker() : null,
            getNeuralVoiceId: () => (typeof bridge.getNeuralVoiceId === 'function' ? bridge.getNeuralVoiceId() : null),
            getNeuralRate: () => (typeof bridge.getNeuralRate === 'function' ? bridge.getNeuralRate() : 1),
            getNeuralEffects: () => (typeof bridge.getNeuralEffects === 'function' ? bridge.getNeuralEffects() : null),
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
        if (voice && voice.isOn()) voice.unlock();
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
        syncRadioAmbience(true);
    }

    // Tanca la pantalla (sense tornar a l'inici): atura motor, temporitzadors i veu.
    function closeScreen() {
        minimizeBoard();
        if (controller) controller.close();
        if (radioAmbience) { radioAmbience.dispose(); radioAmbience = null; }
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
        on('sftv-expand', 'click', toggleExpanded);
        on('btn-back-sftv', 'click', () => {
            // Mateix camí que el gest d'enrere (navGoBack) si l'app el té.
            if (typeof bridge.goBack === 'function') bridge.goBack(); else goHome();
        });
        on('sftv-pause', 'click', () => { if (!controller) return; const st = controller.state(); if (st.paused) controller.resume(); else controller.pause(); syncRadioAmbience(true); });
        on('sftv-new', 'click', () => { if (controller) controller.newGame(); });
        on('sftv-try', 'click', tryPosition);
        on('sftv-undo', 'click', () => { if (controller) controller.stepBack(); });
        on('sftv-control', 'click', () => {
            if (!controller) return;
            if (controller.state().control) controller.releaseControl(); else controller.takeControl();
        });
        on('sftv-board', 'click', onBoardClick);
        on('sftv-promo', 'click', onPromoClick);
        on('sftv-too-easy', 'click', () => { if (controller) controller.adjust('harder'); });
        on('sftv-level-range', 'input', (ev) => { if (controller) controller.setNextLevel(Number(ev.target.value)); });
        on('sftv-level-range', 'change', (ev) => { if (controller) controller.setNextLevel(Number(ev.target.value)); });
        on('sftv-ladder-scale', 'click', (ev) => {
            const tick = ev.target && ev.target.closest ? ev.target.closest('.sftv-tick') : null;
            if (tick && controller) controller.setNextLevel(Number(tick.getAttribute('data-level')));
        });
        on('sftv-level-apply', 'click', () => { if (controller) controller.newGame(); });
        on('sftv-too-hard', 'click', () => { if (controller) controller.adjust('easier'); });
        on('sftv-speed', 'change', (ev) => { if (controller) controller.setSpeed(ev.target.value); });
        on('sftv-matxa-profile', 'change', ev => changeMatxaControl('profile', ev.target.value));
        on('sftv-radio-sound', 'change', ev => changeRadioControl('sound', ev.target.value));
        on('sftv-radio-volume', 'input', ev => changeRadioControl('volume', ev.target.value));
        on('sftv-radio-volume', 'change', ev => changeRadioControl('volume', ev.target.value));
        ['intensity', 'clarity', 'volume', 'rate'].forEach(key => {
            on('sftv-matxa-' + key, 'input', ev => changeMatxaControl(key, ev.target.value));
            on('sftv-matxa-' + key, 'change', ev => changeMatxaControl(key, ev.target.value));
        });
        // Activar la veu és sempre fruit d'un toc de l'usuari (requisit dels
        // navegadors): la primera locució surt dins del mateix gest.
        on('sftv-voice-activate', 'click', () => {
            if (!voice) return;
            voice.setOn(true);
            if (voice.status() === 'ready') voice.speak('Veu activada.');
            renderVoice();
            syncRadioAmbience(true);
        });
        on('sftv-voice-toggle', 'click', () => {
            if (!voice) return;
            const turnOn = !voice.isOn() || voice.status() === 'blocked';
            voice.setOn(turnOn);
            if (turnOn && voice.status() === 'ready') voice.speak('Veu activada.');
            renderVoice();
            syncRadioAmbience(true);
        });
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && promoPending) {
                ev.preventDefault();
                ev.stopPropagation();
                hidePromo();
                return;
            }
            if (ev.key === 'Escape' && expanded) {
                ev.preventDefault();
                ev.stopPropagation();
                minimizeBoard();
                const button = $id('sftv-expand');
                if (button) button.focus({ preventScroll: true });
            }
        }, true);
        root.addEventListener && root.addEventListener('pagehide', () => { if (controller && screenVisible()) controller.setHidden(true); });
        root.addEventListener && root.addEventListener('resize', () => { setTimeout(resizeBoard, 80); });
        if (root.visualViewport) root.visualViewport.addEventListener('resize', () => { setTimeout(resizeBoard, 80); });
    }

    return {
        TV_CONFIG,
        parseUciOptionLine,
        parseUciOptions,
        tvEngineCapabilities,
        tvCompatibilityNote,
        tvLevelLabel,
        tvSkillEloEstimate,
        tvLevelElo,
        tvLevelScale,
        tvSetTargetPrefs,
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
        tvSelectComment,
        tvCommitComment,
        tvEmptyMemory,
        tvBroadcastStep,
        tvStrategicSummary,
        tvEvalBand,
        tvSimulateCommentary,
        tvCommentaryStats,
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
