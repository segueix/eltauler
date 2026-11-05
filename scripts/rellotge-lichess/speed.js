// Profunditat i nodes/s de stockfish.js (motor actual del rival) i Stockfish 19 lite
// amb els pressupostos de temps del rival, sobre posicions reals.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), CACHE = path.join(ROOT, '.cache', 'cdn');
const recs = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => JSON.parse(l))
    .filter(r => r.move >= 12 && r.move <= 30).filter((_, i) => i % 97 === 0).slice(0, 30);
(async () => {
    const server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        const t = { '.js': 'application/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.css': 'text/css', '.txt': 'text/plain' };
        res.writeHead(200, { 'Content-Type': t[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.route(/chess\.min\.js/, r => r.fulfill({ path: path.join(CACHE, 'chess.min.js'), contentType: 'application/javascript' }));
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/robots.txt`);
    await page.addScriptTag({ url: '/.cache/cdn/chess.min.js' }).catch(() => {});
    const res = await page.evaluate(async (recs) => {
        function eng(url) {
            const w = new Worker(url); const L = [];
            w.onmessage = e => L.slice().forEach(f => f(String(e.data)));
            const until = (pred, on) => new Promise(r => { const f = s => { if (on) on(s); if (pred(s)) { L.splice(L.indexOf(f), 1); r(s); } }; L.push(f); });
            return { send: c => w.postMessage(c), until };
        }
        async function ready(e) { const a = e.until(s => s === 'uciok'); e.send('uci'); await a; const b = e.until(s => s === 'readyok'); e.send('isready'); await b; }
        const engines = { 'stockfish.js': eng('/stockfish.js'), 'SF19 lite': eng('/stockfish-19-lite-single.js') };
        for (const e of Object.values(engines)) await ready(e);
        const fens = recs.map(r => { const c = new Chess(); r.prefix.forEach(s => c.move(s, { sloppy: true })); return c.fen(); });
        const out = {};
        for (const [name, e] of Object.entries(engines)) {
            for (const pv of [5, 16]) for (const ms of [150, 500, 1500]) {
                let dSum = 0, npsSum = 0;
                for (const fen of fens) {
                    let depth = 0, nps = 0; const counts = {};
                    e.send(`setoption name MultiPV value ${pv}`); e.send('ucinewgame');
                    const done = e.until(s => s.startsWith('bestmove'), s => {
                        const d = s.match(/^info depth (\d+).*?multipv (\d+)/); const n = s.match(/\bnps (\d+)/);
                        if (d) { counts[d[1]] = (counts[d[1]] || 0) + 1; if (counts[d[1]] >= Math.min(pv, 3)) depth = Math.max(depth, +d[1]); }
                        if (n) nps = +n[1];
                    });
                    e.send(`position fen ${fen}`); e.send(`go movetime ${ms}`); await done;
                    dSum += depth; npsSum += nps;
                }
                out[`${name} | MultiPV ${pv} | ${ms} ms`] = { depth: +(dSum / fens.length).toFixed(1), knps: Math.round(npsSum / fens.length / 1000) };
            }
        }
        return out;
    }, recs);
    for (const [k, v] of Object.entries(res)) console.log(k.padEnd(36), 'profunditat', String(v.depth).padStart(4), '  knps', v.knps);
    await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
