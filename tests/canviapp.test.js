// Pas a Remigi lliscant el dit pel mig de la portada (canviapp.js): la lògica de decisió és pura i es prova aquí; el
// gest real amb el dit es verifica al navegador (vegeu TESTS.md).
const fs = require('fs');
const path = require('path');
const CanviApp = require('../canviapp');

const W = 390; // un mòbil
const H = 844;

describe('pas a Remigi: zona on ha de començar el gest', () => {
    test('el mig de la pantalla sí', () => {
        expect(CanviApp.startAllowed({ x: W / 2, y: H / 2, width: W, height: H })).toBe(true);
    });

    test('les vores no (hi ha el gest d\'enrere del sistema)', () => {
        expect(CanviApp.startAllowed({ x: 10, y: H / 2, width: W, height: H })).toBe(false);
        expect(CanviApp.startAllowed({ x: W - 10, y: H / 2, width: W, height: H })).toBe(false);
    });

    test('ni la capçalera ni la part de baix', () => {
        expect(CanviApp.startAllowed({ x: W / 2, y: 40, width: W, height: H })).toBe(false);
        expect(CanviApp.startAllowed({ x: W / 2, y: H - 30, width: W, height: H })).toBe(false);
    });

    test('sense mides de pantalla no s\'activa', () => {
        expect(CanviApp.startAllowed({ x: 0, y: 0, width: 0, height: 0 })).toBe(false);
    });
});

describe('pas a Remigi: direcció i llindar', () => {
    test('fins als 12 px encara no es decideix', () => {
        expect(CanviApp.lockAxis(8, 3)).toBe('');
    });

    test('horitzontal només si és clarament de costat', () => {
        expect(CanviApp.lockAxis(30, 5)).toBe('h');
        expect(CanviApp.lockAxis(-30, 5)).toBe('h');
        expect(CanviApp.lockAxis(20, 15)).toBe('v');
        expect(CanviApp.lockAxis(3, 40)).toBe('v');
    });

    test('cal arrossegar el 35 % de l\'ample, com a mínim 110 px', () => {
        expect(CanviApp.commitDistance(W)).toBeCloseTo(W * 0.35);
        expect(CanviApp.commitDistance(200)).toBe(110);
        expect(CanviApp.shouldCommit({ dx: -W * 0.3, dy: 0, width: W })).toBe(false);
        expect(CanviApp.shouldCommit({ dx: -W * 0.4, dy: 10, width: W })).toBe(true);
        expect(CanviApp.shouldCommit({ dx: W * 0.4, dy: 10, width: W })).toBe(true);
        // Massa en diagonal: no
        expect(CanviApp.shouldCommit({ dx: W * 0.4, dy: W * 0.3, width: W })).toBe(false);
    });

    test('el panell entra proporcionalment al dit i s\'atura a 1', () => {
        expect(CanviApp.progress(0, W)).toBe(0);
        expect(CanviApp.progress(-CanviApp.commitDistance(W) / 2, W)).toBeCloseTo(0.5);
        expect(CanviApp.progress(1000, W)).toBe(1);
    });

    test('va a Remigi, al mateix domini', () => {
        expect(CanviApp.TARGET_URL).toBe('/remigi/');
        expect(CanviApp.TARGET_NAME).toBe('Remigi');
    });
});

describe('pas a Remigi: avís de les primeres vegades', () => {
    test('surt tres vegades i prou', () => {
        expect(CanviApp.HINT_TIMES).toBe(3);
        expect(CanviApp.shouldShowHint(0)).toBe(true);
        expect(CanviApp.shouldShowHint(2)).toBe(true);
        expect(CanviApp.shouldShowHint(3)).toBe(false);
        expect(CanviApp.shouldShowHint('x')).toBe(true);
    });

    test('la clau no topa amb la de Remigi (comparteixen domini i localStorage)', () => {
        expect(CanviApp.HINT_KEY).toMatch(/^eltauler_/);
    });
});

describe('pas a Remigi: càrrega a la pàgina', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    test('index.html carrega el full d\'estils i l\'script, després d\'app.js', () => {
        expect(html).toMatch(/<link rel="stylesheet" href="canviapp\.css\?v=[\d.]+">/);
        const script = html.search(/<script src="canviapp\.js\?v=[\d.]+"><\/script>/);
        expect(script).toBeGreaterThan(html.indexOf('<script src="app.js'));
    });

    test('sense document no fa res (Node, proves)', () => {
        expect(CanviApp.start({})).toBeNull();
    });

    test('s\'arrenca un sol cop i escolta el dit sense bloquejar el desplaçament', () => {
        const listeners = [];
        const doc = {
            readyState: 'complete',
            documentElement: { dataset: {} },
            addEventListener: (name, cb, options) => listeners.push({ name, options }),
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
        };
        const win = {
            document: doc,
            addEventListener: () => {},
            matchMedia: () => ({ matches: false }), // ordinador: no hi ha avís
        };
        expect(CanviApp.start(win)).not.toBeNull();
        expect(CanviApp.start(win)).toBeNull();
        const touch = listeners.filter((l) => l.name.startsWith('touch'));
        expect(touch.map((l) => l.name).sort()).toEqual(['touchcancel', 'touchend', 'touchmove', 'touchstart']);
        expect(touch.every((l) => l.options && l.options.passive === true)).toBe(true);
    });
});
