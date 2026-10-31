// Planificador de la feina en segon pla segons la gamma de l'aparell (rendiment.js).
const fs = require('fs');
const R = require('../rendiment');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function memStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function sched(opts = {}) {
    let t = opts.t0 || 1000000;
    const doc = { visibilityState: 'visible' };
    const storage = opts.storage || memStorage();
    const s = R.createScheduler({
        now: () => t, storage, document: doc,
        navigator: Object.assign({ hardwareConcurrency: 8, deviceMemory: 8 }, opts.nav || {}),
        isMobile: () => opts.mobile !== false
    });
    if (opts.benchMs) s.setBenchmark(opts.benchMs);
    return { s, doc, storage, advance: ms => { t += ms; }, now: () => t };
}

describe('classificació per gammes', () => {
    test('mòbil modest (2–3 GB, lent) és gamma baixa', () => {
        expect(R.classify({ cores: 8, memoryGb: 2, mobile: true, benchMs: 70 }).tier).toBe('baixa');
        expect(R.classify({ cores: 4, memoryGb: 3, mobile: true, benchMs: 45 }).tier).toBe('baixa');
        expect(R.classify({ cores: 2, mobile: true }).tier).toBe('baixa');
    });
    test('mòbil normal és gamma mitjana; un de capçalera, alta', () => {
        expect(R.classify({ cores: 8, memoryGb: 4, mobile: true, benchMs: 22 }).tier).toBe('mitjana');
        expect(R.classify({ cores: 8, memoryGb: 8, mobile: true, benchMs: 8 }).tier).toBe('alta');
        // Safari no diu la memòria: manen els nuclis i la prova de velocitat.
        expect(R.classify({ cores: 6, mobile: true, benchMs: 4 }).tier).toBe('alta');
    });
    test('un ordinador té un punt de marge', () => {
        expect(R.classify({ cores: 4, memoryGb: 8, mobile: false, benchMs: 5 }).tier).toBe('alta');
        expect(R.classify({ cores: 4, memoryGb: 8, mobile: true, benchMs: 5 }).tier).toBe('mitjana');
    });
    test('amb 2 GB de memòria o dos nuclis sempre és gamma baixa; amb 3 GB, com a molt mitjana', () => {
        expect(R.classify({ cores: 8, memoryGb: 2, mobile: true, benchMs: 2 }).tier).toBe('baixa');
        expect(R.classify({ cores: 2, memoryGb: 8, mobile: false, benchMs: 2 }).tier).toBe('baixa');
        expect(R.classify({ cores: 8, memoryGb: 3, mobile: false, benchMs: 2 }).tier).toBe('mitjana');
    });
    test('la prova de velocitat retorna un temps positiu', () => {
        expect(R.benchmark()).toBeGreaterThan(0);
    });
    test('els perfils es fan més prudents com més baixa és la gamma', () => {
        const [b, m, a] = R.TIERS.map(R.profileFor);
        expect(b.bgTickMs).toBeGreaterThan(m.bgTickMs);
        expect(m.bgTickMs).toBeGreaterThanOrEqual(a.bgTickMs);
        expect(b.maxHeavyJobs).toBe(1);
        expect(a.maxHeavyJobs).toBeGreaterThan(b.maxHeavyJobs);
        expect(b.quietAfterInputMs).toBeGreaterThan(a.quietAfterInputMs);
        expect(b.lowBattery).toBeGreaterThan(a.lowBattery);
        expect(b.hiero.hashMb).toBeLessThan(a.hiero.hashMb);
        expect(b.hiero.idleReleaseMs).toBeLessThan(a.hiero.idleReleaseMs);
        expect(b.hiero.selfPlayEveryMs).toBeGreaterThan(a.hiero.selfPlayEveryMs);
        expect(b.hiero.queueTarget).toBeLessThan(a.hiero.queueTarget);
        expect(b.hiero.mineBudgetMs).toBeLessThan(a.hiero.mineBudgetMs);
        expect(b.strictIdleScreens).toBe(true);
    });
});

