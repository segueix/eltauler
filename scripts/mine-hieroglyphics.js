#!/usr/bin/env node
// ============================================================================
// scripts/mine-hieroglyphics.js — reserva de jeroglífics minats per autojoc
// ============================================================================
// Executa a Chromium (Playwright) EL MATEIX generador de l'app: l'autojoc de
// Stockfish 19 (hgGenerateFromSelfPlaySeed) i la mateixa verificació estricta
// (tres jugades úniques, rèpliques òptimes i final concloent a profunditat 16).
// Els jeroglífics que surten s'afegeixen a jeroglifics-reserva.js, que l'app fa
// servir com a banc acumulat de jeroglífics nous: així sempre n'hi ha un a punt a
// l'instant, sense dependre de les partides de l'usuari ni de la potència del mòbil.
//
// Ús: node scripts/mine-hieroglyphics.js --add 3 --minutes 28 --pages 3 --max 1000
// --add: jeroglífics NOUS per execució; --max: capacitat de la reserva pública.
// Les novetats entren al davant i s'hi van acumulant (a l'app, tots els que
// l'usuari encara no ha jugat compten com a nous); només els més antics es
// retiren en superar --max (uns mesos de jeroglífics diaris).
// Requisits: Playwright amb Chromium. Els fitxers de CDN (jQuery, chess.js,
// chessboard.js) es baixen una vegada a .cache/cdn amb el fetch de Node (en un
// entorn amb proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=...).
// ============================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Chess } = require('chess.js');
const H = require('../hieroclosure');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'jeroglifics-reserva.js');
const CACHE = path.join(ROOT, '.cache', 'cdn');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i + 1]) : def; };
const MINUTES = opt('minutes', 28), PAGES = opt('pages', 3);
const ADD = opt('add', 3), MAX = opt('max', 1000);
if (!Number.isInteger(ADD) || ADD < 1 || ADD > 12 ||
    !Number.isInteger(MAX) || MAX < ADD ||
    !Number.isInteger(PAGES) || PAGES < 1 || PAGES > 8 ||
    !Number.isFinite(MINUTES) || MINUTES <= 0 || MINUTES > 120) {
    throw new Error('Paràmetres invàlids: --add 1..12, --max >= add, --pages 1..8, --minutes 0..120.');
}
const CDN = {
    'jquery-3.6.0.min.js': 'https://code.jquery.com/jquery-3.6.0.min.js',
    'chess.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
    'chessboard-1.0.0.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/chessboard-js/1.0.0/chessboard-1.0.0.min.js'
};
const BEGIN = '// >>> RESERVA (generat) >>>';
const END = '// <<< RESERVA <<<';

function readReserve() {
    if (!fs.existsSync(OUT)) return [];
    const src = fs.readFileSync(OUT, 'utf8');
    const a = src.indexOf(BEGIN), b = src.indexOf(END);
    if (a < 0 || b < 0) return [];
    return JSON.parse(src.slice(a + BEGIN.length, b).trim().replace(/;$/, '').replace(/^const RESERVE = /, ''));
}
function writeReserve(list) {
    const body = 'const RESERVE = ' + JSON.stringify(list, null, 1) + ';';
    const src = `// Reserva de jeroglífics minats per autojoc de Stockfish 19 i verificats amb
// la mateixa prova que el generador de l'app (hieroclosure.js). L'app la fa
// servir com a banc acumulat de nous. No s'edita a mà: es regenera amb
// \`node scripts/mine-hieroglyphics.js\`.
(function (root) {
    'use strict';
${BEGIN}
${body}
${END}
    if (typeof module !== 'undefined' && module.exports) module.exports = RESERVE;
    else root.ElTaulerHieroReserve = RESERVE;
})(typeof self !== 'undefined' ? self : this);
`;
    fs.writeFileSync(OUT, src);
}
function reserveFenKey(fen) {
    return typeof fen === 'string' ? fen.split(' ').slice(0, 4).join(' ') : '';
}
// Inserció atòmica: posició única, verificació obligatòria i rotació limitada.
// Les posicions més noves van al davant perquè tothom pugui jugar les del dia.
function addToPublicReserve(previous, item, capacity, publishedAt) {
    if (!item || !item.fen || !sound(item)) return null;
    const key = reserveFenKey(item.fen);
    if (!key || previous.some(x => reserveFenKey(x.fen) === key)) return null;
    const id = 'hgr_' + key.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    const normalized = Object.assign({}, item, {
        id, deviceCreated: null, createdAt: 0, updatedAt: 0,
        startedAt: null, solvedAt: null, attempts: 0, status: 'new',
        source: 'reserve', publishedAt
    });
    return [normalized].concat(previous).slice(0, capacity);
}

