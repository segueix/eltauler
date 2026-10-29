// Música de fons original generada al dispositiu, exclusiva de Matxa Ràdio a la TV.
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerRadioAmbient = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    // 'music': a cada partida sona una melodia triada a l'atzar. Els sons
    // antics (aire d'estudi, ràdio clàssica i sintonia fixa) es llegeixen com
    // a música.
    const SOUNDS = ['off', 'music'];
    const LEGACY_SOUNDS = ['studio', 'tuning', 'theme'];
    function normalize(raw) {
        const r = raw || {};
        const sound = SOUNDS.includes(r.sound) ? r.sound : (LEGACY_SOUNDS.includes(r.sound) ? 'music' : 'off');
        return { sound,
            volume: typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.max(0, Math.min(100, r.volume)) : 20 };
    }
    function canPlay(s) {
        return !!(s && s.matxa && s.profile === 'radio' && s.voiceOn && s.engine === 'neural'
            && !s.blocked && s.open && s.visible && !s.hidden && !s.paused && !s.error);
    }
    // Totes les melodies duren 32 s i es repeteixen sense tall.
    const THEME_SECONDS = 32;
    const MELODY_SECONDS = 32;
    const MELODIES = [
        { id: 'theme', name: 'Sintonia suau', description: 'piano elèctric, baix i escombretes' },
        { id: 'oriental', name: 'Jardí oriental', description: 'koto, flauta de bambú i campana de temple en escala pentatònica japonesa' },
        { id: 'bossa', name: 'Bossa del tauler', description: 'guitarra de niló, flauta i percussió de bossa nova' },
        { id: 'vals', name: 'Vals de la capsa de música', description: 'capsa de música, pizzicato i cordes en tres temps' },
        { id: 'capvespre', name: 'Capvespre', description: 'arpa, cordes i campanetes en calma' }
    ];
    function melodyId(id) { return MELODIES.some(m => m.id === id) ? id : MELODIES[0].id; }
    function melodyInfo(id) { return MELODIES.find(m => m.id === melodyId(id)); }
    // Una melodia a l'atzar per a cada partida; si n'hi ha més d'una, mai la
    // mateixa que la partida anterior.
    function pickMelody(random = Math.random, previous = null) {
        const pool = MELODIES.filter(m => m.id !== previous);
        const list = pool.length ? pool : MELODIES;
        const r = Math.max(0, Math.min(0.999999, Number(random()) || 0));
        return list[Math.floor(r * list.length)].id;
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

    // Instruments que escriuen sobre un bucle circular de `seconds` segons.
    // Cada instrument té el seu bucle amb variables locals (res de clausures
    // per sample) i les envolupants es calculen multiplicant (sense cap exp
    // per sample). L'índex dona la volta (j - length) perquè les cues del
    // final sonin sobre el principi.
    function createSynth(sampleRate, seconds, random) {
        const sr = sampleRate, length = sr * seconds, data = new Float32Array(length);
        // Factor per sample d'una caiguda exponencial de constant `tau` (s).
        const decay = (tau) => Math.exp(-1 / (sr * tau));
        const at = (sec) => ((Math.round(sec * sr) % length) + length) % length;

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
        function pad(start, midi, dur, level = 0.024, attackSec = 0.8) {
            const fa = midiHz(midi) * 1.003 / sr, fb = midiHz(midi) * 0.997 / sr, kR = decay(0.3);
            const aN = Math.round(attackSec * sr), hold = Math.round(dur * sr), n = hold + Math.round(0.9 * sr);
            let j = at(start), rel = level;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                const attack = i < aN ? (1 - Math.cos(Math.PI * i / aN)) / 2 : 1;
                if (i > hold) rel *= kR;
                data[j] += attack * rel * (sin1(fa * i) + sin1(fb * i + 0.3) + 0.6 * sin1(2 * fa * i + 0.6));
            }
        }
        // Cordes: com el coixí, però amb més harmònics i un vibrato lent.
        function strings(start, midi, dur, level = 0.018, attackSec = 0.7) {
            const f = midiHz(midi) / sr, vr = 4.6 / sr, kR = decay(0.4);
            const aN = Math.round(attackSec * sr), hold = Math.round(dur * sr), n = hold + Math.round(1.4 * sr);
            let j = at(start), rel = level, pa = 0, pb = 0.37;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                const attack = i < aN ? (1 - Math.cos(Math.PI * i / aN)) / 2 : 1;
                if (i > hold) rel *= kR;
                const vib = 1 + 0.0025 * sin1(vr * i);
                pa += f * 1.002 * vib; pb += f * 0.998 * vib;
                const s1 = sin1(pa), c2 = 2 * sin1(pa + 0.25), s2 = c2 * s1, s3 = c2 * s2 - s1, s4 = c2 * s3 - s2;
                data[j] += attack * rel * (s1 + sin1(pb) + 0.5 * s2 + 0.32 * s3 + 0.2 * s4);
            }
        }
        // Baix rodó amb harmònics (perquè s'intueixi també en altaveus petits).
        function bass(start, midi, vel, tau = 0.75) {
            const f = midiHz(midi) / sr, kA = decay(0.008), kE = decay(tau), n = Math.round(Math.max(1.8, tau * 2.4) * sr);
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
        function kick(start, vel, base = 48) {
            const kE = decay(0.16), kP = decay(0.045), n = Math.round(0.42 * sr);
            let j = at(start), phase = 0, env = vel * 0.16, sweep = 70;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                sweep *= kP; env *= kE;
                phase += (base + sweep) / sr;
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
        // Corda pinçada (koto, guitarra de niló, arpa, pizzicato): parcials
        // harmònics que s'apaguen més de pressa com més aguts són, amb una
        // entrada de to opcional (cents per sota) i un vibrato que apareix tard.
        function pluck(start, midi, vel, o) {
            const p = o || {};
            const f0 = midiHz(midi) / sr, tau = p.decay || 1.2;
            const parts = p.partials || [1, 0.45, 0.25, 0.12];
            const K = parts.length, env = new Float64Array(K), ks = new Float64Array(K);
            for (let k = 0; k < K; k++) {
                env[k] = parts[k] * vel * (p.gain || 0.14);
                ks[k] = decay(tau / (1 + k * (p.damp === undefined ? 0.8 : p.damp)));
            }
            const n = Math.round((p.len || tau * 3.2) * sr), kA = decay(p.attack || 0.0025), kB = decay(0.07);
            const vr = (p.vibRate || 5.5) / sr, vd = (p.vib || 0) / 12 * 0.693, vOn = 0.3 * sr;
            let j = at(start), atk = 1, bend = (p.bend || 0) / 1200 * 0.693, ph = 0, live = K;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                // Els parcials aguts s'apaguen abans: es deixen de calcular.
                if ((i & 255) === 0) { while (live > 1 && env[live - 1] < 2e-5) live--; if (env[0] < 2e-5) break; }
                atk *= kA; bend *= kB;
                const vib = vd ? vd * Math.min(1, i / vOn) * sin1(vr * i + 0.75) : 0;
                ph += f0 * (1 + vib - bend);
                // sin((k+1)·x) per recurrència: dues consultes a la taula per
                // sample, sigui quin sigui el nombre de parcials.
                const s1 = sin1(ph), c2 = 2 * sin1(ph + 0.25);
                env[0] *= ks[0];
                let sum = env[0] * s1, prev2 = 0, prev1 = s1;
                for (let k = 1; k < live; k++) {
                    const sk = c2 * prev1 - prev2;
                    prev2 = prev1; prev1 = sk;
                    env[k] *= ks[k]; sum += env[k] * sk;
                }
                data[j] += (1 - atk) * sum;
            }
        }
        // Flauta (de bambú o travessera): fonamental amb dos harmònics, alè
        // filtrat, entrada lliscada opcional i vibrato que creix.
        function flute(start, midi, dur, vel, o) {
            const p = o || {};
            const f0 = midiHz(midi) / sr, vr = (p.vibRate || 5) / sr, vd = (p.vib === undefined ? 0.2 : p.vib) / 12 * 0.693;
            const aN = Math.round((p.attack || 0.09) * sr), hold = Math.round(dur * sr), n = hold + Math.round(0.6 * sr);
            const kR = decay(p.release || 0.12), kS = decay(0.06), breath = p.breath === undefined ? 0.12 : p.breath;
            let j = at(start), rel = vel * (p.gain || 0.1), slide = (p.slide || 0) / 1200 * 0.693, ph = 0, lp = 0, hp = 0, prev = 0;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                const attack = i < aN ? (1 - Math.cos(Math.PI * i / aN)) / 2 : 1;
                if (i > hold) rel *= kR;
                slide *= kS;
                const grow = Math.min(1, i / (0.4 * sr));
                ph += f0 * (1 + vd * grow * sin1(vr * i) + slide);
                lp += 0.3 * ((random() * 2 - 1) - lp);
                hp = 0.85 * (hp + lp - prev); prev = lp;
                const tone = sin1(ph) + 0.22 * sin1(2 * ph + 0.1) + 0.07 * sin1(3 * ph + 0.2);
                data[j] += attack * rel * (tone + breath * hp * (0.6 + 0.4 * (1 - grow)));
            }
        }
        // Percussió afinada amb parcials inharmònics: campana de temple,
        // capsa de música, celesta i campanetes.
        function struck(start, midi, vel, ratios, amps, taus, o) {
            const p = o || {};
            const f0 = midiHz(midi) / sr, K = ratios.length;
            const env = new Float64Array(K), ks = new Float64Array(K);
            // Cap parcial per sobre de Nyquist (sonaria com un xiulet replegat).
            for (let k = 0; k < K; k++) { env[k] = f0 * ratios[k] < 0.45 ? amps[k] * vel * (p.gain || 0.1) : 0; ks[k] = decay(taus[k]); }
            const n = Math.round((p.len || Math.max(...taus) * 3.5) * sr), kA = decay(p.attack || 0.0015);
            const tr = (p.trem || 0) / sr;
            let j = at(start), atk = 1, live = K;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                if ((i & 255) === 0) { while (live > 1 && env[live - 1] < 2e-5) live--; if (live === 1 && env[0] < 2e-5) break; }
                atk *= kA;
                let sum = 0;
                for (let k = 0; k < live; k++) { env[k] *= ks[k]; sum += env[k] * sin1(f0 * ratios[k] * i + k * 0.13); }
                data[j] += (1 - atk) * (tr ? sum * (1 - 0.15 * (0.5 + 0.5 * sin1(tr * i))) : sum);
            }
        }
        // Bloc de fusta, cop de vora i tambor de mà: sinus esmorteït amb un
        // bri de soroll a l'atac.
        function block(start, vel, hz, tau, noise = 0.2) {
            const f = hz / sr, kE = decay(tau), kN = decay(0.004), kA = decay(0.0008), n = Math.round(tau * 7 * sr);
            let j = at(start), env = vel * 0.12, nz = noise, atk = 1, lp = 0;
            for (let i = 0; i < n; i++, j++) {
                if (j >= length) j -= length;
                env *= kE; nz *= kN; atk *= kA;
                lp += 0.5 * ((random() * 2 - 1) - lp);
                data[j] += (1 - atk) * env * (sin1(f * i) + nz * lp);
            }
        }
        // Marge fix: el pic queda per sota de 0,72 i el volum mitjà és el de
        // la sintonia suau, perquè totes les melodies sonin igual de fort.
        function finish(targetRms) {
            let peak = 0, sum = 0;
            for (let i = 0; i < length; i++) { const v = data[i]; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
            const rms = Math.sqrt(sum / length);
            let k = peak > 0 ? 0.72 / peak : 0;
            if (targetRms && rms > 0) k = Math.min(k, targetRms / rms);
            for (let i = 0; i < length; i++) data[i] *= k;
            return data;
        }
        return { sr, length, data, epiano, pad, strings, bass, vibes, kick, brush, pluck, flute, struck, block, finish };
    }

    function themeScore(syn) {
        const { epiano, pad, bass, vibes, kick, brush } = syn;
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
        // La sintonia només s'ajusta pel pic (és la referència de volum).
        return null;
    }
    // Volum mitjà de referència (el de la sintonia suau amb el pic a 0,72).
    const TARGET_RMS = 0.105;

    // ── Jardí oriental ───────────────────────────────────────────────────
    // Escala japonesa «in» (miyako-bushi) sobre re: re · mi♭ · sol · la · si♭.
    // Koto amb arpegis i notes doblegades, flauta de bambú (shakuhachi) amb
    // entrades lliscades, bordó de quinta buida, campana de temple i bloc de
    // fusta. Deu compassos de 3,2 s (75 ppm).
    const ORIENTAL = {
        beat: 0.8,
        // Arpegis de koto per compàs: [corxera, nota]. Notes de l'escala in.
        koto: [
            [[0, 62], [1, 69], [2, 74], [3, 70], [4, 69], [6, 67], [7, 63]],
            [[0, 62], [2, 67], [3, 69], [4, 74], [5, 75], [6, 74]],
            [[0, 57], [1, 62], [2, 67], [3, 69], [4, 70], [6, 69], [7, 67]],
            [[0, 63], [2, 62], [3, 57], [4, 55], [6, 57]],
            [[0, 62], [1, 69], [2, 74], [3, 75], [4, 79], [6, 75], [7, 74]],
            [[0, 62], [1, 67], [2, 70], [3, 69], [4, 67], [6, 63]],
            [[0, 55], [1, 62], [2, 63], [3, 67], [4, 69], [5, 70], [6, 74]],
            [[0, 75], [1, 74], [2, 70], [3, 69], [4, 67], [6, 63], [7, 62]],
            [[0, 57], [2, 62], [3, 63], [4, 67], [6, 69]],
            [[0, 62], [2, 69], [4, 63], [5, 62], [6, 57]]
        ],
        // Flauta: [compàs, temps, nota, durada en temps, lliscada en cents].
        flute: [
            [0, 1, 74, 2.5, -80], [1, 0, 75, 1, 0], [1, 1, 74, 2, -40], [1, 3, 70, 1, 0],
            [2, 0, 69, 3, -60], [3, 0, 67, 1.5, 0], [3, 1.5, 69, 2.5, -50],
            [5, 1, 79, 2, -90], [5, 3, 75, 1, 0], [6, 0, 74, 3, -40], [6, 3, 75, 1, 0],
            [7, 0, 74, 1, 0], [7, 1, 70, 2, -60], [8, 0, 69, 2, -40], [8, 2, 67, 2, 0],
            [9, 0, 62, 3.5, -70]
        ]
    };
    function orientalScore(syn) {
        const beat = ORIENTAL.beat, bar = beat * 4, eighth = beat / 2;
        const kotoTone = { decay: 1.1, partials: [1, 0.55, 0.3, 0.18, 0.08], damp: 1.1, gain: 0.13 };
        ORIENTAL.koto.forEach((notes, b) => {
            const t0 = b * bar;
            notes.forEach(([e, n], k) => {
                // Algunes notes es doblegen cap amunt (oshi-de) i vibren.
                const bent = (b + k) % 4 === 1;
                syn.pluck(t0 + e * eighth, n, k === 0 ? 1 : 0.75, Object.assign({}, kotoTone,
                    { bend: bent ? 70 : 0, vib: bent ? 0.35 : 0.12, vibRate: 6 }));
            });
            // Bordó de quinta buida (re-la) que no s'atura mai.
            syn.pad(t0, 50, bar, 0.016, 1.2);
            syn.pad(t0, 57, bar, 0.012, 1.2);
            // Bloc de fusta suau al tercer temps, tambor de mà al primer.
            syn.block(t0, 0.9, 140, 0.09, 0.1);
            syn.block(t0 + 2 * beat, 0.45, 920, 0.03, 0.3);
            if (b % 2) syn.block(t0 + 3.5 * beat, 0.3, 980, 0.025, 0.3);
        });
        ORIENTAL.flute.forEach(([b, t, n, dur, slide]) => syn.flute(b * bar + t * beat, n, dur * beat - 0.05, 1,
            { slide, breath: 0.32, vib: 0.28, vibRate: 4.6, attack: 0.14, gain: 0.085, release: 0.18 }));
        // Campana de temple: parcials inharmònics llargs.
        [0, 5].forEach(b => syn.struck(b * bar, 62, 1, [1, 2.01, 2.76, 4.07, 5.4], [1, 0.5, 0.42, 0.22, 0.12],
            [4, 2.5, 1.8, 1.1, 0.7], { gain: 0.07, len: 8 }));
        return TARGET_RMS;
    }

    // ── Bossa del tauler ─────────────────────────────────────────────────
    // Bossa nova a 120 ppm: guitarra de niló amb el polze al baix i els acords
    // sincopats, flauta, maraca en semicorxeres i cop de vora seguint la
    // clave. Setze compassos de 2 s: Re m9 · Sol13 · Do7M(9) · La7(♭13), dues voltes.
    const BOSSA = {
        beat: 0.5,
        chords: [
            { root: 38, fifth: 45, notes: [53, 57, 60, 64] },   // Re m9
            { root: 43, fifth: 38, notes: [53, 59, 64, 65] },   // Sol13
            { root: 36, fifth: 43, notes: [52, 55, 59, 62] },   // Do7M(9)
            { root: 45, fifth: 40, notes: [55, 61, 65, 67] }    // La7(♭13)
        ],
        // Cops d'acord per compàs (en corxeres): patró de dos compassos.
        comp: [[0, 3, 6], [2, 5]],
        clave: [[0, 3, 6], [2, 4]],
        // Melodia de flauta: [compàs, corxera, nota, durada en corxeres].
        melody: [
            [0, 1, 76, 2], [0, 3, 74, 1], [0, 4, 72, 3], [1, 0, 71, 2], [1, 2, 74, 2], [1, 4, 77, 4],
            [2, 2, 76, 2], [2, 4, 74, 2], [2, 6, 71, 2], [3, 0, 73, 4], [3, 5, 76, 3],
            [4, 1, 77, 2], [4, 3, 76, 1], [4, 4, 74, 3], [5, 0, 72, 2], [5, 2, 71, 2], [5, 4, 67, 4],
            [6, 0, 71, 3], [6, 3, 72, 1], [6, 4, 74, 4], [7, 2, 73, 6],
            [8, 1, 81, 2], [8, 3, 79, 1], [8, 4, 77, 3], [9, 0, 76, 2], [9, 2, 74, 2], [9, 4, 77, 4],
            [10, 2, 79, 2], [10, 4, 76, 2], [10, 6, 74, 2], [11, 0, 73, 3], [11, 4, 69, 4],
            [12, 1, 74, 2], [12, 3, 76, 1], [12, 4, 77, 3], [13, 0, 76, 2], [13, 2, 74, 2], [13, 4, 71, 4],
            [14, 0, 72, 3], [14, 3, 71, 1], [14, 4, 69, 4], [15, 0, 73, 6]
        ]
    };
    function bossaScore(syn) {
        const beat = BOSSA.beat, bar = beat * 4, eighth = beat / 2;
        const nylon = { decay: 0.9, partials: [1, 0.5, 0.28, 0.14], damp: 1.3, gain: 0.1, attack: 0.004 };
        for (let b = 0; b < 16; b++) {
            const t0 = b * bar, chord = BOSSA.chords[b % 4];
            // Polze: fonamental al primer temps i quinta al tercer.
            syn.pluck(t0, chord.root + 12, 1, { decay: 0.8, partials: [1, 0.6, 0.3], damp: 1, gain: 0.12, attack: 0.004 });
            syn.pluck(t0 + 2 * beat, chord.fifth + 12, 0.85, { decay: 0.8, partials: [1, 0.6, 0.3], damp: 1, gain: 0.12, attack: 0.004 });
            syn.bass(t0, chord.root, 0.4, 0.5);
            syn.bass(t0 + 2 * beat, chord.fifth, 0.32, 0.5);
            // Acords rasguejats (cada corda una mica després de l'anterior).
            BOSSA.comp[b % 2].forEach(e => chord.notes.forEach((n, k) =>
                syn.pluck(t0 + e * eighth + k * 0.008, n + 12, 0.55, nylon)));
            // Coixí molt suau perquè mai no quedi buit.
            chord.notes.forEach(n => syn.pad(t0, n, bar, 0.006, 0.4));
            // Maraca (semicorxeres) i cop de vora (clave).
            for (let s16 = 0; s16 < 8; s16++) syn.brush(t0 + s16 * beat / 2, s16 % 2 ? 0.28 : 0.45, 0.018, true);
            BOSSA.clave[b % 2].forEach(e => syn.block(t0 + e * eighth, 0.45, 1750, 0.012, 0.6));
        }
        BOSSA.melody.forEach(([b, e, n, d]) => syn.flute(b * bar + e * eighth, n, d * eighth - 0.03, 0.9,
            { breath: 0.1, vib: 0.18, vibRate: 5.2, attack: 0.05, gain: 0.07 }));
        return TARGET_RMS;
    }

    // ── Vals de la capsa de música ───────────────────────────────────────
    // Tres temps a 90 ppm: capsa de música a la melodia, pizzicato «um-pa-pa»
    // i cordes llargues. Setze compassos de 2 s en sol major.
    const VALS = {
        beat: 2 / 3,
        chords: [
            { root: 43, notes: [59, 62, 67] },   // Sol
            { root: 40, notes: [59, 64, 67] },   // Mi m
            { root: 36, notes: [60, 64, 67] },   // Do
            { root: 38, notes: [60, 62, 66] },   // Re7
            { root: 43, notes: [59, 62, 67] },   // Sol
            { root: 47, notes: [59, 62, 66] },   // Si m
            { root: 36, notes: [60, 64, 67] },   // Do
            { root: 38, notes: [57, 62, 66] },   // Re
            { root: 40, notes: [59, 64, 67] },   // Mi m
            { root: 45, notes: [60, 64, 69] },   // La m
            { root: 38, notes: [60, 62, 66] },   // Re7
            { root: 43, notes: [59, 62, 67] },   // Sol
            { root: 36, notes: [60, 64, 67] },   // Do
            { root: 36, notes: [60, 63, 67] },   // Do m
            { root: 38, notes: [57, 60, 66] },   // Re7
            { root: 43, notes: [59, 62, 67] }    // Sol
        ],
        // [compàs, temps, nota, durada en temps]
        melody: [
            [0, 0, 79, 2], [0, 2, 78, 1], [1, 0, 76, 2], [1, 2, 79, 1], [2, 0, 84, 2], [2, 2, 83, 1], [3, 0, 81, 3],
            [4, 0, 79, 1], [4, 1, 83, 1], [4, 2, 86, 1], [5, 0, 86, 2], [5, 2, 83, 1], [6, 0, 84, 1], [6, 1, 83, 1], [6, 2, 81, 1],
            [7, 0, 78, 3],
            [8, 0, 79, 2], [8, 2, 83, 1], [9, 0, 84, 2], [9, 2, 81, 1], [10, 0, 78, 1], [10, 1, 81, 1], [10, 2, 84, 1],
            [11, 0, 83, 3], [12, 0, 88, 2], [12, 2, 84, 1], [13, 0, 87, 2], [13, 2, 84, 1], [14, 0, 81, 1], [14, 1, 84, 1],
            [14, 2, 78, 1], [15, 0, 79, 2.5]
        ]
    };
    function valsScore(syn) {
        const beat = VALS.beat, bar = beat * 3;
        const pizz = { decay: 0.28, partials: [1, 0.5, 0.3, 0.15], damp: 0.9, gain: 0.13, attack: 0.003 };
        VALS.chords.forEach((chord, b) => {
            const t0 = b * bar;
            syn.pluck(t0, chord.root + 12, 1, Object.assign({}, pizz, { decay: 0.4, gain: 0.16 }));
            syn.bass(t0, chord.root, 0.5, 0.45);
            [1, 2].forEach(t => chord.notes.forEach((n, k) => syn.pluck(t0 + t * beat + k * 0.006, n, t === 1 ? 0.6 : 0.5, pizz)));
            chord.notes.forEach(n => syn.strings(t0, n, bar, 0.0085, 0.6));
        });
        // Capsa de música: llengüetes metàl·liques (parcials 1 · 3 · 5,8 · 9,2).
        VALS.melody.forEach(([b, t, n, d]) => {
            syn.struck(b * bar + t * beat, n, 1, [1, 3.01, 5.8, 9.2], [1, 0.3, 0.12, 0.05], [Math.min(1.6, 0.6 + d * 0.3), 0.5, 0.25, 0.12],
                { gain: 0.11, trem: 0 });
            // Una octava avall, molt suau, per fer-la més rodona.
            syn.struck(b * bar + t * beat + 0.004, n - 12, 0.4, [1, 2.0, 3.0], [1, 0.25, 0.08], [1.2, 0.5, 0.3], { gain: 0.08 });
        });
        return TARGET_RMS;
    }

    // ── Capvespre ────────────────────────────────────────────────────────
    // Ambient tranquil a 60 ppm: cordes amples, arpa en arpegis de corxeres,
    // campanetes esparses i un baix que respira. Vuit compassos de 4 s:
    // La m(9) · Fa7M · Do · Sol/Si · La m · Fa7M · Re m9 · Mi sus4 → Mi.
    const CAPVESPRE = {
        beat: 1,
        chords: [
            { root: 45, pad: [57, 60, 64, 71], arp: [57, 64, 69, 71, 72, 71, 69, 64] },
            { root: 41, pad: [57, 60, 64, 65], arp: [53, 60, 64, 69, 72, 69, 64, 60] },
            { root: 36, pad: [55, 60, 64, 67], arp: [48, 55, 64, 67, 72, 67, 64, 55] },
            { root: 47, pad: [55, 59, 62, 67], arp: [47, 55, 62, 67, 71, 67, 62, 55] },
            { root: 45, pad: [57, 60, 64, 69], arp: [57, 64, 69, 72, 76, 72, 69, 64] },
            { root: 41, pad: [57, 60, 64, 65], arp: [53, 60, 65, 69, 72, 69, 65, 60] },
            { root: 38, pad: [57, 60, 64, 65], arp: [50, 57, 64, 65, 69, 65, 64, 57] },
            { root: 40, pad: [56, 59, 64, 71], arp: [52, 59, 64, 69, 71, 68, 64, 59] }
        ],
        // Campanetes: [compàs, temps, nota]
        bells: [[0, 1, 88], [0, 2.5, 84], [1, 1.5, 81], [2, 0.5, 84], [2, 2, 88], [3, 1, 86], [3, 3, 83],
            [4, 1, 88], [4, 2.5, 91], [5, 1.5, 89], [6, 0.5, 88], [6, 2, 84], [7, 1, 83], [7, 2.5, 80]]
    };
    function capvespreScore(syn) {
        const beat = CAPVESPRE.beat, bar = beat * 4, eighth = beat / 2;
        const harp = { decay: 1.5, partials: [1, 0.35, 0.18, 0.06], damp: 1.4, gain: 0.11, attack: 0.003 };
        CAPVESPRE.chords.forEach((chord, b) => {
            const t0 = b * bar;
            chord.pad.forEach(n => syn.strings(t0, n, bar, 0.011, 1.4));
            chord.arp.forEach((n, k) => syn.pluck(t0 + k * eighth, n + 12, k % 4 === 0 ? 0.9 : 0.65, harp));
            syn.bass(t0, chord.root, 0.7, 1.4);
            syn.bass(t0 + 2.5 * beat, chord.root + 12, 0.35, 0.8);
        });
        CAPVESPRE.bells.forEach(([b, t, n]) => syn.struck(b * bar + t * beat, n, 0.9, [1, 2.76, 5.4], [1, 0.3, 0.1],
            [1.4, 0.6, 0.3], { gain: 0.07, trem: 3.5 }));
        return TARGET_RMS;
    }

    const SCORES = { theme: themeScore, oriental: orientalScore, bossa: bossaScore, vals: valsScore, capvespre: capvespreScore };
    const INSTRUMENTS = ['epiano', 'pad', 'strings', 'bass', 'vibes', 'kick', 'brush', 'pluck', 'flute', 'struck', 'block'];
    // Mostres d'una melodia (Float32Array, 32 s, a `sampleRate`). No hi ha
    // enregistraments, veus ni xarxa: tot es calcula aquí.
    function samples(melody, sampleRate = 22050, random = Math.random) {
        const syn = createSynth(sampleRate, MELODY_SECONDS, random);
        return syn.finish(SCORES[melodyId(melody)](syn));
    }
    // El mateix càlcul a trossos de pocs mil·lisegons (nota a nota), perquè
    // generar una melodia nova a cada partida no deixi la pantalla glaçada.
    // El resultat és idèntic al de samples() amb la mateixa font d'atzar.
    function samplesAsync(melody, sampleRate = 22050, random = Math.random, opts = {}) {
        const syn = createSynth(sampleRate, MELODY_SECONDS, random), jobs = [], score = {};
        INSTRUMENTS.forEach(name => { score[name] = (...args) => { jobs.push(() => syn[name](...args)); }; });
        const target = SCORES[melodyId(melody)](score);
        const budget = opts.budgetMs || 8, clock = opts.now || (() => Date.now());
        const later = opts.later || (fn => setTimeout(fn, 0));
        return new Promise((resolve, reject) => {
            let k = 0;
            const step = () => {
                try {
                    if (opts.cancelled && opts.cancelled()) { reject(new Error('cancelled')); return; }
                    const t0 = clock();
                    do { jobs[k++](); } while (k < jobs.length && clock() - t0 < budget);
                    if (k < jobs.length) later(step); else resolve(syn.finish(target));
                } catch (err) { reject(err); }
            };
            later(step);
        });
    }
    // Nivell màxim de la música (amb el volum al 100 %): deixa el fons uns
    // 20 dB per sota de Matxa amb el volum per defecte (20 %).
    const LEVEL = 0.35;
    // Mentre parla la veu, el fons baixa a aquesta fracció (com a la ràdio) i
    // torna a pujar a poc a poc quan calla.
    const DUCK = 0.45;
    // Només es guarda la melodia que sona (cada una ocupa uns 2,8 MB).
    let cache = null;
    // env = { createContext, random, sync, onChange(),
    //         generate(melody, sampleRate, random, opts) → Promise }
    // Amb `sync` (o una font d'atzar pròpia) la melodia es genera de cop.
    function createPlayer(env = {}) {
        let context = null, current = null, wanted = normalize(), melody = MELODIES[0].id, active = false, failed = false, ducked = false;
        let cachedBuffer = null, cachedMelody = null, pending = null;
        const sync = !!(env.sync || (env.random && env.random !== Math.random));
        const generate = env.generate || samplesAsync;
        const level = () => wanted.volume / 100 * LEVEL * (ducked ? DUCK : 1);
        const Ctor = root && (root.AudioContext || root.webkitAudioContext);
        const supported = !!(env.createContext || Ctor);
        // fade: en canviar de melodia, l'anterior s'apaga en mig segon.
        function stopSource(fade) {
            if (!current) return;
            const entry = current;
            current = null;
            if (fade && context) {
                try {
                    entry.gain.gain.setTargetAtTime(0, context.currentTime, 0.12);
                    entry.source.onended = () => {
                        try { entry.source.disconnect(); } catch (err) {}
                        try { entry.gain.disconnect(); } catch (err) {}
                    };
                    entry.source.stop(context.currentTime + 0.6);
                    return;
                } catch (err) {}
            }
            try { entry.source.stop(); } catch (err) {}
            try { entry.source.disconnect(); } catch (err) {}
            try { entry.gain.disconnect(); } catch (err) {}
        }
        // Mostres de la melodia si ja hi són; si no, en comença el càlcul (un
        // de sol alhora) i torna null: mentrestant continua l'anterior.
        function readyData(id) {
            if (sync) return samples(id, 22050, env.random || Math.random);
            if (cache && cache.melody === id) return cache.data;
            if (!pending || pending.melody !== id) {
                const job = { melody: id };
                pending = job;
                Promise.resolve().then(() => generate(id, 22050, Math.random, { cancelled: () => pending !== job }))
                    .then(data => {
                        if (pending !== job) return;
                        pending = null;
                        cache = { melody: id, data };
                        if (melody === id) reconcile();
                        if (typeof env.onChange === 'function') { try { env.onChange(); } catch (err) {} }
                    }, () => { if (pending === job) { pending = null; failed = true; } });
            }
            return null;
        }
        function reconcile() {
            if (!active || wanted.sound === 'off' || wanted.volume === 0) { stopSource(); return; }
            if (failed || !context || context.state !== 'running') return;
            try {
                if (!current || current.melody !== melody) {
                    if (cachedMelody !== melody || !cachedBuffer) {
                        const data = readyData(melody);
                        if (!data) {
                            if (current) current.gain.gain.setTargetAtTime(level(), context.currentTime, 0.08);
                            return;
                        }
                        const buffer = context.createBuffer(1, data.length, 22050);
                        buffer.getChannelData(0).set(data);
                        cachedBuffer = buffer; cachedMelody = melody;
                    }
                    const changed = !!current;
                    if (changed) stopSource(true);
                    const source = context.createBufferSource(), gain = context.createGain();
                    current = { source, gain, melody, fadeIn: changed };
                    source.buffer = cachedBuffer;
                    source.loop = true;
                    gain.gain.value = 0;
                    source.connect(gain); gain.connect(context.destination);
                    source.start();
                }
                // Marge de volum per mantenir el fons discret; una melodia nova
                // entra a poc a poc mentre l'anterior s'apaga.
                current.gain.gain.setTargetAtTime(level(), context.currentTime, current.fadeIn ? 0.5 : 0.08);
                current.fadeIn = false;
                failed = false;
            } catch (err) { failed = true; stopSource(); }
        }
        const api = {
            // raw = { sound, volume, melody }: la melodia la tria qui crida
            // (una per partida); si falta, es manté l'anterior.
            update(raw, enabled) {
                wanted = normalize(raw);
                if (raw && raw.melody) melody = melodyId(raw.melody);
                active = !!enabled;
                reconcile();
            },
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
            // Melodia de la partida i melodia que sona de debò ara mateix.
            melody() { return melody; },
            playing() { return current ? current.melody : null; },
            dispose() {
                active = false; pending = null; stopSource();
                cachedBuffer = null; cachedMelody = null;
                const ctx = context; context = null;
                try { if (ctx && ctx.close) Promise.resolve(ctx.close()).catch(() => {}); } catch (err) {}
            }
        };
        return api;
    }
    return { normalize, canPlay, samples, samplesAsync, createPlayer, pickMelody, melodyId, melodyInfo,
        MELODIES, LEVEL, DUCK, TARGET_RMS, THEME_SECONDS, MELODY_SECONDS,
        // Partitures, per als tests.
        _scores: { theme: THEME, oriental: ORIENTAL, bossa: BOSSA, vals: VALS, capvespre: CAPVESPRE } };
});
