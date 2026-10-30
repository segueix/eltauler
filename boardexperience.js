/* Presentació compartida dels taulers. Mai modifica la partida ni el rellotge. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ElTaulerBoardExperience = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    const placement = fen => typeof fen === 'string' ? fen.split(' ')[0] : null;
    // Només una jugada legal entre dues posicions completes. Un salt, una edició
    // o una proposta encara no confirmada no es poden anunciar com a jugada feta.
    function transition(Chess, before, after, last) {
        if (!before || !after || before === after) return null;
        try {
            const g = new Chess(before);
            const candidates = last ? [last] : g.moves({ verbose: true });
            for (const m of candidates) {
                const move = g.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
                if (!move) continue;
                const match = g.fen() === after;
                g.undo();
                if (match) return move;
            }
        } catch (_) {}
        return null;
    }
    let env = null, observing = false;
    const sessions = new Map();
    function configure(options) { env = options; }
    function visible(el) {
        if (!el || !el.isConnected || document.hidden) return false;
        for (let node = el; node && node !== document; node = node.parentElement) {
            if (node.hidden || node.style.display === 'none') return false;
            if ((node.classList.contains('screen') || node.id.endsWith('-screen')) && root.getComputedStyle(node).display === 'none') return false;
        }
        return true;
    }
    function observeScreens() {
        if (observing) return;
        observing = true;
        const check = () => sessions.forEach(s => { if (!visible(s.el)) s.stop(); else s.refresh(); });
        const observer = new MutationObserver(check);
        document.querySelectorAll('[id$="-screen"], #catalans-replay').forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }));
        document.addEventListener('visibilitychange', check);
        root.addEventListener('pagehide', () => stopAll());
    }
    function stopAll(except) { sessions.forEach((s, id) => { if (id !== except) s.stop(); }); }
    function createBoard(id, config, context) {
        if (!env) return root.Chessboard(id, config);
        if (sessions.has(id)) sessions.get(id).dispose();
        const el = document.getElementById(id), TV = root.ElTaulerStockfishTV, B = root.ElTaulerGameBroadcast;
        if (!el || !TV || !B) return root.Chessboard(id, config);
        const initial = context(config.position) || {};
        let board, lastFen = null, lastKey = null, last = null, preview = null, nextAt = 0;
        let dragSelection = null;
        let voice = null, audio = null, narrator = null, speech = null, disposed = false, suspended = false, token = 0;
        const waits = new Map();
        const prefix = id + '-audio', key = 'eltauler_board_broadcast_' + id;
        function prefs(changes) {
            let p = {};
            try { p = JSON.parse(localStorage.getItem(key)) || {}; } catch (_) {}
            if (!p.voice) {
                let old = null;
                try { if (id === 'myBoard') old = JSON.parse(localStorage.getItem('eltauler_narration_training')); } catch (_) {}
                p.voice = old && old.enabled ? 'on' : 'off';
            }
            p.speed = TV.tvNormalizePrefs(p).speed;
            if (changes) { p = Object.assign(p, changes); try { localStorage.setItem(key, JSON.stringify(p)); } catch (_) {} }
            return p;
        }
        let host = document.getElementById(id + '-broadcast');
        if (!host) {
            host = document.createElement('div'); host.id = id + '-broadcast';
            const wrap = el.closest('.board-container, .history-board') || el;
            wrap.insertAdjacentElement('afterend', host);
        }
        // La veu i la ràdio comparteixen la columna del tauler a escriptori,
        // sota la descripció del jeroglífic. A mòbil es conserva la ubicació
        // original després dels controls; es mou el MATEIX node, sense reiniciar-lo.
        function placeBroadcast() {
            if (id !== 'myBoard') return;
            const column = document.querySelector('#game-screen > .game-board-column');
            const home = document.getElementById('myBoard-broadcast-home');
            if (!column || !home) return;
            if (document.body.classList.contains('device-desktop')) {
                if (host.parentElement !== column) column.appendChild(host);
            } else if (host.previousElementSibling !== home) {
                home.insertAdjacentElement('afterend', host);
            }
        }
        const layoutObserver = id === 'myBoard' ? new MutationObserver(placeBroadcast) : null;
        if (layoutObserver) layoutObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        placeBroadcast();
        host.className = 'board-broadcast';
        host.innerHTML = '<details class="board-broadcast-audio"><summary>Veu i ràdio</summary><div class="board-broadcast-host"></div>'
            + '<label class="board-broadcast-frequency">Comentaris <select aria-label="Freqüència dels comentaris"><option value="all">Cada jugada</option><option value="key">Moments clau</option></select></label>'
            + '<p class="setting-help">Comenta jugades fetes. Pots apagar la veu en qualsevol moment.</p></details>'
            + '<label class="sftv-speed-label board-broadcast-speed" hidden>Ritme <select aria-label="Ritme de la demostració"></select></label>'
            + '<p class="board-broadcast-caption" aria-live="polite"></p>';
        const caption = host.querySelector('.board-broadcast-caption'), speedRow = host.querySelector('.board-broadcast-speed');
        const audioPanel = host.querySelector('.board-broadcast-audio');
        const speed = speedRow.querySelector('select'), frequency = host.querySelector('.board-broadcast-frequency select');
        Object.entries(TV.TV_CONFIG.SPEEDS).forEach(([value, p]) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = p.label; speed.appendChild(opt); });
        speed.value = prefs().speed; frequency.value = prefs().frequency === 'key' ? 'key' : 'all';
        speed.onchange = () => { prefs({ speed: speed.value }); nextAt = Date.now(); };
        frequency.onchange = () => prefs({ frequency: frequency.value });
        function current() { return context(board && board.fen ? board.fen() : config.position) || {}; }
        voice = TV.createTvVoice(Object.assign({}, env.bridge, {
            allowSystemVoice: false,
            speechSynthesis: root.speechSynthesis, SpeechSynthesisUtterance: root.SpeechSynthesisUtterance,
            neural: root.ElTaulerVeuNeural ? root.ElTaulerVeuNeural.sharedSpeaker() : null,
            loadPref: () => prefs().voice, savePref: voice => prefs({ voice }),
            onChange: () => { if (audio) audio.render(); }
        }));
        narrator = B.createNarrator(voice);
        audio = TV.createBroadcastAudioControls({ prefix, bridge: env.bridge, host: host.querySelector('.board-broadcast-host'),
            getVoice: () => voice, getState: () => { const c = current(); return { open: visible(el) && !disposed && !suspended && !c.disabled, paused: !!c.paused }; },
            loadPrefs: () => prefs(), savePrefs: prefs, visible: () => visible(el),
            beforeVoice: () => { suspended = false; stopAll(id); if (env.beforeVoice) env.beforeVoice(); }
        });
        audio.bind();
        function cancelPreview() {
            token++; preview = null;
            waits.forEach((resolve, timer) => { clearTimeout(timer); resolve(false); }); waits.clear(); paint();
        }
        function stop() { suspended = true; dragSelection = null; cancelPreview(); narrator.stop(); speech = null; nextAt = 0; audio.dispose(); }
        function paint() {
            if (disposed) return;
            const c = current();
            // Els colors de correcció/pista de l'exercici tenen prioritat.
            const feedback = el.querySelector('.highlight-played, .highlight-best, .move-correct, .move-incorrect, .move-good, .tut-ok, .tut-ko');
            if (!c.disabled && (last || preview)) el.querySelectorAll('.engine-move').forEach(sq => sq.classList.remove('engine-move'));
            const selected = el.querySelector('.tap-selected');
            const targets = dragSelection ? dragSelection.targets : Array.from(el.querySelectorAll('.tap-move')).map(s => s.getAttribute('data-square'));
            TV.applyBroadcastHighlights(el, { last: c.disabled || feedback ? null : last, preview,
                selected: dragSelection ? dragSelection.from : selected && selected.getAttribute('data-square'), targets });
        }
        function refresh() {
            if (disposed) return;
            placeBroadcast();
            const c = current(); host.hidden = !!c.disabled; speedRow.hidden = !c.pace || !!c.timed;
            // Partida amb rellotge: sense veu ni ràdio (els comentaris queden escrits).
            audioPanel.hidden = !!c.timed;
            audio.render(); paint();
        }
        function sync(target) {
            if (disposed) return;
            const c = context(target) || {}, g = c.chess;
            const fen = g && g.fen();
            if (c.pending && placement(target) !== placement(fen)) {
                last = null; caption.textContent = ''; narrator.stop(); speech = null; paint(); return;
            }
            if (!fen || c.disabled || placement(target) !== placement(fen)) {
                lastFen = null; lastKey = null; last = null; caption.textContent = ''; stop(); refresh(); return;
            }
            const history = g.history({ verbose: true }), previous = history[history.length - 1] || c.last || null;
            const move = lastKey === c.key ? transition(env.Chess, lastFen, fen, previous) : null;
            const before = lastFen;
            last = previous || move;
            if (lastFen !== fen || lastKey !== c.key) {
                cancelPreview(); narrator.stop(); speech = null; caption.textContent = '';
                last = previous || move; lastFen = fen; lastKey = c.key;
                if (move && !c.silent && visible(el)) {
                    suspended = false;
                    const comment = B.comment(env.Chess, TV, { chess: g, fenBefore: before, fenAfter: fen, move,
                        scope: c.mode === 'replay' ? 'history' : 'training', playerColor: c.playerColor || null, ply: history.length - 1,
                        patterns: root && root.ElTaulerPatrons });
                    if (comment) {
                        caption.textContent = comment.text;
                        nextAt = Date.now() + Math.max(TV.tvMoveDelayMs(prefs().speed, { tier: 'advanced', random: Math.random() }), TV.tvReadingTimeMs(comment.text, 'advanced'));
                        if (!c.timed && voice.isOn() && (prefs().frequency !== 'key' || comment.important)) {
                            stopAll(id); if (env.beforeVoice) env.beforeVoice();
                            speech = narrator.speak(comment.speech, { maxWaitMs: TV.tvSpeechMaxWaitMs(comment.speech) });
                            const activeSpeech = speech;
                            speech.then(() => { if (speech === activeSpeech && !disposed) audio.sync(); });
                        }
                    }
                }
            }
            refresh();
        }
        const onMoveEnd = config.onMoveEnd;
        board = root.Chessboard(id, Object.assign({}, config, {
            moveSpeed: config.moveSpeed || (id === 'myBoard' || initial.timed ? 150 : TV.TV_CONFIG.MOVE_ANIMATION_MS),
            onMoveEnd: (...args) => { if (onMoveEnd) onMoveEnd(...args); paint(); },
            onDragStart: function (...args) {
                const result = config.onDragStart && config.onDragStart.apply(this, args);
                const c = current();
                if (result !== false && !c.disabled && c.chess) {
                    dragSelection = { from: args[0], targets: c.chess.moves({ square: args[0], verbose: true }).map(m => m.to) };
                    paint();
                }
                return result;
            },
            onDrop: function (...args) {
                const result = config.onDrop && config.onDrop.apply(this, args);
                dragSelection = null; paint(); return result;
            }
        }));
        el.classList.add('broadcast-board');
        const position = board.position.bind(board), resize = board.resize.bind(board), destroy = board.destroy.bind(board);
        board.position = function (target, animate) {
            if (!arguments.length) return position();
            // chessboard.js implementa fen() com a position('fen'): és una lectura,
            // i sincronitzar-la tornaria a cridar fen() sense fi.
            if (typeof target === 'string' && target.toLowerCase() === 'fen') return position(target);
            const out = position(target, animate);
            sync(typeof target === 'string' && target !== 'start' ? target : board.fen());
            return out;
        };
        board.resize = (...args) => { const out = resize(...args); paint(); return out; };
        const observer = new MutationObserver(paint);
        observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        function dispose() { if (disposed) return; stop(); disposed = true; observer.disconnect(); if (layoutObserver) layoutObserver.disconnect(); host.textContent = ''; sessions.delete(id); }
        board.destroy = () => { dispose(); return destroy(); };
        function wait(ms, expected) {
            return new Promise(resolve => {
                const timer = setTimeout(() => { waits.delete(timer); resolve(!disposed && token === expected && visible(el)); }, Math.max(0, ms));
                waits.set(timer, resolve);
            });
        }
        async function anticipate(requested, valid) {
            const c = current();
            if (disposed || !c.pace || c.timed || !c.chess || !visible(el) || (valid && !valid())) return false;
            cancelPreview(); const expected = token, fen = c.chess.fen(), identity = c.key;
            const check = () => !disposed && token === expected && visible(el) && current().key === identity && current().chess.fen() === fen && (!valid || valid());
            const probe = new env.Chess(fen); let move;
            try { move = probe.move(requested, { sloppy: true }); } catch (_) {}
            if (!move) return false;
            if (speech) { const result = await speech; if (!check()) return false; if (result && result.spoken && !await wait(TV.TV_CONFIG.POST_SPEECH_PAUSE_MS, expected)) return false; }
            if (nextAt > Date.now() && !await wait(nextAt - Date.now(), expected)) return false;
            if (!check()) return false;
            preview = move.from; paint();
            if (!await wait(TV.TV_CONFIG.MOVE_PREVIEW_MS, expected) || !check()) return false;
            preview = null; paint(); return true;
        }
        // Llegeix un text que no és cap jugada (p. ex. la màxima d'un exercici)
        // amb la mateixa veu i només si «Veu i ràdio» la té activada.
        function say(text) {
            if (disposed || !text || !voice.isOn() || !visible(el) || current().timed) return Promise.resolve({ spoken: false, reason: 'off' });
            suspended = false; cancelPreview(); stopAll(id); if (env.beforeVoice) env.beforeVoice();
            voice.unlock();
            const words = TV.tvSpeechText(text);
            speech = narrator.speak(words, { maxWaitMs: TV.tvSpeechMaxWaitMs(words) });
            const activeSpeech = speech;
            speech.then(() => { if (speech === activeSpeech && !disposed) audio.sync(); });
            return speech;
        }
        const session = { el, refresh, stop, dispose, anticipate, cancelPreview, sync, say, settled: () => speech || Promise.resolve(), unlock: () => { suspended = false; voice.unlock(); audio.sync(true); } };
        sessions.set(id, session); observeScreens();
        sync(board.fen()); return board;
    }
    return { transition, configure, createBoard, stopAll,
        refresh: id => { const s = sessions.get(id); if (s) s.refresh(); },
        cancel: id => { const s = sessions.get(id); if (s) s.stop(); },
        unlock: id => { const s = sessions.get(id); if (s) s.unlock(); },
        say: (id, text) => { const s = sessions.get(id); return s ? s.say(text) : Promise.resolve({ spoken: false, reason: 'no-board' }); },
        settled: id => { const s = sessions.get(id); return s ? s.settled() : Promise.resolve(); },
        preview: (id, move, valid) => { const s = sessions.get(id); return s ? s.anticipate(move, valid) : Promise.resolve(false); }
    };
});
