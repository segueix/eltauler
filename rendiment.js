// rendiment.js — planificador de la feina en segon pla segons la gamma de l'aparell.
// ============================================================================
// El Tauler fa molta feina sense que l'usuari la demani: generar i certificar
// jeroglífics amb Stockfish 19, partides internes (autojoc), passades després de
// cada partida, preparar exercicis, construir l'índex d'obertures, respostes de
// les partides diàries... En un mòbil de gamma baixa, sumar-ho tot (dos motors
// WebAssembly alhora, anàlisis llargues, el fil principal ocupat) fa que l'app
// vagi a batzegades o que el navegador la mati per memòria.
//
// Aquest mòdul decideix QUAN i QUANTA feina de fons es pot fer:
//   · classifica l'aparell en tres gammes (baixa, mitjana, alta) a partir dels
//     nuclis, la memòria, si és mòbil i una mesura curta de velocitat de JS;
//   · dona un PERFIL per gamma (interval del cicle, feines pesades simultànies,
//     pauses entre feines, temps de motor, mida de la cua, memòria del motor...);
//   · vigila el fil principal (bloquejos i tasques llargues), la memòria i la
//     bateria: amb pressió atura la feina opcional i, si es repeteix, rebaixa la
//     gamma per a la resta de la sessió (i l'endemà comença amb prudència);
//   · reparteix torns de feina pesada (com a màxim N alhora) i allibera els
//     motors que fa estona que no es fan servir.
// L'usuari pot forçar un mode a Configuració: Automàtic, Estalvi (= baixa),
// Equilibrat (= mitjana) o Màxim (= alta).
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerRendiment = api;
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const TIERS = ['baixa', 'mitjana', 'alta'];
    const MODES = {
        auto: { label: 'Automàtic', tier: null },
        estalvi: { label: 'Estalvi', tier: 'baixa' },
        equilibrat: { label: 'Equilibrat', tier: 'mitjana' },
        maxim: { label: 'Màxim', tier: 'alta' }
    };
    const TIER_LABELS = { baixa: 'Gamma baixa', mitjana: 'Gamma mitjana', alta: 'Gamma alta' };
    const MODE_KEY = 'eltauler_cloud_perfMode';        // per aparell: no viatja al núvol
    const BENCH_KEY = 'eltauler_cloud_perfBench';
    const PENALTY_KEY = 'eltauler_cloud_perfPenalty';
    const BENCH_TTL_MS = 7 * 24 * 3600 * 1000;
    const PENALTY_TTL_MS = 24 * 3600 * 1000;

    // Perfils per gamma. «alta» és el comportament que l'app ja tenia en un
    // ordinador; «baixa», el d'un mòbil modest (una sola feina pesada, pauses
    // llargues, un motor petit que s'allibera aviat i res amb la bateria baixa).
    const PROFILES = {
        baixa: {
            bgTickMs: 8000,               // cada quant mira si pot fer feina de fons
            maxHeavyJobs: 1,              // feines pesades (motor) alhora
            quietAfterInputMs: 4000,      // no comença res just després d'un toc
            gapMs: { hiero: 20000, prep: 25000, postgame: 4000, selfplay: 0, opening: 0 },
            lowBattery: 0.35,             // sense carregar i per sota: res d'opcional
            pressureCooldownMs: 90000,    // pausa després d'un bloqueig del fil principal
            strictIdleScreens: true,      // només a pantalles tranquil·les (inici, ajustos...)
            prepEnabled: true,
            openingGraphDelayMs: 15000,
            dailyMoveTimeMs: 2500,
            hiero: {
                queueTarget: 2, mineMoveTimeMs: 250, mineBudgetMs: 25000, seedTries: 2,
                selfPlayAfterMs: 8 * 60000, selfPlayEveryMs: 20 * 60000, selfPlayQueueCap: 6,
                postGamePerGame: 1, hashMb: 8, idleReleaseMs: 45000
            }
        },
        mitjana: {
            bgTickMs: 5000,
            maxHeavyJobs: 1,
            quietAfterInputMs: 2000,
            gapMs: { hiero: 8000, prep: 8000, postgame: 2000, selfplay: 0, opening: 0 },
            lowBattery: 0.25,
            pressureCooldownMs: 45000,
            strictIdleScreens: false,
            prepEnabled: true,
            openingGraphDelayMs: 6000,
            dailyMoveTimeMs: 4000,
            hiero: {
                queueTarget: 3, mineMoveTimeMs: 350, mineBudgetMs: 40000, seedTries: 3,
                selfPlayAfterMs: 5 * 60000, selfPlayEveryMs: 12 * 60000, selfPlayQueueCap: 10,
                postGamePerGame: 2, hashMb: 16, idleReleaseMs: 120000
            }
        },
        alta: {
            bgTickMs: 4000,
            maxHeavyJobs: 2,
            quietAfterInputMs: 800,
            gapMs: { hiero: 1500, prep: 600, postgame: 1000, selfplay: 0, opening: 0 },
            lowBattery: 0.15,
            pressureCooldownMs: 20000,
            strictIdleScreens: false,
            prepEnabled: true,
            openingGraphDelayMs: 4000,
            dailyMoveTimeMs: 4000,
            hiero: {
                queueTarget: 6, mineMoveTimeMs: 400, mineBudgetMs: 50000, seedTries: 4,
                selfPlayAfterMs: 4 * 60000, selfPlayEveryMs: 10 * 60000, selfPlayQueueCap: 12,
                postGamePerGame: 2, hashMb: 16, idleReleaseMs: 300000
            }
        }
    };
    function profileFor(tier) {
        return PROFILES[TIERS.indexOf(tier) >= 0 ? tier : 'mitjana'];
    }
    function lowerTier(tier, steps = 1) {
        const i = Math.max(0, TIERS.indexOf(tier) - steps);
        return TIERS[i];
    }

    // ── Classificació ────────────────────────────────────────────────────────
    // signals: { cores, memoryGb, mobile, benchMs }. Cada senyal dona una nota de
    // 0 (molt justa) a 3 (sobrada); el maquinari mana pel seu punt més feble
    // (nuclis o memòria) i la mesura de velocitat el corregeix. Un ordinador té
    // un punt de marge (refrigeració, bateria, memòria real).
    function classify(signals = {}) {
        const reasons = [];
        const cores = Number(signals.cores) || 0;
        const mem = (typeof signals.memoryGb === 'number' && signals.memoryGb > 0) ? signals.memoryGb : null;
        const bench = (typeof signals.benchMs === 'number' && signals.benchMs > 0) ? signals.benchMs : null;
        const coreScore = !cores ? 1 : cores <= 2 ? 0 : cores <= 4 ? 1 : cores <= 6 ? 2 : 3;
        const memScore = mem === null ? null : mem <= 2 ? 0 : mem <= 3 ? 1 : mem <= 4 ? 2 : 3;
        // Referència: un ordinador fa la prova en 2–4 ms; un mòbil de capçalera,
        // en ~5; un de gamma mitjana, en ~8–12; un de gamma baixa, en 25 o més.
        const benchScore = bench === null ? null : bench >= 25 ? 0 : bench >= 12 ? 1 : bench >= 6 ? 2 : 3;
        reasons.push(cores ? `${cores} nuclis` : 'nuclis desconeguts');
        if (mem !== null) reasons.push(`${mem} GB de memòria`);
        if (bench !== null) reasons.push(`prova de velocitat: ${Math.round(bench)} ms`);
        const hw = memScore === null ? coreScore : Math.min(coreScore, memScore);
        let score = benchScore === null ? hw : (hw + benchScore) / 2;
        if (!signals.mobile) { score += 1; reasons.push('ordinador'); }
        else reasons.push('mòbil o tauleta');
        let tier = score < 1.5 ? 'baixa' : (score < 2.5 ? 'mitjana' : 'alta');
        // Límits durs: la memòria és el que fa que el navegador tanqui l'app (dos
        // motors WebAssembly ja en fan servir molta), i amb dos nuclis el motor i
        // la interfície es barallen pel mateix processador.
        if ((mem !== null && mem <= 2) || (cores && cores <= 2)) tier = 'baixa';
        else if (mem !== null && mem <= 3 && tier === 'alta') tier = 'mitjana';
        return { tier, score, reasons };
    }

    // Prova curta i determinista de velocitat de JavaScript (enters, objectes i
    // ordenació, com el que fa l'app amb chess.js). Retorna ms; la millor de tres.
    function benchmark(nowFn) {
        const now = nowFn || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
        let best = Infinity;
        for (let round = 0; round < 3; round++) {
            const t0 = now();
            let acc = 0;
            const arr = [];
            for (let i = 0; i < 60000; i++) {
                acc = (acc * 31 + i) % 1000003;
                if ((i & 15) === 0) arr.push({ k: acc, s: 'p' + (acc & 63) });
            }
            arr.sort((a, b) => a.k - b.k);
            const map = new Map();
            for (const x of arr) map.set(x.s, (map.get(x.s) || 0) + 1);
            if (map.size < 0) acc++;   // evita que el compilador ho elimini
            best = Math.min(best, now() - t0);
        }
        return Math.max(0.1, best);
    }

    function safeGet(storage, key) { try { return storage ? storage.getItem(key) : null; } catch (e) { return null; } }
    function safeSet(storage, key, value) { try { if (storage) storage.setItem(key, value); } catch (e) {} }

    // ── Planificador ─────────────────────────────────────────────────────────
    // env: { now, storage, navigator, document, performance, isMobile(), setInterval }
    function createScheduler(env = {}) {
        const now = env.now || (() => Date.now());
        const storage = env.storage || null;
        const nav = env.navigator || {};
        const doc = env.document || null;
        const perf = env.performance || null;
        const isMobile = typeof env.isMobile === 'function' ? env.isMobile : () => false;

        let mode = 'auto';
        const saved = safeGet(storage, MODE_KEY);
        if (saved && MODES[saved]) mode = saved;

        let bench = null;
        try {
            const b = JSON.parse(safeGet(storage, BENCH_KEY) || 'null');
            if (b && typeof b.ms === 'number' && now() - (b.at || 0) < BENCH_TTL_MS && b.cores === (nav.hardwareConcurrency || 0)) bench = b.ms;
        } catch (e) {}
        // Rebaixa per pressió: dura la sessió i, si és recent, també la següent.
        let penalty = 0;
        try {
            const p = JSON.parse(safeGet(storage, PENALTY_KEY) || 'null');
            if (p && now() - (p.at || 0) < PENALTY_TTL_MS) penalty = Math.min(1, Number(p.level) || 0);
        } catch (e) {}

        const state = {
            lastInputAt: 0,
            stalls: [],                // [{ at, ms }] bloquejos del fil principal
            pressureUntil: 0,
            pressureEpisodes: [],      // moments d'alta pressió (per rebaixar la gamma)
            battery: null,             // { level, charging }
            memoryRatio: null,
            running: new Map(),        // token -> { kind, at }
            lastEnd: {},               // kind -> ms
            resources: [],             // motors que es poden alliberar
            lastReason: ''
        };
        let tokenSeq = 0;

        function signals() {
            return {
                cores: nav.hardwareConcurrency || 0,
                memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
                mobile: !!isMobile(),
                benchMs: bench
            };
        }
        function detected() { return classify(signals()); }
        function tier() {
            if (mode !== 'auto') return MODES[mode].tier;
            return lowerTier(detected().tier, penalty);
        }
        function profile() { return profileFor(tier()); }
        function setMode(m) {
            if (!MODES[m]) return mode;
            mode = m;
            safeSet(storage, MODE_KEY, m);
            return mode;
        }
        function setBenchmark(ms) {
            bench = ms;
            safeSet(storage, BENCH_KEY, JSON.stringify({ ms, at: now(), cores: nav.hardwareConcurrency || 0 }));
        }
        function setBattery(b) { state.battery = b ? { level: Number(b.level), charging: !!b.charging } : null; }
        function noteInteraction() { state.lastInputAt = now(); }

        // Un bloqueig del fil principal (mesurat pel retard d'un temporitzador o
        // per una tasca llarga). Tres en mig minut, o un de més d'un segon, és
        // pressió alta: pausa la feina opcional. Tres episodis en deu minuts
        // rebaixen la gamma.
        function noteStall(ms) {
            if (!(ms > 0)) return;
            const t = now();
            // El mateix bloqueig pot arribar per dues vies (temporitzador i tasca
            // llarga): si n'hi ha un d'enregistrat fa menys de 300 ms, és el mateix.
            const last = state.stalls[state.stalls.length - 1];
            if (last && t - last.at < 300) {
                last.ms = Math.max(last.ms, ms);
                if (last.ms >= 1000) enterPressure('el fil principal s’ha bloquejat');
                return;
            }
            state.stalls.push({ at: t, ms });
            state.stalls = state.stalls.filter(s => t - s.at < 30000);
            const big = state.stalls.filter(s => s.ms >= 200);
            if (ms >= 1000 || big.length >= 3) enterPressure('el fil principal s’ha bloquejat');
        }
        function enterPressure(reason) {
            const t = now();
            const wasIn = t < state.pressureUntil;
            state.pressureUntil = t + profile().pressureCooldownMs;
            state.lastReason = reason || 'pressió';
            if (wasIn) return;
            state.pressureEpisodes.push(t);
            state.pressureEpisodes = state.pressureEpisodes.filter(x => t - x < 10 * 60000);
            if (mode === 'auto' && penalty < 1 && state.pressureEpisodes.length >= 3) {
                penalty = 1;
                safeSet(storage, PENALTY_KEY, JSON.stringify({ level: 1, at: t }));
                state.pressureEpisodes = [];
            }
            releaseIdle(true);
        }
        function noteMemory(used, limit) {
            if (!(used > 0) || !(limit > 0)) return;
            state.memoryRatio = used / limit;
            if (state.memoryRatio >= 0.85) enterPressure('memòria gairebé plena');
        }
        function underPressure() { return now() < state.pressureUntil; }
        function lowBattery() {
            const b = state.battery;
            return !!(b && !b.charging && Number.isFinite(b.level) && b.level < profile().lowBattery);
        }
        function hidden() { return !!(doc && doc.visibilityState && doc.visibilityState !== 'visible'); }

        // Pot COMENÇAR ara una feina de fons d'aquest tipus? Torna { ok, reason }.
        // opts.force: feina demanada explícitament per l'usuari (no espera torns
        // ni pauses, però compta com a feina en marxa perquè la resta s'esperi).
        function canStart(kind, opts = {}) {
            const p = profile();
            if (opts.force) return { ok: true, reason: '' };
            if (hidden()) return { ok: false, reason: 'l’app no és visible' };
            if (underPressure()) return { ok: false, reason: 'pausa per pressió (' + state.lastReason + ')' };
            if (lowBattery()) return { ok: false, reason: 'bateria baixa' };
            if (kind === 'prep' && !p.prepEnabled) return { ok: false, reason: 'desactivat en aquesta gamma' };
            if (state.running.size >= p.maxHeavyJobs) return { ok: false, reason: 'ja hi ha una feina pesada en marxa' };
            const t = now();
            if (t - state.lastInputAt < p.quietAfterInputMs) return { ok: false, reason: 'l’usuari està interactuant' };
            const gap = (p.gapMs && p.gapMs[kind]) || 0;
            if (gap && state.lastEnd[kind] && t - state.lastEnd[kind] < gap) return { ok: false, reason: 'pausa entre feines' };
            return { ok: true, reason: '' };
        }
        function begin(kind, opts = {}) {
            const c = canStart(kind, opts);
            if (!c.ok) return null;
            const token = ++tokenSeq;
            state.running.set(token, { kind, at: now() });
            return token;
        }
        function end(token) {
            const job = state.running.get(token);
            if (!job) return;
            state.running.delete(token);
            state.lastEnd[job.kind] = now();
        }
        // Una feina en marxa s'ha d'aturar (pressió alta, memòria, bateria o app
        // amagada)? Les feines explícites de l'usuari no ho consulten.
        function mustYield() { return underPressure() || lowBattery() || hidden(); }
        function busy() { return state.running.size > 0; }

        // Motors que es poden tancar quan fa estona que no fan res: { name,
        // lastUsedAt(), busy(), release() }. Amb pressió es tanquen de seguida.
        function registerIdleResource(res) {
            if (res && typeof res.release === 'function') state.resources.push(res);
        }
        function releaseIdle(force = false) {
            const t = now();
            const limit = profile().hiero.idleReleaseMs;
            let released = 0;
            state.resources.forEach(r => {
                try {
                    if (r.busy && r.busy()) return;
                    const last = r.lastUsedAt ? r.lastUsedAt() : 0;
                    if (!last) return;
                    if (force || t - last >= limit) { if (r.release() !== false) released++; }
                } catch (e) {}
            });
            return released;
        }

        function status() {
            const d = detected();
            const t = tier();
            let paused = '';
            if (hidden()) paused = 'l’app no és visible';
            else if (underPressure()) paused = 'pausa per pressió (' + state.lastReason + ')';
            else if (lowBattery()) paused = 'bateria baixa';
            return {
                mode, modeLabel: MODES[mode].label,
                tier: t, tierLabel: TIER_LABELS[t],
                detectedTier: d.tier, detectedLabel: TIER_LABELS[d.tier], reasons: d.reasons,
                penalty, paused, running: Array.from(state.running.values()).map(j => j.kind),
                battery: state.battery, memoryRatio: state.memoryRatio, benchMs: bench
            };
        }

        return {
            signals, detected, tier, profile, mode: () => mode, setMode, setBenchmark, setBattery,
            noteInteraction, noteStall, noteMemory, enterPressure, underPressure, lowBattery,
            canStart, begin, end, mustYield, busy, registerIdleResource, releaseIdle, status,
            _state: state
        };
    }

    // Connecta el planificador al navegador: mesura de velocitat (un cop per
    // setmana), interacció de l'usuari, retard del fil principal, tasques
    // llargues, memòria i bateria. Torna el planificador.
    function start(w) {
        const sched = createScheduler({
            storage: (() => { try { return w.localStorage; } catch (e) { return null; } })(),
            navigator: w.navigator, document: w.document, performance: w.performance,
            isMobile: () => {
                const b = w.document && w.document.body;
                const dev = b && b.dataset && b.dataset.device;
                if (dev) return dev === 'mobile' || dev === 'tablet';
                return !!(w.matchMedia && w.matchMedia('(pointer: coarse)').matches);
            }
        });
        const doc = w.document;
        const onInput = () => sched.noteInteraction();
        ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => {
            try { doc.addEventListener(ev, onInput, { passive: true, capture: true }); } catch (e) {}
        });
        // Retard del temporitzador: si un tic de 250 ms arriba molt tard amb l'app
        // visible, el fil principal ha estat bloquejat aquell temps (un tic curt
        // mesura gairebé tot el bloqueig; un d'un segon se'n menjava la meitat).
        const SAMPLE_MS = 250;
        let expected = Date.now() + SAMPLE_MS;
        let ticks = 0;
        w.setInterval(() => {
            const t = Date.now();
            const lag = t - expected;
            expected = t + SAMPLE_MS;
            if (doc.visibilityState === 'visible' && lag > 150 && lag < 10000) sched.noteStall(lag);
            if ((++ticks & 3) !== 0) return;   // la memòria, un cop per segon
            try {
                const m = w.performance && w.performance.memory;
                if (m && m.jsHeapSizeLimit) sched.noteMemory(m.usedJSHeapSize, m.jsHeapSizeLimit);
            } catch (e) {}
        }, SAMPLE_MS);
        // Allibera motors inactius cada 15 s.
        w.setInterval(() => { try { sched.releaseIdle(false); } catch (e) {} }, 15000);
        try {
            if (typeof w.PerformanceObserver === 'function') {
                const po = new w.PerformanceObserver(list => {
                    list.getEntries().forEach(e => { if (e.duration >= 200) sched.noteStall(e.duration); });
                });
                const types = (w.PerformanceObserver.supportedEntryTypes || ['longtask'])
                    .filter(x => x === 'longtask' || x === 'long-animation-frame');
                // Cada tipus en un observador propi: alguns navegadors no accepten
                // la llista sencera si un dels tipus no hi és.
                types.forEach((type, i) => {
                    const obs = i === 0 ? po : new w.PerformanceObserver(list => {
                        list.getEntries().forEach(e => { if (e.duration >= 200) sched.noteStall(e.duration); });
                    });
                    try { obs.observe({ type, buffered: false }); } catch (e) {}
                });
            }
        } catch (e) {}
        try {
            if (w.navigator && w.navigator.getBattery) {
                w.navigator.getBattery().then(b => {
                    const upd = () => sched.setBattery({ level: b.level, charging: b.charging });
                    upd();
                    b.addEventListener('levelchange', upd);
                    b.addEventListener('chargingchange', upd);
                }).catch(() => {});
            }
        } catch (e) {}
        // La prova de velocitat es fa amb l'app en repòs, un cop per setmana.
        if (sched.signals().benchMs === null) {
            const run = () => { try { sched.setBenchmark(benchmark()); } catch (e) {} };
            const idle = w.requestIdleCallback ? (fn) => w.requestIdleCallback(fn, { timeout: 8000 }) : (fn) => w.setTimeout(fn, 3000);
            w.setTimeout(() => idle(run), 2500);
        }
        return sched;
    }

    return Object.freeze({ VERSION, TIERS, MODES, TIER_LABELS, PROFILES, profileFor, lowerTier, classify, benchmark, createScheduler, start });
});
