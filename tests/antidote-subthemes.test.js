const fs = require('fs');
const path = require('path');
const Core = require('../core.js');

const NOW = Date.UTC(2026, 9, 31);
const game = (subthemes, categories = { missed_tactic: { n: 4, severity: 2.5 } }) => ({
    id: 'partida-1',
    playerColor: 'w',
    date: new Date(NOW).toISOString(),
    antidoteStats: {
        moves: 20, categories, subthemes,
        phases: { opening: 0, middlegame: 400, endgame: 0 },
        phaseMoves: { opening: 5, middlegame: 15, endgame: 0 }
    }
});
const sampleTest = (subtheme, result, extra = {}) => Object.assign({
    id: subtheme + result, theme: 'missed_tactic', subtheme, result,
    severity: .8, at: NOW
}, extra);

describe('perfil de motius específics del Rival Antídot', () => {
    test('el perfil buit conserva la compatibilitat i no inventa motius', () => {
        const p = Core.buildAntidoteProfile({ now: NOW });
        expect(p.version).toBe(1);
        expect(p.subthemes).toEqual({});
        expect(p.subthemeOccurrences).toBe(0);
        expect(Core.antidoteTopSubthemes(p, 5)).toEqual([]);
    });

    test('el resum lleuger de partides guarda forquilles i clavades independentment', () => {
        const p = Core.buildAntidoteProfile({
            games: [game({ fork: { n: 3, severity: 2.2 }, pin: { n: 1, severity: .7 } })],
            now: NOW
        });
        expect(p.weaknesses.missed_tactic.occurrences).toBe(4);
        expect(p.subthemes.fork.occurrences).toBe(3);
        expect(p.subthemes.pin.occurrences).toBe(1);
        expect(Core.antidoteTopSubthemes(p, 2).map(v => v.id)).toEqual(['fork', 'pin']);
        expect(p.subthemes.fork.confidence).toBeGreaterThan(p.subthemes.pin.confidence);
    });

    test('una partida antiga sense subtemes no es converteix automàticament en forquilles', () => {
        const p = Core.buildAntidoteProfile({
            games: [game(undefined)], now: NOW
        });
        expect(p.weaknesses.missed_tactic.occurrences).toBe(4);
        expect(Core.antidoteTopSubthemes(p)).toEqual([]);
        expect(p.subthemeOccurrences).toBe(0);
    });

    test('només motius coneguts, compatibles i atribuïbles a un error', () => {
        const p = Core.buildAntidoteProfile({
            games: [game({
                fork: { n: 2, severity: 1.4 },
                made_up: { n: 99, severity: 99 },
                king_attack: { n: 1, severity: .5 }
            })],
            savedErrors: [
                { severity: 'low', antidoteSubtheme: 'pin' },
                { severity: 'low', antidoteSubtheme: 'king_attack' },
                { severity: 'low', antidoteSubtheme: 'constructor' }
            ], now: NOW
        });
        expect(p.subthemes.made_up).toBeUndefined();
        expect(p.subthemes.constructor).toBe(Object.prototype.constructor);
        expect(p.subthemes.pin.occurrences).toBe(1);
        expect(p.subthemes.king_attack.occurrences).toBe(1);
    });

    test('una resposta fallada al primer intent pesa com a debilitat; repetir-la bé no esborra el primer intent', () => {
        const failed = Core.buildAntidoteProfile({
            tests: [sampleTest('fork', 'failed')], now: NOW
        });
        const retry = Core.buildAntidoteProfile({
            tests: [sampleTest('fork', 'passed', { firstResult: 'failed', retried: true })], now: NOW
        });
        expect(retry.subthemes.fork.occurrences).toBe(1);
        expect(retry.subthemes.fork.testsFailed).toBe(1);
        expect(retry.subthemes.fork.testsPassed).toBe(0);
        expect(retry.subthemes.fork.weight).toBeCloseTo(failed.subthemes.fork.weight, 9);
    });

    test('encerts verificats no creen una falsa debilitat i redueixen el seu pes', () => {
        const base = Core.buildAntidoteProfile({
            tests: [sampleTest('fork', 'failed', { id: 'err1' }),
                sampleTest('fork', 'failed', { id: 'err2' })], now: NOW
        });
        const improved = Core.buildAntidoteProfile({
            tests: [sampleTest('fork', 'failed', { id: 'err1' }),
                sampleTest('fork', 'failed', { id: 'err2' }),
                ...Array.from({ length: 7 }, (_, i) => sampleTest('fork', 'passed', { id: 'ok' + i }))],
            now: NOW
        });
        expect(improved.subthemes.fork.testsPassed).toBe(7);
        expect(improved.subthemes.fork.weight).toBeLessThan(base.subthemes.fork.weight);
        const allGood = Core.buildAntidoteProfile({ tests: [sampleTest('pin', 'passed')], now: NOW });
        expect(Core.antidoteTopSubthemes(allGood)).toEqual([]);
    });

    test('si hi ha evidència de forquilles, el rival prefereix una candidata igualment bona amb forquilla', () => {
        const generic = Core.buildAntidoteProfile({
            games: [game(undefined)], now: NOW
        });
        const detailed = Core.buildAntidoteProfile({
            games: [game({ fork: { n: 4, severity: 3.2 } })], now: NOW
        });
        const fork = { themes: [{ id: 'fork', strength: .9 }], complexity: .7 };
        const pin = { themes: [{ id: 'pin', strength: .9 }], complexity: .7 };
        expect(Core.antidoteWeaknessMatch(fork, generic).match)
            .toBeCloseTo(Core.antidoteWeaknessMatch(pin, generic).match, 10);
        expect(Core.antidoteWeaknessMatch(fork, detailed).match)
            .toBeGreaterThan(Core.antidoteWeaknessMatch(pin, detailed).match);
    });

    test('la categoria general continua activa sense cap subtema ni historial nou', () => {
        const legacy = Core.buildAntidoteProfile({
            savedErrors: [{ fen: 'r', severity: 'high' }], now: NOW
        });
        expect(legacy.weaknesses.lost_material.occurrences).toBe(1);
        expect(legacy.subthemeOccurrences).toBe(0);
    });

    test('el client mostra la llista concreta i conserva el filtratge de partides importades', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        expect(app).toContain('ElTaulerCore.antidoteTopSubthemes(profile, 4)');
        expect(app).toContain('historyEntryIsImported(e)');
        expect(app).toContain('antidoteSubtheme: t.subtheme || null');
        expect(app).toContain('t.firstResult || t.result');
        expect(app).toContain('classifyAntidoteErrorMotif(');
    });
});
