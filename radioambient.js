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
    // Frases de 16 s amb entrada i sortida suaus. No hi ha enregistraments,
    // veus ni xarxa: només aire filtrat o acords de sinus propis.
    function samples(sound, sampleRate = 22050, random = Math.random) {
        const length = sampleRate * 16, data = new Float32Array(length);
        const chords = [[130.81, 164.81, 196], [110, 130.81, 164.81], [87.31, 130.81, 174.61], [98, 146.83, 196]];
        let brown = 0, fast = 0, slow = 0;
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const fade = Math.min(1, t / 0.2, (length - 1 - i) / sampleRate / 0.2);
            let value = 0;
            if (sound === 'theme') {
                const phase = (t % 4) / 4, envelope = Math.sin(Math.PI * phase);
                chords[Math.floor(t / 4)].forEach((f, j) => {
                    value += Math.sin(2 * Math.PI * f * t + j * 0.4) * 0.18 * envelope;
                });
            } else if (sound === 'studio' || sound === 'tuning') {
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
    function createPlayer(env = {}) {
        let context = null, current = null, wanted = normalize(), active = false, failed = false;
        let cachedBuffer = null, cachedSound = null;
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
                        const data = samples(wanted.sound, 22050, env.random || Math.random);
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
                const level = wanted.volume / 100 * 0.18;
                current.gain.gain.setTargetAtTime(level, context.currentTime, 0.08);
                failed = false;
            } catch (err) { failed = true; stopSource(); }
        }
        const api = {
            update(raw, enabled) { wanted = normalize(raw); active = !!enabled; reconcile(); },
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
    return { normalize, canPlay, samples, createPlayer };
});
