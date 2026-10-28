/* Saved-game broadcast: shared TV commentary/timing, isolated exploratory game. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./stockfishtv'));
    else root.ElTaulerHistoryTV = factory(root.ElTaulerStockfishTV);
})(typeof self !== 'undefined' ? self : this, function (TV) {
    'use strict';
    function createPlayer(d) {
        const C = TV.TV_CONFIG, now = d.now || Date.now, random = d.random || Math.random;
        const setT = d.setTimeout || setTimeout, clearT = d.clearTimeout || clearTimeout;
        let chess = null, original = [], startFen = null, index = 0, playerColor = 'w', roc = 1200;
        let running = false, busy = false, control = false, opened = false, epoch = 0, error = null;
        let preview = null, last = null, comment = null, memory = TV.tvEmptyMemory();
        let engine = null, caps = null, nextAt = 0, speech = null, ownsSpeech = false, originPly = 0;
        let speed = TV.tvNormalizePrefs(d.loadPrefs ? d.loadPrefs() : {}).speed;
        const timers = new Map(), pending = new Set(), cache = new Map();
        const voice = () => d.getVoice ? d.getVoice() : null;
        const alive = e => e === epoch && opened;
        const copy = () => {
            const out = new d.ChessCtor(startFen);
            chess.history().forEach(m => out.move(m, { sloppy: true }));
            return out;
        };
        const end = () => chess ? TV.tvGameEnd(chess, Number.MAX_SAFE_INTEGER) : null;
        function state() {
            return { open: opened, paused: !running, busy, control, playerColor, speed, error,
                index, total: original.length, fen: chess && chess.fen(), preview, last, comment,
                yourTurn: !!(control && running && !busy && chess && !end() && chess.turn() === playerColor),
                finished: !!(chess && (end() || (!control && index >= original.length))),
                canUndo: !!(chess && (control ? chess.history().length > originPly : index > 0)),
                variation: control ? chess.history().slice(originPly) : [] };
        }
        function render() { if (d.render) d.render(state(), chess); }
        function wait(ms, e) {
            if (!alive(e)) return Promise.resolve(false);
            return new Promise(resolve => {
                const id = setT(() => { timers.delete(id); resolve(alive(e)); }, Math.max(0, ms));
                timers.set(id, resolve);
            });
        }
        function guarded(job, e) {
            return new Promise(resolve => {
                const cancel = () => { pending.delete(cancel); resolve(null); };
                pending.add(cancel);
                Promise.resolve(job).then(value => { pending.delete(cancel); resolve(alive(e) ? value : null); }, cancel);
            });
        }
        function halt() {
            epoch++;
            timers.forEach((resolve, id) => { clearT(id); resolve(false); }); timers.clear();
            Array.from(pending).forEach(cancel => cancel());
            if (engine) engine.cancelAll();
            if (ownsSpeech && voice()) voice().stop();
            ownsSpeech = false; speech = null; preview = null; busy = false;
        }
        function pause() { halt(); running = false; render(); }
        function positionCommand(position) {
            const moves = position.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
            return 'position fen ' + startFen + (moves.length ? ' moves ' + moves.join(' ') : '');
        }
        async function ready(e) {
            if (!engine && d.createEngine) engine = d.createEngine();
            if (!engine) return null;
            if (!caps) {
                const found = await guarded(engine.ready(), e);
                if (!alive(e)) return null;
                caps = found;
            }
            return alive(e) ? caps : null;
        }
        async function analyze(position, e) {
            const command = positionCommand(position);
            if (cache.has(command)) return cache.get(command);
            if (!await ready(e)) return null;
            const result = await guarded(engine.request({ tag: { kind: 'history-analysis', fen: position.fen(), epoch: e },
                position: command, strength: TV.tvStrengthCommands(caps, 'analysis'), multipv: C.ANALYSIS_MULTIPV,
                go: 'go depth ' + C.ANALYSIS_MAX_DEPTH + ' movetime ' + C.ANALYSIS_MOVETIME_MS,
                movetime: C.ANALYSIS_MOVETIME_MS }), e);
            if (!result || !alive(e)) return null;
            const analysis = TV.tvBuildAnalysis(position.fen(), result.infos, result.bestUci);
            cache.set(command, analysis);
            if (cache.size > 120) cache.delete(cache.keys().next().value);
            return analysis;
        }
        async function engineMove(e) {
            if (!await ready(e)) return null;
            const viewer = TV.tvViewerProfile({ known: true, calibrated: true, roc }, caps);
            const level = TV.tvResolveTarget(caps, viewer, TV.tvNormalizePrefs({}));
            const ms = C.PLAYER_MOVETIME_MS[caps.mode] || 500;
            const result = await guarded(engine.request({ tag: { kind: 'history-variation', fen: chess.fen(), epoch: e },
                position: positionCommand(chess), strength: TV.tvStrengthCommands(caps, 'player', level.value),
                multipv: 1, go: 'go movetime ' + ms, movetime: ms }), e);
            return result && result.bestUci;
        }
        function tier() { return TV.tvViewerProfile({ calibrated: true, roc }, caps).tier; }
        function describe(beforePosition, afterPosition, move, before, after) {
            const prev = beforePosition.history({ verbose: true }).slice(-1)[0] || null;
            return TV.tvBroadcastStep({ ChessCtor: d.ChessCtor, fenBefore: beforePosition.fen(), fenAfter: afterPosition.fen(),
                move, prevMove: prev, before, after, tier: tier(), prepared: false,
                end: TV.tvGameEnd(afterPosition, Number.MAX_SAFE_INTEGER), ply: beforePosition.history().length, memory });
        }
        function announce(step, e) {
            memory = step.memory;
            comment = step.comment ? { text: step.comment.text, kind: step.comment.kind, fen: chess.fen() } : null;
            nextAt = now() + Math.max(TV.tvMoveDelayMs(speed, { tier: tier(), random: random() }),
                comment ? TV.tvReadingTimeMs(comment.text, tier()) : 0);
            render();
            const v = voice();
            if (comment && v && v.isOn()) {
                ownsSpeech = true;
                const text = TV.tvSpeechText(comment.text);
                speech = guarded(v.speak(text, { maxWaitMs: TV.tvSpeechMaxWaitMs(text) }), e).then(r => {
                    if (alive(e)) { ownsSpeech = false; render(); }
                    return r;
                });
                render();
            }
        }
        async function previousDone(e) {
            if (nextAt > now() && !await wait(nextAt - now(), e)) return false;
            if (speech) {
                const spoken = await speech;
                if (!alive(e)) return false;
                speech = null;
                if (spoken && spoken.spoken && !await wait(C.POST_SPEECH_PAUSE_MS, e)) return false;
            }
            return alive(e);
        }
        async function loop(e, once = false) {
            while (alive(e) && running) {
                if (end() || (!control && index >= original.length)) {
                    if (speech) await speech;
                    if (alive(e)) { running = false; busy = false; render(); }
                    return;
                }
                if (control && chess.turn() === playerColor) { busy = false; render(); return; }
                busy = true; render();
                const beforePosition = copy(), fenBefore = chess.fen();
                const before = await analyze(beforePosition, e);
                if (!alive(e)) return;
                const requested = control ? await engineMove(e) : original[index];
                if (!alive(e)) return;
                const afterPosition = copy();
                let move = null;
                try {
                    move = afterPosition.move(control && typeof requested === 'string'
                        ? { from: requested.slice(0, 2), to: requested.slice(2, 4), promotion: requested[4] || 'q' }
                        : requested, { sloppy: true });
                } catch (_) {}
                if (!move) { error = control ? 'Stockfish no ha pogut respondre. Pots reprendre la partida original.' : 'No es pot reproduir aquesta jugada.'; pause(); return; }
                const after = afterPosition.game_over() ? null : await analyze(afterPosition, e);
                if (!alive(e)) return;
                const step = describe(beforePosition, afterPosition, move, before, after);
                if (step.comment && voice() && voice().prefetch) voice().prefetch(TV.tvSpeechText(step.comment.text));
                if (!await previousDone(e) || chess.fen() !== fenBefore) return;
                preview = { from: move.from, piece: move.piece, color: move.color }; render();
                if (!await wait(C.MOVE_PREVIEW_MS, e) || chess.fen() !== fenBefore) return;
                preview = null;
                chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
                if (!control) index++;
                last = { from: move.from, to: move.to, piece: move.piece, color: move.color, byUser: false };
                busy = false;
                announce(step, e);
                if (once) {
                    if (speech) await speech;
                    if (alive(e)) { running = false; render(); }
                    return;
                }
            }
        }
        function launch(once = false) {
            const e = epoch;
            void loop(e, once).catch(() => {
                if (alive(e)) { error = 'La reproducció s’ha aturat. Pots tornar a prémer Reprodueix.'; pause(); }
            });
        }
        function seek(target) {
            halt(); running = false; control = false; error = null;
            const bounded = Math.max(0, Math.min(original.length, Math.floor(Number(target) || 0)));
            chess = new d.ChessCtor(startFen); index = 0;
            for (let i = 0; i < bounded; i++) { if (!chess.move(original[i], { sloppy: true })) break; index++; }
            const move = chess.history({ verbose: true }).slice(-1)[0];
            last = move ? { from: move.from, to: move.to, piece: move.piece, color: move.color } : null;
            memory = TV.tvEmptyMemory(); comment = null; nextAt = 0; render();
        }
        return {
            state, chess: () => chess, pause,
            load(spec) {
                halt(); if (engine) engine.destroy(); engine = null; caps = null; cache.clear();
                opened = true; original = (spec.moves || []).slice(); startFen = spec.startFen || new d.ChessCtor().fen();
                playerColor = spec.playerColor === 'b' ? 'b' : 'w'; roc = Number(spec.roc) || 1200;
                seek(0);
            },
            play() {
                if (!opened || !chess || running) return;
                halt(); error = null; running = true; nextAt = now() + C.RESUME_DELAY_MS;
                if (voice() && voice().unlock) voice().unlock();
                render(); launch();
            },
            step() {
                if (!opened || !chess || running || (control && chess.turn() === playerColor)) return;
                halt(); running = true; error = null; nextAt = 0; render(); launch(true);
            },
            seek,
            back() {
                if (!chess) return;
                if (!control) { seek(index - 1); return; }
                halt(); running = true; error = null;
                if (chess.history().length > originPly) chess.undo();
                while (chess.history().length > originPly && chess.turn() !== playerColor) chess.undo();
                const m = chess.history({ verbose: true }).slice(-1)[0];
                last = m ? { from: m.from, to: m.to, piece: m.piece, color: m.color } : null;
                memory = TV.tvEmptyMemory(); comment = null; nextAt = 0; render(); launch();
            },
            takeControl() {
                if (!opened || !chess || control || end()) return false;
                halt(); control = true; running = true; error = null; originPly = chess.history().length;
                comment = null; nextAt = now() + C.CONTROL_REPLY_DELAY_MS; render(); launch(); return true;
            },
            releaseControl() { if (!control) return; seek(index); this.play(); },
            userMoves(square) { return state().yourTurn ? chess.moves({ square, verbose: true }) : []; },
            userMove(from, to, promotion = 'q') {
                if (!state().yourTurn) return false;
                const beforePosition = copy();
                const move = chess.move({ from, to, promotion });
                if (!move) return false;
                halt(); running = true; busy = true; comment = null;
                last = { from, to, piece: move.piece, color: move.color, byUser: true }; render();
                const e = epoch, afterPosition = copy();
                void (async () => {
                    const before = await analyze(beforePosition, e);
                    if (!alive(e)) return;
                    const after = afterPosition.game_over() ? null : await analyze(afterPosition, e);
                    if (!alive(e)) return;
                    busy = false; announce(describe(beforePosition, afterPosition, move, before, after), e);
                    nextAt = now() + Math.min(C.CONTROL_REPLY_MAX_MS, Math.max(C.CONTROL_REPLY_DELAY_MS,
                        comment ? TV.tvReadingTimeMs(comment.text, tier()) : 0));
                    launch();
                })().catch(() => { if (alive(e)) { error = 'No s’ha pogut continuar la variant.'; pause(); } });
                return true;
            },
            setSpeed(value) {
                if (!C.SPEEDS[value]) return;
                const resume = running;
                halt(); speed = value; running = false;
                if (d.savePrefs) d.savePrefs({ speed });
                render(); if (resume) this.play();
            },
            stopVoice() { if (ownsSpeech && voice()) voice().stop(); ownsSpeech = false; },
            close() {
                halt(); running = false; opened = false; cache.clear();
                if (engine) engine.destroy(); engine = null; caps = null; render();
            }
        };
    }
    return { createPlayer };
});
