// Veu i música de fons a tota l'app. Quan comença a parlar una veu (Matxa o
// la del dispositiu), sigui on sigui (ressenyes, entrenador, TV, historial,
// taulers...), sona una de les melodies de radioambient.js: baixa mentre la
// veu parla i s'atura quan es canvia de pàgina (tàctiques, un error, una
// partida...: una sola melodia per visita, encara que la veu calli entre
// exercici i exercici) o, fora d'una pàgina coneguda, quan fa una estona que
// calla. A Configuració es tria
// si se sent la veu, la música, totes dues o cap. Amb la veu apagada, les
// locucions es «fan» en silenci (amb la durada que tindrien) perquè les
// funcions que esperen que la veu acabi continuïn igual i la música soni.
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerMusicaFons = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    const STORAGE_KEY = 'eltauler_veu_musica';
    // both: veu i música · voice: només veu · music: només música · none: res.
    const MODES = ['both', 'voice', 'music', 'none'];
    // La música continua aquesta estona després de l'última locució (els
    // silencis entre comentaris de la TV o entre fragments d'una ressenya).
    const LINGER_MS = 20000;
    // Dins d'una pàgina, la melodia continua entre locucions; només s'apaga
    // si fa molta estona que no parla ningú (i torna la mateixa si la veu hi
    // torna sense haver canviat de pàgina).
    const PAGE_IDLE_MS = 15 * 60000;
    const TICK_MS = 1000;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

    function normalizePrefs(raw) {
        const r = raw || {};
        return { voice: r.voice !== false, music: r.music !== false,
            volume: isNum(r.volume) ? clamp(Math.round(r.volume), 0, 100) : 20 };
    }
    function modeOf(prefs) {
        const p = normalizePrefs(prefs);
        return p.voice ? (p.music ? 'both' : 'voice') : (p.music ? 'music' : 'none');
    }
    function withMode(prefs, mode) {
        const m = MODES.includes(mode) ? mode : 'both';
        return Object.assign(normalizePrefs(prefs), { voice: m === 'both' || m === 'voice', music: m === 'both' || m === 'music' });
    }
    // Durada aproximada d'una locució (uns 14 caràcters per segon).
    function estimateSpeechMs(text, rate) {
        const chars = String(text || '').trim().length;
        const r = isNum(rate) && rate > 0 ? clamp(rate, 0.5, 2) : 1;
        return Math.round(clamp(400 + chars / (14 * r) * 1000, 700, 60000));
    }

    // env = { ambient (radioambient.js), createPlayer(), random, now,
    //         setTimeout, clearTimeout, isHidden(), pageKey(), loadPrefs(),
    //         savePrefs(p), onChange(), isQuiet() }
    // isQuiet(): moment en què no hi ha d'haver ni veu ni música (p. ex. una
    // partida amb rellotge en curs); també es pot fixar amb setQuietCheck().
    // pageKey(): la pàgina que es veu (null si no se sap). Canviar de pàgina
    // atura la música i la pàgina nova en triarà una altra.
    function createCoordinator(env) {
        const e = env || {};
        const ambient = e.ambient || null;
        const now = e.now || (() => Date.now());
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        const random = e.random || Math.random;
        const hidden = e.isHidden || (() => false);
        const pageKey = e.pageKey || (() => null);
        let quietCheck = typeof e.isQuiet === 'function' ? e.isQuiet : null;
        const quiet = () => !!(quietCheck && safe(quietCheck));
        let page, pageMelody = null;
        let prefs = normalizePrefs(e.loadPrefs ? safe(e.loadPrefs) : null);
        let player = null, session = false, melody = null, lastVoice = -Infinity, timer = null, seq = 0, signature = '';
        const voices = new Map();
        const ticks = [];
        if (ambient && ambient.setAllowed) ambient.setAllowed(prefs.music);

        function safe(fn) { try { return fn(); } catch (err) { return null; } }
        function ensurePlayer() {
            if (!player && typeof e.createPlayer === 'function') player = safe(e.createPlayer);
            return player;
        }
        function audible() {
            for (const v of voices.values()) if (!v.muted) return true;
            return false;
        }
        // Només les veus que han començat en aquesta pàgina engeguen la música.
        function talkingHere() {
            for (const v of voices.values()) if (v.page === page) return true;
            return false;
        }
        function pick() {
            if (ambient && ambient.pickMelody) return ambient.pickMelody(random, melody);
            return melody;
        }
        function evaluate() {
            ticks.forEach(fn => { try { fn(); } catch (err) {} });
            const t = now(), talking = voices.size > 0;
            if (talking) lastVoice = t;
            const key = safe(pageKey);
            if (key !== page) { page = key; pageMelody = null; session = false; }
            if (!prefs.music || quiet()) session = false;
            else if (!session && talkingHere()) {
                session = true;
                // Fora d'una pàgina coneguda, cada tanda de veu en tria una de nova.
                if (!pageMelody || !page) pageMelody = pick();
                melody = pageMelody;
            } else if (session && !talking && t - lastVoice >= (page ? PAGE_IDLE_MS : LINGER_MS)) session = false;
            const p = session || player ? ensurePlayer() : null;
            if (p) {
                // Si la TV ja fa sonar la seva música de Matxa Ràdio, s'hi deixa pas.
                const yieldTo = session && !!(ambient && ambient.othersPlaying && ambient.othersPlaying(p));
                // Amb la pestanya amagada calla, però la visita continua.
                const on = session && !yieldTo && !hidden();
                try {
                    p.update({ sound: 'music', volume: prefs.volume, melody }, on, { fade: true });
                    if (p.duck) p.duck(talking && audible());
                    const st = p.status();
                    if (on && st !== 'playing' && st !== 'unavailable') p.unlock();
                } catch (err) {}
            }
            if (timer !== null) { clearT(timer); timer = null; }
            if (session || talking) timer = setT(() => { timer = null; evaluate(); }, TICK_MS);
            const sig = api.status() + '|' + api.playing() + '|' + modeOf(prefs) + '|' + prefs.volume;
            if (sig !== signature) {
                signature = sig;
                if (typeof e.onChange === 'function') { try { e.onChange(); } catch (err) {} }
            }
        }

        const api = {
            prefs: () => Object.assign({}, prefs),
            mode: () => modeOf(prefs),
            voiceEnabled: () => prefs.voice && !quiet(),
            quiet,
            // fn() → true quan no hi ha d'haver ni veu ni música.
            setQuietCheck(fn) { quietCheck = typeof fn === 'function' ? fn : null; evaluate(); },
            musicEnabled: () => prefs.music,
            setPrefs(next) {
                prefs = normalizePrefs(Object.assign({}, prefs, next || {}));
                if (typeof e.savePrefs === 'function') { try { e.savePrefs(prefs); } catch (err) {} }
                if (ambient && ambient.setAllowed) ambient.setAllowed(prefs.music);
                evaluate();
                if (session && player) { try { player.unlock(); } catch (err) {} }
            },
            setMode(mode) { api.setPrefs(withMode(prefs, mode)); },
            // Una veu comença; la funció que torna la dona per acabada.
            // opts.muted: locució silenciada (no cal abaixar la música).
            begin(opts) {
                const id = ++seq;
                voices.set(id, { muted: !!(opts && opts.muted), page: safe(pageKey) });
                evaluate();
                let done = false;
                return () => { if (done) return; done = true; voices.delete(id); evaluate(); };
            },
            speaking: () => voices.size > 0,
            session: () => session,
            melody: () => melody,
            status: () => (player ? player.status() : 'off'),
            playing: () => (player && player.playing ? player.playing() : null),
            // Des d'un gest de l'usuari: deixa reprendre l'àudio.
            unlock() {
                if (player) { try { player.unlock(); } catch (err) {} }
                evaluate();
            },
            // Comprovacions que es fan a cada pols mentre hi ha veu o música.
            onTick(fn) { if (typeof fn === 'function') ticks.push(fn); },
            refresh: evaluate,
            player: () => player
        };
        return api;
    }

    // Esdeveniments de la veu del dispositiu (per a les locucions simulades).
    function defaultFire(u, type, error) {
        let ev = null;
        try {
            if (type === 'error' && typeof root.SpeechSynthesisErrorEvent === 'function') ev = new root.SpeechSynthesisErrorEvent('error', { utterance: u, error: error || 'interrupted' });
            else if (type !== 'error' && typeof root.SpeechSynthesisEvent === 'function') ev = new root.SpeechSynthesisEvent(type, { utterance: u });
        } catch (err) { ev = null; }
        if (!ev) {
            try { ev = new root.Event(type); } catch (err) { ev = { type }; }
            if (error) { try { Object.defineProperty(ev, 'error', { value: error }); } catch (err) {} }
        }
        if (u && typeof u.dispatchEvent === 'function' && typeof root.Event === 'function' && ev instanceof root.Event) u.dispatchEvent(ev);
        else if (u && typeof u['on' + type] === 'function') u['on' + type](ev);
    }

    // speechSynthesis: s'escolten l'inici i el final de cada locució real i,
    // amb la veu apagada, es fan locucions silencioses amb els mateixos
    // esdeveniments (start, end; error «interrupted» en cancel·lar).
    function hookSpeechSynthesis(synth, coord, env) {
        if (!synth || synth.__musicaFons || typeof synth.speak !== 'function') return false;
        const e = env || {};
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        const fire = e.fire || defaultFire;
        const realSpeak = synth.speak, realCancel = typeof synth.cancel === 'function' ? synth.cancel : null;
        const live = new Map(), fakes = new Set();
        function track(u) {
            if (!u || typeof u.addEventListener !== 'function') return;
            let end = null;
            const stop = () => { live.delete(u); if (end) { const fn = end; end = null; fn(); } };
            u.addEventListener('start', () => { if (!end) end = coord.begin(); live.set(u, stop); });
            u.addEventListener('end', stop);
            u.addEventListener('error', stop);
        }
        function finishFake(entry, type) {
            if (!fakes.has(entry)) return;
            fakes.delete(entry);
            clearT(entry.timer);
            if (entry.end) entry.end();
            fire(entry.u, type, type === 'error' ? 'interrupted' : undefined);
        }
        function speakMuted(u) {
            const entry = { u, timer: null, end: null };
            fakes.add(entry);
            entry.timer = setT(() => {
                if (!fakes.has(entry)) return;
                entry.end = coord.begin({ muted: true });
                fire(u, 'start');
                entry.timer = setT(() => finishFake(entry, 'end'), estimateSpeechMs(u && u.text, u && u.rate));
            }, 0);
        }
        synth.speak = function (u) {
            if (!coord.voiceEnabled()) { speakMuted(u); return undefined; }
            try { track(u); } catch (err) {}
            return realSpeak.apply(synth, arguments);
        };
        synth.cancel = function () {
            Array.from(fakes).forEach(f => finishFake(f, 'error'));
            return realCancel ? realCancel.apply(synth, arguments) : undefined;
        };
        // Alguns navegadors no avisen mai del final: si ja no parla, s'acaba.
        coord.onTick(() => {
            if (live.size && !synth.speaking && !synth.pending) Array.from(live.values()).forEach(stop => stop());
        });
        synth.__musicaFons = true;
        return true;
    }

    // Veu neuronal Matxa (veuneural.js): una locució dura mentre la promesa
    // de speak() no s'ha resolt. Amb la veu apagada no es demana res al
    // servidor: es resol al cap de la durada estimada.
    function wrapSpeaker(s, coord, env) {
        if (!s || s.__musicaFons || typeof s.speak !== 'function') return s;
        const e = env || {};
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        const now = e.now || (() => Date.now());
        const realSpeak = s.speak, realStop = s.stop, realPause = s.pause, realResume = s.resume, realIsSpeaking = s.isSpeaking;
        let fake = null;
        function endFake(spoken, reason) {
            const f = fake;
            if (!f) return;
            fake = null;
            if (f.timer !== null) clearT(f.timer);
            f.end();
            f.resolve({ spoken, reason });
        }
        function arm(f) {
            f.startedAt = now();
            f.timer = setT(() => { if (fake === f) endFake(true, 'end'); }, f.remaining);
        }
        s.stop = function () {
            endFake(false, 'stopped');
            return typeof realStop === 'function' ? realStop.apply(s, arguments) : undefined;
        };
        s.speak = function (text, voiceId, opts) {
            if (coord.voiceEnabled()) {
                endFake(false, 'stopped');
                const end = coord.begin();
                let p;
                try { p = realSpeak.apply(s, arguments); } catch (err) { end(); throw err; }
                return Promise.resolve(p).then(r => { end(); return r; }, err => { end(); throw err; });
            }
            s.stop();
            if (!text) return Promise.resolve({ spoken: false, reason: 'empty' });
            const o = opts || {};
            return new Promise(resolve => {
                const f = { resolve, end: coord.begin({ muted: true }), remaining: estimateSpeechMs(text, o.rate), timer: null, startedAt: 0 };
                fake = f;
                arm(f);
            });
        };
        s.pause = function () {
            if (fake) {
                if (fake.timer !== null) {
                    clearT(fake.timer); fake.timer = null;
                    fake.remaining = Math.max(0, fake.remaining - (now() - fake.startedAt));
                }
                return undefined;
            }
            return typeof realPause === 'function' ? realPause.apply(s, arguments) : undefined;
        };
        s.resume = function () {
            if (fake) { if (fake.timer === null) arm(fake); return undefined; }
            return typeof realResume === 'function' ? realResume.apply(s, arguments) : undefined;
        };
        s.isSpeaking = function () {
            return !!fake || (typeof realIsSpeaking === 'function' && !!realIsSpeaking.apply(s, arguments));
        };
        s.__musicaFons = true;
        return s;
    }
    function hookNeural(V, coord, env) {
        if (!V || typeof V.sharedSpeaker !== 'function' || V.sharedSpeaker.__musicaFons) return false;
        const original = V.sharedSpeaker;
        const wrapped = function () { return wrapSpeaker(original.apply(this, arguments), coord, env); };
        wrapped.__musicaFons = true;
        V.sharedSpeaker = wrapped;
        return true;
    }

    // Pantalles de l'app (index.html): la que es veu és la pàgina actual.
    const SCREENS = '#start-screen, #game-screen, .screen-anim[id$="-screen"]';
    function visiblePage(doc) {
        const ids = [];
        doc.querySelectorAll(SCREENS).forEach(el => {
            const view = doc.defaultView;
            if (!el.hidden && view && view.getComputedStyle(el).display !== 'none') ids.push(el.id);
        });
        return ids.length ? ids.join('+') : null;
    }

    // Arrencada al navegador.
    let installed = null;
    function install(w) {
        if (installed || !w || !w.document) return installed;
        const ambient = w.ElTaulerRadioAmbient || null;
        const Ctor = w.AudioContext || w.webkitAudioContext;
        let ctx = null;
        const getContext = () => { if (!ctx || ctx.state === 'closed') ctx = new Ctor(); return ctx; };
        const storage = (() => { try { return w.localStorage; } catch (err) { return null; } })();
        const coord = createCoordinator({
            ambient,
            createPlayer: ambient && Ctor ? () => ambient.createPlayer({ createContext: getContext, onChange: () => coord.refresh() }) : null,
            isHidden: () => w.document.visibilityState === 'hidden',
            pageKey: () => visiblePage(w.document),
            loadPrefs: () => { const raw = storage && storage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; },
            savePrefs: (p) => { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(p)); },
            onChange: () => { try { w.dispatchEvent(new w.CustomEvent('eltauler-musicafons')); } catch (err) {} }
        });
        installed = coord;
        // L'àudio només es pot engegar des d'un gest de l'usuari.
        const gesture = () => {
            if (!coord.musicEnabled() || !Ctor) return;
            try {
                const c = getContext();
                if (c.state === 'suspended') Promise.resolve(c.resume()).catch(() => {});
            } catch (err) {}
            coord.unlock();
        };
        ['pointerdown', 'keydown', 'touchend'].forEach(type => {
            try { w.addEventListener(type, gesture, { capture: true, passive: true }); } catch (err) {}
        });
        try { w.document.addEventListener('visibilitychange', () => coord.refresh()); } catch (err) {}
        try { hookSpeechSynthesis(w.speechSynthesis, coord); } catch (err) {}
        try { hookNeural(w.ElTaulerVeuNeural, coord); } catch (err) {}
        // En canviar de pàgina (show/hide de les pantalles), la música s'atura al moment.
        const watchScreens = () => {
            if (typeof w.MutationObserver !== 'function') return;
            const observer = new w.MutationObserver(() => coord.refresh());
            w.document.querySelectorAll(SCREENS).forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }));
        };
        if (w.document.readyState === 'loading') w.document.addEventListener('DOMContentLoaded', watchScreens);
        else watchScreens();
        return coord;
    }
    const current = () => installed;
    const api = {
        STORAGE_KEY, MODES, LINGER_MS, PAGE_IDLE_MS, TICK_MS, visiblePage,
        normalizePrefs, modeOf, withMode, estimateSpeechMs,
        createCoordinator, hookSpeechSynthesis, wrapSpeaker, hookNeural, install, current,
        // Dreceres per a la resta de l'app (sense instal·lar, tot encès).
        voiceEnabled: () => (installed ? installed.voiceEnabled() : true),
        musicEnabled: () => (installed ? installed.musicEnabled() : true)
    };
    if (root && root.document && typeof module === 'undefined') install(root);
    return api;
});
