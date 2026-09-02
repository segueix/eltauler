// ============================================================================
// sons.js — Sons i vibració de les partides d'El Tauler
// ============================================================================
// Tots els sons es SINTETITZEN amb Web Audio (cap fitxer d'àudio): així no cal
// baixar ni precachejar res, funcionen fora de línia i pesen zero bytes.
//
// - Un so per jugada (peça, captura, enroc, escac, coronació), un per resultat
//   (victòria, derrota, taules), dos avisos de temps baix i dos de feedback
//   d'exercici (encert/error). Quin so toca a cada jugada ho decideix core.js
//   (soundKindForMove): aquí només se sintetitza.
// - La preferència és PER DISPOSITIU (prefix eltauler_cloud_, exclòs de la
//   sincronització): al mòbil es pot voler so i a l'ordinador de la feina no.
// - Els navegadors només deixen sonar després d'un gest de l'usuari: el
//   context d'àudio s'obre al primer toc/clic/tecla i, a partir d'aquí, també
//   sonen les jugades del rival (que no surten de cap gest).
// - La vibració (navigator.vibrate) només existeix a mòbils Android; a la resta
//   simplement no fa res.
//
// Es carrega com a <script src="sons.js"> → window.ElTaulerSons.
// ============================================================================
(function (root) {
    'use strict';

    const SOUND_KEY = 'eltauler_cloud_sounds';
    const VIBRATION_KEY = 'eltauler_cloud_vibration';
    const MASTER_GAIN = 0.9;

    let ctx = null;
    let master = null;
    let unlockBound = false;

    function readPref(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            if (v === null) return fallback;
            return v === '1';
        } catch (e) { return fallback; }
    }
    function writePref(key, on) {
        try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {}
    }

    const state = {
        sound: readPref(SOUND_KEY, true),
        vibration: readPref(VIBRATION_KEY, true)
    };

    function audioSupported() {
        return !!(root && (root.AudioContext || root.webkitAudioContext));
    }
    function vibrationSupported() {
        return !!(root && root.navigator && typeof root.navigator.vibrate === 'function');
    }

    function ensureContext() {
        if (ctx) return ctx;
        if (!audioSupported()) return null;
        try {
            const Ctor = root.AudioContext || root.webkitAudioContext;
            ctx = new Ctor();
            master = ctx.createGain();
            master.gain.value = MASTER_GAIN;
            master.connect(ctx.destination);
        } catch (e) { ctx = null; master = null; }
        return ctx;
    }

    // Obre (o reprèn) el context dins d'un gest de l'usuari. Es lliga una sola
    // vegada als primers esdeveniments de la pàgina i es torna a provar a cada
    // reproducció (un context pot tornar a quedar suspès en segon pla).
    function unlock() {
        const c = ensureContext();
        if (!c) return;
        if (c.state === 'suspended') { try { c.resume().catch(function () {}); } catch (e) {} }
    }
    function bindUnlock() {
        if (unlockBound || typeof document === 'undefined') return;
        unlockBound = true;
        const once = function () {
            unlock();
            if (ctx && ctx.state === 'running') {
                ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(function (evt) {
                    document.removeEventListener(evt, once, true);
                });
            }
        };
        ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(function (evt) {
            document.addEventListener(evt, once, { capture: true, passive: true });
        });
    }

    // ---- Primitives de síntesi -------------------------------------------
    // Un to curt amb envolupant (atac ràpid, caiguda exponencial).
    function tone(freq, opts) {
        const o = opts || {};
        const c = ctx;
        if (!c || !master) return;
        const t0 = c.currentTime + (o.start || 0);
        const dur = o.dur || 0.08;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(o.gain || 0.15, t0 + (o.attack || 0.006));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    // Ràfega de soroll filtrat: el «toc» de fusta d'una peça sobre el tauler.
    let noiseBuffer = null;
    function noise(opts) {
        const o = opts || {};
        const c = ctx;
        if (!c || !master) return;
        if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
            const len = Math.floor(c.sampleRate * 0.25);
            noiseBuffer = c.createBuffer(1, len, c.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        const t0 = c.currentTime + (o.start || 0);
        const dur = o.dur || 0.05;
        const src = c.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = c.createBiquadFilter();
        filter.type = o.filterType || 'bandpass';
        filter.frequency.setValueAtTime(o.freq || 1800, t0);
        filter.Q.setValueAtTime(o.q || 1, t0);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(o.gain || 0.3, t0 + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filter);
        filter.connect(g);
        g.connect(master);
        src.start(t0);
        src.stop(t0 + dur + 0.02);
    }

    // ---- Receptes ---------------------------------------------------------
    const RECIPES = {
        // Peça que es posa: toc de fusta sec.
        move: function () {
            noise({ dur: 0.045, freq: 2200, q: 0.9, gain: 0.35 });
            tone(440, { type: 'triangle', dur: 0.05, gain: 0.07 });
        },
        // Captura: toc més greu i més llarg (dues peces que xoquen).
        capture: function () {
            noise({ dur: 0.075, freq: 900, q: 0.8, gain: 0.45 });
            tone(180, { type: 'triangle', dur: 0.09, gain: 0.16 });
        },
        // Enroc: dos tocs seguits (rei i torre).
        castle: function () {
            noise({ dur: 0.04, freq: 2200, q: 0.9, gain: 0.32 });
            noise({ start: 0.1, dur: 0.045, freq: 1900, q: 0.9, gain: 0.34 });
        },
        // Escac: dues notes ascendents, clares.
        check: function () {
            noise({ dur: 0.04, freq: 2200, q: 0.9, gain: 0.25 });
            tone(880, { dur: 0.08, gain: 0.14 });
            tone(1175, { start: 0.09, dur: 0.13, gain: 0.14 });
        },
        // Coronació: arpegi ascendent.
        promote: function () {
            [660, 880, 1320].forEach(function (f, i) { tone(f, { start: i * 0.07, dur: 0.14, gain: 0.13 }); });
        },
        gameover_win: function () {
            [523, 659, 784, 1047].forEach(function (f, i) { tone(f, { start: i * 0.11, dur: 0.3, gain: 0.14 }); });
        },
        gameover_loss: function () {
            [440, 370, 311].forEach(function (f, i) { tone(f, { type: 'triangle', start: i * 0.17, dur: 0.34, gain: 0.14 }); });
        },
        gameover_draw: function () {
            tone(523, { dur: 0.2, gain: 0.13 });
            tone(523, { start: 0.24, dur: 0.28, gain: 0.13 });
        },
        // Temps baix: un bip doble; als últims segons, triple i més agut.
        lowtime: function () {
            tone(1000, { type: 'square', dur: 0.06, gain: 0.06 });
            tone(1000, { type: 'square', start: 0.1, dur: 0.06, gain: 0.06 });
        },
        lowtime2: function () {
            [0, 0.09, 0.18].forEach(function (s) { tone(1400, { type: 'square', start: s, dur: 0.05, gain: 0.07 }); });
        },
        // Exercicis: encert i error.
        success: function () {
            tone(659, { dur: 0.1, gain: 0.12 });
            tone(988, { start: 0.1, dur: 0.18, gain: 0.12 });
        },
        fail: function () {
            tone(220, { type: 'triangle', dur: 0.2, gain: 0.12, glideTo: 160 });
        }
    };

    // Patrons de vibració (ms). Les jugades normals, gairebé imperceptibles.
    const VIBRATION = {
        move: 10,
        capture: 22,
        castle: [10, 40, 10],
        check: [30, 50, 30],
        promote: [20, 40, 40],
        gameover_win: [40, 60, 40, 60, 120],
        gameover_loss: [160],
        gameover_draw: [40, 60, 40],
        lowtime: [60, 60, 60],
        lowtime2: [80, 50, 80, 50, 80],
        success: [20, 40, 20],
        fail: [90]
    };

    function vibrate(kind) {
        if (!state.vibration || !vibrationSupported()) return false;
        const pattern = VIBRATION[kind];
        if (!pattern) return false;
        try { return !!root.navigator.vibrate(pattern); } catch (e) { return false; }
    }

    // Reprodueix un so (i vibra) si la preferència ho permet. Mai llança.
    function play(kind) {
        if (!kind || !RECIPES[kind]) return false;
        vibrate(kind);
        if (!state.sound) return false;
        const c = ensureContext();
        if (!c) return false;
        try {
            if (c.state === 'suspended') {
                // Fora d'un gest això no farà res; dins d'un gest, sí.
                c.resume().then(function () { try { RECIPES[kind](); } catch (e) {} }).catch(function () {});
                return true;
            }
            RECIPES[kind]();
            return true;
        } catch (e) { return false; }
    }

    function setSoundEnabled(on) {
        state.sound = !!on;
        writePref(SOUND_KEY, state.sound);
        if (state.sound) unlock();
    }
    function setVibrationEnabled(on) {
        state.vibration = !!on;
        writePref(VIBRATION_KEY, state.vibration);
    }

    bindUnlock();

    root.ElTaulerSons = {
        play: play,
        vibrate: vibrate,
        unlock: unlock,
        isSoundEnabled: function () { return state.sound; },
        isVibrationEnabled: function () { return state.vibration; },
        setSoundEnabled: setSoundEnabled,
        setVibrationEnabled: setVibrationEnabled,
        audioSupported: audioSupported,
        vibrationSupported: vibrationSupported,
        KINDS: Object.keys(RECIPES)
    };
})(typeof window !== 'undefined' ? window : this);
