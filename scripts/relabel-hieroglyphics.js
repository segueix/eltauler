#!/usr/bin/env node
// Reetiqueta el tema dels jeroglífics del banc diari amb el classificador
// actual (core.js). No toca la línia ni la prova: només finalMotif i
// companyia. Ús: node scripts/relabel-hieroglyphics.js
const { Chess } = require('chess.js');
const Core = require('../core');
const H = require('../hieroclosure');
const { readReserve, writeReserve, sound } = require('./mine-hieroglyphics');

function relabel(item, classify) {
    if (!item || item.finalMotif === 'mate' || item.finalMotif === 'promotion') return false;
    const info = classify(item.fen, H.lineOf(item), { finalEval: typeof item.evalBefore === 'number' ? item.evalBefore : undefined });
    if (!info || info.motif === 'none' || info.confidence === 'low' || Core.HIERO_ALLOWED_FINAL_MOTIFS.indexOf(info.motif) === -1) return false;
    if (info.motif === item.finalMotif) return false;
    const label = Core.HIERO_FINAL_MOTIF_LABELS[info.motif] || null;
    Object.assign(item, {
        finalMotif: info.motif, finalMotifs: info.motifs, finalMotifLabel: label, finalMotifReason: info.reason,
        finalType: info.motif, theme: info.motif, tacticKind: label
    });
    return true;
}

if (require.main === module) {
    const classify = Core.createHieroglyphicMotifHelpers(Chess).classifyPuzzleFinalMotif;
    const reserve = readReserve();
    let changed = 0;
    reserve.forEach(it => { if (relabel(it, classify)) changed++; });
    if (!reserve.every(sound)) throw new Error('El reetiquetatge ha malmès alguna prova.');
    writeReserve(reserve);
    const counts = {};
    reserve.forEach(it => { counts[it.finalMotif] = (counts[it.finalMotif] || 0) + 1; });
    console.log(`Reetiquetats ${changed} de ${reserve.length}:`, counts);
}
module.exports = { relabel };
