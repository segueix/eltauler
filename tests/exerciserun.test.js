// Tongada d'exercicis: botó per fer-ne un altre i ratxa sense errar a
// Tàctiques, Repàs intel·ligent i Revisa errors.
const fs = require('fs');
const path = require('path');
const C = require('../core');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const fnBody = name => {
    const start = app.indexOf('function ' + name + '(');
    return app.slice(start, app.indexOf('\n}\n', start));
};

describe('ratxa de la tongada (core)', () => {
    test('compta els resolts i la ratxa seguida sense cap jugada errònia', () => {
        let run = C.exerciseRunStart('tactics');
        expect(run).toEqual({ section: 'tactics', solved: 0, streak: 0, best: 0 });
        run = C.exerciseRunSolved(run, true);
        run = C.exerciseRunSolved(run, true);
        expect(run).toEqual({ section: 'tactics', solved: 2, streak: 2, best: 2 });
        // Resolt després d'errar: compta com a resolt, però la ratxa torna a zero.
        run = C.exerciseRunSolved(run, false);
        expect(run).toEqual({ section: 'tactics', solved: 3, streak: 0, best: 2 });
        run = C.exerciseRunSolved(run, true);
        expect(run).toEqual({ section: 'tactics', solved: 4, streak: 1, best: 2 });
    });

    test('és pura i tolera una tongada buida', () => {
        const run = Object.freeze(C.exerciseRunStart('srs'));
        expect(() => C.exerciseRunSolved(run, true)).not.toThrow();
        expect(run.solved).toBe(0);
        expect(C.exerciseRunSolved(null, true)).toEqual({ section: null, solved: 1, streak: 1, best: 1 });
    });
});

describe('integració a l\'app', () => {
    test('cada secció comença una tongada nova en entrar-hi', () => {
        expect(app).toMatch(/\$\('#btn-tactics'\)\.click\(\(\) => \{[\s\S]{0,200}beginExerciseRun\('tactics'\)/);
        expect(fnBody('startSrsReview')).toMatch(/beginExerciseRun\('srs'\)/);
        expect(fnBody('showBundleMenu')).toMatch(/beginExerciseRun\('errors'\)/);
        expect(fnBody('startMatchErrorReview')).toMatch(/beginExerciseRun\('match'\)/);
        expect(fnBody('startHistoryErrorPractice')).toMatch(/beginExerciseRun\('match'\)/);
        // Sortir de la secció acaba la tongada.
        expect(fnBody('returnToMainMenuImmediate')).toMatch(/exerciseRun = null/);
    });

    test('una jugada errònia trenca la ratxa i cada exercici comença net', () => {
        const attempt = fnBody('evaluateBundleAttempt');
        expect((attempt.match(/exerciseRunClean = false/g) || []).length).toBe(2);
        expect(app).toMatch(/if \(isBundle\) exerciseRunClean = true;/);
        const success = fnBody('handleBundleSuccess');
        expect(success).toMatch(/ElTaulerCore\.exerciseRunSolved\(exerciseRun, exerciseRunClean\)/);
        // Les altres finestres (repte diari, jeroglífics, mats) no la mostren.
        expect(success.indexOf("$('.bundle-run-streak').remove()")).toBeLessThan(success.indexOf('if (isTacticsSession)'));
        const section = fnBody('exerciseRunSection');
        ['tactics', 'srs', 'match', 'errors'].forEach(s => expect(section).toContain("'" + s + "'"));
    });

    test('Tàctiques i Repàs intel·ligent tenen botó per fer-ne un altre, i totes mostren la ratxa', () => {
        const tactics = fnBody('showTacticsOverlay');
        expect(tactics).toMatch(/Una altra tàctica/);
        expect(tactics).toMatch(/startTacticsPuzzle\(\)/);
        const srs = fnBody('showSrsSuccessOverlay');
        expect(srs).toMatch(/Un altre repàs/);
        expect(srs).toMatch(/startNextSrsReview\(\)/);
        ['showTacticsOverlay', 'showSrsSuccessOverlay', 'showRandomBundleSuccessOverlay',
            'showCategoryBundleSuccessOverlay', 'showMatchErrorReviewOverlay']
            .forEach(name => expect(fnBody(name)).toMatch(/renderExerciseRunStreak\(overlay\)/));
    });

    test('el requadre té estil propi', () => {
        expect(html).toMatch(/\.bundle-run-streak \{/);
        expect(html).toMatch(/\.bundle-run-streak-value \{/);
    });
});
