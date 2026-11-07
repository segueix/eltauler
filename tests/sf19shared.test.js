const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Stockfish 19 compartit (app.js: sf19Submit): un sol worker per als
// jeroglífics, els exercicis, el taller d'obertures i el Rival Antídot, amb una
// cua de prioritats. Aquí s'executa el planificador real amb un worker fals.
// ---------------------------------------------------------------------------
const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const block = src.slice(src.indexOf('const SF19_PRIORITY = '), src.indexOf('function analyzeHieroFenRobust('));

function load() {
    const log = [];
    const worker = { messages: [], postMessage(m) { this.messages.push(m); if (m === 'stop' && this.onStop) { const f = this.onStop; this.onStop = null; f(); } } };
    const ctx = vm.createContext({ console, Date, Promise, setTimeout, log, worker });
    vm.runInContext(`
        let hieroPendingAnalyses = 0, hieroLastUsedAt = 0, hieroStockfish = worker, disposed = 0;
        async function ensureHieroStockfish() { return true; }
        async function waitHieroStockfishReady() { return true; }
        function disposeHieroStockfish() { disposed++; }
        ${block}
        this.api = { sf19Submit, sf19Cancel, sf19Busy, pending: () => hieroPendingAnalyses, SF19_PRIORITY };
    `, ctx);
    return { api: ctx.api, worker, log };
}
const tick = () => new Promise(r => setTimeout(r, 0));
// Feina que dura fins que algú la deixa acabar (o l'aturen amb 'stop').
function job(worker, name, log) {
    let finish;
    const run = (w, ctl) => new Promise(resolve => {
        log.push('start ' + name);
        finish = v => resolve(v);
        worker.onStop = () => { log.push('stop ' + name); resolve(name + ':parcial'); };
    }).then(v => { log.push('end ' + name + (ctl.preempted() ? ' (aturada)' : '')); return v; });
    return { run, done: v => finish(v) };
}

describe('Stockfish 19 compartit', () => {
    test('les feines passen per ordre de prioritat (i, a igual prioritat, d’arribada)', async () => {
        const { api, worker, log } = load();
        const order = [];
        const mk = name => async () => { order.push(name); await tick(); return name; };
        const first = api.sf19Submit('screen', mk('pantalla-1'));
        api.sf19Submit('background', mk('fons'));
        api.sf19Submit('screen', mk('pantalla-2'));
        const last = api.sf19Submit('play', mk('partida'));
        await Promise.all([first, last]);
        await tick(); await tick(); await tick();
        expect(order).toEqual(['pantalla-1', 'partida', 'pantalla-2', 'fons']);
        expect(api.pending()).toBe(0);
        expect(api.sf19Busy()).toBe(false);
        // Cada feina comença amb el motor net: 'stop' i, després, 'isready'.
        expect(worker.messages.filter(m => m === 'stop').length).toBeGreaterThanOrEqual(4);
    });

    test('una feina de partida atura la de fons, que es torna a fer sencera després', async () => {
        const { api, worker, log } = load();
        const bg = job(worker, 'fons', log);
        let runs = 0;
        const bgPromise = api.sf19Submit('background', (w, ctl) => { runs++; return runs === 1 ? bg.run(w, ctl) : Promise.resolve('fons:sencera'); });
        await tick();
        const play = api.sf19Submit('play', async () => 'jugada');
        expect(await play).toBe('jugada');
        // La de fons no es dona per bona a mitges: es repeteix i torna el resultat sencer.
        expect(await bgPromise).toBe('fons:sencera');
        expect(runs).toBe(2);
        expect(log).toContain('stop fons');
        expect(api.pending()).toBe(0);
    });

    test('la partida no s’atura mai per una feina menys prioritària', async () => {
        const { api, worker, log } = load();
        const p = job(worker, 'partida', log);
        const playPromise = api.sf19Submit('play', (w, ctl) => p.run(w, ctl));
        await tick();
        const screen = api.sf19Submit('screen', async () => 'pantalla');
        await tick();
        expect(log).not.toContain('stop partida');
        p.done('jugada');
        expect(await playPromise).toBe('jugada');
        expect(await screen).toBe('pantalla');
    });

    test('cancel·lar una etiqueta atura la feina en curs i descarta les pendents', async () => {
        const { api, worker, log } = load();
        const a = job(worker, 'antidot-1', log);
        const first = api.sf19Submit('play', (w, ctl) => a.run(w, ctl), { tag: 'antidote' });
        await tick();
        const second = api.sf19Submit('play', async () => 'no hauria de sortir', { tag: 'antidote' });
        api.sf19Cancel('antidote');
        expect(await first).toBeNull();
        expect(await second).toBeNull();
        expect(log).toContain('stop antidot-1');
        await tick();
        expect(api.pending()).toBe(0);
    });
});

describe('qui fa servir el motor compartit', () => {
    test('jeroglífics (fons), exercicis i taller (pantalla), Antídot (partida)', () => {
        expect(src).toMatch(/function analyzeHieroFenRobust\([^)]*priority = 'background'\)/);
        expect(src).toMatch(/analyzeHieroFenRobust\(fen, depth, multiPv, moveTimeMs, shouldAbort, 'screen'\)/);
        expect(src).toMatch(/return sf19Submit\('screen', async worker => \{/);
        expect(src).toMatch(/analyze: \(fen, params\) => sf19AnalyzeForLab\(fen, params\)/);
        expect(src).toMatch(/await sf19Submit\('play', async engine => \{/);
        // Ja no hi ha workers propis per a l'Antídot.
        expect(src).not.toMatch(/new Worker\(ANTIDOTE_STOCKFISH_URL\)/);
    });
});