// Comprovació independent del navegador: línia legal i prova vàlida.
function sound(item) {
    try {
        if (!H.matches(item)) return false;
        const g = new Chess(item.fen);
        return H.lineOf(item).every(u => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
    } catch (e) { return false; }
}

async function ensureCdn() {
    fs.mkdirSync(CACHE, { recursive: true });
    for (const [name, url] of Object.entries(CDN)) {
        const file = path.join(CACHE, name);
        if (fs.existsSync(file)) continue;
        const res = await fetch(url);
        if (!res.ok) throw new Error('No s\'ha pogut baixar ' + url);
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
}
function serve() {
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
    const { chromium } = require('playwright');
    await ensureCdn();
    const server = await serve();
    const base = 'http://127.0.0.1:' + server.address().port;
    let reserve = readReserve().filter(sound).slice(0, MAX);
    const known = new Set(reserve.map(x => reserveFenKey(x.fen)));
    let added = 0;
    const deadline = Date.now() + MINUTES * 60000;
    const launch = { args: [] };
    if (fs.existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(launch);
    console.log(`Reserva actual: ${reserve.length}. Objectiu: +${ADD}; màxim ${MINUTES} min amb ${PAGES} pàgines…`);
    const worker = async (n) => {
        const ctx = await browser.newContext({ serviceWorkers: 'block' });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        for (const name of Object.keys(CDN)) {
            await ctx.route(new RegExp(name.replace(/\./g, '\\.')), r => r.fulfill({ path: path.join(CACHE, name), contentType: 'application/javascript' }));
        }
        await ctx.addInitScript(() => {
            localStorage.setItem('eltauler_cloud_consent', '1');
            localStorage.setItem('chess_calibratgeComplet', 'true');
            // Sense generació en segon pla: aquesta pàgina només mina.
            localStorage.setItem('eltauler_hieroglyphics_state', JSON.stringify({ settings: { backgroundGeneration: false } }));
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        });
        const page = await ctx.newPage();
        await page.goto(base + '/index.html');
        await page.waitForFunction(() => typeof hgGenerateFromSelfPlaySeed === 'function', null, { timeout: 60000 });
        while (Date.now() < deadline && added < ADD) {
            const item = await page.evaluate(async (knownList) => {
                const exclude = new Set(knownList);
                const cand = await hgGenerateFromSelfPlaySeed(() => false, exclude, {});
                if (!cand) return null;
                const it = hgToQueueItem(cand, 'reserve');
                return it;
            }, Array.from(known));
            if (!item) continue;
            const key = reserveFenKey(item.fen);
            if (known.has(key) || added >= ADD) continue;
            const next = addToPublicReserve(reserve, item, MAX, Date.now());
            if (!next) continue;
            known.add(key);
            reserve = next;
            added++;
            writeReserve(reserve);
            console.log(`[pàgina ${n}] +${added}/${ADD}: ${item.finalMotif} · ${item.sanLine.join(' ')} · ${item.fen}`);
        }
        await ctx.close();
    };
    await Promise.all(Array.from({ length: PAGES }, (_, i) => worker(i + 1)));
    await browser.close();
    server.close();
    writeReserve(reserve);
    console.log(`Fet: +${added}/${ADD} nous, ${reserve.length} disponibles a ${path.relative(ROOT, OUT)}.`);
    if (added < ADD) console.warn(`AVÍS: només ${added} de ${ADD}; mai no publiquem problemes sense verificar.`);
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
            `### Reserva pública de jeroglífics\nNous verificats: **${added}/${ADD}**. Reserva: **${reserve.length}**.\n`);
    }
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
module.exports = { readReserve, sound, reserveFenKey, addToPublicReserve };
