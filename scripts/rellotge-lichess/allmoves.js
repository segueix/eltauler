// Puntuació de TOTES les jugades legals (MultiPV = nombre de jugades) amb Stockfish 19, a profunditat fixa.
// Ús (des de l'arrel del repo, amb els CDN a .cache/cdn):
//   node scripts/rellotge-lichess/allmoves.js sample.jsonl all10.jsonl 10 [límit] [workers]
// Puntuació de mat: ±(10000 − n). Cada línia: id, fen, jugada humana i [jugada, cp] de totes les legals.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..', '..'), CACHE = path.join(ROOT, '.cache', 'cdn');
const [SAMPLE, OUT, DEPTH, LIMIT, WORKERS] = process.argv.slice(2);
const all = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').map((l, i) => ({ ...JSON.parse(l), id: null, idx: i }));
for (const r of all) r.id = `${r.tc}|${r.band}|${r.idx}`;
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
let todo = all.filter(r => !done.has(r.id));
if (LIMIT) todo = todo.slice(0, +LIMIT);
console.error(todo.length, 'posicions per fer');
(async () => {
    const server = http.createServer((req, res) => {
        const u = req.url.split('?')[0];
        if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script src="/chess.min.js"></script>'); }
        const file = u === '/chess.min.js' ? path.join(CACHE, 'chess.min.js') : path.join(ROOT, u);
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': u.endsWith('.wasm') ? 'application/wasm' : 'application/javascript' }); fs.createReadStream(file).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async (n) => {
        function eng() {
            const w = new Worker('/stockfish-19-lite-single.js'); const L = [];
            w.onmessage = e => L.slice().forEach(f => f(String(e.data)));
            const until = (p, on) => new Promise(r => { const f = s => { if (on) on(s); if (p(s)) { L.splice(L.indexOf(f), 1); r(s); } }; L.push(f); });
            return { send: c => w.postMessage(c), until };
        }
        window.__eng = [];
        for (let i = 0; i < n; i++) { const e = eng(); const a = e.until(s => s === 'uciok'); e.send('uci'); await a; window.__eng.push(e); }
        window.__one = async (k, rec, depth) => {
            const e = window.__eng[k];
            const c = new Chess();
            for (const san of rec.prefix) if (!c.move(san, { sloppy: true })) return { id: rec.id, error: 'prefix' };
            const fen = c.fen();
            const legal = c.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
            const hm = c.move(rec.human, { sloppy: true });
            if (!hm) return { id: rec.id, error: 'human' };
            c.undo();
            const frames = {};
            e.send('ucinewgame'); e.send(`setoption name MultiPV value ${legal.length}`);
            const t0 = performance.now();
            const done = e.until(s => s.startsWith('bestmove'), s => {
                if (!s.startsWith('info') || s.indexOf(' pv ') === -1 || / (lower|upper)bound/.test(s)) return;
                const d = s.match(/\bdepth (\d+)/), pv = s.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                const cp = s.match(/score cp (-?\d+)/), mt = s.match(/score mate (-?\d+)/);
                if (!d || !pv) return;
                const score = cp ? +cp[1] : (+mt[1] > 0 ? 10000 - +mt[1] : -10000 - +mt[1]);
                (frames[d[1]] = frames[d[1]] || {})[pv[1]] = score;
            });
            e.send(`position fen ${fen}`); e.send(`go depth ${depth}`);
            await done;
            // la profunditat més alta amb TOTES les jugades
            const full = Object.keys(frames).map(Number).sort((a, b) => b - a).find(d => Object.keys(frames[d]).length >= legal.length);
            const sc = full ? frames[full] : null;
            return { id: rec.id, tc: rec.tc, band: rec.band, elo: rec.elo, oppElo: rec.oppElo, move: rec.move, sec: rec.sec,
                fen, human: hm.from + hm.to + (hm.promotion || ''), depth: full || null, ms: Math.round(performance.now() - t0),
                scores: sc ? legal.map(m => [m, sc[m] ?? null]) : null };
        };
    }, +(WORKERS || 4));
    const out = fs.createWriteStream(OUT, { flags: 'a' });
    let next = 0, fin = 0; const t0 = Date.now();
    await Promise.all(Array.from({ length: +(WORKERS || 4) }, async (_, k) => {
        while (next < todo.length) {
            const rec = todo[next++];
            const r = await page.evaluate(([k, rec, d]) => window.__one(k, rec, d), [k, rec, +DEPTH]);
            out.write(JSON.stringify(r) + '\n');
            if (++fin % 500 === 0) console.error(`${fin}/${todo.length} en ${Math.round((Date.now() - t0) / 1000)} s`);
        }
    }));
    out.end();
    console.error(`FET ${fin} en ${Math.round((Date.now() - t0) / 1000)} s`);
    await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
