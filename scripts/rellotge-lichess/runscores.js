// Desa les puntuacions de la CERCA REAL del rival amb el model de tria humana (§17), sense triar: Stockfish 19 a força
// màxima puntua totes les jugades a la profunditat del model, amb el pressupost de cerca del rellotge
// que tenia la persona, com a makeEngineMove. Després: build_runtime.js i calib_runtime.py.
// Ús (des de l'arrel del repo, amb els CDN a .cache/cdn):
//   node scripts/rellotge-lichess/runscores.js sample.jsonl ids.txt runscores.jsonl [slots]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..', '..'), CACHE = path.join(ROOT, '.cache', 'cdn');
const [SAMPLE, IDS, OUT, SLOTS_ARG] = process.argv.slice(2);
const SLOTS = +(SLOTS_ARG || 3);
const ids = new Set(fs.readFileSync(IDS, 'utf8').trim().split('\n'));
const all = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
const todo = [];
all.forEach((r, i) => { r.id = `${r.tc}|${r.band}|${i}`; if (ids.has(r.id) && !done.has(r.id)) todo.push(r); });
console.error(todo.length, 'posicions per fer');

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
    await page.evaluate(async (slots) => {
        const Core = ElTaulerCore;
        const INC = { '30s': 0, '1+0': 0, '3+2': 2000, '5+0': 0, '10+0': 0, '15+10': 10000 };
        async function initEngine() {
            const w = new Worker('stockfish-19-lite-single.js');
            const eng = { listeners: [], caps: {} };
            w.onmessage = e => { const s = String(e.data); eng.listeners.slice().forEach(f => f(s)); };
            eng.send = c => w.postMessage(c);
            eng.until = (pred, onLine) => new Promise(res => {
                const f = s => { if (onLine) onLine(s); if (pred(s)) { eng.listeners.splice(eng.listeners.indexOf(f), 1); res(s); } };
                eng.listeners.push(f);
            });
            const ok = eng.until(s => s === 'uciok', s => { if (s.startsWith('option')) eng.caps = Core.engineStrengthOption(eng.caps, s); });
            eng.send('uci'); await ok;
            const rd = eng.until(s => s === 'readyok'); eng.send('isready'); await rd;
            return eng;
        }
        window.__slots = [];
        for (let i = 0; i < slots; i++) window.__slots.push(await initEngine());
        window.__one = async (k, rec) => {
            const eng = window.__slots[k];
            const chess = new Chess();
            for (const san of rec.prefix) if (!chess.move(san, { sloppy: true })) return { id: rec.id, error: 'prefix' };
            const fen = chess.fen();
            const roc = Math.max(ELO_MIN, Math.min(ELO_MAX, rec.elo));
            const humanElo = Core.humanChoiceEloForRoc(roc);
            if (humanElo === null) return { id: rec.id, skipped: 'roc', roc };
            const legal = chess.moves().length;
            const ctx = { timeControlId: rec.tc, remainingMs: rec.sec * 1000, incMs: INC[rec.tc], elo: roc,
                phase: Core.phaseFromFen(fen), moveNumber: rec.move, clockTemperament: 1, forced: legal === 1,
                humanPaceMs: null, paceSamples: 0 };
            const budget = Core.gameSearchBudgetMs({ ...ctx, elapsedMs: 0 });
            Core.nativeStrengthCommands(eng.caps, ELO_MAX, true).forEach(c => eng.send(c));
            const collector = Core.createMoveCandidateCollector(legal);
            eng.send(`setoption name MultiPV value ${legal}`);
            const t0 = performance.now();
            const done = eng.until(s => s.startsWith('bestmove'), s => {
                if (!s.startsWith('info') || s.indexOf(' pv ') === -1) return;
                const pv = s.match(/multipv\s+(\d+).*?\spv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
                const dm = s.match(/\bdepth (\d+)/);
                if (!pv) return;
                let score = 0;
                const cp = s.match(/score cp (-?\d+)/); if (cp) score = +cp[1];
                const mt = s.match(/score mate (-?\d+)/); if (mt) score = +mt[1] > 0 ? 10000 : -10000;
                collector.push({ multipv: +pv[1], move: pv[2], score, depth: dm ? +dm[1] : 0, bound: /\b(?:lowerbound|upperbound)\b/.test(s) });
            });
            eng.send(`position fen ${fen}`);
            eng.send(budget === null ? `go depth ${Core.HUMAN_CHOICE_DEPTH}` : `go depth ${Core.HUMAN_CHOICE_DEPTH} movetime ${budget}`);
            const best = (await done).match(/bestmove\s(\S+)/)[1];
            const searchMs = Math.round(performance.now() - t0);
            const cands = collector.values();
            return { id: rec.id, tc: rec.tc, band: rec.band, elo: rec.elo, roc, humanElo, best, legal,
                depthUsed: cands.length ? cands[0].depth : 0, budget, searchMs, scores: cands.map(c => [c.move, c.score]) };
        };
    }, SLOTS);
    console.error('motors a punt');
    const out = fs.createWriteStream(OUT, { flags: 'a' });
    let next = 0, fin = 0; const t0 = Date.now();
    await Promise.all(Array.from({ length: SLOTS }, async (_, k) => {
        while (next < todo.length) {
            const rec = todo[next++];
            const r = await page.evaluate(([k, rec]) => window.__one(k, rec), [k, rec]);
            out.write(JSON.stringify(r) + '\n');
            if (++fin % 200 === 0) console.error(`${fin}/${todo.length} en ${Math.round((Date.now() - t0) / 1000)} s`);
        }
    }));
    out.end();
    if (errors.length) console.error('Errors de pàgina:', errors.slice(0, 5));
    console.error(`FET ${fin} en ${Math.round((Date.now() - t0) / 1000)} s`);
    await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
