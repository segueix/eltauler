// Fa jugar el rival REAL de l'app (Chromium) a posicions reals de Lichess i
// avalua amb Stockfish 19 (mateixa profunditat, searchmoves) la jugada de la
// persona i la del rival.
//
// Ús (des de l'arrel del repo, amb els CDN a .cache/cdn com a scripts/mine-hieroglyphics.js):
//   node scripts/rellotge-lichess/bench.js sample.jsonl sortida.jsonl <ritmes separats per comes> <per_cel·la> [slots] [profunditat_jutge]
// El rival juga al MATEIX ELO que la persona que tenia el torn (ROC màxim 2000;
// la franja >=2200 queda fora).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..', '..');
const CACHE = path.join(ROOT, '.cache', 'cdn');
const [SAMPLE, OUT, TCS_ARG, PER_CELL_ARG, SLOTS_ARG, REF_DEPTH_ARG] = process.argv.slice(2);
const TCS = TCS_ARG.split(',');
const PER_CELL = parseInt(PER_CELL_ARG, 10);
const SLOTS = parseInt(SLOTS_ARG || '4', 10);
const REF_DEPTH = parseInt(REF_DEPTH_ARG || '14', 10);
const SKIP_BANDS = new Set(['>=2200']);

function serve() {
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
    // Mostra: PER_CELL posicions per ritme i franja (en l'ordre del fitxer, que ja és aleatori).
    const all = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const cells = {};
    const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
    const todo = [];
    all.forEach((r, i) => {
        r.id = `${r.tc}|${r.band}|${i}`;
        if (!TCS.includes(r.tc) || SKIP_BANDS.has(r.band)) return;
        const k = r.tc + '|' + r.band;
        cells[k] = (cells[k] || 0) + 1;
        if (cells[k] <= PER_CELL && !done.has(r.id)) todo.push(r);
    });
    // Barreja l'ordre perquè els treballs llargs (ROC alt) es reparteixin.
    for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; }
    console.error(`${todo.length} posicions per fer (${done.size} ja fetes)`);
    const server = await serve();
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const [n, ty] of [['jquery-3.6.0.min.js', 'application/javascript'], ['chess.min.js', 'application/javascript'], ['chessboard-1.0.0.min.js', 'application/javascript'], ['chessboard-1.0.0.min.css', 'text/css']])
        await ctx.route(new RegExp(n.replace(/\./g, '\\.')), r => r.fulfill({ path: path.join(CACHE, n), contentType: ty }));
    await ctx.addInitScript(() => {
        localStorage.setItem('eltauler_cloud_consent', '1');
        localStorage.setItem('chess_calibratgeComplet', 'true');
        localStorage.setItem('eltauler_hieroglyphics_state', JSON.stringify({ settings: { backgroundGeneration: false } }));
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.stack || e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/index.html');
    await page.waitForFunction(() => typeof chooseHumanLikeMove === 'function' && typeof $ === 'function', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(({ slots, refDepth }) => {
        const Core = ElTaulerCore;
        const SHORT = Core.SHORT_CLOCK_LIMITS;
        const INC = { '30s': 0, '1+0': 0, '3+2': 2000, '5+0': 0, '10+0': 0, '15+10': 10000 };
        function mkEngine(url) {
            const w = new Worker(url);
            const eng = { w, listeners: [], caps: {} };
            w.onmessage = e => { const s = String(e.data); eng.listeners.slice().forEach(f => f(s)); };
            eng.send = c => w.postMessage(c);
            eng.until = (pred, onLine) => new Promise(res => {
                const f = s => { if (onLine) onLine(s); if (pred(s)) { eng.listeners.splice(eng.listeners.indexOf(f), 1); res(s); } };
                eng.listeners.push(f);
            });
            return eng;
        }
        async function initEngine(url) {
            const eng = mkEngine(url);
            const ok = eng.until(s => s === 'uciok', s => { if (s.startsWith('option')) eng.caps = Core.engineStrengthOption(eng.caps, s); });
            eng.send('uci'); await ok;
            const rd = eng.until(s => s === 'readyok'); eng.send('isready'); await rd;
            return eng;
        }
        let currentRoc = 1400;
        window.getActiveStrengthElo = () => currentRoc;
        window.__bench = { slots: [], refDepth };
        window.__benchInit = (async () => {
            for (let i = 0; i < slots; i++) {
                window.__bench.slots.push({ rival: await initEngine('stockfish.js'), ref: await initEngine('stockfish-19-lite-single.js') });
            }
        })();
        // Decisió del rival, tal com la fa makeEngineMove (rellotge còmode, sense errada per pressió).
        async function rivalMove(eng, rec, chess) {
            const roc = Math.max(ELO_MIN, Math.min(ELO_MAX, rec.elo));
            currentRoc = roc;
            const fen = chess.fen();
            const depth = Math.max(1, Math.min(15, eloToSearchDepth(roc) + (Math.floor(Math.random() * 3) - 1)));
            Core.nativeStrengthCommands(eng.caps, roc, false).forEach(c => eng.send(c));
            const requestedPv = getEngineMoveMultiPvValue(roc, 5);
            const multiPv = SHORT[rec.tc] ? Math.min(8, requestedPv) : requestedPv;
            const legal = chess.moves().length;
            const collector = Core.createMoveCandidateCollector(Math.min(multiPv, legal));
            eng.send(`setoption name MultiPV value ${multiPv}`);
            const ctx = { timeControlId: rec.tc, remainingMs: rec.sec * 1000, incMs: INC[rec.tc], elo: roc,
                phase: Core.phaseFromFen(fen), moveNumber: rec.move, clockTemperament: 1, forced: legal === 1,
                humanPaceMs: null, paceSamples: 0 };
            const budget = Core.gameSearchBudgetMs({ ...ctx, elapsedMs: 0 });
            let maxDepth = 0;
            const t0 = performance.now();
            const done = eng.until(s => s.startsWith('bestmove'), s => {
                if (!s.startsWith('info') || s.indexOf(' pv ') === -1) return;
                const pv = s.match(/multipv\s+(\d+).*?\spv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
                const dm = s.match(/\bdepth (\d+)/);
                if (dm) maxDepth = Math.max(maxDepth, +dm[1]);
                if (!pv) return;
                let score = 0;
                const cp = s.match(/score cp (-?\d+)/); if (cp) score = +cp[1];
                const mt = s.match(/score mate (-?\d+)/); if (mt) score = +mt[1] > 0 ? 10000 : -10000;
                collector.push({ multipv: +pv[1], move: pv[2], score, depth: dm ? +dm[1] : 0, bound: /\b(?:lowerbound|upperbound)\b/.test(s) });
            });
            eng.send(`position fen ${fen}`);
            eng.send(budget === null ? `go depth ${depth}` : `go depth ${depth} movetime ${budget}`);
            const best = (await done).match(/bestmove\s(\S+)/)[1];
            const ms = Math.round(performance.now() - t0);
            const chosen = chooseHumanLikeMove(collector.values(), chess, { engineBestMove: best, clock: ctx,
                nativeStrength: !!(eng.caps.skill || (eng.caps.limit && eng.caps.elo)) }) || { move: best };
            return { move: chosen.move || best, engineBest: best, depth, maxDepth, budget, ms, roc };
        }
        async function refScore(eng, fen, depth, uci) {
            let score = null;
            const done = eng.until(s => s.startsWith('bestmove'), s => {
                if (!s.startsWith('info') || s.indexOf(' score ') === -1 || /\b(?:lowerbound|upperbound)\b/.test(s)) return;
                const cp = s.match(/score cp (-?\d+)/); const mt = s.match(/score mate (-?\d+)/);
                if (cp) score = +cp[1]; else if (mt) score = +mt[1] > 0 ? 10000 : -10000;
            });
            eng.send(`position fen ${fen}`);
            eng.send(uci ? `go depth ${depth} searchmoves ${uci}` : `go depth ${depth}`);
            await done;
            return score;
        }
        window.__benchOne = async (slotIdx, rec) => {
            const slot = window.__bench.slots[slotIdx];
            const chess = new Chess();
            for (const san of rec.prefix) { if (!chess.move(san, { sloppy: true })) return { id: rec.id, error: 'prefix ' + san }; }
            const fen = chess.fen();
            const hm = chess.move(rec.human, { sloppy: true });
            if (!hm) return { id: rec.id, error: 'human ' + rec.human };
            chess.undo();
            const humanUci = hm.from + hm.to + (hm.promotion || '');
            const rival = await rivalMove(slot.rival, rec, chess);
            slot.ref.send('ucinewgame');
            const d = window.__bench.refDepth;
            const root = await refScore(slot.ref, fen, d, null);
            const human = await refScore(slot.ref, fen, d, humanUci);
            const riv = rival.move === humanUci ? human : await refScore(slot.ref, fen, d, rival.move);
            return { id: rec.id, tc: rec.tc, band: rec.band, elo: rec.elo, move: rec.move, sec: rec.sec, fen,
                humanUci, rivalUci: rival.move, engineBest: rival.engineBest, roc: rival.roc, depth: rival.depth,
                maxDepth: rival.maxDepth, budget: rival.budget, ms: rival.ms,
                root, human, rival: riv, lossLichess: rec.lossLichess, evalBefore: rec.evalBefore };
        };
    }, { slots: SLOTS, refDepth: REF_DEPTH });
    await page.evaluate(() => window.__benchInit);
    console.error('motors a punt');
    const out = fs.createWriteStream(OUT, { flags: 'a' });
    let next = 0, finished = 0;
    const t0 = Date.now();
    async function worker(slot) {
        while (next < todo.length) {
            const rec = todo[next++];
            const res = await page.evaluate(([s, r]) => window.__benchOne(s, r), [slot, rec]);
            out.write(JSON.stringify(res) + '\n');
            finished++;
            if (finished % 50 === 0) console.error(`${finished}/${todo.length} en ${Math.round((Date.now() - t0) / 1000)} s`);
        }
    }
    await Promise.all(Array.from({ length: SLOTS }, (_, i) => worker(i)));
    out.end();
    if (errors.length) console.error('Errors de pàgina:', errors.slice(0, 5));
    console.error(`FET: ${finished} en ${Math.round((Date.now() - t0) / 1000)} s`);
    await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
