const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Dades grans que no es carreguen amb la pàgina: la base d'obertures
// (obertures.js) i la reserva de jeroglífics (jeroglifics-reserva.js) arriben
// quan el navegador queda lliure (app.js: loadDeferredData). Les funcions que
// les necessiten de seguida les esperen o les demanen.
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

describe('càrrega diferida de dades', () => {
    test('la pàgina ja no inclou els dos fitxers de dades', () => {
        expect(html).not.toMatch(/<script src="obertures\.js/);
        expect(html).not.toMatch(/<script src="jeroglifics-reserva\.js/);
    });
    test('app.js els carrega quan el navegador queda lliure', () => {
        expect(app).toMatch(/openings: \{ src: 'obertures\.js\?v=[\d.]+'/);
        expect(app).toMatch(/hieroReserve: \{ src: 'jeroglifics-reserva\.js\?v=[\d.]+'/);
        expect(app).toMatch(/requestIdleCallback\(go, \{ timeout: 2500 \}\)/);
        const ready = app.slice(app.indexOf('$(document).ready(() => {'), app.indexOf('$(document).ready(() => {') + 600);
        expect(ready).toContain('scheduleDeferredData();');
    });
    test('qui les necessita de seguida les espera o les demana', () => {
        const play = app.slice(app.indexOf('async function hgPlayNext('), app.indexOf('async function hgPlayNext(') + 300);
        expect(play).toContain("await loadDeferredData('hieroReserve');");
        const branch = app.slice(app.indexOf('function getOpeningBranchIndex() {'), app.indexOf('function getOpeningBranchIndex() {') + 500);
        // Sense dades, l'índex no es dona per fet: es tornarà a provar.
        expect(branch.indexOf("typeof OPENINGS_DATA === 'undefined'")).toBeLessThan(branch.indexOf('openingBranchIndexBuilt = true'));
        expect(app).toMatch(/loadDeferredData\('openings'\)\.then\(\(\) => startOpeningTheoryHieroglyphic\(\)\)/);
    });
    test('els fitxers existeixen amb la variable que l’app comprova', () => {
        expect(fs.readFileSync(path.join(__dirname, '../obertures.js'), 'utf8')).toMatch(/const OPENINGS_DATA = \[/);
        expect(fs.readFileSync(path.join(__dirname, '../jeroglifics-reserva.js'), 'utf8')).toMatch(/root\.ElTaulerHieroReserve = RESERVE/);
    });
});