describe('planificador', () => {
    test('mode forçat a Configuració i desat per aparell', () => {
        const { s, storage } = sched({ benchMs: 8 });
        expect(s.tier()).toBe('alta');
        s.setMode('estalvi');
        expect(s.tier()).toBe('baixa');
        expect(storage.getItem(R.createScheduler && 'eltauler_cloud_perfMode')).toBe('estalvi');
        const again = sched({ storage, benchMs: 8 }).s;
        expect(again.mode()).toBe('estalvi');
        expect(again.setMode('inventat')).toBe('estalvi');
    });

    test('en gamma baixa només hi ha una feina pesada alhora; en alta, dues', () => {
        const low = sched({ nav: { deviceMemory: 2 }, benchMs: 80 }).s;
        expect(low.tier()).toBe('baixa');
        const a = low.begin('hiero');
        expect(a).toBeTruthy();
        expect(low.canStart('prep')).toEqual({ ok: false, reason: 'ja hi ha una feina pesada en marxa' });
        low.end(a);
        const high = sched({ benchMs: 8 }).s;
        const h1 = high.begin('hiero'), h2 = high.begin('prep');
        expect(h1 && h2).toBeTruthy();
        expect(high.canStart('opening').ok).toBe(false);
        // La feina demanada per l'usuari no espera torn.
        expect(high.begin('hiero', { force: true })).toBeTruthy();
    });

    test('no comença res just després d\'un toc i respecta la pausa entre feines', () => {
        const env = sched({ nav: { deviceMemory: 2 }, benchMs: 80 });
        const { s } = env;
        s.noteInteraction();
        expect(s.canStart('hiero').reason).toBe('l’usuari està interactuant');
        env.advance(R.profileFor('baixa').quietAfterInputMs + 1);
        const tok = s.begin('hiero');
        s.end(tok);
        expect(s.canStart('hiero').reason).toBe('pausa entre feines');
        env.advance(R.profileFor('baixa').gapMs.hiero + 1);
        expect(s.canStart('hiero').ok).toBe(true);
    });

    test('app amagada o bateria baixa: res d\'opcional, i la feina en marxa cedeix', () => {
        const env = sched({ benchMs: 20, nav: { deviceMemory: 4 } });
        const { s, doc } = env;
        expect(s.tier()).toBe('mitjana');
        doc.visibilityState = 'hidden';
        expect(s.canStart('hiero').ok).toBe(false);
        expect(s.mustYield()).toBe(true);
        doc.visibilityState = 'visible';
        s.setBattery({ level: 0.2, charging: false });
        expect(s.canStart('selfplay').reason).toBe('bateria baixa');
        s.setBattery({ level: 0.2, charging: true });
        expect(s.canStart('selfplay').ok).toBe(true);
        s.setBattery({ level: 0.3, charging: false });
        expect(s.canStart('selfplay').ok).toBe(true);   // en mitjana el llindar és 25 %
    });

    test('bloquejos del fil principal: pausa, allibera motors i, si es repeteix, rebaixa la gamma', () => {
        const env = sched({ benchMs: 8 });
        const { s, storage } = env;
        let released = 0;
        s.registerIdleResource({ name: 'motor', lastUsedAt: () => env.now() - 1000, busy: () => false, release: () => { released++; } });
        expect(s.tier()).toBe('alta');
        s.noteStall(1200);
        expect(s.underPressure()).toBe(true);
        expect(s.canStart('hiero').ok).toBe(false);
        expect(released).toBe(1);   // amb pressió es tanquen els motors inactius de seguida
        for (let i = 0; i < 2; i++) {
            env.advance(R.profileFor(s.tier()).pressureCooldownMs + 1);
            s.noteStall(250); env.advance(1000); s.noteStall(250); env.advance(1000); s.noteStall(250);
        }
        expect(s.tier()).toBe('mitjana');
        expect(s.status().penalty).toBe(1);
        // L'endemà encara hi és (24 h) i després es recupera.
        const next = sched({ storage, benchMs: 8, t0: env.now() + 3600 * 1000 }).s;
        expect(next.tier()).toBe('mitjana');
        const later = sched({ storage, benchMs: 8, t0: env.now() + 25 * 3600 * 1000 }).s;
        expect(later.tier()).toBe('alta');
    });

    test('un mateix bloqueig avisat per dues vies només compta un cop', () => {
        const env = sched({ benchMs: 3 });
        env.s.noteStall(300); env.advance(5); env.s.noteStall(320);
        expect(env.s._state.stalls).toHaveLength(1);
        env.advance(1000); env.s.noteStall(300);
        expect(env.s._state.stalls).toHaveLength(2);
        expect(env.s.underPressure()).toBe(false);
        env.advance(1000); env.s.noteStall(300);
        expect(env.s.underPressure()).toBe(true);   // tres bloquejos de debò en mig minut
    });

    test('memòria gairebé plena és pressió', () => {
        const { s } = sched({ benchMs: 8 });
        s.noteMemory(50, 100);
        expect(s.underPressure()).toBe(false);
        s.noteMemory(90, 100);
        expect(s.underPressure()).toBe(true);
    });

    test('els motors inactius es tanquen al cap del temps de la gamma, mai si treballen', () => {
        const env = sched({ nav: { deviceMemory: 2 }, benchMs: 80 });
        const { s } = env;
        let busy = true, released = 0, last = env.now();
        s.registerIdleResource({ name: 'm', lastUsedAt: () => last, busy: () => busy, release: () => { released++; } });
        env.advance(R.profileFor('baixa').hiero.idleReleaseMs + 1);
        expect(s.releaseIdle()).toBe(0);
        busy = false;
        expect(s.releaseIdle()).toBe(1);
        expect(released).toBe(1);
    });

    test('estat llegible per a Configuració', () => {
        const { s } = sched({ nav: { deviceMemory: 2 }, benchMs: 80 });
        const st = s.status();
        expect(st.tierLabel).toBe('Gamma baixa');
        expect(st.reasons.join(' ')).toContain('2 GB');
        expect(st.modeLabel).toBe('Automàtic');
    });
});

describe('integració a l\'app', () => {
    test('totes les feines pesades de fons passen pel planificador', () => {
        expect(source).toContain("perf().begin('hiero', { force: true })");
        expect(source).toContain("perf().begin('postgame', { force: true })");
        expect(source).toContain("perf().begin('selfplay')");
        expect(source).toContain("perf().begin('prep')");
        expect(source).toContain("perf().canStart('hiero').ok");
        expect(source).toContain("perf().canStart('postgame').ok");
        expect(source).toMatch(/scheduleBackgroundLoop[\s\S]{0,200}bgTickMs/);
        expect(source).not.toContain('setInterval(backgroundPrepTick, 4000)');
        expect(source).toContain("registerIdleResource({\n        name: 'hiero-sf19'");
        expect(source).toContain("setoption name Hash value ' + ((perfProfile().hiero");
        expect(source).toContain('movetime ${perfProfile().dailyMoveTimeMs || 4000}');
    });
    test('Configuració ofereix els quatre modes', () => {
        const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
        ['auto', 'estalvi', 'equilibrat', 'maxim'].forEach(m => expect(html).toContain(`<option value="${m}"`));
        expect(html).toContain('id="perf-mode-select"');
        expect(html.indexOf('rendiment.js')).toBeLessThan(html.indexOf('app.js?v='));
    });
});
