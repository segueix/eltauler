#!/usr/bin/env node
// ============================================================================
// scripts/engine-uci-options.js — què declara DE DEBÒ el motor de l'app
// ============================================================================
// Carrega el MATEIX stockfish.js que fa servir el navegador, li envia `uci` i
// imprimeix les línies `id`/`option` en JSON, juntament amb les capacitats que
// Stockfish TV en dedueix (rang de UCI_Elo i mínim de la TV, o el mode de
// compatibilitat si el motor no exposa UCI_Elo / UCI_LimitStrength).
//
// Ús:  node scripts/engine-uci-options.js
// ============================================================================
const path = require('path');

const ROOT = path.join(__dirname, '..');
const lines = [];
let finished = false;

function finish(code) {
    if (finished) return;
    finished = true;
    const TV = require(path.join(ROOT, 'stockfishtv.js'));
    const caps = TV.tvEngineCapabilities(TV.parseUciOptions(lines));
    process.stdout.write(JSON.stringify({
        lines: lines.filter(l => l.indexOf('id ') === 0 || l.indexOf('option ') === 0 || l === 'uciok'),
        capabilities: caps,
        note: TV.tvCompatibilityNote(caps)
    }, null, 2) + '\n');
    process.exit(code);
}

// stockfish.js és un worker: a Node n'hi ha prou d'oferir postMessage.
global.postMessage = (m) => {
    const line = String(m).trim();
    lines.push(line);
    if (line === 'uciok') finish(0);
};
require(path.join(ROOT, 'stockfish.js'));
setTimeout(() => global.onmessage({ data: 'uci' }), 50);
setTimeout(() => finish(1), 20000);
