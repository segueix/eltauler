// ============================================================================
// stockfishtv.js — «Lliga de llegendes TV»: partides amb anàlisi de Stockfish
// ============================================================================
// Cada dispositiu GENERA les seves pròpies partides en temps real (no és cap
// emissió compartida): els 10 jugadors històrics de llegendes.js fan una lliga
// de dues voltes. Cada jugador té el seu motor (Stockfish o Lozza), el seu
// perfil de joc i el seu nivell; una anàlisi independent sense límit de força
// i comentaris breus en català basats en fets verificats (regles amb chess.js
// i anàlisi fiable del motor) expliquen cada partida i en diuen els noms.
//
// Mode heretat: si no es passa el mòdul de llegendes (llegendes.js no s'ha
// carregat), la TV torna al duel Stockfish contra Lozza amb nivells adaptatius.
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
    function getProsodia() {
        if (root && root.ElTaulerProsodia) return root.ElTaulerProsodia;
        try { if (typeof require === 'function') return require('./prosodia'); } catch (e) {}
        return null;
    }
    function tvSpeechDirection(comment) {
        const P = getProsodia();
        return P && typeof P.direction === 'function'
            ? P.direction(comment) : { mood: 'teaching', rate: 1, pitch: 1, pauseMs: 900 };
    }

    function getTvIntro() {
        if (root && root.ElTaulerTvIntro) return root.ElTaulerTvIntro;
        try { if (typeof require === 'function') return require('./tvintro'); } catch (e) {}
        return null;
    }

    // Humanització dinàmica de la lliga (humanitzacio.js): tria entre les
    // jugades candidates de l'anàlisi amb criteri humà. Vegeu HUMANITZACIO.md.
    function getHumanitzacio() {
        if (root && root.ElTaulerHumanitzacio) return root.ElTaulerHumanitzacio;
        try { if (typeof require === 'function') return require('./humanitzacio'); } catch (e) {}
        return null;
    }

    function getArtDeLaGuerra() {
        if (root && root.ElTaulerArtDeLaGuerra) return root.ElTaulerArtDeLaGuerra;
        try { if (typeof require === 'function') return require('./artdelaguerra'); } catch (e) {}
        return null;
    }
    function getEstratagemes() {
        if (root && root.ElTaulerEstratagemes) return root.ElTaulerEstratagemes;
        try { if (typeof require === 'function') return require('./estratagemes'); } catch (e) {}
        return null;
    }

    // Prestatge de llibres (l'Art de la Guerra, les 36 estratagemes…) amb el
    // mateix contracte choose(ctx, memory) que cada llibre. Els llibres
    // s'alternen: primer prova el que no ha parlat l'última vegada i, si no
    // té res per a aquest motiu, l'altre. Entre dues frases, de qualsevol
    // llibre, hi ha com a mínim BOOK_GAP_PLIES semijugades. Cada llibre
    // conserva la seva memòria (frases i famílies recents).
    const BOOK_GAP_PLIES = 7;
    function tvBookshelf(books) {
        const list = (books || []).filter(b => b && typeof b.choose === 'function');
        if (list.length <= 1) return list[0] || null;
        const idOf = (b, i) => b.BOOK_ID || ('llibre' + i);
        return {
            BOOK_ID: 'prestatge',
            books: list,
            choose(ctx, raw) {
                const m = raw && typeof raw === 'object' && raw.shelf === true ? raw
                    : { shelf: true, lastPly: -1000, next: 0, books: {} };
                const ply = ctx && ctx.ply;
                if (Number.isInteger(ply) && ply >= m.lastPly && ply - m.lastPly < BOOK_GAP_PLIES) return { maxim: null, memory: m, reason: 'too-soon' };
                const start = Number.isInteger(m.next) ? m.next : 0;
                for (let k = 0; k < list.length; k++) {
                    const i = (start + k) % list.length;
                    const book = list[i], id = idOf(book, i);
                    const out = book.choose(ctx, m.books && m.books[id]);
                    if (out && out.maxim) {
                        return { maxim: Object.assign({}, out.maxim, { book: id, bookLabel: book.BOOK_LABEL || out.maxim.label || '' }),
                            memory: { shelf: true, lastPly: ply, next: (i + 1) % list.length,
                                books: Object.assign({}, m.books, { [id]: out.memory }) }, reason: null };
                    }
                }
                return { maxim: null, memory: m, reason: 'no-book' };
            }
        };
    }

    // El narrador filosòfic no interpreta FEN ni calcula res. Rep només el
    // motiu escollit, que ha d'existir a la llista de candidats verificats.
    function tvArtStep(ctx, chosen, memory, candidates) {
        const A = ctx && ctx.art;
        if (!A || typeof A.choose !== 'function' || !chosen ||
                !Array.isArray(candidates)) return { comment: chosen, memory };
        if (chosen.dialogue) {
            const art = chosen.dialogueArt;
            if (!art || ctx.prepared || ctx.end) return { comment: chosen, memory };
            const turnIndex = chosen.dialogue.findIndex(turn => turn.role === 'analyst');
            if (turnIndex < 0) return { comment: chosen, memory };
            const turn = chosen.dialogue[turnIndex];
            const available = art.limit - wordCount(tvReadingText(chosen));
            if (available <= 0) return { comment: chosen, memory };
            const analysis = ctx.after;
            if (art.fromPlan && (!analysis || !analysis.reliable || analysis.fen !== ctx.fenAfter ||
                    !Number.isFinite(analysis.depth) || analysis.depth < 12))
                return { comment: chosen, memory };
            const evidence = art.fromPlan ? { source: 'stockfish', reliable: true, depth: analysis.depth }
                : { source: 'rules', reliable: true };
            const output = A.choose({
                gameId: ctx.gameId, ply: ctx.ply, comment: { kind: 'dialogue', text: turn.text },
                dialogueTheme: art.theme, dialogueWords: available, certified: true, evidence
            }, memory.art);
            if (!output?.maxim || output.maxim.theme !== art.theme || wordCount(output.maxim.text) > available)
                return { comment: chosen, memory };
            const dialogue = chosen.dialogue.slice();
            dialogue[turnIndex] = { ...turn, text: turn.text + ' ' + output.maxim.text };
            return { comment: { ...chosen, dialogue, maxim: { ...output.maxim, inDialogue: true } },
                memory: { ...memory, art: output.memory } };
        }
        const source = candidates.find(c => c && c.kind === chosen.kind &&
            c.key === chosen.key && c.sig === chosen.sig);
        if (!source) return { comment: chosen, memory };
        let evidence = null;
        if (source.reliability === 'board' || source.reliability === 'rules') {
            evidence = { source: 'rules', reliable: true };
        } else if (source.reliability === 'analysis' &&
                ctx.before && ctx.before.reliable && ctx.after && ctx.after.reliable) {
            evidence = { source: 'stockfish', reliable: true,
                depth: Math.min(ctx.before.depth || 0, ctx.after.depth || 0) };
        } else if (source.reliability === 'certified-line') {
            evidence = { source: 'certified-line', reliable: true };
        }
        if (!evidence) return { comment: chosen, memory };
        const output = A.choose({
            gameId: ctx.gameId || 'tv-simulacio', ply: ctx.ply,
            comment: { kind: chosen.kind, text: chosen.text, priority: source.priority },
            certified: true, evidence, prepared: !!ctx.prepared, terminal: !!ctx.end,
            urgent: source.priority >= 85
        }, memory.art);
        if (!output || !output.maxim) return { comment: chosen, memory };
        return { comment: { ...chosen, maxim: output.maxim },
            memory: { ...memory, art: output.memory } };
    }

    // La visió d'en Grau: la línia de Stockfish dues o tres jugades endavant.
    function getVisioGrau() {
        if (root && root.ElTaulerVisioGrau) return root.ElTaulerVisioGrau;
        try { if (typeof require === 'function') return require('./visiograu'); } catch (e) {}
        return null;
    }

    // Lliga de llegendes (llegendes.js): noms i pronúncia dels jugadors.
    function getLlegendes() {
        if (root && root.ElTaulerLlegendes) return root.ElTaulerLlegendes;
        try { return typeof require === 'function' ? require('./llegendes') : null; } catch (err) { return null; }
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
        // Matxa ha deixat de respondre: la TV s'atura i hi torna a provar
        // cada tants mil·lisegons (a més del temps que triga cada intent).
        VOICE_RETRY_MS: 8000,
        // Control manual: espera mínima i màxima abans que el motor respongui
        // la jugada de l'usuari (dona temps a llegir-ne el comentari).
        CONTROL_REPLY_DELAY_MS: 1200,
        CONTROL_REPLY_MAX_MS: 4500,
        // Presentació de l'obertura abans de la primera jugada.
        INTRO_DELAY_MS: 3500,
        // Pausa breu entre una partida acabada i la següent.
        NEXT_GAME_DELAY_MS: 10000,
        // Límit de durada de la TV (en semijugades): taules si s'hi arriba.
        MAX_PLIES: 200,
        MATE_MAX_PLIES: 300,
        MATE_DEPTH: 6,
        MATE_MOVETIME_MS: 70,
        // Abandonament, com en una partida humana: si l'anàlisi a força plena
        // dona aquest avantatge (o un mat) al mateix bàndol durant RESIGN_PLIES
        // semijugades seguides, a partir de RESIGN_MIN_PLY, el bàndol que perd
        // abandona. Cap motor no abandona abans de la jugada 65 (semijugada
        // 129, la 65a de les blanques): fins llavors la partida es juga. Als nivells baixos (Elo estimat < RESIGN_LOW_ELO) es demana
        // més marge: els jugadors febles encara poden girar una partida. A les
        // simulacions amb el motor de l'app, la regla dona el mateix guanyador
        // que jugar fins al mat i s'estalvia una vintena de jugades.
        RESIGN_CP: 500,
        RESIGN_CP_LOW: 700,
        RESIGN_LOW_ELO: 1800,
        RESIGN_PLIES: 6,
        RESIGN_MIN_PLY: 129,
        // Amb la partida decidida (aquest avantatge o un mat), les jugades es
        // mostren al ritme «Àgil», triï l'espectador el ritme que triï.
        DECIDED_PACE_CP: 300,
        // Nivells desiguals (activats per defecte): un bàndol a l'atzar juga
        // una mica més fort que l'altre —un esglaó de «Skill Level», el mínim
        // que permet el motor de l'app (≈70–140 Elo estimats), o 100 d'Elo si
        // el motor admet UCI_Elo—. La pantalla mostra el nivell mitjà sense dir
        // quin bàndol és el més fort, i es revela en acabar la partida.
        UNEQUAL_SKILL_GAP: 2,
        UNEQUAL_ELO_GAP: 200,
        // Perfils de joc (activats per defecte): cada bàndol té un estil. El
        // motor del seu nivell decideix com de bona és la jugada (la que triaria
        // amb «Skill Level») i el perfil tria, entre les STYLE_MULTIPV millors
        // jugades amb una valoració a STYLE_WINDOW_CP o menys d'aquella, la que
        // encaixa més amb el seu estil. Així el nivell es manté i el caràcter
        // de cada jugador es nota.
        STYLE_MULTIPV: 4,
        STYLE_WINDOW_CP: 50,
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
        // Lliga de llegendes: com s'acaben les partides.
        // · Abandonament: com al duel, però a partir de la jugada 30 (no de la 65).
        LEAGUE_RESIGN_MIN_PLY: 60,
        // · Fase d'atac: quan la partida s'encalla (prou semijugades sense
        //   captures ni moviments de peó, una posició repetida o una partida
        //   llarga), els jugadors arrisquen per fer-la avançar. Stockfish tria
        //   entre jugades fins a WINDOW_CP pitjors que la del seu nivell (en lloc
        //   de STYLE_WINDOW_CP) amb un perfil que premia el progrés i castiga
        //   desfer jugades i repetir posicions; Lozza calcula més profund.
        LATE_ATTACK: {
            FROM_PLY: 50,
            STALL_HALFMOVES: 8,
            ALWAYS_FROM_PLY: 80,
            REPEAT_FROM_PLY: 30,
            WINDOW_CP: 90,
            STYLE_SHARE: 0.5,
            LOZZA_DEPTH_BONUS: 2,
            LOZZA_TIME_FACTOR: 1.5,
            WEIGHTS: { check: 1, captureValue: 0.8, threat: 1, approach: 1, storm: 1.2, promotion: 4, pawnPush: 1.2,
                passedPush: 2.5, kingCenter: 1.2, tradeAhead: 1.5, retreat: -1, quiet: -0.3, backtrack: -4, repeat: -8 }
        },
        // · Defalliment: en una partida de cada CHANCE (a l'atzar), un dels dos
        //   jugadors (també a l'atzar) baixa de precisió a partir d'una semijugada
        //   triada a l'atzar entre FROM_MIN_PLY i FROM_MAX_PLY: Stockfish baixa
        //   ELO_DROP d'Elo (o SKILL_DROP nivells de «Skill Level»); Lozza calcula
        //   LOZZA_DEPTH_DROP nivells menys i amb menys temps. Es decideix a l'inici
        //   de la partida, i l'Èlia i en Grau ho comenten quan passa.
        SLUMP: {
            CHANCE: 0.75,
            FROM_MIN_PLY: 30,
            FROM_MAX_PLY: 60,
            ELO_DROP: 300,
            SKILL_DROP: 3,
            LOZZA_DEPTH_DROP: 1,
            LOZZA_TIME_FACTOR: 0.7
        },
        // · Taules per acord: posició igualada (|valoració| <= DRAW_CP durant
        //   DRAW_PLIES semijugades seguides), sense captures ni peons des de fa
        //   DRAW_HALFMOVES semijugades, a partir de DRAW_FROM_PLY.
        DRAW_FROM_PLY: 100,
        DRAW_CP: 40,
        DRAW_PLIES: 20,
        DRAW_HALFMOVES: 16,
        // · Humanització dinàmica (només a la lliga de llegendes): els dos jugadors
        //   trien entre les MULTIPV millors línies de l'anàlisi amb una precisió
        //   fluctuant i vulnerabilitats pròpies del perfil (humanitzacio.js).
        //   Interruptor intern (no es mostra a l'espectador): amb ENABLED = false,
        //   o amb `deps.humanize = false`, la lliga torna al comportament anterior
        //   (perfils d'estil + defalliment programat).
        HUMANIZE: { ENABLED: true },
        PREFS_KEY: 'tauler_tv_prefs',
        RIVALRY_HISTORY: 8,
        LOZZA_MAX_DEPTH: 9
    };

    const TV_DUO = Object.freeze({
        presenter: 'matxa:central:elia',
        analyst: 'matxa:central:grau'
    });

    // La lectura i els subtítols comparteixen els torns del comentari.
    function tvReadingText(comment) {
        if (comment.dialogue) return comment.dialogue.map(turn => turn.text).join(' ');
        return (comment.say || comment.text) + (comment.maxim ? ' ' + comment.maxim.text : '');
    }

    function tvDialogueTurns(comment, enabled) {
        const c = comment || {};
        const speech = String(c.speech || '').trim();
        if (!speech) return [];
        const single = (voiceId, role) => [{ text: speech, voiceId: voiceId || null, role: role || 'presenter' }];
        if (Array.isArray(c.dialogue) && c.dialogue.length >= 2 && c.dialogue.length <= 4) {
            return c.dialogue.map(t => ({ text: tvSpeechText(!enabled && t.solo ? t.solo : t.text),
                voiceId: enabled ? (t.role === 'analyst' ? TV_DUO.analyst : TV_DUO.presenter) : null,
                role: t.role }));
        }
        // Màxima separada del fet: Èlia narra, Grau reflexiona.
        // Si el duet és desactivat, la veu única conserva els dos textos.
        if (c.maxim && typeof c.maxim.text === 'string' && c.maxim.text.trim()) {
            return [
                { text: speech, voiceId: enabled ? TV_DUO.presenter : null, role: 'presenter' },
                { text: c.maxim.text.trim(), voiceId: enabled ? TV_DUO.analyst : null, role: 'maxim' }
            ];
        }
        if (!enabled) return single(null, 'presenter');
        const kind = String(c.kind || '');
        const ply = Number.isFinite(c.ply) ? c.ply : -1;
        const explanation = !!c.explanatory;
        const final = ['mate', 'end', 'resign', 'stalemate', 'intro'].includes(kind);
        if (final) return single(TV_DUO.presenter, 'presenter');

        // Diàleg ocasional en els resums, quan hi ha dues frases amb sentit
        // propi. Els fets de les jugades (amb caselles) els narra l'Èlia; en
        // Grau parla als diàlegs, sense caselles.
        const splitEligible = explanation && kind === 'summary';
        if (splitEligible) {
            const parts = speech.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/u).filter(Boolean);
            const words = s => s.trim().split(/\s+/).length;
            if (parts.length === 2 && words(parts[0]) >= 4 && words(parts[1]) >= 4 &&
                    words(speech) <= 46) {
                return [
                    { text: parts[0], voiceId: TV_DUO.presenter, role: 'presenter' },
                    { text: parts[1], voiceId: TV_DUO.analyst, role: 'analyst' }
                ];
            }
        }
        // Grau interpreta els resums; l'Èlia presenta la resta de jugades.
        const analyst = kind === 'summary';
        return single(analyst ? TV_DUO.analyst : TV_DUO.presenter,
            analyst ? 'analyst' : 'presenter');
    }

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

    // La TV fa servir exclusivament Stockfish 19 Lite (2026, NNUE).
    // El Stockfish clàssic de la resta de l'aplicació no és un motor
    // alternatiu en aquesta secció. Si 19 falla, mostrem l'error real.
    const TV_ENGINES = {
        sf19: { id: 'sf19', label: 'Stockfish 19 · 2026', file: 'stockfish-19-lite-single.js',
            wasm: 'stockfish-19-lite-single.wasm' }
    };
    const TV_DEFAULT_ENGINE = 'sf19';
    // Les preferències antigues «classic» es migren automàticament a 19.
    function tvEngineId(id) { return TV_DEFAULT_ENGINE; }
    // URL del worker. El de Stockfish 19 busca el .wasm al costat i accepta
    // l'adreça al fragment (#): així la versió també trenca la memòria cau
    // del .wasm, que el fitxer no rep pel paràmetre ?v.
    function tvEngineWorkerUrl(id, version) {
        const e = TV_ENGINES[tvEngineId(id)];
        const v = version ? '?v=' + encodeURIComponent(version) : '';
        return e.file + v + (e.wasm ? '#' + encodeURIComponent(e.wasm + v) : '');
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

    // Esglaons de l'escala d'Elo: els extrems que declara el motor i els
    // centenars rodons entremig (amb Stockfish 19: 1320, 1400, 1500 … 3100,
    // 3190, vint nivells). Un centenar a menys de 50 d'un extrem no hi és.
    function tvEloSteps(caps) {
        const out = [caps.min];
        for (let v = Math.floor(caps.min / 100) * 100 + 100; v < caps.max; v += 100) {
            if (v - caps.min >= 50 && caps.max - v >= 50) out.push(v);
        }
        if (caps.max > caps.min) out.push(caps.max);
        return out;
    }
    // Valor de nivell vàlid: en mode Elo, l'esglaó més proper.
    function tvSnapLevel(caps, value) {
        if (!caps || caps.mode !== 'elo' || !isNum(value)) return value;
        return tvEloSteps(caps).reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best));
    }

    // Graella de valors de la barra de nivell.
    function tvLevelScale(caps) {
        if (!caps || caps.mode === 'none') return [];
        if (caps.mode === 'elo') return tvEloSteps(caps).map(v => ({ value: v, elo: v }));
        const out = [];
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
        if (caps.mode === 'elo') return tvSnapLevel(caps, convert(wanted, caps.min, caps.max));
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

    // Cada posició es juga dues vegades, amb els colors intercanviats.
    // Els tres primers índexs es conserven per a les revenges ja desades.
    const TV_MATE_SCENARIOS = [
        { eco: 'B33', name: 'Siciliana Sveshnikov', theme: 'Caselles fortes',
            angle: 'Fixem-nos en qui aprofita les caselles que els peons deixen lliures al centre.',
            moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'] },
        { eco: 'C39', name: 'Gambit de rei acceptat', theme: 'Material a canvi d’atac',
            angle: 'La lluita gira al voltant d’un peó cedit i les línies que es poden obrir prop del rei.',
            moves: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'h4', 'g4', 'Ne5', 'Nf6'] },
        { eco: 'E90', name: 'Defensa índia de rei', theme: 'Espai contra contrajoc',
            angle: 'Un bàndol guanya espai al centre. L’altre té opcions de buscar joc pels flancs.',
            moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'] },
        { eco: 'C45', name: 'Escocesa clàssica', theme: 'Peces actives en un centre obert',
            angle: 'El centre s’obre aviat. Mirarem quines peces hi arriben amb més activitat.',
            moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5', 'Be3', 'Qf6', 'c3', 'Nge7'] },
        { eco: 'C18', name: 'Francesa Winawer', theme: 'Centre tancat',
            angle: 'Els peons bloquegen el centre. La pregunta és per quin costat buscarà joc cada motor.',
            moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7'] },
        { name: 'Final de rei i peons', theme: 'Bloqueig i coronació',
            angle: 'Les blanques tenen un peó passat. Veurem si el rei negre el pot aturar.',
            fen: '8/p4kpp/8/2P5/1p6/1P3K2/P5PP/8 w - - 0 1' },
        { eco: 'D32', name: 'Defensa Tarrasch', theme: 'Peó aïllat',
            angle: 'Una posició amb un peó central aïllat. Pot donar espai o convertir-se en un objectiu.',
            moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'c5', 'cxd5', 'exd5', 'Nf3', 'Nc6', 'dxc5', 'Bxc5'] },
        { eco: 'B07', name: 'Defensa Pirc', theme: 'Atac per flancs',
            angle: 'El rei blanc va al flanc de dama i els peons negres hi guanyen terreny.',
            moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'Qd2', 'c6', 'O-O-O', 'b5'] },
        { eco: 'B12', name: 'Caro-Kann de l’avanç', theme: 'Tensió al flanc de rei',
            angle: 'El centre queda fixat i els peons de torre es troben al flanc de rei. Veurem qui hi obre camí.',
            moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'h4', 'h5', 'Bd3', 'Bxd3', 'Qxd3', 'e6'] },
        { name: 'Final de torres', theme: 'Torres actives i peons passats',
            angle: 'Cada bàndol té només una torre. Segueix quina actua millor darrere dels peons.',
            fen: '6k1/5pp1/7p/8/2P5/1P6/r4PPP/3R2K1 w - - 0 1' }
    ];

    function tvMateSeries(value) {
        const series = value || {};
        const returnColor = series.returnColor === 'w' || series.returnColor === 'b' ? series.returnColor : null;
        return {
            index: Number.isInteger(series.index) && series.index >= 0 ? series.index % TV_MATE_SCENARIOS.length : 0,
            returnColor,
            firstResult: returnColor && ['stockfish', 'lozza', 'draw'].includes(series.firstResult) ? series.firstResult : null
        };
    }

    function tvMateMatch(series, random) {
        const lozzaColor = series.returnColor || (random() < 0.5 ? 'w' : 'b');
        const scenario = TV_MATE_SCENARIOS[series.index];
        return {
            untilMate: true,
            index: series.index,
            rematch: !!series.returnColor,
            firstResult: series.firstResult,
            theme: scenario.theme,
            lozzaColor: lozzaColor,
            engines: { w: lozzaColor === 'w' ? 'lozza' : 'stockfish', b: lozzaColor === 'b' ? 'lozza' : 'stockfish' },
            depth: TV_CONFIG.MATE_DEPTH,
            movetime: TV_CONFIG.MATE_MOVETIME_MS,
            reason: scenario.theme + (series.returnColor ? ' · Revenja amb els colors intercanviats.' : ' · Primera partida de la parella.')
        };
    }

    function tvMatePairScore(first, second) {
        if (!first) return '';
        const points = result => result === 'stockfish' ? 1 : result === 'draw' ? 0.5 : 0;
        const stockfish = points(first) + points(second);
        const label = score => String(score).replace('.', ',');
        return 'Balanç de la parella: Stockfish ' + label(stockfish) + ' · Lozza ' + label(2 - stockfish) + '.';
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
        return { voice: voice, speed: speed, duo: p.duo !== false, offsets: offsets, openingIndex: openingIndex, unequal: p.unequal !== false, profiles: p.profiles !== false, engine: tvEngineId(p.engine), recent: tvRecentResults(p.recent),
            untilMate: p.untilMate === true, mateSeries: tvMateSeries(p.mateSeries), mateRecent: tvRecentResults(p.mateRecent) };
    }

    function tvResolveTarget(caps, viewer, prefs) {
        const base = tvBaseTarget(caps, viewer);
        if (base === null) return { value: null, base: null, offset: 0 };
        const p = tvNormalizePrefs(prefs);
        const offset = p.offsets[tvCapsSignature(caps)] || 0;
        const value = tvSnapLevel(caps, clamp(base + offset, caps.min, caps.max));
        return { value: value, base: base, offset: value - base };
    }

    // ------------------------------------------------------------------
    // Perfils de joc
    // ------------------------------------------------------------------
    // Cada perfil puntua els trets d'una jugada (vegeu tvMoveFeatures). Els pesos
    // només decideixen entre jugades de qualitat semblant: mai no fan jugar pitjor.
    const TV_STYLES = {
        attacker: { label: 'L\'Atacant', text: 'va a buscar el rei rival: escacs, peces que s\'hi acosten i peons que avancen',
            weights: { check: 3, approach: 1.2, storm: 1.5, sacrifice: 1, threat: 0.6, trade: -1.5, retreat: -0.8 } },
        // El contrari de L'Atacant: simplifica, no s'exposa i no busca el rei.
        wall: { label: 'El Mur', text: 'juga segur: protegeix el rei, canvia peces quan va per davant i no regala res',
            weights: { castle: 3, shield: -2.5, trade: 1.2, tradeAhead: 2, tradeBehind: -1.5, sacrifice: -2.5, kingMove: -1,
                retreat: 0.6, development: 0.8, check: -0.8, approach: -0.6, storm: -1.5, quiet: 0.4 } },
        hunter: { label: 'El Caçador', text: 'no deixa passar cap peça: captura i amenaça material sempre que pot',
            weights: { captureValue: 1.2, threat: 1.5, promotion: 3, check: 0.5 } },
        strategist: { label: 'L\'Estratega', text: 'pensa a llarg termini: centre, desenvolupament i columnes obertes',
            weights: { centralization: 1.2, development: 2, rookFile: 1.5, castle: 1, quiet: 0.5, storm: -0.5, kingMove: -1 } }
    };
    const STYLE_IDS = Object.keys(TV_STYLES);

    // Dos perfils diferents a l'atzar, un per bàndol.
    function tvPickStyles(random) {
        const r = typeof random === 'function' ? random : Math.random;
        const a = STYLE_IDS[Math.floor(r() * STYLE_IDS.length) % STYLE_IDS.length];
        const rest = STYLE_IDS.filter(id => id !== a);
        return { w: a, b: rest[Math.floor(r() * rest.length) % rest.length] };
    }

    function tvKingSquare(chess, color) {
        const b = chess.board();
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            const p = b[r][f];
            if (p && p.type === 'k' && p.color === color) return { file: f, rank: 7 - r };
        }
        return null;
    }

    // Trets d'una jugada que importen als perfils (amb chess.js). `evalCp` és la
    // valoració de la posició des de qui mou (per saber si va per davant).
    // Clau de posició per a les repeticions (peces, torn, enrocs i al pas).
    function tvPositionKey(fen) { return String(fen || '').split(' ').slice(0, 4).join(' '); }

    // Context de la partida per a la tria de jugada: posicions ja vistes i
    // les últimes jugades de cada bàndol (per detectar que es desfan).
    function tvMoveContext(ChessCtor, startFen, history) {
        const ctx = { seen: new Set(), recent: { w: [], b: [] } };
        let g;
        try { g = startFen ? new ChessCtor(startFen) : new ChessCtor(); } catch (err) { return ctx; }
        ctx.seen.add(tvPositionKey(g.fen()));
        for (const u of history || []) {
            const color = g.turn();
            const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : 'q' });
            if (!mv) break;
            ctx.recent[color] = ctx.recent[color].concat([{ from: mv.from, to: mv.to, piece: mv.piece }]).slice(-3);
            ctx.seen.add(tvPositionKey(g.fen()));
        }
        return ctx;
    }

    // Peó passat: cap peó rival davant seu a la mateixa columna ni a les del costat.
    function tvIsPassedPawn(board, sq, color) {
        const fr = fileRank(sq);
        if (!fr) return false;
        for (let r = 0; r < 8; r++) {
            const rank = 7 - r;
            const ahead = color === 'w' ? rank > fr.rank : rank < fr.rank;
            if (!ahead) continue;
            for (let f = Math.max(0, fr.file - 1); f <= Math.min(7, fr.file + 1); f++) {
                const p = board[r][f];
                if (p && p.type === 'p' && p.color !== color) return false;
            }
        }
        return true;
    }

    function tvMoveFeatures(ChessCtor, fen, uci, evalCp, context) {
        let g;
        try { g = new ChessCtor(fen); } catch (err) { return null; }
        const color = g.turn(), opp = other(color);
        const ownKing = tvKingSquare(g, color), oppKing = tvKingSquare(g, opp);
        const ply = (parseInt(String(fen).split(' ')[5], 10) - 1) * 2 + (color === 'b' ? 1 : 0);
        let mv = null;
        try { mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined }); } catch (err) { mv = null; }
        if (!mv) return null;
        const from = fileRank(mv.from), to = fileRank(mv.to);
        const value = PIECE_VALUE[mv.piece] || 0, captured = mv.captured ? PIECE_VALUE[mv.captured] : 0;
        const forward = color === 'w' ? to.rank - from.rank : from.rank - to.rank;
        const centerDist = fr => Math.max(Math.abs(fr.file - 3.5), Math.abs(fr.rank - 3.5));
        const dist = (a, b) => Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
        // Respostes del rival que capturen a la casella d'arribada.
        const recaptures = g.moves({ verbose: true }).filter(r => r.to === mv.to && r.captured);
        const recapturable = recaptures.length > 0;
        const cheapest = recapturable ? Math.min.apply(null, recaptures.map(r => PIECE_VALUE[r.piece] || 0)) : null;
        // Peces valuoses rivals que la peça moguda ataca després de moure.
        let threat = 0;
        const swapped = swapTurnFen(g.fen());
        if (swapped && mv.piece !== 'k') {
            try {
                const t = new ChessCtor(swapped);
                threat = t.moves({ square: mv.to, verbose: true }).filter(r => r.captured && (PIECE_VALUE[r.captured] || 0) >= 3 && r.captured !== 'k').length;
            } catch (err) { threat = 0; }
        }
        const ownPawnsOnFile = g.board().some(row => row.some((p, f) => p && p.type === 'p' && p.color === color && f === to.file));
        const anyPawnOnFile = g.board().some(row => row.some((p, f) => p && p.type === 'p' && f === to.file));
        const castled = ownKing && (ownKing.file >= 6 || ownKing.file <= 2) && ownKing.rank === (color === 'w' ? 0 : 7);
        const trade = !!mv.captured && recapturable && captured >= value - 1;
        const ahead = isNum(evalCp) && evalCp >= 100, behind = isNum(evalCp) && evalCp <= -100;
        return {
            check: g.in_check() ? 1 : 0,
            captureValue: captured,
            promotion: mv.promotion ? 1 : 0,
            castle: /[kq]/.test(mv.flags) ? 1 : 0,
            kingMove: mv.piece === 'k' && !/[kq]/.test(mv.flags) ? 1 : 0,
            approach: mv.piece !== 'k' && mv.piece !== 'p' && oppKing ? clamp(dist(from, oppKing) - dist(to, oppKing), -3, 3) : 0,
            // Peons d'un flanc que avancen cap a un rei enrocat en aquell flanc (no els centrals de l'obertura).
            storm: mv.piece === 'p' && oppKing && (oppKing.file <= 2 || oppKing.file >= 5) && to.file !== 3 && to.file !== 4
                && Math.abs(to.file - oppKing.file) <= 2 && forward > 0 ? 1 : 0,
            shield: mv.piece === 'p' && castled && Math.abs(from.file - ownKing.file) <= 1 ? 1 : 0,
            sacrifice: recapturable && cheapest !== null && value - captured >= 2 && cheapest < value ? 1 : 0,
            trade: trade ? 1 : 0,
            tradeAhead: trade && ahead ? 1 : 0,
            tradeBehind: trade && behind ? 1 : 0,
            threat: threat,
            retreat: forward < 0 && mv.piece !== 'k' ? 1 : 0,
            centralization: mv.piece !== 'k' ? clamp(centerDist(from) - centerDist(to), -2, 2) : 0,
            development: (mv.piece === 'n' || mv.piece === 'b') && from.rank === (color === 'w' ? 0 : 7) && ply < 30 ? 1 : 0,
            rookFile: mv.piece === 'r' && !ownPawnsOnFile ? (anyPawnOnFile ? 1 : 2) : 0,
            quiet: !mv.captured && !g.in_check() ? 1 : 0,
            // Progrés: un peó que avança (reinicia el comptador de les 50 jugades),
            // un peó passat que avança i, al final, el rei que s'acosta al centre.
            pawnPush: mv.piece === 'p' && !mv.captured ? 1 : 0,
            passedPush: mv.piece === 'p' && tvIsPassedPawn(g.board(), mv.to, color) ? 1 : 0,
            kingCenter: mv.piece === 'k' && !/[kq]/.test(mv.flags) && isPhaseEndgame(g.fen()) && centerDist(to) < centerDist(from) ? 1 : 0,
            // Jugades que no fan avançar: tornar la peça d'on venia o repetir una posició.
            backtrack: context && context.recent && (context.recent[color] || []).some(m => m.to === mv.from && m.from === mv.to) ? 1 : 0,
            repeat: context && context.seen && context.seen.has(tvPositionKey(g.fen())) ? 1 : 0
        };
    }

    // Un perfil és un id de TV_STYLES o un objecte { label, weights } (els
    // perfils dels jugadors de la lliga de llegendes duen els seus pesos).
    function tvStyleProfile(style) {
        if (style && typeof style === 'object') return style.weights && typeof style.weights === 'object' ? style : null;
        return Object.prototype.hasOwnProperty.call(TV_STYLES, style) ? TV_STYLES[style] : null;
    }

    function tvStyleScore(style, features) {
        const profile = tvStyleProfile(style);
        if (!profile || !features) return 0;
        return Object.keys(profile.weights).reduce((sum, k) => sum + profile.weights[k] * (features[k] || 0), 0);
    }

    // Tria la jugada d'un perfil. `infos` són les línies del motor (des de qui
    // mou) i `levelUci` la jugada que el motor tria al seu nivell. Només
    // s'hi juguen jugades amb una valoració a `windowCp` o menys de la del
    // nivell: el perfil decideix QUINA jugada, el nivell decideix COM DE BONA.
    // Amb un mat (a favor o en contra), o si la jugada del nivell no és entre
    // les línies, mana el nivell.
    function tvPickStyledMove(ChessCtor, fen, infos, levelUci, style, windowCp, context) {
        const lines = Object.keys(infos || {}).map(k => infos[k]).filter(i => i && i.pv && i.pv.length);
        const base = { uci: levelUci, changed: false, score: null };
        if (!levelUci || !tvStyleProfile(style) || !lines.length) return base;
        const own = lines.find(i => i.pv[0] === levelUci);
        if (!own || own.type !== 'cp' || lines.some(i => i.type === 'mate')) return base;
        const win = isNum(windowCp) ? windowCp : TV_CONFIG.STYLE_WINDOW_CP;
        let best = null;
        lines.filter(i => i.type === 'cp' && Math.abs(i.value - own.value) <= win).forEach((i) => {
            const score = tvStyleScore(style, tvMoveFeatures(ChessCtor, fen, i.pv[0], own.value, context));
            if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && i.pv[0] === levelUci)) best = { uci: i.pv[0], score: score };
        });
        if (!best) return base;
        return { uci: best.uci, changed: best.uci !== levelUci, score: best.score };
    }

    function tvStylesLine(styles) {
        if (!styles || !TV_STYLES[styles.w] || !TV_STYLES[styles.b]) return '';
        return TV_STYLES[styles.w].label + ' (blanques) contra ' + TV_STYLES[styles.b].label + ' (negres)';
    }

    // Nivells dels dos jugadors d'una partida. Amb nivells desiguals, el bàndol
    // més fort (a l'atzar) juga un esglaó (o 100 d'Elo) per sobre de l'altre:
    // amb «Skill Level» el més fluix juga el nivell triat i el més fort, el
    // següent; amb Elo, tots dos se separen 50 de l'objectiu. Als extrems de
    // l'escala la parella es desplaça per no sortir-ne.
    function tvGameLevels(caps, target, unequal, random) {
        if (!caps || caps.mode === 'none' || !isNum(target)) return null;
        if (!unequal) return { w: target, b: target, stronger: null };
        let lo, hi;
        if (caps.mode === 'elo') {
            const gap = TV_CONFIG.UNEQUAL_ELO_GAP;
            lo = Math.max(caps.min, Math.round(target - gap / 2));
            hi = Math.min(caps.max, lo + gap);
            lo = Math.max(caps.min, hi - gap);
        } else {
            const gap = TV_CONFIG.UNEQUAL_SKILL_GAP * (caps.step || 1);
            hi = Math.min(caps.max, target + gap);
            lo = Math.max(caps.min, hi - gap);
        }
        if (hi <= lo) return { w: target, b: target, stronger: null };
        const stronger = (typeof random === 'function' ? random() : Math.random()) < 0.5 ? 'w' : 'b';
        return { w: stronger === 'w' ? hi : lo, b: stronger === 'b' ? hi : lo, stronger: stronger };
    }

    // Etiqueta de la partida: amb nivells desiguals, el nivell mitjà, sense dir
    // quin bàndol és el més fort.
    function tvGameLevelLabel(caps, levels, value) {
        if (!levels || !levels.stronger) return tvLevelLabel(caps, value);
        const avg = Math.round((tvLevelElo(caps, levels.w) + tvLevelElo(caps, levels.b)) / 2 / 10) * 10;
        const steps = Math.abs(levels.w - levels.b) / (caps.step || 1);
        const gap = caps.mode === 'elo' ? Math.abs(levels.w - levels.b) + ' d\'Elo' : (steps === 1 ? 'un nivell' : steps + ' nivells');
        return caps.mode === 'elo'
            ? { short: '≈ ' + avg + ' de mitjana', long: 'Elo mitjà del motor ≈ ' + avg + ': un dels dos juga ' + gap + ' per sobre (es descobreix al final)' }
            : { short: 'Nivell mitjà · ≈' + avg, long: 'Nivell mitjà · Elo estimat ≈ ' + avg + ': un dels dos juga ' + gap + ' per sobre (es descobreix al final)' };
    }

    // Revelació en acabar la partida: qui jugava més fort.
    function tvLevelReveal(caps, levels) {
        if (!caps || !levels || !levels.stronger) return null;
        const s = levels.stronger, o = other(s);
        const label = v => caps.mode === 'elo' ? 'Elo ' + v : 'nivell ' + v;
        return COLOR[s].Pl + ' jugaven una mica més fort: ' + label(levels[s]) + ' contra ' + label(levels[o]) + '.';
    }

    // Nivell del bàndol que té el torn en aquesta posició.
    // Historial estrictament local de partides automàtiques. No s'utilitza
    // cap valoració Elo fictícia per convertir la profunditat de Lozza.
    // Les partides desades abans de poder triar motor són del clàssic.
    const TV_LEGACY_SIG = 'skill:0-20';
    // Només compten les partides jugades amb la mateixa escala de motor:
    // un Stockfish més fort no hereta les ratxes de l'altre.
    function tvRivalryHistory(items, caps) {
        const sig = tvCapsSignature(caps);
        return tvRecentResults(items).filter(x => x.sig === sig);
    }
    function tvRecentResults(items) {
        if (!Array.isArray(items)) return [];
        return items.filter(x => x && ['stockfish', 'lozza', 'draw'].includes(x.winner)
            && ['w', 'b'].includes(x.lozzaColor) && isNum(x.plies) && x.plies >= 0)
            .slice(-TV_CONFIG.RIVALRY_HISTORY)
            .map(x => ({ winner: x.winner, lozzaColor: x.lozzaColor,
                plies: Math.floor(x.plies), reason: String(x.reason || '').slice(0, 40),
                // Escala del motor amb què es va jugar (vegeu tvCapsSignature).
                sig: typeof x.sig === 'string' ? x.sig.slice(0, 40) : TV_LEGACY_SIG }));
    }

    // Tria les condicions de la PARTIDA SEGÜENT, mai una jugada ni el resultat.
    // Alterna colors; després de taules augmenta el desequilibri, i després
    // de ratxes afavoreix el rival que ha perdut. Tot es comprova al tauler.
    function tvMatchPlan(items, options) {
        const o = options || {};
        const history = tvRecentResults(items);
        const last = history[history.length - 1] || null;
        const r = typeof o.random === 'function' ? o.random : Math.random;
        const lozzaColor = last ? other(last.lozzaColor) : (r() < 0.5 ? 'w' : 'b');
        const engines = { w: lozzaColor === 'w' ? 'lozza' : 'stockfish',
            b: lozzaColor === 'b' ? 'lozza' : 'stockfish' };
        const caps = o.caps || null;
        const target = isNum(o.target) ? o.target : (caps && isNum(caps.min) ? caps.min : 0);
        const ratio = caps && caps.mode !== 'none' && isNum(caps.max) && isNum(caps.min)
            ? clamp((target - caps.min) / Math.max(1, caps.max - caps.min), 0, 1) : 0.3;
        let depth = 3 + Math.round(ratio * 5);
        const moveTime = 110 + Math.round(ratio * 150);
        let stockfishLevel = target;
        let draws = 0;
        for (let i = history.length - 1; i >= 0 && history[i].winner === 'draw'; i--) draws++;
        const wins = { stockfish: 0, lozza: 0, draw: 0 };
        history.forEach(x => { wins[x.winner]++; });
        const previousWinner = history.slice().reverse().find(x => x.winner !== 'draw');
        let streak = 0;
        if (previousWinner) {
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].winner === 'draw') continue;
                if (history[i].winner !== previousWinner.winner) break;
                streak++;
            }
        }
        let bias = 0; // positiu: Stockfish s'enforteix i Lozza es limita
        if (o.unequal !== false) {
            if (streak >= 2) bias = previousWinner.winner === 'stockfish' ? -1 : 1;
            if (draws >= 2) {
                const favor = wins.stockfish > wins.lozza ? -1
                    : wins.lozza > wins.stockfish ? 1 : (history.length % 2 === 0 ? -1 : 1);
                bias = favor * Math.min(2, Math.floor(draws / 2));
            }
            if (caps && caps.mode === 'skill') stockfishLevel = clamp(target + bias, caps.min, caps.max);
            else if (caps && caps.mode === 'elo') stockfishLevel = clamp(target + 100 * bias, caps.min, caps.max);
            depth = clamp(depth - bias, 2, TV_CONFIG.LOZZA_MAX_DEPTH);
        }
        const sharp = draws >= 1 || (isNum(o.gameSeq) ? o.gameSeq % 2 === 0 : false);
        const reason = draws >= 2 ? 'Després de ' + draws + ' taules seguides, augmentem moderadament el contrast de forces i prioritzem una obertura tàctica.'
            : streak >= 2 && o.unequal !== false ? 'Després de ' + streak + ' victòries consecutives, donem més opcions al rival.'
            : sharp ? 'Rotació cap a una obertura més tàctica.' : 'Alternança de colors i obertures.';
        return { engines: engines, lozzaColor: lozzaColor, stockfishLevel: stockfishLevel,
            lozzaDepth: depth, lozzaMovetime: moveTime, sharp: sharp, reason: reason,
            draws: draws, wins: wins, bias: bias };
    }

    function tvSideLevel(level, fen) {
        if (!level) return null;
        const turn = String(fen || '').split(' ')[1] === 'b' ? 'b' : 'w';
        return level.sides ? level.sides[turn] : level.value;
    }

    // ------------------------------------------------------------------
    // Lliga de llegendes: la configuració de cada jugador (llegendes.js)
    // ------------------------------------------------------------------
    // Motor, nivell i perfil d'un jugador. `power` (0–1) situa el nivell dins
    // l'escala del motor; amb Lozza es converteix en profunditat i temps de
    // cerca amb la mateixa relació que fa servir tvMatchPlan. Si Lozza no està
    // disponible, el jugador juga amb Stockfish i amb els pesos del seu perfil.
    function tvLegendSide(caps, player, lozzaReady, power) {
        const ratio = isNum(power) ? clamp(power, 0, 1) : 0.62;
        const engine = player.engine === 'lozza' && lozzaReady ? 'lozza' : 'stockfish';
        let level = null;
        if (caps && caps.mode === 'elo') level = tvSnapLevel(caps, clamp(Math.round(caps.min + ratio * (caps.max - caps.min)), caps.min, caps.max));
        else if (caps && caps.mode === 'skill') level = clamp(Math.round((caps.min + ratio * (caps.max - caps.min)) / caps.step) * caps.step, caps.min, caps.max);
        const style = engine === 'stockfish' && caps && caps.mode !== 'none' && player.weights
            ? { id: player.id, label: player.short, weights: player.weights } : null;
        return { id: player.id, name: player.short, engine: engine, preferred: player.engine, level: level,
            depth: clamp(3 + Math.round(ratio * 5), 2, TV_CONFIG.LOZZA_MAX_DEPTH),
            movetime: 110 + Math.round(ratio * 150), style: style };
    }

    // Fase d'atac de la lliga: decideix si el bàndol que mou ha d'arriscar per
    // desencallar la partida i amb quin perfil. Retorna null o
    // { reason, style, windowCp, context, depthBonus, movetimeFactor }.
    // ctx = { ChessCtor, fen, ply, startFen, history (UCI), baseStyle, force }
    // `force` (un motiu ja vist) la manté activa: un cop comença, dura fins al
    // final de la partida, com diu l'anunci de l'Èlia i en Grau.
    function tvLateAttack(ctx) {
        const c = ctx || {};
        const L = TV_CONFIG.LATE_ATTACK;
        if (!c.ChessCtor || !c.fen || !isNum(c.ply)) return null;
        const halfmoves = parseInt(String(c.fen).split(' ')[4], 10) || 0;
        const context = tvMoveContext(c.ChessCtor, c.startFen, c.history || []);
        // La posició actual ja havia sortit abans (sense comptar l'última vegada).
        let repeated = false;
        try {
            const key = tvPositionKey(c.fen);
            const g = c.startFen ? new c.ChessCtor(c.startFen) : new c.ChessCtor();
            let count = tvPositionKey(g.fen()) === key ? 1 : 0;
            for (const u of c.history || []) {
                if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : 'q' })) break;
                if (tvPositionKey(g.fen()) === key) count++;
            }
            repeated = count >= 2;
        } catch (err) { repeated = false; }
        const reason = c.force ? c.force : c.ply >= L.ALWAYS_FROM_PLY ? 'long'
            : c.ply >= L.FROM_PLY && halfmoves >= L.STALL_HALFMOVES ? 'stalled'
            : c.ply >= L.REPEAT_FROM_PLY && repeated ? 'repetition' : null;
        if (!reason) return null;
        // El perfil d'atac, amb una part del perfil propi del jugador.
        const weights = {};
        const base = tvStyleProfile(c.baseStyle);
        if (base) Object.keys(base.weights).forEach((k) => { weights[k] = base.weights[k] * L.STYLE_SHARE; });
        Object.keys(L.WEIGHTS).forEach((k) => { weights[k] = (weights[k] || 0) + L.WEIGHTS[k]; });
        return { reason: reason, style: { id: 'atac', label: 'Fase d\'atac', weights: weights }, windowCp: L.WINDOW_CP,
            context: context, depthBonus: L.LOZZA_DEPTH_BONUS, movetimeFactor: L.LOZZA_TIME_FACTOR };
    }

    // Taules per acord: la posició és igualada des de fa estona i no avança.
    // Com tvResignStep: { state, end }.
    function tvAgreedDrawStep(state, analysis, ply, fen) {
        const prev = state && isNum(state.plies) ? state : { plies: 0 };
        if (!analysis || !analysis.reliable || !analysis.best) return { state: prev, end: null };
        const best = analysis.best;
        const level = best.type === 'cp' && Math.abs(best.value) <= TV_CONFIG.DRAW_CP;
        const next = { plies: level ? prev.plies + 1 : 0 };
        const halfmoves = parseInt(String(fen || '').split(' ')[4], 10) || 0;
        const agreed = level && ply >= TV_CONFIG.DRAW_FROM_PLY && next.plies >= TV_CONFIG.DRAW_PLIES && halfmoves >= TV_CONFIG.DRAW_HALFMOVES;
        return { state: next, end: agreed ? { result: '½-½', winner: null, reason: 'agreed',
            text: 'Taules per acord: la posició fa estona que està igualada i cap dels dos no la pot fer avançar.' } : null };
    }

    // Nivell «de la partida» de la lliga: la mitjana dels nivells de Stockfish
    // (per als llindars d'abandonament). Els nivells de cada bàndol són al pla.
    function tvLegendLevel(caps, plan) {
        const vals = ['w', 'b'].map(c => plan.sides[c].level).filter(isNum);
        const value = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        return { value: value, sides: null, stronger: null,
            // El motor i el nivell de cada jugador són interns: no es mostren.
            label: { short: 'Lliga de llegendes', long: 'Lliga de llegendes: cada jugador juga amb el seu estil' },
            reveal: null, mode: caps ? caps.mode : 'none', stockfish: null };
    }

    // Defalliment de la partida (o null): quin bàndol i a partir de quina semijugada.
    function tvPlanSlump(random) {
        const r = typeof random === 'function' ? random : Math.random;
        const S = TV_CONFIG.SLUMP;
        if (!(r() < S.CHANCE)) return null;
        const color = r() < 0.5 ? 'w' : 'b';
        const span = Math.max(0, S.FROM_MAX_PLY - S.FROM_MIN_PLY);
        return { color: color, fromPly: S.FROM_MIN_PLY + Math.floor(r() * (span + 1)) % (span + 1) };
    }

    // Configuració efectiva d'un bàndol en una semijugada: si ha començat el seu
    // defalliment, menys nivell (Stockfish) o menys profunditat i temps (Lozza).
    function tvSlumpSide(caps, side, slump, color, ply) {
        if (!side) return side;
        if (!slump || slump.color !== color || !isNum(ply) || ply < slump.fromPly) return Object.assign({}, side, { slumped: false });
        const S = TV_CONFIG.SLUMP;
        let level = side.level;
        if (isNum(level) && caps && caps.mode === 'elo') level = tvSnapLevel(caps, clamp(level - S.ELO_DROP, caps.min, caps.max));
        else if (isNum(level) && caps && caps.mode === 'skill') level = clamp(level - S.SKILL_DROP * (caps.step || 1), caps.min, caps.max);
        return Object.assign({}, side, { level: level, depth: clamp(side.depth - S.LOZZA_DEPTH_DROP, 2, TV_CONFIG.LOZZA_MAX_DEPTH),
            movetime: Math.max(60, Math.round(side.movetime * S.LOZZA_TIME_FACTOR)), slumped: true });
    }

    // Pla d'una partida de la lliga: qui juga, amb quin motor, nivell i perfil.
    // `opts.humanize`: el defalliment programat (semijugada fixa) se substitueix
    // per la fluctuació dinàmica de precisió de humanitzacio.js.
    function tvLegendPlan(LG, fixture, caps, lozzaReady, random, opts) {
        const W = LG.legend(fixture.white), B = LG.legend(fixture.black);
        const power = LG.CONFIG.POWER;
        const sides = { w: tvLegendSide(caps, W, lozzaReady, power), b: tvLegendSide(caps, B, lozzaReady, power) };
        return { legends: true, fixture: fixture, round: fixture.round, ids: { w: W.id, b: B.id },
            names: { w: W.short, b: B.short }, engines: { w: sides.w.engine, b: sides.b.engine }, sides: sides,
            sharp: !!(W.tactical || B.tactical), untilMate: false, reason: '',
            slump: opts && opts.humanize ? null : tvPlanSlump(random) };
    }

    // «Massa fàcil» puja el nivell; «Massa difícil» l'abaixa. Retorna les
    // preferències noves (no toca la partida en curs: s'aplica a la següent).
    // Fixa directament l'objectiu de la partida següent (barra de nivell).
    function tvSetTargetPrefs(caps, viewer, prefs, value) {
        const p = tvNormalizePrefs(prefs);
        if (!caps || caps.mode === 'none' || !isNum(value)) return p;
        const current = tvResolveTarget(caps, viewer, p);
        const next = caps.mode === 'elo' ? tvSnapLevel(caps, clamp(value, caps.min, caps.max))
            : clamp(Math.round(value / caps.step) * caps.step, caps.min, caps.max);
        const offsets = Object.assign({}, p.offsets);
        offsets[tvCapsSignature(caps)] = next - current.base;
        return Object.assign({}, p, { offsets: offsets });
    }

    function tvAdjustPrefs(caps, viewer, prefs, direction) {
        const p = tvNormalizePrefs(prefs);
        if (!caps || caps.mode === 'none') return p;
        const current = tvResolveTarget(caps, viewer, p);
        const dir = direction === 'harder' ? 1 : (direction === 'easier' ? -1 : 0);
        let next;
        if (caps.mode === 'elo') {
            // Un esglaó amunt o avall de l'escala.
            const steps = tvEloSteps(caps);
            const i = steps.indexOf(current.value);
            next = steps[clamp((i < 0 ? 0 : i) + dir, 0, steps.length - 1)];
        } else next = clamp(current.value + dir * caps.step, caps.min, caps.max);
        const offsets = Object.assign({}, p.offsets);
        offsets[tvCapsSignature(caps)] = next - current.base;
        return Object.assign({}, p, { offsets: offsets });
    }

    // ------------------------------------------------------------------
    // Ritme
    // ------------------------------------------------------------------
    function tvMoveDelayMs(speedId, opts) {
        const o = opts || {};
        // Partida decidida: el desenllaç no s'allarga (sempre el ritme més àgil).
        const speed = o.decided ? TV_CONFIG.SPEEDS.quick : (TV_CONFIG.SPEEDS[speedId] || TV_CONFIG.SPEEDS[TV_CONFIG.DEFAULT_SPEED]);
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
        // Fins a 30 s: les explicacions d'en Grau sobre la línia de Stockfish
        // poden passar de 40 paraules en un sol torn.
        return clamp(2500 + words * 600, 4000, 30000);
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
            second: second ? { score: tvScoreWhite(second, turn), uci: second.pv[0] || null, depth: second.depth, pv: second.pv.slice(0, 8) } : null,
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

    // Amb `names` ({ w, b }, a la lliga de llegendes) diu qui guanya pel nom.
    function tvResultHeadline(end, names) {
        if (!end) return '';
        const named = !!(names && names.w && names.b);
        if (end.result === '1-0') return named ? '1-0 · Guanya ' + names.w : '1-0 · Guanyen les blanques';
        if (end.result === '0-1') return named ? '0-1 · Guanya ' + names.b : '0-1 · Guanyen les negres';
        return named ? '½-½ · Taules entre ' + names.w + ' i ' + names.b : '½-½ · Taules';
    }

    // ------------------------------------------------------------------
    // Partides decidides: abandonament i ritme
    // ------------------------------------------------------------------
    // Bàndol amb un avantatge d'almenys `thresholdCp` (o un mat) segons una
    // valoració des del punt de vista de les blanques.
    function tvDecisiveSide(scoreW, thresholdCp) {
        if (!scoreW || !isNum(scoreW.value)) return null;
        if (scoreW.type === 'mate') return scoreW.value > 0 ? 'w' : (scoreW.value < 0 ? 'b' : null);
        if (scoreW.type !== 'cp') return null;
        return scoreW.value >= thresholdCp ? 'w' : (scoreW.value <= -thresholdCp ? 'b' : null);
    }

    function tvResignThresholdCp(caps, level) {
        const elo = tvLevelElo(caps, level);
        return isNum(elo) && elo < TV_CONFIG.RESIGN_LOW_ELO ? TV_CONFIG.RESIGN_CP_LOW : TV_CONFIG.RESIGN_CP;
    }

    function tvResignEnd(winner) {
        const loser = other(winner);
        return { result: winner === 'w' ? '1-0' : '0-1', winner: winner, reason: 'resign',
            text: COLOR[loser].Pl + ' abandonen: l\'avantatge de ' + COLOR[winner].pl + ' ja és decisiu. Guanyen ' + COLOR[winner].pl + '.' };
    }

    // Una semijugada més de la sèrie: `analysis` és la de la posició que acaba
    // de quedar i `plies` les semijugades jugades. Una anàlisi absent o poc
    // fiable no compta, però tampoc no trenca la sèrie.
    function tvResignStep(state, analysis, plies, thresholdCp, minPly) {
        const prev = state && state.side ? state : { side: null, plies: 0 };
        if (!analysis || !analysis.reliable) return { state: prev, end: null };
        const side = tvDecisiveSide(analysis.best, thresholdCp);
        const next = side ? { side: side, plies: side === prev.side ? prev.plies + 1 : 1 } : { side: null, plies: 0 };
        const from = isNum(minPly) ? minPly : TV_CONFIG.RESIGN_MIN_PLY;
        const resigns = !!side && plies >= from && next.plies >= TV_CONFIG.RESIGN_PLIES;
        return { state: next, end: resigns ? tvResignEnd(side) : null };
    }

    function tvIsDecided(analysis) {
        return !!(analysis && analysis.reliable && tvDecisiveSide(analysis.best, TV_CONFIG.DECIDED_PACE_CP));
    }

    // ------------------------------------------------------------------
    // Obertures del repertori
    // ------------------------------------------------------------------
    // Obertures que desequilibren aviat (gambits, partides obertes, sicilianes,
    // índies dinàmiques…): donen partides que es decideixen abans.
    const SHARP_ECO = /^(B0[1-3]|B[2-9]\d|C2\d|C3\d|C4[4-9]|C5\d|A5[2-9]|A[68]\d|D08|D8\d|E[6-9]\d)/;
    function tvIsSharpOpening(opening) {
        if (!opening) return false;
        const name = String(opening.name || '');
        if (/gambit/i.test(name) && !/gambit de dama/i.test(name)) return true;
        return SHARP_ECO.test(String(opening.eco || ''));
    }

    // Rotació: cada partida nova agafa la següent obertura de la llista. Amb
    // `opts.sharp`, la següent de la rotació que sigui d'aquelles que
    // desequilibren aviat.
    function tvPickOpening(curated, index, opts) {
        const list = Array.isArray(curated) ? curated.filter(o => o && Array.isArray(o.moves) && o.moves.length) : [];
        if (!list.length) return { opening: null, nextIndex: 0 };
        let i = ((isNum(index) ? Math.floor(index) : 0) % list.length + list.length) % list.length;
        if (opts && opts.sharp) {
            for (let k = 0; k < list.length; k++) {
                const j = (i + k) % list.length;
                if (tvIsSharpOpening(list[j])) { i = j; break; }
            }
        }
        return { opening: list[i], nextIndex: (i + 1) % list.length };
    }

    // Jugades preparades legals (s'aturen a la primera que no ho sigui).
    function tvPreparedLine(ChessCtor, opening, maxPlies) {
        if (!opening || !Array.isArray(opening.moves) || typeof ChessCtor !== 'function') return [];
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
            // «amb l'alfil, amb escac»: dos «amb» seguits es llegeixen malament.
            return 'capturar ' + pieceShort(f.captura) + ' a ' + f.desti + ' amb ' + withPiece + (check ? ',' + check : '');
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
    function aNP(np) { return /^el /.test(np) ? 'al ' + np.slice(3) : 'a ' + np; }
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
        const pawnsWord = n => (n === 1 ? 'un peó' : numWord(n) + ' peons');
        let desc, kind = 'mixed', extra = null;
        if (!minor && !r && !q) { kind = 'pawns'; desc = pawnsWord(p) + ' de més'; }
        else if (r === 1 && minor === -1 && !q) {
            // «La qualitat»: torre contra peça menor. Es diu quina peça és,
            // que s'entén millor que «tenir la qualitat de més».
            kind = 'exchange';
            extra = { minor: d.n * s === -1 ? 'un cavall' : 'un alfil', pawns: p > 0 ? pawnsWord(p) : null };
            desc = 'una torre per ' + extra.minor + (extra.pawns ? ' i ' + extra.pawns + ' de més' : '');
        }
        else if (minor === 1 && !r && !q && p <= 0) {
            kind = p === 0 ? 'piece' : 'piecePawns';
            extra = { pawns: p < 0 ? pawnsWord(-p) : null };
            desc = p === 0 ? 'una peça de més' : 'una peça per ' + extra.pawns;
        }
        else if (r === 1 && !minor && !q && p >= 0) { kind = 'rook'; desc = 'una torre de més'; }
        else if (q === 1 && !minor && !r) { kind = 'queen'; desc = 'una dama de més'; }
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
                kind = 'equivalent';
                desc = pts * s >= 6 ? 'molt més material' : 'l\'equivalent a ' + (pts * s === 1 ? 'un peó' : numWord(pts * s) + ' peons') + ' de més';
            }
        }
        return { leader: leader, desc: desc, pts: pts * s, kind: kind, pawns: kind === 'pawns' ? p : null, extra: extra };
    }

    // Maneres diferents (i totes certes) de dir el mateix balanç de material.
    // Retorna textos; amb { tagged: true }, objectes { text, subject } on
    // subject és 'leader' si el subjecte és el bàndol amb més material i
    // 'trailer' si és l'altre (sempre amb un sentit clarament negatiu).
    function materialClauses(mp, opts) {
        const tagged = !!(opts && opts.tagged);
        const out = [];
        const add = (text, subject) => out.push(tagged ? { text, subject } : text);
        if (!mp) {
            ['el material està igualat', 'les forces estan igualades', 'hi ha el mateix material als dos bàndols',
                'cap bàndol no té més material que l\'altre'].forEach(t => add(t, null));
            return out;
        }
        const L = COLOR[mp.leader].pl, O = COLOR[other(mp.leader)].pl;
        const x = mp.extra || {};
        add(L + ' tenen ' + mp.desc, 'leader');
        if (mp.kind === 'pawns') {
            const n = mp.pawns === 1 ? 'un peó' : numWord(mp.pawns) + ' peons';
            add(L + ' van ' + n + ' per davant', 'leader');
            add(L + ' porten ' + n + ' d\'avantatge en material', 'leader');
            add(O + ' tenen ' + n + ' de menys', 'trailer');
        } else if (mp.kind === 'exchange') {
            const piece = x.minor.replace(/^un /, '');
            add(L + ' han guanyat la qualitat (torre per ' + piece + ')' + (x.pawns ? ' i tenen ' + x.pawns + ' de més' : ''), 'leader');
            add(L + ' tenen torre contra ' + piece + (x.pawns ? ' i ' + x.pawns + ' de més' : ''), 'leader');
            if (!x.pawns) add(O + ' han perdut una torre a canvi d\'' + x.minor, 'trailer');
        } else if (mp.kind === 'piece') {
            add(L + ' juguen amb una peça de més', 'leader');
            add(L + ' van una peça per davant', 'leader');
            add(O + ' juguen amb una peça de menys', 'trailer');
        } else if (mp.kind === 'rook') {
            add(L + ' van una torre per davant', 'leader');
            add(O + ' juguen amb una torre de menys', 'trailer');
        } else if (mp.kind === 'queen') {
            add(O + ' juguen amb una dama de menys', 'trailer');
        } else if (mp.kind === 'equivalent') {
            add(L + ' van per davant en material', 'leader');
        }
        return out;
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
            if (t.kind === 'pin' && (!['n', 'r', 'b'].includes(front.t) || PIECE_VALUE[back.t] <= PIECE_VALUE[front.t])) return false;
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
            summaryCount: 0, summaryIntros: [],
            materialSig: '0,0,0,0,0', endgame: false, queensOff: false, castled: { w: false, b: false },
            // Fils narratius per partida: es restauren en desfer les jugades.
            story: { threads: [], lastNarrationPly: -100 },
            conflicts: [], lastDialoguePly: -100, lastVariantPly: -100, questionIndex: null, conflictSeq: 0, dialogueFacts: {},
            // Previsions i plans d'en Grau (visiograu.js), també per desfer.
            visio: null,
            // Observacions sobre els jugadors de la lliga de llegendes (llegendes.js)
            // i última semijugada en què un comentari d'una sola veu va dir un nom.
            legend: null, namedPly: { w: -100, b: -100 }, nameForm: 0,
            art: null // memòria de màximes, inclosa als estats per desfer
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
                    const tail = tier === 'advanced' ? ': amb la jugada feta cedeixen uns ' + pawns + ' peons.' : '.';
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
                else v.push(capFirst(pieceNP(moved.t, color)) + ' apunta ara ' + aNP(shortOn(t.p.t, t.sq)) + loose + '.');
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
        //     i alfil a la gran diagonal (b2/g2/b7/g7 darrere el peó avançat).
        //     Els comentaris no fan servir la paraula «fianchetto».
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
                add('diagonal', ['L\'alfil ' + me.adj + ' s\'instal·la a la gran diagonal.', 'L\'alfil ' + me.adj + ' es col·loca a ' + mv.to + ', a la gran diagonal, darrere el peó que ha avançat.'],
                    { key: 'granDiagonal:' + color + ':' + mv.to, define: { term: 'gran diagonal', text: 'La gran diagonal és la més llarga del tauler, d\'una cantonada a l\'altra.' } });
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
                const clauses = materialClauses(ph);
                add('material', ph ? ['Després dels canvis, ' + clauses[0] + '.', 'Balanç de material: ' + clauses[0] + '.',
                    'Fets els canvis, ' + clauses[1 % clauses.length] + '.', capFirst(clauses[clauses.length - 1]) + ' després dels canvis.']
                    : ['Després dels canvis, el material torna a estar igualat.', 'Material igualat després dels canvis.',
                        'Fets els canvis, les forces tornen a estar igualades.'],
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
        // Fase 4: evita encadenar els mateixos inicis, sense modificar el
        // motiu, la prioritat ni el contingut factual dels candidats.
        if (o.quality && typeof o.quality.preferVariety === 'function') {
            try { text = o.quality.preferVariety(text, best.variants, mem.texts); }
            catch (err) { /* la selecció inicial continua sent vàlida */ }
        }
        const variantId = cand.variants.indexOf(text);
        const parts = leadFact ? [leadFact, text] : [text];
        // Paper de cada tros (fet de la jugada, comentari, ampliació): la veu
        // de l'Èlia en diu el fet de la jugada per la intenció.
        const roles = leadFact ? ['lead', 'main'] : ['main'];
        // Si la jugada fa escac i el comentari no ho diu, s'afegeix a la frase.
        if (o.isCheck && !parts.some(p => /escac/i.test(p))) parts[0] = parts[0].replace(/\.$/, ', amb escac.');
        let extended = !!leadFact;
        const canExtend = !leadFact && mem.lastExtendedPly < ply - TV_CONFIG.EXTENDED_GAP_PLIES;
        // Definició bàsica: una sola vegada per partida i només si cal.
        if (canExtend && cand.define && o.tier !== 'advanced' && !mem.defined[cand.define.term] && !best.evolved) {
            parts.push(cand.define.text);
            roles.push('extra');
            extended = true;
        } else if (canExtend && cand.extra && !best.evolved && o.tier !== 'basic') {
            parts.push(cand.extra);
            roles.push('extra');
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
            if (secondary) { parts.push(secondary.text); roles.push('extra'); extended = true; }
        }
        return {
            kind: cand.kind, text: parts.join(' '), leadText: text, explanatory: cand.explanatory || !!secondary,
            parts: parts.map((t, i) => ({ role: roles[i] || 'extra', text: t })),
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
            if (chosen.kind === 'summary') {
                mem.lastSummaryPly = ply; mem.summarySig = chosen.sig;
                mem.summaryCount = (isNum(mem.summaryCount) ? mem.summaryCount : 0) + 1;
                if (isNum(chosen.introId)) mem.summaryIntros = [chosen.introId].concat(mem.summaryIntros || []).slice(0, 3);
            }
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
    // Introduccions del resum ('' = sense introducció). Es van alternant
    // sense repetir cap de les tres últimes.
    const TV_SUMMARY_INTROS = ['Balanç de la partida: ', 'Com està la partida: ', 'Situació de la partida: ', 'Fem balanç: ',
        'Una mirada al tauler: ', 'Repassem la posició: ', 'A grans trets, ', 'Si mirem el conjunt, ', 'Ara com ara, ',
        'Per situar-nos: ', ''];
    function tvHash(text) {
        let h = 7;
        const str = String(text || '');
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 1000003;
        return h;
    }
    function tvVariant(list, seed) { return list[((seed % list.length) + list.length) % list.length]; }

    // Valoració de l'anàlisi per al bàndol que ja és el subjecte de la frase,
    // sense tornar a anomenar-lo («les» / «els» s'hi refereixen). Amb also,
    // «també» (el material i l'anàlisi l'afavoreixen tots dos).
    function sameSubjectClauses(band, pawns, also) {
        const level = band.slice(2), t = also ? 'també ' : '';
        if (level === 'slight') return [t + 'les veig una mica millor' + pawns, t + 'estan una mica millor' + pawns];
        if (level === 'clear') return [t + 'els dono un avantatge clar' + pawns, t + 'estan clarament millor' + pawns];
        return [t + 'les veig amb una posició guanyadora' + pawns, 'diria que la seva posició ja és guanyadora' + pawns];
    }

    function joinClauses(a, conj, b) {
        if (conj === 'però') return a + ', però ' + b;
        if (/ i /.test(a)) return a + '; a més, ' + b.replace(/^també /, '');
        return a + ' i ' + b;
    }

    // Valoració en paraules (amb el detall en peons per als avançats).
    function evalClauses(band, pawns) {
        if (band === 'equal') return ['veig la posició equilibrada', 'no hi veig cap avantatge clar',
            'cap bàndol no té un avantatge clar'];
        const who = COLOR[band[0]].pl, level = band.slice(2);
        if (level === 'slight') return ['veig ' + who + ' una mica millor' + pawns,
            'dono un lleuger avantatge a ' + who + pawns, who + ' tenen un petit avantatge' + pawns];
        if (level === 'clear') return ['veig ' + who + ' clarament millor' + pawns,
            'dono un avantatge clar a ' + who + pawns, who + ' tenen un avantatge clar' + pawns];
        return ['veig ' + who + ' amb una posició guanyadora' + pawns,
            'diria que ' + who + ' tenen una posició guanyadora' + pawns, 'ara mateix veig ' + who + ' amb opcions clares de guanyar' + pawns];
    }

    // Resum estratègic (cada 4-6 jugades completes, només si aporta res de
    // nou): material, valoració fiable, seguretat del rei i peons passats.
    // Cada fet es pot dir de diverses maneres i el connector depèn del sentit:
    // «però» si el material i l'anàlisi no apunten al mateix bàndol.
    function tvStrategicSummary(ctx, memory) {
        const c = ctx || {};
        const mem = memory || tvEmptyMemory();
        const H = boardHelpers();
        if (!H) return null;
        const grid = H.parse(c.fenAfter).grid;
        const ma = materialOf(grid);
        const mp = materialPhrase(ma);
        const count = isNum(mem.summaryCount) ? mem.summaryCount : 0;
        // Llavor diferent per a cada resum de cada partida (repetible als tests).
        const seed = tvHash((c.gameId || '') + ':' + count + ':' + (c.ply || 0));
        const sigParts = [mp ? mp.leader + mp.kind + mp.pts : '='];
        const band = c.after && c.after.reliable ? tvEvalBand(c.after.best) : null;
        const clauses = materialClauses(mp, { tagged: true });
        let first;
        if (band) {
            // El detall en peons només per als avançats i mentre té sentit.
            const value = Math.abs(c.after.best.value);
            const pawns = c.tier === 'advanced' && band !== 'equal' && value < 1000
                ? ' (uns ' + (Math.round(value / 10) / 10).toFixed(1).replace('.', ',') + ' peons)' : '';
            const evalSide = band === 'equal' ? null : band[0];
            if (mp && evalSide === mp.leader) {
                // Material i anàlisi van a favor del mateix bàndol.
                const own = tvVariant(clauses.filter(x => x.subject === 'leader'), seed).text;
                first = joinClauses(own, 'i', tvVariant(sameSubjectClauses(band, pawns, true), seed + 3));
            } else {
                const clause = tvVariant(clauses, seed);
                const contrast = (mp && (band === 'equal' || evalSide !== mp.leader)) || (!mp && evalSide);
                // «Les negres tenen un peó de menys, però estan una mica
                // millor»: evitem repetir el subjecte.
                let evs = mp && clause.subject === 'trailer' && evalSide === other(mp.leader)
                    ? sameSubjectClauses(band, pawns, false) : evalClauses(band, pawns);
                if (/cap bàndol/.test(clause.text)) evs = evs.filter(t => !/cap bàndol/.test(t));
                first = joinClauses(clause.text, contrast ? 'però' : 'i', tvVariant(evs, seed + 3));
            }
        } else first = tvVariant(clauses, seed).text;
        sigParts.push(band || '-');
        const second = [];
        if (!mem.endgame && c.ply < 50) {
            const kw = mem.castled.w, kb = mem.castled.b;
            if (kw !== kb) {
                const done = kw ? 'w' : 'b', late = other(done);
                second.push(tvVariant([COLOR[done].pl + ' ja han enrocat i ' + COLOR[late].pl + ' encara tenen el rei al centre',
                    'el rei ' + COLOR[late].adj + ' continua al centre, mentre que el ' + COLOR[done].adj + ' ja està enrocat',
                    COLOR[late].pl + ' encara no han enrocat; ' + COLOR[done].pl + ' ja tenen el rei enrocat'], seed + 11));
                sigParts.push(done);
            }
        }
        let passedStart = null;
        ['w', 'b'].forEach((side) => {
            const passed = Array.from(pawnStructure(grid, side).passed).sort();
            let options = [];
            if (passed.length === 1) {
                const sq = passed[0];
                // Sense caselles: el resum el llegeix en Grau.
                const zone = 'abc'.indexOf(sq[0]) !== -1 ? 'al flanc de dama' : 'de'.indexOf(sq[0]) !== -1 ? 'al centre' : 'al flanc de rei';
                options = [COLOR[side].pl + ' tenen un peó passat ' + zone,
                    'hi ha un peó passat ' + COLOR[side].adj + ' ' + zone,
                    'el peó passat ' + COLOR[side].adj + ' no té cap peó ' + COLOR[other(side)].adj + ' que li barri el pas'];
                sigParts.push(side + sq);
            } else if (passed.length > 1) {
                options = [COLOR[side].pl + ' tenen ' + numWord(passed.length) + ' peons passats',
                    'hi ha ' + numWord(passed.length) + ' peons passats ' + (side === 'w' ? 'blancs' : 'negres')];
                sigParts.push(side + passed.length);
            }
            if (!options.length) return;
            // Si tots dos bàndols en tenen, la segona frase no comença igual.
            const start = t => t.split(' ').slice(0, 2).join(' ');
            const fresh = passedStart ? options.filter(t => start(t) !== passedStart) : options;
            const pick = tvVariant(fresh.length ? fresh : options, seed + 13);
            passedStart = start(pick);
            second.push(pick);
        });
        // La novetat es mesura pel CONTINGUT (balanç, valoració, reis i peons
        // passats que es diuen), no per la manera de dir-ho.
        const sig = sigParts.join('|') + '#' + second.length;
        if (sig === mem.summarySig) return null;
        // «Material igualat» tot sol no és cap novetat.
        if (!mp && !band && !second.length) return null;
        const recent = Array.isArray(mem.summaryIntros) ? mem.summaryIntros : [];
        let introId = seed % TV_SUMMARY_INTROS.length;
        for (let i = 0; i < TV_SUMMARY_INTROS.length && recent.indexOf(introId) !== -1; i++) introId = (introId + 1) % TV_SUMMARY_INTROS.length;
        const intro = TV_SUMMARY_INTROS[introId];
        let text = (intro ? intro + first : capFirst(first)) + '.';
        if (second.length) text += ' ' + capFirst(second.slice(0, 2).join('; ')) + '.';
        return { kind: 'summary', text: text, leadText: text, explanatory: true, key: 'summary', sig: sig, family: 'summary', variantId: 0,
            extended: second.length > 0 || !!band, defined: null, tags: { color: null, squares: [] }, payload: null, evolved: false, secondary: null,
            introId: introId };
    }

    // Els fils observats s'actualitzen a cada jugada. La marca saidPly
    // indica què ha aparegut en pantalla i permet reprendre només allò narrat.
    function tvConflictSeeds(candidates, move) {
        return candidates.flatMap(cand => {
            const tags = cand.tags || {};
            const squares = tags.squares || [];
            if (cand.kind === 'pressure' && cand.payload && cand.payload.pressure) {
                const p = cand.payload.pressure;
                return [{ kind: 'pressure', color: p.color, square: p.targetSq, piece: p.targetType, candidate: cand.key, weight: 4 }];
            }
            if (['threat', 'threat-pawn'].includes(cand.kind) && cand.payload && cand.payload.threats) {
                return cand.payload.threats.map(t => ({ kind: 'threat', color: t.attackerColor, square: t.targetSq, piece: t.targetType,
                    attacker: t.attackerSq, attackerType: t.attackerType, mode: t.mode, candidate: cand.key, weight: 5 }));
            }
            if (['passed-new', 'passed-advance'].includes(cand.kind) && squares[0])
                return [{ kind: 'passed', color: tags.color, square: squares[0], piece: 'p', candidate: cand.key, weight: 4 }];
            if (['open-file', 'doubled-rooks'].includes(cand.kind))
                return [{ kind: 'file', color: move.color, square: move.to[0], candidate: cand.key, weight: 3 }];
            if (cand.kind === 'king-pressure' && squares[0])
                return [{ kind: 'king', color: tags.color, square: squares[0], piece: move.piece, candidate: cand.key, weight: 3 }];
            if (cand.kind === 'center') {
                const targets = (cand.sig || '').split(',').filter(sq => CENTER_SQUARES.includes(sq));
                const square = targets[0] || move.to;
                if (CENTER_SQUARES.includes(square))
                    return [{ kind: 'center', color: move.color, square: square, candidate: cand.key, weight: 2 }];
            }
            return [];
        });
    }

    function tvConflictPosition(t, H, grid, fen, ChessCtor) {
        const rival = other(t.color);
        const piece = gridAt(grid, t.square);
        if (t.kind === 'passed') {
            if (!piece || piece.c !== t.color || piece.t !== 'p' || !pawnStructure(grid, t.color).passed.has(t.square)) return null;
            const rank = Number(t.square[1]) + (t.color === 'w' ? 1 : -1);
            const ahead = t.square[0] + rank;
            const blocker = gridAt(grid, ahead);
            return { blocker: blocker && blocker.c === rival ? blocker.t : null, ahead: ahead, clear: !blocker };
        }
        if (t.kind === 'file') {
            const pawns = fileCounts(grid, 'abcdefgh'.indexOf(t.square));
            const onFile = side => piecesOf(grid, side).filter(p => p.sq[0] === t.square && ['q', 'r'].includes(p.t));
            const own = onFile(t.color);
            const opposing = onFile(rival);
            if (!own.length || pawns[t.color]) return null;
            return { own: own, opposing: opposing, pawns: pawns[rival] };
        }
        if (t.kind === 'center') {
            const hits = attackersAt(H, grid, t.square, t.color).length;
            return hits || (piece && piece.c === t.color) ? { count: hits, owner: piece && piece.c } : null;
        }
        if (t.kind === 'king') {
            const king = kingSq(grid, rival);
            if (!king || !piece || piece.t !== t.piece || piece.c !== t.color) return null;
            const count = targetsFrom(H, grid, t.square).filter(sq => sq !== king && chebyshev(sq, king) === 1).length;
            return count ? { count: count, king: king } : null;
        }
        if (!piece || piece.t !== t.piece || piece.c !== rival) return null;
        const attacks = attackersAt(H, grid, t.square, t.color).length;
        const defenders = attackersAt(H, grid, t.square, rival).length;
        if (t.kind === 'pressure') return { count: attacks, defenders: defenders };
        const attacker = gridAt(grid, t.attacker);
        if (!attacker || attacker.t !== t.attackerType || attacker.c !== t.color) return null;
        const canCapture = fen.split(' ')[1] === t.color
            ? !!applyUci(ChessCtor, fen, t.attacker + t.square) || (t.attackerType === 'p' && !!applyUci(ChessCtor, fen, t.attacker + t.square + 'q'))
            : legalCaptureExists(ChessCtor, fen, t.attacker, t.square);
        return { count: attacks, defenders: defenders, canCapture: canCapture };
    }

    // seq: comptador de la partida perquè les variants vagin rotant.
    function tvConflictTransition(t, next, before, after, move, seq) {
        const turn = isNum(seq) ? seq : tvHash(t.id + ':' + move.to);
        const sq = t.square;
        // Sense caselles: la peça amb el color del bàndol que la té.
        const victim = t.piece ? pieceNP(t.piece, other(t.color)) : '';
        const captured = move.captured && ((move.flags || '').includes('e') ? move.to[0] + move.from[1] : move.to);
        const focus = {
            passed: 'el peó passat ' + COLOR[t.color].adj,
            file: 'la columna ' + (before.pawns ? 'semioberta' : 'oberta') + ' que ocupaven ' + COLOR[t.color].pl,
            king: 'la seguretat del rei',
            center: 'la lluita pel centre',
            pressure: 'la pressió sobre ' + victim,
            threat: 'l’amenaça sobre ' + victim
        }[t.kind];
        const event = (kind, answer, question, followQuestion) => ({ kind, focus, answer, question, followQuestion,
            topic: t.id, weight: t.weight, introducedPly: t.introducedPly, threadKind: t.kind });
        const rivalMoved = move.color !== t.color;
        if (t.kind === 'passed') {
            if (rivalMoved && captured === sq)
                return event('resolved', 'L’han capturat. Aquest peó ja no arribarà a coronar.',
                    'Què ha passat amb el peó passat ' + COLOR[t.color].adj + '?', 'Què se n’ha fet?');
            if (after && after.blocker && (!before.blocker || sq !== next.square))
                return event('defence', 'Ara ' + pieceNP(after.blocker, other(t.color)) + ' se li planta just al davant i el bloqueja.',
                    'Com frenen el peó passat ' + COLOR[t.color].adj + '?', 'Com el frenen?');
            if (after && before.blocker && after.clear && next.square === sq)
                return event('transformed', 'La casella del davant ha quedat lliure. El peó ja no té la peça rival al pas.',
                    'Què ha canviat per al peó passat ' + COLOR[t.color].adj + '?', 'Què li ha obert el pas?');
            if (after && sq !== next.square) {
                const left = t.color === 'w' ? 8 - Number(next.square[1]) : Number(next.square[1]) - 1;
                return event('reinforced', 'Fa un pas més: ' +
                    (left === 1 ? 'ja només li falta una casella per coronar.' : 'li falten ' + numWord(left, true) + ' caselles per coronar.'),
                    'A quina distància de coronar queda el peó passat ' + COLOR[t.color].adj + '?', 'Quant li falta per coronar?');
            }
        }
        if (t.kind === 'file' && !after && move.piece === 'p' && move.color === t.color &&
                move.to[0] === sq && move.from[0] !== sq)
            return event('resolved',
                'Ara hi ha entrat un peó de ' + COLOR[t.color].pl + '. La columna ja té un peó propi.',
                'Què ha tancat el pas per aquesta columna?');
        if (t.kind === 'file' && !after && before.own.length === 1) {
            const last = before.own[0];
            if (captured === last.sq || move.from === last.sq) {
                return event('resolved', 'La columna ha quedat sense cap torre ni dama de ' + COLOR[t.color].pl + '.',
                    'Qui ha deixat de tenir una peça major en aquesta columna?');
            }
        }
        if (t.kind === 'file' && after) {
            if (before.pawns && !after.pawns)
                return event('transformed',
                    'La columna queda oberta. La peça major de ' + COLOR[t.color].pl + ' ja no hi té cap peó al davant.',
                    'Què canvia ara en aquesta columna?');
            if (!before.opposing.length && after.opposing.length)
                return event('defence', capFirst(COLOR[other(t.color)].pl) + ' hi planten ' +
                    pieceShort(after.opposing[0].t) + ' per disputar-la. Ara hi ha peces majors de tots dos bàndols.',
                    'Com li disputen la columna?');
            if (before.own.filter(p => p.t === 'r').length < 2 && after.own.filter(p => p.t === 'r').length >= 2)
                return event('reinforced', 'Les dues torres del mateix bàndol queden alineades en aquesta columna.',
                    'Com reforcen la presència en aquesta columna?');
        }
        if (t.kind === 'king') {
            if (rivalMoved && move.piece === 'k' && move.from === before.king && (!after || after.count < before.count))
                return event('defence',
                    capFirst(pieceNP(t.piece, t.color)) + (after ? ' ja controla menys caselles al voltant del rei.'
                        : ' ja no controla cap casella al voltant del rei.'));
        }
        if (t.kind === 'center' && rivalMoved && move.to === sq && before.owner !== move.color)
            return event('transformed', capFirst(COLOR[move.color].pl) + ' entren al centre' +
                (after && after.count ? ', en una casella que encara vigilen ' + COLOR[t.color].pl + '.' : '.'));
        if (t.kind !== 'pressure' && t.kind !== 'threat') return null;
        if (!rivalMoved && captured === sq)
            return event('resolved', capFirst(pieceNP(move.piece, move.color)) + ' ha capturat ' + victim + '.',
                'Com s’ha resolt ' + focus + '?');
        if (rivalMoved && move.from === sq) {
            const stillAttacked = next.targetStillAttacked;
            return event('resolved',
                stillAttacked ? tvVariant(['La peça s’aparta, però continua atacada.', 'Fuig, però no del tot: encara és sota atac.'], turn)
                    : tvVariant(['La peça s’aparta de la pressió i ja no l’apunta cap peça rival.', 'Fora de perill: ja no l’ataca cap peça rival.',
                        'S’escapa de l’atac. Ara ningú no l’amenaça.', 'Problema resolt: la peça ja és a recer.'], turn),
                move.captured ? 'Amb la captura, ' + victim + ' surt de perill?'
                    : (move.color === 'w' ? -1 : 1) * (Number(move.to[1]) - Number(move.from[1])) > 0
                        ? 'La retirada ha tret ' + victim + ' de perill?'
                        : 'Amb aquesta jugada, ' + victim + ' surt de perill?');
        }
        if (t.kind === 'threat' && rivalMoved && !after && captured === t.attacker)
            return event('resolved', 'Han eliminat la peça atacant.');
        if (t.kind === 'threat' && rivalMoved && after && !after.canCapture)
            return event('defence', 'L’atacant ja no la pot capturar.');
        if (t.kind === 'pressure' && after && after.count < before.count) {
            const answer = after.count === 0 ? 'Ara cap peça rival l’apunta.'
                : after.count === 1 ? 'Ara només l’apunta una peça.'
                : 'Ara l’apunten ' + numWord(after.count, true) + ' peces, menys que abans.';
            return event(after.count === 0 ? 'resolved' : 'defence', answer);
        }
        if (after && rivalMoved && after.defenders > before.defenders) {
            const pronoun = piecePronoun(t.piece);
            const present = after.defenders === 1 ? 'Ara ' + pronoun + ' defensa una peça.'
                : 'Ara ' + pronoun + ' defensen ' + numWord(after.defenders, true) + ' peces.';
            return event('defence', present +
                (before.defenders === 0 ? ' Abans no en tenia cap.' : ' Abans en tenia ' + numWord(before.defenders, true) + '.'),
                'Com queda defensat l’objectiu de l’atac?');
        }
        if (after && !rivalMoved && after.count > before.count)
            return event('reinforced', 'Ara l’apunten ' +
                numWord(after.count, true) + ' peces. Abans l’apuntaven ' + numWord(before.count, true) + '.');
        return null;
    }

    const TV_CONFLICT_SPAN = 32;

    function tvTrackConflicts(c, chosen, memory, candidates) {
        const H = boardHelpers();
        if (!H || !c.ChessCtor || !c.fenAfter || !c.move || !Number.isInteger(c.ply)) return null;
        const move = c.move;
        const grid = H.parse(c.fenAfter).grid;
        const observe = thread => tvConflictPosition(thread, H, grid, c.fenAfter, c.ChessCtor);
        const events = [];
        const active = [];
        for (const t of memory.conflicts || []) {
            const heard = Number.isInteger(t.saidPly);
            if (c.ply - Math.max(t.changedPly, t.saidPly ?? -1) > (heard ? TV_CONFLICT_SPAN : 12)) continue;
            const pieceMoved = t.piece && move.from === t.square && (['passed', 'king'].includes(t.kind) ? move.color === t.color : false);
            const next = { ...t, priorSaidPly: t.saidPly, square: pieceMoved ? move.to : t.square };
            const after = observe(next);
            if ((t.kind === 'pressure' || t.kind === 'threat') && move.color !== t.color && move.from === t.square)
                next.targetStillAttacked = attackersAt(H, grid, move.to, t.color).length > 0;
            const change = tvConflictTransition(t, next, t.fact, after, move, memory.conflictSeq);
            if (change && heard && c.ply - t.saidPly <= TV_CONFLICT_SPAN &&
                    (t.lastEvent !== change.kind || c.ply - t.lastEventPly >= 8)) events.push(change);
            if (!after || (next.kind === 'pressure' && after.count < 2) ||
                    (next.kind === 'threat' && (!after.canCapture || (next.mode === 'loose' && after.defenders)))) continue;
            if (JSON.stringify(after) !== JSON.stringify(t.fact) || next.square !== t.square) next.changedPly = c.ply;
            active.push({ ...next, fact: after });
        }
        const said = thread => chosen && (chosen.key === thread.candidate ||
            (chosen.secondary && chosen.secondary.key === thread.candidate));
        for (const seed of tvConflictSeeds(candidates, move)) {
            const match = active.find(t => t.kind === seed.kind && t.color === seed.color && t.square === seed.square &&
                t.attacker === seed.attacker);
            if (match) {
                if (said(seed)) {
                    match.candidate = seed.candidate;
                    match.saidPly = c.ply;
                    match.introducedPly ??= c.ply;
                }
                continue;
            }
            const fact = observe(seed);
            if (!fact || (seed.kind === 'pressure' && fact.count < 2) ||
                    (seed.kind === 'threat' && (!fact.canCapture || (seed.mode === 'loose' && fact.defenders)))) continue;
            const id = [seed.kind, seed.color, seed.square, seed.attacker || '', c.ply].join(':');
            active.push({ ...seed, id, fact, changedPly: c.ply, priorSaidPly: null,
                introducedPly: said(seed) ? c.ply : null, saidPly: said(seed) ? c.ply : null });
        }
        // Una amenaça tàctica encara no comentada no desplaça el fil que
        // l’espectador segueix. El segon lloc permet seguir el contrajoc.
        const weight = t => t.weight + (['passed', 'file', 'king'].includes(t.kind || t.threadKind) ? 2 : 0);
        active.sort((a, b) => Number(Number.isInteger(b.saidPly)) - Number(Number.isInteger(a.saidPly)) ||
            weight(b) - weight(a) || b.changedPly - a.changedPly);
        memory.conflicts = active.slice(0, 2);
        const eventRank = { resolved: 4, transformed: 3, defence: 2, reinforced: 1 };
        events.sort((a, b) => eventRank[b.kind] - eventRank[a.kind] || weight(b) - weight(a));
        if (events.length) memory.conflictSeq = (isNum(memory.conflictSeq) ? memory.conflictSeq : 0) + 1;
        return events[0] || null;
    }

    // Amb la visió d'en Grau, la resposta parla d'intencions i no de caselles.
    function tvCompareVariants(c, vision, ids) {
        const a = c.before;
        const b = a && a.second;
        const m = c.move;
        if (!a || !a.reliable || a.fen !== c.fenBefore || !b || b.depth !== a.depth ||
                !a.best || a.best.type !== 'cp' || !b.score || b.score.type !== 'cp' ||
                !isNum(a.best.value) || !isNum(b.score.value) || !Array.isArray(a.pv) || !Array.isArray(b.pv)) return null;
        const first = a.pv[0], second = b.pv[0];
        const played = m.from + m.to + (m.promotion || '');
        if (!first || !second || first === second || a.bestUci !== first || b.uci !== second ||
                (played !== first && played !== second)) return null;
        const gap = (a.best.value - b.score.value) * (m.color === 'w' ? 1 : -1);
        if (gap < 75) return null;
        const walk = line => {
            // Comprova l'arrencada i la resposta que es pot arribar a narrar.
            const start = applyUci(c.ChessCtor, c.fenBefore, line[0]);
            const reply = start && applyUci(c.ChessCtor, start.fen, line[1]);
            return start && reply ? { start: start, reply: reply } : null;
        };
        const bestLine = walk(a.pv), otherLine = walk(b.pv);
        if (!bestLine || !otherLine) return null;
        // Només preguntem per una alternativa quan la resposta prevista té una conseqüència tàctica.
        const tacticalReply = move => !!(move.captured || move.promotion || /[+#]$/.test(move.san || ''));
        if (!tacticalReply(otherLine.reply.move) ||
                (tacticalReply(bestLine.reply.move) && bestLine.reply.move.san === otherLine.reply.move.san)) return null;
        if (vision && typeof vision.intentAt === 'function') {
            const fav = vision.intentAt(c.ChessCtor, c.fenBefore, first, { prev: c.prevMove, ids: ids });
            const alt = vision.intentAt(c.ChessCtor, c.fenBefore, second, { prev: c.prevMove, ids: ids });
            const rep = vision.intentAt(c.ChessCtor, otherLine.start.fen, b.pv[1], { prev: otherLine.start.move });
            const altAction = moveAction(c.ChessCtor, c.fenBefore, second);
            // Sense caselles, dues opcions que es diuen igual no es poden comparar.
            if (fav && alt && rep && altAction && fav.inf !== alt.inf) {
                const rival = COLOR[other(m.color)].pl;
                return { kind: 'variant', key: 'variant:' + second + ':' + b.pv[1], topic: 'variant:' + m.color,
                    question: played === first ? 'I si haguessin triat ' + alt.inf + '?' : 'Quin risc té aquesta jugada?',
                    answer: played === first ? 'En la línia que analitzo, ' + rival + ' ' + rep.cond + '.'
                        : 'En la línia que analitzo, ' + rival + ' ' + rep.cond + '. Jo preferia ' + fav.inf + '.' };
            }
            if (fav && alt && fav.inf === alt.inf) return null;
        }
        function action(fen, uci, move) {
            if (move.piece === 'p' && !move.captured && !move.promotion && !/[+#]$/.test(move.san))
                return 'jugar el peó a ' + move.to;
            return moveAction(c.ChessCtor, fen, uci);
        }
        const favoured = action(c.fenBefore, first, bestLine.start.move);
        const alternative = action(c.fenBefore, second, otherLine.start.move);
        if (!favoured || !alternative) return null;
        const reply = otherLine.reply.move;
        const counter = action(otherLine.start.fen, b.pv[1], reply);
        if (!counter) return null;
        return { kind: 'variant', key: 'variant:' + second + ':' + b.pv[1], topic: 'variant:' + m.color,
            question: played === first ? 'Com podria respondre el rival a l’opció de ' + alternative + '?'
                : 'Quina resposta tàctica hi veus, Grau?',
            answer: 'En aquesta variant, el rival té l’opció de ' + counter + '.' +
                (played === second ? ' Jo preferia ' + favoured + '.' : '') };
    }

    // Comprovem la captura concreta i el torn posterior. Una peça que
    // geomètricament apunta una casella pot estar clavada i no defensar-la.
    function tvDefenceProof(c, target) {
        const move = c.move;
        const before = new c.ChessCtor(c.fenBefore);
        const after = new c.ChessCtor(c.fenAfter);
        const victim = after.get(target);
        if (!victim || victim.color !== move.color || target === move.to) return null;
        const previous = before.get(target);
        if (!previous || previous.type !== victim.type || previous.color !== victim.color) return null;
        const attackers = after.moves({ verbose: true }).filter(m => m.to === target && m.captured);
        for (const attacker of attackers) {
            const fields = c.fenBefore.split(' ');
            fields[1] = attacker.color;
            fields[3] = '-';
            const old = new c.ChessCtor(fields.join(' '));
            const original = old.moves({ square: attacker.from, verbose: true })
                .find(m => m.to === target && m.captured && m.promotion === attacker.promotion);
            if (!original) continue;
            old.move(original);
            const prior = old.moves({ square: move.from, verbose: true }).some(m => m.to === target && m.captured);
            if (prior) continue;

            after.move(attacker);
            const recapture = after.moves({ square: move.to, verbose: true }).some(m => m.to === target && m.captured);
            after.undo();
            if (recapture) return { target: target, victim: victim.type, attacker: attacker };
        }
        return null;
    }

    function tvTacticalDialogue(c, chosen, candidates, event, urgent) {
        const move = c.move;
        const fact = (kind, key, focus, answer, candidate) =>
            ({ kind: kind, key: [kind, move.color, key].join(':'), focus: focus, answer: answer, candidate: candidate });
        const selected = candidates.find(item => item.key === chosen.key && item.kind === chosen.kind);
        const secondary = chosen.secondary && candidates.find(item => item.key === chosen.secondary.key);
        const useful = [selected, secondary].filter(Boolean);
        if (!urgent) useful.push(...candidates.filter(item => !useful.includes(item) &&
            ['defend', 'threat-pawn', 'pressure'].includes(item.kind)));

        for (const candidate of useful) {
            const threat = (candidate.payload && candidate.payload.threats || []).filter(t =>
                t.attackerSq === move.to && !tacticalCapture(c.ChessCtor, c.fenBefore, move.color, move.from, t.targetSq));
            if (threat.length && ['fork', 'threat', 'threat-pawn'].includes(candidate.kind)) {
                const targets = threat.map(t => shortOn(t.targetType, t.targetSq));
                const subject = capFirst(pieceNP(move.piece, move.color));
                const answer = subject + ' amenaça de capturar ' + targets.join(' i també ') + '.';
                // «I també» enumera dues captures possibles, no una captura doble.
                return fact('move', 'atac:' + move.piece + ':' + threat.map(t => t.targetSq).sort().join(','), null, answer, candidate.key);
            }
            if (['reply', 'defend'].includes(candidate.kind)) {
                for (const square of candidate.tags?.squares || []) {
                    const proof = tvDefenceProof(c, square);
                    if (!proof) continue;
                    const victim = shortOn(proof.victim, square);
                    const attacker = shortOn(proof.attacker.piece, proof.attacker.from);
                    const answer = 'Si ' + attacker + ' captura a ' + square + ', ' +
                        pieceNP(move.piece, move.color) + ' hi pot recapturar.';
                    const defence = fact('defence', 'recaptura:' + square + ':' + proof.attacker.from + ':' + move.piece,
                        'la pressió sobre ' + victim, answer, candidate.key);
                    defence.recapture = true;
                    const victimNP = pieceNP(proof.victim, move.color), it = piecePronoun(proof.victim);
                    defence.question = tvVariant([
                        'Com responen a la pressió sobre ' + victimNP + ' si el rival ' + it + ' captura?',
                        'Si el rival captura ' + victimNP + ', hi ha resposta?',
                        'Què passa si el rival es queda ' + victimNP + '?',
                        capFirst(victimNP) + ' està ' + agree(proof.victim, 'ben defensat', 'ben defensada') + ' si el rival ' + it + ' captura?'
                    ], tvHash(String(move.san || '') + ':' + square));
                    if (event && event.topic.split(':')[2] === square) defence.topic = event.topic;
                    return defence;
                }
            }
        }

        const exposedCapture = chosen.kind === 'hanging' && chosen.tags?.squares?.includes(move.to);
        if (!move.captured || (urgent && !exposedCapture)) return null;
        const board = new c.ChessCtor(c.fenAfter);
        const replies = board.moves({ verbose: true }).filter(m => m.captured &&
            ((m.flags || '').includes('e') ? m.to[0] + m.from[1] : m.to) === move.to);
        const reply = replies[0];
        if (!reply && (exposedCapture || PIECE_VALUE[move.captured] < 3)) return null;
        const answer = reply ? 'El rival té una recaptura legal amb ' + shortOn(reply.piece, reply.from) + ', a ' + reply.to + '.'
            : 'Cap peça rival no pot recapturar immediatament a ' + move.to + '.';
        return { ...fact('move', 'canvi:' + move.to + ':' + (reply ? reply.from : '-'), null, answer, chosen.key),
            question: 'El rival té cap recaptura immediata?' };
    }

    // Deu maneres de preguntar pel mateix fet. L'acció i el subjecte es
    // construeixen amb la jugada legal que s'acaba de fer.
    const TV_MOVE_QUESTIONS = [
        ({ does }) => 'Què canvia quan ' + does + '?',
        ({ action }) => 'Quin sentit té ' + action + '?',
        ({ at }) => 'Què aporta ' + at + '?',
        ({ does }) => 'Ara que ' + does + ', en què canvia la posició?',
        ({ action }) => 'Què implica per al seu bàndol ' + action + '?',
        ({ does }) => capFirst(does) + '. Quina conseqüència té?',
        ({ action }) => 'Com hem d’entendre la decisió de ' + action + '?',
        ({ at }) => 'En què ens hem de fixar ara amb ' + at + '?',
        ({ subjunctive }) => 'Quina diferència fa que ' + subjunctive + '?',
        ({ action }) => 'Quin efecte té ' + action + ' en aquesta posició?'
    ];

    function tvMoveQuestion(move, index, focus) {
        const piece = pieceNP(move.piece, move.color);
        const at = piece + ' a ' + move.to;
        const castle = /[kq]/.test(move.flags || '');
        const flank = (move.flags || '').includes('k') ? 'curt' : 'llarg';
        const verb = castle ? ['enroca ', 'enroqui ', flank + ' a ' + move.to]
            : move.captured ? ['captura a ', 'capturi a ', move.to] : ['va a ', 'vagi a ', move.to];
        const action = castle ? 'fer l’enroc ' + flank + ' amb ' + at
            : (move.captured ? 'capturar amb ' : 'portar ') + at;
        const template = TV_MOVE_QUESTIONS[index];
        const question = template({ at: at, does: piece + ' ' + verb[0] + verb[2], action: action,
            subjunctive: piece + ' ' + verb[1] + verb[2] });
        const prefix = index % 4 === 0 ? 'Grau, ' : '';
        // «Pel que fa al peó passat», no «a el peó passat».
        if (focus) return prefix + (prefix ? 'pel' : 'Pel') + ' que fa ' + aNP(focus) + ', ' + question[0].toLowerCase() + question.slice(1);
        return prefix ? prefix + question[0].toLowerCase() + question.slice(1) : question;
    }

    // ------------------------------------------------------------------
    // La veu de l'Èlia: intencions, sense caselles (amb visiograu.js)
    // ------------------------------------------------------------------
    // Comentaris que només descriuen la jugada: l'Èlia en diu la intenció.
    const ELIA_MOVE_KINDS = { describe: true, development: true, activation: true, castle: true, capture: true, recapture: true,
        center: true, 'open-file': true, diagonal: true, seventh: true, 'doubled-rooks': true, 'king-activity': true,
        'out-of-check': true, check: true };
    function tvEliaSay(c, chosen, vision, memory) {
        if (!chosen || !chosen.text) return chosen ? chosen.text : null;
        if (!vision || typeof vision.clean !== 'function' || typeof vision.sayMove !== 'function') return chosen.text;
        try {
            const visio = memory && memory.visio;
            const intent = c.move && !c.end ? vision.sayMove(c, visio) : null;
            const clean = t => vision.clean(t, c, visio);
            const out = [];
            let usedIntent = false;
            const useIntent = () => { if (!usedIntent && intent) { out.push(intent); usedIntent = true; } };
            const parts = Array.isArray(chosen.parts) && chosen.parts.map(p => p.text).join(' ') === chosen.text
                ? chosen.parts : [{ role: 'main', text: chosen.text }];
            for (const part of parts) {
                if (part.role === 'lead' || (part.role === 'main' && ELIA_MOVE_KINDS[chosen.kind])) { useIntent(); continue; }
                // «Era la millor jugada»: primer, quina jugada.
                if (part.role === 'main' && chosen.kind === 'only-move') useIntent();
                // La forquilla o la clavada ja dites per la intenció no es repeteixen.
                if (part.role === 'main' && usedIntent && ((/^fork/.test(chosen.kind) && /forquilla/.test(intent)) ||
                        (chosen.kind === 'pin' && /\bclav/.test(intent)))) continue;
                // La millor alternativa, també per la intenció.
                if (part.role === 'main' && (chosen.kind === 'missed' || chosen.kind === 'missed-mate') && c.before && c.before.bestUci &&
                        typeof vision.intentAt === 'function') {
                    const alt = vision.intentAt(c.ChessCtor, c.fenBefore, c.before.bestUci,
                        { prev: c.prevMove, ids: visio && visio.prevIds, noDemo: true });
                    if (alt) {
                        const side = COLOR[c.move.color].pl;
                        const pawns = /cedeix uns ([\d,]+) peons/.exec(part.text);
                        const mate = /mat en (\d+)/.exec(part.text);
                        const tail = pawns ? ': amb la jugada feta cedeixen uns ' + pawns[1] + ' peons.' : '.';
                        out.push(mate ? 'Hi veia mat en ' + mate[1] + ' per a ' + side + ' amb una altra jugada: ' + alt.inf + '.'
                            : tvVariant(['Per a ' + side + ', trobava millor ' + alt.inf + tail, 'Jo hauria preferit ' + alt.inf + tail,
                                'Em semblava millor ' + alt.inf + tail, capFirst(side) + ' tenien una opció millor: ' + alt.inf + tail],
                                isNum(chosen.variantId) ? chosen.variantId : c.ply || 0));
                        continue;
                    }
                }
                part.text.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÝÈÉÍÒÓÚ«])/u).forEach(sentence => {
                    const ok = clean(sentence);
                    if (ok) out.push(ok);
                });
            }
            if (!out.length) useIntent();
            const say = out.join(' ').trim();
            return say && !/\b[a-h][1-8]\b/.test(say) ? say : (intent || chosen.text);
        } catch (err) { return chosen.text; }
    }

    // Preguntes de l'Èlia sobre el perquè. Abans, ella diu què s'ha jugat
    // (sense caselles); la intenció la respon en Grau.
    const TV_WHY_QUESTIONS = [
        ({ side }) => 'Què hi busquen ' + side + '?',
        () => 'Quin sentit té aquesta jugada?',
        () => 'Què canvia amb aquesta jugada?',
        () => 'Per què ara?',
        () => 'Quina és la idea?',
        ({ side }) => 'Què implica per a ' + side + '?',
        () => 'Com l’hem d’entendre?',
        () => 'En què ens hem de fixar?',
        () => 'Quina conseqüència té?',
        () => 'Quin efecte té en la posició?'
    ];
    // Lliga de llegendes: la mateixa pregunta, pel nom del jugador que mou (m)
    // o del rival (r). Es fan servir en alternança amb les generals.
    const TV_WHY_NAMED = [
        ({ m }) => 'Què hi busca ' + m + '?',
        ({ m }) => 'Quina és la idea ' + tvDeName(m) + '?',
        ({ m }) => 'Per què ho juga ara ' + m + '?',
        ({ r }) => 'Què canvia per a ' + r + '?',
        ({ r }) => 'Què ha de vigilar ara ' + r + '?',
        ({ m }) => 'En què pensa ' + m + '?',
        ({ m }) => 'Com hem d’entendre la decisió ' + tvDeName(m) + '?'
    ];
    function tvWhyQuestion(c, index, focus) {
        const names = c.legends && c.legends.names;
        const question = names && names.w && names.b && index % 2 === 0
            ? TV_WHY_NAMED[(index / 2 + (isNum(c.ply) ? c.ply : 0)) % TV_WHY_NAMED.length]({ m: names[c.move.color], r: names[other(c.move.color)] })
            : TV_WHY_QUESTIONS[index % TV_WHY_QUESTIONS.length]({ side: COLOR[c.move.color].pl });
        const prefix = index % 4 === 0 ? 'Grau, ' : '';
        if (focus) return prefix + (prefix ? 'pel' : 'Pel') + ' que fa ' + aNP(focus) + ', ' + question[0].toLowerCase() + question.slice(1);
        return prefix ? prefix + question[0].toLowerCase() + question.slice(1) : question;
    }

    // Ordre dels diàlegs: 1) un fil de conflicte que es resol; 2) el
    // seguiment d'una previsió d'en Grau (s'ha complert o un bàndol se n'ha
    // sortit); 3) els altres canvis dels fils de conflicte; 4) un dilema
    // comprovat amb dues variants; 5) el pla de les properes jugades;
    // 6) una conseqüència tàctica de la jugada.
    function tvAddDialogue(c, chosen, memory, event, urgent, candidates, vision, visionEvent) {
        if (!chosen || !c.move || !c.ChessCtor || c.end || !Number.isInteger(c.ply) ||
                c.move.promotion || /[+#]$/.test(c.move.san || '') ||
                (urgent && !['reply', 'threat', 'fork', 'hanging'].includes(chosen.kind))) return chosen;
        const gap = c.ply - (memory.lastDialoguePly ?? -100);
        const squares = chosen.tags && chosen.tags.squares || [];
        const conflict = event && !c.prepared && (!urgent || squares.includes(event.topic.split(':')[2]));
        const move = describeMove(c.move, false).variants
            .reduce((shorter, text) => text.length < shorter.length ? text : shorter);
        // L’Èlia anuncia la jugada. En Grau n’explica la conseqüència.
        const neutral = (vision && typeof vision.describeMove === 'function' ? vision.describeMove(c, memory.visio) : null) || move;
        const vctx = Object.assign({}, c, { moveText: neutral });
        const visio = () => (memory.visio && typeof memory.visio === 'object') ? memory.visio : null;
        let exchange = null;
        if (gap >= 1 && conflict && event.kind === 'resolved') exchange = event;
        if (!exchange && vision && visionEvent && !urgent && gap >= 1) {
            try {
                const f = vision.follow(vctx, visionEvent, visio());
                if (f && f.turns) exchange = { kind: f.kind, turns: f.turns, visio: f.memory };
            } catch (err) { /* sense seguiment: el comentari continua */ }
        }
        if (!exchange && gap >= 1 && conflict) {
            // Una defensa es pot explicar amb la recaptura legal concreta, si existeix.
            const proof = event.kind === 'defence' ? tvTacticalDialogue(c, chosen, candidates, event, urgent) : null;
            exchange = proof && proof.topic === event.topic
                ? { ...event, answer: proof.answer, question: proof.question, followQuestion: 'Què passa si el rival fa la captura?',
                    key: proof.key, recapture: true } : event;
            // Si la línia de Stockfish torna a la mateixa casella, en Grau ho avança.
            const square = String(event.topic || '').split(':')[2];
            if (vision && square && /^[a-h][1-8]$/.test(square)) {
                try {
                    const t = vision.tail(vctx, square, visio());
                    if (t && t.text && wordCount(exchange.answer + ' ' + t.text) <= 30)
                        exchange = { ...exchange, tail: t.text, visio: t.memory };
                } catch (err) { /* el fil es comenta igualment */ }
            }
        }
        if (!exchange && !urgent && !c.prepared && gap >= 1 && c.ply >= 8 && c.ply - (memory.lastVariantPly ?? -100) >= 12)
            exchange = tvCompareVariants(c, vision, memory.visio && memory.visio.prevIds);
        if (!exchange && vision && !urgent && !c.prepared && gap >= 2 && chosen.kind !== 'summary') {
            try {
                const p = vision.plan(vctx, visio());
                if (p && p.turns) exchange = { kind: 'plan', turns: p.turns, visio: p.memory, forecast: p.forecast, theme: p.theme };
            } catch (err) { /* sense pla: es prova la resta de diàlegs */ }
        }
        // Una recaptura o una defensa demostrable també dona peu a una
        // pregunta si en aquesta jugada no hi ha un fil o un pla més rellevant.
        if (!exchange && !c.prepared && (gap >= 2 || chosen.kind === 'reply') && chosen.kind !== 'summary') {
            const tactical = tvTacticalDialogue(c, chosen, candidates, event, urgent);
            if (!vision || tactical?.question) exchange = tactical;
        }
        if (!exchange) return chosen;
        const heard = memory.dialogueFacts || {};
        if (exchange.key && Number.isInteger(heard[exchange.key]) && c.ply - heard[exchange.key] < 16) return chosen;
        // La nova narració d'en Grau no diu caselles. La prova tàctica es conserva,
        // però les coordenades es converteixen en noms de les peces.
        if (!exchange.turns && vision && typeof vision.clean === 'function') {
            const cleaned = vision.clean(exchange.answer, c, visio());
            if (!cleaned) return chosen;
            exchange = { ...exchange, answer: cleaned };
        }

        let dialogue;
        if (exchange.turns) {
            // Plans i seguiments: el mòdul ja n'ha controlat la llargada.
            dialogue = exchange.turns.map(t => Object.assign({ role: t.role, text: t.text }, t.solo ? { solo: t.solo } : {}));
        } else {
            const questionIndex = Number.isInteger(memory.questionIndex)
                ? memory.questionIndex : tvHash(c.gameId || '') % TV_MOVE_QUESTIONS.length;
            exchange.questionIndex = questionIndex;
            const spokenFocus = vision && exchange.focus ? vision.clean(exchange.focus, c, visio()) : exchange.focus;
            const returning = spokenFocus && Number.isInteger(exchange.introducedPly) && c.ply - exchange.introducedPly >= 4;
            const leadText = vision ? neutral : move;
            const recap = returning ? ' Tornem a seguir ' + spokenFocus + '.' : '';
            const ask = exchange.question || (vision ? tvWhyQuestion(c, questionIndex, spokenFocus)
                : tvMoveQuestion(c.move, questionIndex, spokenFocus));
            const askAfterRecap = returning && exchange.followQuestion ? exchange.followQuestion : ask;
            let question = leadText + recap + ' ' + askAfterRecap;
            if (wordCount(question) + wordCount(exchange.answer) > 45) question = leadText + ' ' + ask;
            if (wordCount(question) + wordCount(exchange.answer) > 45) return chosen;
            if (exchange.tail) {
                const tail = vision.clean(exchange.tail, c, visio());
                if (tail && wordCount(question + ' ' + exchange.answer + ' ' + tail) <= 52)
                    exchange.answer += ' ' + tail;
                else exchange.visio = undefined;
            }
            const solo = exchange.kind === 'variant' ? null : leadText + (recap ||
                (spokenFocus ? ' Seguim ' + spokenFocus + '.' : ''));
            dialogue = [
                { role: 'presenter', text: question, solo: solo },
                { role: 'analyst', text: exchange.answer }
            ];
        }
        memory.lastDialoguePly = c.ply;
        if (exchange.key) {
            memory.dialogueFacts = Object.fromEntries(Object.entries(heard).filter(([, ply]) => c.ply - ply < 16));
            memory.dialogueFacts[exchange.key] = c.ply;
        }
        if (exchange.visio) memory.visio = exchange.visio;
        if (exchange.kind === 'variant') memory.lastVariantPly = c.ply;
        else if (!exchange.turns) memory.questionIndex = (exchange.questionIndex + 1) % TV_MOVE_QUESTIONS.length;
        const thread = (memory.conflicts || []).find(t => t.id === exchange.topic);
        for (const active of memory.conflicts || []) {
            if (active !== thread && active.candidate !== exchange.candidate && active.saidPly === c.ply) {
                active.saidPly = active.priorSaidPly;
                if (active.introducedPly === c.ply) active.introducedPly = null;
            }
        }
        if (thread) {
            thread.saidPly = c.ply;
            thread.introducedPly ??= c.ply;
            thread.lastEvent = exchange.kind;
            thread.lastEventPly = c.ply;
        }
        const fromPlan = exchange.kind === 'plan';
        let theme = fromPlan ? exchange.theme : null;
        if (exchange.recapture) theme = 'recapture';
        else if (exchange.threadKind === 'passed' && exchange.kind === 'defence') theme = 'blockade';
        else if (exchange.threadKind === 'passed' && exchange.kind === 'reinforced') theme = 'passed';
        else if (exchange.threadKind === 'file' && exchange.kind !== 'resolved') theme = 'files';

        const planLimits = vision?.CONFIG?.MAX_WORDS;
        const limit = fromPlan ? planLimits?.[c.tier] ?? planLimits?.mid ?? 88 : 52;
        return { ...chosen, dialogue, dialogueEvent: exchange.kind,
            ...(theme && !urgent ? { dialogueArt: { theme, fromPlan, limit } } : {}),
            ...(exchange.forecast ? { forecast: exchange.forecast, planTheme: exchange.theme } : {}) };
    }

    // Un pas complet de la retransmissió: candidats, selecció, resum
    // periòdic i memòria nova. El fan servir el controlador i les proves, de
    // manera que la cobertura que es mesura és la que veu l'espectador.
    function tvBroadcastStep(ctx) {
        const c = ctx || {};
        const memory = cloneMemory(c.memory);
        let candidates = tvCommentCandidates(Object.assign({}, c, { memory: memory }));
        // Patrons amb proves reglamentàries. Mai no afirmem els patrons
        // pendents del catàleg ni substituïm els avisos crítics.
        if (c.patterns && typeof c.patterns.candidates === 'function' && !c.end) {
            try { candidates = candidates.concat(c.patterns.candidates(c)); }
            catch (err) { /* el comentari original continua funcionant */ }
        }
        const facts = candidates;
        // La capa lingüística treballa sobre motius JA verificats pel
        // detector, sense alterar ni els fets ni la prioritat dels comentaris.
        if (c.expression && typeof c.expression.expandCandidates === 'function') {
            try { candidates = c.expression.expandCandidates(candidates, { move: c.move, tier: c.tier }); }
            catch (err) { /* El comentari original continua sent vàlid. */ }
        }
        let chosen = tvSelectComment(candidates, memory, { ply: c.ply, color: c.move && c.move.color, tier: c.tier, prepared: c.prepared,
            isCheck: !!(c.move && /\+$/.test(c.move.san) && !c.end), quality: c.quality });
        const selected = chosen && candidates.find(cand => cand.key === chosen.key && cand.kind === chosen.kind);
        const urgent = chosen && (chosen.kind === 'only-move' || KIND_PRIORITY[chosen.kind] >= 70 ||
            (selected && selected.priority >= 70));
        const mvq = c.move || {};
        const quiet = !mvq.captured && !/[+#]/.test(mvq.san || '') && !mvq.promotion && (mvq.flags || '').indexOf('k') === -1 && (mvq.flags || '').indexOf('q') === -1;
        if (!urgent && quiet && !c.prepared && !c.end && isNum(c.ply) && c.ply - memory.lastSummaryPly >= TV_CONFIG.SUMMARY_EVERY_PLIES) {
            // El resum SUBSTITUEIX el comentari ordinari d'aquesta jugada.
            const summary = tvStrategicSummary(c, memory);
            if (summary) chosen = summary;
        }
        const event = tvTrackConflicts(c, chosen, memory, candidates);
        // La visió d'en Grau segueix la previsió a cada semijugada, encara
        // que aquesta jugada no tingui diàleg. `visio: null` la desactiva.
        const vision = c.visio === null || c.visio === false ? null : (c.visio || getVisioGrau());
        let visionEvent = null;
        if (vision && typeof vision.track === 'function') {
            try {
                const tracked = vision.track(c, memory.visio);
                memory.visio = tracked.memory;
                visionEvent = tracked.event;
            } catch (err) { /* sense seguiment, els comentaris continuen */ }
        }
        const I = c.opening && c.move && getTvIntro();
        const opening = I?.openingTalk?.({
            ...c.opening, color: c.move.color, ply: c.ply, prepared: !!c.prepared,
            flush: !!c.end,
            canSpeak: !c.end && !urgent && !c.move.promotion && !/[+#]$/.test(c.move.san || '')
        }, memory.openingTalk);
        if (opening) memory.openingTalk = opening.memory;
        if (opening?.turns) {
            const dialogue = opening.turns;
            const text = dialogue.map(turn => turn.text).join(' ');
            chosen = { kind: 'opening', text, leadText: text, family: 'opening', variantId: 0,
                explanatory: true, dialogue, dialogueEvent: 'opening' };
            memory.lastDialoguePly = c.ply;
            // L'obertura ha ocupat el torn. Els altres fets d'aquesta jugada
            // només continuen a la memòria com a observacions.
            for (const t of memory.conflicts || []) {
                if (t.saidPly === c.ply) t.saidPly = t.priorSaidPly;
                if (t.introducedPly === c.ply) t.introducedPly = null;
            }
        } else if (!chosen && event && ['resolved', 'transformed'].includes(event.kind) && !c.prepared && !c.end) {
            // El desenllaç d’un fil ja narrat pot merèixer un comentari propi.
            const desc = describeMove(c.move, false);
            const text = desc.variants[0];
            const fallback = { kind: 'describe', text, leadText: text, family: desc.family,
                variantId: 0, explanatory: true, tags: { color: c.move.color, squares: [c.move.to] } };
            const withDialogue = tvAddDialogue(c, fallback, memory, event, urgent, facts, vision, visionEvent);
            if (withDialogue.dialogue) chosen = withDialogue;
        } else {
            chosen = tvAddDialogue(c, chosen, memory, event, urgent, facts, vision, visionEvent);
        }
        // Enllacem les explicacions amb temes COMENTATS abans. El mòdul
        // narratiu no interpreta el tauler: només reutilitza motius validats
        // i captures verificables. Si no carrega, el comentari no canvia.
        if (c.narrative && typeof c.narrative.apply === 'function') {
            try {
                const coversChosen = chosen && (!chosen.dialogue || chosen.dialogueEvent === 'move' || chosen.dialogueEvent === 'defence');
                const connected = c.narrative.apply(memory.story, coversChosen ? chosen : null, {
                    ply: c.ply, move: c.move, candidates: candidates
                });
                if (connected && connected.story) {
                    memory.story = connected.story;
                    if (!chosen || coversChosen) chosen = connected.comment;
                }
            } catch (err) { /* reserva: comentari original i memòria intacta */ }
        }
        const artStep = tvArtStep(c, chosen, memory, candidates);
        chosen = artStep.comment;
        // El que diu (i mostra) l'Èlia: intencions, sense caselles.
        if (chosen && vision) chosen = Object.assign({}, chosen, { say: tvEliaSay(c, chosen, vision, artStep.memory) });
        // Lliga de llegendes: una observació sobre el jugador i els noms als comentaris.
        const legendStep = tvLegendStep(c, chosen, artStep.memory);
        const namedStep = tvNameComment(c, legendStep.comment, legendStep.memory);
        chosen = namedStep.comment;
        const next = tvCommitComment(namedStep.memory, chosen, { ply: c.ply, fenAfter: c.fenAfter, move: c.move, candidates: candidates });
        return { comment: chosen, memory: next, candidates: candidates };
    }

    // ------------------------------------------------------------------
    // Lliga de llegendes: els noms dels jugadors dins dels comentaris
    // ------------------------------------------------------------------
    function tvDeName(n) { return /^[AEIOUÀÈÉÍÒÓÚ]/i.test(n) ? 'd’' + n : 'de ' + n; }
    function tvSentenceCase(t) {
        return String(t == null ? '' : t).replace(/(^|[.!?]\s+)([a-zàèéíïòóúüç])/g, (m, p, ch) => p + ch.toUpperCase());
    }
    const NAME_SIDE = { blanques: 'w', negres: 'b' };
    const NAME_PIECE_COLOR = { blanc: 'w', blanca: 'w', negre: 'b', negra: 'b' };
    const NAME_FREE = '(?!\\s+(?:de|d’|d\')\\s?[A-Z])';
    const NAME_RULES = [
        // Preposicions: el nom sol, sense cap problema de concordança.
        [new RegExp('\\b(per a|cap a|contra|davant de) les (blanques|negres)\\b' + NAME_FREE, 'g'),
            (n, take) => (m, prep, side) => take(NAME_SIDE[side])
                ? (prep === 'davant de' ? 'davant ' + tvDeName(n[NAME_SIDE[side]]) : prep + ' ' + n[NAME_SIDE[side]]) : m],
        [new RegExp('\\bde les (blanques|negres)\\b' + NAME_FREE, 'g'),
            (n, take) => (m, side) => take(NAME_SIDE[side]) ? tvDeName(n[NAME_SIDE[side]]) : m],
        [new RegExp('(^|[\\s,(])a les (blanques|negres)\\b' + NAME_FREE, 'g'),
            (n, take) => (m, pre, side) => take(NAME_SIDE[side]) ? pre + 'a ' + n[NAME_SIDE[side]] : m],
        [new RegExp('\\b([Vv]eig) les (blanques|negres)\\b' + NAME_FREE, 'g'),
            (n, take) => (m, verb, side) => take(NAME_SIDE[side]) ? verb + ' ' + n[NAME_SIDE[side]] : m],
        // Peces amb color: «la dama blanca» → «la dama de Capablanca». No quan
        // identifiquen una altra peça («el cavall de la dama blanca»).
        [/(^|[\s,(:;])(?<!\bde\s)(El|el|La|la|L’|l’|L'|l')(\s?)(rei|dama|torre|alfil|cavall|peó)\s(blanc|blanca|negre|negra)(?![\p{L}])(?!\s+(?:de|del|d’|d')(?![\p{L}]))/gu,
            (n, take) => (m, pre, det, sp, piece, adj) => take(NAME_PIECE_COLOR[adj])
                ? pre + det + sp + piece + ' ' + tvDeName(n[NAME_PIECE_COLOR[adj]]) : m],
        // Subjecte: «Les blanques avancen» → «Les blanques de Capablanca avancen» (plural
        // intacte) o, a l'inici, «Mou Capablanca: les blanques avancen…» / «Torn de Capablanca: …».
        [new RegExp('(^|[^\\p{L}])(?<!\\bamb\\s)(Les|les) (blanques|negres)\\b' + NAME_FREE, 'gu'),
            (n, take, form) => (m, pre, art, side, offset, whole) => {
                const c = NAME_SIDE[side];
                if (!take(c)) return m;
                // «Mou X:» només si la frase no porta ja uns altres dos punts.
                const colonFree = String(whole).indexOf(':') === -1;
                if (offset === 0 && colonFree && form === 1) return 'Mou ' + n[c] + ': les ' + side;
                if (offset === 0 && colonFree && form === 2) return 'Torn ' + tvDeName(n[c]) + ': les ' + side;
                return pre + art + ' ' + side + ' ' + tvDeName(n[c]);
            }]
    ];

    // Converteix referències als bàndols en referències als jugadors sense
    // tocar la concordança («per a les negres» → «per a Kasparov», «la dama
    // blanca» → «la dama de Capablanca», «Les blanques avancen» → «Les blanques
    // de Capablanca avancen»). Cada jugador es diu com a molt un cop per text,
    // i en total `max` vegades. Un nom que ja hi és no es torna a afegir.
    // `opts.state` ({ used: {w,b}, left }) es pot compartir entre els torns d'un
    // diàleg perquè cada jugador surti un sol cop en tot l'intercanvi; `opts.form`
    // tria la fórmula del subjecte inicial (0: «de», 1: «Mou», 2: «Torn de»).
    function tvNameSides(text, names, opts) {
        const o = opts || {};
        let t = String(text == null ? '' : text);
        if (!t || !names || !names.w || !names.b) return t;
        const st = o.state || { used: {}, left: isNum(o.max) ? o.max : 2 };
        st.used.w = !!st.used.w || t.indexOf(names.w) !== -1;
        st.used.b = !!st.used.b || t.indexOf(names.b) !== -1;
        const take = (c) => { if (st.left <= 0 || st.used[c]) return false; st.used[c] = true; st.left--; return true; };
        for (const [re, make] of NAME_RULES) {
            if (st.left <= 0) break;
            t = t.replace(re, make(names, take, isNum(o.form) ? o.form : 0));
        }
        return t;
    }

    // Aplica els noms a un comentari: als diàlegs, a cada torn (un nom per
    // torn); als comentaris d'una sola veu, una semijugada sí i una no, perquè
    // no sonin repetitius. El text intern (`text`) no canvia: només el que es
    // mostra i es diu.
    function tvNameComment(c, chosen, memory) {
        const names = c && c.legends && c.legends.names;
        if (!chosen || !names || !names.w || !names.b) return { comment: chosen, memory: memory };
        const ply = isNum(c.ply) ? c.ply : 0;
        const mover = c.move && (c.move.color === 'b' ? 'b' : 'w');
        const dialogue = Array.isArray(chosen.dialogue);
        const lastBy = memory.namedPly && typeof memory.namedPly === 'object' ? memory.namedPly : { w: -100, b: -100 };
        // Una veu: cada jugador es nomena una jugada pròpia sí i una no.
        if (!dialogue && !c.end && mover && ply - (isNum(lastBy[mover]) ? lastBy[mover] : -100) < 4) return { comment: chosen, memory: memory };
        const form = isNum(memory.nameForm) ? memory.nameForm % 3 : 0;
        const said = { w: false, b: false };
        const run = (t, state) => {
            const before = { w: state.used.w, b: state.used.b };
            const out = tvNameSides(t, names, { state: state, form: form });
            ['w', 'b'].forEach(k => { if (state.used[k] && !before[k] && out !== t) said[k] = true; });
            return tvSentenceCase(out);
        };
        const next = Object.assign({}, chosen);
        if (dialogue) {
            // Tot el diàleg comparteix el pressupost: cada jugador, un cop, i com a molt dos noms.
            const all = chosen.dialogue.map(t => t.text).join(' ');
            const shared = () => ({ used: { w: all.indexOf(names.w) !== -1, b: all.indexOf(names.b) !== -1 }, left: 2 });
            const st = shared(), soloSt = shared();
            next.dialogue = chosen.dialogue.map(turn => Object.assign({}, turn, { text: run(turn.text, st) },
                turn.solo ? { solo: run(turn.solo, soloSt) } : {}));
            if (typeof chosen.say === 'string') next.say = run(chosen.say, shared());
        } else if (typeof chosen.say === 'string') {
            next.say = run(chosen.say, { used: {}, left: 1 });
        }
        if (!said.w && !said.b) return { comment: next, memory: memory };
        const by = Object.assign({ w: -100, b: -100 }, lastBy);
        ['w', 'b'].forEach(k => { if (said[k]) by[k] = ply; });
        return { comment: next, memory: Object.assign({}, memory, { namedPly: by, nameForm: form + 1 }) };
    }

    // Comentaris d'una sola veu que poden obrir una observació sobre el jugador.
    const LEGEND_LEAD_KINDS = { describe: true, development: true, center: true, activation: true, 'king-activity': true,
        capture: true, diagonal: true, majority: true, castle: true };

    // Imprecisió o error de la jugada (o null): la CLASSE surt de la variació real
    // de l'avaluació entre les dues anàlisis fiables (només centipeons, mateix bàndol)
    // i, si és compatible amb l'estil del jugador, de l'etiqueta de la jugada
    // comprovada amb chess.js (humanitzacio.js, moveFlags). Una posició ja decidida
    // no es comenta amb matisos. Mai no depèn de com s'ha triat la jugada.
    function tvSlipInfo(ctx, L, features) {
        const Hm = getHumanitzacio();
        const b = ctx && ctx.before, a = ctx && ctx.after;
        if (!Hm || !features || !b || !a || !b.reliable || !a.reliable || !ctx.move) return null;
        const color = ctx.move.color;
        const loss = tvMoverLossCp(b.best, a.best, color);
        if (!isNum(loss)) return null;
        const moverBefore = b.best.value * (color === 'w' ? 1 : -1);
        if (Math.abs(moverBefore) > TV_CONFIG.DECIDED_CP) return null;
        const cls = Hm.classifyLoss(loss);
        if (cls === 'bona') return null;
        const uci = ctx.move.from + ctx.move.to + (ctx.move.promotion || '');
        // Només s'hi pot parlar de «millor alternativa» si n'hi ha una de diferent.
        if (!b.bestUci || b.bestUci === uci) return null;
        const profile = Hm.profileFor(L && L.ids ? L.ids[color] : null);
        const flags = Hm.moveFlags(features, Hm.pawnDelta(ctx.ChessCtor, ctx.fenBefore, uci));
        let link = Hm.styleLink(profile.archetype, flags);
        // Les afirmacions sobre l'alternativa («n'hi havia una de més activa»,
        // «una jugada més directa») només es diuen si es comproven amb chess.js.
        if (link === 'passiva' || link === 'tranquila') {
            let bf = null;
            try { bf = Hm.moveFlags(tvMoveFeatures(ctx.ChessCtor, ctx.fenBefore, b.bestUci, null), 0); } catch (err) { bf = null; }
            if (link === 'passiva') link = bf && bf.iniciativa ? 'passiva' : null;
            else link = bf && bf.forcing && !flags.iniciativa ? 'maniobraLenta' : null;
        }
        return { cls: cls, link: link };
    }

    // Observació sobre el jugador que acaba de moure (lliga de llegendes), en
    // forma de diàleg. Ocupa un silenci o s'afegeix a un comentari descriptiu
    // d'una sola veu (que l'Èlia diu primer); mai no substitueix un avís tàctic,
    // un diàleg ni una màxima. El fet que la motiva (escac, canvi, enroc…) es
    // comprova amb chess.js (tvMoveFeatures); l'avantatge, amb l'anàlisi fiable;
    // la classificació la calcula llegendes.js. Sense `ctx.legends`, no fa res.
    function tvLegendStep(ctx, chosen, memory) {
        const L = ctx && ctx.legends;
        if (!L || !L.api || typeof L.api.remark !== 'function' || !ctx.move || ctx.end || ctx.prepared) return { comment: chosen, memory: memory };
        const plain = !!(chosen && !chosen.dialogue && !chosen.maxim && LEGEND_LEAD_KINDS[chosen.kind]);
        if (chosen && !plain) return { comment: chosen, memory: memory };
        const lead = plain ? String(chosen.say || chosen.text || '').trim() : '';
        if (lead && /\b[a-h][1-8]\b/.test(lead)) return { comment: chosen, memory: memory };
        let features = null;
        try {
            const mv = ctx.move;
            features = tvMoveFeatures(ctx.ChessCtor, ctx.fenBefore, mv.from + mv.to + (mv.promotion || ''), null);
        } catch (err) { features = null; }
        const a = ctx.after;
        const edge = a && a.reliable ? tvDecisiveSide(a.best, TV_CONFIG.DECIDED_PACE_CP) : null;
        const out = L.api.remark({ ply: ctx.ply, color: ctx.move.color, features: features, ids: L.ids, engines: L.engines,
            stakes: L.stakes || null, edge: edge, attack: L.attack || null, slump: L.slump || null, lead: lead,
            slip: tvSlipInfo(ctx, L, features),
            prepared: !!ctx.prepared, end: !!ctx.end }, memory.legend);
        const next = Object.assign({}, memory, { legend: out.memory });
        if (!out.remark) return { comment: chosen, memory: next };
        const r = out.remark;
        const turns = Array.isArray(r.turns) && r.turns.length >= 2 ? r.turns.map(t => Object.assign({}, t, t.solo ? {} : { solo: undefined })) : null;
        const text = turns ? turns.map(t => t.text).join(' ') : r.text;
        const say = turns ? turns.map(t => t.role === 'presenter' && t.solo ? t.solo : t.text).join(' ') : r.text;
        return { comment: { kind: 'legend', text: text, leadText: r.text, say: say, family: 'legend',
            variantId: ['profile', 'stakes', 'edge', 'trait', 'attack', 'slump', 'slip'].indexOf(r.kind), explanatory: r.kind !== 'profile',
            dialogue: turns ? turns.map(t => ({ role: t.role, text: t.text, ...(t.solo ? { solo: t.solo } : {}) })) : undefined,
            dialogueEvent: turns ? 'legend' : undefined, legend: { id: r.id, kind: r.kind } }, memory: next };
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
                tier: s.tier || 'mid', prepared: prepared, phrase: s.phrases ? s.phrases[i] : null, end: tvGameEnd(chess), ply: i, memory: memory,
                expression: s.expression || null, narrative: s.narrative || null, quality: s.quality || null,
                patterns: s.patterns || null, art: s.art || null, gameId: s.gameId || 'tv-simulacio', visio: s.visio,
                legends: s.legends || null
            });
            memory = step.memory;
            rows.push({ ply: i, san: mv.san, color: mv.color, fen: chess.fen(), comment: step.comment ? step.comment.text : null,
                say: step.comment ? step.comment.say || step.comment.text : null,
                kind: step.comment ? step.comment.kind : null, explanatory: !!(step.comment && step.comment.explanatory), extended: !!(step.comment && step.comment.extended),
                key: step.comment ? step.comment.key : null, payload: step.comment ? step.comment.payload : null,
                narrative: step.comment ? (step.comment.narrative || null) : null,
                speech: step.comment ? tvSpeechText(step.comment.say || step.comment.text) : null,
                dialogue: step.comment ? step.comment.dialogue || null : null,
                dialogueEvent: step.comment ? step.comment.dialogueEvent || null : null,
                forecast: step.comment ? step.comment.forecast || null : null,
                maxim: step.comment && step.comment.maxim ? step.comment.maxim : null,
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
        // El text visible conserva Stockfish; la veu diu «Stock fish».
        t = t.replace(/\bstockfish\b/gi, 'Stock fish');
        // Els noms dels jugadors de la lliga, amb la pronúncia catalana adaptada.
        const LG = getLlegendes();
        if (LG && typeof LG.speakNames === 'function') t = LG.speakNames(t);
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
    // Amb holdNeural (Stockfish vs Lozza TV) no hi ha alternativa: la locució
    // torna { reason: 'neural-down' } i qui la fa servir espera que Matxa
    // torni (speak amb force hi prova abans que acabi la pausa d'un minut).
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
        const neuralText = (text) => {
            const P = typeof e.prepareNeuralText === 'function' ? { prepare: e.prepareNeuralText }
                : getProsodia();
            if (!P || typeof P.prepare !== 'function') return text;
            try { return P.prepare(text) || text; } catch (err) { return text; }
        };
        const dualEnabled = () => {
            try { return !!(typeof e.getDualEnabled === 'function' && e.getDualEnabled()); }
            catch (err) { return false; }
        };
        const neuralReady = () => !!(neuralId() && neural.available());
        const holding = () => {
            try { return !!(neuralId() && (typeof e.holdNeural === 'function' ? e.holdNeural() : e.holdNeural)); }
            catch (err) { return false; }
        };
        const actualNeuralId = opts => (dualEnabled() && opts &&
            (opts.voiceId === TV_DUO.presenter || opts.voiceId === TV_DUO.analyst))
            ? opts.voiceId : neuralId();
        const synthSupported = e.allowSystemVoice !== false && !!(synth && typeof synth.speak === 'function' && typeof Utter === 'function');
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
            const hold = holding();
            if (neuralReady() || (hold && o.force)) {
                return neural.speak(neuralText(text), actualNeuralId(o), { rate: clamp(neuralRate() * (isNum(o.rate) ? o.rate : 1), 0.75, 1.25), effects: neuralEffects(), maxWaitMs: (isNum(o.maxWaitMs) ? o.maxWaitMs : tvSpeechMaxWaitMs(text)) + 9000, force: !!(hold && o.force) })
                    .then((r) => {
                        if (r && (r.spoken || r.reason === 'stopped' || seq !== speakSeq)) return r;
                        if (r && r.reason === 'not-allowed') { blocked = true; emit(); return r; }
                        emit();
                        // La veu neuronal ha fallat: o s'espera que torni, o
                        // veu del dispositiu, si n'hi ha.
                        if (holding()) return { spoken: false, reason: 'neural-down' };
                        return voice ? speakSystem(text, o) : { spoken: false, reason: 'neural-failed' };
                    });
            }
            if (hold) return Promise.resolve({ spoken: false, reason: 'neural-down' });
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
                u.rate = isNum(o.rate) ? clamp(o.rate, 0.75, 1.25) : 1;
                u.pitch = isNum(o.pitch) ? clamp(o.pitch, 0.8, 1.2) : 1;
                u.volume = isNum(o.volume) ? clamp(o.volume, 0, 1) : 1;
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
                if (neuralReady() || holding()) return 'ready';
                if (!voice) return (!synthSupported || voicesSeen || voicesSettled) ? 'no-voice' : 'loading';
                return 'ready';
            },
            // Quina veu sonarà ara: 'neural', 'system' o null.
            engine() { return current ? 'system' : (neuralReady() || holding() ? 'neural' : (voice ? 'system' : null)); },
            // La veu neuronal triada no està disponible (sense xarxa o servei aturat).
            neuralUnavailable() { return !!(neuralId() && !neural.available()); },
            // Si Matxa falla, no es llegeix amb una altra veu: s'espera que torni.
            holdsForNeural() { return holding(); },
            prefetch(text, opts) { if (pref === 'on' && text && neuralReady()) { const o = opts || {}; neural.prefetch(neuralText(text), actualNeuralId(o), { rate: clamp(neuralRate() * (isNum(o.rate) ? o.rate : 1), 0.75, 1.25) }); } },
            supportsDual() { return dualEnabled() && (neuralReady() || holding()); },
            pref() { return pref; },
            isOn() { return pref === 'on'; },
            needsActivation() { return pref === null; },
            voiceName() {
                if (!current && (neuralReady() || holding())) {
                    const V = root && root.ElTaulerVeuNeural;
                    if (dualEnabled()) return 'Matxa · Èlia i Grau';
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
    // env.createFallbackWorker: si el worker principal no arrenca (fitxer que
    // no carrega, navegador sense WebAssembly), es fa servir aquest altre.
    function createTvEngine(env) {
        const e = env || {};
        let usingFallback = false;
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

        function createWorker() {
            try { return (usingFallback ? e.createFallbackWorker : e.createWorker)(); } catch (err) { return null; }
        }
        // El motor principal no ha arrencat: un sol intent amb el de reserva.
        function bootFallback() {
            if (usingFallback || typeof e.createFallbackWorker !== 'function') return null;
            usingFallback = true;
            generation++;
            try { if (worker) worker.terminate(); } catch (err) {}
            worker = null;
            lineHandler = null;
            return boot();
        }
        function boot() {
            failed = false;
            const gen = ++generation;
            worker = createWorker();
            if (!worker) { const next = bootFallback(); if (next) return next; failed = true; return Promise.resolve(null); }
            worker.onmessage = (ev) => onMessage(gen, ev);
            // Un worker que no carrega avisa de seguida: no cal esperar 20 s.
            worker.onerror = () => { if (gen === generation && lineHandler) lineHandler(WORKER_ERROR); };
            const lines = [];
            const done = listen((line) => {
                if (line === WORKER_ERROR) return false;
                lines.push(line); return line === 'uciok' ? lines : undefined;
            }, 20000);
            send('uci');
            return done.then((got) => {
                if (gen !== generation) return null;
                if (!got) { const next = bootFallback(); if (next) return next; failed = true; return null; }
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
            // El motor triat no ha arrencat i s'està fent servir el de reserva.
            usingFallback() { return usingFallback; },
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

    const WORKER_ERROR = '\u0000worker-error';

    function tvPositionCommand(uciMoves, startFen) {
        const start = startFen ? 'position fen ' + startFen : 'position startpos';
        return Array.isArray(uciMoves) && uciMoves.length ? start + ' moves ' + uciMoves.join(' ') : start;
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
        // Lliga de llegendes (llegendes.js). Sense el mòdul, la TV fa el duel heretat.
        const LG = d.legends && typeof d.legends.pickFixture === 'function' ? d.legends : null;
        let league = LG ? LG.normalize(typeof d.loadLeague === 'function' ? d.loadLeague() : null, random) : null;
        function saveLeague() { if (LG && league && typeof d.saveLeague === 'function') { try { d.saveLeague(league); } catch (err) {} } }
        function leagueView() {
            const g = S.game;
            return { season: league.season, progress: LG.progress(league), table: LG.table(league),
                lastSeason: league.lastSeason ? Object.assign({}, league.lastSeason) : null, history: league.history.slice(),
                fixture: g && g.matchPlan && g.matchPlan.legends ? Object.assign({}, g.matchPlan.fixture) : null };
        }

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
            lozzaReady: false,
            duelWarning: false,
            // Control manual: { color } del bàndol que mou l'usuari (l'altre el
            // juga el motor). null: Stockfish juga els dos bàndols.
            control: null,
            // La jugada de l'usuari ja és al tauler i se n'està preparant el comentari.
            pendingUser: false,
            // Matxa no respon: { since, attempts, nextTryAt, trying }. La
            // partida no avança fins que la veu torna (o l'usuari l'apaga).
            voiceHold: null
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
            if (d.lozzaEngine) d.lozzaEngine.cancelAll();
            if (d.voice) d.voice.stop();
            S.speech = null;
            S.pendingUser = false;
            S.movePreview = null;
            S.voiceHold = null;
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
                duo: prefs.duo,
                unequal: prefs.unequal,
                profiles: prefs.profiles,
                untilMate: prefs.untilMate,
                legends: league ? leagueView() : null,
                lozzaReady: S.lozzaReady,
                recentResults: g && g.matchPlan && g.matchPlan.untilMate ? prefs.mateRecent.slice()
                    : S.caps ? tvRivalryHistory(prefs.recent, S.caps) : prefs.recent.slice(),
                duelWarning: S.duelWarning,
                movePreview: S.movePreview ? Object.assign({}, S.movePreview) : null,
                voiceHold: S.voiceHold ? Object.assign({}, S.voiceHold) : null,
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
                    styles: g.styles,
                    engines: g.engines,
                    matchPlan: g.matchPlan,
                    names: g.matchPlan && g.matchPlan.legends ? g.matchPlan.names : null,
                    attack: g.attack ? Object.assign({}, g.attack) : null,
                    slumped: g.slumped ? Object.assign({}, g.slumped) : null,
                    leagueNote: g.leagueNote || '',
                    finalTable: g.finalTable || null,
                    finalSeason: g.finalSeason || null,
                    recorded: !!g.recorded,
                    hadManualControl: !!g.hadManualControl,
                    opening: g.opening ? { name: g.opening.name, eco: g.opening.eco, idea: g.opening.idea || null,
                        plies: g.prepared.length, fromPosition: !!g.startFen } : null,
                    pairScore: g.pairScore,
                    identified: g.identified,
                    story: g.memory && g.memory.story ? g.memory.story : null,
                    lastMove: g.moves.length ? g.moves[g.moves.length - 1] : null,
                    end: g.end,
                    nextGameAt: g.nextGameAt || null,
                    comment: g.comment
                } : null
            };
        }
        function render() { notify('render', snapshot()); }

        function identifyOpening(g) {
            if (g.startFen) return null;
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
                }
                const res = Core.analyzeGameOpeningByPositions(graph, fens, sans);
                return res && res.name ? { name: res.name, eco: res.eco || null } : null;
            } catch (err) { return null; }
        }

        function openingMoveIdea(move) {
            if (move.flags.includes('k') || move.flags.includes('q')) return 'L’enroc porta el rei cap a un flanc i treu la torre del racó per acostar-la al centre.';
            if (move.captured) return 'La captura modifica el material i la tensió entre les peces. En aquesta línia cal seguir qui recupera el material i amb quina activitat.';
            if (move.piece === 'p') {
                if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) return 'El peó ocupa una casella central: guanya espai i controla les dues diagonals del davant.';
                return 'L’avanç del peó guanya terreny i canvia les caselles que controla. Cal vigilar també les caselles que deixa de defensar.';
            }
            if (['n', 'b'].includes(move.piece)) return 'La maniobra reubica ' + pieceNP(move.piece, null) + '. En l’obertura, el sentit del desplegament és acostar les peces a la lluita central sense perdre temps.';
            return 'La maniobra reubica ' + pieceNP(move.piece, null) + '. Cal valorar aquesta activitat juntament amb el desenvolupament de les altres peces i la seguretat del rei.';
        }

        function openingDialogueContext(g, move, fenBefore, fenAfter, prepared) {
            const ply = g.moves.length;
            if (g.startFen) return null;
            const lastPrepared = g.prepared.length - 1;
            const context = {
                engines: g.engines, names: g.matchPlan && g.matchPlan.legends ? g.matchPlan.names : null,
                seed: g.opening, moveIdea: openingMoveIdea(move),
                preparedComplete: lastPrepared >= 0 && g.prepared.length === g.opening?.moves?.length &&
                    (ply === lastPrepared && !!prepared || g.moves[lastPrepared]?.prepared === true),
                discoveries: []
            };
            const Core = getCore();
            try {
                let graph = d.getOpeningGraph?.();
                const repertoire = typeof d.getOpenings === 'function' ? d.getOpenings() : [];
                // El graf complet es carrega en segon pla. El repertori petit
                // permet narrar també les primeres partides, abans que estigui llest.
                if (!graph && Core?.buildOpeningPositionGraph) {
                    if (!g.localOpeningGraph) g.localOpeningGraph = Core.buildOpeningPositionGraph(
                        repertoire.map(op => ({ ...op, pgn: (op.moves || []).join(' ') })), sans => {
                            const board = new d.ChessCtor();
                            return sans.map(san => { if (!board.move(san)) throw new Error('opening'); return board.fen(); });
                        });
                    graph = g.localOpeningGraph;
                }
                if (graph && Core?.positionKeyFromFen) {
                    const enrich = entry => entry ? { ...repertoire.find(op => op.name === entry.name), ...entry } : null;
                    const from = Core.positionKeyFromFen(fenBefore);
                    const to = Core.positionKeyFromFen(fenAfter);
                    const continuations = graph.theory.get(from);
                    context.named = enrich(graph.byPos.get(to));
                    for (const entry of g.moves) {
                        const named = enrich(graph.byPos.get(Core.positionKeyFromFen(entry.fen)));
                        if (named) context.discoveries.push({ named, ply: entry.ply, color: entry.color,
                            prepared: entry.prepared, moveIdea: openingMoveIdea(entry.verbose) });
                    }
                    if (continuations?.has(move.san)) context.theory = true;
                    else if (!context.named && !graph.theory.has(to) && continuations?.size) context.theory = false;
                }
            } catch (err) { /* el repertori preparat es pot explicar igualment */ }
            return context;
        }

        function startGame() {
            halt();
            const epoch = S.epoch;
            // Una partida de cada dues comença amb una obertura que desequilibra
            // aviat: les partides es decideixen abans sense tocar el nivell.
            const v = viewer();
            const target = tvResolveTarget(S.caps, v, prefs);
            // Lliga de llegendes: el partit el decideix el calendari (aleatori
            // dins de la jornada); els jugadors, els motors i els nivells, els perfils.
            let fixture = null;
            if (LG && league) {
                const picked = LG.pickFixture(league, random);
                league = picked.state;
                fixture = picked.fixture;
                saveLeague();
            }
            const untilMate = !fixture && S.lozzaReady && prefs.untilMate;
            const humanize = !!(fixture && humanizeOn() && getHumanitzacio());
            const duel = fixture ? tvLegendPlan(LG, fixture, S.caps, S.lozzaReady, random, { humanize: humanize })
                : untilMate ? tvMateMatch(prefs.mateSeries, random)
                : S.lozzaReady ? tvMatchPlan(tvRivalryHistory(prefs.recent, S.caps), {
                caps: S.caps, target: target.value, unequal: prefs.unequal,
                gameSeq: S.gameSeq, random: random
            }) : null;
            const pick = untilMate ? { opening: TV_MATE_SCENARIOS[duel.index] }
                : tvPickOpening(typeof d.getOpenings === 'function' ? d.getOpenings() : [],
                prefs.openingIndex !== null ? prefs.openingIndex : Math.floor(random() * 1000),
                { sharp: duel ? duel.sharp : S.gameSeq % 2 === 0 });
            if (!untilMate) {
                prefs = Object.assign({}, prefs, { openingIndex: pick.nextIndex });
                savePrefs();
            }
            S.control = null;
            const levels = duel ? null : tvGameLevels(S.caps, target.value, prefs.unequal, random);
            const styles = !untilMate && !fixture && prefs.profiles && S.caps && S.caps.mode !== 'none' ? tvPickStyles(random) : null;
            const startFen = untilMate ? pick.opening.fen : undefined;
            S.game = {
                id: ++S.gameSeq,
                chess: new d.ChessCtor(startFen),
                startFen,
                moves: [],
                uci: [],
                // El nivell queda FIXAT per a tota la partida. `value` és l'objectiu
                // triat; `sides`, el de cada jugador (diferents amb nivells desiguals).
                level: fixture ? tvLegendLevel(S.caps, duel) : { value: target.value, sides: levels && levels.stronger ? { w: levels.w, b: levels.b } : null,
                    stronger: levels ? levels.stronger : null,
                    label: untilMate ? { short: 'Fins al mat', long: 'Fins al mat' }
                        : duel ? tvLevelLabel(S.caps, target.value) : tvGameLevelLabel(S.caps, levels, target.value),
                    reveal: untilMate ? null : duel ? 'Stockfish: ' + tvLevelLabel(S.caps, duel.stockfishLevel).long
                        + '. Lozza: profunditat ' + duel.lozzaDepth + ' (no és un Elo comparable).' : tvLevelReveal(S.caps, levels),
                    mode: S.caps ? S.caps.mode : 'none', stockfish: duel ? duel.stockfishLevel : null },
                engines: duel ? duel.engines : { w: 'stockfish', b: 'stockfish' },
                matchPlan: duel,
                recorded: false,
                hadManualControl: false,
                // Perfil de joc de cada bàndol (o null si estan apagats).
                styles: styles,
                tier: v.tier,
                opening: pick.opening,
                prepared: tvPreparedLine(d.ChessCtor, pick.opening, 12),
                identified: null,
                analyses: {},
                comments: [],
                memory: tvEmptyMemory(),
                // Semijugades seguides amb un bàndol clarament guanyador (abandonament).
                resign: { side: null, plies: 0 },
                comment: null,
                intro: null,
                end: null,
                nextGameAt: null
            };
            // Humanització: llavor per partida (la mateixa fixture, la mateixa
            // llavor) i un jugador independent per bàndol, amb el seu perfil.
            S.game.human = humanize ? getHumanitzacio().createGame({ seed: fixture.id,
                players: { w: legendPlayer(LG, duel.ids.w), b: legendPlayer(LG, duel.ids.b) } }) : null;
            if (d.engine) d.engine.newGame();
            if (duel && S.lozzaReady && d.lozzaEngine) d.lozzaEngine.newGame();
            S.nextRevealAt = now() + TV_CONFIG.INTRO_DELAY_MS;
            // Presenta el repte del duel sense avançar les jugades dels motors.
            // El context prové exclusivament de les decisions ja preses
            // per tvMatchPlan, tvPickOpening i tvPickStyles.
            const I = getTvIntro();
            let intro = null;
            let introTurns = null;
            if (fixture) {
                // Lliga de llegendes: què hi ha en joc (lloc i punts ara i si guanyen),
                // i una presentació en diàleg amb els noms, els colors i la jornada.
                duel.stakes = typeof LG.stakes === 'function' ? LG.stakes(league, fixture.id) : null;
                const presented = typeof LG.introDialogue === 'function'
                    ? LG.introDialogue({ white: duel.ids.w, black: duel.ids.b, season: league.season, round: duel.round,
                        rounds: LG.progress(league).rounds, seq: S.game.id, engines: duel.engines,
                        table: LG.table(league), lastSeason: league.lastSeason, stakes: duel.stakes })
                    : { text: LG.intro({ white: duel.ids.w, black: duel.ids.b, season: league.season, round: duel.round,
                        rounds: LG.progress(league).rounds, seq: S.game.id, engines: duel.engines,
                        table: LG.table(league), lastSeason: league.lastSeason }), turns: null };
                intro = presented.text;
                introTurns = presented.turns;
                duel.reason = 'Lliga ' + league.season + ' · jornada ' + duel.round + ' de ' + LG.progress(league).rounds;
                if (league.lastSeason && !league.lastSeason.announced) { league = LG.markAnnounced(league); saveLeague(); }
            } else if (I && typeof I.scene === 'function' && (duel || pick.opening)) {
                intro = I.scene({
                    gameSeq: S.game.id, duel: duel,
                    preparedPlies: S.game.prepared.length,
                    sharpOpening: tvIsSharpOpening(pick.opening),
                    mateAngle: untilMate ? pick.opening.angle : null,
                    strengthAdjusted: !!(!untilMate && prefs.unequal && S.caps &&
                        (S.caps.mode === 'elo' || S.caps.mode === 'skill')),
                    styles: styles
                });
            }
            if (intro) {
                S.game.comment = { kind: 'intro', text: intro, speech: tvSpeechText(intro), ply: 0, gameId: S.game.id };
                if (introTurns) S.game.comment.dialogue = introTurns;
                S.game.intro = S.game.comment;
                S.nextRevealAt = Math.max(S.nextRevealAt, now() + tvReadingTimeMs(intro, v.tier));
                notify('comment', S.game.comment);
            }
            render();
            if (S.game.comment) S.speech = speakComment(S.game.comment, epoch);
            runLoop(epoch);
        }

        function spokenTurns(comment) {
            return tvDialogueTurns(comment, !!(d.voice && typeof d.voice.supportsDual === 'function' &&
                d.voice.supportsDual()));
        }

        // opts = { fromTurn, force }: per reprendre un comentari a mitges
        // quan Matxa torna. El resultat diu si la veu ha caigut (voiceDown) i
        // en quin fragment.
        function speakComment(comment, epoch, opts) {
            const o = opts || {};
            if (!d.voice || !d.voice.isOn() || d.voice.status() === 'no-voice' || d.voice.status() === 'unsupported') return null;
            const started = now(), direction = tvSpeechDirection(comment);
            const turns = spokenTurns(comment);
            // L'estat de partida
            // s'examina ENTRE fragments per no parlar després d'aturar la TV.
            return (async () => {
                let spoken = false, voiceDown = false, failedTurn = -1;
                for (let i = o.fromTurn || 0; i < turns.length; i++) {
                    const turn = turns[i];
                    if (!alive(epoch)) break;
                    const tone = turn.role === 'maxim'
                        ? tvSpeechDirection({ kind: 'summary' }) : direction;
                    const r = await d.voice.speak(turn.text, { rate: tone.rate, pitch: tone.pitch,
                        voiceId: turn.voiceId, maxWaitMs: tvSpeechMaxWaitMs(turn.text), force: !!o.force });
                    if (!r || r.reason === 'stopped' || r.reason === 'not-allowed') break;
                    if (r.reason === 'neural-down') { voiceDown = true; failedTurn = i; break; }
                    spoken = spoken || !!r.spoken;
                    if (!r.spoken) break;
                }
                return { spoken, voiceDown, failedTurn, comment, endedAt: now(), startedAt: started, epoch, pauseMs: direction.pauseMs };
            })().catch(() => ({ spoken: false, endedAt: now(), startedAt: started, epoch,
                pauseMs: direction.pauseMs }));
        }

        function voiceHoldWanted() {
            return !!(d.voice && d.voice.isOn() && typeof d.voice.holdsForNeural === 'function' && d.voice.holdsForNeural());
        }

        // Matxa s'ha aturat a mitja partida: no es mou cap peça ni es comenta
        // res fins que la veu torna. Cada VOICE_RETRY_MS es torna a provar el
        // fragment que ha fallat; quan sona, la partida continua on era. Si
        // l'usuari apaga la veu, continua sense comentaris. Torna false si la
        // TV s'ha aturat o ha canviat de partida mentre s'esperava.
        async function holdForVoice(g, result, epoch) {
            let sp = result;
            while (sp && sp.voiceDown && voiceHoldWanted()) {
                if (!S.voiceHold) {
                    S.voiceHold = { since: now(), attempts: 0, nextTryAt: 0, trying: false };
                    notify('voiceHold', true);
                }
                S.voiceHold.trying = false;
                S.voiceHold.nextTryAt = now() + TV_CONFIG.VOICE_RETRY_MS;
                render();
                while (S.voiceHold && now() < S.voiceHold.nextTryAt) {
                    if (!(await sleep(Math.min(1000, S.voiceHold.nextTryAt - now()), epoch)) || S.game !== g) return false;
                    if (!voiceHoldWanted()) break;
                }
                if (!S.voiceHold || !voiceHoldWanted()) break;
                S.voiceHold.attempts++;
                S.voiceHold.trying = true;
                render();
                const next = speakComment(sp.comment, epoch, { fromTurn: Math.max(0, sp.failedTurn), force: true });
                sp = next ? await next : null;
                if (!alive(epoch) || S.game !== g) return false;
            }
            if (S.voiceHold) {
                S.voiceHold = null;
                notify('voiceHold', false);
                render();
            }
            return sp || null;
        }

        function humanizeOn() {
            return d.humanize !== undefined ? !!d.humanize : !!TV_CONFIG.HUMANIZE.ENABLED;
        }

        // Jugador de la lliga per a la humanització: id i pesos del seu perfil
        // (els mateixos `weights` de llegendes.js, per a Stockfish i per a Lozza).
        function legendPlayer(LG, id) {
            const p = LG && typeof LG.legend === 'function' ? LG.legend(id) : null;
            return { id: id, weights: p ? p.weights : null };
        }

        // Perfil de jugades d'un jugador de la lliga com a «estil» (id, etiqueta i pesos).
        function legendPlayerStyle(id) {
            const LGm = d.legends || root.ElTaulerLlegendes;
            const p = LGm && typeof LGm.legend === 'function' ? LGm.legend(id) : null;
            return p && p.weights ? { id: p.id, label: p.short, weights: p.weights } : null;
        }

        function analysisJob(g, uciMoves, ply, fen) {
            const H = g.human ? getHumanitzacio() : null;
            return {
                tag: { gameId: g.id, ply: ply, fen: fen, kind: 'analysis' },
                position: tvPositionCommand(uciMoves, g.startFen),
                strength: tvStrengthCommands(S.caps, 'analysis'),
                multipv: H ? Math.max(TV_CONFIG.ANALYSIS_MULTIPV, H.CONFIG.MULTIPV) : TV_CONFIG.ANALYSIS_MULTIPV,
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
                // Línies candidates (des de qui mou) per a la humanització.
                if (g.human) { const H = getHumanitzacio(); if (H) a.lines = H.linesFromInfos(res.infos); }
                g.analyses[key] = a;
                return a;
            });
        }

        async function playerMove(g, uciMoves, ply, fen, epoch) {
            const color = String(fen).split(' ')[1] === 'b' ? 'b' : 'w';
            const lozzaTurn = g.engines && g.engines[color] === 'lozza';
            const engine = lozzaTurn ? d.lozzaEngine : d.engine;
            if (!engine) return null;
            const mate = g.matchPlan && g.matchPlan.untilMate ? g.matchPlan : null;
            const mode = S.caps ? S.caps.mode : 'none';
            // Lliga de llegendes: cada jugador té el seu nivell, profunditat i perfil.
            // Si ha començat el defalliment d'aquest bàndol, juga amb menys precisió.
            const side = g.matchPlan && g.matchPlan.legends
                ? tvSlumpSide(S.caps, g.matchPlan.sides[color], g.matchPlan.slump, color, ply) : null;
            if (side && side.slumped && !g.slumped) g.slumped = { color: color, fromPly: g.matchPlan.slump.fromPly };
            // Si la partida s'encalla, fase d'atac: Stockfish arrisca amb un perfil de
            // progrés i un marge més ample; Lozza calcula més profund.
            // Un cop un bàndol hi ha entrat, s'hi queda (la fitxa i l'anunci ho diuen així).
            // Humanització: línies candidates de l'anàlisi (mateixa font per a Stockfish i
            // per a Lozza) i perfil de jugades del jugador, que a Lozza no s'aplica al motor.
            const humanAnalysis = g.human && !mate ? g.analyses[ply + '|' + fen] : null;
            const humanLines = humanAnalysis && humanAnalysis.reliable && humanAnalysis.lines && humanAnalysis.lines.length > 1
                ? humanAnalysis.lines : null;
            const humanStyle = g.human && side ? legendPlayerStyle(g.matchPlan.ids[color]) : null;
            const late = side ? tvLateAttack({ ChessCtor: d.ChessCtor, fen: fen, ply: ply, startFen: g.startFen, history: uciMoves,
                baseStyle: humanStyle || side.style, force: g.attack && g.attack[color] ? g.attack[color] : null }) : null;
            if (late) {
                g.attack = Object.assign({}, g.attack || {});
                if (!g.attack[color]) g.attack[color] = late.reason;
            }
            const movetime = mate ? mate.movetime : lozzaTurn ? (side ? Math.round(side.movetime * (late ? late.movetimeFactor : 1)) : g.matchPlan.lozzaMovetime) : TV_CONFIG.PLAYER_MOVETIME_MS[mode] || 500;
            const style = side ? (lozzaTurn ? null : (late ? late.style : side.style)) : (!lozzaTurn && g.styles ? g.styles[color] : null);
            const job = {
                tag: { gameId: g.id, ply: ply, fen: fen, kind: 'move', engine: lozzaTurn ? 'lozza' : 'stockfish' },
                position: tvPositionCommand(uciMoves, g.startFen),
                strength: lozzaTurn ? [] : tvStrengthCommands(S.caps, mate ? 'analysis' : 'player',
                    side ? side.level : g.matchPlan ? g.matchPlan.stockfishLevel : tvSideLevel(g.level, fen)),
                // Amb línies d'anàlisi per humanitzar, el motor no cal que calculi MultiPV.
                multipv: style && !humanLines ? TV_CONFIG.STYLE_MULTIPV : 1,
                // Lozza no declara Skill Level ni UCI_Elo. La profunditat és un
                // límit de càlcul, mai una valoració d'Elo equivalent.
                go: mate || lozzaTurn ? 'go depth ' + (mate ? mate.depth : side ? side.depth + (late ? late.depthBonus : 0) : g.matchPlan.lozzaDepth) + ' movetime ' + movetime
                    : 'go movetime ' + movetime,
                movetime: movetime
            };
            let res = await engine.request(job);
            if (!alive(epoch) || S.game !== g) return null;
            if (mate && res && !res.bestUci) {
                // Lozza pot recordar una línia de mat i retornar «bestmove NULL»
                // tot i tenir jugades legals. Reprenem la cerca des del tauler
                // visible amb una memòria de cerca nova. La partida conserva l’historial.
                engine.newGame();
                res = await engine.request({ ...job, position: tvPositionCommand([], fen), go: 'go depth 4', movetime: 250 });
                if (!alive(epoch) || S.game !== g) return null;
                if (!res || !res.bestUci) { fail('engine'); return null; }
            }
            if (!res) return null;
            if (humanLines && res.bestUci) {
                const H = getHumanitzacio();
                const dec = H.decide(g.human, color, { ChessCtor: d.ChessCtor, fen: fen, ply: ply, lines: humanLines,
                    engineUci: res.bestUci, features: tvMoveFeatures,
                    context: late ? late.context : tvMoveContext(d.ChessCtor, g.startFen, uciMoves),
                    weights: late ? late.style.weights : (humanStyle ? humanStyle.weights : null),
                    windowCp: late ? late.windowCp : undefined, risk: late ? 1 : 0 });
                if (dec && dec.uci) return dec.uci;
            }
            return style ? tvPickStyledMove(d.ChessCtor, fen, res.infos, res.bestUci, style,
                late ? late.windowCp : undefined, late ? late.context : undefined).uci : res.bestUci;
        }

        function gameEnd(g, chess) {
            return tvGameEnd(chess, g.matchPlan && g.matchPlan.untilMate ? TV_CONFIG.MATE_MAX_PLIES : TV_CONFIG.MAX_PLIES);
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
                        if ((d.engine && d.engine.failed && d.engine.failed())
                            || (g.engines[g.chess.turn()] === 'lozza' && d.lozzaEngine && d.lozzaEngine.failed && d.lozzaEngine.failed())) {
                            fail('engine'); return;
                        }
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
                // Amb control manual l'usuari decideix quan s'acaba: el motor no abandona per ell.
                const inLeague = !!(g.matchPlan && g.matchPlan.legends);
                const resign = S.control || (g.matchPlan && g.matchPlan.untilMate) ? null : tvResignStep(g.resign, after, ply + 1,
                    tvResignThresholdCp(S.caps, g.level.value), inLeague ? TV_CONFIG.LEAGUE_RESIGN_MIN_PLY : undefined);
                // Lliga: taules per acord si la posició fa estona que està igualada i no avança.
                const draw = inLeague && !S.control ? tvAgreedDrawStep(g.drawWatch, after, ply + 1, applied.fen) : null;
                const plan = planMove(g, uci, fenBefore, prepared, before, after, resign, draw);
                if (!plan) { fail('illegal'); return; }
                if (plan.chosen && d.voice && typeof d.voice.prefetch === 'function') {
                    const planned = { ...plan.chosen, speech: tvSpeechText(plan.chosen.say || plan.chosen.text), ply };
                    const direction = tvSpeechDirection(planned);
                    for (const turn of spokenTurns(planned)) {
                        const tone = turn.role === 'maxim'
                            ? tvSpeechDirection({ kind: 'summary' }) : direction;
                        d.voice.prefetch(turn.text, { ...tone, voiceId: turn.voiceId });
                    }
                }

                // Espera la visualització de la jugada anterior i la seva locució.
                const waitMs = S.nextRevealAt - now();
                if (waitMs > 0 && !(await sleep(waitMs, epoch))) return;
                if (S.speech) {
                    let sp = await S.speech;
                    if (!alive(epoch) || S.game !== g) return;
                    S.speech = null;
                    if (sp && sp.voiceDown) {
                        sp = await holdForVoice(g, sp, epoch);
                        if (sp === false) return;
                    }
                    if (sp && sp.spoken && !(await sleep(isNum(sp.pauseMs) ? sp.pauseMs : TV_CONFIG.POST_SPEECH_PAUSE_MS, epoch))) return;
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
        function planMove(g, uci, fenBefore, prepared, before, after, resign, draw) {
            const ply = g.moves.length;
            const prevMove = ply ? g.moves[ply - 1].verbose : null;
            const copy = new d.ChessCtor(g.startFen);
            for (const u of g.uci) {
                if (!copy.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : 'q' })) return null;
            }
            const mv = copy.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            if (!mv) return null;
            const fenAfter = copy.fen();
            const end = gameEnd(g, copy) || (resign && resign.end) || (draw && draw.end) || null;
            // La memòria de la retransmissió només s'actualitza quan la jugada
            // es mostra de debò (reveal): si una pausa descarta aquest pla, la
            // memòria visible continua intacta.
            const step = tvBroadcastStep({
                ChessCtor: d.ChessCtor, fenBefore: fenBefore, fenAfter: fenAfter, move: mv, prevMove: prevMove,
                before: before, after: after, tier: g.tier, prepared: !!prepared, phrase: prepared ? prepared.phrase : null,
                end: end, ply: ply, memory: g.memory, expression: d.expression, narrative: d.narrative, quality: d.quality,
                patterns: d.patterns, art: d.art, gameId: g.id, visio: d.visio,
                legends: g.matchPlan && g.matchPlan.legends && LG ? { api: LG, ids: g.matchPlan.ids, engines: g.matchPlan.engines,
                    names: g.matchPlan.names, stakes: g.matchPlan.stakes || null, attack: g.attack ? Object.assign({}, g.attack) : null,
                    slump: g.slumped ? Object.assign({}, g.slumped) : null } : null,
                opening: openingDialogueContext(g, mv, fenBefore, fenAfter, prepared)
            });
            return { ply: ply, fenAfter: fenAfter, end: end, chosen: step.comment, memory: step.memory,
                resign: resign ? resign.state : undefined, drawWatch: draw ? draw.state : undefined, decided: tvIsDecided(after) };
        }

        function reveal(g, uci, prepared, plan, epoch) {
            const entry = commitMove(g, uci, prepared, plan, false);
            if (!entry) return;
            const shownAt = now();
            let delay = tvMoveDelayMs(prefs.speed, { tier: g.tier, prepared: !!prepared, random: random(), decided: !!plan.decided });
            if (g.comment) delay = Math.max(delay, tvReadingTimeMs(tvReadingText(g.comment), g.tier));
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
            const undo = { fenBefore: fenBefore, memory: g.memory, identified: g.identified, resign: g.resign, drawWatch: g.drawWatch };
            const mv = g.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            if (!mv || ply !== plan.ply) { fail('illegal'); return null; }
            const fenAfter = g.chess.fen();
            g.uci.push(uci);
            const entry = { ply: ply, san: mv.san, uci: uci, color: mv.color, from: mv.from, to: mv.to, prepared: !!prepared, fen: fenAfter, verbose: mv,
                byUser: !!byUser, commentObj: null, undo: undo };
            g.moves.push(entry);
            g.identified = identifyOpening(g) || g.identified;
            g.end = plan.end;
            g.comment = null;
            g.memory = plan.memory;
            if (plan.resign !== undefined) g.resign = plan.resign;
            if (plan.drawWatch !== undefined) g.drawWatch = plan.drawWatch;
            if (plan.chosen) attachComment(g, entry, plan.chosen);
            return entry;
        }

        function attachComment(g, entry, chosen) {
            // El comentari queda LLIGAT a aquesta posició (partida + ply + FEN).
            g.comment = { kind: chosen.kind, text: chosen.text, say: chosen.say || chosen.text,
                speech: tvSpeechText(chosen.say || chosen.text), ply: entry.ply, fen: entry.fen, gameId: g.id,
                explanatory: !!chosen.explanatory, extended: !!chosen.extended, byUser: entry.byUser,
                narrative: chosen.narrative || null,
                dialogue: chosen.dialogue || null,
                dialogueEvent: chosen.dialogueEvent || null,
                forecast: chosen.forecast || null,
                maxim: chosen.maxim || null };
            g.comments.push({ ply: entry.ply, kind: chosen.kind, text: chosen.text, color: entry.color, key: chosen.key, sig: chosen.sig });
            entry.comment = chosen.say || chosen.text;
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
                end: g.end, ply: ply, memory: entry.undo.memory, expression: d.expression, narrative: d.narrative, quality: d.quality,
                patterns: d.patterns, art: d.art, gameId: g.id, visio: d.visio
            });
            S.pendingUser = false;
            g.memory = step.memory;
            let delay = TV_CONFIG.CONTROL_REPLY_DELAY_MS;
            if (step.comment) {
                attachComment(g, entry, step.comment);
                delay = clamp(tvReadingTimeMs(tvReadingText(g.comment), g.tier),
                    delay, TV_CONFIG.CONTROL_REPLY_MAX_MS);
                notify('comment', g.comment);
            }
            S.nextRevealAt = now() + delay;
            render();
            if (g.comment) S.speech = speakComment(g.comment, epoch);
            if (!g.end) runLoop(epoch);
        }

        async function scheduleNextGame(g, epoch) {
            // Només compten partides íntegrament automàtiques i acabades.
            // El comptador és idempotent en pauses i reobertures.
            if (g.end && !g.recorded && !g.hadManualControl && g.matchPlan && g.matchPlan.legends && LG && league) {
                // Lliga de llegendes: el resultat entra a la classificació. Quan
                // tothom ha jugat dues vegades amb tothom, la lliga s'acaba i en comença una de nova.
                g.recorded = true;
                const plan = g.matchPlan;
                const result = g.end.result === '1-0' ? '1-0' : g.end.result === '0-1' ? '0-1' : '1/2';
                const outcome = LG.record(league, plan.fixture.id, { result: result, plies: g.moves.length, reason: g.end.reason }, random);
                if (outcome.recorded) {
                    const before = LG.table(league);
                    const after = outcome.finished ? outcome.finished.table : LG.table(outcome.state);
                    const closing = { white: plan.ids.w, black: plan.ids.b, result: result, round: plan.round,
                        table: after, before: before, roundDone: outcome.roundDone, finished: outcome.finished, seq: g.id };
                    g.leagueNote = LG.resultNote(closing);
                    g.leagueTurns = typeof LG.resultDialogue === 'function' ? LG.resultDialogue(closing).turns : null;
                    // L'última partida de la lliga: la classificació final es veu fins que comença la nova.
                    if (outcome.finished) { g.finalTable = outcome.finished.table; g.finalSeason = outcome.finished.season; }
                    league = outcome.state;
                    saveLeague();
                }
            } else if (g.end && !g.recorded && !g.hadManualControl && g.matchPlan) {
                g.recorded = true;
                const winningColor = g.end.result === '1-0' ? 'w' : g.end.result === '0-1' ? 'b' : null;
                const winner = winningColor ? g.engines[winningColor] : 'draw';
                const plan = g.matchPlan;
                const record = { winner: winner, lozzaColor: plan.lozzaColor, sig: tvCapsSignature(S.caps),
                    plies: g.moves.length, reason: g.end.reason };
                if (plan.untilMate) {
                    if (plan.rematch) g.pairScore = tvMatePairScore(plan.firstResult, winner);
                    const series = plan.rematch ? { index: plan.index + 1 }
                        : { index: plan.index, returnColor: other(plan.lozzaColor), firstResult: winner };
                    prefs = Object.assign({}, prefs, { mateSeries: tvMateSeries(series), mateRecent: tvRecentResults(prefs.mateRecent.concat(record)) });
                } else {
                    prefs = Object.assign({}, prefs, { recent: tvRecentResults(prefs.recent.concat(record)) });
                }
                savePrefs();
            }
            if (S.speech) {
                const sp = await S.speech;
                if (!alive(epoch) || S.game !== g) return;
                S.speech = null;
                if (sp && sp.voiceDown && (await holdForVoice(g, sp, epoch)) === false) return;
            }
            // Lliga de llegendes: l'Èlia tanca la partida amb el resultat i la classificació.
            if (g.leagueNote && !g.leagueAnnounced) {
                g.leagueAnnounced = true;
                const note = { kind: 'result', text: g.leagueNote, say: g.leagueNote, speech: tvSpeechText(g.leagueNote),
                    ply: g.moves.length, fen: g.chess.fen(), gameId: g.id };
                if (g.leagueTurns) note.dialogue = g.leagueTurns;
                g.comment = note;
                notify('comment', note);
                render();
                const sp = speakComment(note, epoch);
                if (sp) {
                    const res = await sp;
                    if (!alive(epoch) || S.game !== g) return;
                    if (res && res.voiceDown && (await holdForVoice(g, res, epoch)) === false) return;
                }
            }
            const delay = Math.round(TV_CONFIG.NEXT_GAME_DELAY_MS * (g.tier === 'basic' ? 1.2 : 1));
            g.nextGameAt = now() + delay;
            notify('result', { gameId: g.id, end: g.end, nextGameAt: g.nextGameAt });
            render();
            if (!(await sleep(delay, epoch))) return;
            if (S.game === g) startGame();
        }

        function rebuildChess(g) {
            const chess = new d.ChessCtor(g.startFen);
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
                    // Lozza es carrega només quan s'obre aquesta TV; si falla
                    // la càrrega, es continua amb Stockfish sense bloquejar.
                    const opponent = d.lozzaEngine ? d.lozzaEngine.ready().catch(() => null) : Promise.resolve(null);
                    return opponent.then((lozzaCaps) => {
                        if (!S.open) return;
                        S.lozzaReady = !!lozzaCaps;
                        S.duelWarning = !!d.lozzaEngine && !S.lozzaReady;
                        notify('caps', caps);
                        if (S.userPaused || S.hidden) { render(); return; }
                        if (!S.game) startGame(); else resumeLoop();
                    });
                });
            },
            close() {
                halt();
                S.open = false;
                if (d.engine) d.engine.destroy();
                if (d.lozzaEngine) d.lozzaEngine.destroy();
                render();
            },
            // Canvia el motor de Stockfish: l'escala de nivells pot ser una altra
            // (Skill Level o Elo), així que la partida en curs es deixa i, si la
            // TV és oberta, en comença una de nova amb el motor nou.
            replaceEngine(engine) {
                halt();
                if (d.engine && d.engine !== engine) d.engine.destroy();
                d.engine = engine;
                S.caps = null;
                S.game = null;
                S.control = null;
                S.error = null;
                render();
                return S.open ? api.open() : Promise.resolve();
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
                // El partit de la lliga que estava en curs no es juga: se'n triarà un altre.
                if (LG && league) { league = LG.skipCurrent(league); saveLeague(); }
                startGame();
            },
            setSpeed(id) {
                if (!TV_CONFIG.SPEEDS[id]) return;
                prefs = Object.assign({}, prefs, { speed: id });
                savePrefs();
                render();
            },
            // Parella de comentaristes local a Stockfish TV, sense tocar
            // les veus que l'usuari té configurades a la resta de l'app.
            setDuo(on) {
                prefs = Object.assign({}, prefs, { duo: !!on });
                savePrefs();
                render();
            },
            setUntilMate(on) {
                prefs = Object.assign({}, prefs, { untilMate: !!on });
                savePrefs();
                render();
            },
            // Perfils de joc: s'aplica a la PARTIDA SEGÜENT.
            setProfiles(on) {
                prefs = Object.assign({}, prefs, { profiles: !!on });
                savePrefs();
                render();
            },
            // Nivells desiguals: s'aplica a la PARTIDA SEGÜENT.
            setUnequal(on) {
                prefs = Object.assign({}, prefs, { unequal: !!on });
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
                g.resign = entry.undo.resign || { side: null, plies: 0 };
                g.drawWatch = entry.undo.drawWatch;
                g.comments = g.comments.filter(c => c.ply < g.moves.length);
                g.end = null;
                g.pairScore = '';
                g.nextGameAt = null;
                const prev = g.moves[g.moves.length - 1];
                g.comment = prev ? prev.commentObj : g.intro;
                S.control = { color: g.chess.turn() };
                g.hadManualControl = true;
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
                g.hadManualControl = true;
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
                g.end = gameEnd(g, g.chess);
                S.pendingUser = true;
                notify('move', { gameId: g.id, move: entry, comment: null });
                render();
                userMoveFlow(g, entry, epoch);
                return true;
            },
            currentFen() { return S.game ? S.game.chess.fen() : null; },
            isActive() { return S.open && !S.userPaused && !S.hidden; },
            // Per als tests i el diagnòstic.
            _league: () => league,
            _internal: S
        };
        return api;
    }

    // ------------------------------------------------------------------
    // Mode cinema: fons negre, només el tauler i els dos jugadors
    // ------------------------------------------------------------------
    // Disposició segons l'espai útil de la pantalla (sense els marges):
    //   · 'stack': negres a dalt i blanques a baix del tauler (mòbil dret,
    //     finestres estretes). Les fitxes resten alçada al tauler.
    //   · 'side': les dues fitxes en una columna a la dreta (negres a dalt,
    //     blanques a baix) i el tauler ocupa tota l'alçada (ordinador, mòbil
    //     apaïsat).
    // Es tria la que dona el tauler més gran. Si la diferència és petita, es
    // manté la d'ara (`current`) perquè no salti mentre es canvia la finestra.
    const TV_CINEMA = { GAP: 10, SIDE_MIN: 170, SIDE_MAX: 300, SIDE_SHARE: 0.24, MIN_BOARD: 120, HYSTERESIS: 16 };
    function tvCinemaLayout(opts = {}) {
        const C = TV_CINEMA;
        const num = v => Math.max(0, Number(v) || 0);
        const width = num(opts.width), height = num(opts.height), players = num(opts.playersHeight);
        const sideWidth = Math.round(Math.min(C.SIDE_MAX, Math.max(C.SIDE_MIN, width * C.SIDE_SHARE)));
        const sizes = {
            stack: Math.floor(Math.min(width, height - players - 2 * C.GAP)),
            side: Math.floor(Math.min(height, width - sideWidth - C.GAP))
        };
        let mode = sizes.side > sizes.stack ? 'side' : 'stack';
        const current = opts.current;
        if ((current === 'side' || current === 'stack') && sizes[current] + C.HYSTERESIS >= sizes[mode]) mode = current;
        return { mode, size: Math.max(C.MIN_BOARD, sizes[mode]), sideWidth, gap: C.GAP };
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
    let voiceHoldTimer = null;
    let uiReady = false;
    // Mode cinema: `cinemaHistory` diu que hi ha un pas propi a l'historial
    // (el gest d'enrere en surt sense tancar la TV) que encara no s'ha desfet.
    let cinema = false;
    let cinemaHistory = false;
    let cinemaIdleTimer = null;
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
    // La lliga de llegendes es desa a part, amb una clau sense prefix chess_/
    // eltauler_ (la sincronització al núvol no la recull, com les preferències).
    function loadLeagueRaw() {
        const LG = root.ElTaulerLlegendes;
        try { return JSON.parse(localStorage.getItem(LG ? LG.KEY : 'tauler_tv_legends_v1') || 'null'); } catch (e) { return null; }
    }
    function saveLeagueRaw(state) {
        const LG = root.ElTaulerLlegendes;
        try { localStorage.setItem(LG ? LG.KEY : 'tauler_tv_legends_v1', JSON.stringify(state)); } catch (e) {}
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
    function applyBroadcastHighlights(el, marks = {}) {
        if (!el) return;
        const toggle = (el, name, active) => { if (el.classList.contains(name) !== !!active) el.classList.toggle(name, !!active); };
        const preview = marks.preview || null, last = marks.last || null;
        el.querySelectorAll('[data-square]').forEach(sq => {
            const name = sq.getAttribute('data-square');
            toggle(sq, 'sftv-from', !preview && !!last && name === last.from);
            toggle(sq, 'sftv-to', !preview && !!last && name === last.to);
            toggle(sq, 'sftv-preview', name === preview);
            toggle(sq, 'sftv-sel', name === marks.selected);
            toggle(sq, 'sftv-target', (marks.targets || []).includes(name));
        });
    }
    function applyHighlight() {
        applyBroadcastHighlights($id('sftv-board'), { preview: previewHighlight, last: lastHighlight,
            selected: selectedSquare, targets: selectedTargets });
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
        if (cinema && screen) {
            // El tauler s'adapta a tota la pantalla (tvCinemaLayout): l'espai
            // útil és el de la pantalla sense els marges (zones segures del mòbil).
            const css = root.getComputedStyle(screen);
            const px = name => parseFloat(css[name]) || 0;
            const players = ['sftv-player-black', 'sftv-player-white']
                .reduce((sum, id) => sum + ($id(id) ? $id(id).offsetHeight : 0), 0);
            const current = screen.classList.contains('is-cinema-side') ? 'side' : 'stack';
            const layout = tvCinemaLayout({
                width: screen.clientWidth - px('paddingLeft') - px('paddingRight'),
                height: screen.clientHeight - px('paddingTop') - px('paddingBottom'),
                playersHeight: players,
                current
            });
            screen.classList.toggle('is-cinema-side', layout.mode === 'side');
            screen.style.setProperty('--sftv-cinema-size', layout.size + 'px');
            screen.style.setProperty('--sftv-cinema-side', layout.sideWidth + 'px');
        }
        const width = Math.round($id('sftv-board').getBoundingClientRect().width);
        if (width && width !== boardRenderedWidth) {
            try { board.resize(); boardRenderedWidth = width; } catch (e) {}
        }
        applyHighlight();
    }

    function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }

    // El botó de sortida i el cursor s'amaguen després d'uns segons sense
    // tocar res; qualsevol moviment, toc o tecla els torna a mostrar.
    const CINEMA_IDLE_MS = 2500;
    function cinemaWake() {
        const screen = $id('sftv-screen');
        if (!screen || !cinema) return;
        screen.classList.remove('is-idle');
        if (cinemaIdleTimer) clearTimeout(cinemaIdleTimer);
        cinemaIdleTimer = setTimeout(() => {
            cinemaIdleTimer = null;
            if (cinema) screen.classList.add('is-idle');
        }, CINEMA_IDLE_MS);
    }

    function setCinema(value) {
        const screen = $id('sftv-screen');
        if (!screen || cinema === value) return;
        cinema = value;
        if (value) savedScroll = { x: root.scrollX, y: root.scrollY };
        screen.classList.toggle('is-cinema', value);
        document.body.classList.toggle('sftv-cinema', value);
        document.documentElement.classList.toggle('sftv-cinema', value);
        if (value) cinemaWake();
        else {
            if (cinemaIdleTimer) { clearTimeout(cinemaIdleTimer); cinemaIdleTimer = null; }
            screen.classList.remove('is-idle', 'is-cinema-side');
            screen.style.removeProperty('--sftv-cinema-size');
            screen.style.removeProperty('--sftv-cinema-side');
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

    // Surt del mode cinema i la TV continua. `fromBack`: ho ha demanat el gest
    // d'enrere (el pas propi de l'historial ja s'ha desfet). `closing`: la
    // pantalla es tanca; el pas sobrant de l'historial no fa cap mal.
    function exitCinema(opts = {}) {
        fullscreenRequest++;
        exitNativeFullscreen();
        const wasCinema = cinema;
        setCinema(false);
        if (opts.fromBack || opts.closing) cinemaHistory = false;
        else if (wasCinema && cinemaHistory) {
            // Desfà el pas propi: el popstate arriba a handleBack, que el consumeix.
            try { root.history.back(); } catch (e) { cinemaHistory = false; }
        }
        if (wasCinema && !opts.closing) {
            const button = $id('sftv-cinema');
            if (button && screenVisible()) button.focus({ preventScroll: true });
        }
    }

    function enterCinema() {
        const screen = $id('sftv-screen');
        if (cinema || !screen || !screenVisible()) return;
        setCinema(true);
        // Un pas a l'historial: al mòbil, el gest d'enrere surt del mode
        // cinema en comptes de tancar la TV.
        if (!cinemaHistory && root.history && typeof root.history.pushState === 'function') {
            try {
                root.history.pushState({ screen: 'sftv-screen', sftvCinema: true }, '', root.location.href);
                cinemaHistory = true;
            } catch (e) {}
        }
        const exit = $id('sftv-cinema-exit');
        if (exit) exit.focus({ preventScroll: true });
        const requestId = ++fullscreenRequest;
        const request = screen.requestFullscreen || screen.webkitRequestFullscreen;
        // Si el navegador no admet la pantalla completa (iPhone) o la denega,
        // el mode cinema igualment omple tota la finestra.
        if (!request || fullscreenElement()) return;
        try {
            Promise.resolve(request.call(screen)).then(() => {
                if (requestId !== fullscreenRequest || !cinema || !screenVisible()) {
                    exitNativeFullscreen();
                    return;
                }
                nativeFullscreen = fullscreenElement() === screen;
                resizeBoard();
            }).catch(() => {});
        } catch (e) {}
    }

    // «Enrere» d'app.js (navGoBack) amb la TV oberta: si hi ha el pas propi
    // del mode cinema, el consumeix (i en surt) i la TV no es tanca.
    function handleBack() {
        if (!cinemaHistory) return false;
        cinemaHistory = false;
        if (cinema) exitCinema({ fromBack: true });
        return true;
    }

    function onFullscreenChange() {
        const ownsFullscreen = fullscreenElement() === $id('sftv-screen');
        if (ownsFullscreen) {
            nativeFullscreen = true;
            if (!cinema || !screenVisible()) exitNativeFullscreen();
        } else if (nativeFullscreen) {
            // S'ha sortit de la pantalla completa (Esc, gest del mòbil): també
            // del mode cinema.
            nativeFullscreen = false;
            exitCinema();
        }
        setTimeout(resizeBoard, 0);
    }

    // Shared audio UI: one template and one implementation for both players.
    function createBroadcastAudioControls(options) {
        const prefix = options.prefix || 'sftv';
        const bridge = options.bridge || {};
        const $id = id => document.getElementById(id.replace(/^sftv/, prefix));
        const loadPrefsRaw = options.loadPrefs;
        const savePrefsRaw = options.savePrefs;
        const screenVisible = options.visible;
        const controller = { state: options.getState };
        let voice = null, radioAmbience = null;
        // Música de fons: un bucle que l'app COMPON per a cada partida
        // (identificador de la partida a l'estat) o, si no n'hi ha, per a cada
        // retransmissió: estil, tonalitat, solista i melodia nous cada vegada
        // (radioambient.js, composeMelodyId). Sense compositor, una de les
        // melodies de la ràdio.
        let melodyKey, melody = null, registered = null;
        function gameMelody(api, state) {
            const key = state && state.game && state.game.id !== undefined ? 'game:' + state.game.id
                : (state && state.gameKey !== undefined ? 'key:' + state.gameKey : 'session');
            if (!melody || key !== melodyKey) {
                melodyKey = key;
                melody = typeof api.composeMelodyId === 'function' ? api.composeMelodyId(Math.random, melody) : api.pickMelody(Math.random, melody);
            }
            return melody;
        }
        // Quan un bucle compost comença a sonar, queda al registre de música
        // composta (Configuració › Veus de lectura).
        function registerPlaying(api, playing) {
            if (!playing || playing === registered || typeof api.parseComposedId !== 'function') return;
            const p = api.parseComposedId(playing);
            if (!p) return;
            registered = playing;
            try { api.registerComposition({ where: 'tv', style: p.style, seed: p.seed, loop: true }); } catch (err) {}
        }
        if (prefix !== 'sftv' && options.host) {
            options.host.textContent = '';
            ['.sftv-voicebar', '#sftv-matxa-controls'].forEach(selector => {
                const source = document.querySelector(selector);
                if (!source) return;
                const clone = source.cloneNode(true);
                [clone, ...clone.querySelectorAll('*')].forEach(el => {
                    ['id', 'for', 'aria-controls', 'aria-describedby'].forEach(attr => {
                        if (el.hasAttribute(attr)) el.setAttribute(attr, el.getAttribute(attr).replace(/sftv/g, prefix));
                    });
                });
                const help = clone.querySelector('fieldset .setting-help');
                if (help) help.textContent = help.textContent.replace('Stockfish TV', 'aquesta reproducció');
                options.host.appendChild(clone);
            });
        }
    function syncRadioAmbience(unlock = false) {
        voice = options.getVoice();
        const api = root.ElTaulerRadioAmbient;
        if (!api) return;
        const state = controller ? controller.state() : {};
        const matxa = (prefix === 'sftv' && tvNormalizePrefs(loadPrefsRaw()).duo)
            ? TV_DUO.presenter
            : (typeof bridge.getNeuralVoiceId === 'function' && bridge.getNeuralVoiceId());
        const effects = typeof bridge.getNeuralEffects === 'function' ? bridge.getNeuralEffects() : null;
        const prefs = api.normalize((loadPrefsRaw() || {}).radioBackground);
        const active = api.canPlay({ matxa, profile: effects && effects.profile,
            voiceOn: voice && voice.isOn(), engine: voice && voice.engine(), blocked: voice && voice.status() === 'blocked',
            open: state.open, paused: state.paused, hidden: state.hidden || document.visibilityState === 'hidden',
            visible: screenVisible(), error: state.error });
        if (!radioAmbience && active && prefs.sound !== 'off' && prefs.volume > 0) radioAmbience = api.createPlayer({ onChange: () => renderRadioStatus() });
        if (radioAmbience) {
            radioAmbience.update(Object.assign({}, prefs, { melody: gameMelody(api, state) }), active);
            if (radioAmbience.duck) radioAmbience.duck(!!(voice && voice.isSpeaking()));
            if (unlock && active) radioAmbience.unlock();
        }
        renderRadioStatus();
    }

    function renderRadioStatus() {
        const status = $id('sftv-radio-status');
        if (!status) return;
        const api = root.ElTaulerRadioAmbient;
        const st = radioAmbience ? radioAmbience.status() : 'off';
        const playing = radioAmbience && radioAmbience.playing ? radioAmbience.playing() : null;
        if (st === 'playing' && api) registerPlaying(api, playing);
        status.textContent = st === 'unavailable'
            ? 'La música de fons no està disponible en aquest navegador. La veu continua funcionant.'
            : (st === 'playing' && playing && api ? 'Ara sona: ' + api.melodyInfo(playing).name + ' (' + api.melodyInfo(playing).description + ').' : '');
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

    function neuralApi() { return root.ElTaulerVeuNeural || null; }
    function currentEffects() {
        const effects = typeof bridge.getNeuralEffects === 'function' ? bridge.getNeuralEffects() : null;
        const V = neuralApi();
        return V ? V.normalizeEffects(effects) : Object.assign({ profile: 'radio', intensity: 0.6, clarity: 0.5, volume: 1, eq: {} }, effects || {});
    }

    function renderMatxaControls() {
        const panel = $id('sftv-matxa-controls');
        if (!panel) return;
        const selected = (prefix === 'sftv' && tvNormalizePrefs(loadPrefsRaw()).duo)
            ? TV_DUO.presenter
            : (typeof bridge.getNeuralVoiceId === 'function' && bridge.getNeuralVoiceId());
        panel.hidden = !selected;
        if (!selected) { renderRadioControls(false, null); return; }
        const settings = currentEffects();
        // Ràdio és l'únic perfil de so de Matxa.
        renderRadioControls(true, 'radio');
        settings.rate = typeof bridge.getNeuralRate === 'function' ? bridge.getNeuralRate() : 1;
        ['intensity', 'clarity', 'volume', 'rate'].forEach(key => {
            const control = $id('sftv-matxa-' + key);
            const value = $id('sftv-matxa-' + key + '-value');
            const percent = Math.round(settings[key] * 100);
            if (control) { control.value = percent; control.disabled = false; }
            if (value) value.textContent = percent + '%';
        });
        const V = neuralApi();
        const eq = $id('sftv-matxa-eq');
        if (eq && V) {
            if (typeof V.layoutEq === 'function') V.layoutEq(eq);
            V.EQ_BANDS.forEach(band => {
                const gain = settings.eq ? settings.eq[band.id] || 0 : 0;
                const control = $id('sftv-matxa-eq-' + band.id);
                const value = $id('sftv-matxa-eq-' + band.id + '-value');
                const text = V.formatDb(gain);
                if (control) { control.value = gain; control.setAttribute('aria-valuetext', text); }
                if (value) value.textContent = text;
            });
        }
        const help = $id('sftv-matxa-help');
        if (help) help.textContent = 'Perfil Ràdio: veu present i volum uniforme. Els canvis es desen al teu perfil i s’escolten a partir del comentari següent.';
    }

    function changeMatxaControl(key, value) {
        if (typeof bridge.updateNeuralSettings !== 'function') return;
        let changes;
        if (key === 'rate') changes = { rate: Number(value) / 100 };
        else if (key === 'eq') {
            // value: { band, gain } o null per tornar l'equalitzador a pla.
            const eq = Object.assign({}, currentEffects().eq);
            if (value && value.band) eq[value.band] = Number(value.gain);
            else Object.keys(eq).forEach(band => { eq[band] = 0; });
            changes = { effects: { eq } };
        } else changes = { effects: { [key]: Number(value) / 100 } };
        bridge.updateNeuralSettings(changes);
        renderMatxaControls();
        syncRadioAmbience(true);
    }

    function renderVoice() {
        voice = options.getVoice();
        renderMatxaControls();
        syncRadioAmbience();
        if (!voice) return;
        const status = voice.status();
        const activate = $id('sftv-voice-activate');
        const toggle = $id('sftv-voice-toggle');
        const note = $id('sftv-voice-note');
        const on = voice.isOn();
        const duoToggle = $id('sftv-duo');
        if (duoToggle) {
            duoToggle.checked = tvNormalizePrefs(loadPrefsRaw()).duo;
            duoToggle.disabled = !root.ElTaulerVeuNeural;
        }
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
            else if (on && voice.neuralUnavailable() && typeof voice.holdsForNeural === 'function' && voice.holdsForNeural()) text = 'La veu neuronal Matxa no respon ara mateix: la partida s’atura fins que torni.';
            else if (on && voice.neuralUnavailable() && voice.engine() === 'system') text = 'La veu neuronal Matxa no respon ara mateix: es llegeix amb la veu del dispositiu.';
            else if (on && root.ElTaulerMusicaFons && !root.ElTaulerMusicaFons.voiceEnabled()) text = 'La veu està silenciada a Configuració › Veus de lectura: els comentaris continuen en silenci.';
            else if (on && voice.engine()) {
                const duo = prefix === 'sftv' && tvNormalizePrefs(loadPrefsRaw()).duo &&
                    voice.engine() === 'neural';
                text = 'Veu: ' + voice.voiceName() + (voice.engine() === 'neural'
                    ? (duo ? ' · L’Èlia pregunta i en Grau explica les jugades. En línia (BSC).' : ' · en línia (BSC). Es canvia a Configuració › Veus de lectura.')
                    : ' · del dispositiu.');
            }
            note.textContent = text;
            note.style.display = text ? '' : 'none';
        }
    }

        return {
            render: renderVoice, sync: syncRadioAmbience, renderMatxa: renderMatxaControls,
            changeMatxa: changeMatxaControl, changeRadio: changeRadioControl,
            player: () => radioAmbience,
            dispose() { if (radioAmbience) radioAmbience.dispose(); radioAmbience = null; melody = null; },
            bind() {
                const on = (id, event, fn) => { const el = $id(id); if (el) el.addEventListener(event, fn); };
                ['intensity', 'clarity', 'volume', 'rate'].forEach(key => {
                    on('sftv-matxa-' + key, 'input', ev => changeMatxaControl(key, ev.target.value));
                });
                const V = neuralApi();
                (V ? V.EQ_BANDS : []).forEach(band => {
                    on('sftv-matxa-eq-' + band.id, 'input', ev => changeMatxaControl('eq', { band: band.id, gain: ev.target.value }));
                });
                on('sftv-matxa-eq-reset', 'click', () => changeMatxaControl('eq', null));
                on('sftv-radio-sound', 'change', ev => changeRadioControl('sound', ev.target.value));
                on('sftv-radio-volume', 'input', ev => changeRadioControl('volume', ev.target.value));
                const toggle = activate => {
                    voice = options.getVoice();
                    if (!voice) return;
                    if (options.beforeVoice) options.beforeVoice();
                    voice.setOn(activate || !voice.isOn() || voice.status() === 'blocked');
                    renderVoice(); syncRadioAmbience(true);
                };
                on('sftv-voice-activate', 'click', () => toggle(true));
                on('sftv-voice-toggle', 'click', () => toggle(false));
            }
        };
    }
    let sharedTvAudio = null;
    function tvAudioControls() {
        if (!sharedTvAudio) sharedTvAudio = createBroadcastAudioControls({ prefix: 'sftv', bridge,
            getVoice: () => voice, getState: () => controller ? controller.state() : {},
            visible: screenVisible, loadPrefs: loadPrefsRaw, savePrefs: savePrefsRaw });
        return sharedTvAudio;
    }
    function syncRadioAmbience(unlock = false) { const audio = tvAudioControls(); audio.sync(unlock); radioAmbience = audio.player(); }
    function renderMatxaControls() { tvAudioControls().renderMatxa(); }
    function changeMatxaControl(key, value) { tvAudioControls().changeMatxa(key, value); radioAmbience = tvAudioControls().player(); }
    function changeRadioControl(key, value) { tvAudioControls().changeRadio(key, value); radioAmbience = tvAudioControls().player(); }
    function renderVoice() { tvAudioControls().render(); radioAmbience = tvAudioControls().player(); }

    function renderLevel(state) {
        const caps = state.caps;
        const g = state.game;
        const levelText = g ? g.level.label.short : '—';
        const mate = g && g.matchPlan && g.matchPlan.untilMate ? g.matchPlan : null;
        const nextMate = !state.legends && state.lozzaReady && state.untilMate;
        // Lliga de llegendes: cada bàndol és un jugador amb el seu motor, nivell i
        // perfil. El motor i el nivell són interns: la pantalla no els mostra.
        const legends = g && g.matchPlan && g.matchPlan.legends ? g.matchPlan : null;
        const mine = (color) => !!(state.control && state.control.color === color);
        // Fora de la lliga. Amb nivells desiguals, el de cada bàndol es veu en acabar.
        const sideText = (color) => mate ? 'profunditat màxima ' + mate.depth
            : g && g.matchPlan
            ? (g.engines[color] === 'lozza' ? 'profunditat ' + g.matchPlan.lozzaDepth
                : tvLevelLabel(caps, g.matchPlan.stockfishLevel).short)
            : g && g.end && g.level.sides ? tvLevelLabel(caps, g.level.sides[color]).short : levelText;
        const who = (color) => legends ? legends.names[color] : g && g.engines && g.engines[color] === 'lozza' ? 'Lozza' : 'Stockfish 19';
        // Separa visualment el nom de l'enginy (gran) de color i nivell (petits).
        // La versió del motor es conserva en canviar els colors de cada duel.
        const showPlayer = (color, suffix) => {
            const name = $id('sftv-name-' + suffix);
            const side = $id('sftv-color-' + suffix);
            const meta = $id('sftv-meta-' + suffix);
            const box = $id('sftv-player-' + suffix);
            const playerName = mine(color) ? 'Tu' : who(color);
            if (name) name.textContent = playerName;
            if (side) side.textContent = color === 'w' ? '♔ Blanques' : '♚ Negres';
            // Lliga de llegendes: lloc i punts a la classificació abans del motor.
            const row = legends && state.legends ? state.legends.table.find(r => r.id === legends.ids[color]) : null;
            // Abans de la primera partida de la lliga, l'ordre és alfabètic: no es diu cap lloc.
            const LGm = root.ElTaulerLlegendes;
            const place = row && LGm && state.legends.progress.played > 0 ? LGm.placeOf(row, state.legends.table) : '';
            const standingText = row && LGm
                ? (place ? (/^és líder/.test(place) ? 'Líder' : /^comparteix/.test(place) ? 'Primer lloc compartit' : 'Lloc ' + row.rank) + ' · ' : '')
                    + LGm.points(row.points) + ' · ' : '';
            // Lliga: el motor i el nivell de cada jugador són interns; la fitxa
            // només diu la classificació i què li passa a la partida.
            const legendText = legends ? [standingText.replace(/ · $/, ''), mine(color) ? 'Control manual' : '',
                g && g.attack && g.attack[color] && !g.end ? 'Fase d\'atac' : '',
                g && g.slumped && g.slumped.color === color && !g.end ? 'Menys precisió' : ''].filter(Boolean).join(' · ') : '';
            if (meta) meta.textContent = !g ? 'Preparant els motors…'
                : legends ? legendText
                : mine(color) ? 'Control manual · ' + sideText(color)
                : standingText + (g.engines && g.engines[color] === 'lozza' ? 'Motor Lozza · ' : 'Motor Stockfish · ') + sideText(color);
            if (box) box.setAttribute('aria-label',
                (color === 'w' ? 'Blanques: ' : 'Negres: ') + playerName
                + (g ? (legends ? (legendText ? ', ' + legendText : '') : ', ' + (mine(color) ? 'control manual' : sideText(color))) : '')
                + (g && !g.end && g.turn === color ? ', li toca moure' : ''));
        };
        showPlayer('w', 'white');
        showPlayer('b', 'black');
        const pw = $id('sftv-player-white');
        const pb = $id('sftv-player-black');
        pw && pw.classList.toggle('is-turn', !!(g && !g.end && g.turn === 'w'));
        pb && pb.classList.toggle('is-turn', !!(g && !g.end && g.turn === 'b'));
        pw && pw.classList.toggle('is-user', mine('w'));
        pb && pb.classList.toggle('is-user', mine('b'));
        const cur = $id('sftv-level-current');
        const next = $id('sftv-level-next');
        const help = $id('sftv-level-help');
        const easy = $id('sftv-too-easy');
        const hard = $id('sftv-too-hard');
        if (cur) cur.textContent = mate
            ? 'Fins al mat · fins a ' + mate.depth + ' semijugades i ' + mate.movetime + ' ms de cerca per a cada motor.'
            : legends ? 'Lliga de llegendes: cada jugador juga amb el seu estil.'
            : g ? (g.matchPlan ? 'Objectiu Stockfish: ' + g.level.label.long + '. Lozza juga amb profunditat limitada, sense Elo equiparable.'
                + (g.end && g.level.reveal ? ' ' + g.level.reveal : '')
                : 'Aquesta partida: ' + g.level.label.long + (caps && caps.mode !== 'none' && !g.level.sides ? ' (tots dos jugadors)' : '')
                    + (g.end && g.level.reveal ? '. ' + g.level.reveal : ''))
            : 'Preparant els motors…';
        const untilMate = $id('sftv-until-mate');
        if (untilMate) {
            untilMate.checked = state.untilMate;
            untilMate.disabled = !state.lozzaReady;
        }
        const unequal = $id('sftv-unequal');
        if (unequal) {
            unequal.checked = state.unequal !== false;
            unequal.disabled = !!nextMate;
        }
        const profiles = $id('sftv-profiles');
        if (profiles) {
            profiles.checked = state.profiles !== false;
            profiles.disabled = !!nextMate;
        }
        const stylesBox = $id('sftv-styles');
        if (stylesBox && legends && root.ElTaulerLlegendes) {
            // Perfil de cada jugador: només l'estil (el motor i el nivell són interns).
            const LGm = root.ElTaulerLlegendes;
            const line = (color) => { const p = LGm.legend(legends.ids[color]); return p.short + ': ' + p.style + '.'; };
            stylesBox.textContent = 'Perfils: ' + line('w') + ' ' + line('b');
            stylesBox.style.display = '';
        } else if (stylesBox) {
            const st = g && g.styles;
            stylesBox.textContent = st ? (g.matchPlan
                ? 'Stockfish: ' + TV_STYLES[st[g.matchPlan.engines.w === 'stockfish' ? 'w' : 'b']].label
                    + '. Lozza: estil propi del motor, sense modificacions artificials.'
                : 'Perfils: ' + tvStylesLine(st) + '. ' + TV_STYLES[st.w].label + ' ' + TV_STYLES[st.w].text + '; ' + TV_STYLES[st.b].label.charAt(0).toLowerCase() + TV_STYLES[st.b].label.slice(1) + ' ' + TV_STYLES[st.b].text + '.') : '';
            stylesBox.style.display = st ? '' : 'none';
        }
        if (next) {
            const modeChanged = g && !!mate !== !!nextMate;
            const levelChanged = !nextMate && caps && caps.mode !== 'none' && g && state.nextLevel !== null && state.nextLevel !== g.level.value;
            const nextText = $id('sftv-level-next-text');
            if (nextText) nextText.textContent = modeChanged ? (nextMate ? 'Partida següent en mode Fins al mat.' : 'Partida següent en mode habitual.')
                : levelChanged ? 'Partida següent: ' + tvLevelLabel(caps, state.nextLevel).long + '.' : '';
            next.style.display = modeChanged || levelChanged ? '' : 'none';
        }
        renderLadder(state, nextMate);
        const rivalry = $id('sftv-rivalry');
        if (rivalry && state.legends) {
            const pg = state.legends.progress;
            rivalry.textContent = 'Lliga ' + state.legends.season + ': ' + pg.played + ' de ' + pg.total + ' partides jugades.'
                + (g && g.leagueNote ? ' ' + g.leagueNote : '');
            rivalry.style.display = '';
        } else if (rivalry) {
            const recent = state.recentResults || [];
            const wins = { stockfish: 0, lozza: 0, draw: 0 };
            recent.forEach(x => { if (Object.prototype.hasOwnProperty.call(wins, x.winner)) wins[x.winner]++; });
            const mats = recent.filter(result => result.reason === 'checkmate').length;
            rivalry.textContent = 'Últimes ' + recent.length + ' partides: Stockfish ' + wins.stockfish
                + ' · Lozza ' + wins.lozza + ' · Taules ' + wins.draw + '.'
                + (mate && recent.length ? ' Mats: ' + mats + ' de ' + recent.length + '.' : '')
                + (g && g.matchPlan ? ' ' + g.matchPlan.reason : '');
            rivalry.style.display = state.duelWarning ? 'none' : '';
        }
        if (help) {
            let text = '';
            if (caps && caps.mode === 'elo') text = 'És un objectiu de força configurat al motor (UCI_Elo ' + caps.min + '–' + caps.max + '). Stockfish el calibra amb l\'Elo CCRL de partides ràpides entre motors: no és una equivalència garantida amb l\'Elo FIDE.';
            else if (caps) text = tvCompatibilityNote(caps) || '';
            help.textContent = state.legends || nextMate ? '' : text;
        }
        const adjustable = !nextMate && !!(caps && caps.mode !== 'none');
        if (easy) easy.disabled = !adjustable || state.nextLevel === null || state.nextLevel >= caps.max;
        if (hard) hard.disabled = !adjustable || state.nextLevel === null || state.nextLevel <= caps.min;
        const viewerNote = $id('sftv-viewer-note');
        if (viewerNote) {
            const v = state.viewer;
            let t = '';
            if (!v.known) t = 'Encara no tenim el teu nivell: comencem pel mínim de la TV, amb explicacions senzilles i ritme pausat.';
            else if (v.belowEngineMin) t = 'El motor no juga més fluix que aquest mínim: per això els comentaris són més senzills i el ritme més pausat.';
            viewerNote.textContent = t;
            viewerNote.style.display = t && !nextMate && !state.legends ? '' : 'none';
        }
        if (state.legends) {
            // Lliga de llegendes: el nivell, el mode «fins al mat» i els perfils
            // aleatoris no s'hi apliquen (cada jugador té el seu). Es fixa a la configuració del jugador.
            ['sftv-ladder', 'sftv-level-next'].forEach((id) => { const e = $id(id); if (e) e.style.display = 'none'; });
            ['sftv-too-easy', 'sftv-until-mate', 'sftv-unequal', 'sftv-profiles'].forEach((id) => {
                const e = $id(id);
                const holder = e && e.closest ? e.closest('.sftv-unequal-row, .sftv-level-actions') : null;
                if (holder) holder.style.display = 'none';
            });
            // El motor de cada jugador és intern: no es mostra quin motor fa servir la TV.
            const engineRow = typeof document !== 'undefined' && document.querySelector ? document.querySelector('#sftv-screen .sftv-engine-row') : null;
            if (engineRow) engineRow.style.display = 'none';
            const engineStatus = $id('sftv-engine-status');
            if (engineStatus) engineStatus.style.display = 'none';
        }
    }

    // Classificació de la lliga de llegendes: la fila dels jugadors de la
    // partida actual queda destacada; els perfils es pinten una sola vegada.
    let legendsProfilesBuilt = false;
    function renderLegends(state) {
        const panel = $id('sftv-legends');
        if (!panel) return;
        const lg = state.legends, LGm = root.ElTaulerLlegendes;
        panel.hidden = !lg || !LGm;
        if (!lg || !LGm) return;
        const text = (id, value) => { const e = $id(id); if (e) e.textContent = value; };
        const g = state.game;
        const plan = g && g.matchPlan && g.matchPlan.legends ? g.matchPlan : null;
        const pg = lg.progress;
        // En acabar l'última partida de la lliga, es mostra la classificació final.
        const finalView = !!(g && g.end && g.finalTable);
        const rows = finalView ? g.finalTable : lg.table;
        text('sftv-legends-round', finalView ? 'Lliga ' + g.finalSeason + ' · classificació final' : 'Lliga ' + lg.season + ' · jornada ' + pg.round + ' de ' + pg.rounds);
        // La barra parla de la partida que es veu: la seva jornada i, si encara es juga, quin partit és.
        const roundShown = plan ? plan.round : pg.round;
        const inRound = plan && !(g && g.end) && plan.round === pg.round ? ' · partit ' + (pg.roundPlayed + 1) + ' de ' + pg.roundTotal : '';
        text('sftv-legends-now', plan ? plan.names.w + ' (blanques) contra ' + plan.names.b + ' (negres)' : 'Preparant la partida…');
        const bar = $id('sftv-matchbar');
        if (bar) {
            bar.hidden = !plan;
            text('sftv-matchbar-league', finalView ? 'Lliga de llegendes · lliga ' + g.finalSeason + ' acabada' : 'Lliga de llegendes · lliga ' + lg.season);
            text('sftv-matchbar-round', finalView ? 'Classificació final' : 'Jornada ' + roundShown + ' de ' + pg.rounds + inRound);
        }
        const progressBar = $id('sftv-legends-progress');
        if (progressBar) { progressBar.max = pg.total; progressBar.value = finalView ? pg.total : pg.played; }
        text('sftv-legends-progress-text', finalView ? pg.total + ' de ' + pg.total + ' partides jugades · comença una lliga nova'
            : pg.played + ' de ' + pg.total + ' partides jugades · cada parella es troba dues vegades');
        const body = $id('sftv-legends-body');
        if (body) {
            body.textContent = '';
            rows.forEach((row) => {
                const tr = document.createElement('tr');
                if (plan && plan.ids.w === row.id) tr.className = 'is-white';
                else if (plan && plan.ids.b === row.id) tr.className = 'is-black';
                if (row.rank === 1 && row.points > 0) tr.classList.add('is-leader');
                const cell = (value, cls) => { const td = document.createElement('td'); td.textContent = value; if (cls) td.className = cls; tr.appendChild(td); return td; };
                cell(String(row.rank), 'sftv-legends-pos');
                cell(row.short, 'sftv-legends-name');
                cell(String(row.played));
                cell(row.wins + '-' + row.draws + '-' + row.losses);
                cell(String(row.points).replace('.', ','), 'sftv-legends-pts');
                body.appendChild(tr);
            });
        }
        const prev = lg.lastSeason && LGm.legend(lg.lastSeason.champion);
        text('sftv-legends-note', prev ? 'Lliga ' + lg.lastSeason.season + ': campió ' + prev.short + ' amb ' + LGm.points(lg.lastSeason.points) + '.' : '');
        if (!legendsProfilesBuilt) {
            const list = $id('sftv-legends-profiles');
            if (list) {
                legendsProfilesBuilt = true;
                LGm.roster().forEach((p) => {
                    const li = document.createElement('li');
                    const strong = document.createElement('strong');
                    strong.textContent = p.name + ' (' + p.born + (p.died ? '–' + p.died : '') + '). ';
                    li.appendChild(strong);
                    li.appendChild(document.createTextNode(p.bio + ' Estil: ' + p.style + '.'));
                    list.appendChild(li);
                });
            }
        }
    }

    let ladderSignature = null;
    function renderLadder(state, untilMate) {
        const caps = state.caps;
        const ladder = $id('sftv-ladder');
        const range = $id('sftv-level-range');
        const scaleBox = $id('sftv-ladder-scale');
        const value = $id('sftv-ladder-value');
        if (!ladder || !range || !scaleBox) return;
        const scale = untilMate ? [] : tvLevelScale(caps);
        ladder.style.display = scale.length ? '' : 'none';
        if (!scale.length) return;
        const sig = tvCapsSignature(caps);
        if (sig !== ladderSignature) {
            ladderSignature = sig;
            range.min = String(caps.min);
            range.max = String(caps.max);
            range.step = caps.mode === 'elo' ? '10' : '1';
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
        const shown = tvSnapLevel(caps, Number(range.value));
        range.setAttribute('aria-valuetext', tvLevelLabel(caps, shown).long);
        if (value) value.textContent = 'Següent: ' + tvLevelLabel(caps, shown).short;
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
            const label = g.opening.fromPosition ? 'Posició inicial' : 'Obertura de partida';
            parts.push('<span class="sftv-opening-kicker">' + label + '</span> <strong>' + escapeHtml(g.opening.name) + '</strong>'
                + (g.opening.eco ? ' <span class="sftv-eco">' + escapeHtml(g.opening.eco) + '</span>' : '')
                + (g.opening.fromPosition ? '' : '<span class="sftv-opening-sub">Jugades preparades del repertori: ' +
                    playedPrepared + ' de ' + g.opening.plies + '</span>'));
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
        else if (g.end) text = tvResultHeadline(g.end, g.names) + (state.control ? ' · control manual' : '');
        else if (state.control) {
            const ctl = state.control;
            if (ctl.yourTurn) text = 'Et toca: mous ' + COLOR[ctl.color].pl;
            else if (ctl.analyzing) text = 'Analitzant la teva jugada…';
            else text = 'Stockfish pensa la resposta amb ' + COLOR[other(ctl.color)].pl + '…';
        } else {
            const last = g.lastMove;
            // A la lliga, qui mou és el jugador (el motor que hi ha darrere és intern).
            const mover = g.matchPlan && g.matchPlan.legends && g.names ? g.names[g.turn] : null;
            text = (mover ? 'Juga ' + mover + ' · ' + (g.turn === 'w' ? 'blanques' : 'negres')
                : g.turn === 'w' ? 'Mouen les blanques' : 'Mouen les negres')
                + (last && last.prepared ? ' · jugada preparada de l\'obertura' : '');
        }
        if (state.duelWarning && !state.legends) text += ' · Lozza no disponible: s\'utilitza temporalment Stockfish als dos bàndols.';
        if (state.voiceHold && g && !g.end) text += ' · Esperant la veu Matxa';
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
            // A la lliga, els motors són interns: no hi ha nota tècnica.
            if (caps && !state.legends) {
                const range = caps.mode === 'elo'
                    ? 'UCI_Elo ' + caps.engineEloMin + '–' + caps.engineEloMax + ' i UCI_LimitStrength (mínim de la TV: ' + caps.min + ')'
                    : (caps.mode === 'skill' ? 'Skill Level ' + caps.min + '–' + caps.max + '; sense ' + caps.missing.join(' ni ') : 'cap opció de força');
                note = 'Analista: ' + (caps.engineName || 'Stockfish') + ' · opcions declarades: ' + range + '.'
                    + (state.duelWarning ? ' Lozza no disponible en aquest dispositiu.'
                        : ' Rival: Lozza 3.0, motor UCI de Colin Jenkins. La profunditat de Lozza no es pot equiparar amb Elo.');
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

    // Matxa no respon: la partida queda aturada i es diu quan es torna a provar.
    function renderVoiceHold(state) {
        const el = $id('sftv-voice-hold');
        if (voiceHoldTimer) { clearInterval(voiceHoldTimer); voiceHoldTimer = null; }
        if (!el) return;
        const hold = state.voiceHold;
        if (!hold) { el.hidden = true; el.textContent = ''; return; }
        const paint = () => {
            const left = Math.max(0, Math.ceil((hold.nextTryAt - Date.now()) / 1000));
            const next = hold.trying ? 'Provant de tornar a connectar amb Matxa…'
                : 'Nou intent d’aquí a ' + left + ' s' + (hold.attempts ? ' (intents fets: ' + hold.attempts + ')' : '') + '.';
            el.innerHTML = '<strong>La veu Matxa no respon: partida aturada fins que torni.</strong>'
                + escapeHtml(next) + ' Apaga la veu per continuar sense comentaris.';
        };
        paint();
        el.hidden = false;
        if (!hold.trying) voiceHoldTimer = setInterval(paint, 500);
    }

    function renderResult(state) {
        const el = $id('sftv-result');
        const g = state.game;
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (!el) return;
        if (!g || !g.end) { el.style.display = 'none'; return; }
        const paint = () => {
            const left = g.nextGameAt && !state.paused ? Math.max(0, Math.ceil((g.nextGameAt - Date.now()) / 1000)) : null;
            const inLeague = !!(g.matchPlan && g.matchPlan.legends);
            el.innerHTML = '<div class="sftv-result-head">' + escapeHtml(tvResultHeadline(g.end, g.names)) + '</div>'
                + '<div class="sftv-result-text">' + escapeHtml(g.end.text) + '</div>'
                + (g.level && g.level.reveal ? '<div class="sftv-result-reveal">' + escapeHtml(g.level.reveal) + '</div>' : '')
                + (inLeague && g.leagueNote ? '<div class="sftv-result-reveal">' + escapeHtml(g.leagueNote) + '</div>' : '')
                + (inLeague && g.slumped && g.names ? '<div class="sftv-result-reveal">' + escapeHtml(g.names[g.slumped.color]
                    + ' va jugar amb menys precisió a partir de la jugada ' + (Math.floor(g.slumped.fromPly / 2) + 1) + '.') + '</div>' : '')
                + (g.matchPlan && !inLeague ? '<div class="sftv-result-reveal">' +
                    (g.matchPlan.untilMate ? '' : 'Adaptació de la rivalitat: ') + escapeHtml(g.matchPlan.reason) + '</div>' : '')
                + (g.pairScore ? '<div class="sftv-result-reveal">' + escapeHtml(g.pairScore) + '</div>' : '')
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
        el.textContent = '';
        el.classList.toggle('is-intro', !!(valid && c.kind === 'intro'));
        el.classList.toggle('is-result', !!(valid && c.kind === 'result'));
        if (valid) {
            // Cada torn amb una etiqueta de qui parla (Èlia o Grau). Amb una sola
            // veu, el text sense etiquetes, com es llegeix.
            const duet = tvNormalizePrefs(loadPrefsRaw()).duo;
            const turn = (role, text) => {
                const line = document.createElement('div');
                const grau = role === 'analyst';
                line.className = 'sftv-turn ' + (duet ? (grau ? 'is-grau' : 'is-elia') : 'is-solo');
                if (duet) {
                    const who = document.createElement('span');
                    who.className = 'sftv-turn-who';
                    who.textContent = grau ? 'Grau' : 'Èlia';
                    line.appendChild(who);
                    line.appendChild(document.createTextNode(' '));
                }
                const body = document.createElement('span');
                body.className = 'sftv-turn-text';
                body.textContent = text;
                line.appendChild(body);
                el.appendChild(line);
            };
            if (Array.isArray(c.dialogue)) c.dialogue.forEach(t => turn(t.role, duet ? t.text : (t.solo || t.text)));
            else turn(c.kind === 'summary' ? 'analyst' : 'presenter', c.say || c.text);
        }
        // La línia de Stockfish que explica en Grau, en notació, sota el diàleg.
        if (valid && c.forecast && c.forecast.san) {
            const line = document.createElement('div');
            line.className = 'sftv-forecast';
            line.textContent = 'Variant analitzada: ' + c.forecast.san;
            line.title = 'La continuació que hem analitzat. La partida pot seguir un altre camí.';
            el.appendChild(line);
        }
        if (valid && c.maxim && c.maxim.text) {
            const line = document.createElement('div');
            line.className = 'sftv-art-maxim';
            line.textContent = (c.maxim.bookLabel || 'L’Art de la Guerra') + ' · ' +
                (c.maxim.inDialogue ? c.maxim.label : c.maxim.text);
            line.title = c.maxim.book === 'estratagemes'
                ? 'Frase original inspirada en «Les 36 estratagemes» (estratagema ' + c.maxim.number + ': «' + c.maxim.title + '»), no una citació'
                : 'Màxima original inspirada en la filosofia de Sunzi, no una citació històrica';
            el.appendChild(line);
        }
        el.classList.toggle('is-empty', !valid);
        // Llista de temes que S'HAN comentat en aquesta partida. No
        // pressuposa que encara siguin un avantatge o un pla actiu.
        const trail = $id('sftv-storyline');
        if (trail) {
            const story = g && g.story;
            const topics = story && Array.isArray(story.threads) ? story.threads : [];
            const recent = topics.filter(t => t && t.ply >= g.moves.length - 20)
                .slice(-3).map(t => {
                    const group = { center: 'centre', file: 'columna ' + t.loc,
                        passed: 'peó passat (' + t.loc + ')', pressure: 'pressió a ' + t.loc,
                        king: 'seguretat del rei', majority: 'majoria de peons' };
                    return group[t.group] || null;
                }).filter(Boolean);
            trail.textContent = recent.length ? 'Fils comentats: ' + Array.from(new Set(recent)).join(' · ') : '';
            trail.style.display = recent.length ? '' : 'none';
        }
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
            renderLegends(state);
            if (root.ElTaulerTvLeagueUI && typeof root.ElTaulerTvLeagueUI.update === 'function') {
                try { root.ElTaulerTvLeagueUI.update(state); } catch (err) {}
            }
            renderMoves(g);
            renderOpening(g);
            renderStatus(state);
            renderEngineChoice(state);
            renderVoiceHold(state);
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
            if (cinema) resizeBoard();
        }
    };

    function onVisibility() {
        if (!controller) return;
        controller.setHidden(document.visibilityState === 'hidden' || !screenVisible());
        if (radioAmbience) syncRadioAmbience(document.visibilityState !== 'hidden');
    }

    // Sense selector ni motor antic de reserva: aquest worker és sempre Stockfish 19.
    function createStockfishTvEngine() {
        return createTvEngine({
            createWorker: () => new Worker(tvEngineWorkerUrl('sf19', root.APP_VERSION))
        });
    }

    function renderEngineChoice(state) {
        const status = $id('sftv-engine-status');
        if (!status) return;
        status.textContent = state && state.error === 'engine'
            ? 'Stockfish 19 no es pot carregar en aquest dispositiu. No es canvia al motor antic.'
            : 'Stockfish 19 és l’únic motor Stockfish d’aquesta TV (NNUE, nivell Elo segons les opcions UCI).';
        if (state && state.caps === null && state.open && !state.error)
            status.textContent = 'Carregant Stockfish 19…';
    }

    function ensureController() {
        if (controller) return controller;
        if (typeof root.Chess !== 'function') return null;
        voice = createTvVoice({
            allowSystemVoice: false,
            speechSynthesis: root.speechSynthesis,
            SpeechSynthesisUtterance: root.SpeechSynthesisUtterance,
            neural: (root.ElTaulerVeuNeural && typeof root.Audio === 'function') ? root.ElTaulerVeuNeural.sharedSpeaker() : null,
            getDualEnabled: () => tvNormalizePrefs(loadPrefsRaw()).duo,
            getNeuralVoiceId: () => tvNormalizePrefs(loadPrefsRaw()).duo
                ? TV_DUO.presenter
                : (typeof bridge.getNeuralVoiceId === 'function' ? bridge.getNeuralVoiceId() : null),
            getNeuralRate: () => (typeof bridge.getNeuralRate === 'function' ? bridge.getNeuralRate() : 1),
            getNeuralEffects: () => (typeof bridge.getNeuralEffects === 'function' ? bridge.getNeuralEffects() : null),
            // Stockfish vs Lozza: si Matxa cau, la partida s'atura fins que torna.
            holdNeural: true,
            loadPref: () => tvNormalizePrefs(loadPrefsRaw()).voice,
            savePref: (v) => savePrefsRaw({ voice: v }),
            onChange: () => renderVoice()
        });
        // Mentre la veu parla, el so de fons baixa (com a la ràdio). Només
        // la locució més recent el torna a pujar: si una de nova talla
        // l'anterior, el final de l'anterior no l'ha d'apujar.
        const speakVoice = voice.speak;
        let duckSeq = 0;
        voice.speak = (text, opts) => {
            const id = ++duckSeq;
            if (radioAmbience) radioAmbience.duck(true);
            const done = () => { if (id === duckSeq && radioAmbience) radioAmbience.duck(false); };
            const result = speakVoice(text, opts);
            Promise.resolve(result).then(done, done);
            return result;
        };
        const engine = createStockfishTvEngine();
        const lozzaEngine = createTvEngine({
            createWorker: () => new Worker('lozza.js')
        });
        controller = createTvController({
            ChessCtor: root.Chess,
            engine: engine,
            lozzaEngine: lozzaEngine,
            expression: root.ElTaulerExpressivitat || null,
            narrative: root.ElTaulerNarrativa || null,
            quality: root.ElTaulerAuditoria || null,
            patterns: root.ElTaulerPatrons || null,
            // L'Art de la Guerra i les 36 estratagemes, alternats.
            art: tvBookshelf([getArtDeLaGuerra(), getEstratagemes()]),
            // La visió d'en Grau (si el fitxer no s'ha carregat, no hi ha plans).
            visio: getVisioGrau(),
            voice: voice,
            view: viewApi,
            getViewer: () => { try { return typeof bridge.getViewer === 'function' ? bridge.getViewer() : null; } catch (e) { return null; } },
            getOpenings: () => { try { return typeof bridge.getCuratedOpenings === 'function' ? bridge.getCuratedOpenings() : []; } catch (e) { return []; } },
            getOpeningGraph: () => { try { return typeof bridge.getOpeningGraph === 'function' ? bridge.getOpeningGraph() : null; } catch (e) { return null; } },
            legends: root.ElTaulerLlegendes || null,
            loadLeague: loadLeagueRaw,
            saveLeague: saveLeagueRaw,
            loadPrefs: loadPrefsRaw,
            savePrefs: (p) => savePrefsRaw({ speed: p.speed, offsets: p.offsets, openingIndex: p.openingIndex, unequal: p.unequal,
                profiles: p.profiles, recent: p.recent, untilMate: p.untilMate, mateSeries: p.mateSeries, mateRecent: p.mateRecent })
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
        exitCinema({ closing: true });
        if (controller) controller.close();
        if (sharedTvAudio) sharedTvAudio.dispose();
        radioAmbience = null;
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (voiceHoldTimer) { clearInterval(voiceHoldTimer); voiceHoldTimer = null; }
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
        on('sftv-cinema', 'click', enterCinema);
        on('sftv-cinema-exit', 'click', () => exitCinema());
        ['pointermove', 'pointerdown', 'focusin'].forEach(ev => on('sftv-screen', ev, cinemaWake));
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
        on('sftv-until-mate', 'change', ev => { if (controller) controller.setUntilMate(ev.target.checked); });
        on('sftv-unequal', 'change', (ev) => { if (controller) controller.setUnequal(ev.target.checked); });
        on('sftv-profiles', 'change', (ev) => { if (controller) controller.setProfiles(ev.target.checked); });
        on('sftv-level-range', 'input', (ev) => { if (controller) controller.setNextLevel(Number(ev.target.value)); });
        on('sftv-level-range', 'change', (ev) => { if (controller) controller.setNextLevel(Number(ev.target.value)); });
        on('sftv-ladder-scale', 'click', (ev) => {
            const tick = ev.target && ev.target.closest ? ev.target.closest('.sftv-tick') : null;
            if (tick && controller) controller.setNextLevel(Number(tick.getAttribute('data-level')));
        });
        on('sftv-level-apply', 'click', () => { if (controller) controller.newGame(); });
        on('sftv-too-hard', 'click', () => { if (controller) controller.adjust('easier'); });
        on('sftv-speed', 'change', (ev) => { if (controller) controller.setSpeed(ev.target.value); });
        on('sftv-duo', 'change', (ev) => {
            if (!controller) return;
            controller.setDuo(ev.target.checked);
            renderVoice();
        });
        on('sftv-radio-sound', 'change', ev => changeRadioControl('sound', ev.target.value));
        on('sftv-radio-volume', 'input', ev => changeRadioControl('volume', ev.target.value));
        on('sftv-radio-volume', 'change', ev => changeRadioControl('volume', ev.target.value));
        ['intensity', 'clarity', 'volume', 'rate'].forEach(key => {
            on('sftv-matxa-' + key, 'input', ev => changeMatxaControl(key, ev.target.value));
            on('sftv-matxa-' + key, 'change', ev => changeMatxaControl(key, ev.target.value));
        });
        const NeuralApi = root.ElTaulerVeuNeural;
        (NeuralApi ? NeuralApi.EQ_BANDS : []).forEach(band => {
            on('sftv-matxa-eq-' + band.id, 'input', ev => changeMatxaControl('eq', { band: band.id, gain: ev.target.value }));
        });
        on('sftv-matxa-eq-reset', 'click', () => changeMatxaControl('eq', null));
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
            if (ev.key === 'Escape' && cinema) {
                ev.preventDefault();
                ev.stopPropagation();
                exitCinema();
                return;
            }
            if (cinema) cinemaWake();
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
        tvEloSteps,
        tvSnapLevel,
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
        tvDecisiveSide,
        tvResignThresholdCp,
        tvResignStep,
        tvIsDecided,
        tvIsSharpOpening,
        TV_STYLES,
        tvStyleProfile,
        tvLegendSide,
        tvLegendPlan,
        tvLegendLevel,
        tvLegendStep,
        tvLateAttack,
        tvAgreedDrawStep,
        tvPlanSlump,
        tvSlumpSide,
        tvMoveContext,
        tvPositionKey,
        tvNameSides,
        tvNameComment,
        tvPickStyles,
        tvMoveFeatures,
        tvStyleScore,
        tvPickStyledMove,
        tvStylesLine,
        tvGameLevels,
        tvRecentResults,
        tvMatchPlan,
        tvGameLevelLabel,
        tvLevelReveal,
        tvSideLevel,
        tvResultHeadline,
        tvPickOpening,
        TV_MATE_SCENARIOS,
        tvPreparedLine,
        tvCommentCandidates,
        tvChooseComment,
        tvSelectComment,
        tvCommitComment,
        tvEmptyMemory,
        tvBroadcastStep,
        tvArtStep,
        tvStrategicSummary,
        tvEvalBand,
        tvSimulateCommentary,
        tvCommentaryStats,
        tvSpeechText,
        tvSpeechDirection,
        tvDialogueTurns,
        tvMoveQuestion,
        TV_DUO,
        tvIsCatalanVoice,
        tvPickCatalanVoice,
        tvPositionCommand,
        createTvVoice,
        createBroadcastAudioControls,
        tvBookshelf,
        TV_SUMMARY_INTROS,
        materialPhrase,
        materialClauses,
        TV_ENGINES,
        tvEngineId,
        tvEngineWorkerUrl,
        tvRivalryHistory,
        applyBroadcastHighlights,
        TV_CINEMA,
        tvCinemaLayout,
        createTvEngine,
        createTvController,
        // Navegador
        init,
        open,
        close: goHome,
        closeScreen,
        handleBack,
        isCinema() { return cinema; },
        isActive() { return !!(controller && controller.isActive() && screenVisible()); },
        _controller() { return controller; }
    };
});
