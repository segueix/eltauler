// Ambient original generat al dispositiu, exclusiu de Matxa Ràdio a la TV.
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerRadioAmbient = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    const SOUNDS = ['off', 'studio', 'theme', 'tuning'];
    function normalize(raw) {
        const r = raw || {};
        return { sound: SOUNDS.includes(r.sound) ? r.sound : 'off',
            volume: typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.max(0, Math.min(100, r.volume)) : 20 };
    }
    function canPlay(s) {
        return !!(s && s.matxa && s.profile === 'radio' && s.voiceOn && s.engine === 'neural'
            && !s.blocked && s.open && s.visible && !s.hidden && !s.paused && !s.error);
    }
    // ── Sintonia suau ────────────────────────────────────────────────────
    // Una peça curta i tranquil·la de ràdio, sintetitzada aquí mateix: piano
    // elèctric, coixí d'acords, baix, un motiu de vibràfon i percussió
    // d'escombretes. Vuit compassos a 60 ppm (32 s) en do major:
    // Fa7M · Mi m7 · Re m7 · Do7M · Fa7M · Mi m7 · Re m7 · Sol7sus4.
    // Tot s'escriu en un bucle circular (les cues de l'últim compàs continuen
    // al principi), de manera que la repetició no té cap tall ni cap forat.
    // Els timbres porten harmònics a la zona de 200-2000 Hz perquè se sentin
    // en altaveus petits (mòbil, portàtil) sense tapar la veu.
    const THEME_SECONDS = 32;
    const THEME = {
        beat: 1,          // 60 ppm: una negra per segon
        swing: 0.06,      // corxeres lleugerament endarrerides
        chords: [
            { bass: 41, notes: [57, 60, 64, 67] },   // Fa7M(9)
            { bass: 40, notes: [55, 59, 62, 64] },   // Mi m7
            { bass: 38, notes: [53, 57, 60, 64] },   // Re m7(9)
            { bass: 36, notes: [52, 55, 59, 62] },   // Do7M(9)
            { bass: 41, notes: [57, 60, 64, 67] },
            { bass: 40, notes: [55, 59, 62, 64] },
            { bass: 38, notes: [53, 57, 60, 64] },
            { bass: 43, notes: [53, 57, 60, 62] }    // Sol7sus4(9)
        ],
        // Motiu de vibràfon (compàs, temps, nota MIDI, durada): pentatònica de do.
        melody: [
            [0, 0.5, 76, 1], [0, 1, 79, 1], [0, 1.5, 81, 1.5], [0, 2.5, 79, 2],
            [1, 0.5, 76, 1], [1, 1.5, 74, 3],
            [4, 0.5, 76, 1], [4, 1, 79, 1], [4, 1.5, 84, 1.5], [4, 2.5, 81, 2],
            [5, 0.5, 79, 1], [5, 1.5, 76, 3],
            [7, 2, 74, 1], [7, 3, 76, 1.5]
        ]
    };
    const TABLE_SIZE = 4096;
    const SINE = new Float32Array(TABLE_SIZE + 1);
    for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin(2 * Math.PI * i / TABLE_SIZE);
    // Sinus per taula (fase en cicles, sempre positiva i petita): ràpid i
    // prou fi per a un fons. La part entera es descarta amb una màscara.
    function sin1(phase) {
        const x = phase * TABLE_SIZE, i = x | 0, k = i & (TABLE_SIZE - 1);
        return SINE[k] + (SINE[k + 1] - SINE[k]) * (x - i);
    }
    function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

    function themeSamples(sampleRate, random) {
        const length = sampleRate * THEME_SECONDS, data = new Float32Array(length);
        const sr = sampleRate;
        // Factor per sample d'una caiguda exponencial de constant `tau` (s):
        // les envolupants es calculen multiplicant, sense cap exp per sample.
        // Cada instrument té el seu bucle amb variables locals (res de
        // clausures per sample): la peça sencera es genera en poques desenes
        // de mil·lisegons. L'índex dona la volta (j - length) perquè les cues
        // del final sonin sobre el principi.
        const decay = (tau) => Math.exp(-1 / (sr * tau));
        const at = (sec) => Math.round(sec * sr) % length;

        // Piano elèctric (FM 1:1 amb un toc de llengüeta a l'atac).
        function epiano(start, midi, vel) {
            const f = midiHz(midi) / sr, kA = decay(0.004), kE = decay(1.1), kI = decay(0.3), kT = decay(0.09);
            const n = Math.round(2.2 * sr);
            let j = at(start), atk = 1, env = vel * 0.2, ix = 1.4, tn = 0.2;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                atk *= kA; env *= kE; ix *= kI; tn *= kT;
                const p = f * i;
                const body = sin1(p + (ix + 0.25) * sin1(p) * 0.159);
                data[j] += (1 - atk) * env * (tn > 0.002 ? body + tn * sin1(p * 4.02) : body);
            }
        }
        // Coixí: dos osciŀladors lleugerament desafinats, amb el segon harmònic.
        function pad(start, midi, dur) {
            const fa = midiHz(midi) * 1.003 / sr, fb = midiHz(midi) * 0.997 / sr, kR = decay(0.3);
            const aN = Math.round(0.8 * sr), hold = Math.round(dur * sr), n = hold + Math.round(0.9 * sr);
            let j = at(start), rel = 0.024;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                const attack = i < aN ? (1 - Math.cos(Math.PI * i / aN)) / 2 : 1;
                if (i > hold) rel *= kR;
                data[j] += attack * rel * (sin1(fa * i) + sin1(fb * i + 0.3) + 0.6 * sin1(2 * fa * i + 0.6));
            }
        }
        // Baix rodó amb harmònics (perquè s'intueixi també en altaveus petits).
        function bass(start, midi, vel) {
            const f = midiHz(midi) / sr, kA = decay(0.008), kE = decay(0.75), n = Math.round(1.8 * sr);
            let j = at(start), atk = 1, env = vel * 0.11;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                atk *= kA; env *= kE;
                const p = f * i;
                data[j] += (1 - atk) * env * (0.7 * sin1(p) + 0.55 * sin1(2 * p) + 0.32 * sin1(3 * p) + 0.15 * sin1(4 * p));
            }
        }
        // Vibràfon: parcial fonamental i el quart parcial (≈ 4 × f), amb trèmolo.
        function vibes(start, midi, dur) {
            const f = midiHz(midi) / sr, tr = 5.2 / sr, kA = decay(0.003), kE = decay(1.4), kP = decay(0.25), kR = decay(0.3);
            const hold = Math.round(dur * sr), n = hold + Math.round(1.2 * sr);
            let j = at(start), atk = 1, env = 0.12, part = 0.22, rel = 1;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                atk *= kA; env *= kE; part *= kP;
                if (i > hold) rel *= kR;
                const trem = 1 - 0.18 * (0.5 + 0.5 * sin1(tr * i));
                data[j] += (1 - atk) * env * rel * trem * (sin1(f * i) + part * sin1(3.93 * f * i));
            }
        }
        // Bombo suau: sinus amb el to que cau de pressa.
        function kick(start, vel) {
            const kE = decay(0.16), kP = decay(0.045), n = Math.round(0.42 * sr);
            let j = at(start), phase = 0, env = vel * 0.16, sweep = 70;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                sweep *= kP; env *= kE;
                phase += (48 + sweep) / sr;
                data[j] += env * sin1(phase);
            }
        }
        // Escombreta (cop de caixa amb raspall) i maraca: soroll filtrat.
        function brush(start, vel, tau, bright) {
            const a = bright ? 0.55 : 0.25, kA = decay(0.002), kE = decay(tau), n = Math.round(tau * 6 * sr);
            let j = at(start), lp = 0, hp = 0, prev = 0, atk = 1, env = vel * 0.22;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                lp += a * ((random() * 2 - 1) - lp);
                hp = 0.92 * (hp + lp - prev); prev = lp;
                atk *= kA; env *= kE;
                data[j] += (1 - atk) * env * hp;
            }
        }

        const beat = THEME.beat, bar = beat * 4, sw = THEME.swing;
        THEME.chords.forEach((chord, b) => {
            const t0 = b * bar;
            chord.notes.forEach((n) => pad(t0, n, bar));
            chord.notes.forEach((n, j) => {
                epiano(t0 + j * 0.012, n + 12, 0.85);
                epiano(t0 + 1.5 * beat + sw + j * 0.01, n + 12, 0.45);
                if (j >= 2) epiano(t0 + 3 * beat, n + 12, 0.34);
            });
            bass(t0, chord.bass, 1);
            bass(t0 + 2 * beat, chord.bass + 7, 0.75);
            bass(t0 + 3.5 * beat + sw, chord.bass + 12, 0.5);
            kick(t0, 1);
            kick(t0 + 2 * beat, 0.7);
            brush(t0 + beat, 0.8, 0.09, false);
            brush(t0 + 3 * beat, 0.8, 0.09, false);
            for (let e = 0; e < 8; e++) {
                const off = e % 2 ? sw : 0;
                brush(t0 + e * beat / 2 + off, e % 2 ? 0.55 : 0.32, 0.022, true);
            }
        });
        THEME.melody.forEach(([b, at, n, dur]) => vibes(b * bar + at * beat, n, dur * beat));

        // Marge fix: el pic queda a 0,72 (sense saturar i amb el mateix nivell
        // a cada dispositiu, perquè la percussió fa servir soroll).
        let peak = 0;
        for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
        const k = peak > 0 ? 0.72 / peak : 0;
        for (let i = 0; i < length; i++) data[i] *= k;
        return data;
    }

    // Ambient d'estudi i ràdio clàssica: frases de 16 s d'aire filtrat amb
    // entrada i sortida suaus. La sintonia és música (vegeu a dalt). No hi ha
    // enregistraments, veus ni xarxa.
    function samples(sound, sampleRate = 22050, random = Math.random) {
        if (sound === 'theme') return themeSamples(sampleRate, random);
        const length = sampleRate * 16, data = new Float32Array(length);
        let brown = 0, fast = 0, slow = 0;
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const fade = Math.min(1, t / 0.2, (length - 1 - i) / sampleRate / 0.2);
            let value = 0;
            if (sound === 'studio' || sound === 'tuning') {
                const white = random() * 2 - 1;
                brown = (brown + 0.02 * white) / 1.02;
                fast += 0.35 * (white - fast);
                slow += 0.04 * (white - slow);
                value = sound === 'studio' ? brown * 2.2 : (fast - slow) * 0.6;
            }
            data[i] = Math.max(-0.8, Math.min(0.8, value)) * fade;
        }
        return data;
    }
    // Nivell màxim de cada so (amb el volum al 100 %). La sintonia és música
    // amb dinàmica i necessita més marge que l'aire filtrat per sentir-se a
    // sota de la veu; els valors deixen el fons uns 20 dB per sota de Matxa
    // amb el volum per defecte (20 %).
    const LEVELS = { studio: 0.18, tuning: 0.18, theme: 0.35 };
    // Mentre parla la veu, el fons baixa a aquesta fracció (com a la ràdio) i
    // torna a pujar a poc a poc quan calla.
    const DUCK = 0.45;
    // La sintonia es genera un sol cop per sessió (amb el soroll de
    // Math.random); l'aire filtrat és prou ràpid per fer-lo cada vegada.
    const themeCache = {};
    function soundData(sound, sampleRate, random) {
        if (sound !== 'theme' || random !== Math.random) return samples(sound, sampleRate, random);
        if (!themeCache[sampleRate]) themeCache[sampleRate] = samples(sound, sampleRate, random);
        return themeCache[sampleRate];
    }
    function createPlayer(env = {}) {
        let context = null, current = null, wanted = normalize(), active = false, failed = false, ducked = false;
        let cachedBuffer = null, cachedSound = null;
        const level = () => wanted.volume / 100 * (LEVELS[wanted.sound] || 0.18) * (ducked ? DUCK : 1);
        const Ctor = root && (root.AudioContext || root.webkitAudioContext);
        const supported = !!(env.createContext || Ctor);
        function stopSource() {
            if (!current) return;
            const entry = current;
            current = null;
            try { entry.source.stop(); } catch (err) {}
            try { entry.source.disconnect(); } catch (err) {}
            try { entry.gain.disconnect(); } catch (err) {}
        }
        function reconcile() {
            if (!active || wanted.sound === 'off' || wanted.volume === 0) { stopSource(); return; }
            if (failed || !context || context.state !== 'running') return;
            try {
                if (current && current.sound !== wanted.sound) stopSource();
                if (!current) {
                    const source = context.createBufferSource(), gain = context.createGain();
                    current = { source, gain, sound: wanted.sound };
                    if (!cachedBuffer || cachedSound !== wanted.sound) {
                        const data = soundData(wanted.sound, 22050, env.random || Math.random);
                        const buffer = context.createBuffer(1, data.length, 22050);
                        buffer.getChannelData(0).set(data);
                        cachedBuffer = buffer; cachedSound = wanted.sound;
                    }
                    source.buffer = cachedBuffer;
                    source.loop = true;
                    gain.gain.value = 0;
                    source.connect(gain); gain.connect(context.destination);
                    source.start();
                }
                // Marge de volum per mantenir l'ambient discret.
                current.gain.gain.setTargetAtTime(level(), context.currentTime, 0.08);
                failed = false;
            } catch (err) { failed = true; stopSource(); }
        }
        const api = {
            update(raw, enabled) { wanted = normalize(raw); active = !!enabled; reconcile(); },
            // La veu comença (true) o acaba (false) de parlar: el fons baixa de
            // pressa i torna a pujar suaument, sense tocar el bucle.
            duck(on) {
                const value = !!on;
                if (value === ducked) return;
                ducked = value;
                if (!current || !context) return;
                try { current.gain.gain.setTargetAtTime(level(), context.currentTime, value ? 0.12 : 0.6); } catch (err) {}
            },
            // Només crea o reprèn el context des d'una acció autoritzada de la UI.
            unlock() {
                if (!active || wanted.sound === 'off' || wanted.volume === 0 || !supported) return;
                try {
                    failed = false;
                    if (!context || context.state === 'closed') context = env.createContext ? env.createContext() : new Ctor();
                    const ctx = context;
                    if (ctx.state !== 'running') {
                        Promise.resolve(ctx.resume()).then(() => { if (context === ctx) reconcile(); }).catch(() => { if (context === ctx) failed = true; });
                    } else reconcile();
                } catch (err) { failed = true; stopSource(); }
            },
            status() {
                if (!active || wanted.sound === 'off' || wanted.volume === 0) return 'off';
                if (!supported || failed) return 'unavailable';
                return current && context && context.state === 'running' ? 'playing' : 'waiting';
            },
            dispose() {
                active = false; stopSource();
                cachedBuffer = null; cachedSound = null;
                const ctx = context; context = null;
                try { if (ctx && ctx.close) Promise.resolve(ctx.close()).catch(() => {}); } catch (err) {}
            }
        };
        return api;
    }
    return { normalize, canPlay, samples, createPlayer, LEVELS, DUCK, THEME_SECONDS };
});
